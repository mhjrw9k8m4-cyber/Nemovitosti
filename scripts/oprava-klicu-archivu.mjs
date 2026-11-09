#!/usr/bin/env node
/* JEDNORÁZOVÁ OPRAVA: archiv ztratil spojení s živými nabídkami
   ==================================================================
   Spuštění:  node scripts/oprava-klicu-archivu.mjs          (jen ukáže)
              node scripts/oprava-klicu-archivu.mjs --zapsat (opraví)

   CO SE STALO. Klíč archivu je `pkey(nabídka) + '#' + otisk adresy
   inzerátu` a pkey nese OBEC, OKRES a SOUŘADNICE. Osmého listopadu
   dostaly nabídky z Bezrealitek okres dopočítaný ze souřadnic místo
   hlasování podle názvu obce (commit „Bezrealitky: okres ze souřadnic")
   a tisícům z nich se tím okres i poloha opravily. Oprava byla správná,
   jenže změnila klíč — a archiv si historii vede právě pod ním.

   Změřeno 9. 11. na uzavřených obdobích v data/archiv/*.jsonl:
     · před tou změnou sedělo na živou nabídku 581 uzavřených klíčů
     · hned po ní 7
   Jinými slovy: 574 nabídkám zmizela historie ceny. Na webu se to
   projevilo tak, že filtr „Zlevněné" nabízel místo 129 nabídek jednu
   a graf vývoje ceny se přestal kreslit skoro všude. Ohlásily to
   `test-zlevnene-filtr` a `test-cenova-historie`.

   PROČ NE PÁROVÁNÍ PODLE OTISKU ADRESY. Nabízí se vzít z klíče část za
   `#` a najít živou nabídku s týmž otiskem. Je to past: otisk má čtyři
   až sedm znaků a kolize jsou běžné. Změřeno — takhle by se spárovalo
   88 klíčů, mezi nimi `Přestavlky|—|Litoměřice|50.407|14.198#4qrhn`
   s `Přestavlky|—|Přerov|49.387|17.480#4qrhn`, tedy dvě parcely tři
   sta kilometrů od sebe. Spojit cizí historii s cizí nabídkou je horší
   než nespojit nic.

   JAK SE TO PÁRUJE POCTIVĚ. Totožnost nabídky nese CELÁ adresa
   inzerátu, ne její otisk. Ta v archivu není, ale je v historii
   `data/opportunities.json` — robot ten soubor přepisuje při každém
   běhu a git si pamatuje každou verzi. Projdou se tedy všechny jeho
   verze, u každé se spočítá klíč archivu TOUŽ cestou jako v archiv.mjs
   (PKCisteni.pozemky → PKHlidani.bezDuplicit → PKKlic.klicArchivu)
   a zapíše se, které adrese ten klíč patřil. Dnešní data dají opačnou
   mapu: adresa → dnešní klíč. Starý klíč se přejmenuje jen tehdy,
   když je na obou stranách JEDNOZNAČNÝ — jedna adresa, jeden klíč.

   CO SE NEOPRAVÍ. Nabídky bez adresy inzerátu (dražby z registrů mají
   klíč zakončený `#v<výměra>`) tahle cesta nespáruje; u nich zůstává
   obsahové párování v premapujKlice. A nabídky, které mezitím z trhu
   odešly, se nepárují vůbec — jejich historie je uzavřená a správně.

   KDO TO VOLÁ: nikdo. Je to ruční nástroj, ne součást sestavení ani
   robota. Trvalou pojistku proti opakování drží `premapujKlice`
   v scripts/archiv.mjs (přejmenovává i uzavřená období) a hlídač
   v scripts/test-archiv.mjs.
   ================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARCHIV = path.join(KOREN, 'data', 'archiv');
const _req = createRequire(import.meta.url);
const KLIC = _req(path.join(KOREN, 'js', 'klic.js')).PKKlic;
const PKH = _req(path.join(KOREN, 'js', 'hlidani-logika.js'));
const PKC = _req(path.join(KOREN, 'js', 'cisteni.js'));

/** Nabídky z textu souboru opportunities.json (týž tvar jako archiv.mjs). */
function nabidkyZe(text) {
  try {
    const j = JSON.parse(text);
    return Array.isArray(j) ? j : (j.opportunities || []);
  } catch (e) { return null; }
}

/** Klíč archivu pro každou nabídku — TOUŽ cestou, jakou jde archiv.mjs. */
export function kliceSAdresou(nabidky) {
  const cista = PKH.bezDuplicit(PKC.pozemky((nabidky || []).filter((d) => d && d.place && d.okres)));
  const out = [];
  const videne = new Set();
  for (const d of cista) {
    const k = KLIC.klicArchivu(d);
    if (videne.has(k)) continue;
    videne.add(k);
    const url = String(d.url || '').trim();
    if (url) out.push([k, url]);
  }
  return out;
}

/** Jednoznačná mapa z dvojic; dvojí obsazení se zahodí (hodnota null). */
export function jednoznacne(dvojice, prohodit) {
  const m = new Map();
  for (const [k, u] of dvojice) {
    const [a, b] = prohodit ? [u, k] : [k, u];
    if (m.has(a)) { if (m.get(a) !== b) m.set(a, null); }
    else m.set(a, b);
  }
  return m;
}

/**
 * Z dvou map udělá přejmenování starých klíčů na nové.
 * Jednoznačnost se vyžaduje na OBOU stranách: adresa, která v historii
 * patřila dvěma klíčům, ani klíč, který patřil dvěma adresám, se
 * nepřejmenují. Cílem smí být jen klíč, který je dnes živý.
 */
export function sestavPrejmenovani(stareKliceNaUrl, urlNaNovyKlic, zive) {
  const mapa = new Map();
  for (const [stary, url] of stareKliceNaUrl) {
    if (!url) continue;                       // nejednoznačné už při sběru
    if (zive.has(stary)) continue;            // klíč sedí, není co opravovat
    const novy = urlNaNovyKlic.get(url);
    if (!novy || novy === stary) continue;
    if (!zive.has(novy)) continue;            // cíl musí být živá nabídka
    mapa.set(stary, novy);
  }
  return mapa;
}

function nactiUzavrene() {
  const soubory = fs.existsSync(ARCHIV)
    ? fs.readdirSync(ARCHIV).filter((x) => x.endsWith('.jsonl')).sort() : [];
  return soubory.map((f) => ({
    f, radky: fs.readFileSync(path.join(ARCHIV, f), 'utf8').split('\n'),
  }));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const zapsat = process.argv.includes('--zapsat');
  const stav = JSON.parse(fs.readFileSync(path.join(ARCHIV, 'stav.json'), 'utf8'));
  const zive = new Set(Object.keys(stav.nabidky || {}));

  /* Dnešek: adresa → klíč. */
  const dnesni = kliceSAdresou(nabidkyZe(
    fs.readFileSync(path.join(KOREN, 'data', 'opportunities.json'), 'utf8')));
  const urlNaNovyKlic = jednoznacne(dnesni, true);

  /* Historie: klíč → adresa, přes všechny verze souboru. */
  const commity = execFileSync('git', ['log', '--format=%H', '--', 'data/opportunities.json'],
    { cwd: KOREN, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\n').map((x) => x.trim()).filter(Boolean);
  const vsechny = [];
  let prectenych = 0;
  for (const c of commity) {
    let text;
    try {
      text = execFileSync('git', ['show', `${c}:data/opportunities.json`],
        { cwd: KOREN, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
    } catch (e) { continue; }
    const n = nabidkyZe(text);
    if (!n || !n.length) continue;
    prectenych++;
    for (const d of kliceSAdresou(n)) vsechny.push(d);
  }
  const stareKliceNaUrl = jednoznacne(vsechny, false);
  console.log(`Přečteno ${prectenych} verzí data/opportunities.json`
    + ` (${commity.length} commitů), klíčů s jednoznačnou adresou:`
    + ` ${[...stareKliceNaUrl.values()].filter(Boolean).length}`);

  const mapa = sestavPrejmenovani(stareKliceNaUrl, urlNaNovyKlic, zive);
  console.log(`Přejmenování k provedení: ${mapa.size}`);

  const soubory = nactiUzavrene();
  let zasazeno = 0;
  for (const s of soubory) {
    let zmena = false;
    s.radky = s.radky.map((r) => {
      if (!r.trim()) return r;
      let z; try { z = JSON.parse(r); } catch (e) { return r; }
      const novy = mapa.get(z.k);
      if (!novy) return r;
      z.k = novy; zmena = true; zasazeno++;
      return JSON.stringify(z);
    });
    if (zmena && zapsat) fs.writeFileSync(path.join(ARCHIV, s.f), s.radky.join('\n'));
  }
  const sedi = [...new Set(soubory.flatMap((s) => s.radky.filter((r) => r.trim())
    .map((r) => { try { return JSON.parse(r).k; } catch (e) { return ''; } })))]
    .filter((k) => zive.has(k)).length;
  console.log(`Přepsaných řádků: ${zasazeno}`
    + ` · uzavřených klíčů sedících na živou nabídku po opravě: ${sedi}`);
  if (!zapsat) console.log('(nic se nezapsalo — spusťte s --zapsat)');
}
