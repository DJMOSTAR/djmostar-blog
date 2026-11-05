// Builds every page of the blog index and of each category.
function pagesFor(posts, perPage, baseUrl, category) {
  const chunks = [];
  for (let i = 0; i < posts.length; i += perPage) chunks.push(posts.slice(i, i + perPage));
  if (chunks.length === 0) chunks.push([]);

  return chunks.map((items, index) => {
    const number = index + 1;
    const urlFor = (n) => (n === 1 ? baseUrl : `${baseUrl}seite/${n}/`);
    const suffix = number > 1 ? ` (Seite ${number})` : "";
    return {
      url: urlFor(number),
      metaTitle: category
        ? `${category.name}: Tipps im Blog${suffix} | DJ MOSTAR`
        : `DJ MOSTAR Blog: Tipps für Feiern in Hamburg${suffix}`,
      metaDescription: category
        ? `Beiträge zum Thema ${category.name}: praktische Tipps für die Planung in Hamburg und Umgebung von DJ MOSTAR.`
        : "Praktische Tipps von DJ MOSTAR für Hochzeiten, Firmenevents und private Feiern in Hamburg und Umgebung: Planung, Musik und Ablauf.",
      category,
      posts: items,
      number,
      total: chunks.length,
      previousUrl: number > 1 ? urlFor(number - 1) : null,
      nextUrl: number < chunks.length ? urlFor(number + 1) : null,
    };
  });
}

function buildListPages(posts, categories, perPage) {
  const pages = pagesFor(posts, perPage, "/", null);
  for (const category of categories) {
    const inCategory = posts.filter((post) => (post.data ? post.data.category : post.category) === category.slug);
    pages.push(...pagesFor(inCategory, perPage, `/kategorie/${category.slug}/`, category));
  }
  return pages;
}

module.exports = { buildListPages };
