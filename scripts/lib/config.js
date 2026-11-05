// Loads all settings from /config and the repository's data files.
const fs = require("node:fs");
const path = require("node:path");
const yaml = require("js-yaml");

const ROOT = process.env.BLOG_ROOT || path.resolve(__dirname, "../..");
const WORK = path.join(ROOT, ".work");

const fromRoot = (...parts) => path.join(ROOT, ...parts);
const loadYaml = (file) => yaml.load(fs.readFileSync(fromRoot(file), "utf8"));

function loadConfig() {
  return {
    site: loadYaml("config/site.yml"),
    content: loadYaml("config/content.yml"),
    schedule: loadYaml("config/schedule.yml"),
    rules: loadYaml("config/rules.yml"),
    analytics: loadYaml("config/analytics.yml"),
    facts: fs.readFileSync(fromRoot("config/facts.md"), "utf8"),
  };
}

function readJson(file, fallback) {
  const full = path.isAbsolute(file) ? file : fromRoot(file);
  if (!fs.existsSync(full)) return fallback;
  return JSON.parse(fs.readFileSync(full, "utf8"));
}

function writeJson(file, value) {
  const full = path.isAbsolute(file) ? file : fromRoot(file);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, `${JSON.stringify(value, null, 2)}\n`);
}

const work = (...parts) => path.join(WORK, ...parts);

// Passes values to later workflow steps.
function setOutputs(values) {
  const lines = Object.entries(values).map(([key, value]) => `${key}=${value}`);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join("\n")}\n`);
  else console.log(lines.join("\n"));
}

function addSummary(markdown) {
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
}

// Test mode unless DRY_RUN is explicitly "false".
function isDryRun(env = process.env) {
  if (env.DRY_RUN_INPUT === "true") return true;
  return env.DRY_RUN !== "false";
}

// Automatic publishing needs an explicit "true".
const isAutoPublish = (env = process.env) => env.AUTO_PUBLISH === "true";

module.exports = { ROOT, WORK, fromRoot, work, loadConfig, loadYaml, readJson, writeJson, setOutputs, addSummary, isDryRun, isAutoPublish };
