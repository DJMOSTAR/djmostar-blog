// Last step of a generation run. One of three things happens:
//   passed   the Pull Request is opened, and Publish starts at once if its slot has already passed
//   paused   at a usage limit or after an outage: the slot is checked again in an hour
//   stopped  a problem a retry can't fix, 5 attempts used, or the same check failed 3 times:
//            one Issue in plain German says what happened and what to do
// Problems that a retry fixed send no Issue. They are listed in the run summary and the monthly report.
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");
const { loadConfig, work, readJson, addSummary, fromRoot, isAutoPublish, ROOT } = require("./lib/config");
const { FILES, load, save, updateSlot, logEvent, publishedPosts } = require("./lib/data");
const { nextLimitCheck, publishTarget } = require("./lib/scheduler");
const { renderPost, parsePost, postPath } = require("./lib/postfile");
const { checkArticle } = require("./lib/rules");
const { git, gh, configureGit, changeDataOnMain } = require("./lib/shell");
const { notify, notifyStop, ensureLabels } = require("./lib/notify");
const { retry, retryStep } = require("./lib/retry");

const config = loadConfig();
const limits = config.schedule.retries;
const dataFiles = Object.values(FILES);
const runUrl = () => `${process.env.GITHUB_SERVER_URL || "https://github.com"}/${process.env.GITHUB_REPOSITORY || ""}/actions/runs/${process.env.GITHUB_RUN_ID || ""}`;
const berlinDay = (date) => new Intl.DateTimeFormat("en-CA", { timeZone: config.schedule.time_zone }).format(date);
const MODE_LABELS = { fresh: "neuer Artikel", revise: "Überarbeitung der fehlgeschlagenen Punkte", new: "komplett neuer Artikel zum selben Thema", switch: "neues Thema" };

function usageTotals() {
  const log = readJson(work("ai-log.json"), []);
  return log.reduce((total, entry) => ({
    steps: total.steps + (entry.simulated ? 0 : 1),
    inputTokens: total.inputTokens + ((entry.usage && entry.usage.inputTokens) || 0),
    outputTokens: total.outputTokens + ((entry.usage && entry.usage.outputTokens) || 0),
  }), { steps: 0, inputTokens: 0, outputTokens: 0 });
}

// Everything that went wrong and was retried in this run.
function retryFacts(state) {
  const attempts = (state.attempts || []).filter((attempt) => attempt.result);
  const steps = readJson(work("step-retries.json"), []);
  return {
    total: (state.base || 0) + attempts.length,
    thisRun: attempts.length,
    failed: attempts.filter((attempt) => attempt.result === "failed"),
    steps,
    reasons: [...new Set([...(state.reasons || []).map((reason) => reason.replace(/^Versuch \d+: /, "")), ...steps.map((entry) => `${entry.step}: ${entry.message}`)])],
  };
}

function retrySection(state) {
  const facts = retryFacts(state);
  const lines = ["## Wiederholungen", ""];
  lines.push(`- Versuche mit Claude für diesen Termin: ${facts.total} von ${limits.max_attempts}`);
  if (state.base) lines.push(`- Davon in früheren Läufen (vor einer Pause): ${state.base}`);
  for (const attempt of facts.failed) lines.push(`- Versuch ${attempt.attempt} nicht bestanden: ${attempt.failures.slice(0, 4).join("; ")}${attempt.failures.length > 4 ? " …" : ""}`);
  if (facts.steps.length) {
    lines.push(`- Vorübergehende Fehler, automatisch wiederholt: ${facts.steps.length}`);
    for (const entry of facts.steps) lines.push(`  - ${entry.step}, Versuch ${entry.try}: ${entry.message} (erneut nach ${entry.waitMinutes} Min.)`);
  }
  if (!facts.failed.length && !facts.steps.length && !state.base) lines.push("- Keine: alles hat beim ersten Mal geklappt.");
  return lines.join("\n");
}

function qualityReport(run, state, images, article) {
  const lines = ["## Qualitätsbericht", ""];
  lines.push(state.passed ? `**Ergebnis: bestanden, Note ${state.finalScore} von 100**` : "**Ergebnis: nicht bestanden, nicht veröffentlicht**", "");
  for (const attempt of state.attempts || []) {
    lines.push(`### Versuch ${attempt.attempt}: ${MODE_LABELS[attempt.mode] || attempt.mode}`, `Thema: ${attempt.topic}`);
    lines.push(attempt.hardRuleFailures.length ? `Harte Regeln: ${attempt.hardRuleFailures.length} Problem(e)` : "Harte Regeln: alle bestanden");
    for (const failure of attempt.hardRuleFailures) lines.push(`- ${failure}`);
    if (attempt.scores) {
      const s = attempt.scores;
      lines.push(`Redaktion: Note ${attempt.score}. Fakten ${s.factualSafety}, Stimme ${s.brandVoice}, Interesse ${s.interest ?? "-"}, Anrede ${s.addressForm}, SEO ${s.seo}, Lesbarkeit ${s.readability}, Grammatik ${s.grammar}`);
      for (const issue of attempt.issues || []) lines.push(`- ${issue}`);
    }
    for (const warning of attempt.warnings || []) lines.push(`- Hinweis: ${warning}`);
    if (attempt.similarity && attempt.similarity.slug) lines.push(`Größte Ähnlichkeit: ${attempt.similarity.slug} (${attempt.similarity.score.toFixed(2)}). Das ist nur ein Vergleich mit diesem Blog, keine Internet-Plagiatsprüfung.`);
    lines.push(`Ergebnis: ${attempt.result === "passed" ? "bestanden" : attempt.result === "failed" ? "nicht bestanden" : "abgebrochen"}`, "");
  }
  lines.push(retrySection(state), "");
  if (article) {
    lines.push("## Keywords", "", `- Hauptkeyword: ${article.primaryKeyword}`, ...(article.secondaryKeywords || []).map((keyword) => `- ${keyword}`), `- Quelle: ${run.keywordSource}`, "- Suchvolumen: unbekannt", "");
    lines.push("## Quellen", "", ...((article.sources || []).map((source) => `- [${source.title}](${source.url})`)), "");
    const used = [article.featured, ...(article.inlineImages || [])].filter(Boolean);
    lines.push("## Bildnachweise", "");
    for (const image of used) {
      const data = images[image.id];
      if (data) lines.push(`- ${data.photographer} auf Unsplash: ${image.alt}`);
    }
  }
  const usage = usageTotals();
  lines.push("", `Claude-Schritte: ${usage.steps}, Tokens: ${usage.inputTokens} Eingabe, ${usage.outputTokens} Ausgabe.`);
  return lines.join("\n");
}

const START_GENERATE = "**Actions → Generate article → Run workflow**, den Haken bei „Test run only“ entfernen und starten.";

// The Issue for a stop: what happened, what was tried, what to do.
function stopNotice(kind, run, state, detail = {}) {
  const facts = retryFacts(state);
  const tried = [
    `- Versuche mit Claude: ${facts.total} von ${limits.max_attempts}`,
    ...(facts.failed.length ? ["- Fehlgeschlagene Prüfungen:", ...facts.failed.map((attempt) => `  - Versuch ${attempt.attempt} (${MODE_LABELS[attempt.mode] || attempt.mode}, Thema „${attempt.topic}“): ${attempt.failures.slice(0, 5).join("; ")}`)] : []),
    `- Vorübergehende Fehler, automatisch wiederholt: ${facts.steps.length}`,
  ];
  const later = `Wenn du den Termin nachholen willst: ${START_GENERATE} Wenn das öfter passiert, schick mir den Link zu diesem Issue.`;
  const notices = {
    auth: {
      title: "Claude-Anmeldung fehlgeschlagen",
      what: `Claude hat die Anmeldung abgelehnt (${detail.message || "Token ungültig"}). Der Token ist falsch, abgelaufen oder widerrufen, oder der Claude-Plan ist nicht aktiv. Ein erneuter Versuch hilft hier nicht, deshalb wurde sofort gestoppt.`,
      todo: [
        "Auf deinem Computer PowerShell öffnen und `claude setup-token` ausführen. Im Browser anmelden und den angezeigten Token kopieren. Den Token nie in Chats oder Issues einfügen.",
        "Im Repository: **Settings → Secrets and variables → Actions → `CLAUDE_CODE_OAUTH_TOKEN` → Update secret**, den Token einfügen und speichern.",
        "Unter **Variables** `CLAUDE_TOKEN_CREATED` auf das heutige Datum setzen (JJJJ-MM-TT).",
        `Generate manuell starten: ${START_GENERATE}`,
        "Falls es wieder fehlschlägt: Auf claude.ai prüfen, ob das Pro-Abo aktiv ist.",
      ],
    },
    secret: {
      title: "Secret fehlt",
      what: `${detail.message}. Ohne dieses Secret kann kein Artikel entstehen. Ein erneuter Versuch hilft hier nicht.`,
      todo: [
        ...(detail.missing || []).map((name) => `Im Repository: **Settings → Secrets and variables → Actions → New repository secret**, Name \`${name}\`, Wert eintragen, speichern. ${name === "CLAUDE_CODE_OAUTH_TOKEN" ? "Den Wert erzeugst du mit `claude setup-token`." : name === "UNSPLASH_ACCESS_KEY" ? "Den Wert findest du unter https://unsplash.com/oauth/applications (Access Key)." : ""}`),
        `Generate manuell starten: ${START_GENERATE}`,
      ],
    },
    "no-topic": {
      title: "Keine Themen mehr",
      what: detail.message || "Der Themenkalender ist leer oder aufgebraucht.",
      todo: [`Generate manuell starten, dabei werden neue Themen geplant: ${START_GENERATE}`, "Wenn diese Meldung danach wiederkommt, schick mir den Link zu diesem Issue."],
    },
    images: {
      title: "Keine passenden Fotos",
      what: detail.message,
      todo: ["Nichts sofort nötig: Der nächste Termin versucht es mit anderen Themen.", later],
    },
    max: {
      title: `${limits.max_attempts} Versuche ohne bestandenen Artikel`,
      what: `Kein Artikel hat alle Prüfungen bestanden, auch nicht nach Überarbeitung, Neuschreiben und Themenwechsel. Es wurde nichts veröffentlicht. Die versuchten Themen werden nicht noch einmal verwendet.`,
      todo: ["Nichts sofort nötig: Der nächste Termin läuft automatisch mit einem neuen Thema.", later],
    },
    "same-error": {
      title: `Prüfung „${detail.check}“ ${limits.same_error_limit}-mal fehlgeschlagen`,
      what: `Die Prüfung „${detail.check}“ ist ${limits.same_error_limit}-mal hintereinander fehlgeschlagen. Weitere Versuche hätten vermutlich dasselbe Ergebnis, deshalb wurde früher gestoppt. Es wurde nichts veröffentlicht.`,
      todo: [
        ...(/Link nicht erreichbar/.test(detail.check || "") ? ["Eine verlinkte Seite war nicht erreichbar. Öffne den Link aus der Liste oben. Wenn die Seite dauerhaft weg ist, schick mir den Link, dann ersetze ich die Quelle."] : []),
        "Nichts sofort nötig: Der nächste Termin läuft automatisch.",
        later,
      ],
    },
    build: {
      title: "Seite lässt sich nicht bauen",
      what: `Der Artikel hat alle Prüfungen bestanden, aber die Seite ließ sich damit ${limits.wait_minutes.length + 1}-mal nicht bauen (${detail.message}). Das ist ein Fehler im Code oder in der Vorlage, kein Problem des Artikels. Es wurde nichts veröffentlicht.`,
      todo: ["Schick mir den Link zu diesem Issue.", `Wenn der Fehler behoben ist: ${START_GENERATE}`],
    },
    push: {
      title: "Artikel konnte nicht gespeichert werden",
      what: `Der Artikel hat alle Prüfungen bestanden, aber GitHub hat das Speichern ${limits.wait_minutes.length + 1}-mal abgelehnt (${detail.message}). Der fertige Artikel liegt im Lauf unter **Artifacts → testlauf**.`,
      todo: ["Auf https://www.githubstatus.com prüfen, ob GitHub eine Störung hat.", `Danach: ${START_GENERATE}`, "Wenn es wieder passiert, schick mir den Link zu diesem Issue."],
    },
  };
  const notice = notices[kind];
  const body = [
    `**Was passiert ist:** ${notice.what}`,
    "",
    "**Was versucht wurde:**",
    ...tried,
    "",
    "**Was zu tun ist:**",
    ...notice.todo.map((entry, index) => `${index + 1}. ${entry}`),
    "",
    `Termin: ${run.slot || "manuell"}`,
    `Lauf: ${runUrl()}`,
  ].join("\n");
  return { title: `${run.dry ? "Testlauf: " : ""}Blog-Automatik gestoppt: ${notice.title}`, body };
}

function setTopicStatus(titles, status, slug) {
  const calendar = load("calendar");
  for (const topic of calendar.topics || []) {
    if (titles.includes(topic.title) && topic.status === "planned") Object.assign(topic, slug ? { status, slug } : { status });
  }
  save("calendar", calendar);
}

// New topics from this run are added again if the data had to be reloaded.
function keepNewTopics(run) {
  const calendar = load("calendar");
  for (const added of run.newTopics || []) {
    if (!(calendar.topics || []).some((topic) => topic.title === added.title)) calendar.topics.push(added);
  }
  save("calendar", calendar);
}

function logRetries(run, state, outcome) {
  const facts = retryFacts(state);
  if (!facts.failed.length && !facts.steps.length && !state.base && outcome === "passed") return;
  logEvent({ type: "retries", slot: run.slot, outcome, attempts: facts.total, failedAttempts: facts.failed.length, stepRetries: facts.steps.length, reasons: facts.reasons.slice(0, 20) });
}

function progressOf(run, state) {
  if (!state.topics) return run.progress || null;
  return {
    attempts: state.base + (state.attempts || []).filter((attempt) => attempt.result).length,
    topics: state.topics,
    keys: state.keys,
    history: [...new Set([...(state.history || []), ...(state.feedback || [])])].slice(-20),
    reasons: (state.reasons || []).slice(-30),
  };
}

async function stop(run, state, kind, detail) {
  const notice = stopNotice(kind, run, state, detail);
  const report = (state.attempts || []).length ? qualityReport(run, state, readJson(work("images.json"), {}), null) : retrySection(state);
  addSummary(`# ${notice.title}\n\n${notice.body}\n\n${report}`);
  if (!run.dry) {
    await changeDataOnMain(dataFiles, `Stop ${run.slot}: ${kind}`, () => {
      keepNewTopics(run);
      // Topics that failed on quality are not tried again. Sign-in or setup problems keep them.
      if (["max", "same-error"].includes(kind)) setTopicStatus(state.topics || [], "failed");
      updateSlot(run.slot, { status: "failed", reason: kind, progress: null });
      logRetries(run, state, "stopped");
      logEvent({ type: "stopped", slot: run.slot, kind, check: detail && detail.check });
    });
  }
  notifyStop({ ...notice, close: run.dry });
  console.log(`Stopped: ${kind}`);
}

async function pause(run, state, failure) {
  const next = nextLimitCheck({ limitChecks: run.limitChecks }, limits, new Date());
  const what = failure.kind === "limit" ? "Claude-Nutzungslimit erreicht" : "Dienst vorübergehend nicht erreichbar";
  if (run.dry) {
    addSummary(`# Testlauf: pausiert\n\n${what}: ${failure.message}\n\nIm echten Betrieb würde dieser Termin ${next ? `in ${limits.limit_wait_hours} Stunde(n) fortgesetzt (Prüfung ${next.limitChecks} von ${limits.limit_checks})` : "übersprungen"}.\n\n${retrySection(state)}`);
    notify({ title: `Testlauf: pausiert: ${what}`, body: `${failure.message}\n\nIm echten Betrieb würde der Termin in ${limits.limit_wait_hours} Stunde(n) fortgesetzt.\n\n${retrySection(state)}\n\n${runUrl()}` });
    return;
  }
  if (next) {
    await changeDataOnMain(dataFiles, `Pause ${run.slot}`, () => {
      keepNewTopics(run);
      updateSlot(run.slot, { status: "retry_wait", ...next, reason: failure.kind, progress: progressOf(run, state) });
      logEvent({ type: "paused", slot: run.slot, kind: failure.kind, check: next.limitChecks });
    });
    addSummary(`# Pausiert: ${what}\n\n${failure.message}\n\nNächster Versuch: ${next.retryAt} (Prüfung ${next.limitChecks} von ${limits.limit_checks}). Kein Issue, weil das automatisch weiterläuft.\n\n${retrySection(state)}`);
    console.log(`Paused (${failure.kind}). Next check ${next.limitChecks} at ${next.retryAt}.`);
    return;
  }
  // All hourly checks used: this slot is skipped and the schedule continues with the next one.
  await changeDataOnMain(dataFiles, `Skip ${run.slot} after ${limits.limit_checks} checks`, () => {
    keepNewTopics(run);
    updateSlot(run.slot, { status: "failed", reason: failure.kind, progress: null });
    logRetries(run, state, "skipped");
    logEvent({ type: "skipped", slot: run.slot, reason: `${failure.kind} after ${limits.limit_checks} hourly checks` });
  });
  addSummary(`# Termin übersprungen\n\n${what}, auch nach ${limits.limit_checks} stündlichen Prüfungen. Es geht mit dem nächsten Termin weiter.\n\n${retrySection(state)}`);
}

// Builds the site with the new article, so a template problem can't reach the blog.
function verifyBuild(postText, slug) {
  const file = fromRoot(postPath(slug));
  fs.writeFileSync(file, postText);
  try {
    execFileSync("npx", ["@11ty/eleventy", "--output=.work/site", "--quiet"], { cwd: ROOT, stdio: "pipe" });
    execFileSync("node", ["tests/check-site.js", ".work/site"], { cwd: ROOT, stdio: "pipe" });
  } catch (error) {
    throw new Error(String(error.stderr || error.message).trim().slice(0, 300));
  } finally {
    fs.rmSync(file, { force: true });
  }
}

function openPullRequest(article, postText, body) {
  const branch = `post/${article.slug}`;
  configureGit();
  git("checkout", "-f", "-B", branch, "origin/main");
  fs.writeFileSync(fromRoot(postPath(article.slug)), postText);
  git("add", "--", postPath(article.slug));
  git("commit", "-m", `Neuer Beitrag: ${article.title}`);
  git("push", "--force", "origin", `HEAD:refs/heads/${branch}`);
  ensureLabels();
  fs.writeFileSync(work("pr-body.md"), body);
  const existing = JSON.parse(gh("pr", "list", "--state", "open", "--head", branch, "--json", "url"));
  const url = existing.length ? existing[0].url : gh("pr", "create", "--base", "main", "--head", branch, "--title", `Beitrag: ${article.title}`, "--body-file", work("pr-body.md"), "--label", "passed");
  git("checkout", "-f", "main");
  return url;
}

function recordDraft(run, state, article) {
  keepNewTopics(run);
  setTopicStatus([run.topic.title], "draft", article.slug);
  // Earlier topics of this slot failed their attempts and are not tried again.
  setTopicStatus((state.topics || []).filter((title) => title !== run.topic.title), "failed");
  const registry = load("registry");
  registry.posts = [...(registry.posts || []).filter((post) => post.slug !== article.slug), { title: article.title, slug: article.slug, primaryKeyword: article.primaryKeyword, category: article.category, status: "draft" }];
  save("registry", registry);
  const images = load("images");
  const ids = [article.featured.id, ...(article.inlineImages || []).map((image) => image.id)];
  images.ids = [...new Set([...(images.ids || []), ...ids])];
  save("images", images);
  logEvent({ type: "draft", slot: run.slot, title: article.title, slug: article.slug, category: article.category, score: state.finalScore, attempts: retryFacts(state).total, usage: usageTotals() });
  logRetries(run, state, "passed");
  updateSlot(run.slot, { status: "done", result: "draft", progress: null });
}

// If the publish slot for this article has already passed (a retry or a manual run finished
// late), Publish starts straight away. It never publishes twice for one slot.
async function startPublishIfDue(run) {
  if (!isAutoPublish()) return null;
  const now = new Date();
  const target = publishTarget(run.slot, now, config.schedule);
  if (!target || new Date(target.at) > now) return null;
  const entry = (load("slots").slots || {})[target.key];
  if (entry && entry.result === "published") {
    console.log(`${target.key} already published an article. This one waits for the next publish slot.`);
    return null;
  }
  await retry(() => gh("workflow", "run", "publish.yml", "--ref", "main", "-f", `slot=${target.key}`), { label: "Start Publish" });
  console.log(`Publish started for ${target.key}, because that slot has already passed.`);
  return target.key;
}

async function finishPassed(run, state, images) {
  const article = state.last;
  const report = qualityReport(run, state, images, article);
  const postText = renderPost(article, images, { date: berlinDay(new Date()), topic: run.topic });
  const finalFailures = checkArticle(parsePost(postText), { ...config, publishedPosts: publishedPosts() });
  if (finalFailures.length) return stop(run, state, "build", { message: `Fertige Datei verletzt Regeln: ${finalFailures.join("; ").slice(0, 300)}` });
  try {
    await retryStep(() => verifyBuild(postText, article.slug), "Seite bauen");
  } catch (error) {
    return stop(run, state, "build", { message: error.message });
  }

  if (run.dry) {
    fs.mkdirSync(work("preview"), { recursive: true });
    fs.writeFileSync(work("preview", "artikel.md"), postText);
    fs.writeFileSync(work("preview", "bericht.md"), `${report}\n`);
    addSummary(`# Testlauf: ${article.title}\n\nWürde veröffentlicht werden.\n\n${report}\n\n## Artikel\n\n${article.body}`);
    notify({ title: `Testlauf: bestanden: ${article.title}`, body: `Nichts wurde veröffentlicht.\n\n${runUrl()}\n\n${report}\n\n## Artikel\n\n**${article.title}**\n\n${article.body}\n\n## FAQ\n\n${(article.faq || []).map((entry) => `**${entry.question}**\n${entry.answer}`).join("\n\n")}`.slice(0, 60000) });
    return;
  }

  let prUrl;
  try {
    prUrl = await retryStep(() => openPullRequest(article, postText, `${report}\n`), "Pull Request speichern");
  } catch (error) {
    fs.mkdirSync(work("preview"), { recursive: true });
    fs.writeFileSync(work("preview", "artikel.md"), postText);
    return stop(run, state, "push", { message: error.message.slice(0, 200) });
  }
  await changeDataOnMain(dataFiles, `Record draft: ${article.slug}`, () => recordDraft(run, state, article));
  const started = await startPublishIfDue(run);
  addSummary(`# Bestanden: ${article.title}\n\nPull Request: ${prUrl}\n\n${started ? `Publish wurde sofort gestartet (Termin ${started}).` : "Wird zum nächsten Veröffentlichungstermin veröffentlicht."}\n\n${retrySection(state)}`);
  console.log(`Pull Request: ${prUrl}`);
}

async function main() {
  const run = readJson(work("run.json"));
  const state = readJson(work("pass.json"), { attempts: [], base: run.progress ? run.progress.attempts : 0 });
  const images = readJson(work("images.json"), {});

  if (run.stop) return stop(run, state, run.stop.kind, run.stop);
  if (run.pause) return pause(run, state, run.pause);
  if (state.stop) return stop(run, state, state.stop.kind, state.stop);
  if (state.pause) return pause(run, state, state.pause);
  if (state.passed) return finishPassed(run, state, images);
  if (state.ended) return stop(run, state, state.ended.reason, state.ended);
  // Every attempt step ran without a result, which only happens if the attempt limit was already used.
  return stop(run, state, "max", {});
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
