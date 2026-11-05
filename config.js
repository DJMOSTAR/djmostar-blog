// Reads the YAML files in /config.
const fs = require("node:fs");
const path = require("node:path");
const yaml = require("js-yaml");

const ROOT = path.resolve(__dirname, "../..");

function loadYaml(relativePath) {
  return yaml.load(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
}

module.exports = { loadYaml };
