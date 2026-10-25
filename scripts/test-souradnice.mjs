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
import { hlasPad } from './zkouska-pad.mjs';

const { BASE } = await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, chyb = 0;
const zpravy = [];
/* A KDYŽ TO SPADNE, AŤ TO TAKY NĚCO ŘEKNE — viz scripts/zkouska-pad.mjs.
   Bez tohohle se při výjimce (chybějící prvek, timeout klepnutí) zahodí
   všechny kontroly, které do té chvíle prošly, a v CI zbyde jen stopa. */
hlasPad('Souřadnice', zpravy);
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
  const ctx = await prohlizec.newContext({ bypassCSP: true,  viewport: { width: 1100, height: 900 },
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
      /* Popisek stojí v samotném bloku (.pz-sour-k). Dřív se hledal
         v tabulce parametrů (.pz-spec .k) — tam souřadnice bývaly, než
         se přestěhovaly pod mapu, kam otázka „jak se tam dostanu" patří
         (měřeno: v tabulce stály 2 100 px nad mapou). */
      popisek: [...document.querySelectorAll('.pz-sour-k')]
        .filter((e) => /Souřad/i.test(e.textContent)).length,
      /* A že jsou OPRAVDU u mapy, ne zase někde v parametrech. */
      podMapou: (() => {
        const m = document.querySelector('#pzm'), w2 = document.querySelector('.pz-sour');
        if (!m || !w2) return null;
        return w2.getBoundingClientRect().top >= m.getBoundingClientRect().bottom - 2;
      })(),
      vParametrech: !!document.querySelector('.pz-spec .pz-sour'),
      vyska: Math.round(document.querySelector('.pz-sour').getBoundingClientRect().height),
      naJedne: (() => {
        const b2 = document.querySelector('#pz-sour-kop'), a2 = document.querySelector('#pz-sour-nav');
        return !!(b2 && a2) && Math.abs(b2.getBoundingClientRect().top - a2.getBoundingClientRect().top) < 6;
      })() };
  });
  pravda('stránka pozemku ukazuje souřadnice', v.je, 'blok .pz-sour na stránce není');
  if (!v.je) { await prohlizec.close(); hotovo(); }
  pravda('a je u nich popisek, aby bylo poznat, co to je', v.popisek > 0);
  /* KDE STOJÍ. Dřív byly mezi parametry — tedy 2 100 px nad mapou
     (naměřeno na telefonu 390 px: tabulka na 634 px, „Pozemek na mapě"
     až na 2 697). „Jak se tam dostanu" se přitom čte u mapy, a v tabulce
     ten jediný řádek zabíral 230 px ze čtyř set, které celá měla. */
  pravda('stojí pod mapou, ne mezi parametry', v.podMapou === true,
    'blok .pz-sour nezačíná až za mapou #pzm');
  pravda('a v tabulce parametrů už nejsou', v.vParametrech === false,
    'souřadnice jsou na stránce dvakrát — v parametrech i pod mapou');
  pravda('obě tlačítka stojí vedle sebe, ne pod sebou', v.naJedne === true,
    'zalomila se — blok tím naroste o 52 px');
  pravda('a blok se nerozlézá do výšky', v.vyska > 0 && v.vyska <= 150, `${v.vyska} px`);

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
      /^geo:-?\d+\.\d+,-?\d+\.\d+\?q=/, true],
    ['iPhone', 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148',
      /^https:\/\/maps\.apple\.com\/\?ll=-?\d+\.\d+,-?\d+\.\d+/, true],
    ['počítač', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
      /^https:\/\/mapy\.cz\//, false],
  ];
  /* DOTYK PODLE ZAŘÍZENÍ, ne podle šířky okna. Telefon se tu dosud
     předstíral jen jménem v hlavičce prohlížeče — a pravidla pro telefon
     tu stojí za `@media (pointer: coarse)`, takže se u „Androidu"
     i „iPhonu" vykreslovalo rozvržení monitoru. Řádek „počítač" dotyk
     nemá schválně: je to opravdu počítač, jen v malém okně.
     (Jak se to našlo: bod 3da v docs/co-chybi.md.) */
  for (const [jm, ua, tvar, dotyk] of zarizeni) {
    const ctx = await prohlizec.newContext(Object.assign({ bypassCSP: true },
      { viewport: { width: 390, height: 844 }, userAgent: ua },
      dotyk ? { isMobile: true, hasTouch: true, locale: 'cs-CZ' } : {}));
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
