// Test: blok „Parametry pozemku".
//
// Spuštění: node scripts/test-parametry.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome)
//
// PROČ VZNIKL. Všech šest údajů stálo jako stejně vypadající řádky
// popisek-vlevo, hodnota-vpravo. Naměřeno: na počítači bylo mezi
// popiskem a hodnotou 435 px prázdna (na telefonu 133 px) a řádek se
// souřadnicemi byl na telefonu 149 px vysoký, protože se tlačítka
// zalamovala. Protože měly navíc všechny řádky tutéž velikost i váhu,
// nic nevedlo — výsledek vypadal jako výpis z databáze.
//
// Co se tu tedy hlídá:
//  • Tři čísla, podle kterých se člověk rozhoduje, stojí nahoře a jsou
//    větší než zbytek. Kdyby spadla zpátky mezi řádky, je to ten starý
//    nepřehledný seznam.
//  • Popisek a hodnota drží u sebe. Mez je 60 px: tolik je ještě vazba,
//    435 px už je přeskok přes půl obrazovky.
//  • Hodnoty začínají na JEDNÉ svislici. Rozházené hodnoty se čtou hůř
//    než zarovnané, a právě kvůli tomu je mřížka na celé tabulce.
//  • Nic nepřetéká do stran a na nic se dá klepnout prstem.
import { chromium } from 'playwright-core';
import { readdirSync } from 'node:fs';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8321;
const TYPY = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const f = path.join(KOREN, u === '/' ? 'index.html' : u.replace(/^\/+/, ''));
  if (!f.startsWith(KOREN) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    res.writeHead(404); res.end('ne'); return;
  }
  res.writeHead(200, { 'content-type': TYPY[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${PORT}`;

let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
function hotovo() {
  console.log('\nParametry pozemku');
  console.log(zpravy.join('\n'));
  console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
  server.close();
  if (chyb) { console.log('::error::Parametry pozemku: ' + chyb + ' kontrol neprošlo.'); process.exit(1); }
  process.exit(0);
}

const stranka = readdirSync(KOREN).filter((f) => /^pozemek-.+\.html$/.test(f)).sort()[0];
pravda('je na čem měřit — stránka pozemku', !!stranka);
if (!stranka) hotovo();

const prohlizec = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });

for (const [sirka, popisSirky] of [[390, 'telefon'], [768, 'tablet'], [1280, 'počítač']]) {
  const p = await prohlizec.newPage({ viewport: { width: sirka, height: 1000 } });
  const padlo = [];
  p.on('pageerror', (e) => padlo.push(String(e)));
  await p.goto(`${BASE}/${stranka}`, { waitUntil: 'load' });
  await p.waitForTimeout(2400);

  const v = await p.evaluate(() => {
    const klic = [...document.querySelectorAll('.pz-klic')];
    const rows = [...document.querySelectorAll('.pz-spec')];
    const mezery = [], levyOkraj = [];
    for (const r of rows) {
      const k = r.querySelector('.k'), val = r.querySelector('.v');
      if (!k || !val) continue;
      const rk = k.getBoundingClientRect(), rv = val.getBoundingClientRect();
      /* Řádek, který má schválně celou šířku (souřadnice na telefonu),
         se do obou měr nepočítá: jeho hodnota stojí POD popiskem, ne
         vedle něj, takže by „mezera" i „svislice" měřily něco jiného
         než u ostatních. Pozná se podle toho, že nesdílí linku. */
      const vedleSebe = Math.abs(rk.top - rv.top) < 6;
      if (!vedleSebe) continue;
      mezery.push({ popis: k.textContent.trim(), mezera: Math.round(rv.left - rk.right),
        vyska: Math.round(Math.max(rk.height, rv.height)) });
      levyOkraj.push(Math.round(rv.left));
    }
    /* Výška souřadnic se bere z celého řádku (obě buňky), ne ze seznamu
       výš — ten už ten řádek nemusí obsahovat, když stojí na dvou
       linkách. Právě ta výška byla původní vada (149 px). */
    const sourEl = [...document.querySelectorAll('.pz-spec')]
      .find((r) => r.querySelector('.pz-sour'));
    const sourVyskaPrima = sourEl ? (() => {
      const k = sourEl.querySelector('.k').getBoundingClientRect();
      const v2 = sourEl.querySelector('.v').getBoundingClientRect();
      return Math.round(Math.max(k.bottom, v2.bottom) - Math.min(k.top, v2.top));
    })() : 0;
    /* Vada nebyla „velké číslo", ale ZALOMENÁ TLAČÍTKA: „Kopírovat"
       a „Navigovat" se nevešla vedle sebe a spadla pod sebe, čímž řádek
       narostl na 149 px. Ptáme se proto rovnou na to — stojí na jedné
       lince? Výška je jen pojistka navrch: 126 px je poctivé minimum
       (popisek 36 + číslo 20 + 44px terč na prst + odsazení), pod to se
       to bez ztráty trefitelnosti nedostane. */
    const tlacitkaNaJedne = (() => {
      const w = document.querySelector('.pz-sour');
      if (!w) return null;
      const b2 = w.querySelector('#pz-sour-kop'), a2 = w.querySelector('#pz-sour-nav');
      if (!b2 || !a2) return null;
      return Math.abs(b2.getBoundingClientRect().top - a2.getBoundingClientRect().top) < 6;
    })();
    const sourRadek = mezery.find((m) => /Souřad/i.test(m.popis));
    const vel = (e) => parseFloat(getComputedStyle(e).fontSize);
    return {
      klicu: klic.length,
      klicePopisky: klic.map((e) => (e.querySelector('span') || {}).textContent || ''),
      klicVelikost: klic.length ? vel(klic[0].querySelector('b')) : 0,
      radekVelikost: rows.length ? vel(rows[0].querySelector('.v')) : 0,
      radku: mezery.length,
      nejvetsiMezera: mezery.length ? Math.max(...mezery.map((m) => m.mezera)) : 0,
      rozptylOkraju: levyOkraj.length ? Math.max(...levyOkraj) - Math.min(...levyOkraj) : 0,
      sourVyska: sourVyskaPrima,
      tlacitkaNaJedne: tlacitkaNaJedne,
      preteka: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });

  zpravy.push(`\n  — ${popisSirky} (${sirka} px)`);
  // PŘEDPOKLAD: bez bloku není co měřit
  pravda('nahoře stojí buňky s klíčovými čísly', v.klicu >= 2, `buněk: ${v.klicu}`);
  pravda('a je mezi nimi výměra i cena za metr',
    /Výměra/.test(v.klicePopisky.join('|')) && /Cena za m/.test(v.klicePopisky.join('|')),
    `popisky: ${v.klicePopisky.join(', ')}`);
  pravda('to hlavní číslo je větší než údaj v řádku',
    v.klicVelikost > v.radekVelikost, `${v.klicVelikost} px proti ${v.radekVelikost} px`);
  pravda('popisek a hodnota drží u sebe (nejvýš 60 px)',
    v.nejvetsiMezera <= 60, `největší mezera ${v.nejvetsiMezera} px`);
  pravda('hodnoty začínají na jedné svislici',
    v.rozptylOkraju <= 2, `levé okraje se rozcházejí o ${v.rozptylOkraju} px`);
  pravda('obě tlačítka u souřadnic stojí vedle sebe, ne pod sebou',
    v.tlacitkaNaJedne === true, 'zalomila se — řádek tím naroste o 52 px');
  pravda('a ten řádek se nerozlézá do výšky',
    v.sourVyska > 0 && v.sourVyska <= 130, `${v.sourVyska} px`);
  pravda('nic nepřetéká do stran', v.preteka <= 0, `přetéká o ${v.preteka} px`);
  pravda('a stránka u toho nespadne', padlo.length === 0, padlo.slice(0, 2).join(' | '));
  await p.close();
}

await prohlizec.close();
hotovo();
