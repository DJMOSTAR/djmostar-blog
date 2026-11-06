const test = require("node:test");
const assert = require("node:assert");
const yaml = require("js-yaml");
const fs = require("node:fs");
const path = require("node:path");
const { heroBlock, replaceHero } = require("../../scripts/hero-finish");

test("the hero entry in site.yml is replaced and stays valid", () => {
  const original = fs.readFileSync(path.join(__dirname, "../../config/site.yml"), "utf8");
  const image = { id: "abc", url: "https://images.unsplash.com/photo-1?ixid=x", width: 4000, height: 2600, photographer: 'Ana "Lu"', photographerUrl: "https://unsplash.com/@ana" };
  const once = replaceHero(original, heroBlock(image, "Bunte Lichter über einer Tanzfläche"));
  const twice = replaceHero(once, heroBlock({ ...image, id: "def" }, "Mischpult im Bühnenlicht"));
  const parsed = yaml.load(twice);
  assert.strictEqual(parsed.index_hero.id, "def");
  assert.strictEqual(parsed.index_hero.photographer, 'Ana "Lu"');
  assert.strictEqual(parsed.ai_note.enabled, false);
  assert.strictEqual(parsed.posts_per_page, yaml.load(original).posts_per_page);
  assert.strictEqual((twice.match(/^index_hero:/gm) || []).length, 1);
});
