// The exact shape Claude must return. Avoid apostrophes here: the schema is passed in claude_args.
const text = { type: "string" };
const strings = { type: "array", items: text };
const image = { type: "object", properties: { id: text, alt: text }, required: ["id", "alt"], additionalProperties: false };

const article = {
  type: "object",
  properties: {
    title: text, seoTitle: text, description: text, subtitle: text, excerpt: text, slug: text, category: text,
    tags: strings, primaryKeyword: text, secondaryKeywords: strings, body: text,
    faq: { type: "array", items: { type: "object", properties: { question: text, answer: text }, required: ["question", "answer"], additionalProperties: false } },
    sources: { type: "array", items: { type: "object", properties: { title: text, url: text }, required: ["title", "url"], additionalProperties: false } },
    featured: image,
    inlineImages: { type: "array", items: image },
  },
  required: ["title", "seoTitle", "description", "subtitle", "excerpt", "slug", "category", "tags", "primaryKeyword", "secondaryKeywords", "body", "faq", "sources", "featured", "inlineImages"],
  additionalProperties: false,
};

const score = { type: "number", minimum: 0, maximum: 100 };
const editor = {
  type: "object",
  properties: {
    scores: {
      type: "object",
      properties: { factualSafety: score, brandVoice: score, addressForm: score, seo: score, readability: score, grammar: score },
      required: ["factualSafety", "brandVoice", "addressForm", "seo", "readability", "grammar"],
      additionalProperties: false,
    },
    overall: score,
    issues: strings,
    corrected: { anyOf: [article, { type: "null" }] },
  },
  required: ["scores", "overall", "issues", "corrected"],
  additionalProperties: false,
};

const topics = {
  type: "object",
  properties: {
    topics: {
      type: "array",
      items: {
        type: "object",
        properties: { title: text, category: text, seeds: strings, imageQueries: strings, tags: strings },
        required: ["title", "category", "seeds", "imageQueries", "tags"],
        additionalProperties: false,
      },
    },
  },
  required: ["topics"],
  additionalProperties: false,
};

module.exports = { article, editor, topics };
