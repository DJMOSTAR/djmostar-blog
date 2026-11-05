// Google Search Console, read-only. Off until GSC_SERVICE_ACCOUNT_JSON exists.
const crypto = require("node:crypto");
const { retry } = require("./retry");

const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const isEnabled = (env = process.env) => Boolean(env.GSC_SERVICE_ACCOUNT_JSON && env.GSC_SERVICE_ACCOUNT_JSON.trim());
const base64url = (value) => Buffer.from(value).toString("base64url");

function signedJwt(account, now = Date.now()) {
  const issued = Math.floor(now / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64url(JSON.stringify({ iss: account.client_email, scope: SCOPE, aud: "https://oauth2.googleapis.com/token", iat: issued, exp: issued + 3600 }));
  const signature = crypto.createSign("RSA-SHA256").update(`${header}.${claims}`).sign(account.private_key).toString("base64url");
  return `${header}.${claims}.${signature}`;
}

async function accessToken(account, fetchImpl = fetch) {
  const response = await fetchImpl("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: signedJwt(account) }),
  });
  if (!response.ok) throw new Error(`Google sign-in failed: HTTP ${response.status}`);
  return (await response.json()).access_token;
}

function client(env = process.env, fetchImpl = fetch) {
  const account = JSON.parse(env.GSC_SERVICE_ACCOUNT_JSON);
  let token;
  return async function query(property, body) {
    token = token || (await accessToken(account, fetchImpl));
    return retry(async () => {
      const response = await fetchImpl(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/searchAnalytics/query`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!response.ok) throw new Error(`Search Console HTTP ${response.status}`);
      return (await response.json()).rows || [];
    }, { label: "Search Console" });
  };
}

const blogFilter = (host) => [{ filters: [{ dimension: "page", operator: "contains", expression: host }] }];

// Calendar month before the given date.
function previousMonth(now) {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 0));
  const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), 1));
  const day = (date) => date.toISOString().slice(0, 10);
  return { startDate: day(start), endDate: day(end), label: day(start).slice(0, 7) };
}

async function blogQueries(cfg, env = process.env, fetchImpl = fetch) {
  if (!isEnabled(env)) return [];
  const now = new Date();
  const start = new Date(now.getTime() - 90 * 86400000).toISOString().slice(0, 10);
  const query = client(env, fetchImpl);
  const rows = await query(cfg.property, { startDate: start, endDate: now.toISOString().slice(0, 10), dimensions: ["query"], dimensionFilterGroups: blogFilter(cfg.blog_host), rowLimit: 100 });
  return rows.map((row) => row.keys[0]);
}

function improvementNotes(row, cfg) {
  const notes = [];
  if (row.impressions >= cfg.improve_min_impressions && row.ctr <= cfg.improve_max_ctr) notes.push("Viele Impressionen, wenig Klicks: SEO-Titel und Meta-Beschreibung konkreter formulieren.");
  if (row.position >= cfg.improve_position_from && row.position <= cfg.improve_position_to) notes.push("Position 8 bis 20: einen Abschnitt zu verwandten Suchanfragen ergänzen und aus anderen Beiträgen intern verlinken.");
  return notes;
}

function formatPercent(value) {
  return `${(value * 100).toFixed(1)} %`;
}

function buildReport({ label, pages, keywords, previous, cfg }) {
  const lines = [`# Blog-Bericht ${label}`, "", "Daten aus der Google Search Console. Suchvolumen sind unbekannt.", "", "## Beste Beiträge", ""];
  const top = [...pages].sort((a, b) => b.clicks - a.clicks).slice(0, 10);
  if (top.length === 0) lines.push("Noch keine Daten.");
  for (const row of top) lines.push(`- ${row.keys[0]}: ${row.clicks} Klicks, ${row.impressions} Impressionen, CTR ${formatPercent(row.ctr)}, Position ${row.position.toFixed(1)}`);
  lines.push("", "## Keyword-Positionen", "");
  for (const keyword of keywords) {
    const before = previous[keyword.name];
    const change = keyword.position == null || before == null ? "keine Veränderung messbar" : `Veränderung ${(before - keyword.position).toFixed(1)}`;
    lines.push(`- ${keyword.name}: ${keyword.position == null ? "keine Daten" : `Position ${keyword.position.toFixed(1)}, ${keyword.clicks} Klicks`} (${change})`);
  }
  lines.push("", "## Beiträge zum Verbessern", "");
  const toImprove = pages.map((row) => ({ row, notes: improvementNotes(row, cfg) })).filter((entry) => entry.notes.length);
  if (toImprove.length === 0) lines.push("Keine Auffälligkeiten.");
  for (const { row, notes } of toImprove) lines.push(`- ${row.keys[0]}`, ...notes.map((note) => `  - ${note}`));
  return `${lines.join("\n")}\n`;
}

module.exports = { isEnabled, signedJwt, client, blogFilter, previousMonth, blogQueries, improvementNotes, buildReport };
