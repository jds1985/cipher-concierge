// Off-site food questions: fuzzy "restaurant" detection + cuisine tags. Never falls back to other cuisines.
const CUISINES = {
  asian: ["japanese", "sushi", "thai", "chinese", "vietnamese", "korean", "indian", "asian", "asian fusion", "hibachi", "izakaya"],
  japanese: ["japanese"], sushi: ["sushi"], hibachi: ["hibachi"], ramen: ["ramen"], thai: ["thai"], chinese: ["chinese"],
  vietnamese: ["vietnamese"], pho: ["vietnamese"], korean: ["korean"], indian: ["indian"], curry: ["indian", "thai"],
  mexican: ["mexican"], tacos: ["tacos", "mexican"], taco: ["tacos", "mexican"], burrito: ["mexican"], latin: ["latin"],
  italian: ["italian"], pizza: ["pizza", "italian"], pasta: ["italian"], bbq: ["bbq"], barbecue: ["bbq"],
  southern: ["southern"], steak: ["steak"], steakhouse: ["steak"], seafood: ["seafood"], burger: ["burgers"], burgers: ["burgers"],
  mediterranean: ["mediterranean"], greek: ["greek", "mediterranean"], french: ["french"], vegan: ["vegan"], vegetarian: ["vegetarian", "vegan"],
};
function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
    d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
const isRestaurantWord = (w) => w.length >= 7 && ["restaurant", "restaurants"].some((t) => lev(w, t) <= 3);
const NEAR = /\b(nearby|near|around|close|walk\w*|downtown|local|area|town|outside|go out|places?|spots?|recommend\w*|good|best)\b/;

// q: lowercased text. Returns null (not a food question) or { matches, cuisine, all } .
export function foodQuery(recs, q) {
  const words = q.toLowerCase().replace(/[^a-z ]/g, " ").split(/\s+/).filter(Boolean);
  const cw = words.find((w) => CUISINES[w]);
  const rest = words.some(isRestaurantWord) || /\b(places to eat|somewhere to eat|where to eat|grab (a )?(bite|dinner|lunch))\b/.test(q);
  if (!cw && !(rest && NEAR.test(q))) return null;
  const food = (recs || []).filter((r) => r.cuisines?.length);
  if (!cw) return { cuisine: null, matches: food };
  const tags = CUISINES[cw];
  return { cuisine: cw, matches: food.filter((r) => r.cuisines.some((c) => tags.includes(c))) };
}
export const recLine = (r) => `${r.name}${r.address ? `, ${r.address}` : ""} (${r.distance}): ${r.description}${r.hours ? ` ${r.hours}.` : ""}`;
export const cap = (s) => s[0].toUpperCase() + s.slice(1);
