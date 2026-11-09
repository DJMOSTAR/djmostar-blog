// Shared test data: an article that passes every hard rule.
const path = require("node:path");
const yaml = require("js-yaml");
const fs = require("node:fs");

const ROOT = path.resolve(__dirname, "../..");
const load = (file) => yaml.load(fs.readFileSync(path.join(ROOT, file), "utf8"));
const content = load("config/content.yml");
const rules = load("config/rules.yml");
const site = load("config/site.yml");
const schedule = load("config/schedule.yml");

const sentence = "Im persönlichen Vorgespräch klären wir euren Ablauf, eure Musikrichtungen und besondere Momente in aller Ruhe.";

function goodArticle(overrides = {}) {
  const paragraph = Array.from({ length: 6 }, () => sentence).join(" ");
  const section = (title) => `## ${title}\n\n${paragraph}\n\n${paragraph}\n\n${paragraph}`;
  return {
    title: "Wann sollte man den Hochzeits DJ in Hamburg buchen?",
    seoTitle: "Hochzeits DJ Hamburg buchen: der beste Zeitpunkt",
    description: "Wann ihr euren Hochzeits DJ in Hamburg buchen solltet, was im Vorgespräch passiert und warum sich auch kurzfristige Anfragen lohnen können, hier im Blog.",
    subtitle: "Der richtige Zeitpunkt für eure Anfrage",
    excerpt: "So plant ihr den richtigen Zeitpunkt für die Anfrage.",
    slug: "wann-hochzeits-dj-hamburg-buchen",
    category: "hochzeit",
    tags: ["Planung", "Hamburg"],
    primaryKeyword: "Hochzeits DJ in Hamburg",
    secondaryKeywords: ["DJ für Hochzeit Hamburg", "Hochzeits DJ buchen", "Hochzeits DJ in der Nähe"],
    body: `Der Termin steht, die Location auch. Jetzt lohnt sich der Blick auf die Musik.\n\n[[BILD:img2]]\n\n${section("Wann ihr anfragen solltet")}\n\n${section("Was ihr vorher klären könnt")}\n\n${section("Was im Vorgespräch passiert")}\n\n${section("Wenn die Zeit knapp ist")}\n\nMehr dazu findet ihr auf der Seite zum [Hochzeits DJ in Hamburg](https://djmostar.de/hochzeit#kontakt), auf der [Startseite](https://djmostar.de/) und bei [hamburg.de](https://www.hamburg.de/).`,
    faq: [
      { question: "Wie früh sollten wir buchen?", answer: "Idealerweise empfiehlt sich eine Buchung 6 bis 12 Monate im Voraus." },
      { question: "Gibt es kurzfristig noch Termine?", answer: "Kurzfristige Anfragen sind jederzeit willkommen." },
      { question: "Spielst du internationale Musik?", answer: "Ja, das besprechen wir individuell im persönlichen Vorgespräch." },
    ],
    sources: [{ title: "hamburg.de", url: "https://www.hamburg.de/" }],
    featured: { id: "img1", alt: "Tanzfläche mit bunten Lichtern bei einer Feier" },
    inlineImages: [{ id: "img2", alt: "Mischpult in warmem Licht bei einer Feier" }],
    ...overrides,
  };
}

const context = (extra = {}) => ({ content, rules, site, publishedPosts: [], ...extra });

module.exports = { content, rules, site, schedule, goodArticle, context };
