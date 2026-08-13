// Stáhne hranice 14 krajů ČR z Natural Earth (admin-1), zjednoduší je a uloží
// do data/kraje.json jako { "Kraj": geometry }. Spouští se v GitHub Actions
// (má internet). Choropleth na webu pak kraje vybarví podle počtu pozemků.
import { writeFileSync } from 'node:fs';

const SRC = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_admin_1_states_provinces.geojson';

// ISO 3166-2 kód kraje → náš klíč (shodný s OKRES_KRAJ v js/main.js)
const ISO_KRAJ = {
  'CZ-10': 'Praha', 'CZ-20': 'Středočeský', 'CZ-31': 'Jihočeský', 'CZ-32': 'Plzeňský',
  'CZ-41': 'Karlovarský', 'CZ-42': 'Ústecký', 'CZ-51': 'Liberecký', 'CZ-52': 'Královéhradecký',
  'CZ-53': 'Pardubický', 'CZ-63': 'Vysočina', 'CZ-64': 'Jihomoravský', 'CZ-71': 'Olomoucký',
  'CZ-72': 'Zlínský', 'CZ-80': 'Moravskoslezský'
};

function round(n) { return Math.round(n * 1000) / 1000; } // ~100 m přesnost stačí
function simplifyRing(ring) {
  const out = [];
  let prev = null;
  for (const pt of ring) {
    const p = [round(pt[0]), round(pt[1])];
    if (!prev || p[0] !== prev[0] || p[1] !== prev[1]) { out.push(p); prev = p; }
  }
  if (out.length < 4) return null; // moc malý prstenec zahodíme
  return out;
}
function simplifyGeom(geom) {
  if (geom.type === 'Polygon') {
    const rings = geom.coordinates.map(simplifyRing).filter(Boolean);
    return rings.length ? { type: 'Polygon', coordinates: rings } : null;
  }
  if (geom.type === 'MultiPolygon') {
    const polys = geom.coordinates
      .map(poly => poly.map(simplifyRing).filter(Boolean))
      .filter(poly => poly.length);
    return polys.length ? { type: 'MultiPolygon', coordinates: polys } : null;
  }
  return null;
}

const res = await fetch(SRC);
if (!res.ok) { console.error('Stažení selhalo:', res.status); process.exit(1); }
const gj = await res.json();

const out = {};
for (const f of gj.features) {
  const p = f.properties || {};
  if (p.iso_a2 !== 'CZ' && p.admin !== 'Czechia' && p.admin !== 'Czech Republic') continue;
  const key = ISO_KRAJ[p.iso_3166_2];
  if (!key) continue;
  const g = simplifyGeom(f.geometry);
  if (g) out[key] = g;
}

const found = Object.keys(out);
console.log('Nalezeno krajů:', found.length, '—', found.join(', '));
if (found.length < 14) console.warn('POZOR: nenalezeno všech 14 krajů!');

writeFileSync('data/kraje.json', JSON.stringify(out));
console.log('Uloženo data/kraje.json (' + (JSON.stringify(out).length / 1024).toFixed(0) + ' kB)');
