// Text helpers and the local similarity score.
// Similarity compares word use across this blog only. It cannot detect copying from the internet.
const STOP_WORDS = new Set(("aber alle allem allen aller alles als also am an auch auf aus bei beim bin bis bist da damit dann das dass dem den denn der des deshalb die dies diese diesem diesen dieser dieses doch dort du durch ein eine einem einen einer eines er es etwas euch euer eure eurem euren eurer fuer gibt habt hat hatte hier ich ihnen ihr ihre ihrem ihren ihrer im in ist ja jede jedem jeden jeder jedes kann kannst koennen koennt man mehr mein meine meinem meinen meiner mich mir mit muss nach nicht noch nur ob oder ohne schon sehr sein seine sich sie sind so soll sollte sollten sollt um und uns unser unsere unter viel vom von vor war was wenn wer werden wie wir wird wird wo zu zum zur ueber").split(" "));

function normalize(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .normalize("NFKD").replace(/[̀-ͯ]/g, "");
}

function tokens(text) {
  return normalize(text).split(/[^a-z0-9]+/).filter((word) => word.length > 1 && !STOP_WORDS.has(word));
}

// Lowercase ASCII slug: ae, oe, ue and ss instead of umlauts.
function slugify(text) {
  return normalize(text).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").replace(/-{2,}/g, "-");
}

function counts(words) {
  const map = new Map();
  for (const word of words) map.set(word, (map.get(word) || 0) + 1);
  return map;
}

function cosine(a, b) {
  const left = counts(tokens(a));
  const right = counts(tokens(b));
  if (left.size === 0 || right.size === 0) return 0;
  let dot = 0;
  for (const [word, count] of left) dot += count * (right.get(word) || 0);
  const size = (map) => Math.sqrt([...map.values()].reduce((sum, value) => sum + value * value, 0));
  return dot / (size(left) * size(right));
}

function jaccard(a, b) {
  const left = new Set(tokens(a));
  const right = new Set(tokens(b));
  if (left.size === 0 || right.size === 0) return 0;
  const shared = [...left].filter((word) => right.has(word)).length;
  return shared / (left.size + right.size - shared);
}

// Text a reader sees: no URLs, HTML tags, image markers or Markdown syntax.
function visibleText(markdown) {
  return String(markdown || "")
    .replace(/\[\[BILD:[^\]]*\]\]/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/<figcaption>[\s\S]*?<\/figcaption>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/[#*_`>|]/g, " ");
}

function wordCount(text) {
  return visibleText(text).trim().split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
}

function markdownLinks(markdown) {
  return [...String(markdown || "").matchAll(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g)].map((match) => ({ text: match[1], url: match[2] }));
}

module.exports = { normalize, tokens, slugify, cosine, jaccard, visibleText, wordCount, markdownLinks };
