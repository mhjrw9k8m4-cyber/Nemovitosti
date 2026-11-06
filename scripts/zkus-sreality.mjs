// CO SREALITY PŘES APIFY DOOPRAVDY POSÍLÁ — změřeno z už hotového běhu.
//
// Spuštění: node scripts/zkus-sreality.mjs            (potřebuje APIFY_TOKEN)
//           .github/workflows/zkus-sreality.yml       (ručně z Actions)
//
// NESPOUŠTÍ ŽÁDNÝ NOVÝ BĚH ACTORU, a tedy nestojí ani korunu kreditu:
// čte datovou sadu POSLEDNÍHO úspěšného běhu (/runs/last/dataset/items).
// Vzniklo to proto, že první skutečný běh (6. 11., run 42252438914)
// skončil takhle: 1 630 záznamů, z nich 1 586 síto nepustilo na web
// a 44, které prošly, byly PRAŽSKÉ BYTY vydávané za pozemky. Actor si
// náš vstup `category_main_cb: 3` (pozemky) nevzal a poslal všechny
// druhy nemovitostí. Než se mapování polí opraví, musí být změřeno,
// co v těch datech vlastně je — a to se dá udělat bez dalšího běhu.
//
// NIC NEZAPISUJE. Výstup je jen v logu; rozhodnutí patří člověku.
const token = process.env.APIFY_TOKEN;
if (!token) {
  console.error('Není nastavený APIFY_TOKEN — bez něj se datová sada přečíst nedá.');
  process.exit(1);
}
const actor = process.env.APIFY_SREALITY_ACTOR || 'logiover~sreality-cz-scraper-czech-real-estate-data';
const limit = Number(process.env.LIMIT || 2000);

const adresa = `https://api.apify.com/v2/acts/${actor}/runs/last/dataset/items`
  + `?token=${encodeURIComponent(token)}&limit=${limit}&status=SUCCEEDED`;
let polozky;
try {
  const r = await fetch(adresa, { signal: AbortSignal.timeout(120000) });
  if (!r.ok) {
    console.error(`Apify odpověděl HTTP ${r.status}. 404 u /runs/last znamená, že actor`
      + ' ještě žádný úspěšný běh nemá; 401 špatný token.');
    process.exit(1);
  }
  polozky = await r.json();
} catch (e) {
  console.error('Čtení datové sady selhalo:', e && e.message);
  process.exit(1);
}
if (!Array.isArray(polozky) || !polozky.length) {
  console.log('Datová sada posledního běhu je prázdná.');
  process.exit(0);
}
const cislo = (n) => new Intl.NumberFormat('cs-CZ').format(n);
console.log(`Actor: ${actor}`);
console.log(`Záznamů v datové sadě posledního úspěšného běhu: ${cislo(polozky.length)}\n`);

/* ---------- 1) JAKÁ POLE TO MÁ ----------
   Ne „jaká pole jsem čekal", ale jaká tam jsou a jak často nejsou
   prázdná. Mapování se dolaďuje podle tohohle, ne podle dohadu. */
const pole = new Map();
for (const p of polozky) {
  for (const [k, v] of Object.entries(p || {})) {
    const z = pole.get(k) || { celkem: 0, vyplnenych: 0, ukazka: undefined };
    z.celkem++;
    if (v !== null && v !== undefined && v !== '') { z.vyplnenych++; if (z.ukazka === undefined) z.ukazka = v; }
    pole.set(k, z);
  }
}
console.log('POLE (kolik záznamů je má vyplněné):');
for (const [k, z] of [...pole].sort((a, b) => b[1].vyplnenych - a[1].vyplnenych)) {
  const u = typeof z.ukazka === 'object' ? JSON.stringify(z.ukazka).slice(0, 60) : String(z.ukazka).slice(0, 60);
  console.log(`  ${k.padEnd(22)} ${String(z.vyplnenych).padStart(5)}/${String(z.celkem).padEnd(5)}  ${u}`);
}

/* ---------- 2) CO JSOU TO ZA NEMOVITOSTI ---------- */
const poli = (vyber) => {
  const m = new Map();
  for (const p of polozky) { const k = String(vyber(p)); m.set(k, (m.get(k) || 0) + 1); }
  return [...m].sort((a, b) => b[1] - a[1]);
};
for (const [jmeno, vyber] of [
  ['category', (p) => p.category], ['categoryCode', (p) => p.categoryCode],
  ['transactionType', (p) => p.transactionType], ['subtype', (p) => p.subtype],
]) {
  console.log(`\nPODLE ${jmeno}:`);
  for (const [k, n] of poli(vyber).slice(0, 14)) console.log(`  ${String(k).padEnd(24)} ${String(n).padStart(5)}`);
}

/* ---------- 3) JEDEN CELÝ ZÁZNAM Z KAŽDÉ KATEGORIE ----------
   Bez celého záznamu se mapování psát nedá: právě proto, že se
   předtím psalo z poloviny ukázky, četla se výměra z názvu a ne
   z pole, které actor posílá. */
console.log('\nCELÝ ZÁZNAM Z KAŽDÉ KATEGORIE:');
const videno = new Set();
for (const p of polozky) {
  const k = String(p.category || p.categoryCode || '?');
  if (videno.has(k)) continue;
  videno.add(k);
  console.log(`\n--- ${k} ---\n${JSON.stringify(p, null, 1).slice(0, 1800)}`);
}

/* ---------- 4) CENA ZA METR PODLE KATEGORIE ----------
   Strop „25 000 Kč/m²" je strop POZEMKOVÝ a na byty se nehodí:
   právě on zahodil 1 586 z 1 630 záznamů. Aby se dal nastavit podle
   skutečnosti a ne podle citu, měří se rozdělení po kategoriích. */
console.log('\nCENA ZA METR PODLE KATEGORIE (z polí actoru, ne z názvu):');
const poKat = new Map();
for (const p of polozky) {
  const k = String(p.category || '?');
  const cena = Number(p.price);
  const plocha = Number(p.usableArea ?? p.landArea ?? p.area ?? p.builtUpArea);
  const zaMetr = Number(p.pricePerSqm) || (plocha > 0 && cena > 0 ? cena / plocha : NaN);
  if (!isFinite(zaMetr) || zaMetr <= 0) continue;
  const z = poKat.get(k) || [];
  z.push(zaMetr);
  poKat.set(k, z);
}
const kvantil = (a, q) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
for (const [k, z] of [...poKat].sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${k.padEnd(14)} n=${String(z.length).padStart(5)}  medián ${cislo(Math.round(kvantil(z, 0.5)))}`
    + `  p90 ${cislo(Math.round(kvantil(z, 0.9)))}  max ${cislo(Math.round(Math.max(...z)))} Kč/m²`);
}

/* ---------- 5) KOLIK Z TOHO JSOU POZEMKY K PRODEJI ----------
   To je přesně to, co se u actoru objednávalo. */
const pozemky = polozky.filter((p) => String(p.category || '').toLowerCase() === 'land'
  || Number(p.categoryCode) === 3);
const naProdej = pozemky.filter((p) => String(p.transactionType || '').toLowerCase() === 'sale'
  || Number(p.transactionCode) === 1);
console.log(`\nPOZEMKY: ${cislo(pozemky.length)} ze ${cislo(polozky.length)}, z toho na prodej ${cislo(naProdej.length)}.`);
const sGps = naProdej.filter((p) => isFinite(Number(p.lat ?? (p.gps || {}).lat)) && isFinite(Number(p.lng ?? (p.gps || {}).lng ?? (p.gps || {}).lon)));
const sPlochou = naProdej.filter((p) => Number(p.landArea ?? p.usableArea ?? p.area) > 0);
const sCenou = naProdej.filter((p) => Number(p.price) > 0);
console.log(`  se souřadnicemi ${cislo(sGps.length)}, s výměrou ${cislo(sPlochou.length)}, s cenou ${cislo(sCenou.length)}`);
for (const p of naProdej.slice(0, 10)) {
  console.log(`  · ${String(p.title || '').slice(0, 52).padEnd(54)} ${String(p.locality || '').slice(0, 30).padEnd(32)}`
    + ` ${String(p.landArea ?? p.usableArea ?? p.area ?? '—').padStart(8)} m²  ${String(p.price ?? '—').padStart(10)} Kč`);
}
/* ---------- 6) CO ACTOR DOOPRAVDY PŘIJÍMÁ NA VSTUPU ----------
   Objednávaly se pozemky klíči `category_main_cb`/`category_type_cb`
   (tak se jmenují parametry ve vyhledávání Sreality samotných). Actor
   je nevzal a pustil svůj výchozí vstup. Jména, která čekal, se dají
   přečíst z jeho vstupního schématu — taky zdarma, bez běhu. */
console.log('\nVSTUPNÍ SCHÉMA ACTORU:');
try {
  const ra = await fetch(`https://api.apify.com/v2/acts/${actor}?token=${encodeURIComponent(token)}`,
    { signal: AbortSignal.timeout(60000) });
  if (!ra.ok) throw new Error('HTTP ' + ra.status);
  const act = (await ra.json()).data || {};
  const stavby = act.taggedBuilds || {};
  const buildId = (stavby.latest || stavby.version0 || Object.values(stavby)[0] || {}).buildId;
  console.log(`  actor: ${act.username || '?'}/${act.name || '?'}, build ${buildId || '—'}`);
  if (buildId) {
    const rb = await fetch(`https://api.apify.com/v2/actor-builds/${buildId}?token=${encodeURIComponent(token)}`,
      { signal: AbortSignal.timeout(60000) });
    if (!rb.ok) throw new Error('build HTTP ' + rb.status);
    const build = (await rb.json()).data || {};
    const schema = typeof build.inputSchema === 'string' ? JSON.parse(build.inputSchema) : build.inputSchema;
    if (!schema || !schema.properties) console.log('  build nemá vstupní schéma.');
    else for (const [k, v] of Object.entries(schema.properties)) {
      const vychozi = v.default !== undefined ? JSON.stringify(v.default) : '—';
      const volby = v.enum ? ' z: ' + JSON.stringify(v.enum).slice(0, 120) : '';
      console.log(`  ${k.padEnd(22)} ${String(v.type).padEnd(8)} výchozí ${String(vychozi).padEnd(16)}`
        + `${(schema.required || []).includes(k) ? 'POVINNÉ ' : ''}${String(v.title || '').slice(0, 44)}${volby}`);
    }
  }
} catch (e) { console.log('  nepovedlo se přečíst:', e && e.message); }

/* ---------- 7) CO JSME POSLALI MY ----------
   Poslední běh má svůj vstup uložený — ať je černé na bílém, co actor
   dostal a co z toho použil. */
console.log('\nVSTUP POSLEDNÍHO BĚHU (co jsme poslali my):');
try {
  const rr = await fetch(`https://api.apify.com/v2/acts/${actor}/runs/last?token=${encodeURIComponent(token)}`,
    { signal: AbortSignal.timeout(60000) });
  if (!rr.ok) throw new Error('HTTP ' + rr.status);
  const run = (await rr.json()).data || {};
  console.log(`  běh ${run.id}, ${run.status}, začátek ${run.startedAt}, konec ${run.finishedAt}`);
  if (run.stats) {
    console.log(`  výsledků ${run.stats.resultCount ?? '?'}, doba ${Math.round((run.stats.runTimeSecs || 0))} s,`
      + ` spotřeba ${run.usageTotalUsd != null ? '$' + run.usageTotalUsd : '?'}`);
  }
  const kvs = run.defaultKeyValueStoreId;
  if (kvs) {
    const ri = await fetch(`https://api.apify.com/v2/key-value-stores/${kvs}/records/INPUT?token=${encodeURIComponent(token)}`,
      { signal: AbortSignal.timeout(60000) });
    console.log('  INPUT: ' + (ri.ok ? (await ri.text()).slice(0, 600) : 'HTTP ' + ri.status));
  }
} catch (e) { console.log('  nepovedlo se přečíst:', e && e.message); }

console.log('\nHOTOVO — nic se nezapsalo a žádný běh actoru se nespustil.');
