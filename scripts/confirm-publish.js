// After the deploy: checks that the article is really online, sends the notice, and closes
// open problem Issues with a link to the new article. Deploy retries are logged, not reported.
const { notify, notifyStop, closeFailureIssues } = require("./lib/notify");
const { sleep } = require("./lib/retry");
const { addSummary } = require("./lib/config");
const { FILES, logEvent } = require("./lib/data");
const { changeDataOnMain } = require("./lib/shell");

const { POST_URL, RUN_URL, SIMULATED, SLOT } = process.env;
const results = String(process.env.DEPLOY_RESULTS || process.env.DEPLOY_RESULT || "").split(",").map((entry) => entry.trim());
const succeeded = results.indexOf("success");
const tries = results.filter((entry) => ["success", "failure", "cancelled"].includes(entry)).length;

async function isOnline(url, attempts = Number(process.env.ONLINE_CHECKS || 15)) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (response.ok) return true;
    } catch (error) {
      console.warn(`Not online yet: ${error.message}`);
    }
    await sleep(Number(process.env.ONLINE_WAIT_MS ?? 20000));
  }
  return false;
}

const retryText = () => (succeeded > 0 ? `Deploy ${succeeded}-mal fehlgeschlagen, beim ${succeeded + 1}. Versuch erfolgreich.` : "Deploy beim ersten Versuch erfolgreich.");

async function logDeployRetries() {
  if (succeeded <= 0 && succeeded !== -1) return;
  try {
    await changeDataOnMain([FILES.log], "Log deploy retries", () => {
      logEvent({ type: "retries", slot: SLOT || "", outcome: succeeded === -1 ? "stopped" : "deployed", attempts: 0, failedAttempts: 0, stepRetries: succeeded === -1 ? tries - 1 : succeeded, reasons: ["Deploy fehlgeschlagen"] });
    });
  } catch (error) {
    console.warn(`Could not log the deploy retries: ${error.message}`);
  }
}

async function main() {
  if (SIMULATED === "true") {
    const online = succeeded >= 0 && (await isOnline(POST_URL, 3));
    const ok = succeeded > 0 && online;
    const text = `Ergebnis der Deploys: ${results.join(", ")}\n\n${retryText()}\n\nClaude wurde nicht aufgerufen, und es wurde nichts zusammengeführt.\n\nSeite erreichbar: ${online ? "ja" : "nein"} (${POST_URL})`;
    addSummary(`# Testlauf: Deploy-Fehler simuliert\n\n${ok ? "**Bestanden:** Der Deploy wurde automatisch wiederholt." : "**Nicht wie erwartet.**"}\n\n${text}`);
    notify({ title: `Testlauf: Deploy-Wiederholung ${ok ? "funktioniert" : "nicht wie erwartet"}`, body: `${text}\n\n${RUN_URL}` });
    if (!ok) process.exit(1);
    return;
  }
  if (succeeded === -1) {
    await logDeployRetries();
    notifyStop({
      title: "Blog-Automatik gestoppt: Deploy fehlgeschlagen",
      body: [
        `**Was passiert ist:** Der Artikel ist zusammengeführt, aber die Seite konnte nicht veröffentlicht werden. Ergebnis der Deploys: ${results.join(", ")}.`,
        "",
        "**Was versucht wurde:**",
        `- Deploy ${tries}-mal, mit Wartezeiten von 2, 5 und 15 Minuten. Claude wurde dafür nicht erneut aufgerufen.`,
        "",
        "**Was zu tun ist:**",
        "1. Auf https://www.githubstatus.com prüfen, ob GitHub Pages eine Störung hat.",
        "2. **Actions → Deploy site → Run workflow** starten. Das veröffentlicht den schon zusammengeführten Artikel.",
        "3. Wenn der Deploy wieder rot ist, schick mir den Link zu diesem Issue.",
        "",
        `Artikel: ${POST_URL}`,
        `Lauf: ${RUN_URL}`,
      ].join("\n"),
    });
    process.exit(1);
  }
  if (succeeded > 0) {
    addSummary(`## Wiederholungen\n\n${retryText()}`);
    await logDeployRetries();
  }
  if (await isOnline(POST_URL)) {
    notify({ title: `Neuer Beitrag online: ${POST_URL}`, body: `Der Beitrag ist online:\n\n${POST_URL}` });
    const closed = closeFailureIssues(`Erledigt: Der nächste Beitrag ist online.\n\n${POST_URL}`);
    if (closed.length) console.log(`Closed problem Issues: ${closed.map((number) => `#${number}`).join(", ")}`);
    return;
  }
  notifyStop({ title: "Blog-Automatik: Beitrag ist nicht erreichbar", body: `**Was passiert ist:** Der Deploy war erfolgreich, aber die Adresse antwortet nicht.\n\n**Was zu tun ist:**\n1. Prüfe die Domain-Einstellungen in **Settings → Pages** (Custom domain, Enforce HTTPS).\n2. Wenn dort alles grün ist, schick mir den Link zu diesem Issue.\n\n${POST_URL}\n\n${RUN_URL}` });
  process.exit(1);
}

main();
