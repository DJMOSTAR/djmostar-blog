const test = require("node:test");
const assert = require("node:assert");
const { renderPost, parsePost, setDate } = require("../../scripts/lib/postfile");
const { checkArticle } = require("../../scripts/lib/rules");
const { slugify, wordCount, visibleText } = require("../../scripts/lib/text");
const { goodArticle, context } = require("./support");

const image = (id) => ({ id, url: `https://images.unsplash.com/photo-${id}?ixid=abc`, width: 2400, height: 1600, photographer: 'Ana "Lu" <X>', photographerUrl: `https://unsplash.com/@${id}`, downloadLocation: `https://api.unsplash.com/photos/${id}/download` });
const images = { img1: image("img1"), img2: image("img2") };

test("slugs have no umlauts", () => {
  assert.strictEqual(slugify("Für Größe & Müßiggang: Hochzeits DJ"), "fuer-groesse-muessiggang-hochzeits-dj");
});
test("the visible text leaves out URLs and tags", () => {
  assert.strictEqual(visibleText("[Hochzeits DJ](https://x.de/hochzeits-dj)").trim(), "Hochzeits DJ");
  assert.strictEqual(wordCount("Eins [zwei](https://x.de/a-b) drei"), 3);
});
test("a rendered post can be read back and still passes the rules", () => {
  const text = renderPost(goodArticle(), images, { date: "2026-11-10" });
  const parsed = parsePost(text);
  assert.strictEqual(parsed.title, goodArticle().title);
  assert.strictEqual(parsed.featured.photographerUrl, "https://unsplash.com/@img1");
  assert.ok(parsed.body.includes("<figure"));
  assert.ok(!parsed.body.includes("[[BILD:"));
  assert.ok(parsed.body.includes("utm_source=djmostar_blog"));
  assert.ok(parsed.body.includes('Ana &quot;Lu&quot; &lt;X&gt;'));
  assert.strictEqual(parsed.searchVolume, "unknown");
  assert.deepStrictEqual(checkArticle(parsed, context()), []);
});
test("the publish date can be updated", () => {
  const text = renderPost(goodArticle(), images, { date: "2026-11-10" });
  const updated = setDate(text, "2026-11-13");
  assert.match(updated, /^date: 2026-11-13$/m);
});
test("an unknown image stops the build instead of publishing a gap", () => {
  assert.throws(() => renderPost(goodArticle(), { img1: images.img1 }, { date: "2026-11-10" }), /Unknown inline image/);
  assert.throws(() => renderPost(goodArticle({ inlineImages: [] }), images, { date: "2026-11-10" }), /marker/);
});
