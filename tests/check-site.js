#!/usr/bin/env node
// Checks the built site. It needs no packages and runs on every deploy.
// Usage: node tests/check-site.js _site [--expect-post]
const fs = require("node:fs");
const path = require("node:path");

const root = process.argv[2] || "_site";
const expectPost = process.argv.includes("--expect-post");
const errors = [];
const fail = (file, message) => errors.push(`${file}: ${message}`);

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

const files = walk(root);
const html = files.filter((file) => file.endsWith(".html"));
if (html.length === 0) fail(root, "no HTML pages were built");

for (const file of ["sitemap.xml", "feed.xml", "robots.txt", "assets/css/site.css", "assets/logo.jpg", "assets/favicon.jpg",
  "assets/fonts/oswald-700.woff2", "assets/fonts/playfair-400-italic.woff2", "assets/fonts/playfair-700-italic.woff2", "assets/fonts/roboto-400.woff2", "assets/fonts/roboto-500.woff2", "assets/fonts/roboto-700.woff2", "assets/fonts/roboto-400-italic.woff2"]) {
  const full = path.join(root, file);
  if (!fs.existsSync(full) || fs.statSync(full).size === 0) fail(file, "missing or empty");
}

let postPages = 0;
for (const file of html) {
  const name = path.relative(root, file);
  const page = fs.readFileSync(file, "utf8");
  const count = (pattern) => (page.match(pattern) || []).length;

  if (count(/<h1[\s>]/g) !== 1) fail(name, "must have exactly one H1");
  if (!page.includes('<html lang="de">')) fail(name, "missing German lang attribute");
  if (!/<title>[^<]+<\/title>/.test(page)) fail(name, "missing title");
  if (!/<meta name="description" content="[^"]+"/.test(page)) fail(name, "missing meta description");
  if (!/<link rel="canonical" href="https:\/\/blog\.djmostar\.de\//.test(page)) fail(name, "missing canonical URL");

  // No third-party resources except Unsplash images, and no tracking.
  for (const tag of page.match(/<(script|link)\b[^>]*\b(src|href)="https?:[^"]*"[^>]*>/g) || []) {
    if (!/rel="(canonical|alternate)"/.test(tag)) fail(name, `third-party resource: ${tag}`);
  }
  if (/fonts\.googleapis|fonts\.gstatic|googletagmanager|google-analytics|document\.cookie/.test(page)) fail(name, "tracking or Google Fonts found");

  for (const img of page.match(/<img\b[^>]*>/g) || []) {
    if (!/\balt="[^"]+"/.test(img)) fail(name, `image without alt text: ${img}`);
    if (!/\bwidth="\d+"/.test(img) || !/\bheight="\d+"/.test(img)) fail(name, `image without size: ${img}`);
    const src = (img.match(/\bsrc="([^"]+)"/) || [])[1] || "";
    if (/^https?:/.test(src) && !src.startsWith("https://images.unsplash.com/")) fail(name, `image not from Unsplash: ${src}`);
  }

  const visible = page.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<[^>]+>/g, " ");
  if (/Hochzeits[-‐‑–]DJ/i.test(visible)) fail(name, 'visible text contains "Hochzeits-DJ" with a hyphen');

  // Required header and footer links
  for (const needed of ["https://djmostar.de/impressum", "mailto:info@djmostar.de", "tel:+491754193485", "https://djmostar.de/hochzeit", "https://djmostar.de/firmenfeier"]) {
    if (!page.includes(needed)) fail(name, `missing link ${needed}`);
  }
  if (name !== "404.html" && !page.includes("https://wa.me/message/NKVCGG2LGUV2J1")) fail(name, "missing WhatsApp link");

  const schemas = [...page.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  if (schemas.length !== 1) fail(name, "expected one JSON-LD block");
  const types = [];
  for (const [, json] of schemas) {
    try {
      const graph = JSON.parse(json)["@graph"] || [];
      types.push(...graph.map((node) => node["@type"]));
      const business = graph.find((node) => node["@type"] === "EntertainmentBusiness");
      if (business && (business.address || business.priceRange)) fail(name, "business schema must not contain an address or prices");
    } catch (error) {
      fail(name, `invalid JSON-LD: ${error.message}`);
    }
  }

  if (types.includes("BlogPosting")) {
    postPages += 1;
    for (const type of ["BreadcrumbList", "EntertainmentBusiness", "FAQPage"]) {
      if (!types.includes(type)) fail(name, `article schema missing ${type}`);
    }
    if (!/auf <a[^>]*href="https:\/\/unsplash\.com\/\?utm_source=djmostar_blog&(amp;)?utm_medium=referral"/.test(page)) fail(name, "missing Unsplash credit");
    for (const link of page.match(/<a\b[^>]*href="https?:\/\/(?!djmostar\.de|www\.djmostar\.de|blog\.djmostar\.de)[^"]*"[^>]*>/g) || []) {
      if (!/target="_blank"/.test(link) || !/rel="noopener"/.test(link)) fail(name, `external link without new tab or noopener: ${link}`);
    }
  }
}

if (expectPost && postPages === 0) fail(root, "the test article was not built");
if (!expectPost && html.some((file) => file.includes("testartikel"))) fail(root, "the test article must never be published");

const sitemap = fs.existsSync(path.join(root, "sitemap.xml")) ? fs.readFileSync(path.join(root, "sitemap.xml"), "utf8") : "";
if (!sitemap.includes("<loc>https://blog.djmostar.de/</loc>")) fail("sitemap.xml", "missing the blog home page");

if (errors.length) {
  console.error(`Site check failed with ${errors.length} problem(s):`);
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}
console.log(`Site check passed: ${html.length} pages, ${postPages} articles.`);
