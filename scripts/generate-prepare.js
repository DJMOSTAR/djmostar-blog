// First step of a generation run: checks secrets and limits and prepares the working folder.
// Problems a retry can't fix (missing secret, broken settings) stop the run here.
const fs = require("node:fs");
const { loadConfig, work, writeJson, setOutputs, isDryRun, isAutoPublish, fromRoot } = require("./lib/config");
const { FILES, load, updateSlot, logEvent, publishedThisMonth } = require("./lib/data");
const { upcomingCount, seasonFor } = require("./lib/calendar");
const { collectSuggestions } = require("./lib/autocomplete");
const { waitingDrafts } = require("./lib/pull-requests");
const { gh, changeDataOnMain } = require("./lib/shell");
const { notify } = require("./lib/notify");
const { germanTrends } = require("./lib/trends");
const gsc = require("./lib/gsc");
const schemas = require("./lib/schemas");

function fill(template, values) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => (values[key] === undefined ? "" : String(values[key])));
}

async function skip(slot, reason) {
  await changeDataOnMain([FILES.slots, FILES.log], `Skip ${slot || "manual run"}`, () => {
    updateSlot(slot, { status: "skipped", reason });
    logEvent({ type: "skipped", slot, reason });
  });
  console.log(`Skipped: ${reason}`);
  setOutputs({ run: "false", need_topics: "false" });
}

function loadSettings() {
  try {
    return loadConfig();
  } catch (error) {
    // A broken settings file fails every run the same way: no retries, the crash notice explains it.
    fs.mkdirSync(work(), { recursive: true });
    fs.writeFileSync(work("crash.txt"), `Eine Einstellungsdatei in config/ ist fehlerhaft: ${error.message.slice(0, 300)}`);
    throw error;
  }
}

function missingSecrets(env = process.env) {
  const missing = [];
  if (env.HAS_CLAUDE_CREDENTIAL !== "true") missing.push("CLAUDE_CODE_OAUTH_TOKEN");
  if (!env.UNSPLASH_ACCESS_KEY) missing.push("UNSPLASH_ACCESS_KEY");
  return missing;
}

async function main() {
  const config = loadSettings();
  const { content, schedule, analytics } = config;
  const dry = isDryRun();
  const now = new Date();
  const simulate = ["quality", "503", "auth"].includes(process.env.SIMULATE) ? process.env.SIMULATE : "";
  // Live runs started by hand get their own slot, so a pause can continue them later.
  const slot = process.env.SLOT || (dry ? "" : `manual-${process.env.GITHUB_RUN_ID || now.getTime()}`);
  const entry = (load("slots").slots || {})[slot] || {};
  const run = { slot, dry, simulate, startedAt: now.toISOString(), progress: entry.progress || null, limitChecks: entry.limitChecks || 0 };

  fs.mkdirSync(work("images"), { recursive: true });
  writeJson(work("run.json"), run);
  for (const [name, schema] of Object.entries(schemas)) fs.writeFileSync(work(`schema-${name}.json`), JSON.stringify(schema));

  setOutputs({ model: content.ai.model, turns_topics: content.ai.max_turns.topics, turns_writer: content.ai.max_turns.writer, turns_editor: content.ai.max_turns.editor, simulate });

  const missing = missingSecrets();
  if (missing.length) {
    run.stop = { kind: "secret", message: `Fehlende oder leere Secrets: ${missing.join(", ")}`, missing };
    writeJson(work("run.json"), run);
    return setOutputs({ run: "true", need_topics: "false" });
  }

  if (!dry) {
    const published = publishedThisMonth(now, schedule.time_zone);
    const open = JSON.parse(gh("pr", "list", "--state", "open", "--limit", "50", "--json", "headRefName,isCrossRepository,author,labels,createdAt"));
    const waiting = waitingDrafts(open, isAutoPublish());
    if (published + waitingDrafts(open, true) >= content.limits.monthly_articles) {
      notify({ title: "Blog-Automatik: Monatslimit erreicht", body: `Das Limit von ${content.limits.monthly_articles} Artikeln pro Monat ist erreicht. Dieser Lauf wurde übersprungen.` });
      return skip(slot, "monthly article cap reached");
    }
    if (!isAutoPublish() && waiting >= content.limits.max_waiting_drafts) return skip(slot, `${waiting} drafts are waiting`);
  }

  // Refill the calendar when it runs low.
  const calendar = load("calendar");
  const needTopics = upcomingCount(calendar) < content.calendar.refill_below;
  if (needTopics) {
    const seeds = [...Object.values(content.seed_terms).flat(), ...(content.trend_terms || [])];
    const { suggestions, errors } = await collectSuggestions(seeds);
    const trends = await germanTrends();
    if (errors.length) console.warn(`Autocomplete problems: ${errors.length}`);
    let searchConsole = [];
    try {
      searchConsole = await gsc.blogQueries(analytics.search_console);
    } catch (error) {
      console.warn(`Search Console skipped: ${error.message}`);
    }
    const existing = [...(calendar.topics || []), ...(load("registry").posts || [])].map((entry) => `- ${entry.title}`).join("\n") || "- keine";
    const seasons = seasonFor(content, now.getUTCMonth() + 1).map((season) => season.note).join(", ") || "keiner";
    const prompt = fill(fs.readFileSync(fromRoot("prompts/topics.md"), "utf8"), {
      count: content.calendar.target_upcoming,
      today: now.toISOString().slice(0, 10),
      season: seasons,
      categories: content.categories.map((category) => category.slug).join(", "),
      tags: content.tags.join(", "),
      existing,
      suggestions: suggestions.map((entry) => `- ${entry}`).join("\n") || "- keine verfügbar",
      searchConsole: searchConsole.map((entry) => `- ${entry}`).join("\n") || "- keine",
      trends: trends.map((entry) => `- ${entry}`).join("\n") || "- keine verfügbar",
      targetKeywords: Object.entries(content.target_keywords || {}).map(([category, keywords]) => `- ${category}: ${keywords.join(", ")}`).join("\n"),
    });
    fs.writeFileSync(work("prompt-topics.md"), prompt);
  }
  setOutputs({ run: "true", need_topics: String(needTopics) });
}

module.exports = { missingSecrets };

if (require.main === module) main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
