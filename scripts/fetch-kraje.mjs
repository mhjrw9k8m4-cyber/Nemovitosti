// Stáhne hranice 14 krajů ČR a uloží data/kraje.json jako { "Kraj": geometry }.
// Zdroj: deldersveld/topojson (TopoJSON krajů) — dekódujeme vlastním malým
// převodníkem TopoJSON→GeoJSON (bez závislostí). Spouští se v GitHub Actions.
import { writeFileSync } from 'node:fs';

const SOURCES = [
  'https://raw.githubusercontent.com/codeforgermany/click_that_hood/main/public/data/czech-republic.geojson',
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
function round(n) { return Math.round(n * 1000) / 1000; }
function simpRing(ring) {
  const out = []; let prev = null;
  for (const pt of ring) {
    const p = [round(pt[0]), round(pt[1])];
    if (!prev || p[0] !== prev[0] || p[1] !== prev[1]) { out.push(p); prev = p; }
  }
  return out.length >= 4 ? out : null;
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
  features = (data.features || []).map(f => ({ properties: f.properties || {}, geometry: f.geometry }));
}
console.log('features:', features.length, '| vzorek props:', JSON.stringify(features[0] && features[0].properties));

function resolveKraj(p) {
  const raw = String(p.name || p.NAME_1 || p.NAME || p.name_1 || p.NÁZEV || '').trim();
  const cands = [raw, raw.replace(/\s+kraj$/i, '').trim(), raw.replace(/\s+region$/i, '').trim(), raw.replace(/\s+region$/i, '').replace(/\s+kraj$/i, '').trim()];
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
