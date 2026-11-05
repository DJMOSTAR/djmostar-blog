// Small helpers used by the templates.
const { buildPostSchema, buildListSchema } = require("./schema");

const SITE_HOSTS = ["djmostar.de", "www.djmostar.de", "blog.djmostar.de"];
const UTM = "utm_source=djmostar_blog&utm_medium=referral";
const TIME_ZONE = "Europe/Berlin";

function isExternal(href) {
  if (!/^https?:\/\//i.test(href)) return false;
  try {
    return !SITE_HOSTS.includes(new URL(href).hostname.toLowerCase());
  } catch {
    return false;
  }
}

function toDate(value) {
  return value instanceof Date ? value : new Date(value);
}

const templateFilters = {
  // 5. November 2026
  dateDe(value) {
    return new Intl.DateTimeFormat("de-DE", { day: "numeric", month: "long", year: "numeric", timeZone: TIME_ZONE }).format(toDate(value));
  },
  // 2026-11-05
  isoDate(value) {
    return toDate(value).toISOString().slice(0, 10);
  },
  // RFC 822 date for the RSS feed
  rfc822(value) {
    return toDate(value).toUTCString();
  },
  // Keeps Unsplash's own parameters and sets the width.
  unsplash(url, width) {
    if (!url) return "";
    const parsed = new URL(url);
    parsed.searchParams.set("w", String(width));
    parsed.searchParams.set("q", parsed.searchParams.get("q") || "70");
    parsed.searchParams.set("auto", "format");
    parsed.searchParams.set("fit", "crop");
    return parsed.toString();
  },
  // Adds the referral parameters Unsplash requires on credit links.
  utm(url) {
    const base = url || "https://unsplash.com/";
    return base + (base.includes("?") ? "&" : "?") + UTM;
  },
  readingMinutes(html) {
    const words = String(html || "").replace(/<[^>]+>/g, " ").trim().split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.round(words / 200));
  },
  findCategory(categories, slug) {
    return (categories || []).find((category) => category.slug === slug) || null;
  },
  postSchema(post, site, taxonomy, pageUrl) {
    return buildPostSchema(post, site, taxonomy, pageUrl);
  },
  listSchema(listing, site) {
    return buildListSchema(listing, site);
  },
  jsonLd(value) {
    // Prevents text inside the JSON from ending the script tag.
    return JSON.stringify(value).replace(/</g, "\\u003c");
  },
};

module.exports = { isExternal, templateFilters };
