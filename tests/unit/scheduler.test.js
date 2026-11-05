const test = require("node:test");
const assert = require("node:assert");
const { dueSlots, decide, nextRetry, tokenWarning } = require("../../scripts/lib/scheduler");
const { pickTopic, acceptNewTopics } = require("../../scripts/lib/calendar");
const { isDryRun, isAutoPublish } = require("../../scripts/lib/config");
const { schedule, content } = require("./support");

const keys = (iso) => dueSlots(new Date(iso), schedule).map((slot) => slot.key);

test("Monday 09:17 in winter time starts generation", () => {
  assert.deepStrictEqual(keys("2026-11-09T08:17:00Z"), ["generate-2026-11-09"]);
});
test("Monday 09:17 in summer time starts generation", () => {
  assert.deepStrictEqual(keys("2027-06-07T07:17:00Z"), ["generate-2027-06-07"]);
});
test("08:17 Berlin is still too early", () => {
  assert.deepStrictEqual(keys("2026-11-09T07:17:00Z"), []);
});
test("Friday 10:17 starts publishing", () => {
  assert.deepStrictEqual(keys("2026-11-13T09:17:00Z"), ["publish-2026-11-13"]);
});
test("a late scheduler catches up within the window only", () => {
  assert.deepStrictEqual(keys("2026-11-09T15:00:00Z"), ["generate-2026-11-09"]);
  assert.deepStrictEqual(keys("2026-11-09T18:00:00Z"), []);
});
test("a slot runs once", () => {
  const first = decide(new Date("2026-11-09T08:17:00Z"), schedule, { slots: {} });
  assert.strictEqual(first.actions.length, 1);
  const second = decide(new Date("2026-11-09T09:17:00Z"), schedule, first.state);
  assert.strictEqual(second.actions.length, 0);
});
test("the report waits for Search Console", () => {
  const now = new Date("2026-12-01T07:17:00Z");
  assert.strictEqual(decide(now, schedule, { slots: {} }).actions.length, 0);
  assert.strictEqual(decide(now, schedule, { slots: {} }, { hasSearchConsole: true }).actions[0].workflow, "report");
});
test("limit retries run at planned times, then stop", () => {
  const first = "2026-11-09T08:17:00Z";
  const one = nextRetry({ firstAt: first, retries: 0 }, schedule.limit_retry_hours, new Date(first));
  assert.strictEqual(one.retries, 1);
  assert.strictEqual(one.retryAt, "2026-11-09T10:47:00.000Z");
  assert.strictEqual(nextRetry({ firstAt: first, retries: 3 }, schedule.limit_retry_hours, new Date(first)), null);
  const state = { slots: { "generate-2026-11-09": { status: "retry_wait", firstAt: first, retries: 1, retryAt: one.retryAt } } };
  assert.strictEqual(decide(new Date("2026-11-09T10:17:00Z"), schedule, state).actions.length, 0);
  const due = decide(new Date("2026-11-09T11:17:00Z"), schedule, state);
  assert.deepStrictEqual(due.actions[0], { workflow: "generate", slot: "generate-2026-11-09", limitRetry: 1 });
});
test("the token warning starts 30 days before expiry and fires once", () => {
  assert.strictEqual(tokenWarning("2026-11-05", new Date("2027-08-01T00:00:00Z"), 30, null), null);
  assert.strictEqual(tokenWarning("2026-11-05", new Date("2027-10-20T00:00:00Z"), 30, null).expires, "2027-11-05");
  assert.strictEqual(tokenWarning("2026-11-05", new Date("2027-10-20T00:00:00Z"), 30, "2026-11-05"), null);
});
test("test mode is the default, and publishing needs an explicit true", () => {
  assert.strictEqual(isDryRun({}), true);
  assert.strictEqual(isDryRun({ DRY_RUN: "true" }), true);
  assert.strictEqual(isDryRun({ DRY_RUN: "false" }), false);
  assert.strictEqual(isDryRun({ DRY_RUN: "false", DRY_RUN_INPUT: "true" }), true);
  assert.strictEqual(isAutoPublish({}), false);
  assert.strictEqual(isAutoPublish({ AUTO_PUBLISH: "true" }), true);
});
test("topics: priority first, then season, then category balance", () => {
  const topic = (title, category, extra = {}) => ({ title, category, status: "planned", ...extra });
  const november = new Date("2026-11-09T08:00:00Z");
  const calendar = { topics: [topic("Musik für Gäste", "musik"), topic("Weihnachtsfeier planen", "firmenfeier"), topic("Sommerfest", "firmenfeier")] };
  assert.strictEqual(pickTopic(calendar, {}, content, november).title, "Weihnachtsfeier planen");
  calendar.topics.push(topic("Wann buchen", "hochzeit", { priority: true }));
  assert.strictEqual(pickTopic(calendar, {}, content, november).title, "Wann buchen");
  assert.strictEqual(pickTopic({ topics: [] }, {}, content, november), null);
});
test("new topics: invalid and duplicate ideas are rejected", () => {
  const good = { title: "Licht auf der Hochzeit planen", category: "hochzeit", imageQueries: ["wedding lights", "dance floor"] };
  const result = acceptNewTopics([good, { ...good }, { title: "X", category: "nope", imageQueries: ["a", "b"] }], { topics: [] }, { posts: [] }, content);
  assert.strictEqual(result.accepted.length, 1);
  assert.strictEqual(result.rejected.length, 2);
});
