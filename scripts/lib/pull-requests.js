// Decides which Pull Requests may be published.
// The repository is public, so only the bot's own post/* branches can ever auto-merge.
const BOT_LOGINS = new Set(["app/github-actions", "github-actions[bot]", "github-actions"]);

function isBotPost(pr) {
  return String(pr.headRefName).startsWith("post/") && !pr.isCrossRepository && BOT_LOGINS.has(pr.author && pr.author.login);
}

function labelNames(pr) {
  return (pr.labels || []).map((label) => label.name);
}

// With AUTO_PUBLISH=true: "passed" posts. Always: posts labelled "approved" by someone with write access.
function selectForPublishing(prs, autoPublish) {
  const eligible = prs.filter(isBotPost).filter((pr) => {
    const labels = labelNames(pr);
    if (labels.includes("approved")) return true;
    if (labels.includes("needs-review")) return false;
    return autoPublish && labels.includes("passed");
  });
  return eligible.sort((a, b) => {
    const approved = Number(labelNames(b).includes("approved")) - Number(labelNames(a).includes("approved"));
    return approved || new Date(a.createdAt) - new Date(b.createdAt);
  });
}

function waitingDrafts(prs, autoPublish) {
  return prs.filter(isBotPost).filter((pr) => (autoPublish ? labelNames(pr).includes("passed") : true)).length;
}

module.exports = { isBotPost, selectForPublishing, waitingDrafts, labelNames };
