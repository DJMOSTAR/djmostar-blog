// Monthly report. Always lists last month's retries and stops. Search Console figures are
// added once the secret GSC_SERVICE_ACCOUNT_JSON exists.
const fs = require("node:fs");
const { loadConfig, readJson, writeJson, fromRoot } = require("./lib/config");
const gsc = require("./lib/gsc");
const { load } = require("./lib/data");
const { changeDataOnMain } = require("./lib/shell");
const { notify } = require("./lib/notify");

const OUTCOMES = { passed: "danach bestanden", deployed: "Deploy danach erfolgreich", stopped: "gestoppt", skipped: "übersprungen" };

function retryReport(events, range) {
  const inMonth = events.filter((event) => event.at >= range.startDate && event.at.slice(0, 10) <= range.endDate);
  const retries = inMonth.filter((event) => event.type === "retries");
  const published = inMonth.filter((event) => event.type === "published").length;
  const failedAttempts = retries.reduce((sum, event) => sum + (event.failedAttempts || 0), 0);
  const stepRetries = retries.reduce((sum, event) => sum + (event.stepRetries || 0), 0);
  const pauses = inMonth.filter((event) => event.type === "paused").length;
  const stops = inMonth.filter((event) => event.type === "stopped");
  const counts = {};
  for (const event of retries) for (const reason of event.reasons || []) counts[reason] = (counts[reason] || 0) + 1;
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10);
  return [
    "## Wiederholungen",
    "",
    `- Veröffentlichte Beiträge: ${published}`,
    `- Neue Artikelversuche nach nicht bestandenen Prüfungen: ${failedAttempts}`,
    `- Automatisch wiederholte Schritte nach vorübergehenden Fehlern (Claude, Unsplash, GitHub, Deploy): ${stepRetries}`,
    `- Pausen wegen Claude-Limit oder Störung: ${pauses}`,
    `- Stopps mit Issue: ${stops.length}${stops.length ? ` (${stops.map((event) => event.kind).join(", ")})` : ""}`,
    "",
    ...(retries.length ? ["Termine mit Wiederholungen:", ...retries.map((event) => `- ${event.slot || "manuell"}: ${event.attempts || 0} Claude-Versuch(e), ${event.stepRetries || 0} wiederholte Schritte, ${OUTCOMES[event.outcome] || event.outcome}`), ""] : []),
    ...(top.length ? ["Häufigste Gründe:", ...top.map(([reason, count]) => `- ${reason} (${count}x)`)] : ["Keine Wiederholungen in diesem Monat."]),
  ].join("\n");
}

async function searchConsoleReport(range, files) {
  const { analytics } = loadConfig();
  const cfg = analytics.search_console;
  const query = gsc.client();
  const base = { startDate: range.startDate, endDate: range.endDate };
  const pages = await query(cfg.property, { ...base, dimensions: ["page"], dimensionFilterGroups: gsc.blogFilter(cfg.blog_host), rowLimit: 500 });
  const postKeywords = (load("registry").posts || []).filter((post) => post.status === "published").map((post) => post.primaryKeyword);
  const names = [...new Set([...cfg.tracked_keywords, ...postKeywords])];
  const keywords = [];
  for (const name of names) {
    const [row] = await query(cfg.property, { ...base, dimensions: ["query"], dimensionFilterGroups: [{ filters: [{ dimension: "query", operator: "equals", expression: name.toLowerCase() }] }], rowLimit: 1 });
    keywords.push({ name, position: row ? row.position : null, clicks: row ? row.clicks : 0 });
  }
  const history = readJson("data/gsc-history.json", { keywords: {} });
  files.push("data/gsc-history.json");
  return {
    text: gsc.buildReport({ label: range.label, pages, keywords, previous: history.keywords, cfg }),
    save: () => writeJson("data/gsc-history.json", { keywords: Object.fromEntries(keywords.filter((keyword) => keyword.position != null).map((keyword) => [keyword.name, keyword.position])) }),
  };
}

async function main() {
  const range = gsc.previousMonth(new Date());
  const file = `reports/${range.label}.md`;
  const files = [file];
  const parts = [`# Blog-Bericht ${range.label}`, "", retryReport(load("log").events || [], range)];
  let search = null;
  if (gsc.isEnabled()) {
    search = await searchConsoleReport(range, files);
    parts.push("", search.text.replace(/^# .*\n+/, "## Search Console\n\n"));
  } else {
    parts.push("", "_Search Console ist noch nicht verbunden, deshalb gibt es hier keine Zahlen zu Klicks und Positionen._");
  }
  const report = parts.join("\n");
  await changeDataOnMain(files, `Monthly report ${range.label}`, () => {
    fs.mkdirSync(fromRoot("reports"), { recursive: true });
    fs.writeFileSync(fromRoot(file), `${report}\n`);
    if (search) search.save();
  });
  notify({ title: `Blog-Bericht ${range.label}`, body: report.slice(0, 60000) });
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = { retryReport };
