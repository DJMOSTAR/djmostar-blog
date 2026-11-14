// Runs every hour. Starts generate, publish or report when config/schedule.yml says a slot is due.
const { loadConfig, isDryRun } = require("./lib/config");
const { decide, tokenWarning } = require("./lib/scheduler");
const { FILES, load, save } = require("./lib/data");
const { gh, changeDataOnMain } = require("./lib/shell");
const { retry } = require("./lib/retry");
const { notify } = require("./lib/notify");

async function main() {
  const now = new Date();
  const { schedule } = loadConfig();

  // Test mode: nothing runs on a schedule, so test runs are only started by hand.
  if (isDryRun()) {
    console.log("DRY_RUN is on: scheduled runs are paused. Set DRY_RUN=false to go live.");
    return;
  }

  const first = decide(now, schedule, load("slots"));
  const warning = tokenWarning(process.env.CLAUDE_TOKEN_CREATED, now, schedule.token_warning_days, load("slots").tokenWarnedFor);

  if (first.actions.length === 0 && !warning) {
    console.log("Nothing is due.");
    return;
  }

  // Saved first, so a slot can't start twice. Worked out again on the newest data.
  let actions = [];
  await changeDataOnMain([FILES.slots], "Update the schedule state", () => {
    const result = decide(now, schedule, load("slots"));
    actions = result.actions;
    save("slots", warning ? { ...result.state, tokenWarnedFor: process.env.CLAUDE_TOKEN_CREATED } : result.state);
  });

  if (warning) {
    notify({ title: `Claude-Token läuft in ${warning.daysLeft} Tagen ab`, problem: true, body: `Der Token läuft am ${warning.expires} ab. Erstelle mit \`claude setup-token\` einen neuen, aktualisiere das Secret \`CLAUDE_CODE_OAUTH_TOKEN\` und die Variable \`CLAUDE_TOKEN_CREATED\`.` });
  }

  for (const action of actions) {
    try {
      const fields = action.workflow === "report" ? [] : ["-f", `slot=${action.slot}`];
      // The form's test-run box is ticked by default for manual runs, so scheduled runs must untick it.
      if (action.workflow === "generate") fields.push("-f", `limit_retry=${action.limitRetry}`, "-f", "dry_run=false");
      await retry(() => gh("workflow", "run", `${action.workflow}.yml`, "--ref", "main", ...fields), { label: `Start ${action.workflow}` });
      console.log(`Started ${action.workflow} for ${action.slot}`);
    } catch (error) {
      notify({ title: `Blog-Automatik: ${action.workflow} konnte nicht starten`, problem: true, body: `Slot: ${action.slot}\n\n${error.message}` });
    }
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
