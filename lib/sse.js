// Buffered SSE parser: events split across network chunks are reassembled (fixes the old word-drop bug,
// where each chunk was split on "\n" independently and partial JSON lines were silently discarded).
export function createSSEParser(onData) {
  let buf = "";
  return {
    push(text) {
      buf += text;
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).replace(/\r$/, "");
        buf = buf.slice(i + 1);
        if (line.startsWith("data:")) onData(line.slice(5).trim());
      }
    },
    end() { if (buf.startsWith("data:")) onData(buf.slice(5).trim()); buf = ""; },
  };
}
export function tokenFromData(d) {
  if (!d || d === "[DONE]") return "";
  try { const p = JSON.parse(d); return p.choices?.[0]?.delta?.content || p.choices?.[0]?.text || ""; } catch { return ""; }
}
