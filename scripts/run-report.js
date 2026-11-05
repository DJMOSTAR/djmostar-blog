// Monthly Search Console report. Does nothing until GSC_SERVICE_ACCOUNT_JSON exists.
const fs = require("node:fs");
const { loadConfig, readJson, writeJson, fromRoot } = require("./lib/config");
const gsc = require("./lib/gsc");
const { load } = require("./lib/data");
const { changeDataOnMain } = require("./lib/shell");
const { notify } = require("./lib/notify");

async function main() {
  if (!gsc.isEnabled()) {
    console.log("Search Console is off: the secret GSC_SERVICE_ACCOUNT_JSON does not exist.");
    return;
  }
  const { analytics } = loadConfig();
  const cfg = analytics.search_console;
  const range = gsc.previousMonth(new Date());
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
  const report = gsc.buildReport({ label: range.label, pages, keywords, previous: history.keywords, cfg });
  const file = `reports/${range.label}.md`;
  await changeDataOnMain([file, "data/gsc-history.json"], `Monthly report ${range.label}`, () => {
    fs.mkdirSync(fromRoot("reports"), { recursive: true });
    fs.writeFileSync(fromRoot(file), report);
    writeJson("data/gsc-history.json", { keywords: Object.fromEntries(keywords.filter((keyword) => keyword.position != null).map((keyword) => [keyword.name, keyword.position])) });
  });
  notify({ title: `Blog-Bericht ${range.label}`, body: report.slice(0, 60000) });
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
