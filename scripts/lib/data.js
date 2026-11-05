// Reads the blog's records and each article's text.
const fs = require("node:fs");
const { fromRoot, readJson, writeJson } = require("./config");
const { parsePost, postPath } = require("./postfile");

const FILES = {
  calendar: "data/content-calendar.json",
  registry: "data/published-topics.json",
  images: "data/used-images.json",
  log: "data/publish-log.json",
  slots: "data/slot-state.json",
};

const load = (name) => readJson(FILES[name], {});
const save = (name, value) => writeJson(FILES[name], value);

// Every known post. Bodies are only available once a post is on main.
function knownPosts() {
  return (load("registry").posts || []).map((post) => {
    const file = fromRoot(postPath(post.slug));
    return fs.existsSync(file) ? { ...post, body: parsePost(fs.readFileSync(file, "utf8")).body } : post;
  });
}

const publishedPosts = () => knownPosts().filter((post) => post.status === "published");
const usedImageIds = () => new Set((load("images").ids || []).map((entry) => (typeof entry === "string" ? entry : entry.id)));

function logEvent(event) {
  const log = load("log");
  log.events = [...(log.events || []), { at: new Date().toISOString(), ...event }];
  save("log", log);
}

function updateSlot(key, patch) {
  if (!key) return;
  const state = load("slots");
  state.slots = state.slots || {};
  state.slots[key] = { firstAt: new Date().toISOString(), retries: 0, ...(state.slots[key] || {}), ...patch };
  save("slots", state);
}

function publishedThisMonth(now, timeZone) {
  const month = (date) => new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit" }).format(new Date(date));
  return (load("log").events || []).filter((event) => event.type === "published" && month(event.at) === month(now)).length;
}

module.exports = { FILES, load, save, knownPosts, publishedPosts, usedImageIds, logEvent, updateSlot, publishedThisMonth };
