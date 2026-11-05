// After the deploy: checks that the article is really online, then sends the notice.
const { notify } = require("./lib/notify");
const { sleep } = require("./lib/retry");

const { POST_URL, DEPLOY_RESULT, RUN_URL } = process.env;

async function isOnline(url) {
  for (let attempt = 0; attempt < 15; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (response.ok) return true;
    } catch (error) {
      console.warn(`Not online yet: ${error.message}`);
    }
    await sleep(20000);
  }
  return false;
}

async function main() {
  if (DEPLOY_RESULT !== "success") {
    notify({ title: "Blog-Automatik: Deploy fehlgeschlagen", problem: true, body: `Der Artikel wurde zusammengeführt, aber nicht veröffentlicht.\n\n${POST_URL}\n\n${RUN_URL}` });
    process.exit(1);
  }
  if (await isOnline(POST_URL)) {
    notify({ title: `Neuer Beitrag online: ${POST_URL}`, body: `Der Beitrag ist online:\n\n${POST_URL}` });
    return;
  }
  notify({ title: "Blog-Automatik: Beitrag ist nicht erreichbar", problem: true, body: `Der Deploy war erfolgreich, aber die Adresse antwortet nicht. Prüfe die Domain-Einstellungen in Settings → Pages.\n\n${POST_URL}\n\n${RUN_URL}` });
  process.exit(1);
}

main();
