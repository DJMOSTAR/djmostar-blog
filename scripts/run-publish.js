// Publishes the next approved article. The article is checked again immediately before merging.
const fs = require("node:fs");
const { loadConfig, setOutputs, isDryRun, isAutoPublish, fromRoot, addSummary } = require("./lib/config");
const { FILES, load, save, updateSlot, logEvent, publishedPosts } = require("./lib/data");
const { selectForPublishing, labelNames } = require("./lib/pull-requests");
const { parsePost, setDate } = require("./lib/postfile");
const { checkArticle } = require("./lib/rules");
const { triggerDownload } = require("./lib/unsplash");
const { git, gh, configureGit, changeDataOnMain } = require("./lib/shell");
const { notify } = require("./lib/notify");
const { retry } = require("./lib/retry");

const config = loadConfig();
const slot = process.env.SLOT || "";
const dataFiles = Object.values(FILES);

function articleFileIn(branch) {
  const changed = git("diff", "--name-only", `origin/main...origin/${branch}`).split("\n").filter(Boolean);
  // A post branch may change exactly one article file and nothing else.
  if (changed.length !== 1 || !/^content\/posts\/[a-z0-9-]+\.md$/.test(changed[0])) {
    throw new Error(`Branch ${branch} changes unexpected files: ${changed.join(", ")}`);
  }
  return changed[0];
}

async function finishSlot(result) {
  if (!slot) return;
  await changeDataOnMain(dataFiles, `Finish ${slot}`, () => updateSlot(slot, { status: "done", result }));
}

async function main() {
  const dry = isDryRun();
  const auto = isAutoPublish();
  const open = JSON.parse(gh("pr", "list", "--state", "open", "--limit", "50", "--json", "number,title,headRefName,isCrossRepository,author,labels,createdAt"));
  const [pr] = selectForPublishing(open, auto);

  if (!pr) {
    console.log("No article is ready to publish.");
    setOutputs({ merged: "false" });
    if (!dry) await finishSlot("nothing-to-publish");
    return;
  }
  if (dry) {
    console.log(`Test mode: would publish #${pr.number}: ${pr.title}`);
    addSummary(`Testlauf: Würde veröffentlichen: #${pr.number} ${pr.title}`);
    setOutputs({ merged: "false" });
    return;
  }

  git("fetch", "origin", "main", pr.headRefName);
  const file = articleFileIn(pr.headRefName);
  const text = git("show", `origin/${pr.headRefName}:${file}`);
  const article = parsePost(text);

  // People who set "approved" have reviewed the article, so only automatic posts are blocked here.
  const approved = labelNames(pr).includes("approved");
  const failures = approved ? [] : checkArticle(article, { ...config, publishedPosts: publishedPosts() });
  if (failures.length) {
    gh("pr", "edit", String(pr.number), "--remove-label", "passed", "--add-label", "needs-review");
    notify({ title: `Blog-Automatik: Veröffentlichung gestoppt: ${article.title}`, problem: true, body: `Die letzte Prüfung ist fehlgeschlagen:\n${failures.map((failure) => `- ${failure}`).join("\n")}\n\n#${pr.number}` });
    setOutputs({ merged: "false" });
    await finishSlot("blocked");
    return;
  }

  // The publish date is the day it goes live.
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: config.schedule.time_zone }).format(new Date());
  configureGit();
  git("checkout", "-f", "-B", pr.headRefName, `origin/${pr.headRefName}`);
  const dated = setDate(`${text}\n`, today);
  if (dated !== `${text}\n`) {
    fs.writeFileSync(fromRoot(file), dated);
    git("add", "--", file);
    git("commit", "-m", `Veröffentlichungsdatum: ${today}`);
    git("push", "origin", `HEAD:refs/heads/${pr.headRefName}`);
  }
  await retry(() => gh("pr", "merge", String(pr.number), "--squash", "--delete-branch"), { label: "Merge", delayMs: 5000 });

  await changeDataOnMain(dataFiles, `Published: ${article.slug}`, () => {
    const registry = load("registry");
    for (const post of registry.posts || []) if (post.slug === article.slug) post.status = "published";
    save("registry", registry);
    const calendar = load("calendar");
    for (const topic of calendar.topics || []) if (topic.slug === article.slug) topic.status = "published";
    save("calendar", calendar);
    logEvent({ type: "published", slot, title: article.title, slug: article.slug, category: article.category, pr: pr.number });
    updateSlot(slot, { status: "done", result: "published" });
  });

  // Required by Unsplash. A failure here must not undo the publication.
  const key = process.env.UNSPLASH_ACCESS_KEY;
  for (const image of [article.featured, ...(article.inlineImages || [])].filter((entry) => entry && entry.downloadLocation)) {
    try {
      await triggerDownload(image.downloadLocation, key);
    } catch (error) {
      console.warn(`Unsplash download trigger failed for ${image.id}: ${error.message}`);
    }
  }

  setOutputs({ merged: "true", url: `${config.site.url}/${article.slug}/` });
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
