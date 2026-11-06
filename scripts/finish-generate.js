// Last step of a generation run: opens the Pull Request, schedules a retry, or sends a notice.
// A partial article can't get here: only a complete, checked result becomes a file.
const fs = require("node:fs");
const { execFileSync } = require("node:child_process");
const { loadConfig, work, readJson, writeJson, addSummary, fromRoot, ROOT } = require("./lib/config");
const { FILES, load, save, updateSlot, logEvent } = require("./lib/data");
const { nextRetry } = require("./lib/scheduler");
const { renderPost, parsePost, postPath } = require("./lib/postfile");
const { checkArticle } = require("./lib/rules");
const { git, gh, configureGit, changeDataOnMain } = require("./lib/shell");
const { notify, ensureLabels } = require("./lib/notify");
const { retry } = require("./lib/retry");

const config = loadConfig();
const runUrl = () => `${process.env.GITHUB_SERVER_URL || "https://github.com"}/${process.env.GITHUB_REPOSITORY || ""}/actions/runs/${process.env.GITHUB_RUN_ID || ""}`;
const berlinDay = (date) => new Intl.DateTimeFormat("en-CA", { timeZone: config.schedule.time_zone }).format(date);

function usageTotals() {
  const log = readJson(work("ai-log.json"), []);
  return log.reduce((total, entry) => ({
    steps: total.steps + 1,
    inputTokens: total.inputTokens + ((entry.usage && entry.usage.inputTokens) || 0),
    outputTokens: total.outputTokens + ((entry.usage && entry.usage.outputTokens) || 0),
  }), { steps: 0, inputTokens: 0, outputTokens: 0 });
}

function qualityReport(run, state, images, article) {
  const lines = ["## Qualitätsbericht", ""];
  lines.push(state.passed ? `**Ergebnis: bestanden, Note ${state.finalScore} von 100**` : "**Ergebnis: nicht bestanden, nicht veröffentlicht**", "");
  for (const pass of state.passes) {
    lines.push(`### Durchgang ${pass.pass}${pass.corrected ? " (korrigierte Fassung)" : ""}`);
    lines.push(pass.hardRuleFailures.length ? `Harte Regeln: ${pass.hardRuleFailures.length} Problem(e)` : "Harte Regeln: alle bestanden");
    for (const failure of pass.hardRuleFailures) lines.push(`- ${failure}`);
    if (pass.scores) {
      const s = pass.scores;
      lines.push(`Redaktion: Note ${pass.score}. Fakten ${s.factualSafety}, Stimme ${s.brandVoice}, Anrede ${s.addressForm}, SEO ${s.seo}, Lesbarkeit ${s.readability}, Grammatik ${s.grammar}`);
      for (const issue of pass.issues || []) lines.push(`- ${issue}`);
    }
    for (const warning of pass.warnings || []) lines.push(`- Hinweis: ${warning}`);
    if (pass.similarity && pass.similarity.slug) lines.push(`Größte Ähnlichkeit: ${pass.similarity.slug} (${pass.similarity.score.toFixed(2)}). Das ist nur ein Vergleich mit diesem Blog, keine Internet-Plagiatsprüfung.`);
    lines.push("");
  }
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

// Builds the site with the new article, so a template problem can't reach the blog.
function verifyBuild(postText, slug) {
  const file = fromRoot(postPath(slug));
  fs.writeFileSync(file, postText);
  try {
    execFileSync("npx", ["@11ty/eleventy", "--output=.work/site", "--quiet"], { cwd: ROOT, stdio: "pipe" });
    execFileSync("node", ["tests/check-site.js", ".work/site"], { cwd: ROOT, stdio: "pipe" });
  } finally {
    fs.rmSync(file, { force: true });
  }
}

function openPullRequest(article, postText, body, label) {
  const branch = `post/${article.slug}`;
  configureGit();
  git("checkout", "-f", "-B", branch, "origin/main");
  fs.writeFileSync(fromRoot(postPath(article.slug)), postText);
  git("add", "--", postPath(article.slug));
  git("commit", "-m", `Neuer Beitrag: ${article.title}`);
  git("push", "--force", "origin", `HEAD:refs/heads/${branch}`);
  ensureLabels();
  fs.writeFileSync(work("pr-body.md"), body);
  const url = gh("pr", "create", "--base", "main", "--head", branch, "--title", `Beitrag: ${article.title}`, "--body-file", work("pr-body.md"), "--label", label);
  git("checkout", "-f", "main");
  return url;
}

function markTopic(run, status, slug) {
  const calendar = load("calendar");
  for (const topic of calendar.topics || []) {
    if (topic.title === run.topic.title) Object.assign(topic, { status, slug });
  }
  // New topics from this run are added again if the data had to be reloaded.
  for (const added of run.newTopics || []) {
    if (!calendar.topics.some((topic) => topic.title === added.title)) calendar.topics.push(added);
  }
  save("calendar", calendar);
}

function recordDraft(run, article, status, score) {
  markTopic(run, status, article.slug);
  const registry = load("registry");
  registry.posts = [...(registry.posts || []).filter((post) => post.slug !== article.slug), { title: article.title, slug: article.slug, primaryKeyword: article.primaryKeyword, category: article.category, status }];
  save("registry", registry);
  const images = load("images");
  const ids = [article.featured.id, ...(article.inlineImages || []).map((image) => image.id)];
  images.ids = [...new Set([...(images.ids || []), ...ids])];
  save("images", images);
  logEvent({ type: status === "draft" ? "draft" : "needs-review", slot: run.slot, title: article.title, slug: article.slug, category: article.category, score, usage: usageTotals() });
  updateSlot(run.slot, { status: "done", result: status });
}

const dataFiles = Object.values(FILES);

async function handleAiFailure(run, failure) {
  const { schedule } = config;
  const reason = failure.message || "Unbekannter Fehler";

  if (run.dry) {
    notify({ title: "Testlauf: Claude-Schritt fehlgeschlagen", problem: true, body: `Art: ${failure.kind}\n\n${reason}\n\n${runUrl()}` });
    return;
  }
  if (failure.kind === "auth") {
    await changeDataOnMain(dataFiles, "Record a Claude sign-in failure", () => {
      updateSlot(run.slot, { status: "failed", reason: "auth" });
      logEvent({ type: "ai-failed", slot: run.slot, kind: failure.kind });
    });
    notify({ title: "Blog-Automatik: Claude-Anmeldung fehlgeschlagen", problem: true, body: `Der Token ist vermutlich falsch oder abgelaufen, oder der Pro-Plan ist nicht aktiv. Dieser Artikel wurde übersprungen.\n\nErstelle mit \`claude setup-token\` einen neuen Token und aktualisiere das Secret \`CLAUDE_CODE_OAUTH_TOKEN\`.\n\n${runUrl()}` });
    return;
  }

  const entry = load("slots").slots?.[run.slot] || { firstAt: run.startedAt, retries: run.limitRetry };
  const next = nextRetry(entry, schedule.limit_retry_hours, new Date());
  if (next && run.slot) {
    await changeDataOnMain(dataFiles, `Schedule a retry for ${run.slot}`, () => {
      updateSlot(run.slot, { status: "retry_wait", ...next, reason: failure.kind });
      logEvent({ type: "ai-retry", slot: run.slot, kind: failure.kind, retry: next.retries });
    });
    console.log(`Claude failed (${failure.kind}). Retry ${next.retries} at ${next.retryAt}.`);
    return;
  }
  await changeDataOnMain(dataFiles, `Give up on ${run.slot || "manual run"}`, () => {
    updateSlot(run.slot, { status: "failed", reason: failure.kind });
    logEvent({ type: "ai-failed", slot: run.slot, kind: failure.kind });
  });
  const limitText = failure.kind === "limit" ? "Das Nutzungslimit deines Claude-Plans war vermutlich erreicht." : "Claude konnte den Artikel nicht fertigstellen.";
  notify({ title: "Blog-Automatik: Artikel übersprungen", problem: true, body: `${limitText} Alle Wiederholungen sind fehlgeschlagen. Es wurde nichts veröffentlicht.\n\nGrund: ${reason}\n\n${runUrl()}` });
}

async function main() {
  const run = readJson(work("run.json"));
  if (run.failure) {
    notify({ title: "Blog-Automatik: Artikel übersprungen", problem: true, body: `${run.failure.message}\n\n${runUrl()}` });
    if (!run.dry) {
      await changeDataOnMain(dataFiles, "Record a skipped article", () => {
        updateSlot(run.slot, { status: "failed", reason: run.failure.kind });
        logEvent({ type: "failed", slot: run.slot, kind: run.failure.kind });
      });
    }
    return;
  }
  const state = readJson(work("pass.json"));
  const images = readJson(work("images.json"), {});
  if (state.aiFailure && !state.last) return handleAiFailure(run, state.aiFailure);
  if (state.aiFailure && !state.passed) return handleAiFailure(run, state.aiFailure);

  const article = state.last;
  if (!article) throw new Error("No article was produced");
  const report = qualityReport(run, state, images, article);
  const date = berlinDay(new Date());
  const passed = Boolean(state.passed);
  const reasons = (state.passes[state.passes.length - 1] || {}).hardRuleFailures || [];
  const lastIssues = state.feedback || [];

  let postText = null;
  let buildProblem = null;
  try {
    postText = renderPost(article, images, { date, topic: run.topic });
    const finalFailures = passed ? checkArticle(parsePost(postText), { ...config, publishedPosts: require("./lib/data").publishedPosts() }) : [];
    if (finalFailures.length) buildProblem = `Fertige Datei verletzt Regeln: ${finalFailures.join("; ")}`;
    if (!buildProblem) verifyBuild(postText, article.slug);
  } catch (error) {
    buildProblem = `Artikel konnte nicht gebaut werden: ${error.message.slice(0, 500)}`;
  }
  const ok = passed && !buildProblem;

  if (run.dry) {
    fs.mkdirSync(work("preview"), { recursive: true });
    if (postText) fs.writeFileSync(work("preview", "artikel.md"), postText);
    fs.writeFileSync(work("preview", "bericht.md"), `${report}\n${buildProblem ? `\nProblem: ${buildProblem}\n` : ""}`);
    addSummary(`# Testlauf: ${article.title}\n\n${ok ? "Würde veröffentlicht werden." : "Würde NICHT veröffentlicht werden."}\n\n${report}\n\n## Artikel\n\n${article.body}`);
    notify({ title: `Testlauf: ${ok ? "bestanden" : "nicht bestanden"}: ${article.title}`, problem: false, body: `Nichts wurde veröffentlicht.\n\n${runUrl()}\n\n${buildProblem ? `Problem: ${buildProblem}\n\n` : ""}${report}\n\n## Artikel\n\n**${article.title}**\n\n${article.body}\n\n## FAQ\n\n${(article.faq || []).map((entry) => `**${entry.question}**\n${entry.answer}`).join("\n\n")}`.slice(0, 60000) });
    return;
  }

  if (!postText) {
    await changeDataOnMain(dataFiles, "Record a failed article", () => {
      updateSlot(run.slot, { status: "failed", reason: "render" });
      logEvent({ type: "failed", slot: run.slot, kind: "render" });
    });
    notify({ title: "Blog-Automatik: Artikel konnte nicht erstellt werden", problem: true, body: `${buildProblem}\n\n${runUrl()}` });
    return;
  }

  const label = ok ? "passed" : "needs-review";
  const prBody = `${ok ? "" : "**Nicht veröffentlichen ohne Prüfung.**\n\n"}${buildProblem ? `Problem: ${buildProblem}\n\n` : ""}${report}\n`;
  const prUrl = await retry(() => openPullRequest(article, postText, prBody, label), { label: "Open Pull Request" });
  await changeDataOnMain(dataFiles, `Record draft: ${article.slug}`, () => recordDraft(run, article, ok ? "draft" : "needs-review", state.finalScore ?? null));

  if (!ok) {
    const why = [buildProblem, ...reasons, ...lastIssues].filter(Boolean).slice(0, 12).map((entry) => `- ${entry}`).join("\n");
    notify({ title: `Blog-Automatik: Prüfung fehlgeschlagen: ${article.title}`, problem: true, body: `Dieser Beitrag wird nicht veröffentlicht und der Termin wird übersprungen.\n\nGründe:\n${why}\n\nEntwurf: ${prUrl}\n\nZum manuellen Freigeben das Label \`approved\` setzen.` });
  }
  console.log(`Pull Request: ${prUrl}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
