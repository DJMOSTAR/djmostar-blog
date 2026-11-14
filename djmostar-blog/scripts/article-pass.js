// One pass of write, check and review. generate.yml runs up to three passes.
// Usage: node scripts/article-pass.js start|check|finish <pass number>
const fs = require("node:fs");
const { loadConfig, work, readJson, writeJson, setOutputs, fromRoot } = require("./lib/config");
const { knownPosts, publishedPosts, usedImageIds } = require("./lib/data");
const { checkArticle, checkOriginality, checkLiveLinks, audienceFor, findCategory } = require("./lib/rules");

const [step, passArg] = process.argv.slice(2);
const pass = Number(passArg);
const config = loadConfig();
const { content, site, rules, facts } = config;

const addressText = (audience) => (audience === "sie" ? 'formell mit "Sie" und "Ihr" (großgeschrieben), nie "ihr" oder "euch"' : 'informell mit "ihr" und "euch", nie "Sie"');
const fill = (template, values) => template.replace(/\{\{(\w+)\}\}/g, (_, key) => (values[key] === undefined ? "" : String(values[key])));
const lastAiError = () => { const log = readJson(work("ai-log.json"), []); return log[log.length - 1] || { kind: "other", message: "Unknown failure" }; };

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
  const feedback = state.last
    ? [
      "## Überarbeitung des vorherigen Entwurfs",
      "",
      "Schreibe den Artikel nicht neu. Lies den abgelehnten Entwurf in `.work/previous-draft.json` und überarbeite ihn: Behalte, was gut ist, und ändere nur, was nötig ist. Gib den vollständigen Artikel in allen Feldern zurück.",
      "",
      "Die Links zur Anfrageseite und zur Startseite und 1 bis 2 externe Links bleiben in jedem Fall erhalten.",
      "",
      "Das muss behoben werden:",
      ...state.feedback.map((entry) => `- ${entry}`),
      ...(state.history && state.history.length ? ["", "Diese früheren Probleme dürfen nicht wieder auftreten:", ...state.history.map((entry) => `- ${entry}`)] : []),
    ].join("\n")
    : "";
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

function start() {
  const state = readJson(work("pass.json"));
  if (state.passed || state.aiFailure) return setOutputs({ run: "false", need_write: "false" });
  // The extra pass only reviews a correction from the last regular pass. It never writes.
  if (pass > content.limits.max_passes && !state.pending) return setOutputs({ run: "false", need_write: "false" });
  const run = readJson(work("run.json"));
  const images = readJson(work("images.json"));
  if (state.pending) {
    writeJson(work("candidate.json"), state.pending);
    state.pending = null;
    state.candidateIsCorrection = true;
    writeJson(work("pass.json"), state);
    return setOutputs({ run: "true", need_write: "false" });
  }
  state.candidateIsCorrection = false;
  writeJson(work("pass.json"), state);
  if (state.last) writeJson(work("previous-draft.json"), state.last);
  fs.writeFileSync(work("prompt-writer.md"), buildWriterPrompt(run, images, state));
  return setOutputs({ run: "true", need_write: "true" });
}

async function check() {
  const state = readJson(work("pass.json"));
  const run = readJson(work("run.json"));
  const images = readJson(work("images.json"));
  if (!state.candidateIsCorrection) {
    const written = readJson(work(`out-writer-${pass}.json`), null);
    if (!written) {
      state.aiFailure = lastAiError();
      writeJson(work("pass.json"), state);
      return setOutputs({ need_review: "false" });
    }
    writeJson(work("candidate.json"), written);
  }
  const article = readJson(work("candidate.json"));
  if (run.topic.audience) article.audience = run.topic.audience;
  if (run.topic.inquiry) article.inquiry = run.topic.inquiry;

  const published = publishedPosts();
  const context = { content, site, rules, publishedPosts: published, usedImageIds: usedImageIds(), availableImageIds: new Set(Object.keys(images)) };
  const failures = checkArticle(article, context);
  const originality = checkOriginality(article, knownPosts(), content.similarity);
  const live = await checkLiveLinks(article.body);
  const allFailures = [...failures, ...originality.failures, ...live.failures];

  const record = { pass, corrected: state.candidateIsCorrection, hardRuleFailures: allFailures, warnings: live.warnings, similarity: originality.highest };
  state.passes.push(record);
  state.last = article;
  if (allFailures.length) {
    rememberFeedback(state, allFailures);
    console.log(`Pass ${pass}: ${allFailures.length} hard rule problem(s).`);
    for (const failure of allFailures) console.log(`- ${failure}`);
    writeJson(work("pass.json"), state);
    return setOutputs({ need_review: "false" });
  }
  fs.writeFileSync(work("prompt-editor.md"), buildEditorPrompt(article, images));
  writeJson(work("pass.json"), state);
  return setOutputs({ need_review: "true" });
}

function finish() {
  const state = readJson(work("pass.json"));
  if (state.passed || state.aiFailure) return;
  const record = state.passes[state.passes.length - 1];
  if (!record || record.hardRuleFailures.length) return;

  const review = readJson(work(`out-editor-${pass}.json`), null);
  if (!review) {
    state.aiFailure = lastAiError();
    writeJson(work("pass.json"), state);
    return;
  }
  // The score can never be higher than factual safety.
  const score = Math.min(review.overall, review.scores.factualSafety);
  record.score = score;
  record.scores = review.scores;
  record.issues = review.issues;

  if (score >= content.limits.min_score) {
    // This exact version passed every check. Optional edits are ignored, because they would
    // produce a different text that nobody has reviewed.
    state.passed = true;
    state.finalScore = score;
    record.result = "passed";
    if (review.corrected) record.correctionIgnored = true;
  } else if (review.corrected) {
    // A corrected version never approves itself: it goes through all checks again.
    state.pending = review.corrected;
    rememberFeedback(state, review.issues);
    record.result = "corrected";
  } else {
    rememberFeedback(state, review.issues.length ? review.issues : [`Redaktionsnote ${score} liegt unter ${content.limits.min_score}.`]);
    record.result = "rejected";
  }
  console.log(`Pass ${pass}: score ${score}, ${record.result}.`);
  for (const issue of review.issues) console.log(`- ${issue}`);
  writeJson(work("pass.json"), state);
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
