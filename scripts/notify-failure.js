// Runs when a workflow crashes unexpectedly.
const { notify } = require("./lib/notify");

const { WORKFLOW_NAME, RUN_URL, SLOT } = process.env;
notify({ title: `Blog-Automatik: ${WORKFLOW_NAME} fehlgeschlagen`, problem: true, body: `Der Lauf ist unerwartet abgebrochen. Es wurde nichts Unfertiges veröffentlicht.\n\nSlot: ${SLOT || "manuell"}\n\n${RUN_URL}` });
