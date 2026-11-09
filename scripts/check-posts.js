// Runs the hard rules and the duplicate check on every published article.
// Part of every deploy, so an edited article that breaks a rule never goes live.
// Usage: node scripts/check-posts.js [slug]
const fs = require("node:fs");
const { loadConfig, fromRoot } = require("./lib/config");
const { parsePost } = require("./lib/postfile");
const { checkArticle, checkOriginality } = require("./lib/rules");

const config = loadConfig();
const only = process.argv[2];
const dir = fromRoot("content/posts");
const posts = fs.readdirSync(dir).filter((file) => file.endsWith(".md")).map((file) => parsePost(fs.readFileSync(`${dir}/${file}`, "utf8")));

// Dates can be text or real dates in the files, so both are compared as times.
const time = (value) => new Date(value instanceof Date ? value : `${String(value).slice(0, 10)}T00:00:00Z`).getTime();

let problems = 0;
for (const post of posts) {
  if (only && post.slug !== only) continue;
  // Earlier articles are those it was allowed to link to when it was written.
  const earlier = posts.filter((other) => other.slug !== post.slug && time(other.date) < time(post.date)).map((other) => ({ ...other, status: "published" }));
  const failures = [
    ...checkArticle(post, { ...config, publishedPosts: earlier }),
    ...checkOriginality(post, earlier, config.content.similarity).failures,
  ];
  if (failures.length) {
    problems += failures.length;
    console.error(`${post.slug}: ${failures.length} problem(s)`);
    for (const failure of failures) console.error(`  - ${failure}`);
  } else {
    console.log(`${post.slug}: all hard rules passed`);
  }
}
process.exit(problems ? 1 : 0);
