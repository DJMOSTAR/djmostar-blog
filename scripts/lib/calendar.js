// Content calendar: chooses the next topic and rejects duplicates.
const { jaccard, normalize } = require("./text");

const seasonFor = (content, month) => (content.seasons || []).filter((season) => season.months.includes(month));

function topicText(topic) {
  return normalize([topic.title, ...(topic.seeds || [])].join(" "));
}

// Prefers priority topics, then the season, then categories not used recently.
function pickTopic(calendar, publishLog, content, now) {
  const planned = (calendar.topics || []).filter((topic) => topic.status === "planned");
  if (planned.length === 0) return null;
  const month = now.getUTCMonth() + 1;
  const seasons = seasonFor(content, month);
  const recent = (publishLog.events || []).filter((event) => event.category).slice(-5).map((event) => event.category);
  const score = (topic, index) => {
    let value = topic.priority ? 100 : 0;
    for (const season of seasons) {
      const inCategory = season.categories.includes(topic.category);
      const inTerms = (season.terms || []).some((term) => topicText(topic).includes(normalize(term)));
      if (inCategory && inTerms) value += 6;
      else if (inTerms) value += 4;
      else if (inCategory) value += 2;
    }
    // Avoid the same category twice in a row.
    const lastUse = recent.lastIndexOf(topic.category);
    value += lastUse === -1 ? 3 : (recent.length - 1 - lastUse) * 0.5;
    return value - index * 0.01;
  };
  return planned.map((topic, index) => ({ topic, value: score(topic, index) })).sort((a, b) => b.value - a.value)[0].topic;
}

const upcomingCount = (calendar) => (calendar.topics || []).filter((topic) => topic.status === "planned").length;

// Keeps valid new topics only.
function acceptNewTopics(candidates, calendar, registry, content) {
  const categorySlugs = new Set((content.categories || []).map((category) => category.slug));
  const existing = [...(calendar.topics || []), ...(registry.posts || [])];
  const accepted = [];
  const rejected = [];
  for (const candidate of candidates) {
    const reasons = [];
    if (!candidate.title || !categorySlugs.has(candidate.category)) reasons.push("ungültige Kategorie oder Titel");
    if (!Array.isArray(candidate.imageQueries) || candidate.imageQueries.length < 2) reasons.push("zu wenige Bildsuchbegriffe");
    for (const other of [...existing, ...accepted]) {
      if (jaccard(candidate.title, other.title) > content.similarity.title_max) reasons.push(`zu ähnlich zu "${other.title}"`);
    }
    if (reasons.length) rejected.push({ title: candidate.title, reasons });
    else accepted.push({ ...candidate, tags: (candidate.tags || []).filter((tag) => (content.tags || []).includes(tag)), status: "planned", addedAt: new Date().toISOString().slice(0, 10) });
  }
  return { accepted, rejected };
}

module.exports = { pickTopic, upcomingCount, acceptNewTopics, seasonFor };
