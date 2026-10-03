/* Test: porovnání uložených pozemků ukazuje to, co je uložené — a nic navíc.
 *
 * Spuštění: PW_CHROMIUM=… node scripts/test-porovnani.mjs
 *
 * PROČ VZNIKLO. Uložit pozemek šlo odjakživa a filtr „Uložené" je uměl
 * ukázat jako seznam karet pod sebou. Jenže ve chvíli rozhodování mezi
 * třemi pozemky potřebuje člověk vidět čísla v jednom sloupci: kde je
 * levnější metr, kde větší výměra, co je dřív v dražbě.
 *
 * KLÍČ JE TA KŘEHKÁ ČÁST. Uložené pozemky jsou v prohlížeči jen jako
 * klíče; stránka je musí spárovat s daty TÝMŽ výpočtem, jakým je uložila
 * mapa. Dokud byl ten výpočet opsaný na třech místech, stačilo jedno
 * změnit a uložené pozemky by se „ztratily". Proto je v js/klic.js
 * jednou a tahle zkouška sahá na výsledek, ne na kód.
 *
 * Zkouška si klíče NESKLÁDÁ voláním téže funkce, kterou zkouší — bere
 * záznamy z dat, uloží je pod klíčem složeným zvlášť a pak kontroluje,
 * že se na stránce objevily právě ty obce.
 */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'http://127.0.0.1:8310';
const PRAZDNA = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=', 'base64');

let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* Klíč složený tady, ne zavoláním js/klic.js — jinak by zkouška
   porovnávala funkci sama se sebou. Tvar musí odpovídat tomu, co
   stránka počítá; kdyby se rozešly, nenajde se nic a zkouška spadne
   na „tabulka má tři řádky", což je přesně ten případ, který má chytit. */
const klic = (d) => [d.place || '', d.parcel || '', d.okres || '',
  typeof d.lat === 'number' ? d.lat.toFixed(3) : '',
  typeof d.lng === 'number' ? d.lng.toFixed(3) : ''].join('|');

/* POŘADÍ SKRIPTŮ. Vytáhnout výpočet na jedno místo nestačí — musí tam
   být DŘÍV, než ho někdo zavolá. Napoprvé jsem js/klic.js přidal s `defer`,
   jenže js/pozemek.js se načítá bez něj: odložený skript běží až po
   zpracování stránky, takže pozemek.js sáhl na window.PKKlic dřív, než
   existoval, a všech 1 995 stránek pozemků spadlo na
   „Cannot read properties of undefined (reading 'pkey')".
   Obyčejný skript (bez defer) běží před odloženými i před klasickými,
   takže tahle kontrola hlídá obojí: že klíč na stránce je a že není
   odložený, zatímco jeho uživatel ne. */
{
  const stranky = fs.readdirSync(ROOT).filter((f) => f.endsWith('.html'));
  const znacka = /<script\s+src="js\/([a-z0-9_-]+)\.js[^"]*"([^>]*)>/g;
  const spatne = [];
  let uzivatelu = 0;
  for (const f of stranky) {
    const h = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const skripty = [...h.matchAll(znacka)].map((m) => ({ jm: m[1], odlozeny: /\bdefer\b|\basync\b/.test(m[2]) }));
    const uziva = skripty.filter((x) => x.jm === 'main' || x.jm === 'pozemek' || x.jm === 'porovnani');
    if (!uziva.length) continue;
    uzivatelu++;
    const iKlic = skripty.findIndex((x) => x.jm === 'klic');
    if (iKlic === -1) { spatne.push(`${f}: používá klíč, ale js/klic.js vůbec nenačítá`); continue; }
    if (skripty[iKlic].odlozeny) { spatne.push(`${f}: js/klic.js je odložený (defer), takže běží až po svých uživatelích`); continue; }
    const prvniUzivatel = skripty.findIndex((x) => x.jm === 'main' || x.jm === 'pozemek' || x.jm === 'porovnani');
    if (iKlic > prvniUzivatel) spatne.push(`${f}: js/klic.js stojí až za js/${skripty[prvniUzivatel].jm}.js`);
  }
  pravda('našly se stránky, které klíč používají (jinak by další tvrzení platilo o prázdnu)',
    uzivatelu > 100, `${uzivatelu} stránek`);
  pravda(`na všech ${uzivatelu} stránkách se js/klic.js načítá dřív než ten, kdo ho volá`,
    spatne.length === 0, spatne.slice(0, 5).join('\n      ') + (spatne.length > 5 ? `\n      …a dalších ${spatne.length - 5}` : ''));
}

const D = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'opportunities.json'), 'utf8')).opportunities || [];
pravda('data se načetla', D.length > 100, `${D.length} nabídek`);
/* Vybírají se nabídky s cenou i výměrou, aby mělo smysl porovnávat
   cenu za metr; jinak by sloupec byl samá pomlčka. */
/* Cena za metr se počítá přes js/ceny.js, protože u spoluvlastnického
   podílu je v inzerátu výměra celé parcely a cena jen za ten zlomek.
   Tahle kontrola si ji nesmí dělit sama — porovnávala by vytištěná čísla
   s jinak spočítanými. */
new Function(fs.readFileSync(path.join(ROOT, 'js', 'ceny.js'), 'utf8'))();
const CENY = globalThis.PK_CENY;
pravda('cenový model se načetl', !!(CENY && CENY.zaMetr));
const zaMetrM = (d) => {
  const v = CENY && CENY.zaMetr ? CENY.zaMetr(d) : null;
  return (v == null || !isFinite(v)) ? null : v;
};
/* VZOREK JE SCHVÁLNĚ PAST. Tabulka nejnižší cenu za metr ZELENĚ
   doporučuje, takže se do srovnání vybere podíl, u kterého surové
   dělení celou výměrou dává nejnižší číslo ze všech tří, ale po
   přepočtu na podíl je naopak nejdražší. Kdo by počítal surově,
   doporučí zeleně ten nejdražší pozemek — a zkouška to pozná.
   Když se taková trojice v datech nenajde (podíly se zlomkem zmizí),
   vezmou se první tři nabídky jako dřív a řekne se to. */
function najdiPast() {
  const sZlomkem = D.filter((d) => d.price > 0 && d.area > 0 && d.podil && zaMetrM(d) != null
    && zaMetrM(d) > (d.price / d.area) * 3);
  const bezneVse = D.filter((d) => d.price > 0 && d.area > 0 && !d.podil && zaMetrM(d) != null);
  for (const pod of sZlomkem) {
    const surovyPod = pod.price / pod.area, prepocitanyPod = zaMetrM(pod);
    const kandidati = bezneVse.filter((d) => (d.price / d.area) > surovyPod
      && zaMetrM(d) < prepocitanyPod);
    if (kandidati.length >= 2) return [pod, kandidati[0], kandidati[1]];
  }
  return null;
}
const past = najdiPast();
const vzorky = past || D.filter((d) => d.price && d.area).slice(0, 3);
pravda('našly se tři nabídky s cenou i výměrou', vzorky.length === 3, `nalezeno ${vzorky.length}`);
pravda('a je mezi nimi podíl, u kterého by surový výpočet doporučil nejdražší pozemek',
  !!past, 'v datech se taková trojice nenašla — kontrola zeleného zvýraznění je slabší');

const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));
const ctx = await prohlizec.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.route('**/*', (r) => {
  const u = new URL(r.request().url());
  if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') return r.continue();
  if (r.request().resourceType() === 'image') return r.fulfill({ status: 200, contentType: 'image/png', body: PRAZDNA });
  return r.abort();
});
const p = await ctx.newPage();
const chyby = [];
p.on('pageerror', (e) => chyby.push(String(e).slice(0, 140)));

/* 1) bez uložených pozemků stránka neukazuje prázdnou tabulku */
await p.goto(`${BASE}/porovnani.html`, { waitUntil: 'domcontentloaded' });
await p.evaluate(() => localStorage.removeItem('pk_fav_v1'));
await p.reload({ waitUntil: 'domcontentloaded' });
await p.waitForTimeout(1500);
const prazdna = await p.evaluate(() => ({
  tabulka: !!document.querySelector('.por-tab'),
  text: (document.getElementById('porovnani') || {}).textContent.trim().slice(0, 80),
}));
pravda('bez uložených se neukáže prázdná tabulka, ale vysvětlení',
  !prazdna.tabulka && /uložen/i.test(prazdna.text), JSON.stringify(prazdna));

/* 2) se třemi uloženými se objeví právě ty tři */
await p.evaluate((k) => localStorage.setItem('pk_fav_v1', JSON.stringify(k)), vzorky.map(klic));
await p.reload({ waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2500);
const t = await p.evaluate(() => {
  const tab = document.querySelector('.por-tab');
  if (!tab) return null;
  return {
    radku: tab.querySelectorAll('tbody tr').length,
    obce: [...tab.querySelectorAll('tbody th a')].map((a) => a.textContent.trim()),
    nej: [...tab.querySelectorAll('.por-nej')].map((e) => e.textContent.replace(/\s/g, ' ').trim()),
    odkazy: [...tab.querySelectorAll('tbody th a')].map((a) => a.getAttribute('href')),
  };
});
pravda('tabulka se vykreslila', !!t, 'tabulka nenalezena');
if (t) {
  pravda('má tolik řádků, kolik je uložených pozemků', t.radku === 3, `řádků ${t.radku}`);
  pravda('a jsou to ty uložené obce (klíč sedí s tím, jak je ukládá mapa)',
    vzorky.every((d) => t.obce.indexOf(d.place) !== -1), `v tabulce ${JSON.stringify(t.obce)}`);
  pravda('každý řádek vede na stránku toho pozemku',
    t.odkazy.length === 3 && t.odkazy.every((h) => /^pozemek\.html\?p=/.test(h)), JSON.stringify(t.odkazy));

  /* Zvýrazněná hodnota musí být opravdu ta nejlepší — spočítáno zvlášť. */
  const m2 = vzorky.map(zaMetrM);
  const nejM2 = Math.min.apply(null, m2);
  /* A kdyby se počítalo surově, vyšlo by něco jiného — jinak ta past
     nic nechytá. */
  const nejSurovy = Math.min.apply(null, vzorky.map((d) => d.price / d.area));
  pravda('surový a přepočtený výpočet by zeleně označily jiný řádek',
    !past || Math.round(nejSurovy) !== Math.round(nejM2),
    `surově ${Math.round(nejSurovy)}, přepočteno ${Math.round(nejM2)}`);
  const nejPl = Math.max.apply(null, vzorky.map((d) => d.area));
  const cis = (x) => Number(String(x).replace(/[^\d]/g, ''));
  pravda('zeleně je opravdu nejnižší cena za m² a největší výměra',
    t.nej.length === 2
      && t.nej.some((x) => cis(x) === Math.round(nejM2))
      && t.nej.some((x) => cis(x) === nejPl),
    `v tabulce ${JSON.stringify(t.nej)}, spočítáno ${Math.round(nejM2)} Kč a ${nejPl} m²`);
}

/* 3) klíč, který v datech není, nesmí stránku shodit */
await p.evaluate(() => localStorage.setItem('pk_fav_v1', JSON.stringify(['tenhle|klic|neexistuje||'])));
await p.reload({ waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2000);
const zmizely = await p.evaluate(() => (document.getElementById('porovnani') || {}).textContent.trim().slice(0, 80));
pravda('uložený pozemek, který už v nabídce není, stránku neshodí',
  /uložen/i.test(zmizely) && chyby.length === 0, `${zmizely} | ${chyby.join(' ')}`);
pravda('a při ničem z toho stránka nespadla', chyby.length === 0, chyby.join(' | '));

await prohlizec.close();
console.log('\nPorovnání uložených pozemků');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Porovnání: ' + chyb + ' kontrol neprošlo.'); process.exit(1); }
process.exit(0);
