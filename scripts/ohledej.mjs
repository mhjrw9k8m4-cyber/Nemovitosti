#!/usr/bin/env node
/* OHLEDÁNÍ KANDIDÁTA — podívat se, CO na té adrese je
   ==================================================================
   Spuštění:  node scripts/ohledej.mjs <adresa>
   V Actions: workflow „Ohledání zdroje" (workflow_dispatch).

   PROČ. Sonda zdrojů řekne ANO/NE — robots dovoluje, odpověď přišla,
   slovo „pozemek" tam je 20×. To stačí na rozhodnutí „má smysl se tím
   zabývat", ale ne na napsání čtečky: k tomu je potřeba vidět TVAR —
   jaké má CSV sloupce, jestli je to JSON, kolik tam je řádků.
   Naměřeno 3. 11.: portal.gov.cz vede centrální evidenci nepotřebného
   majetku státu a nabízí export do CSV. Jestli se z něj dají číst
   pozemky, nejde zjistit jinak než se na ten soubor podívat — a ze
   sandboxu ven nevidíme, takže to musí proběhnout v Actions.

   ROBOTS.TXT SE ČTE PRVNÍ A VÝJIMKA NENÍ ŽÁDNÁ. Když cesta zakázaná
   je, nestahuje se nic a vypíše se proč. Tohle není nástroj na
   obcházení, je to nástroj na dívání.

   NIC NEZAPISUJE. Jen vypíše na výstup. Co s tím, rozhodne člověk.  */
import { BOT_UA } from './bot-ua.mjs';
import { smimeCist } from './robots.mjs';
const { stahni } = await import('./fetch-opportunities.mjs');

const STROP_ZNAKU = 4000;     // kolik textu vypsat, ať log nenabobtná
const STROP_RADKU = 25;       // kolik řádků u řádkových formátů
const PROHLIZECEM = process.argv.includes('--prohlizecem')
  || /^(1|ano|true)$/i.test(process.env.PROHLIZECEM || '');
/* TĚLO DOTAZU. Nalezeno měřením 4. 11. u ÚZSVM: adresa, ze které si
   aplikace bere nabídky, odpoví na GET rovnou HTTP 405 — je to POST
   s filtrem v těle. Bez možnosti to tělo poslat je nalezená adresa
   k ničemu, protože tvar odpovědi se nedá vidět. */
const TELO = (process.argv.find((a) => a.startsWith('--telo=')) || '').slice(7)
  || process.env.TELO || '';

export function tvarCsv(text, stropRadku = STROP_RADKU) {
  const radky = String(text || '').split(/\r?\n/).filter((r) => r.trim());
  if (!radky.length) return { radku: 0, sloupcu: 0, hlavicka: [], ukazka: [] };
  /* Oddělovač se HÁDAT NEBUDE: spočítá se, kterého je v hlavičce víc.
     Český export bývá středníkem, mezinárodní čárkou, a kdo to splete,
     dostane jeden sloupec a myslí si, že je soubor rozbitý. */
  const h = radky[0];
  const kandidati = [[';', (h.match(/;/g) || []).length], [',', (h.match(/,/g) || []).length],
    ['\t', (h.match(/\t/g) || []).length], ['|', (h.match(/\|/g) || []).length]];
  kandidati.sort((a, b) => b[1] - a[1]);
  const odd = kandidati[0][1] > 0 ? kandidati[0][0] : ';';
  const hlavicka = h.split(odd).map((x) => x.replace(/^"|"$/g, '').trim());
  return {
    radku: radky.length - 1, sloupcu: hlavicka.length, oddelovac: odd === '\t' ? 'tabulátor' : odd,
    hlavicka, ukazka: radky.slice(1, 1 + stropRadku),
  };
}

/* TVAR JSONU: co autor čtečky potřebuje vidět. Vypsat 4 000 znaků
   odpovědi nestačí — u seznamu s pětadvaceti záznamy se do nich vejde
   první a půl. Podstatné je, KDE je ten seznam, kolik je v něm prvků,
   kolik jich je celkem a jaká pole má jeden záznam. */
export function tvarJson(data, strop = 40) {
  const radky = [];
  const popis = (v) => Array.isArray(v) ? `pole(${v.length})`
    : (v === null ? 'null' : typeof v === 'object' ? `objekt(${Object.keys(v).length})` : typeof v);
  if (Array.isArray(data)) {
    radky.push(`na nejvyšší úrovni POLE o ${data.length} prvcích`);
    if (data.length) {
      radky.push('POLE PRVNÍHO PRVKU:');
      for (const k of Object.keys(data[0]).slice(0, strop)) radky.push(`  ${k}: ${popis(data[0][k])}`);
    }
    return radky;
  }
  if (!data || typeof data !== 'object') return [`na nejvyšší úrovni ${popis(data)}`];
  radky.push('POLE NA NEJVYŠŠÍ ÚROVNI:');
  for (const k of Object.keys(data).slice(0, strop)) radky.push(`  ${k}: ${popis(data[k])}`);
  /* Seznam záznamů bývá nejdelší pole v odpovědi. */
  let nej = null;
  for (const k of Object.keys(data)) {
    const v = data[k];
    if (Array.isArray(v) && (!nej || v.length > data[nej].length)) nej = k;
  }
  if (nej && data[nej].length) {
    radky.push(`NEJDELŠÍ SEZNAM je „${nej}" (${data[nej].length} prvků), jeden záznam má:`);
    const prvni = data[nej][0];
    if (prvni && typeof prvni === 'object') {
      for (const k of Object.keys(prvni).slice(0, strop)) radky.push(`  ${k}: ${popis(prvni[k])} = ${JSON.stringify(prvni[k]).slice(0, 120)}`);
    } else radky.push(`  ${JSON.stringify(prvni).slice(0, 200)}`);
  }
  return radky;
}

/* KRÁTKÉ SEZNAMY SE VYPÍŠOU CELÉ. Nalezeno naostro 4. 11. u ÚZSVM:
   v odpovědi je vedle 25 nabídek i `Categories` o čtyřech prvcích —
   a právě v nich je číslo kategorie „Pozemky", bez kterého se zdroj
   nedá filtrovat. Nejdelší seznam (nabídky) tedy není ten, který
   rozhoduje. */
export function malySeznam(v, strop = 20) {
  return Array.isArray(v) && v.length > 0 && v.length <= strop
    && v.every((x) => x && typeof x === 'object' && !Array.isArray(x));
}

export function vypisSeznam(nazev, pole, uroven = 0) {
  const radky = [];
  const mezera = '  '.repeat(uroven + 1);
  radky.push(`${'  '.repeat(uroven)}SEZNAM „${nazev}" (${pole.length}):`);
  for (const x of pole) {
    const kousky = [];
    for (const k of Object.keys(x)) {
      const val = x[k];
      if (val === null || typeof val === 'object') continue;
      if (typeof val === 'string' && val.length > 60) continue;
      kousky.push(`${k}=${JSON.stringify(val)}`);
    }
    radky.push(mezera + kousky.join(' '));
    /* Podseznamy (u ÚZSVM `Subcategories`) nesou právě ta čísla,
       o která jde. */
    for (const k of Object.keys(x)) {
      if (malySeznam(x[k]) && uroven < 2) radky.push(...vypisSeznam(k, x[k], uroven + 2));
    }
  }
  return radky;
}

/* Dlouhé řetězce se do výpisu nedávají celé: jeden náhledový obrázek
   v base64 (ÚZSVM je posílá přímo v odpovědi) zabral v logu víc místa
   než celý zbytek. */
export function zkratDlouhe(data, strop = 160) {
  if (typeof data === 'string') {
    return data.length > strop ? data.slice(0, strop) + `…(celkem ${data.length} znaků)` : data;
  }
  if (Array.isArray(data)) return data.map((x) => zkratDlouhe(x, strop));
  if (data && typeof data === 'object') {
    const ven = {};
    for (const k of Object.keys(data)) ven[k] = zkratDlouhe(data[k], strop);
    return ven;
  }
  return data;
}

export function cojeto(text, typ) {
  const t = String(text || '').trimStart();
  if (/^application\/json|^text\/json/.test(typ || '')) return 'JSON';
  if (t.startsWith('{') || t.startsWith('[')) return 'JSON';
  if (/^<\?xml|^<rss|^<feed/i.test(t)) return 'XML';
  if (/^</.test(t)) return 'HTML';
  if (/[;,\t|]/.test(t.split(/\r?\n/)[0] || '')) return 'CSV';
  return 'text';
}

/* OHLEDÁNÍ PROHLÍŽEČEM. Pro aplikace, které si obsah dotahují samy:
   ve vykresleném HTML nabídky nejsou, takže ze stránky se čtečka
   napsat nedá. Dá se ale POSLECHNOUT, odkud si ta aplikace data bere.
   Naměřeno 3. 11. u ÚZSVM: domovská stránka je skořápka a šest
   požadavků šlo na sousední doménu — jenže která adresa nese data,
   z toho poznat nejde. Tohle to řekne. */
export function vypisDatove(datove) {
  const radky = [];
  const d = datove || [];
  if (!d.length) {
    radky.push('ŽÁDNÁ DATOVÁ ODPOVĚĎ. Stránka si nic ve tvaru JSON/CSV/XML'
      + ' nestahovala — obsah tedy buď přišel přímo v HTML, nebo z adresy,'
      + ' kterou robots.txt nedovoluje (viz počty výš).');
    return radky;
  }
  radky.push(`DATOVÉ ODPOVĚDI (${d.length}) — tudy si stránka bere obsah:`);
  for (const o of d) {
    radky.push(`  ${o.stav}  ${o.zpusob || 'GET'}  ${o.typ}  ${o.url}`);
    /* Tělo dotazu je u POST stejně důležité jako adresa: bez něj by
       čtečka neměla co poslat (naměřeno u ÚZSVM, kde GET vrací 405). */
    if (o.telo) radky.push(`      tělo dotazu: ${o.telo}`);
  }
  return radky;
}

async function main() {
  const url = process.argv[2] || process.env.ADRESA;
  if (!url) { console.error('Chybí adresa. Použití: node scripts/ohledej.mjs <adresa>'); process.exit(1); }
  console.log('Ohledávám: ' + url);
  const mezipamet = new Map();
  let smime;
  try { smime = await smimeCist(url, { stahni, ua: BOT_UA, mezipamet }); }
  catch (e) { console.error('robots.txt se nepodařilo přečíst: ' + (e && e.message)); process.exit(1); }
  console.log('robots.txt: ' + (smime.dovoleno ? 'DOVOLUJE' : 'NEDOVOLUJE') + ' — ' + (smime.duvod || ''));
  if (!smime.dovoleno) {
    console.log('Nestahuje se nic. Tohle rozhodnutí patří tomu webu, ne nám.');
    return;
  }
  const odp = TELO
    ? await stahni(url, { pokusy: 1, method: 'POST', body: TELO,
      headers: { 'content-type': 'application/json', accept: 'application/json' } })
    : await stahni(url, { pokusy: 1 });
  if (TELO) console.log('posláno POST, tělo: ' + TELO.slice(0, 400));
  const typ = (odp.headers && odp.headers.get && odp.headers.get('content-type')) || '';
  const text = await odp.text();
  const co = cojeto(text, typ);
  console.log('odpověď ' + odp.status + ', content-type „' + typ + '", ' + text.length + ' znaků → vypadá na ' + co);
  console.log('');
  if (co === 'CSV') {
    const t = tvarCsv(text);
    console.log('ŘÁDKŮ (bez hlavičky): ' + t.radku + ' | SLOUPCŮ: ' + t.sloupcu + ' | oddělovač: ' + t.oddelovac);
    console.log('HLAVIČKA:');
    t.hlavicka.forEach((s, i) => console.log('  [' + i + '] ' + s));
    console.log('\nPRVNÍCH ' + t.ukazka.length + ' ŘÁDKŮ:');
    t.ukazka.forEach((r) => console.log('  ' + r.slice(0, 400)));
  } else if (co === 'JSON') {
    let data = null;
    try { data = JSON.parse(text); } catch (e) { console.log('JSON se nepodařilo přečíst: ' + e.message); }
    if (data !== null) {
      for (const r of tvarJson(data)) console.log(r);
      /* A krátké seznamy celé: tam bývají čísla, podle kterých se dá
         zdroj filtrovat. */
      if (data && !Array.isArray(data) && typeof data === 'object') {
        for (const k of Object.keys(data)) {
          if (malySeznam(data[k])) { console.log(''); for (const r of vypisSeznam(k, data[k])) console.log(r); }
        }
      }
      console.log('\nODPOVĚĎ (dlouhé řetězce zkrácené):');
      console.log(JSON.stringify(zkratDlouhe(data), null, 1).slice(0, STROP_ZNAKU * 2));
    } else {
      console.log('\nZAČÁTEK OBSAHU:');
      console.log(text.slice(0, STROP_ZNAKU));
    }
  } else {
    console.log('ZAČÁTEK OBSAHU:');
    console.log(text.slice(0, STROP_ZNAKU));
  }

  /* A na přání ještě prohlížečem. Zvlášť, ne vždycky: spustit prohlížeč
     je o dvě třídy dražší než stáhnout soubor, a u CSV by to nic
     nepřidalo. */
  if (!PROHLIZECEM) {
    console.log('\n(Pro aplikaci, která si obsah dotahuje sama, přidejte'
      + ' --prohlizecem — vypíše se, odkud si bere data.)');
    return;
  }
  console.log('\nOHLEDÁNÍ PROHLÍŽEČEM');
  let chromium;
  try { ({ chromium } = await import('playwright')); }
  catch { console.log('Prohlížeč není k dispozici (playwright se nenačetl).'); return; }
  const { tvorProhlizec } = await import('./cti-prohlizecem.mjs');
  const p = await tvorProhlizec({
    chromium, ua: BOT_UA,
    /* ROBOTS SE DRŽÍ I TADY, u každého jednoho požadavku. */
    smiCist: async (u) => (await smimeCist(u, { stahni, ua: BOT_UA, mezipamet })).dovoleno,
  });
  try {
    const v = await p.vykresli(url);
    console.log(`vykreslený text: ${(v.text || '').length} znaků`
      + `, cizích požadavků ${v.cizich}, zakázaných ${v.zablokovano}`);
    if (v.cizinci && v.cizinci.length) {
      console.log('CIZÍ HOSTITELÉ: ' + v.cizinci.map((c) => c.co + ' ×' + c.kolik).join(', '));
    }
    for (const r of vypisDatove(v.datove)) console.log(r);
    if (v.tvaryOdkazu && v.tvaryOdkazu.length) {
      console.log('TVARY ADRES NA TOMTO WEBU (čísla zaměněna za <číslo>):');
      for (const t of v.tvaryOdkazu) console.log(`  ${t.kolik}×  ${t.vzor}`);
    }
  } finally { await p.zavri(); }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error('Ohledání spadlo:', e && e.message ? e.message : e); process.exit(1); });
}
