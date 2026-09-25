#!/usr/bin/env node
/**
 * Parcelka — sběr příležitostí z veřejných zdrojů.
 *
 * Robot stáhne data z jednotlivých zdrojů, sjednotí je do jednoho formátu
 * a zapíše do data/opportunities.json. Web si ten soubor pak jen načte.
 *
 * Zdroje: evidence dražeb (CEVD), OK dražby, Státní pozemkový úřad (§ 12),
 * Bezrealitky, Farmy.cz a volitelně Sreality přes Apify (jen s tokenem).
 * Když žádný zdroj nevrátí data, ponecháme stávající soubor beze změny,
 * aby web nezůstal prázdný.
 *
 * Formát jedné příležitosti:
 *   { place, okres, type, parcel, druh, area, price, extra, lat, lng }
 *   type ∈ 'sale' | 'drazba' | 'exekuce' | 'obec'
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { okresPodleGPS } from './okres-podle-gps.mjs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { createRequire } from 'node:module';
const __dirname = dirname(fileURLToPath(import.meta.url));
/* Co je u pozemku zavedené a jestli nejde jen o podíl — vytahuje se z
   POPISU, který se u většiny zdrojů stahoval už dávno a jen se zahazoval
   (používal se pouze k určení druhu). Pravidla jsou ve sdíleném modulu,
   ať je web i robot čtou stejně a ať se dají testovat bez sítě. */
const PKVybaveni = createRequire(import.meta.url)(join(dirname(fileURLToPath(import.meta.url)), '..', 'js', 'vybaveni.js'));
/* Zapisuje se jen to, co se opravdu našlo. Prázdné pole u dvou tisíc
   záznamů by soubor jen nafouklo a na mobilu zdržovalo. */
function pridejVybaveni(o, text) {
  if (!text) return o;
  const v = PKVybaveni.najdi(text);
  if (v.site.length) o.site = v.site;
  if (v.podil) o.podil = true;
  /* Velikost podílu je jen údaj k přečtení — nic se jí nepřepočítává
     (viz js/vybaveni.js). Půlka pozemku a jedna šestnáctina jsou ale
     úplně jiná nabídka, takže se vyplatí ji ukázat. */
  if (v.zlomek) o.zlomek = v.zlomek;
  return o;
}
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

// Vzdušná vzdálenost v km (na kontrolu, jestli výsledek geokódování vůbec
// může patřit do uvedeného okresu).
function kmMezi(lat1, lng1, lat2, lng2) {
  const r = Math.PI / 180, dLat = (lat2 - lat1) * r, dLng = (lng2 - lng1) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
/* Nejdál, kam to od středu okresu ještě může být. Změřeno na datech:
   u nabídek, jejichž poloha sedí s okresem, je nejvzdálenější 47 km
   (medián 12, devětadevadesátý percentil 30). Padesát pět km je tedy
   pohodlně nad vším, co je v pořádku, a přitom pod zjevnými omyly —
   ty byly 84 až 180 km daleko. */
const OKRES_DOSAH_KM = 55;

// Přesnější poloha podle názvu katastrálního území (Nominatim / OpenStreetMap).
const GEO_UA = { 'user-agent': 'ParcelkaBot/1.0 (+https://www.parcelaka.cz)' };
/* Okres se dosud předával jen do klíče mezipaměti, ale do DOTAZU ne — ptali
   jsme se prostě na „Police, Česko" a brali první výsledek. Jenže Polic je
   v Česku víc: nabídka z okresu Vsetín tak skončila u Jemnice, 177 km jinde.
   Stejně dopadly Rataje (180 km), Lukavec (125), Karlovice (90), Křakov (84).
   Okres teď jde do dotazu a z výsledků se bere první, který od středu toho
   okresu není dál, než okres vůbec může sahat. Když nesedí ani jeden,
   vrátíme null a poloha zůstane na středu okresu — nepřesná, ale ve
   správném kraji. To je pořád lepší než špendlík na druhém konci republiky. */
async function geocodeName(place, okres) {
  const key = (place + '|' + okres).toLowerCase();
  if (key in GEO_CACHE) return GEO_CACHE[key];
  const stred = OKRESY_MAP[okres] || null;
  let coord = null;
  try {
    const q = encodeURIComponent(place + (okres ? ', okres ' + okres : '') + ', Česko');
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=cz&q=${q}`, { headers: GEO_UA });
    if (r.ok) {
      const j = await r.json();
      if (Array.isArray(j)) {
        for (const v of j) {
          const la = +parseFloat(v.lat).toFixed(5), ln = +parseFloat(v.lon).toFixed(5);
          if (!isFinite(la) || !isFinite(ln)) continue;
          if (stred && kmMezi(stred[0], stred[1], la, ln) > OKRES_DOSAH_KM) continue;
          coord = [la, ln];
          break;
        }
      }
    }
  } catch { /* síť selhala – necháme null */ }
  GEO_CACHE[key] = coord;
  geoCacheDirty = true;
  await sleep(1100); // Nominatim: max ~1 dotaz/s
  return coord;
}

/* ---------- ČTVRŤ U VELKÝCH MĚST ------------------------------------
 *
 * U 142 nabídek je místo jen „Praha", „Brno" nebo „Ostrava" — tedy celá
 * obec. V Praze to znamená 496 km²: podle takového údaje se nedá
 * rozhodnout vůbec nic, a přitom je to první věc, na kterou se člověk
 * u pozemku dívá. Zdroj nic bližšího neuvádí, jenže SOUŘADNICE MÁME —
 * u těchhle nabídek pravé, od zdroje. Stačí je přeložit zpátky na jméno.
 *
 * Bere se z Nominatimu (tentýž, který už používáme na dohledání obcí),
 * jen opačným směrem. Zoom 14 je úroveň čtvrti: níž vrací ulici (ta
 * u pozemku často neexistuje), výš zase zpátky celé město.
 *
 * Nová hodnota jde do vlastního pole `cast`, ne do `place`. Kdyby se
 * přepsalo `place`, změní se klíč pozemku (place|parcel|okres) — a s ním
 * uložené oblíbené i adresy sdílených stránek. Za lepší popisek to
 * nestojí.
 */
function jenObec(place, okres) {
  const p = String(place || '').trim().toLowerCase();
  const k = String(okres || '').trim().toLowerCase();
  if (!p || !k) return false;
  // „Praha" v okrese „Praha", ale i „Brno" v okrese „Brno-město".
  return p === k || k.startsWith(p + '-');
}
/* Z odpovědi vybírá od nejužšího k nejširšímu. `suburb` je v Česku
   katastrální území nebo čtvrť (Řepy, Žabovřesky), `city_district`
   správní obvod (Praha 17). Ulici (`road`) ne: u pozemku bez adresy
   ukazuje na nejbližší cestu, což je něco jiného než místo. */
function castZOdpovedi(j) {
  const a = (j && j.address) || {};
  const jmeno = a.suburb || a.quarter || a.neighbourhood || a.city_district || a.borough || null;
  if (!jmeno) return null;
  const t = String(jmeno).trim();
  if (!t || t.length > 60) return null;
  return t;
}
const OBEC_UA = GEO_UA;
async function castPodleGPS(lat, lng) {
  if (!isFinite(lat) || !isFinite(lng)) return null;
  /* Klíč zaokrouhlený na tři desetiny vteřiny (~100 m): sousední parcely
     v téže čtvrti sdílejí odpověď a Nominatim se neptá zbytečně. */
  const key = 'cast|' + (+lat).toFixed(3) + ',' + (+lng).toFixed(3);
  if (key in GEO_CACHE) return GEO_CACHE[key];
  let cast = null;
  try {
    const u = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&addressdetails=1&accept-language=cs&lat=${lat}&lon=${lng}`;
    const r = await fetch(u, { headers: OBEC_UA });
    if (r.ok) cast = castZOdpovedi(await r.json());
  } catch { /* síť selhala – zůstane bez čtvrti, nic se nerozbije */ }
  GEO_CACHE[key] = cast;
  geoCacheDirty = true;
  await sleep(1100); // Nominatim: max ~1 dotaz/s
  return cast;
}

// Okres podle GPS (nejbližší okresní středisko) – pro zdroje bez názvu okresu.
/* Okres podle souřadnic. Dřív se tu hledalo NEJBLIŽŠÍ OKRESNÍ MĚSTO —
   dvakrát špatně: nejbližší město není okres, ve kterém obec leží, a
   vzdálenost se počítala ve stupních, jako by stupeň zeměpisné délky byl
   stejně dlouhý jako stupeň šířky (u nás je o třetinu kratší). Holedeč
   v okrese Louny tak vycházela jako okres Most. Teď se bod porovnává se
   skutečnou hranicí okresu — viz scripts/okres-podle-gps.mjs. */
function nearestOkres(lat, lng) {
  return okresPodleGPS(lat, lng);
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
const UA = { 'user-agent': 'ParcelkaBot/1.0 (+https://www.parcelaka.cz)' };

function parseArea(text) {
  const m = String(text).match(/(\d[\d\s.]*)\s*m(?:2|²)/i);
  if (!m) return null;
  const n = parseInt(m[1].replace(/[\s.]/g, ''), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}
/* Druh pozemku z volného textu. Pravidla jsou ve sdíleném modulu
   js/druh.js — stejně jako u sítí a příjezdu (js/vybaveni.js), ať je web
   i robot čtou stejně a ať se dají zkoušet bez sítě.

   Dřív to byl seznam kousků slov a první výskyt kdekoli v textu vyhrál.
   Na volném textu inzerátu to dělalo tři různé chyby naráz: „nestavební
   pozemek" se zapsal jako stavební (kus slova), „louka u lesa" jako
   lesní pozemek (okolí místo pozemku) a pozemek v Kostelci nad Černými
   lesy taky jako lesní (název obce). Modul hlídá hranice slov, zápor
   i předložku okolí — a jména míst se mu předávají, aby je vyškrtl.

   Co se bezpečně nepozná, vrací null; volající doplní obecné „pozemek".
   Špatný druh je horší než žádný: filtruje se podle něj, počítá se z něj
   obvyklá cena a staví se na něm statistiky okresů. */
const PKDruh = createRequire(import.meta.url)(join(dirname(fileURLToPath(import.meta.url)), '..', 'js', 'druh.js'));
function parseDruh(text, jmenaMist) {
  return PKDruh.zTextu(text, jmenaMist) || 'pozemek';
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
      const konani = zi.konaniDrazby || {};
      const zah = konani.zacatek || konani.zahajeni || konani.konec;
      // Odkaz na dražbu: jen KONKRÉTNÍ odkaz na dražbu (musí mít cestu za doménou) —
      // generická domovská stránka portálu (např. http://www.drazebni-portal.cz) je
      // pro uživatele k ničemu, tak ji zahodíme. http upgradujeme na https.
      const rawKon = (typeof konani.url === 'string' ? konani.url.trim() : '');
      const drazbaUrl = /^https?:\/\/[^/]+\/[^\s]+/.test(rawKon) ? rawKon.replace(/^http:\/\//i, 'https://') : undefined;
      // Nucená (nedobrovolná) dražba = nucený prodej → kategorie "exekuce"
      const nucena = zi.typDrazby === 'Nucená';
      const type = nucena ? 'exekuce' : 'drazba';
      const datum = zah ? String(zah).slice(0, 10) : null;
      // Jeden záznam na dražbu — pozemek v aktivní dražbě.
      // Dobrovolná dražba (drazba): jen čistý pozemek bez budovy.
      // Nucená dražba (exekuce): i pozemek se stavbou/jednotkou — u exekucí
      //   jde skoro vždy o nemovitost, kde je pozemek součástí.
      // Jeden záznam na PŘEDMĚT dražby (= jeden dražební celek s vlastní vyvolávací
      // cenou). Dřív jsme z každé dražby brali jen první předmět — teď bereme
      // všechny, ať se ukážou i dražby s víc pozemkovými celky. Cena je vždy za
      // daný celek, takže je to poctivé (neopakujeme jednu cenu u víc parcel).
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
        const druhBase = vn.pozemek.druhPozemku || parseDruh(v.nazev, [place, okres]);
        out.push({
          place, okres, type,
          parcel: String(vn.pozemek.parcelniCislo || '—').slice(0, 40),
          druh: candBudova ? (druhBase + ' se stavbou') : druhBase,
          area: area ? Math.round(area) : null, price: Math.round(price),
          extra: (nucena ? 'nucená dražba' : 'dražba') + (datum ? ' ' + datum : ''),
          lat: typeof vn.gpsLat === 'number' ? vn.gpsLat : undefined,
          lng: typeof vn.gpsLng === 'number' ? vn.gpsLng : undefined,
          _gps: typeof vn.gpsLat === 'number' && typeof vn.gpsLng === 'number',
          url: drazbaUrl,
        });
      }
    }
    // Bereme oba roky — aktivní dražby (stav „Uveřejněno") mohou přesahovat
    // přes přelom roku; neaktivní stejně odfiltruje stavPredmetu výše.
  }
  return out;
}

// OK dražby (okdrazby.cz) — veřejné i exekuční dražby nemovitostí. robots.txt
// povoluje /drazby/. Data bereme z jejich veřejného JSON API (portal/auctions).
// Seznamový endpoint není, ale ID jdou po sobě → projdeme okno posledních ID
// a přes detailní API vybereme jen aktivní POZEMKY.
const OKD_API = 'https://d1ws838f4e5d65.cloudfront.net/api/v1/portal';
const OKD_DRUH = {
  'Meadows': 'trvalý travní porost', 'Arable land': 'orná půda', 'Fields': 'orná půda',
  'Forests': 'lesní pozemek', 'Forest land': 'lesní pozemek', 'Gardens': 'zahrada',
  'Lands for housing': 'stavební pozemek', 'Building land': 'stavební pozemek',
  'Other areas': 'ostatní plocha', 'Vineyards': 'vinice', 'Orchards': 'sad',
};
async function fetchOkdrazby() {
  // 1) nejvyšší ID z homepage (okno pro sken)
  let maxId = 27100;
  try {
    const h = await (await fetch('https://www.okdrazby.cz/', { headers: UA })).text();
    const ids = [...h.matchAll(/\/drazba\/(\d+)-/g)].map((m) => +m[1]);
    if (ids.length) maxId = Math.max(maxId, ...ids);
  } catch { /* necháme výchozí odhad */ }
  const HI = maxId + 20, LO = maxId - 3000;
  const ids = [];
  for (let id = HI; id >= LO; id--) ids.push(id);

  const out = [];
  let idx = 0;
  async function worker() {
    while (idx < ids.length) {
      const id = ids[idx++];
      try {
        const r = await fetch(`${OKD_API}/auctions/${id}`, { headers: { ...UA, accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
        if (r.status !== 200) continue;
        const j = await r.json();
        const cats = j.categoriesLocalized || [];
        if (!cats.includes('Land')) continue;                 // jen pozemky
        if (!/Prepared|Ongoing|Running|Published/i.test(j.statusLocalized || '')) continue; // jen aktivní/nadcházející
        const bma = j.biddingMethodAttributes || {};
        const price = Math.round(+(bma.lowestSubmission || bma.estimatedPrice || j.auctionSecurity || 0)) || 0;
        if (!price) continue;
        const txt = (j.name || '') + ' ' + (j.description || '');
        const area = parseArea(j.name) || parseArea(j.description);
        // okres: z GPS (spolehlivé), jinak z textu „okres X"
        let okres = (typeof j.lat === 'number' && typeof j.lon === 'number') ? nearestOkres(j.lat, j.lon) : null;
        const om = txt.match(/okres\s+([A-Za-zÁ-Žá-ž.\-]+(?:\s[A-Za-zÁ-Žá-ž.\-]+){0,2})/);
        if (om) { const cand = normOkres(om[1].trim().replace(/[.,;].*$/, '')); if (OKRESY_MAP[cand]) okres = cand; }
        if (!okres) continue;
        const km = j.name && j.name.match(/k\.?\s*ú\.?\s*([A-Za-zÁ-Žá-ž0-9 .\-]+?)(?:\s*,|\s+okres|\s*$)/i);
        // místo = katastrální území (obec); když v názvu není, použijeme okresní město
        const place = (km ? km[1].trim().slice(0, 60) : okres);
        const pm = (j.description || '').match(/p\.?\s*č\.?\s*([\d/]+)/);
        // Typ dražby z API: „Foreclosure auction (nonvoluntary)" / typeId 2 = nucený
        // prodej (exekuce/insolvence). Ostatní (veřejná / dobrovolná) = běžná dražba.
        const nucena = j.typeId === 2 || /nonvoluntary/i.test(j.typeLocalized || '') || /exekuc|nedobrovoln|nucen|insolven/i.test(txt);
        const druhCat = cats[cats.length - 1];
        const druh = OKD_DRUH[druhCat] || parseDruh(txt, [place, okres]);
        const datum = j.start ? String(j.start).slice(0, 10) : (j.finish ? String(j.finish).slice(0, 10) : null);
        out.push({
          place, okres, type: nucena ? 'exekuce' : 'drazba',
          parcel: (pm ? pm[1] : '—').slice(0, 40), _key: 'okd-' + id,
          druh, area: area || null, price,
          extra: (nucena ? 'nucená dražba' : 'dražba') + (datum ? ' ' + datum : '') + ' · OK dražby',
          lat: typeof j.lat === 'number' ? j.lat : undefined,
          lng: typeof j.lon === 'number' ? j.lon : undefined,
          _gps: typeof j.lat === 'number' && typeof j.lon === 'number',
          url: 'https://www.okdrazby.cz/drazba/' + id,
        });
        pridejVybaveni(out[out.length - 1], txt);
      } catch { /* přeskoč rozbité ID */ }
    }
  }
  await Promise.all(Array.from({ length: 8 }, worker));
  return out;
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
    const druh = (c[4] || '').trim() || parseDruh(c[5] || '', [place, okres]);
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
      list{ id uri title description address(locale: CS) price surface surfaceLand gps{ lat lng } }
    }
  }`;
  const out = [];
  const PER = 60, PAGES = 120; // až ~7200 inzerátů — projdeme celou nabídku pozemků (smyčka se sama zastaví)
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
      // Adresa mívá tvar „Obec - katastrální území" — pro přehlednost bereme
      // jen obec (první část), ať se nezobrazuje dlouhý zdvojený název.
      const place = (parts[0] || a.title || 'Pozemek').split(/\s*-\s*/)[0].trim().slice(0, 60) || 'Pozemek';
      let okres = hasGps ? nearestOkres(gps.lat, gps.lng) : null;
      if (!okres) okres = (parts[parts.length - 1] || place).replace(/\s*kraj$/i, '').slice(0, 40);
      // Druh vytáhneme z popisu + názvu (API druh pozemku neuvádí) —
      // takhle se zviditelní stavební pozemky i lesy.
      const druh = parseDruh((a.description || '') + ' ' + (a.title || ''), [place, okres]);
      out.push({
        place, okres, type: 'sale',
        parcel: '—', _key: 'br-' + a.id, // dedup podle inzerátu, ne parcely
        druh, area, price,
        extra: 'inzerát – Bezrealitky',
        lat: typeof gps.lat === 'number' ? gps.lat : undefined,
        lng: typeof gps.lng === 'number' ? gps.lng : undefined,
        _gps: typeof gps.lat === 'number' && typeof gps.lng === 'number',
        url: a.uri ? 'https://www.bezrealitky.cz/nemovitosti-byty-domy/' + a.uri : undefined,
      });
      pridejVybaveni(out[out.length - 1], (a.description || '') + ' ' + (a.title || ''));
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
  const ids = [...new Set([
    ...[...listHtml.matchAll(/nabidka_detail\?nab=(\d+)/g)].map((m) => m[1]),
    ...[...listHtml.matchAll(/nabidka_detail\/(\d+)/g)].map((m) => m[1]),
  ])].slice(0, 450);
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
    const druh = parseDruh(text.slice(0, 900), [place, okres]);
    out.push({
      place, okres: okres.trim().slice(0, 40), type: 'sale',
      parcel: '—', _key: 'fa-' + id,
      druh: druh || 'pozemek', area, price,
      extra: 'inzerát – Farmy.cz',
      lat, lng, _gps: typeof lat === 'number' && typeof lng === 'number',
      url: 'https://www.farmy.cz/nabidka_detail?nab=' + id,
    });
    pridejVybaveni(out[out.length - 1], text.slice(0, 4000));
  }
  return out;
}

// Sreality.cz — přes Apify (placené API). Ověřeno v běhu Action (srpen 2026):
// runner na Sreality dosáhne (homepage/sitemap 200), ale staré API v2 je zrušené
// (404) a nové v1 vyžaduje přihlašovací token (401) — zdarma a spolehlivě to
// nejde a obcházet přihlášení nechceme. Řešení: hotový Apify actor, který se
// postará o přihlášení i proxy a vrátí čistý JSON.
//
// AKTIVUJE SE JEN když je nastaven tajný klíč APIFY_TOKEN
// (GitHub → Settings → Secrets and variables → Actions → New repository secret).
// Bez klíče je to no-op — na běžný bezplatný provoz nemá žádný vliv. Volitelně
// APIFY_SREALITY_ACTOR přepíše použitý actor. Po prvním reálném běhu se mapování
// polí doladí podle skutečného výstupu (viz log „Sreality/Apify vzorek").
async function fetchSreality() {
  const token = process.env.APIFY_TOKEN;
  if (!token) return []; // klíč nenastaven → zdroj se nepoužije
  const actor = process.env.APIFY_SREALITY_ACTOR || 'logiover~sreality-cz-scraper-czech-real-estate-data';
  let items;
  try {
    const input = { category_main_cb: 3, category_type_cb: 1, maxItems: 4000 }; // pozemky na prodej
    const r = await fetch(`https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(290000),
    });
    if (!r.ok) { console.error(`Sreality/Apify: HTTP ${r.status} — zkontroluj token/actor.`); return []; }
    items = await r.json();
  } catch (e) { console.error('Sreality/Apify selhal:', e && e.message); return []; }
  if (!Array.isArray(items) || !items.length) { console.log('Sreality/Apify: 0 položek.'); return []; }
  console.log(`Sreality/Apify vzorek: ${JSON.stringify(items[0]).slice(0, 500)}`);
  const num = (v) => { const n = +String(v).replace(/[^\d.]/g, ''); return isFinite(n) ? n : NaN; };
  const out = [];
  for (const e of items) {
    const price = Math.round(num(e.price ?? e.priceValue ?? e.price_czk ?? e.priceCzk)) || 0;
    if (!price || price < 5000) continue;
    const gps = e.gps || e.location || {};
    const lat = num(e.lat ?? e.latitude ?? gps.lat ?? gps.latitude);
    const lng = num(e.lng ?? e.lon ?? e.longitude ?? gps.lon ?? gps.lng ?? gps.longitude);
    const name = String(e.name || e.title || '');
    const loc = String(e.locality || e.address || (typeof e.location === 'string' ? e.location : '') || '');
    const area = parseArea(name + ' ' + loc) || (num(e.area ?? e.surface ?? e.surfaceLand) || null);
    let okres = (isFinite(lat) && isFinite(lng)) ? nearestOkres(lat, lng) : null;
    if (!okres) { const om = loc.match(/okres\s+([A-Za-zÁ-Žá-ž.\- ]+)/i); if (om) { const c = normOkres(om[1].trim().replace(/[.,;].*$/, '')); if (OKRESY_MAP[c]) okres = c; } }
    if (!okres) continue;
    const parts = loc.split(',').map((s) => s.trim()).filter(Boolean);
    const place = (parts[0] || name || 'Pozemek').split(/\s*-\s*/)[0].trim().slice(0, 60) || 'Pozemek';
    const url = e.url || e.link || e.detailUrl || undefined;
    /* Adresa (loc) se sem schválně neposílá: je to popis MÍSTA, ne
       pozemku, a je v ní obec i okres. */
    const druh = parseDruh(name, [place, okres]);
    out.push({
      place, okres, type: 'sale', parcel: '—',
      _key: 'sr-' + (e.hash_id || e.id || url || (place + '-' + price)),
      druh: druh || 'pozemek', area, price, extra: 'inzerát – Sreality',
      lat: isFinite(lat) ? lat : undefined, lng: isFinite(lng) ? lng : undefined,
      _gps: isFinite(lat) && isFinite(lng),
      url,
    });
  }
  console.log(`Sreality/Apify: ${out.length} pozemků.`);
  return out;
}

/* ---------- Sjednocení a zápis ---------- */

// 'area' není povinná (u exekucí výměra v evidenci často chybí)
const REQUIRED = ['place', 'okres', 'type', 'parcel', 'druh', 'price', 'lat', 'lng'];
const TYPES = new Set(['sale', 'drazba', 'exekuce', 'obec']);

function valid(o) {
  if (!o || typeof o !== 'object') return false;
  if (!TYPES.has(o.type)) return false;
  if (!REQUIRED.every((k) => o[k] !== undefined && o[k] !== null && o[k] !== '')) return false;
  // Cena musí být důvěryhodná. Pod 5 000 Kč jde skoro vždy o chybu stahování
  // (např. cena za m² spletená s celkovou cenou) — takové raději nezobrazujeme.
  const price = Number(o.price);
  if (!isFinite(price) || price < 5000 || price > 2e9) return false;
  // Cena za m² nesmí být absurdně vysoká. Přes 25 000 Kč/m² jde skoro vždy
  // o chybu (přehozené číslo, spoluvlastnický podíl…) — nejdražší reálné
  // stavební pozemky se drží hluboko pod tím.
  const area = Number(o.area);
  if (isFinite(area) && area > 0 && price / area > 25000) return false;
  // Jen pozemky v ČR — souřadnice musí padnout do hranic republiky.
  const lat = Number(o.lat), lng = Number(o.lng);
  if (!isFinite(lat) || !isFinite(lng) || lat < 48.4 || lat > 51.2 || lng < 12.0 || lng > 18.95) return false;
  // Obdélník ale zahrnuje i kus Německa/Rakouska/Polska u hranic. Přesnější test:
  // bod MUSÍ ležet blízko některého okresního střediska (ČR je hustě pokrytá 76 okresy,
  // každé místo v ČR je od nějakého do ~30 km). Když je nejbližší okres přes 42 km
  // daleko, bod leží za hranicemi (např. inzerát se zahraniční GPS) → zahodíme.
  let nearestSq = Infinity;
  for (const k in OKRESY_MAP) {
    const c = OKRESY_MAP[k];
    const dLat = (c[0] - lat) * 111, dLng = (c[1] - lng) * 71;
    const sq = dLat * dLat + dLng * dLng;
    if (sq < nearestSq) nearestSq = sq;
  }
  if (nearestSq > 40 * 40) return false;
  // Druhá pojistka pro příhraničí: zjevně NĚMECKÝ název místa (ß, Straße, -weg,
  // Mühle, Pfarr…) — takové znaky se v českých názvech obcí prakticky nevyskytují,
  // takže jde o zahraniční inzerát se souřadnicemi za hranicí. Nezobrazujeme.
  if (/ß|stra(ss|ß)e|m[üu]hle|pfarr|hausen|kirchen|\bweg\b|weg\s*\d|holz\b|\bdorf\b/i.test(String(o.place || ''))) return false;
  return true;
}

async function main() {
  // Pojmenované zdroje → v logu Actions je hned vidět, který přestal vracet data.
  const SOURCES = [
    ['Dražby', fetchDrazby],
    ['OK dražby', fetchOkdrazby],
    ['SPÚ', fetchProdejSPU],
    ['Bezrealitky', fetchBezrealitky],
    ['Sreality (Apify)', fetchSreality], // aktivní jen s APIFY_TOKEN, jinak []
    ['Farmy', fetchFarmy],
  ];
  const results = await Promise.allSettled(SOURCES.map(([, fn]) => fn()));
  // Stav každého zdroje se ZAPISUJE do dat, nejen loguje. Na webu totiž
  // stálo jen „aktualizováno 20. 9." — jedno datum za všechno dohromady.
  // Když pak jeden zdroj tiše přestane vracet data, web dál tvrdí, že je
  // čerstvý. Takhle je u každého zdroje vidět, kdy naposledy odpověděl
  // a kolik toho přinesl.
  const zdroje = results.map((r, i) => ({
    nazev: SOURCES[i][0],
    stav: r.status === 'fulfilled' ? 'ok' : 'chyba',
    pocet: r.status === 'fulfilled' ? (r.value || []).length : 0,
    cas: new Date().toISOString(),
    chyba: r.status === 'rejected' ? String((r.reason && r.reason.message) || r.reason).slice(0, 140) : null,
  }));
  zdroje.forEach((z) => {
    if (z.stav === 'ok') console.log(`Zdroj ${z.nazev}: ${z.pocet} záznamů.`);
    else console.error(`Zdroj ${z.nazev} SELHAL: ${z.chyba}`);
  });

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
  const CAP = { sale: 160, drazba: 1300, exekuce: 1000, obec: 250 };
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
  // Portály s přímým odkazem na inzerát (Bezrealitky, Farmy) dostanou nejvíc
  // prostoru — na ně se dá kliknout a rovnou volat prodejci. Státní půda (SPÚ)
  // nemá odkaz na konkrétní parcelu, tak jí dáme míň. Přes spread() bereme
  // pestrý vzorek napříč cenami (ne jen nejlevnější slivery), ať je mapa zajímavá.
  const bez = sale.filter((o) => /Bezrealitky/i.test(o.extra || ''));
  const srealit = sale.filter((o) => /Sreality/i.test(o.extra || '')); // prázdné bez APIFY_TOKEN
  const farmy = sale.filter((o) => /Farmy/i.test(o.extra || ''));
  const spuSale = sale.filter((o) => /státní/i.test(o.extra || '')).sort(byPrice);
  const saleSel = [
    ...bez,                     // celá nabídka Bezrealitky (přímý odkaz na inzerát)
    ...spread(srealit, 2500),   // Sreality přes Apify (jen s klíčem, jinak prázdné)
    ...farmy,                   // celá nabídka Farmy
    ...spread(spuSale, 900),    // státní půda doplní zbytek
  ];
  // Dražba, která už proběhla, není příležitost. Zdroje je z výpisu neodstraní
  // hned (u některých tam visí měsíce), takže je vyhazujeme sami — jinak se
  // počítají do „44 dražeb" a zabírají místo na mapě. Den konání ještě platí,
  // proto porovnáváme k dnešnímu půlnočnímu času.
  const dnes = new Date(); dnes.setHours(0, 0, 0, 0);
  const jesteBezi = (o) => {
    if (o.type !== 'drazba' && o.type !== 'exekuce') return true;
    const m = /(\d{4})-(\d{2})-(\d{2})/.exec(o.extra || '');
    if (!m) return true;                        // bez termínu nevíme — necháme
    return new Date(+m[1], +m[2] - 1, +m[3]) >= dnes;
  };
  const drazby = (byType.drazba || []).filter(jesteBezi);
  const exekuce = (byType.exekuce || []).filter(jesteBezi);
  const vyprsele = ((byType.drazba || []).length - drazby.length) + ((byType.exekuce || []).length - exekuce.length);
  if (vyprsele) console.log(`Vynecháno ${vyprsele} dražeb/exekucí s termínem v minulosti.`);

  const fresh = [
    ...saleSel,
    ...drazby.slice(0, CAP.drazba),
    ...exekuce.slice(0, CAP.exekuce),
    ...(byType.obec || []).slice(0, CAP.obec),
  ];

  if (fresh.length === 0) {
    console.log('Žádný zdroj zatím nevrací data — ponechávám stávající soubor beze změny.');
    return;
  }

  // Pojistka proti „utržení" dat: když je nově staženo výrazně míň než minule
  // (nejspíš se rozbil některý zdroj), NEPŘEPISUJEME — necháme stará data a
  // skončíme s chybou, aby úloha spadla a GitHub poslal majiteli upozornění.
  let prevCount = 0;
  try { prevCount = (JSON.parse(readFileSync(OUT, 'utf8')).opportunities || []).length; } catch { /* první běh */ }
  if (prevCount >= 30 && fresh.length < prevCount * 0.6) {
    console.error(
      `CHYBA: staženo jen ${fresh.length} příležitostí (minule ${prevCount}). ` +
      'Nejspíš se rozbil některý zdroj — ponechávám stará data a končím s chybou, ať přijde upozornění.'
    );
    process.exit(1);
  }

  // Zpřesnění polohy: až u vybraných příležitostí dohledáme souřadnice podle
  // názvu katastrálního území (Nominatim). Body pak sedí na správné obci, ne
  // jen ve středu okresu. Přeskakujeme záznamy s reálnou GPS z evidence dražeb.
  /* NEJDŘÍV PROVĚŘIT SOUŘADNICE OD ZDROJE. Doteď se braly jako svaté —
     „přeskakujeme záznamy s reálnou GPS z evidence dražeb". Jenže i
     oficiální registr se mýlí: dvě různé dražby (Komorní Lhotka na
     Frýdecko-Místecku a Rychvald na Karvinsku) dostaly TYTÉŽ souřadnice,
     a to 350 km jinde, v severních Čechách.
     Okres přitom známe z dražební vyhlášky, a ta je spolehlivá. Když si
     souřadnice s okresem odporují, vyhrává vyhláška: GPS se zahodí a
     poloha se dohledá podle názvu obce jako u ostatních. Je to táž mez
     (55 km) a táž úvaha jako u Holedče — jen z druhé strany. */
  let zdrojSpatne = 0;
  for (const o of fresh) {
    if (!o._gps) continue;
    const stred0 = OKRESY_MAP[o.okres];
    if (!stred0 || typeof o.lat !== 'number' || typeof o.lng !== 'number') continue;
    if (kmMezi(stred0[0], stred0[1], o.lat, o.lng) <= OKRES_DOSAH_KM) continue;
    o.lat = undefined; o.lng = undefined; o._gps = false;
    zdrojSpatne++;
  }
  if (zdrojSpatne) console.log(`Zahozeny souřadnice od zdroje, které si odporovaly s okresem: ${zdrojSpatne}.`);

  let refined = 0, zamitnuto = 0;
  for (const o of fresh) {
    if (o._gps) continue;
    let nm = await geocodeName(o.place, o.okres);
    /* Pojistka i na cestě z mezipaměti: ta si pamatuje i výsledky uložené
       dřív, než se okres začal ověřovat. Špatný bod se nesmí vrátit zpátky
       jen proto, že už jednou uložený byl. */
    const stred = OKRESY_MAP[o.okres];
    if (nm && stred && kmMezi(stred[0], stred[1], nm[0], nm[1]) > OKRES_DOSAH_KM) {
      const klic = (o.place + '|' + o.okres).toLowerCase();
      delete GEO_CACHE[klic]; geoCacheDirty = true;
      nm = null; zamitnuto++;
    }
    if (nm) {
      const j = jitterAround(nm[0], nm[1], (o.parcel || '') + o.place, 0.012);
      o.lat = j.lat; o.lng = j.lng; refined++;
    }
  }
  /* Čtvrť u nabídek, kde je místo jen celá obec. Jen tam, kde jsou
     souřadnice OD ZDROJE (o._gps): u dopočítaných by se jméno čtvrti
     vzalo z bodu, který jsme si sami vymysleli. */
  let sCasti = 0;
  for (const o of fresh) {
    if (!o._gps || !jenObec(o.place, o.okres)) continue;
    const c = await castPodleGPS(o.lat, o.lng);
    if (c && c.toLowerCase() !== String(o.place || '').toLowerCase()) { o.cast = c; sCasti++; }
  }
  const hrubych = fresh.filter((o) => jenObec(o.place, o.okres)).length;
  console.log(`Čtvrť doplněna u ${sCasti} z ${hrubych} nabídek, kde bylo místo jen celá obec.`);

  fresh.forEach((o) => { delete o._gps; delete o._key; });
  if (geoCacheDirty) writeFileSync(GEOCACHE, JSON.stringify(GEO_CACHE, null, 0) + '\n', 'utf8');
  console.log(`Zpřesněno podle názvu KÚ: ${refined}/${fresh.length}.` +
    (zamitnuto ? ` Zamítnuto jako jiná obec téhož jména: ${zamitnuto} (zůstávají na středu okresu).` : ''));

  // Kdy se pozemek objevil poprvé. Data to dosud nenesla, takže se nedalo
  // říct „přibylo dnes" — šlo jen spočítat, co uživatel ještě neviděl, a to
  // je něco jiného: po smazání historie by byl najednou nový úplně všechno.
  // Datum se přenáší ze starého souboru podle otisku; co tam nebylo, dostane
  // dnešek. Otisk musí být shodný s keyOf() v js/hlidani-logika.js a
  // js/hlidani-logika.js, jinak by se pozemky „obnovovaly" při každém běhu.
  const bezDiakritiky = (x) => String(x == null ? '' : x)
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const otisk = (o) => [o.type || '', bezDiakritiky(o.okres), bezDiakritiky(o.place),
    o.parcel || '', o.price || '', o.area || ''].join('|').slice(0, 240);
  let drive = new Map();
  try {
    for (const o of (JSON.parse(readFileSync(OUT, 'utf8')).opportunities || [])) {
      if (o.first_seen) drive.set(otisk(o), o.first_seen);
    }
  } catch { /* první běh — všechno je nové */ }
  const dnesISO = new Date().toISOString().slice(0, 10);
  let novych = 0;
  for (const o of fresh) {
    const d = drive.get(otisk(o));
    if (d) { o.first_seen = d; } else { o.first_seen = dnesISO; novych++; }
  }
  console.log(`Poprvé viděno dnes: ${novych} z ${fresh.length}` +
    (drive.size ? '' : ' (první běh se značkováním — všechno dostalo dnešek)'));

  const payload = {
    updated: new Date().toISOString().slice(0, 10),
    // Přesný čas, ne jen datum: „zkontrolováno dnes v 7:00" říká o čerstvosti
    // mnohem víc než „aktualizováno 20. 9.", zvlášť když robot běží 4× denně.
    updated_at: new Date().toISOString(),
    source: 'Veřejné dražby (CEVD, OK dražby) + Státní pozemkový úřad + inzeráty (Bezrealitky, Farmy, příp. Sreality přes Apify)',
    sources: zdroje,
    opportunities: fresh,
  };
  // Minifikovaně (bez odsazení) — menší soubor = rychlejší načtení na mobilu.
  writeFileSync(OUT, JSON.stringify(payload) + '\n', 'utf8');
  const counts = fresh.reduce((a, o) => ((a[o.type] = (a[o.type] || 0) + 1), a), {});
  console.log(`Zapsáno ${fresh.length} příležitostí do ${OUT}. Dle typu:`, JSON.stringify(counts));
}

main().catch((err) => {
  console.error('Chyba při sběru dat:', err);
  process.exitCode = 1;
});
