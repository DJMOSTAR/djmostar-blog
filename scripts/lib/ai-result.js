// Understands why a Claude step failed. Used to choose between retrying and alerting.
const fs = require("node:fs");

function classify(message) {
  const text = String(message || "");
  if (/usage limit|limit reached|hit your|rate.?limit|too many requests|\b429\b|\b529\b|overloaded|quota|credit balance|billing/i.test(text)) return "limit";
  if (/authentication|unauthori[sz]ed|invalid.{0,20}(token|api.?key)|\b401\b|oauth|token.{0,20}expired|login expired|please run \/login/i.test(text)) return "auth";
  return "other";
}

// The action's execution file is a list of messages. The last result holds the outcome.
function readExecution(file) {
  if (!file || !fs.existsSync(file)) return { message: "", usage: null };
  try {
    const entries = JSON.parse(fs.readFileSync(file, "utf8"));
    const result = [...entries].reverse().find((entry) => entry.type === "result") || {};
    const errors = Array.isArray(result.errors) ? result.errors.join(" ") : "";
    return {
      message: [result.subtype, result.is_error ? result.result : "", errors].filter(Boolean).join(" "),
      usage: result.usage ? { turns: result.num_turns, inputTokens: result.usage.input_tokens, outputTokens: result.usage.output_tokens } : null,
    };
  } catch {
    return { message: "", usage: null };
  }
}

module.exports = { classify, readExecution };
