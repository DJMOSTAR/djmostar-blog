// Notifications are GitHub Issues that mention the account, so GitHub sends an email.
// The repository is public: never put keys or tokens in these messages.
//   blog-info     information, closed straight away
//   blog-failure  the automation stopped and needs a person; closed automatically once the
//                 next article is online
//   blog-problem  older problem notices (kept so existing Issues still show up)
const { gh } = require("./shell");

const LABELS = { "blog-info": "0E8A16", "blog-failure": "B60205", "blog-problem": "D93F0B", passed: "0E8A16", "needs-review": "D93F0B", approved: "1D76DB" };
const mentionOf = () => process.env.NOTIFY_USER || "DJMOSTAR";

function ensureLabels() {
  for (const [name, color] of Object.entries(LABELS)) {
    try {
      gh("label", "create", name, "--color", color, "--force");
    } catch (error) {
      console.warn(`Label ${name}: ${error.message}`);
    }
  }
}

function openIssues(label) {
  try {
    return JSON.parse(gh("issue", "list", "--label", label, "--state", "open", "--limit", "50", "--json", "number,title"));
  } catch (error) {
    console.warn(`Could not list Issues: ${error.message}`);
    return [];
  }
}

// Never fails the run: a failed notice is only logged.
function notify({ title, body, problem = false, mention = mentionOf() }) {
  try {
    ensureLabels();
    const url = gh("issue", "create", "--title", title.slice(0, 200), "--body", `@${mention}\n\n${body}`, "--label", problem ? "blog-failure" : "blog-info");
    if (!problem) gh("issue", "close", url);
    console.log(`Notification: ${url}`);
    return url;
  } catch (error) {
    console.error(`Notification failed: ${error.message}`);
    return null;
  }
}

// One open Issue per problem: the same stop again adds a comment instead of a new Issue.
function notifyStop({ title, body, close = false }) {
  const existing = close ? null : openIssues("blog-failure").find((issue) => issue.title === title.slice(0, 200));
  if (existing) {
    try {
      gh("issue", "comment", String(existing.number), "--body", `@${mentionOf()} Das ist erneut passiert.\n\n${body}`);
      console.log(`Notification added to #${existing.number}`);
      return `#${existing.number}`;
    } catch (error) {
      console.error(`Notification failed: ${error.message}`);
    }
  }
  const url = notify({ title, body, problem: true });
  // Test runs: the notice is sent, but closed so it doesn't look like a real open problem.
  if (url && close) {
    try {
      gh("issue", "close", url);
    } catch (error) {
      console.warn(`Could not close ${url}: ${error.message}`);
    }
  }
  return url;
}

// Once an article is online again, open problem notices are resolved.
// Token expiry warnings stay open, because publishing doesn't fix them.
function closeFailureIssues(comment) {
  const closed = [];
  for (const label of ["blog-failure", "blog-problem"]) {
    for (const issue of openIssues(label)) {
      if (/Token läuft/.test(issue.title) || closed.includes(issue.number)) continue;
      try {
        gh("issue", "comment", String(issue.number), "--body", comment);
        gh("issue", "close", String(issue.number));
        closed.push(issue.number);
      } catch (error) {
        console.warn(`Could not close #${issue.number}: ${error.message}`);
      }
    }
  }
  return closed;
}

module.exports = { notify, notifyStop, closeFailureIssues, ensureLabels };
