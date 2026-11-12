// Aggregate usage counters only. Never stores guest message text, chat notes, or room-level chat logs.
// Keys: cc:v1:stat:<hotelId>:day:<YYYY-MM-DD> → { questions, byIntent, requestsCreated, requestsDone }
// Retention ~90 days via TTL. Soft-fails so chat/requests never break if Redis is down.
import { storePrefix, kvGetJson, kvSetJson } from "./store.js";

export const STAT_TTL_SEC = 60 * 60 * 24 * 90; // ~90 days
const INTENT_RE = /^[a-z0-9_]{1,40}$/i;

function dayKey(hotelId, ymd) {
  return `${storePrefix()}stat:${hotelId}:day:${ymd}`;
}

/** UTC calendar day YYYY-MM-DD for a Date (or now). */
export function utcDay(d = new Date()) {
  const x = d instanceof Date ? d : new Date(d);
  return x.toISOString().slice(0, 10);
}

export function normalizeIntent(intent) {
  if (typeof intent !== "string" || !intent) return "unknown";
  const s = intent.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40);
  return INTENT_RE.test(s) ? s : "unknown";
}

function emptyDay() {
  return { questions: 0, byIntent: {}, requestsCreated: 0, requestsDone: 0 };
}

async function loadDay(hotelId, ymd) {
  const raw = await kvGetJson(dayKey(hotelId, ymd));
  if (!raw || typeof raw !== "object") return emptyDay();
  return {
    questions: Number(raw.questions) || 0,
    byIntent: raw.byIntent && typeof raw.byIntent === "object" ? { ...raw.byIntent } : {},
    requestsCreated: Number(raw.requestsCreated) || 0,
    requestsDone: Number(raw.requestsDone) || 0,
  };
}

async function saveDay(hotelId, ymd, day) {
  await kvSetJson(dayKey(hotelId, ymd), day, STAT_TTL_SEC);
}

/**
 * Soft bump after a successful /api/chat answer. Never receives or stores message text.
 * @param {{ hotelId: string, intent?: string }} opts
 */
export async function bumpQuestion(opts) {
  try {
    const hotelId = opts?.hotelId;
    if (typeof hotelId !== "string" || !hotelId) return;
    const intent = normalizeIntent(opts.intent);
    const ymd = utcDay();
    const day = await loadDay(hotelId, ymd);
    day.questions += 1;
    day.byIntent[intent] = (Number(day.byIntent[intent]) || 0) + 1;
    await saveDay(hotelId, ymd, day);
  } catch {
    // soft-fail: stats must never break chat
  }
}

export async function bumpRequestCreated(hotelId) {
  try {
    if (typeof hotelId !== "string" || !hotelId) return;
    const ymd = utcDay();
    const day = await loadDay(hotelId, ymd);
    day.requestsCreated += 1;
    await saveDay(hotelId, ymd, day);
  } catch { /* soft-fail */ }
}

export async function bumpRequestDone(hotelId) {
  try {
    if (typeof hotelId !== "string" || !hotelId) return;
    const ymd = utcDay();
    const day = await loadDay(hotelId, ymd);
    day.requestsDone += 1;
    await saveDay(hotelId, ymd, day);
  } catch { /* soft-fail */ }
}

function daysForRange(range) {
  const n = range === "today" ? 1 : range === "30d" ? 30 : 7;
  const out = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
    out.push(utcDay(d));
  }
  return out;
}

/**
 * Aggregate counters for a hotel over today | 7d | 30d.
 * @returns {{ range, questions, requestsCreated, requestsDone, byIntent: {intent, count}[] }}
 */
export async function getStats(hotelId, range = "7d") {
  const r = ["today", "7d", "30d"].includes(range) ? range : "7d";
  const totals = emptyDay();
  for (const ymd of daysForRange(r)) {
    const day = await loadDay(hotelId, ymd);
    totals.questions += day.questions;
    totals.requestsCreated += day.requestsCreated;
    totals.requestsDone += day.requestsDone;
    for (const [k, v] of Object.entries(day.byIntent || {})) {
      totals.byIntent[k] = (totals.byIntent[k] || 0) + (Number(v) || 0);
    }
  }
  const byIntent = Object.entries(totals.byIntent)
    .map(([intent, count]) => ({ intent, count }))
    .sort((a, b) => b.count - a.count || a.intent.localeCompare(b.intent));
  return {
    range: r,
    questions: totals.questions,
    requestsCreated: totals.requestsCreated,
    requestsDone: totals.requestsDone,
    byIntent,
  };
}

/** Test helper: raw day bucket (or empty). */
export async function _getDay(hotelId, ymd) {
  return loadDay(hotelId, ymd || utcDay());
}
