// Runs a task up to 3 times, waiting longer after each failure.
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

module.exports = { retry, sleep };
