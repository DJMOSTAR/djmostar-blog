// One article attempt: write, run the code checks, then the editor review.
// generate.yml has five attempt steps. A paused run continues with the next attempt number.
//   Attempt 1: new article. Attempt 2: the same article, fixing only the failed checks.
//   Attempt 3: a completely new article on the same topic. Attempts 4 and 5: the next unused topic.
// Usage: node scripts/article-pass.js start|check|finish <step number 1-5>
const fs = require("node:fs");
const { loadConfig, work, readJson, writeJson, setOutputs, fromRoot } = require("./lib/config");
const { load, knownPosts, publishedPosts, usedImageIds } = require("./lib/data");
const { pickTopic } = require("./lib/calendar");
const { prepareTopic } = require("./lib/topic-prep");
const { checkArticle, checkOriginality, checkLiveLinks, audienceFor, findCategory, fixInquiryLinks, fixImageMarkers } = require("./lib/rules");

const [step, positionArg] = process.argv.slice(2);
const position = Number(positionArg);
const config = loadConfig();
const { content, site, rules, facts } = config;
const limits = config.schedule.retries;

const addressText = (audience) => (audience === "sie" ? 'formell mit "Sie" und "Ihr" (großgeschrieben), nie "ihr" oder "euch"' : 'informell mit "ihr" und "euch", nie "Sie"');
const fill = (template, values) => template.replace(/\{\{(\w+)\}\}/g, (_, key) => (values[key] === undefined ? "" : String(values[key])));
// The last recorded failure of a Claude step in this run.
function aiFailure(stepName) {
  const log = readJson(work("ai-log.json"), []);
  return [...log].reverse().find((entry) => entry.step === stepName) || { kind: "other", message: "Claude-Schritt ohne Ergebnis" };
}

function imageList(images, chosen) {
  return Object.values(images)
    .filter((image) => !chosen || chosen.includes(image.id))
    .map((image) => `- id \`${image.id}\`: Datei \`${image.file}\`, ${image.width}x${image.height}${image.description ? `, Beschreibung der Quelle: ${image.description}` : ""}`)
    .join("\n");
}

function buildWriterPrompt(run, images, state) {
  const topic = run.topic;
  const category = findCategory(content, topic.category);
  const audience = topic.audience || category.audience;
  const inquiryUrl = site.inquiry[topic.inquiry || category.inquiry];
  const related = publishedPosts();
  const earlier = [...new Set([...(state.history || []), ...(state.feedback || [])])];
  let feedback = "";
  if (state.current.mode === "revise") {
    feedback = [
      "## Überarbeitung des vorherigen Entwurfs",
      "",
      "Schreibe den Artikel nicht neu. Lies den Entwurf in `.work/previous-draft.json` und ändere nur die Punkte unten. Alles andere bleibt, wie es ist. Gib den vollständigen Artikel in allen Feldern zurück.",
      "",
      "Die Links zur Anfrageseite und zur Startseite und 1 bis 2 externe Links bleiben in jedem Fall erhalten.",
      "",
      "Diese Prüfungen sind fehlgeschlagen und müssen behoben werden:",
      ...state.feedback.map((entry) => `- ${entry}`),
      ...(state.history && state.history.length ? ["", "Diese früheren Probleme dürfen nicht wieder auftreten:", ...state.history.map((entry) => `- ${entry}`)] : []),
    ].join("\n");
  } else if (earlier.length) {
    feedback = [
      "## Frühere Versuche",
      "",
      "Schreibe einen komplett neuen Artikel. Frühere Versuche sind an diesen Prüfungen gescheitert. Achte besonders darauf, dass diese Probleme nicht auftreten:",
      ...earlier.slice(-15).map((entry) => `- ${entry}`),
    ].join("\n");
  }
  return fill(fs.readFileSync(fromRoot("prompts/writer.md"), "utf8"), {
    title: topic.title,
    angle: topic.angle || "Finde einen konkreten Blickwinkel, der Lesern etwas Neues und direkt Nützliches gibt.",
    targetKeywords: ((content.target_keywords || {})[topic.category] || []).join(", "),
    category: category.name,
    categorySlug: category.slug,
    addressRule: addressText(audience),
    priceSentence: audience === "sie" ? "Sie erhalten ein individuelles Angebot, abgestimmt auf Ihre Feier und den benötigten Leistungsumfang." : "Ihr erhaltet ein individuelles Angebot, abgestimmt auf eure Feier und den benötigten Leistungsumfang.",
    musicRule: (rules.music_styles && rules.music_styles.allowed_categories.includes(category.slug))
      ? "Die Liste der internationalen Musikrichtungen darfst du nennen, aber nur in einem einzigen Satz."
      : "Nenne keine Liste internationaler Musikrichtungen. Sie gehört nur in Artikel über Musik.",
    today: new Date().toISOString().slice(0, 10),
    facts,
    forbidden: rules.forbidden_phrases.map((phrase) => `- ${phrase}`).join("\n"),
    minWords: content.article.min_words,
    maxWords: content.article.max_words,
    targetWords: Math.round(content.article.min_words + (content.article.max_words - content.article.min_words) * 0.6),
    faqMin: content.article.faq_min,
    faqMax: content.article.faq_max,
    secondaryMin: content.article.secondary_keywords_min,
    secondaryMax: content.article.secondary_keywords_max,
    suggestions: (run.suggestions || []).map((entry) => `- ${entry}`).join("\n") || "- keine verfügbar",
    seeds: (topic.seeds || []).join(", "),
    seoMax: content.article.seo_title_max,
    descMin: content.article.description_min,
    descMax: content.article.description_max,
    tags: content.tags.join(", "),
    inquiryUrl,
    homeUrl: site.main_site.endsWith("/") ? site.main_site : `${site.main_site}/`,
    relatedRule: related.length ? "1 bis 3 passende Beiträge, nur diese URLs:" : "es gibt noch keine, also keine Blog-Links setzen.",
    relatedPosts: related.slice(-15).map((post) => `  - ${post.title}: ${site.url}/${post.slug}/`).join("\n"),
    externalSources: content.external_sources.map((source) => `  - ${source.url} (${source.use})`).join("\n"),
    imageList: imageList(images),
    inlineMin: content.article.inline_images_min,
    inlineMax: content.article.inline_images_max,
    feedback,
  });
}

function buildEditorPrompt(article, images) {
  return fill(fs.readFileSync(fromRoot("prompts/editor.md"), "utf8"), {
    articleFile: ".work/candidate.json",
    imageList: imageList(images, [article.featured && article.featured.id, ...(article.inlineImages || []).map((image) => image.id)]),
    facts,
    forbidden: rules.forbidden_phrases.join(", "),
    addressRule: addressText(audienceFor(article, content)),
    priceSentence: audienceFor(article, content) === "sie" ? "Sie erhalten ein individuelles Angebot, abgestimmt auf Ihre Feier und den benötigten Leistungsumfang." : "Ihr erhaltet ein individuelles Angebot, abgestimmt auf eure Feier und den benötigten Leistungsumfang.",
    minScore: content.limits.min_score,
    minWords: content.article.min_words,
    externalMax: 2,
    externalSources: content.external_sources.map((source) => `- ${source.url} (${source.use})`).join("\n"),
  });
}

// Keeps earlier problems, so a revision can't bring them back.
function rememberFeedback(state, latest) {
  state.history = [...new Set([...(state.history || []), ...(state.feedback || [])])].filter((entry) => !latest.includes(entry));
  state.feedback = latest;
}

// The same check is recognised even when numbers or quoted words differ.
function checkKey(message) {
  return String(message).split(/:\s/)[0].replace(/\d+(?:[.,]\d+)?/g, "#").trim();
}

const MODE_LABELS = {
  fresh: "neuer Artikel",
  revise: "Überarbeitung der fehlgeschlagenen Punkte",
  new: "komplett neuer Artikel zum selben Thema",
  switch: "neues Thema",
};

function modeFor(attempt, state) {
  if (attempt === 1) return "fresh";
  if (attempt === 2) return state.last ? "revise" : "fresh";
  if (attempt === 3) return "new";
  return "switch";
}

const readState = () => readJson(work("pass.json"));
const saveState = (state) => writeJson(work("pass.json"), state);
const finished = (state) => Boolean(state.passed || state.stop || state.pause || state.ended);

// Attempts 4 and 5 move on to the next unused topic, with new photos and keyword ideas.
async function switchTopic(state, run) {
  const calendar = load("calendar");
  const exclude = new Set(state.topics);
  for (let round = 0; round < 3; round += 1) {
    const topic = pickTopic({ topics: (calendar.topics || []).filter((entry) => !exclude.has(entry.title)) }, load("log"), content, new Date());
    if (!topic) break;
    exclude.add(topic.title);
    const prepared = await prepareTopic(topic, content, process.env.UNSPLASH_ACCESS_KEY);
    if (!prepared.ok) continue;
    Object.assign(run, { topic, suggestions: prepared.suggestions, keywordSource: prepared.keywordSource });
    writeJson(work("run.json"), run);
    state.topics.push(topic.title);
    state.last = null;
    state.feedback = [];
    console.log(`Switched to the next topic: ${topic.title}`);
    return true;
  }
  console.warn("No other unused topic with enough photos. Writing a new article on the same topic.");
  return false;
}

async function start() {
  const state = readState();
  const attempt = state.base + position;
  if (finished(state) || attempt > limits.max_attempts) return setOutputs({ run: "false", need_write: "false" });
  const run = readJson(work("run.json"));
  let mode = modeFor(attempt, state);
  if (mode === "switch") {
    try {
      if (!(await switchTopic(state, run))) mode = "new";
    } catch (error) {
      state.pause = { kind: "temporary", message: `Unsplash nicht erreichbar: ${error.message.slice(0, 200)}` };
      saveState(state);
      return setOutputs({ run: "false", need_write: "false" });
    }
  }
  state.current = { attempt, mode, topic: run.topic.title };
  saveState(state);
  // Never read a result left over from an earlier attempt.
  for (const name of [`out-writer-${position}.json`, `out-editor-${position}.json`]) fs.rmSync(work(name), { force: true });
  console.log(`Attempt ${attempt} of ${limits.max_attempts}: ${MODE_LABELS[mode]}.`);
  if (mode === "revise") writeJson(work("previous-draft.json"), state.last);
  fs.writeFileSync(work("prompt-writer.md"), buildWriterPrompt(run, readJson(work("images.json")), state));
  return setOutputs({ run: "true", need_write: "true" });
}

// A failed Claude step: sign-in problems stop the run, limits and outages pause it,
// and an empty or invalid answer counts as a failed attempt.
function handleAiFailure(state, stepName) {
  const failure = aiFailure(stepName);
  if (failure.kind === "auth") {
    state.stop = { kind: "auth", message: failure.message };
    return "stopped";
  }
  if (failure.kind !== "invalid") {
    state.pause = { kind: failure.kind === "limit" ? "limit" : "temporary", message: failure.message };
    return "paused";
  }
  return "invalid";
}

const INVALID = "Ungültige oder unvollständige Ausgabe von Claude";

function failAttempt(state, record, failures, keys) {
  record.result = "failed";
  record.failures = failures;
  record.keys = [...new Set(keys || failures.map(checkKey))];
  rememberFeedback(state, failures);
  console.log(`Attempt ${record.attempt}: failed.`);
  for (const failure of failures) console.log(`- ${failure}`);
}

async function check() {
  const state = readState();
  const run = readJson(work("run.json"));
  const images = readJson(work("images.json"));
  const { attempt, mode, topic } = state.current;
  const record = { attempt, mode, topic, hardRuleFailures: [], warnings: [] };

  const written = readJson(work(`out-writer-${position}.json`), null);
  if (!written) {
    const outcome = handleAiFailure(state, `writer-${position}`);
    if (outcome === "invalid") {
      state.attempts.push(record);
      record.hardRuleFailures = [INVALID];
      failAttempt(state, record, [INVALID]);
    }
    saveState(state);
    return setOutputs({ need_review: "false" });
  }
  const article = fixImageMarkers(written);
  article.body = fixInquiryLinks(article.body, site);
  // Test runs only: a deliberate price on the first attempt, to check the retry.
  if (run.simulate === "quality" && attempt === 1) article.body += "\n\nDas kostet ab 500 Euro.";
  writeJson(work("candidate.json"), article);
  if (run.topic.audience) article.audience = run.topic.audience;
  if (run.topic.inquiry) article.inquiry = run.topic.inquiry;

  const context = { content, site, rules, publishedPosts: publishedPosts(), usedImageIds: usedImageIds(), availableImageIds: new Set(Object.keys(images)) };
  const failures = checkArticle(article, context);
  const originality = checkOriginality(article, knownPosts(), content.similarity);
  const live = await checkLiveLinks(article.body);
  const allFailures = [...failures, ...originality.failures, ...live.failures];

  Object.assign(record, { hardRuleFailures: allFailures, warnings: live.warnings, similarity: originality.highest });
  state.attempts.push(record);
  state.last = article;
  if (allFailures.length) {
    failAttempt(state, record, allFailures);
    saveState(state);
    return setOutputs({ need_review: "false" });
  }
  fs.writeFileSync(work("prompt-editor.md"), buildEditorPrompt(article, images));
  saveState(state);
  return setOutputs({ need_review: "true" });
}

// After a failed attempt: stop at the attempt limit, or early when the same check keeps failing.
function afterFailure(state, record) {
  state.keys.push(record.keys);
  state.reasons.push(...record.failures.map((failure) => `Versuch ${record.attempt}: ${failure}`));
  const recent = state.keys.slice(-limits.same_error_limit);
  if (recent.length === limits.same_error_limit) {
    const repeated = recent[0].find((key) => recent.every((keys) => keys.includes(key)));
    if (repeated) {
      state.ended = { reason: "same-error", check: repeated };
      return;
    }
  }
  if (record.attempt >= limits.max_attempts) state.ended = { reason: "max" };
}

function finish() {
  const state = readState();
  if (state.passed || state.stop || state.pause || state.ended) return;
  const record = state.attempts[state.attempts.length - 1];
  if (!record || record.attempt !== state.current.attempt) return;

  if (!record.result) {
    const review = readJson(work(`out-editor-${position}.json`), null);
    if (!review) {
      const outcome = handleAiFailure(state, `editor-${position}`);
      if (outcome !== "invalid") {
        // Not counted as an attempt: after the pause this attempt runs again.
        state.attempts.pop();
        saveState(state);
        return;
      }
      failAttempt(state, record, [INVALID]);
    } else {
      // The score can never be higher than factual safety.
      const score = Math.min(review.overall, review.scores.factualSafety);
      Object.assign(record, { score, scores: review.scores, issues: review.issues });
      console.log(`Attempt ${record.attempt}: score ${score}.`);
      if (score >= content.limits.min_score) {
        // This exact version passed every check. Suggested edits are never used.
        state.passed = true;
        state.finalScore = score;
        record.result = "passed";
        saveState(state);
        return;
      }
      const note = `Redaktionsnote ${score} liegt unter ${content.limits.min_score}`;
      failAttempt(state, record, [note, ...review.issues], [`Redaktionsnote unter ${content.limits.min_score}`]);
    }
  }
  afterFailure(state, record);
  saveState(state);
}

async function main() {
  if (step === "start") return start();
  if (step === "check") return check();
  if (step === "finish") return finish();
  throw new Error(`Unknown step: ${step}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
