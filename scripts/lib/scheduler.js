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

// Returns what to start now, with the updated state.
function decide(now, schedule, state, { hasSearchConsole = false } = {}) {
  const slots = { ...(state.slots || {}) };
  const actions = [];
  for (const slot of dueSlots(now, schedule)) {
    if (slots[slot.key]) continue;
    if (slot.workflow === "report" && !hasSearchConsole) continue;
    slots[slot.key] = { status: "dispatched", firstAt: now.toISOString(), retries: 0 };
    actions.push({ workflow: slot.workflow, slot: slot.key, limitRetry: 0 });
  }
  for (const [key, entry] of Object.entries(slots)) {
    if (entry.status === "retry_wait" && new Date(entry.retryAt) <= now) {
      slots[key] = { ...entry, status: "dispatched" };
      actions.push({ workflow: "generate", slot: key, limitRetry: entry.retries });
    }
  }
  const cutoff = now.getTime() - 60 * 86400000;
  for (const [key, entry] of Object.entries(slots)) {
    if (new Date(entry.firstAt).getTime() < cutoff) delete slots[key];
  }
  return { actions, state: { ...state, slots } };
}

// Next retry time, or null when all retries are used.
function nextRetry(entry, retryHours, now) {
  const retries = entry.retries || 0;
  if (retries >= retryHours.length) return null;
  const first = new Date(entry.firstAt || now).getTime();
  const planned = first + retryHours[retries] * 3600000;
  return { retries: retries + 1, retryAt: new Date(Math.max(planned, now.getTime() + 3600000)).toISOString() };
}

function tokenWarning(createdDate, now, warningDays, alreadyWarnedFor) {
  if (!createdDate || alreadyWarnedFor === createdDate) return null;
  const created = new Date(`${createdDate}T00:00:00Z`);
  if (Number.isNaN(created.getTime())) return null;
  const expires = new Date(created.getTime() + 365 * 86400000);
  const daysLeft = Math.ceil((expires - now) / 86400000);
  return daysLeft <= warningDays ? { daysLeft, expires: expires.toISOString().slice(0, 10) } : null;
}

module.exports = { localParts, dueSlots, decide, nextRetry, tokenWarning };
