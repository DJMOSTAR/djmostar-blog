// Test runs only: fakes one Claude failure so the retry handling can be checked without waiting
// for a real outage. "503" fakes a busy server once, "auth" fakes a rejected token.
const fs = require("node:fs");
const { work, setOutputs } = require("./lib/config");

const { SIMULATE, STEP_NAME } = process.env;
const messages = {
  503: "API Error: 503 Service Unavailable (simulated)",
  auth: "API Error: 401 authentication_error: Invalid bearer token (simulated)",
};
const marker = work("simulated");
let message = "";
if (messages[SIMULATE] && /^(writer|editor)-/.test(STEP_NAME || "") && !fs.existsSync(marker)) {
  fs.mkdirSync(work(), { recursive: true });
  fs.writeFileSync(marker, SIMULATE);
  message = messages[SIMULATE];
  console.log(`Simulating a failure for ${STEP_NAME}: ${message}`);
}
setOutputs({ message });
