const test = require("node:test");
const assert = require("node:assert");
const crypto = require("node:crypto");
const { classify } = require("../../scripts/lib/ai-result");
const { selectForPublishing, waitingDrafts, isBotPost } = require("../../scripts/lib/pull-requests");
const { signedJwt, previousMonth, improvementNotes, buildReport, isEnabled } = require("../../scripts/lib/gsc");
const schemas = require("../../scripts/lib/schemas");
const { collectSuggestions } = require("../../scripts/lib/autocomplete");

test("failures are classified", () => {
  assert.strictEqual(classify("Claude usage limit reached, resets at 3pm"), "limit");
  assert.strictEqual(classify("API Error: 429 too many requests"), "limit");
  assert.strictEqual(classify("Invalid API key"), "auth");
  assert.strictEqual(classify("OAuth token has expired"), "auth");
  assert.strictEqual(classify("something else"), "other");
});

const pr = (extra) => ({ headRefName: "post/a", isCrossRepository: false, author: { login: "app/github-actions" }, labels: [{ name: "passed" }], createdAt: "2026-11-09T10:00:00Z", ...extra });

test("only the bot's own post branches can publish", () => {
  assert.ok(isBotPost(pr()));
  assert.ok(!isBotPost(pr({ isCrossRepository: true })));
  assert.ok(!isBotPost(pr({ author: { login: "stranger" } })));
  assert.ok(!isBotPost(pr({ headRefName: "fix/a" })));
});
test("publishing follows the labels and AUTO_PUBLISH", () => {
  const passed = pr({ number: 1 });
  const review = pr({ number: 2, labels: [{ name: "needs-review" }] });
  const approved = pr({ number: 3, labels: [{ name: "needs-review" }, { name: "approved" }], createdAt: "2026-11-12T10:00:00Z" });
  assert.deepStrictEqual(selectForPublishing([passed, review], true).map((p) => p.number), [1]);
  assert.deepStrictEqual(selectForPublishing([passed, review], false), []);
  assert.deepStrictEqual(selectForPublishing([passed, approved], true).map((p) => p.number), [3, 1]);
  assert.deepStrictEqual(selectForPublishing([approved], false).map((p) => p.number), [3]);
  assert.deepStrictEqual(selectForPublishing([pr({ isCrossRepository: true, labels: [{ name: "approved" }] })], true), []);
  assert.strictEqual(waitingDrafts([passed, review], true), 1);
  assert.strictEqual(waitingDrafts([passed, review], false), 2);
});

test("Search Console stays off without the secret", () => {
  assert.strictEqual(isEnabled({}), false);
  assert.strictEqual(isEnabled({ GSC_SERVICE_ACCOUNT_JSON: "  " }), false);
  assert.strictEqual(isEnabled({ GSC_SERVICE_ACCOUNT_JSON: "{}" }), true);
});
test("the Google sign-in token is correctly signed", () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
  const jwt = signedJwt({ client_email: "a@b.iam.gserviceaccount.com", private_key: privateKey.export({ type: "pkcs8", format: "pem" }) });
  const [header, claims, signature] = jwt.split(".");
  assert.ok(crypto.createVerify("RSA-SHA256").update(`${header}.${claims}`).verify(publicKey, Buffer.from(signature, "base64url")));
  assert.match(JSON.parse(Buffer.from(claims, "base64url")).scope, /webmasters\.readonly/);
});
test("the report covers the previous month and suggests improvements", () => {
  assert.deepStrictEqual(previousMonth(new Date("2026-12-01T08:00:00Z")), { startDate: "2026-11-01", endDate: "2026-11-30", label: "2026-11" });
  const cfg = { improve_min_impressions: 100, improve_max_ctr: 0.02, improve_position_from: 8, improve_position_to: 20 };
  const row = { keys: ["https://blog.djmostar.de/a/"], clicks: 1, impressions: 500, ctr: 0.002, position: 12.3 };
  assert.strictEqual(improvementNotes(row, cfg).length, 2);
  const report = buildReport({ label: "2026-11", pages: [row], keywords: [{ name: "DJ Hamburg", position: 9, clicks: 2 }], previous: { "DJ Hamburg": 11 }, cfg });
  assert.match(report, /Veränderung 2\.0/);
  assert.match(report, /Beiträge zum Verbessern/);
});
test("schemas contain no apostrophes", () => {
  for (const schema of Object.values(schemas)) assert.ok(!JSON.stringify(schema).includes("'"));
});
test("autocomplete failures don't stop the run", async () => {
  const fake = async (url) => {
    if (url.includes("kaputt")) throw new Error("blocked");
    return { ok: true, headers: new Map([["content-type", "text/javascript; charset=ISO-8859-1"]]), arrayBuffer: async () => Buffer.from('["x",["hochzeits dj nähe"]]', "latin1") };
  };
  const result = await collectSuggestions(["gut", "kaputt"], fake);
  assert.deepStrictEqual(result.suggestions, ["hochzeits dj nähe"]);
  assert.strictEqual(result.errors.length, 1);
});
