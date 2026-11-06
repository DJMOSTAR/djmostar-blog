// What people in Germany are searching for right now, from Google's free public feed.
// Most entries have nothing to do with events, so Claude only uses them when they really fit.
// The feed is not an official API: if it fails, planning continues without it.
function parseTitles(xml) {
  const items = String(xml).match(/<item>[\s\S]*?<\/item>/g) || [];
  return items
    .map((item) => (/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/.exec(item) || [])[1])
    .filter(Boolean)
    .map((title) => title.replace(/&amp;/g, "&").trim());
}

async function germanTrends(fetchImpl = fetch) {
  try {
    const response = await fetchImpl("https://trends.google.de/trending/rss?geo=DE", { signal: AbortSignal.timeout(10000), headers: { "User-Agent": "Mozilla/5.0" } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return parseTitles(await response.text()).slice(0, 25);
  } catch (error) {
    console.warn(`Trends feed skipped: ${error.message}`);
    return [];
  }
}

module.exports = { parseTitles, germanTrends };
