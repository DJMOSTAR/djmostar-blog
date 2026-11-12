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
  assert.ok(failuresFor({ body: body.replace("(https://djmostar.de/hochzeit#kontakt)", "(https://djmostar.de/firmenfeier#kontakt)") }).some((f) => /Anfrageseite/.test(f)));
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
  assert.ok(failuresFor({ category: "firmenfeier", body: `${goodArticle().body.replace("https://djmostar.de/hochzeit#kontakt", "https://djmostar.de/firmenfeier#kontakt")}` }).some((f) => /informelle/.test(f)));
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

test("a hyphenated Hochzeits-DJ is caught in every visible field", () => {
  const hyphen = "Hochzeits-DJ";
  const cases = {
    title: { title: `${hyphen} in Hamburg buchen`, primaryKeyword: "Hamburg buchen" },
    seoTitle: { seoTitle: `${hyphen} Hamburg buchen` },
    description: { description: `${goodArticle().description.slice(0, 120)} ${hyphen} hier.`.padEnd(150, ".") },
    excerpt: { excerpt: `So findet ihr den passenden ${hyphen}.` },
    subtitle: { subtitle: `Der passende ${hyphen} für euch` },
    heading: addToBody(`## Was ein ${hyphen} vorher wissen muss`),
    altText: { featured: { id: "img1", alt: `Ein ${hyphen} legt auf einer Feier auf` } },
    faq: { faq: [...goodArticle().faq, { question: `Wann bucht man den ${hyphen}?`, answer: "Am besten früh." }] },
  };
  for (const [field, overrides] of Object.entries(cases)) {
    assert.ok(failuresFor(overrides).some((f) => /Bindestrich/.test(f)), `not caught in ${field}`);
  }
});

test("poetic phrases from Mo's review are blocked", () => {
  assert.ok(failuresFor(addToBody("Die Musik wächst mit der Planung.")).some((f) => /wächst/.test(f)));
  assert.ok(failuresFor(addToBody("Wünsche brauchen Zeit, bis sie gereift sind.")).some((f) => /gereift/.test(f)));
  assert.ok(failuresFor(addToBody("Der Kunde erhält den kompletten Service zu einem Preis.")).some((f) => /Preis|Kunde/.test(f)));
});

test("a key fact may appear twice at most", () => {
  assert.deepStrictEqual(failuresFor({}).filter((f) => /Wiederholung/.test(f)), []);
  const twice = addToBody("Ich bin an allen Wochentagen buchbar. Da ich an allen Wochentagen buchbar bin, geht viel.");
  const failures = failuresFor({ ...twice, faq: [...goodArticle().faq, { question: "Nur am Wochenende?", answer: "Nein, ich bin an allen Wochentagen buchbar." }] });
  assert.ok(failures.some((f) => /Wiederholung: An allen Wochentagen buchbar kommt 3x/.test(f)), failures.join("; "));
  assert.ok(failuresFor(addToBody("Idealerweise 6 bis 12 Monate. Wirklich 6 bis 12 Monate.")).some((f) => /6 bis 12 Monate/.test(f)));
});

test("the music style list is limited to music articles and one sentence", () => {
  const list = "Zum Repertoire gehören türkische, italienische und persische Musik.";
  assert.ok(failuresFor(addToBody(list)).some((f) => /Musikrichtungen nur in Artikeln über Musik/.test(f)));
  assert.ok(!failuresFor({ ...addToBody(list), category: "musik" }).some((f) => /Musikrichtungen/.test(f)));
  assert.ok(failuresFor({ ...addToBody(`${list} Auch russische und arabische Musik spiele ich.`), category: "musik" }).some((f) => /einem Satz/.test(f)));
  assert.ok(!failuresFor(addToBody("Internationale Musik stimmen wir individuell ab.")).some((f) => /Musikrichtungen/.test(f)));
});

test("every inquiry link must go to the form with #kontakt", () => {
  const body = goodArticle().body;
  assert.ok(failuresFor({ body: body.replace("(https://djmostar.de/hochzeit#kontakt)", "(https://djmostar.de/hochzeit)") }).some((f) => /Anfrageseite fehlt/.test(f)));
  assert.ok(failuresFor(addToBody("Siehe [Firmenfeiern](https://djmostar.de/firmenfeier).")).some((f) => /ohne #kontakt: https:\/\/djmostar\.de\/firmenfeier$/.test(f)));
  assert.ok(failuresFor(addToBody("Siehe [Hochzeit](https://djmostar.de/hochzeit/).")).some((f) => /ohne #kontakt/.test(f)));
  assert.ok(!failuresFor({}).some((f) => /#kontakt/.test(f)));
});

test("readers are never asked to compile song lists or collect music wishes", () => {
  assert.ok(failuresFor(addToBody("Sammelt eure Lieblingssongs in Ruhe.")).some((f) => /Nicht erlaubt: Aufforderung, Song- oder Musiklisten/.test(f)));
  assert.ok(failuresFor(addToBody("Legt eine gemeinsame Liste an, in die beide Songs eintragen.")).some((f) => /Musiklisten/.test(f)));
  assert.ok(failuresFor(addToBody("Erstellt eine Playlist mit euren Lieblingsliedern. Stellt eine Playlist zusammen.")).some((f) => /Musiklisten/.test(f)));
  assert.ok(!failuresFor(addToBody("Eine Playlist vom Handy reicht für den Empfang. Die Musik läuft dann nebenher.")).some((f) => /Musiklisten/.test(f)));
  assert.ok(!failuresFor(addToBody("Eure Wünsche besprechen wir im persönlichen Vorgespräch. Am Abend wähle ich die Musik live aus.")).some((f) => /Musiklisten/.test(f)));
});

test("the approved capacity wording passes", () => {
  assert.deepStrictEqual(failuresFor(addToBody("Ich bringe Licht- und Tontechnik passend zu Raum und Gästezahl mit, für Feiern bis zu 250 Gästen.")), []);
});

test("plain links to the inquiry pages are pointed at the form", () => {
  const { fixInquiryLinks } = require("../../scripts/lib/rules");
  const { site } = require("./support");
  const fixed = fixInquiryLinks("[A](https://djmostar.de/firmenfeier) [B](https://www.djmostar.de/hochzeit/) [C](https://djmostar.de/hochzeit#anfrage) [D](https://djmostar.de/hochzeit#kontakt) [E](https://djmostar.de/) [F](https://djmostar.de/hochzeitsfotos)", site);
  assert.strictEqual(fixed, "[A](https://djmostar.de/firmenfeier#kontakt) [B](https://djmostar.de/hochzeit#kontakt) [C](https://djmostar.de/hochzeit#kontakt) [D](https://djmostar.de/hochzeit#kontakt) [E](https://djmostar.de/) [F](https://djmostar.de/hochzeitsfotos)");
});
