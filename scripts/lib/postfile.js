// Turns the AI's article into the Markdown file for /content/posts and back again.
const yaml = require("js-yaml");

function credit(image) {
  const utm = "utm_source=djmostar_blog&utm_medium=referral";
  return `Foto: <a href="${image.photographerUrl}?${utm}" target="_blank" rel="noopener">${escapeHtml(image.photographer)}</a> auf <a href="https://unsplash.com/?${utm}" target="_blank" rel="noopener">Unsplash</a>`;
}

const escapeHtml = (text) => String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function imageUrl(url, width) {
  const parsed = new URL(url);
  parsed.searchParams.set("w", String(width));
  parsed.searchParams.set("q", "70");
  parsed.searchParams.set("auto", "format");
  parsed.searchParams.set("fit", "crop");
  return parsed.toString();
}

function figure(image, alt) {
  const height = Math.round((image.height / image.width) * 1200);
  return `<figure data-unsplash-id="${escapeHtml(image.id)}">
  <img src="${escapeHtml(imageUrl(image.url, 1200))}" width="1200" height="${height}" alt="${escapeHtml(alt)}" loading="lazy">
  <figcaption>${credit(image)}</figcaption>
</figure>`;
}

function imageData(image, alt) {
  return { id: image.id, url: image.url, width: image.width, height: image.height, alt, photographer: image.photographer, photographerUrl: image.photographerUrl, downloadLocation: image.downloadLocation };
}

// images is a map of Unsplash id to candidate.
function renderPost(article, images, { date, topic = {} }) {
  let body = article.body;
  const inlineImages = [];
  for (const inline of article.inlineImages || []) {
    const image = images[inline.id];
    if (!image) throw new Error(`Unknown inline image: ${inline.id}`);
    body = body.replace(`[[BILD:${inline.id}]]`, figure(image, inline.alt));
    inlineImages.push(imageData(image, inline.alt));
  }
  if (/\[\[BILD:/.test(body)) throw new Error("Article contains an image marker that was not replaced");
  const featured = images[article.featured.id];
  if (!featured) throw new Error(`Unknown featured image: ${article.featured.id}`);

  const front = {
    title: article.title,
    seoTitle: article.seoTitle,
    description: article.description,
    subtitle: article.subtitle,
    excerpt: article.excerpt,
    slug: article.slug,
    category: article.category,
    tags: article.tags || [],
    date,
    ...(topic.audience ? { audience: topic.audience } : {}),
    ...(topic.inquiry ? { inquiry: topic.inquiry } : {}),
    primaryKeyword: article.primaryKeyword,
    secondaryKeywords: article.secondaryKeywords || [],
    searchVolume: "unknown",
    featured: imageData(featured, article.featured.alt),
    inlineImages,
    faq: article.faq || [],
    sources: article.sources || [],
  };
  return `---\n${yaml.dump(front, { lineWidth: -1, noRefs: true })}---\n\n${body.trim()}\n`;
}

function parsePost(text) {
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text);
  if (!match) throw new Error("Article file has no front matter");
  const front = yaml.load(match[1]);
  return { ...front, body: match[2].trim() };
}

const postPath = (slug) => `content/posts/${slug}.md`;

function setDate(text, date) {
  if (!/^date: .*$/m.test(text)) throw new Error("Article file has no date");
  return text.replace(/^date: .*$/m, `date: ${date}`);
}

module.exports = { renderPost, parsePost, postPath, setDate, figure, credit };
