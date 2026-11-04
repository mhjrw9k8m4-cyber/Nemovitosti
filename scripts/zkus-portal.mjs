#!/usr/bin/env node
/* BOT, KTERÝ NA PORTÁLU VYZKOUŠÍ VŠECHNY CESTY — A SPOJÍ HO DÁL
   ==================================================================
   Spuštění:
     node scripts/zkus-portal.mjs                      (všichni kandidáti, jen vypíše)
     node scripts/zkus-portal.mjs --zapis              (uloží nález)
     node scripts/zkus-portal.mjs https://www.vls.cz/  (jeden portál)
     node scripts/zkus-portal.mjs --strop-portalu=3    (jen první tři)
   V Actions: workflow „Zkoušení portálů".

   PROČ. Cesta ke každému zdroji se dosud hledala RUČNĚ. U ÚZSVM to
   stálo šest běhů ohledání a dvě adresy, které vracely 404, než se
   našel tvar, který odpovídá. Takhle se dá projít pět portálů, ne sto
   — a kandidátů i nalezených hostitelů je víc, než na kolik mám běhů.

   CO TEDY DĚLÁ. U každého portálu projde katalog tvarů adres
   (scripts/cesty-portalu.mjs: otevřená data podle české normy, CKAN,
   DCAT, ArcGIS, WFS, OAI-PMH, RSS, sitemapa, obvyklé stránky
   s nabídkami, obvyklá API) a u KAŽDÉ zapíše, co odpověděla. Potom
   zkusí z odpovědi PŘEČÍST NABÍDKY obecnou cestou (JSON-LD →
   mikrodata → signály, scripts/cteni-zdroje.mjs) — teprve to rozhodne,
   jestli cesta vede k pozemkům, nebo jen odpovídá.

   A SPOJOVÁNÍ PORTÁLŮ. Vstupní adresa skoro nikdy není ta, kde nabídky
   jsou: katalog vede na datovou sadu, sada na soubor, sitemapa na
   výpis, výpis na inzerát. Nález z jedné cesty je proto vstup pro
   další (`dalsiCesty`) do změřené hloubky — ne do nekonečna.

   CO NEDĚLÁ A DĚLAT NEBUDE:
     · neobchází nic. robots.txt se čte PRVNÍ u každého hostitele a
       zákaz je konec, ne překážka. Jedno jméno robota, žádné střídání
       hlaviček, žádné předstírání prohlížeče (hlídá test-zkus-portal).
     · nezapojuje zdroj sám. Když cesta vrátí nabídky, NAPÍŠE řádek do
       registru a tím skončí — o cizím webu se rozhoduje po přečtení
       jeho podmínek užití a to je práce pro člověka, ne pro bota.
     · nehádá. Co se nezměřilo, se do nálezu nepíše jako fakt; u každé
       cesty je vidět, jestli je to tvar, který jsme už někde viděli,
       nebo standard, který se teprve zkouší.

   ŠETRNOST. Mezi dotazy je pauza, na portál platí strop cest, na běh
   strop dotazů, a Crawl-delay z robots.txt se respektuje. Běží to raz
   za týden, nic nepublikuje a do nabídek nezasahuje.
   ================================================================== */
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZAPOJENE, KANDIDATI } from './zdroje-kandidati.mjs';
import {
  CESTY, cestyProPortal, tvarOdpovedi, verdiktCesty, poradiCest, dalsiCesty,
  radekDoRegistru, hlaseniPortalu, pocetZmerenych, STROP_CEST, STROP_DALSICH,
} from './cesty-portalu.mjs';

const KOREN = join(dirname(fileURLToPath(import.meta.url)), '..');
export const CIL = join(KOREN, 'data', 'cesty-portalu.json');
export const NALEZENE = join(KOREN, 'data', 'nalezene-zdroje.json');

export const PAUZA_MS = 400;
export const CAS_LIMIT_MS = 20000;
export const STROP_DOTAZU_NA_PORTAL = 60;
export const STROP_DOTAZU_CELKEM = 900;
export const STROP_PORTALU = 12;
export const STROP_TELA = 400000;    // delší odpověď se nečte celá

const pauza = (ms) => new Promise((r) => setTimeout(r, ms));

/* ------------------------------------------------------------------
   KOHO ZKOUŠET. Tři zdroje cílů, v tomhle pořadí:
     1) adresy z příkazové řádky (když chce člověk jeden portál),
     2) kandidáti z registru, kteří nejsou pokrytí jiným zdrojem,
     3) hostitelé z nálezu hledání (data/nalezene-zdroje.json).
   Zapojené zdroje se NEZKOUŠEJÍ: u nich cestu známe a čtou se čtyřikrát
   denně. Zkoušet je znamená bušit na vlastní zdroje pro nic.
   ------------------------------------------------------------------ */
export function cileZkouseni({ argv = [], kandidati = KANDIDATI, nalezene = [], zapojene = ZAPOJENE } = {}) {
  const ven = [];
  const videno = new Set();
  const pridej = (url, jmeno, odkud) => {
    let host = '';
    try { host = new URL(String(url)).hostname.toLowerCase().replace(/^www\./, ''); } catch { return; }
    if (!host || videno.has(host)) return;
    videno.add(host);
    ven.push({ host, url: String(url), jmeno: jmeno || host, odkud });
  };
  for (const a of argv) if (/^https?:\/\//i.test(a)) pridej(a, a, 'z příkazu');
  if (ven.length) return ven;                 // člověk řekl co; nic dalšího se nepřidává
  const zapojeneHosty = new Set((zapojene || []).map((z) => String(z.host || '').toLowerCase()));
  for (const k of (kandidati || [])) {
    if (k.pokrytoJinym) continue;             // týž majetek podruhé nehledáme
    /* A CO JE ZMĚŘENĚ ZAVŘENÉ, SE NEZKOUŠÍ ZNOVU. Naměřeno 4. 11. na
       Portálu dražeb: osmatřicet cest, všechny bez nabídek, protože
       výpis se vydá jen vlastnímu sezení (HTTP 424, CSRF). Zkoušet to
       každé pondělí znovu je 38 dotazů na cizí web za nic — a šetrnost
       je tu pravidlo, ne přání. Zapsaný DŮVOD je součást toho pravidla:
       bez něj by to byl jen vypínač, který po půl roce nikdo neumí
       zdůvodnit (táž past jako u rovnocenné mutace, §376). */
    if (k.zavreno) continue;
    if (zapojeneHosty.has(String(k.host || '').toLowerCase())) continue;
    pridej(k.url, k.jmeno, 'kandidát z registru');
  }
  for (const n of (nalezene || [])) {
    if (zapojeneHosty.has(String(n.host || '').toLowerCase())) continue;
    pridej(n.adresa || ('https://' + n.host), n.jmeno || n.host, 'nález hledání');
  }
  return ven;
}

/** Sitemapy, které web sám přiznal v robots.txt. */
export function sitemapyZRobots(text) {
  const ven = [];
  for (const m of String(text || '').matchAll(/^\s*sitemap\s*:\s*(\S+)/gim)) {
    if (!ven.includes(m[1])) ven.push(m[1]);
  }
  return ven;
}

/* ------------------------------------------------------------------
   JEDNA CESTA. Nikdy nevyhodí výjimku — selhání je výsledek.
   ------------------------------------------------------------------ */
async function zkusCestu(cesta, pomucky) {
  const { stahni, ua, smimeCist, mezipamet, cti } = pomucky;
  const zapis = { adresa: cesta.adresa, jmeno: cesta.jmeno, skupina: cesta.skupina, zmereno: cesta.zmereno };
  let smime;
  try { smime = await smimeCist(cesta.adresa, { stahni, ua, mezipamet }); }
  catch (e) { smime = { dovoleno: false, duvod: 'robots.txt nešel přečíst: ' + String((e && e.message) || e).slice(0, 60) }; }
  if (!smime.dovoleno) {
    return Object.assign(zapis, verdiktCesty({ dovoleno: false }), { proc: smime.duvod || 'robots.txt nedovoluje' });
  }
  if (smime.delay) await pauza(Math.min(smime.delay, 20) * 1000);
  let stav = 0, typ = '', telo = '';
  try {
    const r = await stahni(cesta.adresa, {
      casLimit: CAS_LIMIT_MS, pokusy: 1,
      headers: { 'user-agent': ua, accept: 'application/ld+json, application/json, text/csv, application/xml, text/html;q=0.8' },
    });
    stav = r.status;
    typ = (r.headers && r.headers.get && r.headers.get('content-type')) || '';
    telo = (await r.text()).slice(0, STROP_TELA);
  } catch (e) {
    return Object.assign(zapis, { verdikt: 'zavřená', proc: 'neodpověděla: ' + String((e && e.message) || e).slice(0, 60) });
  }
  const tvar = tvarOdpovedi(typ, telo);
  /* A TEĎ TO PODSTATNÉ: JDOU Z TOHO PŘEČÍST NABÍDKY? Odpověď „ano, 200"
     nestačí — stránka s nápisem „nenalezeno" ji dá taky. */
  let nabidek = 0;
  let cestaCteni = null;
  if (cti && (tvar === 'HTML' || tvar === 'JSONLD' || tvar === 'JSON')) {
    try {
      const v = cti(telo, cesta.adresa);
      nabidek = (v && v.nabidky && v.nabidky.length) || 0;
      cestaCteni = (v && v.cesta) || null;
    } catch { nabidek = 0; }
  }
  const v = verdiktCesty({ dovoleno: true, stav, typ, telo, nabidek });
  return Object.assign(zapis, v, {
    stav, bajtu: telo.length, nabidek, cestaCteni,
    /* Tělo se do NÁLEZU nezapisuje (byly by z toho megabajty), ale
       volající ho potřebuje na spojení dál. */
    telo,
  });
}

/* ------------------------------------------------------------------
   JEDEN PORTÁL: všechny cesty + spojení dál.
   ------------------------------------------------------------------ */
export async function zkusPortal(cil, pomucky, { strop = STROP_DOTAZU_NA_PORTAL } = {}) {
  const { stahni, ua, smimeCist, mezipamet, zeSitemapy, zRss } = pomucky;
  /* robots.txt se čte stejně jako u každé cesty, ale tady navíc proto,
     aby se z něj vytáhly sitemapy — web sám říká, kde je. */
  let sitemapy = [];
  try {
    const zaklad = new URL(cil.url).origin;
    const r = await stahni(zaklad + '/robots.txt', { casLimit: CAS_LIMIT_MS, pokusy: 1 });
    if (r.ok) sitemapy = sitemapyZRobots(await r.text());
  } catch { sitemapy = []; }
  await pauza(PAUZA_MS);

  const front = cestyProPortal(cil.url, { sitemapy });
  const hotove = [];
  const videno = new Set();
  let dotazu = 0;
  while (front.length && dotazu < strop) {
    const c = front.shift();
    if (videno.has(c.adresa)) continue;
    videno.add(c.adresa);
    const nalez = await zkusCestu(c, pomucky);
    dotazu++;
    await pauza(PAUZA_MS);
    /* Tělo si necháme jen na spojení dál a hned ho zahodíme. */
    const telo = nalez.telo; delete nalez.telo;
    hotove.push(nalez);
    if (nalez.verdikt === 'zavřená') continue;
    /* „Chce klíč" je taky koncová: za tímtéž klíčem leží i všechny
       cesty dál, takže zkoušet je znamená jen opakovat tutéž 401. */
    if (nalez.verdikt === 'chce klíč') continue;
    /* SPOJENÍ DÁL. Jen z cest, které něco vrátily, a jen do stropu —
       sitemapa s deseti tisíci adresami by jinak sežrala celý běh. */
    const dalsi = dalsiCesty({ tvar: nalez.tvar, telo }, { zeSitemapy, zRss, strop: STROP_DALSICH });
    for (const d of dalsi) if (!videno.has(d.adresa)) front.push(d);
  }
  const nedosahnuto = front.length;
  return {
    host: cil.host, jmeno: cil.jmeno, url: cil.url, odkud: cil.odkud,
    dotazu, nedosahnuto, sitemapyZRobots: sitemapy.length,
    cesty: hotove.map((x) => ({ ...x })),
  };
}

/* CESTY, KTERÉ SI ŽÁDAJÍ ČLOVĚKA, NE DALŠÍ BĚH BOTA.
   Otevřená a popsaná cesta, která chce klíč, je jediný druh nálezu, se
   kterým může majitel hned něco udělat — zařídit si účet a klíč. Bot
   s tím nic dalšího nezmůže (účet mu zakládat nebudu, heslo po něm
   chtít nesmím), a tak to musí vystoupit z hlášení nahoru, ne zůstat
   jedním řádkem mezi stovkou cest. */
export function naStulMajiteli(portaly) {
  const ven = [];
  for (const p of (portaly || [])) {
    for (const c of poradiCest(p.cesty)) {
      if (c.verdikt !== 'chce klíč') continue;
      ven.push({ host: p.host, jmeno: p.jmeno, adresa: c.adresa, proc: c.proc });
    }
  }
  return ven;
}

/* Které portály stojí za zapojení — a řádek do registru k nim. */
export function kZapojeni(portaly) {
  const ven = [];
  for (const p of (portaly || [])) {
    const nejlepsi = poradiCest(p.cesty).find((c) => c.verdikt === 'nabídky');
    if (!nejlepsi) continue;
    ven.push({ host: p.host, jmeno: p.jmeno, nabidek: nejlepsi.nabidek,
      adresa: nejlepsi.adresa, radek: radekDoRegistru(nejlepsi, { jmeno: p.jmeno }) });
  }
  return ven.sort((a, b) => b.nabidek - a.nabidek);
}

async function main() {
  const zapsat = process.argv.includes('--zapis');
  const stropPortalu = (() => {
    const a = process.argv.find((x) => x.startsWith('--strop-portalu='));
    const n = a ? parseInt(a.slice(16), 10) : NaN;
    return isFinite(n) && n > 0 ? n : STROP_PORTALU;
  })();
  const { stahni } = await import('./fetch-opportunities.mjs');
  const { smimeCist } = await import('./robots.mjs');
  const { BOT_UA } = await import('./bot-ua.mjs');
  const { prectiJakkoli, zeSitemapy, zRss } = await import('./cteni-zdroje.mjs');
  const pomucky = {
    stahni, ua: BOT_UA, smimeCist, mezipamet: new Map(),
    cti: prectiJakkoli, zeSitemapy, zRss,
  };
  let nalezene = [];
  try { nalezene = (JSON.parse(readFileSync(NALEZENE, 'utf8')).nalezeno || []); } catch { nalezene = []; }
  const cile = cileZkouseni({ argv: process.argv.slice(2), nalezene }).slice(0, stropPortalu);
  const z = pocetZmerenych();
  console.log(`Zkoušení portálů: ${cile.length} portálů, ${CESTY.length} tvarů adres`
    + ` (${z.zmereno} už někde změřených, ${z.zkousi} standardů, které se teprve zkoušejí).`);
  if (!cile.length) { console.log('Není koho zkoušet.'); return; }

  const portaly = [];
  let dotazuCelkem = 0;
  for (const c of cile) {
    if (dotazuCelkem >= STROP_DOTAZU_CELKEM) {
      console.log(`Rozpočet běhu ${STROP_DOTAZU_CELKEM} dotazů vyčerpán — ${cile.length - portaly.length} portálů zůstalo na příště.`);
      break;
    }
    let p;
    try { p = await zkusPortal(c, pomucky, { strop: Math.min(STROP_DOTAZU_NA_PORTAL, STROP_DOTAZU_CELKEM - dotazuCelkem) }); }
    catch (e) {
      console.error(`POZOR: ${c.host} spadl: ${String((e && e.message) || e).slice(0, 120)}`);
      continue;
    }
    dotazuCelkem += p.dotazu;
    portaly.push(p);
    for (const r of hlaseniPortalu(p)) console.log(r);
  }

  const navrhy = kZapojeni(portaly);
  const naStul = naStulMajiteli(portaly);
  console.log(`\nDotazů celkem: ${dotazuCelkem}. Portálů se čitelnými nabídkami: ${navrhy.length}.`);
  if (naStul.length) {
    console.log(`\nOTEVŘENO, ALE CHCE KLÍČ — ${naStul.length} ${naStul.length === 1 ? 'cesta' : 'cesty'}`
      + ' k rozhodnutí majiteli (bot dál nemůže, účet a klíč jsou na něm):');
    for (const n of naStul) console.log(`  ${n.jmeno} — ${n.adresa}\n      ${n.proc}`);
  }
  if (navrhy.length) {
    console.log('\nŘÁDKY DO REGISTRU (OBECNE_ZDROJE v scripts/zdroje-kandidati.mjs).');
    console.log('Bot je NEZAPOJUJE: podmínky užití toho webu ještě nikdo nečetl.');
    for (const n of navrhy) { console.log(''); console.log(n.radek); }
  } else {
    console.log('Ani jedna cesta nevrátila nabídky. Není to porucha bota — je to odpověď:');
    console.log('tyhle portály dnes nabídky strojově čitelně nevystavují.');
  }

  if (!zapsat) {
    console.log('\n(Nic se nezapsalo. S --zapis se nález uloží do data/cesty-portalu.json.)');
    return;
  }
  const dnes = new Date().toISOString().slice(0, 10);
  let stary = { dny: {} };
  try { stary = JSON.parse(readFileSync(CIL, 'utf8')); } catch { /* první běh */ }
  writeFileSync(CIL, JSON.stringify({
    updated: dnes,
    tvaru: CESTY.length,
    zmerenychTvaru: z.zmereno,
    dotazu: dotazuCelkem,
    portaly,
    navrhy: navrhy.map(({ radek, ...zbytek }) => zbytek),
    dny: Object.assign({}, stary.dny || {}, { [dnes]: navrhy.length }),
  }, null, 1));
  console.log(`\nZapsáno do ${CIL}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error('Zkoušení portálů spadlo:', e && e.message ? e.message : e); process.exit(1); });
}
