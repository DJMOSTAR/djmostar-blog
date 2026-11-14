// Collects keyword ideas and candidate photos for one topic. Used for the first topic of a run
// and again when a later attempt switches to the next unused topic.
const fs = require("node:fs");
const { work, writeJson } = require("./config");
const { usedImageIds } = require("./data");
const { collectSuggestions } = require("./autocomplete");
const { searchPhotos, toCandidate, downloadThumb } = require("./unsplash");
const { retryStep } = require("./retry");

const MAX_CANDIDATES = 8;
const MIN_CANDIDATES = 3;

async function findPhotos(topic, key) {
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
  fs.rmSync(work("images"), { recursive: true, force: true });
  fs.mkdirSync(work("images"), { recursive: true });
  for (const candidate of Object.values(candidates)) {
    fs.writeFileSync(work("images", `${candidate.id}.jpg`), await downloadThumb(candidate.thumb));
    candidate.file = `.work/images/${candidate.id}.jpg`;
  }
  return candidates;
}

// Returns { ok, suggestions, keywordSource, count }. Unsplash problems are retried after
// 2, 5 and 15 minutes; if Unsplash is still down the error is thrown to the caller.
async function prepareTopic(topic, content, key) {
  const seedTerms = [...(topic.seeds || []), ...(content.seed_terms[topic.category] || []).slice(0, 2), ...((content.target_keywords || {})[topic.category] || []).slice(0, 2)];
  const { suggestions, errors } = await collectSuggestions(seedTerms);
  if (errors.length) console.warn(`Autocomplete problems: ${errors.length}`);
  const candidates = await retryStep(() => findPhotos(topic, key), "Unsplash-Fotos");
  writeJson(work("images.json"), candidates);
  const count = Object.keys(candidates).length;
  return { ok: count >= MIN_CANDIDATES, count, suggestions, keywordSource: suggestions.length ? "google-autocomplete" : "seed-terms-only" };
}

module.exports = { prepareTopic, MIN_CANDIDATES };
