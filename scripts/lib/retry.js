// Retries. retry() is a quick retry for small hiccups. retryStep() waits 2, 5 and 15 minutes
// (config/schedule.yml) and logs each retry, so the run summary and the monthly report show it.
const fs = require("node:fs");
const path = require("node:path");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function retry(task, { attempts = 3, delayMs = 2000, label = "Task" } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await task(attempt);
    } catch (error) {
      lastError = error;
      console.warn(`${label}: attempt ${attempt} of ${attempts} failed: ${error.message}`);
      if (attempt < attempts) await sleep(delayMs * 2 ** (attempt - 1));
    }
  }
  throw lastError;
}

// RETRY_SCALE shortens the waits in tests (0 = no waiting).
const waitMs = (minutes, env = process.env) => minutes * 60000 * Number(env.RETRY_SCALE ?? 1);

function logStepRetry(entry) {
  const { work, readJson, writeJson } = require("./config");
  const file = work("step-retries.json");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  writeJson(file, [...readJson(file, []), { at: new Date().toISOString(), ...entry }]);
}

// Runs a step again after each wait. Throws the last error when every try failed.
async function retryStep(task, label, waits) {
  const minutes = waits || require("./config").loadConfig().schedule.retries.wait_minutes;
  for (let index = 0; ; index += 1) {
    try {
      return await task(index + 1);
    } catch (error) {
      if (index >= minutes.length) throw error;
      const message = String(error.message || error).slice(0, 200);
      console.warn(`${label}: try ${index + 1} failed (${message}). Retrying in ${minutes[index]} min.`);
      logStepRetry({ step: label, try: index + 1, kind: "step", message, waitMinutes: minutes[index] });
      await sleep(waitMs(minutes[index]));
    }
  }
}

module.exports = { retry, retryStep, sleep, waitMs, logStepRetry };
