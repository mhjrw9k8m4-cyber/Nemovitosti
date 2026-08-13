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
// Záloha podle názvu (Natural Earth používá různé varianty)
const NAME_KRAJ = {
  'Praha': 'Praha', 'Prague': 'Praha', 'Hlavní město Praha': 'Praha',
  'Středočeský': 'Středočeský', 'Central Bohemian': 'Středočeský', 'Central Bohemia': 'Středočeský',
  'Jihočeský': 'Jihočeský', 'South Bohemian': 'Jihočeský', 'South Bohemia': 'Jihočeský',
  'Plzeňský': 'Plzeňský', 'Plzeň': 'Plzeňský', 'Pilsen': 'Plzeňský',
  'Karlovarský': 'Karlovarský', 'Karlovy Vary': 'Karlovarský',
  'Ústecký': 'Ústecký', 'Ústí nad Labem': 'Ústecký', 'Usti nad Labem': 'Ústecký',
  'Liberecký': 'Liberecký', 'Liberec': 'Liberecký',
  'Královéhradecký': 'Královéhradecký', 'Hradec Králové': 'Královéhradecký', 'Kralovehradecky': 'Královéhradecký',
  'Pardubický': 'Pardubický', 'Pardubice': 'Pardubický',
  'Vysočina': 'Vysočina', 'Kraj Vysočina': 'Vysočina', 'Vysocina': 'Vysočina',
  'Jihomoravský': 'Jihomoravský', 'South Moravian': 'Jihomoravský', 'South Moravia': 'Jihomoravský',
  'Olomoucký': 'Olomoucký', 'Olomouc': 'Olomoucký',
  'Zlínský': 'Zlínský', 'Zlín': 'Zlínský', 'Zlin': 'Zlínský',
  'Moravskoslezský': 'Moravskoslezský', 'Moravian-Silesian': 'Moravskoslezský', 'Moravia-Silesia': 'Moravskoslezský'
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

// DIAGNOSTIKA — abychom viděli skutečnou strukturu dat
console.log('typ:', gj.type, '| features:', (gj.features || []).length);
if (gj.features && gj.features[0]) console.log('klíče props:', Object.keys(gj.features[0].properties || {}).join(','));
const czAny = (gj.features || []).filter(function (f) { return JSON.stringify(f.properties || {}).toLowerCase().includes('czech'); });
console.log('features s "czech":', czAny.length);
czAny.slice(0, 16).forEach(function (f) { var p = f.properties || {}; console.log('  ', p.adm0_a3, '|', p.iso_3166_2, '|', p.name, '|', p.name_local, '|', p.gn_name); });

const cz = gj.features.filter(function (f) {
  const p = f.properties || {};
  return p.adm0_a3 === 'CZE' || p.admin === 'Czechia' || p.admin === 'Czech Republic' || p.iso_a2 === 'CZ';
});
console.log('CZ features:', cz.length);
console.log('vzorek props:', cz.slice(0, 3).map(function (f) { return { iso: f.properties.iso_3166_2, name: f.properties.name }; }));

const out = {};
for (const f of cz) {
  const p = f.properties || {};
  const key = ISO_KRAJ[p.iso_3166_2] || NAME_KRAJ[(p.name || '').trim()] || NAME_KRAJ[(p.name_local || '').trim()];
  if (!key) { console.warn('Nepřiřazeno:', p.iso_3166_2, '/', p.name); continue; }
  const g = simplifyGeom(f.geometry);
  if (g) out[key] = g;
}

const found = Object.keys(out);
console.log('Nalezeno krajů:', found.length, '—', found.join(', '));
if (found.length < 14) console.warn('POZOR: nenalezeno všech 14 krajů!');

writeFileSync('data/kraje.json', JSON.stringify(out));
console.log('Uloženo data/kraje.json (' + (JSON.stringify(out).length / 1024).toFixed(0) + ' kB)');
