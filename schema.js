// JSON-LD structured data. Business details stay limited to approved facts:
// areaServed only, no street address.
function business(site) {
  return {
    "@type": "EntertainmentBusiness",
    "@id": `${site.main_site}/#business`,
    name: "DJ MOSTAR",
    url: site.main_site,
    telephone: site.contact.phone_e164,
    email: site.contact.email,
    image: `${site.url}${site.logo.src}`,
    areaServed: { "@type": "City", name: "Hamburg" },
  };
}

function breadcrumbs(items) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}

function buildPostSchema(post, site, taxonomy, pageUrl) {
  const url = `${site.url}${pageUrl}`;
  const category = (taxonomy.categories || []).find((entry) => entry.slug === post.category);
  const crumbs = [
    { name: "Blog", url: `${site.url}/` },
    ...(category ? [{ name: category.name, url: `${site.url}/kategorie/${category.slug}/` }] : []),
    { name: post.title, url },
  ];
  const graph = [
    business(site),
    {
      "@type": "BlogPosting",
      "@id": `${url}#article`,
      mainEntityOfPage: url,
      headline: post.title,
      description: post.description,
      inLanguage: "de-DE",
      datePublished: new Date(post.date).toISOString(),
      dateModified: new Date(post.updated || post.date).toISOString(),
      image: post.featured ? post.featured.url : undefined,
      keywords: [post.primaryKeyword, ...(post.secondaryKeywords || [])].filter(Boolean).join(", "),
      articleSection: category ? category.name : undefined,
      author: { "@id": `${site.main_site}/#business` },
      publisher: { "@id": `${site.main_site}/#business` },
    },
    breadcrumbs(crumbs),
  ];
  if (post.faq && post.faq.length) {
    graph.push({
      "@type": "FAQPage",
      mainEntity: post.faq.map((entry) => ({
        "@type": "Question",
        name: entry.question,
        acceptedAnswer: { "@type": "Answer", text: entry.answer },
      })),
    });
  }
  return { "@context": "https://schema.org", "@graph": graph };
}

function buildListSchema(listing, site) {
  listing = listing || {};
  const crumbs = [{ name: "Blog", url: `${site.url}/` }];
  if (listing.category) crumbs.push({ name: listing.category.name, url: `${site.url}${listing.url}` });
  return {
    "@context": "https://schema.org",
    "@graph": [
      business(site),
      { "@type": "Blog", "@id": `${site.url}/#blog`, url: `${site.url}/`, name: site.name, inLanguage: "de-DE", publisher: { "@id": `${site.main_site}/#business` } },
      breadcrumbs(crumbs),
    ],
  };
}

module.exports = { buildPostSchema, buildListSchema };
