// Understands why a Claude step failed, so the run can choose what to do:
//   auth       sign-in problem: stop at once, a retry can't fix it
//   limit      usage or rate limit: pause and check again every hour
//   temporary  timeout, network or server error: wait and retry the same step
//   invalid    empty, cut-off or invalid result: counts as a failed article attempt
//   other      unknown: treated like a temporary error
const fs = require("node:fs");

function classify(message) {
  const text = String(message || "");
  if (/authenticat|unauthori[sz]ed|invalid.{0,20}(token|api.?key|bearer|x-api-key)|\b40[13]\b|forbidden|oauth|token.{0,20}(expired|revoked)|login expired|please run \/login|does not have access|no active subscription/i.test(text)) return "auth";
  if (/usage limit|limit reached|hit your( usage)? limit|rate.?limit|too many requests|\b429\b|quota|credit balance|billing/i.test(text)) return "limit";
  if (/\b5\d\d\b|overloaded|server error|service unavailable|bad gateway|gateway timeout|time(?:d ?| ?)out|ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|socket hang up|network|fetch failed|api_error/i.test(text)) return "temporary";
  if (/error_max_turns|max.?turns|structured.?output|no valid result|invalid json|unexpected end of json|did not return/i.test(text)) return "invalid";
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
