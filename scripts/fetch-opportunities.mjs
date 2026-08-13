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
      const konani = rec.zakladniInformace && rec.zakladniInformace.konaniDrazby;
      const zah = konani && (konani.zahajeni || konani.konec);
      for (const p of (rec.predmetyDrazby || [])) {
        if (p.stavPredmetu !== 'Uveřejněno') continue; // jen aktivní/nadcházející
        for (const v of (p.veci || [])) {
          const vn = v.vecNemovita;
          if (!vn || !vn.pozemek || vn.jednotka || vn.stavba) continue; // jen čisté pozemky
          const ku = vn.katastralniUzemi || {};
          const okres = ku.okres, place = ku.obec || ku.nazev;
          if (!okres || !place) continue;
          const blob = `${v.nazev || ''} ${p.nazevPredmetu || ''} ${p.popisPredmetu || ''}`;
          const area = vn.pozemek.vymera || parseArea(blob);
          const price = (p.vyvolavaciCena && p.vyvolavaciCena.castka && p.vyvolavaciCena.castka.vyse)
            || (p.obvyklaCena && p.obvyklaCena.vyse) || 0;
          if (!area || !price) continue;
          out.push({
            place, okres, type: 'drazba',
            parcel: String(vn.pozemek.parcelniCislo || '—').slice(0, 40),
            druh: vn.pozemek.druhPozemku || parseDruh(blob),
            area: Math.round(area), price: Math.round(price),
            extra: zah ? ('dražba ' + String(zah).slice(0, 10)) : 'nadcházející dražba',
            lat: typeof vn.gpsLat === 'number' ? vn.gpsLat : undefined,
            lng: typeof vn.gpsLng === 'number' ? vn.gpsLng : undefined,
          });
        }
      }
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

// Veřejné inzertní portály — pozemky na prodej.
// TODO: pouze v souladu s podmínkami daného portálu.
async function fetchInzeraty() {
  return [];
}

/* ---------- Sjednocení a zápis ---------- */

const REQUIRED = ['place', 'okres', 'type', 'parcel', 'druh', 'area', 'price', 'lat', 'lng'];
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
    fetchInzeraty(),
  ]);

  const raw = results
    .filter((r) => r.status === 'fulfilled')
    .flatMap((r) => r.value || [])
    .map((o) => geocode(o));

  // odstranění duplicit (okres + parcela) a seřazení podle výhodnosti
  const seen = new Set();
  const fresh = raw
    .filter(valid)
    .filter((o) => {
      const k = (o.okres + '|' + o.parcel).toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((a, b) => a.price / a.area - b.price / b.area)
    .slice(0, 200); // strop, ať je soubor svižný

  if (fresh.length === 0) {
    console.log('Žádný zdroj zatím nevrací data — ponechávám stávající soubor beze změny.');
    return;
  }

  const payload = {
    updated: new Date().toISOString().slice(0, 10),
    source: 'automatický sběr z veřejných zdrojů',
    opportunities: fresh,
  };
  writeFileSync(OUT, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  console.log(`Zapsáno ${fresh.length} příležitostí do ${OUT}.`);
}

main().catch((err) => {
  console.error('Chyba při sběru dat:', err);
  process.exitCode = 1;
});
