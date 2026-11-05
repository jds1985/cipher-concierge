export const MAX_MSG_CHARS = 500, MAX_MSGS = 8;
// Accept only user/assistant turns from the browser; system prompt is server-only.
export function sanitizeMessages(input) {
  if (!Array.isArray(input)) return null;
  const out = input
    .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
    .slice(-MAX_MSGS)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_MSG_CHARS).replace(/[\u0000-\u0008\u000B-\u001F]/g, "") }));
  if (!out.length || out[out.length - 1].role !== "user" || !out[out.length - 1].content.trim()) return null;
  return out;
}
