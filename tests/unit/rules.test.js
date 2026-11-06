const test = require("node:test");
const assert = require("node:assert");
const { checkArticle, checkOriginality, checkAddressForm, checkLiveLinks } = require("../../scripts/lib/rules");
const { goodArticle, context, content } = require("./support");

const failuresFor = (overrides, extra) => checkArticle(goodArticle(overrides), context(extra));
const addToBody = (text) => ({ body: `${goodArticle().body}\n\n${text}` });

test("a good article passes every hard rule", () => {
  assert.deepStrictEqual(failuresFor({}), []);
});

for (const [name, text, expected] of [
  ["hyphenated Hochzeits-DJ", "Euer Hochzeits-DJ spielt.", /Bindestrich/],
  ["en dash Hochzeits–DJ", "Euer Hochzeits–DJ spielt.", /Bindestrich/],
  ["Paket", "Das Komplettpaket passt.", /Paket/],
  ["price in euro", "Das kostet ab 500 Euro.", /Preisangabe/],
  ["euro sign", "Das kostet 500 €.", /Preisangabe/],
  ["MwSt", "Alles zzgl. MwSt. dazu.", /Umsatzsteuer/],
  ["clock time", "Der Tanz beginnt um 21:30 Uhr.", /Uhrzeit/],
  ["hour only", "Das Dinner beginnt um 18 Uhr.", /Uhrzeit/],
  ["forbidden phrase", "Das schafft unvergessliche Momente.", /unvergessliche Momente/],
  ["eintauchen", "Lasst uns eintauchen.", /eintauchen/],
  ["Halay", "Auch Halay gehört dazu.", /Halay/],
  ["Samstage", "Für Samstage im Sommer früher buchen.", /Samstage/],
  ["questionnaire", "Ihr füllt den Musikbogen aus.", /Musikbogen/],
  ["statistic without a source", "80 Prozent aller Paare buchen früh.", /Statistik/],
  ["invented business number", "Ich habe schon 500 Hochzeiten begleitet.", /nicht freigegeben/],
  ["second nicht nur", "Das ist nicht nur gut. Das ist nicht nur schön.", /nicht nur/],
]) {
  test(`blocks ${name}`, () => {
    assert.ok(failuresFor(addToBody(text)).some((failure) => expected.test(failure)), failuresFor(addToBody(text)).join("; "));
  });
}

test("allows approved numbers and a slug with a hyphen", () => {
  assert.deepStrictEqual(failuresFor({ ...addToBody("Mit über 10 Jahren Erfahrung und Technik für 250 Gäste."), slug: "hochzeits-dj-hamburg-buchen" }), []);
});

test("blocks length, heading, FAQ and keyword problems", () => {
  assert.ok(failuresFor({ seoTitle: "x".repeat(61) }).some((f) => /SEO-Titel/.test(f)));
  assert.ok(failuresFor({ description: "zu kurz" }).some((f) => /Meta-Beschreibung/.test(f)));
  assert.ok(failuresFor({ slug: "Hochzeit-Überblick" }).some((f) => /Slug/.test(f)));
  assert.ok(failuresFor(addToBody("# Zweite H1")).some((f) => /H1/.test(f)));
  assert.ok(failuresFor({ faq: [] }).some((f) => /FAQ/.test(f)));
  assert.ok(failuresFor({ primaryKeyword: "Firmenfeier Berlin" }).some((f) => /Hauptkeyword/.test(f)));
  assert.ok(failuresFor({ body: "Kurz.\n\n## A\n\n## B" }).some((f) => /Länge/.test(f)));
  assert.ok(failuresFor({ body: `Was macht einen guten DJ aus?\n\n${goodArticle().body}` }).some((f) => /rhetorische Frage/.test(f)));
});

test("requires a ranking keyword for the category", () => {
  const without = goodArticle().body.replace(/Hochzeits DJ in Hamburg/g, "DJ");
  assert.ok(failuresFor({ body: without, title: "Wann sollte man buchen?", primaryKeyword: "buchen", faq: goodArticle().faq }).some((f) => /Ranking-Keyword/.test(f)));
  assert.ok(!failuresFor({}).some((f) => /Ranking-Keyword/.test(f)));
});

test("blocks missing or wrong links", () => {
  const body = goodArticle().body;
  assert.ok(failuresFor({ body: body.replace("(https://djmostar.de/hochzeit)", "(https://djmostar.de/firmenfeier)") }).some((f) => /Anfrageseite/.test(f)));
  assert.ok(failuresFor({ body: body.replace("[Startseite](https://djmostar.de/)", "Startseite") }).some((f) => /Startseite/.test(f)));
  assert.ok(failuresFor({ body: body.replace("https://www.hamburg.de/", "https://example.com/") }).some((f) => /nicht freigegeben/.test(f)));
  assert.ok(failuresFor({}, { publishedPosts: [{ slug: "alt", title: "Alt" }] }).some((f) => /früheren Blogbeitrag/.test(f)));
  assert.ok(failuresFor(addToBody("[Falsch](https://blog.djmostar.de/gibt-es-nicht/)")).some((f) => /unbekannten/.test(f)));
});

test("blocks image problems", () => {
  assert.ok(failuresFor({ featured: { id: "img1", alt: "" } }).some((f) => /Alt-Text/.test(f)));
  assert.ok(failuresFor({ featured: { id: "img1", alt: "DJ MOSTAR am Mischpult bei der Arbeit" } }).some((f) => /nicht nennen/.test(f)));
  assert.ok(failuresFor({ inlineImages: [] }).some((f) => /Bilder im Text/.test(f)));
  assert.ok(failuresFor({}, { usedImageIds: new Set(["img1"]) }).some((f) => /bereits verwendet/.test(f)));
  assert.ok(failuresFor({ inlineImages: [{ id: "img1", alt: "Tanzfläche mit bunten Lichtern" }], body: goodArticle().body.replace("img2", "img1") }).some((f) => /doppelt/.test(f)));
});

test("checks the address form", () => {
  assert.ok(checkAddressForm("Das hilft euch sehr.", "sie").length > 0);
  assert.ok(checkAddressForm("Das hilft Ihnen sehr.", "ihr").length > 0);
  assert.ok(checkAddressForm("Dann planen Sie früh.", "ihr").length > 0);
  assert.deepStrictEqual(checkAddressForm("Das hilft Ihnen sehr. Sie planen früh.", "sie"), []);
  assert.deepStrictEqual(checkAddressForm("Das hilft euch sehr.", "ihr"), []);
  assert.ok(failuresFor({ category: "firmenfeier", body: `${goodArticle().body.replace("https://djmostar.de/hochzeit", "https://djmostar.de/firmenfeier")}` }).some((f) => /informelle/.test(f)));
});

test("rejects duplicates against earlier posts", () => {
  const article = goodArticle();
  const similar = { slug: "anders", title: article.title, primaryKeyword: article.primaryKeyword, body: article.body };
  const result = checkOriginality(article, [similar], content.similarity);
  assert.ok(result.failures.some((f) => /Titel zu ähnlich/.test(f)));
  assert.ok(result.failures.some((f) => /Hauptkeyword/.test(f)));
  assert.ok(result.failures.some((f) => /Text zu ähnlich/.test(f)));
  assert.deepStrictEqual(checkOriginality(article, [{ slug: "x", title: "Sommerfest im Unternehmen", primaryKeyword: "Sommerfest", body: "Sommerfest Grillen Firma Garten" }], content.similarity).failures, []);
});

test("live link check separates dead links from blocked bots", async () => {
  const fake = async (url) => ({ status: url.includes("dead") ? 404 : url.includes("blocked") ? 403 : 200 });
  const result = await checkLiveLinks("[a](https://ok.de/) [b](https://dead.de/) [c](https://blocked.de/) [d](https://blog.djmostar.de/x/)", fake);
  assert.strictEqual(result.failures.length, 1);
  assert.strictEqual(result.warnings.length, 1);
});
