// Saves Claude's pick as the blog home's hero image, following the Unsplash rules.
const fs = require("node:fs");
const { work, readJson, fromRoot, setOutputs } = require("./lib/config");
const { FILES, load, save } = require("./lib/data");
const { triggerDownload } = require("./lib/unsplash");
const { changeDataOnMain } = require("./lib/shell");

const quote = (text) => JSON.stringify(String(text));

function heroBlock(image, alt) {
  return [
    "index_hero:",
    `  id: ${quote(image.id)}`,
    `  url: ${quote(image.url)}`,
    `  width: ${image.width}`,
    `  height: ${image.height}`,
    `  alt: ${quote(alt)}`,
    `  photographer: ${quote(image.photographer)}`,
    `  photographerUrl: ${quote(image.photographerUrl)}`,
  ].join("\n");
}

function replaceHero(text, block) {
  const pattern = /^index_hero:.*(?:\n[ \t]+.*)*/m;
  if (!pattern.test(text)) throw new Error("config/site.yml has no index_hero entry");
  return text.replace(pattern, block);
}

async function main() {
  const candidates = readJson(work("hero-candidates.json"));
  const pick = readJson(work("out-hero.json"), null);
  if (!pick) throw new Error("Claude returned no choice. Run the workflow again later.");
  const image = candidates[pick.id];
  if (!image) throw new Error(`Claude picked an unknown photo: ${pick.id}`);
  const alt = String(pick.alt || "").trim();
  if (alt.length < 10 || /mostar|\bMo\b/i.test(alt)) throw new Error("The alt text is missing or names DJ MOSTAR");

  await changeDataOnMain(["config/site.yml", FILES.images], "Set the blog hero image", () => {
    const file = fromRoot("config/site.yml");
    fs.writeFileSync(file, replaceHero(fs.readFileSync(file, "utf8"), heroBlock(image, alt)));
    const images = load("images");
    images.ids = [...new Set([...(images.ids || []), image.id])];
    save("images", images);
  });
  try {
    await triggerDownload(image.downloadLocation, process.env.UNSPLASH_ACCESS_KEY);
  } catch (error) {
    console.warn(`Unsplash download trigger failed: ${error.message}`);
  }
  console.log(`Hero image set: ${image.id} by ${image.photographer}`);
  setOutputs({ changed: "true" });
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}

module.exports = { heroBlock, replaceHero };
