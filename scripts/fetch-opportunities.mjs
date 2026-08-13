#!/usr/bin/env node
/**
 * Pozemkomat — sběr příležitostí z veřejných zdrojů.
 *
 * Robot stáhne data z jednotlivých zdrojů, sjednotí je do jednoho formátu
 * a zapíše do data/opportunities.json. Web si ten soubor pak jen načte.
 *
 * DŮLEŽITÉ: jednotlivé funkce zdrojů jsou zatím prázdné (TODO) — sem se
 * doplní reálné stahování. Dokud žádný zdroj nevrátí data, ponecháme
 * stávající soubor beze změny, aby web nezůstal prázdný.
 *
 * Formát jedné příležitosti:
 *   { place, okres, type, parcel, druh, area, price, extra, lat, lng }
 *   type ∈ 'sale' | 'drazba' | 'exekuce' | 'obec'
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'data', 'opportunities.json');
const OKRESY = join(__dirname, '..', 'data', 'okresy.json');

// Geokódování: okres → přibližné souřadnice (s malým rozptylem, ať se body nekryjí)
let OKRESY_MAP = {};
try { OKRESY_MAP = JSON.parse(readFileSync(OKRESY, 'utf8')).okresy || {}; } catch { /* ok */ }

function geocode(o, seedStr) {
  if (typeof o.lat === 'number' && typeof o.lng === 'number') return o;
  const base = OKRESY_MAP[o.okres];
  if (!base) return o;
  // deterministický rozptyl ~±0.03° podle názvu parcely
  let h = 0;
  const s = (seedStr || o.parcel || o.place || '') + o.okres;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const jitter = (n) => (((h >> n) & 255) / 255 - 0.5) * 0.06;
  return { ...o, lat: +(base[0] + jitter(0)).toFixed(5), lng: +(base[1] + jitter(8)).toFixed(5) };
}

/* ---------- Zdroje (doplnit reálné stahování) ---------- */

// Centrální evidence veřejných dražeb (cevd.gov.cz) — oficiální otevřená data.
// Vybíráme jen aktivní dražby (stav "Uveřejněno"), kde je předmětem pozemek.
const UA = { 'user-agent': 'PozemkomatBot/0.1 (+https://github.com/mhjrw9k8m4-cyber/Nemovitosti)' };

function parseArea(text) {
  const m = String(text).match(/(\d[\d\s.]*)\s*m(?:2|²)/i);
  if (!m) return null;
  const n = parseInt(m[1].replace(/[\s.]/g, ''), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}
function parseDruh(text) {
  const t = String(text).toLowerCase();
  const kinds = [
    ['orná půda', 'orná půda'], ['zahrad', 'zahrada'], ['ostatní plocha', 'ostatní plocha'],
    ['trvalý travní', 'trvalý travní porost'], ['louk', 'louka'], ['lesní', 'lesní pozemek'],
    ['stavební', 'stavební'], ['vinice', 'vinice'], ['sad', 'ovocný sad'],
  ];
  for (const [k, v] of kinds) if (t.includes(k)) return v;
  return 'pozemek';
}

async function fetchDrazby() {
  const year = new Date().getFullYear();
  const out = [];
  for (const y of [year, year - 1]) {
    let data;
    try {
      const r = await fetch(`https://cevd.gov.cz/opendata/drazby/drazby_${y}.json`, { headers: UA });
      if (!r.ok) continue;
      data = await r.json();
    } catch { continue; }
    const arr = Array.isArray(data) ? data : (Object.values(data).find(Array.isArray) || []);
    for (const rec of arr) {
      const zi = rec.zakladniInformace || {};
      const konani = zi.konaniDrazby;
      const zah = konani && (konani.zahajeni || konani.konec);
      // Nucená (nedobrovolná) dražba = nucený prodej → kategorie "exekuce"
      const nucena = zi.typDrazby === 'Nucená';
      const type = nucena ? 'exekuce' : 'drazba';
      const datum = zah ? String(zah).slice(0, 10) : null;
      // Jeden záznam na dražbu — pozemek v aktivní dražbě.
      // Dobrovolná dražba (drazba): jen čistý pozemek bez budovy.
      // Nucená dražba (exekuce): i pozemek se stavbou/jednotkou — u exekucí
      //   jde skoro vždy o nemovitost, kde je pozemek součástí.
      let picked = null;
      for (const p of (rec.predmetyDrazby || [])) {
        if (p.stavPredmetu !== 'Uveřejněno') continue; // jen aktivní/nadcházející
        // vyber nejvhodnější věc s pozemkem (preferuj čistý pozemek)
        let cand = null, candBudova = false;
        for (const v of (p.veci || [])) {
          const vn = v.vecNemovita;
          if (!vn || !vn.pozemek) continue;
          const budova = !!(vn.jednotka || vn.stavba);
          if (budova && !nucena) continue; // dobrovolná: budovy vynecháváme
          if (!cand || (candBudova && !budova)) { cand = { vn, v }; candBudova = budova; }
          if (!budova) break; // čistý pozemek má přednost, dál nehledáme
        }
        if (!cand) continue;
        const { vn, v } = cand;
        const ku = vn.katastralniUzemi || {};
        const okres = ku.okres, place = ku.obec || ku.nazev;
        if (!okres || !place) continue;
        const area = vn.pozemek.vymera || parseArea(v.nazev) || parseArea(p.nazevPredmetu);
        const price = (p.vyvolavaciCena && p.vyvolavaciCena.castka && p.vyvolavaciCena.castka.vyse)
          || (p.obvyklaCena && p.obvyklaCena.vyse) || 0;
        if (!price) continue;
        if (!area && !nucena) continue; // dobrovolná bez výměry vynecháme; u exekucí výměra často chybí
        const druhBase = vn.pozemek.druhPozemku || parseDruh(v.nazev);
        picked = {
          place, okres, type,
          parcel: String(vn.pozemek.parcelniCislo || '—').slice(0, 40),
          druh: candBudova ? (druhBase + ' se stavbou') : druhBase,
          area: area ? Math.round(area) : null, price: Math.round(price),
          extra: (nucena ? 'nucená dražba' : 'dražba') + (datum ? ' ' + datum : ''),
          lat: typeof vn.gpsLat === 'number' ? vn.gpsLat : undefined,
          lng: typeof vn.gpsLng === 'number' ? vn.gpsLng : undefined,
        };
        break;
      }
      if (picked) out.push(picked);
    }
    if (out.length) break; // aktuální rok stačí
  }
  return out;
}

// Insolvenční rejstřík (ISIR) — majetek v úpadku, který půjde na prodej.
// TODO: napojit veřejnou službu ISIR, vytáhnout nemovitosti.
async function fetchInsolvence() {
  return [];
}

// Úřední desky obcí — záměry obcí prodat pozemek.
// TODO: sbírat z úředních desek (mnoho zdrojů), normalizovat.
async function fetchUredniDesky() {
  return [];
}

// Státní pozemkový úřad — nabídky pozemků k prodeji podle § 12 zákona č. 503/2012.
// SPÚ zveřejňuje kompletní seznam jako CSV (kódování Windows-1250, oddělovač ;).
function normOkres(name) {
  if (OKRESY_MAP[name]) return name;
  const hy = name.replace(/\s+/g, '-'); // "Brno město" → "Brno-město"
  if (OKRESY_MAP[hy]) return hy;
  return name;
}
function splitCsvLine(line) {
  return line.split(';').map((s) => s.replace(/^="?|"?$/g, '').trim());
}
async function fetchProdejSPU() {
  // 1) na přehledové stránce najdeme odkaz na aktuální CSV pozemků
  let page;
  try { page = await (await fetch('https://spu.gov.cz/nabidky/prehled-cela-cr', { headers: UA })).text(); }
  catch { return []; }
  const m = page.match(/href="([^"]*pozemky\d[^"]*\.csv)"/i);
  if (!m) return [];
  let url = m[1];
  if (!url.startsWith('http')) url = 'https://spu.gov.cz' + (url.startsWith('/') ? url : '/' + url);
  // 2) stáhneme a dekódujeme (Windows-1250)
  let buf;
  try { const r = await fetch(url, { headers: UA }); if (!r.ok) return []; buf = Buffer.from(await r.arrayBuffer()); }
  catch { return []; }
  let txt;
  try { txt = new TextDecoder('windows-1250').decode(buf); } catch { txt = buf.toString('latin1'); }
  const lines = txt.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const header = splitCsvLine(lines[0]).map((h) => h.toLowerCase());
  const col = (needle) => header.findIndex((h) => h.includes(needle));
  const iOkres = col('okres'), iKu = col('k.'), iParc = col('parcela'),
    iVym = col('výměra'), iDruh = col('druh'), iVyuz = col('využit'),
    iCena = col('cena'), iStazeno = col('staženo');
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const c = splitCsvLine(lines[i]);
    if (c.length < 5) continue;
    if (iStazeno >= 0 && /ano/i.test(c[iStazeno] || '')) continue; // staženo z nabídky
    const okres = (c[iOkres] || '').trim();
    const place = (iKu >= 0 ? c[iKu] : '').trim();
    const price = parseInt((c[iCena] || '').replace(/\s/g, '').split(',')[0].replace(/[^\d]/g, ''), 10);
    if (!okres || !place || !price) continue;
    const area = parseInt(String(iVym >= 0 ? c[iVym] : '').replace(/[^\d]/g, ''), 10) || null;
    const druh = (iDruh >= 0 ? c[iDruh] : '').trim() || parseDruh(iVyuz >= 0 ? c[iVyuz] : '');
    out.push({
      place, okres: normOkres(okres), type: 'sale',
      parcel: String(iParc >= 0 ? c[iParc] : '—').trim().slice(0, 40) || '—',
      druh: druh || 'pozemek',
      area, price,
      extra: 'prodej státní půdy (SPÚ, § 12)',
    });
  }
  return out;
}

/* ---------- Sjednocení a zápis ---------- */

// 'area' není povinná (u exekucí výměra v evidenci často chybí)
const REQUIRED = ['place', 'okres', 'type', 'parcel', 'druh', 'price', 'lat', 'lng'];
const TYPES = new Set(['sale', 'drazba', 'exekuce', 'obec']);

function valid(o) {
  if (!o || typeof o !== 'object') return false;
  if (!TYPES.has(o.type)) return false;
  return REQUIRED.every((k) => o[k] !== undefined && o[k] !== null && o[k] !== '');
}

async function main() {
  const results = await Promise.allSettled([
    fetchDrazby(),
    fetchInsolvence(),
    fetchUredniDesky(),
    fetchProdejSPU(),
  ]);

  const raw = results
    .filter((r) => r.status === 'fulfilled')
    .flatMap((r) => r.value || [])
    .map((o) => geocode(o));

  // odstranění duplicit (okres + parcela) a seřazení podle výhodnosti
  const seen = new Set();
  const byDeal = (a, b) => (a.area ? a.price / a.area : Infinity) - (b.area ? b.price / b.area : Infinity);
  const clean = raw
    .filter(valid)
    .filter((o) => {
      const k = (o.type + '|' + o.okres + '|' + o.parcel).toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort(byDeal);

  // Vyvážený výběr — ať žádná kategorie nepřeváží (jinak by 700 prodejů
  // zaplavilo mapu). Z každé kategorie bereme nejvýhodnější kusy.
  const CAP = { sale: 130, drazba: 90, exekuce: 40, obec: 40 };
  const perType = {};
  const fresh = clean.filter((o) => {
    perType[o.type] = (perType[o.type] || 0) + 1;
    return perType[o.type] <= (CAP[o.type] || 40);
  });

  if (fresh.length === 0) {
    console.log('Žádný zdroj zatím nevrací data — ponechávám stávající soubor beze změny.');
    return;
  }

  const payload = {
    updated: new Date().toISOString().slice(0, 10),
    source: 'Centrální evidence veřejných dražeb + Státní pozemkový úřad',
    opportunities: fresh,
  };
  writeFileSync(OUT, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  const counts = fresh.reduce((a, o) => ((a[o.type] = (a[o.type] || 0) + 1), a), {});
  console.log(`Zapsáno ${fresh.length} příležitostí do ${OUT}. Dle typu:`, JSON.stringify(counts));
}

main().catch((err) => {
  console.error('Chyba při sběru dat:', err);
  process.exitCode = 1;
});
