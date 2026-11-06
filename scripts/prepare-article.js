// Adds new topics, picks the next one, then collects keyword ideas and candidate photos.
const fs = require("node:fs");
const { loadConfig, work, readJson, writeJson, setOutputs } = require("./lib/config");
const { load, save, usedImageIds } = require("./lib/data");
const { pickTopic, acceptNewTopics, upcomingCount } = require("./lib/calendar");
const { collectSuggestions } = require("./lib/autocomplete");
const { searchPhotos, toCandidate, downloadThumb } = require("./lib/unsplash");

const MAX_CANDIDATES = 8;
const MIN_CANDIDATES = 3;

async function main() {
  const { content } = loadConfig();
  const run = readJson(work("run.json"));
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) throw new Error("The secret UNSPLASH_ACCESS_KEY is missing");

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

  const topic = pickTopic(calendar, load("log"), content, new Date());
  if (!topic) {
    run.failure = { kind: "no-topic", message: "Der Themenkalender ist leer." };
    writeJson(work("run.json"), run);
    setOutputs({ ready: "false" });
    return;
  }
  run.topic = topic;

  const seedTerms = [...(topic.seeds || []), ...(content.seed_terms[topic.category] || []).slice(0, 2), ...((content.target_keywords || {})[topic.category] || []).slice(0, 2)];
  const { suggestions, errors } = await collectSuggestions(seedTerms);
  run.suggestions = suggestions;
  run.keywordSource = suggestions.length ? "google-autocomplete" : "seed-terms-only";
  if (errors.length) console.warn(`Autocomplete problems: ${errors.length}`);

  // Candidate photos: skips anything already used on the blog.
  const used = usedImageIds();
  const candidates = {};
  for (const query of topic.imageQueries || []) {
    if (Object.keys(candidates).length >= MAX_CANDIDATES) break;
    for (const photo of await searchPhotos(query, key)) {
      if (used.has(photo.id) || candidates[photo.id] || photo.width <= photo.height) continue;
      candidates[photo.id] = toCandidate(photo);
      if (Object.keys(candidates).length >= MAX_CANDIDATES) break;
    }
  }
  for (const candidate of Object.values(candidates)) {
    const file = `.work/images/${candidate.id}.jpg`;
    fs.writeFileSync(work("images", `${candidate.id}.jpg`), await downloadThumb(candidate.thumb));
    candidate.file = file;
  }
  writeJson(work("images.json"), candidates);

  if (Object.keys(candidates).length < MIN_CANDIDATES) {
    run.failure = { kind: "images", message: `Nur ${Object.keys(candidates).length} passende Fotos bei Unsplash gefunden.` };
    writeJson(work("run.json"), run);
    setOutputs({ ready: "false" });
    return;
  }
  writeJson(work("run.json"), run);
  writeJson(work("pass.json"), { passes: [], passed: false, aiFailure: null, pending: null, last: null, feedback: [] });
  setOutputs({ ready: "true" });
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
