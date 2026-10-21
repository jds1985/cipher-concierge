// Safe renderer: **bold** only; React escapes everything else.
export default function RichText({ text }) {
  return String(text).split(/(\*\*[^*]+\*\*)/g).map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? <strong key={i}>{p.slice(2, -2)}</strong> : <span key={i}>{p}</span>);
}
