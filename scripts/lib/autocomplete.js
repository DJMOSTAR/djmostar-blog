// Free keyword ideas from Google autocomplete for Germany.
// This endpoint is unofficial and may change or block requests, so an empty result is allowed.
// No search volumes exist here: volumes are always recorded as "unknown".
async function suggestions(term, fetchImpl = fetch) {
  const url = `https://suggestqueries.google.com/complete/search?client=firefox&hl=de&gl=de&q=${encodeURIComponent(term)}`;
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(10000), headers: { "User-Agent": "Mozilla/5.0" } });
  if (!response.ok) throw new Error(`Autocomplete HTTP ${response.status}`);
  const charset = /charset=([^;]+)/i.exec(response.headers.get("content-type") || "");
  const text = new TextDecoder(charset ? charset[1].trim() : "utf-8").decode(await response.arrayBuffer());
  const parsed = JSON.parse(text);
  return Array.isArray(parsed[1]) ? parsed[1].map(String) : [];
}

async function collectSuggestions(terms, fetchImpl = fetch) {
  const found = new Set();
  const errors = [];
  for (const term of terms) {
    try {
      for (const suggestion of await suggestions(term, fetchImpl)) found.add(suggestion);
    } catch (error) {
      errors.push(`${term}: ${error.message}`);
    }
  }
  return { suggestions: [...found], errors };
}

module.exports = { suggestions, collectSuggestions };
