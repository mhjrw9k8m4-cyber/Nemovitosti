// Test: souřadnice pozemku se dají vzít s sebou.
//
// Spuštění: node scripts/test-souradnice.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome)
//
// Na prohlídku se jezdí autem a do navigace se zadává bod. Stránka
// souřadnice odjakživa ZNALA — stavěla z nich mapu i odkazy do katastru —
// ale člověku je neřekla, takže si je musel opisovat z adresního řádku.
//
// Hlídá se trojí, protože v každém z toho se dá udělat tichá chyba:
//  1. Podoba čísla. Desetinná TEČKA a čárka mezi souřadnicemi — to berou
//     Mapy.cz, Google i Seznam. S desetinnou čárkou by se vložení
//     rozpadlo na čtyři čísla a navigace by skončila jinde.
//  2. Odkaz podle zařízení. „geo:" otevře navigaci na Androidu, ale
//     iPhone ho neumí a odkaz by neudělal NIC — a mlčící tlačítko je
//     horší než odkaz vedoucí do mapy v prohlížeči.
//  3. Že se dá vůbec kliknout: obě tlačítka 44 px, mačkají se venku
//     u pozemku, ne u stolu.
import { chromium } from 'playwright-core';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pricinaChyb } from './chyby-hlaska.mjs';

await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'http://127.0.0.1:8310';
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
function hotovo() {
  console.log('\nSouřadnice na stránce pozemku');
  console.log(zpravy.join('\n'));
  console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
  if (chyb) { console.log('::error::Souřadnice: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
  process.exit(0);
}

const stranka = readdirSync(KOREN).filter((f) => /^pozemek-.+\.html$/.test(f)).sort()[0];
// PŘEDPOKLAD: bez stránky pozemku se nedá měřit nic
pravda('je na čem měřit — stránka pozemku', !!stranka, 'žádná pozemek-*.html');
if (!stranka) hotovo();

const prohlizec = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });

/* ---- 1) řádek se souřadnicemi je vidět a dá se zkopírovat ---- */
{
  const ctx = await prohlizec.newContext({ viewport: { width: 1100, height: 900 },
    permissions: ['clipboard-read', 'clipboard-write'] });
  const p = await ctx.newPage();
  const chybyJs = [];
  p.on('pageerror', (e) => chybyJs.push(String(e)));
  await p.goto(`${BASE}/${stranka}`, { waitUntil: 'load' });
  await p.waitForTimeout(2000);

  const v = await p.evaluate(() => {
    const w = document.querySelector('.pz-sour');
    if (!w) return { je: false };
    const k = document.querySelector('#pz-sour-kop'), n = document.querySelector('#pz-sour-nav');
    return { je: true, text: document.querySelector('#pz-sour-text').textContent.trim(),
      kop: Math.round(k.getBoundingClientRect().height),
      nav: Math.round(n.getBoundingClientRect().height),
      // popisek řádku je .pz-spec .k (ne dt/th — tabulka faktů je z divů)
      popisek: [...document.querySelectorAll('.pz-spec .k')].map((e) => e.textContent.trim())
        .filter((t) => /Souřad/i.test(t)).length };
  });
  pravda('stránka pozemku ukazuje souřadnice', v.je, 'blok .pz-sour na stránce není');
  if (!v.je) { await prohlizec.close(); hotovo(); }
  pravda('a je u nich popisek, aby bylo poznat, co to je', v.popisek > 0);

  /* Podoba: „49.71048, 15.01467". Desetinná TEČKA, čárka mezi, pět míst. */
  pravda('číslo je v podobě, kterou berou navigace (tečka, čárka, 5 míst)',
    /^-?\d{1,3}\.\d{5}, -?\d{1,3}\.\d{5}$/.test(v.text), `v řádku stojí „${v.text}"`);
  pravda('a nemá v sobě zbytek po dvojkové aritmetice',
    !/\d{8,}/.test(v.text), v.text);
  pravda('tlačítko „Kopírovat" se dá trefit prstem (44 px)', v.kop >= 44, `${v.kop} px`);
  pravda('a „Navigovat" taky', v.nav >= 44, `${v.nav} px`);

  await p.click('#pz-sour-kop');
  await p.waitForTimeout(600);
  const schranka = await p.evaluate(() => navigator.clipboard.readText());
  pravda('klepnutí opravdu zkopíruje do schránky', schranka === v.text,
    `ve schránce „${schranka}", na stránce „${v.text}"`);
  const hlaska = await p.evaluate(() => {
    const t = document.querySelector('#toast, .toast');
    return t && !t.hidden ? t.textContent.trim() : null;
  });
  pravda('a člověk se dozví, že se to povedlo', !!hlaska && /zkopír|označ/i.test(hlaska),
    'po klepnutí se neukázala žádná hláška');
  pravda('nic se u toho nerozbilo', chybyJs.length === 0, chybyJs.join(' | '));
  await ctx.close();
}

/* ---- 2) odkaz do navigace podle zařízení ---- */
{
  const zarizeni = [
    ['Android', 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36',
      /^geo:-?\d+\.\d+,-?\d+\.\d+\?q=/],
    ['iPhone', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
      /^https:\/\/maps\.apple\.com\/\?ll=-?\d+\.\d+,-?\d+\.\d+/],
    ['počítač', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
      /^https:\/\/mapy\.cz\//],
  ];
  for (const [jm, ua, tvar] of zarizeni) {
    const ctx = await prohlizec.newContext({ viewport: { width: 390, height: 844 }, userAgent: ua });
    const p = await ctx.newPage();
    await p.goto(`${BASE}/${stranka}`, { waitUntil: 'load' });
    await p.waitForTimeout(1800);
    const v = await p.evaluate(() => {
      const n = document.querySelector('#pz-sour-nav');
      const w = document.querySelector('.pz-sour');
      return { href: n ? n.getAttribute('href') : null,
        prazdny: !n || n.getAttribute('href') === '#' || !n.getAttribute('href'),
        pretejka: w ? w.getBoundingClientRect().right > document.documentElement.clientWidth + 1 : null };
    });
    pravda(`${jm}: odkaz vede tam, kam na tom zařízení vést má`, tvar.test(v.href || ''),
      `href=„${v.href}"`);
    pravda(`${jm}: a nezůstal prázdný (mlčící tlačítko je horší než žádné)`, !v.prazdny, String(v.href));
    pravda(`${jm}: a řádek nepřetéká ze stránky`, v.pretejka === false);
    await ctx.close();
  }
}

await prohlizec.close();
hotovo();
