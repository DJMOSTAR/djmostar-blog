// Saves a Claude step's result. Only a complete, valid result is kept, and nothing about
// the article is printed to the public logs.
const fs = require("node:fs");
const { work, readJson, writeJson, setOutputs } = require("./lib/config");
const { classify, readExecution } = require("./lib/ai-result");

const { STEP_NAME, STEP_OUTCOME, STRUCTURED_OUTPUT, EXECUTION_FILE, OUTPUT_FILE } = process.env;
const execution = readExecution(EXECUTION_FILE);
const log = readJson(work("ai-log.json"), []);
const entry = { step: STEP_NAME, outcome: STEP_OUTCOME, usage: execution.usage };

let saved = false;
if (STEP_OUTCOME === "success") {
  try {
    const parsed = JSON.parse(STRUCTURED_OUTPUT || "");
    if (parsed && typeof parsed === "object") {
      fs.mkdirSync(work(), { recursive: true });
      fs.writeFileSync(OUTPUT_FILE, JSON.stringify(parsed, null, 2));
      saved = true;
    }
  } catch {
    entry.error = "Claude returned no valid result";
  }
}
if (!saved) {
  entry.kind = classify(execution.message);
  entry.message = execution.message.slice(0, 300) || entry.error || "Claude step failed";
  console.warn(`${STEP_NAME}: ${entry.kind}: ${entry.message}`);
}
writeJson(work("ai-log.json"), [...log, entry]);
setOutputs({ ok: String(saved) });
