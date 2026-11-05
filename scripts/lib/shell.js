// Runs git and gh without a shell, so text from articles can't run as a command.
const { execFileSync } = require("node:child_process");
const { ROOT } = require("./config");
const { retry } = require("./retry");

function run(command, args, options = {}) {
  return execFileSync(command, args, { cwd: ROOT, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], maxBuffer: 50 * 1024 * 1024, ...options }).trim();
}

const git = (...args) => run("git", args);
const gh = (...args) => run("gh", args);

function configureGit() {
  git("config", "user.name", "github-actions[bot]");
  git("config", "user.email", "41898282+github-actions[bot]@users.noreply.github.com");
}

// Changes data files on main. If another run pushed first, the change is made again on the
// newest version, so two runs can't overwrite each other's data.
async function changeDataOnMain(files, message, change) {
  configureGit();
  return retry(async () => {
    git("fetch", "origin", "main");
    git("checkout", "-f", "-B", "main", "origin/main");
    await change();
    git("add", "--", ...files);
    if (!git("status", "--porcelain", "--", ...files)) return false;
    git("commit", "-m", message);
    git("push", "origin", "HEAD:main");
    return true;
  }, { label: "Push to main" });
}

module.exports = { run, git, gh, configureGit, changeDataOnMain };
