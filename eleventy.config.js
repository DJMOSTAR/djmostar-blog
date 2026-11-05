// Eleventy settings for the DJ MOSTAR blog.
const markdownIt = require("markdown-it");
const filters = require("./src/lib/filters");
const { buildListPages } = require("./src/lib/listing");
const { loadYaml } = require("./src/lib/config");

// Fonts are copied from npm packages, so visitors never connect to Google.
const FONTS = {
  "oswald/files/oswald-latin-700-normal.woff2": "oswald-700.woff2",
  "playfair-display/files/playfair-display-latin-400-italic.woff2": "playfair-400-italic.woff2",
  "playfair-display/files/playfair-display-latin-700-italic.woff2": "playfair-700-italic.woff2",
  "roboto/files/roboto-latin-400-normal.woff2": "roboto-400.woff2",
  "roboto/files/roboto-latin-500-normal.woff2": "roboto-500.woff2",
  "roboto/files/roboto-latin-700-normal.woff2": "roboto-700.woff2",
  "roboto/files/roboto-latin-400-italic.woff2": "roboto-400-italic.woff2",
};

module.exports = function (eleventyConfig) {
  const preview = Boolean(process.env.PREVIEW);
  if (!preview) eleventyConfig.ignores.add("tests/**");

  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });
  for (const [from, to] of Object.entries(FONTS)) {
    eleventyConfig.addPassthroughCopy({ [`node_modules/@fontsource/${from}`]: `assets/fonts/${to}` });
  }

  // External links open in a new tab. Links to djmostar.de stay in the same tab.
  const md = markdownIt({ html: true, linkify: false, typographer: false });
  const defaultLink = md.renderer.rules.link_open || ((tokens, i, options, env, self) => self.renderToken(tokens, i, options));
  md.renderer.rules.link_open = (tokens, i, options, env, self) => {
    const href = tokens[i].attrGet("href") || "";
    if (filters.isExternal(href)) {
      tokens[i].attrSet("target", "_blank");
      tokens[i].attrSet("rel", "noopener");
    }
    return defaultLink(tokens, i, options, env, self);
  };
  eleventyConfig.setLibrary("md", md);

  for (const [name, fn] of Object.entries(filters.templateFilters)) {
    eleventyConfig.addFilter(name, fn);
  }

  const postGlobs = ["content/posts/*.md", ...(preview ? ["tests/fixtures/*.md"] : [])];
  const byNewest = (api) => api.getFilteredByGlob(postGlobs).sort((a, b) => b.date - a.date);

  eleventyConfig.addCollection("posts", byNewest);
  eleventyConfig.addCollection("listPages", (api) => {
    const site = loadYaml("config/site.yml");
    const taxonomy = loadYaml("config/content.yml");
    return buildListPages(byNewest(api), taxonomy.categories, site.posts_per_page);
  });

  return {
    dir: { input: ".", includes: "src/_includes", data: "src/_data", output: "_site" },
    templateFormats: ["njk", "md"],
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: false, // AI text must never run as template code
  };
};
