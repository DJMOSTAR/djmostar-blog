// Adds new topics, picks the topic (or the one a paused run was working on), then collects
// keyword ideas and candidate photos.
const { loadConfig, work, readJson, writeJson, setOutputs } = require("./lib/config");
const { load, save } = require("./lib/data");
const { pickTopic, acceptNewTopics, upcomingCount } = require("./lib/calendar");
const { prepareTopic } = require("./lib/topic-prep");

async function main() {
  const { content } = loadConfig();
  const run = readJson(work("run.json"));
  if (run.stop) return setOutputs({ ready: "false" });
  const key = process.env.UNSPLASH_ACCESS_KEY;

  const calendar = load("calendar");
  const planned = readJson(work("out-topics.json"), null);
  if (planned) {
    const { accepted, rejected } = acceptNewTopics(planned.topics || [], calendar, load("registry"), content);
    calendar.topics = [...(calendar.topics || []), ...accepted];
    run.newTopics = accepted;
    console.log(`Topics added: ${accepted.length}, rejected: ${rejected.length}`);
    save("calendar", calendar);
  }
  if (upcomingCount(calendar) < content.calendar.refill_below) console.warn("The calendar is still low on topics.");

  // A paused run continues with the topic it was working on.
  const progress = run.progress || null;
  const tried = progress ? progress.topics || [] : [];
  const resumeTitle = tried[tried.length - 1];
  let topic = resumeTitle ? (calendar.topics || []).find((entry) => entry.title === resumeTitle && entry.status === "planned") : null;
  const skipped = [];
  let prepared = null;
  for (let round = 0; round < 3; round += 1) {
    if (!topic) {
      const exclude = new Set([...tried, ...skipped]);
      topic = pickTopic({ topics: (calendar.topics || []).filter((entry) => !exclude.has(entry.title)) }, load("log"), content, new Date());
    }
    if (!topic) break;
    try {
      prepared = await prepareTopic(topic, content, key);
    } catch (error) {
      // Unsplash still failed after waiting 2, 5 and 15 minutes: pause, don't write anything.
      run.pause = { kind: "temporary", message: `Unsplash nicht erreichbar: ${error.message.slice(0, 200)}` };
      writeJson(work("run.json"), run);
      return setOutputs({ ready: "false" });
    }
    if (prepared.ok) break;
    console.warn(`Only ${prepared.count} photos for "${topic.title}". Trying the next topic.`);
    skipped.push(topic.title);
    topic = null;
    prepared = null;
  }

  if (!topic || !prepared) {
    // When the topic planner itself failed, report that cause instead.
    const planner = [...readJson(work("ai-log.json"), [])].reverse().find((entry) => entry.step === "topics" && entry.kind);
    if (!skipped.length && planner && planner.kind === "auth") run.stop = { kind: "auth", message: planner.message };
    else if (!skipped.length && planner && planner.kind !== "invalid") run.pause = { kind: planner.kind === "limit" ? "limit" : "temporary", message: planner.message };
    else run.stop = skipped.length
      ? { kind: "images", message: `Für die nächsten Themen wurden bei Unsplash zu wenige passende Fotos gefunden (${skipped.join(", ")}).` }
      : { kind: "no-topic", message: "Der Themenkalender ist leer oder aufgebraucht, und es konnten keine neuen Themen geplant werden." };
    writeJson(work("run.json"), run);
    return setOutputs({ ready: "false" });
  }

  Object.assign(run, { topic, suggestions: prepared.suggestions, keywordSource: prepared.keywordSource });
  writeJson(work("run.json"), run);
  const topics = tried.includes(topic.title) ? tried : [...tried, topic.title];
  writeJson(work("pass.json"), {
    base: progress ? progress.attempts || 0 : 0,
    attempts: [],
    keys: progress ? progress.keys || [] : [],
    history: progress ? progress.history || [] : [],
    feedback: [],
    reasons: progress ? progress.reasons || [] : [],
    topics,
    last: null,
    passed: false,
    stop: null,
    pause: null,
    ended: null,
  });
  setOutputs({ ready: "true" });
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
