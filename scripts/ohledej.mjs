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
  const odp = await stahni(url, { pokusy: 1 });
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
  } finally { await p.zavri(); }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => { console.error('Ohledání spadlo:', e && e.message ? e.message : e); process.exit(1); });
}
