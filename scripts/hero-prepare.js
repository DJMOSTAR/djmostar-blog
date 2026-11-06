// Finds candidate photos for the blog home's hero image. Claude then picks one and writes the alt text.
const fs = require("node:fs");
const { work, writeJson, setOutputs } = require("./lib/config");
const { usedImageIds } = require("./lib/data");
const { searchPhotos, toCandidate, downloadThumb } = require("./lib/unsplash");

const QUERIES = (process.env.HERO_QUERY || "DJ party lights|wedding dance floor lights|dj mixer stage lights").split("|").map((query) => query.trim()).filter(Boolean);

async function main() {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) throw new Error("The secret UNSPLASH_ACCESS_KEY is missing");
  fs.mkdirSync(work("images"), { recursive: true });
  const used = usedImageIds();
  const candidates = {};
  for (const query of QUERIES) {
    for (const photo of await searchPhotos(query, key)) {
      if (used.has(photo.id) || candidates[photo.id] || photo.width < 2000 || photo.width < photo.height * 1.3) continue;
      candidates[photo.id] = toCandidate(photo);
      if (Object.keys(candidates).length >= 8) break;
    }
    if (Object.keys(candidates).length >= 8) break;
  }
  if (Object.keys(candidates).length === 0) throw new Error("No suitable landscape photo found on Unsplash");
  for (const candidate of Object.values(candidates)) {
    fs.writeFileSync(work("images", `${candidate.id}.jpg`), await downloadThumb(candidate.thumb));
    candidate.file = `.work/images/${candidate.id}.jpg`;
  }
  writeJson(work("hero-candidates.json"), candidates);
  writeJson(work("schema-hero.json"), {
    type: "object",
    properties: { id: { type: "string" }, alt: { type: "string" } },
    required: ["id", "alt"],
    additionalProperties: false,
  });
  const list = Object.values(candidates).map((image) => `- id \`${image.id}\`: Datei \`${image.file}\``).join("\n");
  fs.writeFileSync(work("prompt-hero.md"), `Wähle ein Hintergrundbild für den oberen Bereich der Startseite des Blogs von DJ MOSTAR, einem Hochzeits DJ und Firmenevent-DJ in Hamburg. Über dem Bild liegen eine dunkle Abdeckung und weißer Text.

Die Bildbeschreibungen der Quelle sind nicht enthalten. Sieh dir jede Datei mit dem Read-Werkzeug an.

${list}

Wähle das Bild, das am besten passt:
- Stimmung von Party, Tanzfläche, DJ, Licht oder Hochzeitsfeier
- keine gut lesbaren Logos, Markennamen oder Texte
- keine Person groß und klar erkennbar im Mittelpunkt
- wirkt auch dunkel abgedeckt noch gut

Schreibe dazu einen deutschen Alt-Text, der genau beschreibt, was zu sehen ist. Behaupte nicht, das Foto zeige DJ MOSTAR, Mo oder eine bestimmte reale Feier, und nenne keine Namen.
`);
  setOutputs({ ready: "true" });
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
