// Guest-to-staff requests. Stores ONLY an explicit request (type, room, short note, times, status).
// Never stores chat content. Keys: cc:v1:req:<hotelId>:<id> (JSON), cc:v1:reqlist:<hotelId> (newest first, capped).
import crypto from "crypto";
import { storePrefix, kvGetJson, kvSetJson, kvLPushTrim, kvLRange } from "./store.js";
import { bumpRequestCreated, bumpRequestDone } from "./stats.js";

export const REQUEST_TYPES = { towels: "Towels", housekeeping: "Housekeeping", maintenance: "Something broken" };
export const MAX_NOTE = 200;
export const MAX_LIST = 200;
const REQ_TTL_SEC = 60 * 60 * 24 * 30; // requests expire after 30 days

const reqKey = (hotelId, id) => `${storePrefix()}req:${hotelId}:${id}`;
const listKey = (hotelId) => `${storePrefix()}reqlist:${hotelId}`;

export function cleanNote(note) {
  if (typeof note !== "string") return "";
  return note.replace(/[\u0000-\u001F\u007F<>]/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_NOTE);
}

export function validId(id) {
  return typeof id === "string" && /^[A-Za-z0-9_-]{8,40}$/.test(id);
}

export async function createRequest({ hotelId, roomId, type, note }) {
  if (!REQUEST_TYPES[type]) throw new Error("bad type");
  const id = crypto.randomBytes(9).toString("base64url");
  const r = { id, hotelId, roomId: String(roomId), type, note: cleanNote(note), status: "open", createdAt: new Date().toISOString() };
  await kvSetJson(reqKey(hotelId, id), r, REQ_TTL_SEC);
  await kvLPushTrim(listKey(hotelId), id, MAX_LIST);
  await bumpRequestCreated(hotelId);
  return r;
}

export async function getRequest(hotelId, id) {
  if (!validId(id)) return null;
  const r = await kvGetJson(reqKey(hotelId, id));
  return r && typeof r === "object" && r.hotelId === hotelId ? r : null;
}

export async function listRequests(hotelId, { status } = {}) {
  const ids = await kvLRange(listKey(hotelId), 0, MAX_LIST - 1);
  const out = [];
  for (const id of ids) {
    const r = await getRequest(hotelId, String(id));
    if (r && (!status || r.status === status)) out.push(r);
  }
  return out;
}

export async function markRequestDone(hotelId, id) {
  const r = await getRequest(hotelId, id);
  if (!r) return null;
  if (r.status !== "done") {
    r.status = "done";
    r.doneAt = new Date().toISOString();
    await kvSetJson(reqKey(hotelId, id), r, REQ_TTL_SEC);
    await bumpRequestDone(hotelId);
  }
  return r;
}
