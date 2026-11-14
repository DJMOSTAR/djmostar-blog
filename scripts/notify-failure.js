// Runs when a workflow crashes. A crash is a fault in the code or the settings, which fails the
// same way on every run, so nothing is retried: one Issue explains it.
const fs = require("node:fs");
const path = require("node:path");
const { notifyStop } = require("./lib/notify");

const { WORKFLOW_NAME, RUN_URL, SLOT } = process.env;
const crashFile = path.join(__dirname, "..", ".work", "crash.txt");
const reason = fs.existsSync(crashFile) ? fs.readFileSync(crashFile, "utf8").trim() : "Der Lauf ist mit einem Fehler im Code oder in den Einstellungen abgebrochen.";

notifyStop({
  title: `Blog-Automatik gestoppt: ${WORKFLOW_NAME} abgebrochen`,
  body: [
    `**Was passiert ist:** ${reason} Ein erneuter Versuch würde genauso abbrechen, deshalb wurde nicht wiederholt. Es wurde nichts Unfertiges veröffentlicht.`,
    "",
    "**Was zu tun ist:**",
    "1. Wenn du gerade etwas im Repository geändert hast (zum Beispiel eine Datei in `config/`), mach diese Änderung rückgängig.",
    "2. Sonst schick mir den Link zu diesem Issue.",
    "3. Danach den Lauf erneut starten: **Actions** → den Workflow öffnen → **Run workflow**.",
    "",
    `Termin: ${SLOT || "manuell"}`,
    `Lauf: ${RUN_URL}`,
  ].join("\n"),
});
