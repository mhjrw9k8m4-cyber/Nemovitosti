// Stáhne hranice 14 krajů ČR a uloží data/kraje.json jako { "Kraj": geometry }.
// Zdroj: deldersveld/topojson (TopoJSON krajů) — dekódujeme vlastním malým
// převodníkem TopoJSON→GeoJSON (bez závislostí). Spouští se v GitHub Actions.
import { writeFileSync } from 'node:fs';

const SOURCES = [
  'https://raw.githubusercontent.com/siwekm/czech-geojson/master/kraje.json',
  'https://raw.githubusercontent.com/deldersveld/topojson/master/countries/czech-republic/czech-republic-regions.json'
];

// Název kraje (i anglické varianty) → náš klíč (shodný s OKRES_KRAJ v js/main.js)
const NAME_KRAJ = {
  'Praha': 'Praha', 'Prague': 'Praha', 'Hlavní město Praha': 'Praha', 'Hlavni mesto Praha': 'Praha', 'Capital City of Prague': 'Praha',
  'Středočeský': 'Středočeský', 'Stredocesky': 'Středočeský', 'Central Bohemian': 'Středočeský', 'Central Bohemia': 'Středočeský',
  'Jihočeský': 'Jihočeský', 'Jihocesky': 'Jihočeský', 'South Bohemian': 'Jihočeský', 'South Bohemia': 'Jihočeský',
  'Plzeňský': 'Plzeňský', 'Plzensky': 'Plzeňský', 'Plzeň': 'Plzeňský', 'Pilsen': 'Plzeňský',
  'Karlovarský': 'Karlovarský', 'Karlovarsky': 'Karlovarský', 'Karlovy Vary': 'Karlovarský',
  'Ústecký': 'Ústecký', 'Ustecky': 'Ústecký', 'Ústí nad Labem': 'Ústecký', 'Usti nad Labem': 'Ústecký',
  'Liberecký': 'Liberecký', 'Liberecky': 'Liberecký', 'Liberec': 'Liberecký',
  'Královéhradecký': 'Královéhradecký', 'Kralovehradecky': 'Královéhradecký', 'Hradec Králové': 'Královéhradecký',
  'Pardubický': 'Pardubický', 'Pardubicky': 'Pardubický', 'Pardubice': 'Pardubický',
  'Vysočina': 'Vysočina', 'Vysocina': 'Vysočina', 'Kraj Vysočina': 'Vysočina', 'Highlands': 'Vysočina',
  'Jihomoravský': 'Jihomoravský', 'Jihomoravsky': 'Jihomoravský', 'South Moravian': 'Jihomoravský', 'South Moravia': 'Jihomoravský',
  'Olomoucký': 'Olomoucký', 'Olomoucky': 'Olomoucký', 'Olomouc': 'Olomoucký',
  'Zlínský': 'Zlínský', 'Zlinsky': 'Zlínský', 'Zlín': 'Zlínský', 'Zlin': 'Zlínský',
  'Moravskoslezský': 'Moravskoslezský', 'Moravskoslezsky': 'Moravskoslezský', 'Moravian-Silesian': 'Moravskoslezský', 'Moravia-Silesia': 'Moravskoslezský'
};

// --- Minimální TopoJSON → GeoJSON (Polygon / MultiPolygon) ---
function arcCoords(topo, index) {
  const reverse = index < 0;
  if (reverse) index = ~index;
  const arc = topo.arcs[index];
  const s = topo.transform ? topo.transform.scale : [1, 1];
  const t = topo.transform ? topo.transform.translate : [0, 0];
  const pts = [];
  let x = 0, y = 0;
  for (const d of arc) {
    x += d[0]; y += d[1];
    pts.push(topo.transform ? [x * s[0] + t[0], y * s[1] + t[1]] : [d[0], d[1]]);
  }
  return reverse ? pts.reverse() : pts;
}
function ringCoords(topo, arcIdxs) {
  let coords = [];
  arcIdxs.forEach((idx, i) => {
    let a = arcCoords(topo, idx);
    if (i > 0) a = a.slice(1);
    coords = coords.concat(a);
  });
  return coords;
}
function geomToGeoJSON(topo, geom) {
  if (geom.type === 'Polygon') return { type: 'Polygon', coordinates: geom.arcs.map(r => ringCoords(topo, r)) };
  if (geom.type === 'MultiPolygon') return { type: 'MultiPolygon', coordinates: geom.arcs.map(p => p.map(r => ringCoords(topo, r))) };
  return null;
}

// --- Zjednodušení (zaokrouhlení na ~100 m) ---
// Douglas–Peucker zjednodušení (výrazně zmenší soubor, tvar krajů zůstane)
const EPS = 0.005; // ~0,5 km tolerance stačí pro pohled na celou ČR
function r4(n) { return Math.round(n * 10000) / 10000; }
function perp(p, a, b) { const dx = b[0] - a[0], dy = b[1] - a[1]; const L = Math.hypot(dx, dy) || 1e-9; return Math.abs((p[0] - a[0]) * dy - (p[1] - a[1]) * dx) / L; }
function dp(pts, eps) {
  if (pts.length < 3) return pts.slice();
  let idx = -1, dmax = 0;
  for (let i = 1; i < pts.length - 1; i++) { const d = perp(pts[i], pts[0], pts[pts.length - 1]); if (d > dmax) { dmax = d; idx = i; } }
  if (dmax > eps && idx > 0) return dp(pts.slice(0, idx + 1), eps).slice(0, -1).concat(dp(pts.slice(idx), eps));
  return [pts[0], pts[pts.length - 1]];
}
function simpRing(ring) {
  let o = ring.slice();
  if (o.length > 1 && o[0][0] === o[o.length - 1][0] && o[0][1] === o[o.length - 1][1]) o = o.slice(0, -1);
  if (o.length < 3) return null;
  // uzavřenou smyčku rozdělíme v nejvzdálenějším bodě od začátku a DP na obě půlky
  let fi = 0, fd = -1;
  for (let i = 1; i < o.length; i++) { const d = Math.hypot(o[i][0] - o[0][0], o[i][1] - o[0][1]); if (d > fd) { fd = d; fi = i; } }
  const s = dp(o.slice(0, fi + 1), EPS).slice(0, -1).concat(dp(o.slice(fi).concat([o[0]]), EPS)).map(p => [r4(p[0]), r4(p[1])]);
  if (s.length > 1 && (s[0][0] !== s[s.length - 1][0] || s[0][1] !== s[s.length - 1][1])) s.push([s[0][0], s[0][1]]);
  return s.length >= 4 ? s : null;
}
function simpGeom(g) {
  if (g.type === 'Polygon') { const r = g.coordinates.map(simpRing).filter(Boolean); return r.length ? { type: 'Polygon', coordinates: r } : null; }
  const p = g.coordinates.map(poly => poly.map(simpRing).filter(Boolean)).filter(poly => poly.length);
  return p.length ? { type: 'MultiPolygon', coordinates: p } : null;
}

let data = null, used = null;
for (const url of SOURCES) {
  try { const r = await fetch(url); if (r.ok) { data = await r.json(); used = url; break; } console.warn('přeskočeno', r.status, url); }
  catch (e) { console.warn('chyba', e.message, url); }
}
if (!data) { console.error('Žádný zdroj nedostupný'); process.exit(1); }
console.log('zdroj:', used, '| typ:', data.type);

// Sjednotíme na pole { properties, geometry(GeoJSON) }
let features;
if (data.type === 'Topology') {
  const objKey = Object.keys(data.objects)[0];
  features = (data.objects[objKey].geometries || []).map(g => ({ properties: g.properties || {}, geometry: geomToGeoJSON(data, g) }));
} else {
  // Některé zdroje mají metadata (name…) na úrovni feature, ne v properties.
  features = (data.features || []).map(f => ({
    properties: (f.properties && Object.keys(f.properties).length) ? f.properties : f,
    geometry: f.geometry
  }));
}
console.log('features:', features.length, '| vzorek props:', JSON.stringify(features[0] && features[0].properties));

function resolveKraj(p) {
  const raw = String(p.name || p.NAME_1 || p.NAME || p.name_1 || p.NÁZEV || '').trim();
  const base = raw.replace(/^kraj\s+/i, '').replace(/\s+kraj$/i, '').replace(/\s+region$/i, '').trim();
  const cands = [raw, base];
  for (const c of cands) if (NAME_KRAJ[c]) return NAME_KRAJ[c];
  return null;
}

const out = {};
for (const f of features) {
  const key = resolveKraj(f.properties || {});
  if (!key) { console.warn('Nepřiřazeno:', JSON.stringify(f.properties)); continue; }
  const g = f.geometry && simpGeom(f.geometry);
  if (g) out[key] = g;
}

const found = Object.keys(out);
console.log('Nalezeno krajů:', found.length, '—', found.join(', '));
if (found.length < 14) console.warn('POZOR: nenalezeno všech 14 krajů!');
writeFileSync('data/kraje.json', JSON.stringify(out));
console.log('Uloženo data/kraje.json (' + (JSON.stringify(out).length / 1024).toFixed(0) + ' kB)');
