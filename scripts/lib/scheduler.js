// Decides which slot is due, in Berlin time. GitHub cron only knows UTC and can't read
// config/schedule.yml, so an hourly run asks this file what to do.
const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function localParts(date, timeZone) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "long", hourCycle: "h23" }).formatToParts(date).map((part) => [part.type, part.value]));
  return { dateKey: `${parts.year}-${parts.month}-${parts.day}`, weekday: parts.weekday.toLowerCase(), day: Number(parts.day), minutes: Number(parts.hour) * 60 + Number(parts.minute), month: `${parts.year}-${parts.month}` };
}

const toMinutes = (time) => { const [hour, minute] = time.split(":").map(Number); return hour * 60 + minute; };

// Slots that started within the catch-up window. Also looks at yesterday for runs after midnight.
function dueSlots(now, schedule) {
  const windowMinutes = schedule.catch_up_hours * 60;
  const today = localParts(now, schedule.time_zone);
  const yesterday = localParts(new Date(now.getTime() - 86400000), schedule.time_zone);
  const due = [];
  for (const [workflow, slots] of [["generate", schedule.generate], ["publish", schedule.publish]]) {
    for (const slot of slots) {
      if (!DAYS.includes(slot.day)) throw new Error(`Unknown day in config/schedule.yml: ${slot.day}`);
      for (const [local, offset] of [[today, 0], [yesterday, 1440]]) {
        if (local.weekday !== slot.day) continue;
        const elapsed = today.minutes + offset - toMinutes(slot.time);
        if (elapsed >= 0 && elapsed <= windowMinutes) due.push({ workflow, key: `${workflow}-${local.dateKey}` });
      }
    }
  }
  const report = schedule.report;
  if (report && today.day === report.day_of_month) {
    const elapsed = today.minutes - toMinutes(report.time);
    if (elapsed >= 0 && elapsed <= windowMinutes) due.push({ workflow: "report", key: `report-${today.month}` });
  }
  return due;
}

// Returns what to start now, with the updated state. The monthly report always runs: it
// lists the retries, and adds Search Console figures once that is switched on.
function decide(now, schedule, state) {
  const slots = { ...(state.slots || {}) };
  const actions = [];
  for (const slot of dueSlots(now, schedule)) {
    if (slots[slot.key]) continue;
    slots[slot.key] = { status: "dispatched", firstAt: now.toISOString(), retries: 0 };
    actions.push({ workflow: slot.workflow, slot: slot.key, limitRetry: 0 });
  }
  for (const [key, entry] of Object.entries(slots)) {
    if (entry.status === "retry_wait" && new Date(entry.retryAt) <= now) {
      slots[key] = { ...entry, status: "dispatched" };
      actions.push({ workflow: "generate", slot: key, limitRetry: entry.limitChecks || 0 });
    }
  }
  const cutoff = now.getTime() - 60 * 86400000;
  for (const [key, entry] of Object.entries(slots)) {
    if (new Date(entry.firstAt).getTime() < cutoff) delete slots[key];
  }
  return { actions, state: { ...state, slots } };
}

// At a usage limit or after an outage: check again in an hour, at most limit_checks times.
// Returns null when all checks are used.
function nextLimitCheck(entry, retries, now) {
  const checks = entry.limitChecks || 0;
  if (checks >= retries.limit_checks) return null;
  return { limitChecks: checks + 1, retryAt: new Date(now.getTime() + retries.limit_wait_hours * 3600000).toISOString() };
}

// The UTC time of a Berlin date and clock time, including summer time.
function slotTime(dateKey, time, timeZone) {
  const [year, month, day] = dateKey.split("-").map(Number);
  const target = Date.UTC(year, month - 1, day) + toMinutes(time) * 60000;
  let guess = target;
  for (let round = 0; round < 3; round += 1) {
    const local = localParts(new Date(guess), timeZone);
    const [ly, lm, ld] = local.dateKey.split("-").map(Number);
    const shown = Date.UTC(ly, lm - 1, ld) + local.minutes * 60000;
    guess += target - shown;
  }
  return new Date(guess);
}

function slotsBetween(list, from, days, timeZone, direction) {
  const found = [];
  for (let offset = 0; offset <= days; offset += 1) {
    const local = localParts(new Date(from.getTime() + direction * offset * 86400000), timeZone);
    for (const slot of list) {
      if (slot.day === local.weekday) found.push({ dateKey: local.dateKey, at: slotTime(local.dateKey, slot.time, timeZone) });
    }
  }
  return found;
}

// The publish slot an article from this generate run belongs to: the first publish slot after
// its generate slot. Runs started by hand belong to the latest generate slot before now.
function publishTarget(generateKey, now, schedule) {
  const tz = schedule.time_zone;
  let generatedAt = null;
  const match = /^generate-(\d{4}-\d{2}-\d{2})$/.exec(generateKey || "");
  if (match) {
    const weekday = localParts(slotTime(match[1], "12:00", tz), tz).weekday;
    const slot = schedule.generate.find((entry) => entry.day === weekday);
    if (slot) generatedAt = slotTime(match[1], slot.time, tz);
  }
  if (!generatedAt) {
    const earlier = slotsBetween(schedule.generate, now, 8, tz, -1).filter((slot) => slot.at <= now).sort((a, b) => b.at - a.at);
    if (!earlier.length) return null;
    generatedAt = earlier[0].at;
  }
  const next = slotsBetween(schedule.publish, generatedAt, 8, tz, 1).filter((slot) => slot.at > generatedAt).sort((a, b) => a.at - b.at)[0];
  return next ? { key: `publish-${next.dateKey}`, at: next.at.toISOString() } : null;
}

function tokenWarning(createdDate, now, warningDays, alreadyWarnedFor) {
  if (!createdDate || alreadyWarnedFor === createdDate) return null;
  const created = new Date(`${createdDate}T00:00:00Z`);
  if (Number.isNaN(created.getTime())) return null;
  const expires = new Date(created.getTime() + 365 * 86400000);
  const daysLeft = Math.ceil((expires - now) / 86400000);
  return daysLeft <= warningDays ? { daysLeft, expires: expires.toISOString().slice(0, 10) } : null;
}

module.exports = { localParts, dueSlots, decide, nextLimitCheck, slotTime, publishTarget, tokenWarning };
