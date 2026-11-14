// Saves a Claude step's result, or works out why it failed and whether to try the step again.
// Only a complete, valid result is kept, and nothing about the article is printed to the public logs.
const fs = require("node:fs");
const { loadConfig, work, readJson, writeJson, setOutputs } = require("./lib/config");
const { classify, readExecution } = require("./lib/ai-result");
const { logStepRetry } = require("./lib/retry");

const { STEP_NAME, STEP_OUTCOME, STRUCTURED_OUTPUT, EXECUTION_FILE, OUTPUT_FILE, SIMULATED_MESSAGE } = process.env;
const tryNumber = Number(process.env.TRY || 1);
const waits = loadConfig().schedule.retries.wait_minutes;
const execution = SIMULATED_MESSAGE ? { message: SIMULATED_MESSAGE, usage: null } : readExecution(EXECUTION_FILE);
const outcome = SIMULATED_MESSAGE ? "failure" : STEP_OUTCOME;
const log = readJson(work("ai-log.json"), []);
const entry = { step: STEP_NAME, try: tryNumber, outcome, usage: execution.usage, simulated: Boolean(SIMULATED_MESSAGE) || undefined };

let saved = false;
if (outcome === "success") {
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

let again = false;
if (!saved) {
  // A successful run without a usable result is an invalid answer, whatever the message says.
  entry.kind = outcome === "success" ? "invalid" : classify(execution.message);
  entry.message = (execution.message || entry.error || "Claude step failed").slice(0, 300);
  // Only temporary or unknown errors are retried here. A limit pauses the run, a sign-in problem stops it.
  again = ["temporary", "other"].includes(entry.kind) && tryNumber <= waits.length;
  if (again) {
    entry.retryInMinutes = waits[tryNumber - 1];
    logStepRetry({ step: STEP_NAME, try: tryNumber, kind: entry.kind, message: entry.message, waitMinutes: entry.retryInMinutes });
  }
  console.warn(`${STEP_NAME} try ${tryNumber}: ${entry.kind}: ${entry.message}${again ? ` (retry in ${entry.retryInMinutes} min)` : ""}`);
}
writeJson(work("ai-log.json"), [...log, entry]);
const scale = Number(process.env.RETRY_SCALE ?? 1);
setOutputs({ ok: String(saved), kind: entry.kind || "ok", retry: String(again), wait_seconds: again ? Math.round(entry.retryInMinutes * 60 * scale) : 0 });
