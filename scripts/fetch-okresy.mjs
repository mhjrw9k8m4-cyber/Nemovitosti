// Stáhne hranice 77 okresů ČR a uloží data/okresy-hranice.json
// jako { "Okres": geometry }. Spouští se v GitHub Actions (potřebuje síť).
//
// PROČ: okres se u inzerátů, které ho neuvádějí, dopočítával podle
// NEJBLIŽŠÍHO OKRESNÍHO MĚSTA. To je u obcí blízko hranice okresu špatně —
// Holedeč (okres Louny) vycházela jako okres Most, protože měřítko navíc
// počítalo stupeň zeměpisné délky stejně dlouhý jako stupeň šířky (u nás
// je o třetinu kratší). Se skutečnou hranicí se bod buď uvnitř okresu
// nachází, nebo ne — žádné hádání.
//
// Plná předloha má 19 MB, což do repozitáře nepatří. Hranice proto
// zjednodušíme (Douglas–Peucker) na desítky metrů; na zařazení pozemku
// do okresu to bohatě stačí.
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const ZDROJ = 'https://raw.githubusercontent.com/siwekm/czech-geojson/master/okresy.json';
// V předloze má Praha jako jediná jiný název než u nás.
const PREJMENUJ = { 'území Hlavního města Prahy': 'Praha' };
// Zjednodušení: ~0.0007° ≈ 55 m na severní i východní straně.
const TOLERANCE = 0.0007;

function vzdalenostOdUsecky(b, a, c) {
  const dx = c[0] - a[0], dy = c[1] - a[1];
  if (dx === 0 && dy === 0) return Math.hypot(b[0] - a[0], b[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((b[0] - a[0]) * dx + (b[1] - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(b[0] - (a[0] + t * dx), b[1] - (a[1] + t * dy));
}
function zjednodus(body, tol) {
  if (body.length < 3) return body;
  let nej = 0, nejI = 0;
  for (let i = 1; i < body.length - 1; i++) {
    const d = vzdalenostOdUsecky(body[i], body[0], body[body.length - 1]);
    if (d > nej) { nej = d; nejI = i; }
  }
  if (nej <= tol) return [body[0], body[body.length - 1]];
  return zjednodus(body.slice(0, nejI + 1), tol).slice(0, -1).concat(zjednodus(body.slice(nejI), tol));
}
// Prstenec musí zůstat uzavřený a mít aspoň čtyři body, jinak z něj plocha zmizí.
function zjednodusPrstenec(prstenec) {
  const out = zjednodus(prstenec, TOLERANCE).map((p) => [Math.round(p[0] * 1e5) / 1e5, Math.round(p[1] * 1e5) / 1e5]);
  if (out.length < 4) return prstenec.map((p) => [Math.round(p[0] * 1e5) / 1e5, Math.round(p[1] * 1e5) / 1e5]);
  const a = out[0], b = out[out.length - 1];
  if (a[0] !== b[0] || a[1] !== b[1]) out.push([a[0], a[1]]);
  return out;
}
function zjednodusGeometrii(g) {
  if (g.type === 'Polygon') return { type: 'Polygon', coordinates: g.coordinates.map(zjednodusPrstenec) };
  if (g.type === 'MultiPolygon') {
    return { type: 'MultiPolygon', coordinates: g.coordinates.map((p) => p.map(zjednodusPrstenec)) };
  }
  throw new Error('neznámý typ geometrie: ' + g.type);
}

const r = await fetch(ZDROJ, { headers: { 'user-agent': 'parcelka-bot' } });
if (!r.ok) { console.error('Hranice okresů se nepodařilo stáhnout: HTTP ' + r.status); process.exit(1); }
const geo = await r.json();
const ven = {};
let bodu = 0, bodyPuvodne = 0;
for (const f of geo.features || []) {
  const jmeno = PREJMENUJ[f.name] || f.name;
  if (!jmeno || !f.geometry) continue;
  const spocitej = (g) => JSON.stringify(g.coordinates).split('],[').length;
  bodyPuvodne += spocitej(f.geometry);
  const g = zjednodusGeometrii(f.geometry);
  bodu += spocitej(g);
  ven[jmeno] = g;
}
const pocet = Object.keys(ven).length;
if (pocet !== 77) { console.error(`Čekali jsme 77 okresů, přišlo ${pocet} — soubor nepřepisuji.`); process.exit(1); }
const cil = path.join(new URL('..', import.meta.url).pathname, 'data', 'okresy-hranice.json');
writeFileSync(cil, JSON.stringify(ven));
console.log(`Uloženo ${pocet} okresů, ${bodyPuvodne} → ${bodu} bodů.`);
