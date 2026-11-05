// Notifications are GitHub Issues that mention the account, so GitHub sends an email.
// The repository is public: never put keys or tokens in these messages.
const { gh } = require("./shell");

const LABELS = { "blog-info": "0E8A16", "blog-problem": "B60205", passed: "0E8A16", "needs-review": "D93F0B", approved: "1D76DB" };

function ensureLabels() {
  for (const [name, color] of Object.entries(LABELS)) {
    try {
      gh("label", "create", name, "--color", color, "--force");
    } catch (error) {
      console.warn(`Label ${name}: ${error.message}`);
    }
  }
}

// Never fails the run: a failed notice is only logged.
function notify({ title, body, problem = false, mention = process.env.NOTIFY_USER || "DJMOSTAR" }) {
  try {
    ensureLabels();
    const url = gh("issue", "create", "--title", title.slice(0, 200), "--body", `@${mention}\n\n${body}`, "--label", problem ? "blog-problem" : "blog-info");
    if (!problem) gh("issue", "close", url);
    console.log(`Notification: ${url}`);
    return url;
  } catch (error) {
    console.error(`Notification failed: ${error.message}`);
    return null;
  }
}

module.exports = { notify, ensureLabels };
