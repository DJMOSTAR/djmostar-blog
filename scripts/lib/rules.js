// Hard rules checked by code. A single failure blocks publishing.
const { cosine, jaccard, visibleText, wordCount, markdownLinks, normalize } = require("./text");

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function allArticleText(article) {
  const faq = (article.faq || []).flatMap((entry) => [entry.question, entry.answer]);
  const alts = [article.featured && article.featured.alt, ...(article.inlineImages || []).map((image) => image.alt)];
  return [article.title, article.seoTitle, article.description, article.subtitle, article.excerpt, visibleText(article.body), ...faq, ...alts, ...(article.tags || []), article.primaryKeyword, ...(article.secondaryKeywords || [])]
    .filter(Boolean).join("\n");
}

function findCategory(content, slug) {
  return (content.categories || []).find((category) => category.slug === slug);
}

// "sie" for corporate topics, "ihr" for wedding and private topics.
function audienceFor(article, content) {
  const category = findCategory(content, article.category);
  return article.audience || (category && category.audience) || "ihr";
}

function checkAddressForm(text, audience) {
  const failures = [];
  // The lowercase "ihr" can legitimately mean "her" or "their", so it is left to the AI editor.
  if (audience === "sie") {
    const informal = text.match(/\b(?:euch|euer|eure[mnrs]?|Ihr (?:habt|seid|könnt|solltet|wollt|müsst)|ihr (?:habt|seid|könnt|solltet|wollt|müsst)|du|dein\w*|dir)\b/);
    if (informal) failures.push(`Firmenartikel verwendet informelle Anrede: "${informal[0]}"`);
  } else {
    const formal = text.match(/\bIhnen\b|\bIhre[mnrs]?\b|[\p{Ll},;] Sie\b(?! (?:ist|sind|war|waren|hat|haben|wird|werden|kann|können)\b)/u);
    if (formal) failures.push(`Hochzeits- oder Privatartikel verwendet formelle Anrede: "${formal[0].trim()}"`);
  }
  return failures;
}

function checkLinks(article, { site, content, publishedPosts = [] }) {
  const failures = [];
  const links = markdownLinks(article.body);
  const inquiryKey = article.inquiry || (findCategory(content, article.category) || {}).inquiry || "hochzeit";
  const inquiryUrl = String(site.inquiry[inquiryKey]).split("#")[0].replace(/\/$/, "");
  const clean = (url) => url.split("#")[0].split("?")[0].replace(/\/$/, "");

  if (!links.some((link) => clean(link.url) === inquiryUrl)) failures.push(`Interner Link zur Anfrageseite fehlt: ${inquiryUrl}`);
  if (!links.some((link) => clean(link.url) === String(site.main_site).replace(/\/$/, ""))) failures.push(`Link zur Startseite fehlt: ${site.main_site}`);

  const blogHost = new URL(site.url).hostname;
  const blogLinks = links.filter((link) => new URL(link.url).hostname === blogHost);
  const knownSlugs = new Set(publishedPosts.map((post) => post.slug));
  for (const link of blogLinks) {
    const slug = new URL(link.url).pathname.replace(/^\/|\/$/g, "");
    if (!knownSlugs.has(slug)) failures.push(`Link auf einen unbekannten Blogbeitrag: ${link.url}`);
  }
  if (publishedPosts.length > 0 && blogLinks.length < 1) failures.push("Link zu mindestens einem früheren Blogbeitrag fehlt");
  if (blogLinks.length > 3) failures.push("Höchstens 3 Links zu früheren Blogbeiträgen erlaubt");

  const internalHosts = new Set(["djmostar.de", "www.djmostar.de", blogHost]);
  const external = links.filter((link) => !internalHosts.has(new URL(link.url).hostname));
  const allowedDomains = (content.external_sources || []).map((source) => source.domain);
  if (external.length < 1 || external.length > 2) failures.push(`1 bis 2 externe Links nötig, gefunden: ${external.length}`);
  for (const link of external) {
    const host = new URL(link.url).hostname;
    if (!allowedDomains.some((domain) => host === domain || host.endsWith(`.${domain}`))) failures.push(`Externe Domain nicht freigegeben: ${host}`);
  }
  return failures;
}

// Sentences of the body and FAQ, as a reader sees them.
function sentences(article) {
  const parts = [visibleText(article.body), ...(article.faq || []).flatMap((entry) => [entry.question, entry.answer])];
  return parts.join("\n").split(/(?<=[.!?])\s+|\n+/).map((sentence) => sentence.trim()).filter(Boolean);
}

function checkKeyFacts(article, rules) {
  const max = rules.key_fact_max || 2;
  const all = sentences(article);
  return (rules.key_facts || []).flatMap(({ name, pattern }) => {
    const regex = new RegExp(pattern, "i");
    const count = all.filter((sentence) => regex.test(sentence)).length;
    return count > max ? [`Wiederholung: ${name} kommt ${count}x vor, höchstens ${max}x erlaubt (einmal im Text, einmal im FAQ)`] : [];
  });
}

function checkMusicStyles(article, rules) {
  const config = rules.music_styles;
  if (!config) return [];
  const regex = new RegExp(config.pattern, "gi");
  const mentioning = sentences(article).filter((sentence) => (sentence.match(regex) || []).length >= config.min_matches);
  if (mentioning.length === 0) return [];
  if (!config.allowed_categories.includes(article.category)) return [`Liste der Musikrichtungen nur in Artikeln über Musik erlaubt (Kategorie: ${article.category})`];
  return mentioning.length > 1 ? [`Liste der Musikrichtungen höchstens in einem Satz, gefunden in ${mentioning.length}`] : [];
}

function checkArticle(article, context) {
  const { content, rules } = context;
  const limits = content.article;
  const failures = [];
  const text = allArticleText(article);
  const body = visibleText(article.body);

  for (const field of ["title", "seoTitle", "description", "subtitle", "excerpt", "slug", "category", "body", "primaryKeyword"]) {
    if (!article[field] || !String(article[field]).trim()) failures.push(`Pflichtfeld fehlt: ${field}`);
  }
  if (failures.length) return failures;

  for (const phrase of rules.forbidden_phrases) {
    if (new RegExp(escapeRegex(phrase), "i").test(text)) failures.push(`Verbotene Formulierung: "${phrase}"`);
  }
  for (const { name, pattern } of rules.forbidden_patterns) {
    const match = text.match(new RegExp(pattern, "iu"));
    if (match) failures.push(`${name}: "${match[0]}"`);
  }
  const chains = (body.match(/nicht nur\b/gi) || []).length;
  if (chains > 1) failures.push(`"nicht nur ... sondern auch" zu oft verwendet (${chains}x)`);

  const firstSentence = (body.trim().match(/^[^.!?]*[.!?]/) || [""])[0];
  if (firstSentence.trim().endsWith("?")) failures.push("Der Einstieg darf keine rhetorische Frage sein");

  failures.push(...checkAddressForm(text, audienceFor(article, content)));

  if (article.seoTitle.length > limits.seo_title_max) failures.push(`SEO-Titel zu lang: ${article.seoTitle.length} Zeichen`);
  if (article.description.length < limits.description_min || article.description.length > limits.description_max) failures.push(`Meta-Beschreibung muss ${limits.description_min} bis ${limits.description_max} Zeichen haben, hat ${article.description.length}`);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(article.slug)) failures.push(`Ungültiger Slug: ${article.slug}`);

  if (/^#\s/m.test(article.body) || /<h1[\s>]/i.test(article.body)) failures.push("Der Text darf keine H1 enthalten, sie kommt aus dem Titel");
  const h2 = (article.body.match(/^##\s/gm) || []).length;
  if (h2 < 2) failures.push("Mindestens zwei H2-Abschnitte nötig");
  if (/^#{4,}\s/m.test(article.body)) failures.push("Überschriften tiefer als H3 sind nicht erlaubt");
  const firstHeading = (article.body.match(/^#{2,3}\s/m) || [""])[0];
  if (firstHeading.startsWith("###")) failures.push("Die erste Überschrift muss eine H2 sein");

  const words = wordCount(article.body) + wordCount((article.faq || []).map((entry) => `${entry.question} ${entry.answer}`).join(" "));
  if (words < limits.min_words || words > limits.max_words) failures.push(`Länge muss ${limits.min_words} bis ${limits.max_words} Wörter sein, hat ${words}`);

  const faqCount = (article.faq || []).length;
  if (faqCount < limits.faq_min || faqCount > limits.faq_max) failures.push(`${limits.faq_min} bis ${limits.faq_max} FAQ nötig, gefunden: ${faqCount}`);

  if (!normalize(article.title).includes(normalize(article.primaryKeyword))) failures.push(`Der Titel muss das Hauptkeyword enthalten: "${article.primaryKeyword}"`);
  const secondary = (article.secondaryKeywords || []).length;
  if (secondary < limits.secondary_keywords_min || secondary > limits.secondary_keywords_max) failures.push(`${limits.secondary_keywords_min} bis ${limits.secondary_keywords_max} Nebenkeywords nötig, gefunden: ${secondary}`);

  const targets = (content.target_keywords || {})[article.category] || [];
  const searchable = normalize(`${article.title} ${visibleText(article.body)} ${(article.faq || []).map((entry) => `${entry.question} ${entry.answer}`).join(" ")}`);
  if (targets.length && !targets.some((keyword) => searchable.includes(normalize(keyword)))) failures.push(`Ranking-Keyword fehlt, nötig ist eines von: ${targets.join(", ")}`);

  if (!findCategory(content, article.category)) failures.push(`Unbekannte Kategorie: ${article.category}`);
  for (const tag of article.tags || []) {
    if (!(content.tags || []).includes(tag)) failures.push(`Unbekannter Tag: ${tag}`);
  }

  // Images
  const images = [article.featured, ...(article.inlineImages || [])];
  if (!article.featured || !article.featured.id) failures.push("Beitragsbild fehlt");
  const inlineCount = (article.inlineImages || []).length;
  if (inlineCount < limits.inline_images_min || inlineCount > limits.inline_images_max) failures.push(`${limits.inline_images_min} bis ${limits.inline_images_max} Bilder im Text nötig, gefunden: ${inlineCount}`);
  for (const image of images.filter(Boolean)) {
    if (!image.alt || image.alt.trim().length < 10) failures.push(`Alt-Text fehlt oder ist zu kurz: ${image.id}`);
    if (image.alt && /mostar|\bMo\b/i.test(image.alt)) failures.push(`Alt-Text darf DJ MOSTAR nicht nennen: ${image.alt}`);
    if (context.usedImageIds && context.usedImageIds.has(image.id)) failures.push(`Bild wurde bereits verwendet: ${image.id}`);
    if (context.availableImageIds && !context.availableImageIds.has(image.id)) failures.push(`Unbekanntes Bild: ${image.id}`);
  }
  const imageIds = images.filter(Boolean).map((image) => image.id);
  if (new Set(imageIds).size !== imageIds.length) failures.push("Ein Bild wird doppelt verwendet");
  for (const image of article.inlineImages || []) {
    if (!article.body.includes(`[[BILD:${image.id}]]`) && !article.body.includes(`/${image.id}`) && !article.body.includes(`data-unsplash-id="${image.id}"`)) failures.push(`Bild ${image.id} ist nicht im Text platziert`);
  }

  // Statistics need a linked source in the same paragraph.
  for (const paragraph of article.body.split(/\n\s*\n/)) {
    if (/\b\d+([.,]\d+)?\s?(?:%|Prozent)|\b(?:Studie|Umfrage|Statistik)\b/i.test(visibleText(paragraph)) && markdownLinks(paragraph).length === 0) {
      failures.push(`Statistik ohne verlinkte Quelle: "${visibleText(paragraph).trim().slice(0, 80)}"`);
    }
  }

  // Business claims with numbers may only use the approved numbers.
  const allowedClaims = rules.allowed_number_claims.map((pattern) => new RegExp(pattern, "i"));
  for (const match of text.matchAll(/(?:(?:über|mehr als|rund|fast|knapp|seit)\s+)?\d+\+?\s+(?:Jahre[n]?|Events?|Hochzeiten|Feiern|Kunden|Firmen|Paare[n]?|Brautpaare[n]?|Veranstaltungen|Auftritte[n]?)\b/gi)) {
    if (!allowedClaims.some((pattern) => pattern.test(match[0]))) failures.push(`Zahl ist nicht freigegeben: "${match[0]}"`);
  }

  failures.push(...checkKeyFacts(article, rules));
  failures.push(...checkMusicStyles(article, rules));
  failures.push(...checkLinks(article, context));
  return [...new Set(failures)];
}

// Compares against everything already published on this blog.
function checkOriginality(article, publishedPosts, similarity) {
  let highest = { score: 0, slug: null };
  const failures = [];
  for (const post of publishedPosts) {
    if (post.slug === article.slug && post.status !== "needs-review") failures.push(`Slug existiert bereits: ${article.slug}`);
    const title = jaccard(article.title, post.title);
    if (title > similarity.title_max) failures.push(`Titel zu ähnlich zu "${post.title}" (${title.toFixed(2)})`);
    if (post.primaryKeyword && normalize(post.primaryKeyword) === normalize(article.primaryKeyword)) failures.push(`Hauptkeyword bereits verwendet: ${article.primaryKeyword}`);
    if (post.body) {
      const body = cosine(article.body, post.body);
      if (body > highest.score) highest = { score: body, slug: post.slug };
      if (body > similarity.body_max) failures.push(`Text zu ähnlich zu "${post.title}" (${body.toFixed(2)})`);
    }
  }
  return { failures, highest };
}

// Live link check. A blocked bot (401, 403, 405, 429) only gives a warning.
async function checkLiveLinks(markdown, fetchImpl = fetch) {
  const failures = [];
  const warnings = [];
  const urls = [...new Set(markdownLinks(markdown).map((link) => link.url))].filter((url) => !url.startsWith("https://blog.djmostar.de/"));
  for (const url of urls) {
    let status = 0;
    let lastError = "";
    for (let attempt = 0; attempt < 2 && !status; attempt += 1) {
      try {
        const response = await fetchImpl(url, { redirect: "follow", signal: AbortSignal.timeout(15000), headers: { "User-Agent": "DJMostarBlogLinkCheck/1.0", Accept: "text/html" } });
        status = response.status;
      } catch (error) {
        lastError = error.message;
      }
    }
    if (status >= 200 && status < 400) continue;
    if ([401, 403, 405, 429].includes(status)) warnings.push(`Link blockiert automatische Prüfung (${status}): ${url}`);
    else failures.push(`Link nicht erreichbar (${status || lastError}): ${url}`);
  }
  return { failures, warnings };
}

module.exports = { checkKeyFacts, checkMusicStyles, checkArticle, checkAddressForm, checkOriginality, checkLiveLinks, audienceFor, findCategory, allArticleText };
