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
const GEOCACHE = join(__dirname, '..', 'data', 'geocode-cache.json');

// Geokódování: okres → přibližné souřadnice (s malým rozptylem, ať se body nekryjí)
let OKRESY_MAP = {};
try { OKRESY_MAP = JSON.parse(readFileSync(OKRESY, 'utf8')).okresy || {}; } catch { /* ok */ }

// Cache geokódování podle názvu katastrálního území (ať Nominatim neptáme opakovaně)
let GEO_CACHE = {};
try { GEO_CACHE = JSON.parse(readFileSync(GEOCACHE, 'utf8')); } catch { /* ok */ }
let geoCacheDirty = false;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// deterministický malý rozptyl (ať se parcely ve stejné obci nekryjí)
function jitterAround(lat, lng, seedStr, amp) {
  let h = 0;
  const s = String(seedStr || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const j = (n) => (((h >> n) & 255) / 255 - 0.5) * amp;
  return { lat: +(lat + j(0)).toFixed(5), lng: +(lng + j(8)).toFixed(5) };
}

// Přesnější poloha podle názvu katastrálního území (Nominatim / OpenStreetMap).
const GEO_UA = { 'user-agent': 'PozemkomatBot/0.1 (+https://github.com/mhjrw9k8m4-cyber/Nemovitosti)' };
async function geocodeName(place, okres) {
  const key = (place + '|' + okres).toLowerCase();
  if (key in GEO_CACHE) return GEO_CACHE[key];
  let coord = null;
  try {
    const q = encodeURIComponent(place + ', Česko');
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=cz&q=${q}`, { headers: GEO_UA });
    if (r.ok) {
      const j = await r.json();
      if (Array.isArray(j) && j.length) coord = [+parseFloat(j[0].lat).toFixed(5), +parseFloat(j[0].lon).toFixed(5)];
    }
  } catch { /* síť selhala – necháme null */ }
  GEO_CACHE[key] = coord;
  geoCacheDirty = true;
  await sleep(1100); // Nominatim: max ~1 dotaz/s
  return coord;
}

// Okres podle GPS (nejbližší okresní středisko) – pro zdroje bez názvu okresu.
function nearestOkres(lat, lng) {
  let best = null, bestD = Infinity;
  for (const name of Object.keys(OKRESY_MAP)) {
    const c = OKRESY_MAP[name];
    const d = (c[0] - lat) ** 2 + (c[1] - lng) ** 2;
    if (d < bestD) { bestD = d; best = name; }
  }
  return best;
}

// Okresní fallback (méně přesné) – když název KÚ nedohledáme.
function geocode(o, seedStr) {
  if (typeof o.lat === 'number' && typeof o.lng === 'number') return o;
  const base = OKRESY_MAP[o.okres];
  if (!base) return o;
  const j = jitterAround(base[0], base[1], (seedStr || o.parcel || o.place || '') + o.okres, 0.06);
  return { ...o, lat: j.lat, lng: j.lng };
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
          _gps: typeof vn.gpsLat === 'number' && typeof vn.gpsLng === 'number',
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
  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const c = splitCsvLine(lines[i]);
    if (c.length < 8) continue;
    // Zadní sloupce (…;Cena;Nájem/pacht;Číslo OP;Staženo) čteme zprava — poznámka
    // uprostřed může mít středník; konec řádku je vždy stejný. Cena = 4. odzadu.
    if (/^ano$/i.test((c[c.length - 1] || '').trim())) continue; // Staženo = ano
    const okres = (c[0] || '').trim();
    const place = (c[1] || '').trim();
    const money = (c[c.length - 4] || '').match(/(\d[\d\s\u00a0]*),\d{2}/); // sloupec Cena
    const price = money ? parseInt(money[1].replace(/[^\d]/g, ''), 10) : null;
    if (!okres || !place || !price || price < 100) continue; // jen prodejní cena, ne nájem
    // Jen celé parcely (podíl SPÚ 1/1). Zlomkové spoluvlastnické podíly mají
    // cenu za malý podíl, což by zkreslovalo cenu za m². Podíl = 5. sloupec odzadu.
    const pod = (c[c.length - 5] || '').match(/(\d+)\s*\/\s*(\d+)/);
    if (pod && pod[1] !== pod[2]) continue;
    const area = parseInt(String(c[3] || '').replace(/[^\d]/g, ''), 10) || null;
    const druh = (c[4] || '').trim() || parseDruh(c[5] || '');
    // Cena za m² pod 5 Kč = spíš roční nájem/pacht než prodej → vynecháme.
    if (area && price / area < 5) continue;
    out.push({
      place, okres: normOkres(okres), type: 'sale',
      parcel: String(c[2] || '—').trim().slice(0, 40) || '—',
      druh: druh || 'pozemek',
      area, price,
      extra: 'prodej státní půdy (SPÚ, § 12)',
    });
  }
  return out;
}

// Bezrealitky.cz — inzeráty pozemků na prodej od majitelů.
// Veřejné GraphQL API (robots.txt dovoluje). Vrací i GPS a odkaz na inzerát.
async function fetchBezrealitky() {
  const query = `query($limit:Int,$offset:Int,$order:ResultOrder,$offerType:[OfferType],$estateType:[EstateType]){
    listAdverts(limit:$limit,offset:$offset,order:$order,offerType:$offerType,estateType:$estateType){
      totalCount
      list{ id uri title address(locale: CS) price surface surfaceLand gps{ lat lng } }
    }
  }`;
  const out = [];
  const PER = 60, PAGES = 4; // ~240 inzerátů strop
  for (let p = 0; p < PAGES; p++) {
    let list;
    try {
      const r = await fetch('https://api.bezrealitky.cz/graphql/', {
        method: 'POST',
        headers: { ...UA, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ query, variables: { limit: PER, offset: p * PER, order: 'TIMEORDER_DESC', offerType: ['PRODEJ'], estateType: ['POZEMEK'] } }),
      });
      if (!r.ok) break;
      const j = await r.json();
      list = j && j.data && j.data.listAdverts && j.data.listAdverts.list;
    } catch { break; }
    if (!Array.isArray(list) || !list.length) break;
    for (const a of list) {
      const price = a.price || 0;
      if (!price) continue;
      const area = a.surfaceLand || a.surface || null;
      const gps = a.gps || {};
      const hasGps = typeof gps.lat === 'number' && typeof gps.lng === 'number';
      // místo z adresy; okres podle GPS (ať ladí se zbytkem webu)
      const parts = String(a.address || '').split(',').map((s) => s.trim()).filter(Boolean);
      const place = (parts[0] || a.title || 'Pozemek').replace(/\s*-\s*/g, ' – ').slice(0, 60);
      let okres = hasGps ? nearestOkres(gps.lat, gps.lng) : null;
      if (!okres) okres = (parts[parts.length - 1] || place).replace(/\s*kraj$/i, '').slice(0, 40);
      out.push({
        place, okres, type: 'sale',
        parcel: '—', _key: 'br-' + a.id, // dedup podle inzerátu, ne parcely
        druh: 'pozemek', area, price,
        extra: 'inzerát – Bezrealitky',
        lat: typeof gps.lat === 'number' ? gps.lat : undefined,
        lng: typeof gps.lng === 'number' ? gps.lng : undefined,
        _gps: typeof gps.lat === 'number' && typeof gps.lng === 'number',
        url: a.uri ? 'https://www.bezrealitky.cz/nemovitosti-byty-domy/' + a.uri : undefined,
      });
    }
    if (list.length < PER) break;
  }
  return out;
}

// Farmy.cz — inzeráty zemědělské půdy a pozemků. Server-rendered HTML,
// robots.txt povoluje. Detail nabídky má výměru, okres, cenu i GPS.
async function fetchFarmy() {
  const BASE = 'https://farmy.cz';
  let listHtml;
  try { const r = await fetch(BASE + '/inzerce_aktualni_nabidky', { headers: UA }); if (!r.ok) return []; listHtml = await r.text(); }
  catch { return []; }
  const ids = [...new Set([...listHtml.matchAll(/nabidka_detail\?nab=(\d+)/g)].map((m) => m[1]))].slice(0, 40);
  const out = [];
  for (const id of ids) {
    let html;
    try { const r = await fetch(BASE + '/nabidka_detail?nab=' + id, { headers: UA }); if (!r.ok) { await sleep(200); continue; } html = await r.text(); }
    catch { continue; }
    await sleep(200); // slušnost k serveru
    const text = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
    const g = text.match(/Poloha GPS\s+([\d.]+)N,?\s*([\d.]+)E/i);
    const lat = g ? parseFloat(g[1]) : undefined;
    const lng = g ? parseFloat(g[2]) : undefined;
    const am = text.match(/Výměra\s+([\d\s]+?)\s*m2/i);
    const area = am ? parseInt(am[1].replace(/\s/g, ''), 10) || null : null;
    const pm = text.match(/Cena\s+([\d\s.]+),\d{2}\s*Kč\s*\/\s*m2/i);
    const tm = text.match(/Cena\s+([\d\s.]+),\d{2}\s*Kč(?!\s*\/\s*m2)/i);
    let price = null;
    if (pm && area) price = Math.round(parseInt(pm[1].replace(/[\s.]/g, ''), 10) * area);
    else if (tm) price = parseInt(tm[1].replace(/[\s.]/g, ''), 10) || null;
    let okres = (text.match(/v okrese\s+(.+?)\s+v\s+\S+\s+kraji/i) || [])[1];
    if (!okres && typeof lat === 'number') okres = nearestOkres(lat, lng);
    if (!okres || !price) continue;
    const obec = (text.match(/Obec\s+(.+?)\s+Okres/i) || [])[1];
    const ku = (text.match(/Katastrální území\s+([^\d]+?)\s+(?:Výměra|Poloha|Cena|Číslo)/i) || [])[1];
    const place = (obec || ku || 'Pozemek').trim().slice(0, 60);
    const druh = /ornou|orná/i.test(text) ? 'orná půda' : parseDruh(text.slice(0, 600));
    out.push({
      place, okres: okres.trim().slice(0, 40), type: 'sale',
      parcel: '—', _key: 'fa-' + id,
      druh: druh || 'pozemek', area, price,
      extra: 'inzerát – Farmy.cz',
      lat, lng, _gps: typeof lat === 'number' && typeof lng === 'number',
      url: BASE + '/nabidka_detail?nab=' + id,
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
    fetchBezrealitky(),
    fetchFarmy(),
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
      const k = (o.type + '|' + o.okres + '|' + (o._key || o.parcel)).toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort(byDeal);

  // Vyvážený výběr — ať žádná kategorie nepřeváží (jinak by stovky prodejů
  // zaplavily mapu). Dražby/exekuce bereme podle výhodnosti; u prodeje vybíráme
  // pestrý vzorek napříč cenami (ne jen nejlevnější slivery), ať je mapa zajímavá.
  const CAP = { sale: 160, drazba: 90, exekuce: 40, obec: 40 };
  const byType = {};
  for (const o of clean) (byType[o.type] || (byType[o.type] = [])).push(o);
  function spread(arr, n) {
    if (arr.length <= n) return arr;
    const step = arr.length / n, out = [];
    for (let i = 0; i < n; i++) out.push(arr[Math.floor(i * step)]);
    return out;
  }
  // Prodej má tři zdroje – každý dostane svůj díl, ať je mapa vyvážená:
  // inzeráty od lidí (Bezrealitky), zemědělská půda (Farmy) i státní půda (SPÚ).
  const sale = byType.sale || [];
  const byPrice = (a, b) => a.price - b.price;
  const bez = sale.filter((o) => /Bezrealitky/i.test(o.extra || '')).slice(0, 90);
  const farmy = sale.filter((o) => /Farmy/i.test(o.extra || ''));
  const spuSale = sale.filter((o) => /státní/i.test(o.extra || '')).sort(byPrice);
  const saleSel = [...bez, ...farmy, ...spread(spuSale, 70)];
  const fresh = [
    ...saleSel,
    ...(byType.drazba || []).slice(0, CAP.drazba),
    ...(byType.exekuce || []).slice(0, CAP.exekuce),
    ...(byType.obec || []).slice(0, CAP.obec),
  ];

  if (fresh.length === 0) {
    console.log('Žádný zdroj zatím nevrací data — ponechávám stávající soubor beze změny.');
    return;
  }

  // Zpřesnění polohy: až u vybraných příležitostí dohledáme souřadnice podle
  // názvu katastrálního území (Nominatim). Body pak sedí na správné obci, ne
  // jen ve středu okresu. Přeskakujeme záznamy s reálnou GPS z evidence dražeb.
  let refined = 0;
  for (const o of fresh) {
    if (o._gps) continue;
    const nm = await geocodeName(o.place, o.okres);
    if (nm) {
      const j = jitterAround(nm[0], nm[1], (o.parcel || '') + o.place, 0.012);
      o.lat = j.lat; o.lng = j.lng; refined++;
    }
  }
  fresh.forEach((o) => { delete o._gps; delete o._key; });
  if (geoCacheDirty) writeFileSync(GEOCACHE, JSON.stringify(GEO_CACHE, null, 0) + '\n', 'utf8');
  console.log(`Zpřesněno podle názvu KÚ: ${refined}/${fresh.length}.`);

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
