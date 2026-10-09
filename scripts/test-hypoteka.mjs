/* Test: kalkulačka hypotéky počítá splátku správně — a nic si nevymýšlí.
 *
 * Spuštění: PW_CHROMIUM=… node scripts/test-hypoteka.mjs
 *
 * PROČ VZNIKLA. Stránka „Hypotéka na pozemek" vysvětluje LTV i akontaci
 * a nemá jediné vstupní pole; otázka, se kterou tam člověk chodí, je
 * přitom jedna: „mám tolik stranou, pozemek stojí tolik — kolik budu
 * platit měsíčně?"
 *
 * SPLÁTKA SE OVĚŘUJE JINÝM VÝPOČTEM, NEŽ JAKÝM VZNIKLA. Stránka počítá
 * anuitu uzavřeným vzorcem; zkouška si ji ověří UMOŘOVÁNÍM — měsíc po
 * měsíci odečítá úrok a splátku a na konci musí zbýt nula. Kdyby brala
 * tentýž vzorec, potvrdila by i chybu v něm.
 *
 * A hlídá se, že si web nevymýšlí čísla, která ta stránka schválně
 * neuvádí: úrok ani LTV nejsou tvrzení webu, ale pole, která vyplní
 * člověk — pod tabulkou to musí stát.
 */
import { chromium } from 'playwright-core';
import { pricinaChyb } from './chyby-hlaska.mjs';

await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));
const BASE = 'http://127.0.0.1:8310';
const PRAZDNA = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=', 'base64');

let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
const cislo = (t) => Number(String(t).replace(/[^\d]/g, '')) || 0;

/* Nezávislé ověření: umořovací plán. Při správné splátce zbyde po
   posledním měsíci nula (do koruny). */
function zbytekPoSplaceni(jistina, rocniPct, roky, splatka) {
  const n = Math.round(roky * 12), i = rocniPct / 100 / 12;
  let z = jistina;
  for (let m = 0; m < n; m++) z = z + z * i - splatka;
  return z;
}

const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));
const ctx = await prohlizec.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await ctx.route('**/*', (r) => {
  const u = new URL(r.request().url());
  if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') return r.continue();
  if (r.request().resourceType() === 'image') return r.fulfill({ status: 200, contentType: 'image/png', body: PRAZDNA });
  return r.abort();
});
const p = await ctx.newPage();
const chyby = [];
p.on('pageerror', (e) => chyby.push(String(e).slice(0, 120)));

const nactena = await p.goto(`${BASE}/hypoteka-na-pozemek.html?cena=600000`, { waitUntil: 'domcontentloaded' })
  .then((r) => r && r.ok()).catch(() => false);
pravda('stránka s kalkulačkou se načetla', nactena);
await p.waitForTimeout(1500);
pravda('kalkulačka na stránce je', await p.evaluate(() => !!document.getElementById('hypo')));
pravda('cena z odkazu se předvyplní', (await p.evaluate(() => (document.getElementById('hypo-cena') || {}).value)) === '600000');

function radky() {
  return p.evaluate(() => {
    const t = document.querySelector('#hypo-vysledek .nak-tab');
    if (!t) return null;
    return [...t.querySelectorAll('tbody > tr')].map((r) => ({
      k: r.querySelector('th').childNodes[0].textContent.trim(),
      pozn: (r.querySelector('th span') || {}).textContent || '',
      v: r.querySelector('td').textContent.trim(),
      trida: r.className,
    }));
  });
}
const r = await radky();
pravda('výsledek je tabulka', !!r && r.length >= 3, JSON.stringify(r && r.length));
if (!r) { await prohlizec.close(); process.exit(1); }

const pujcka = r.find((x) => /půjčíte/i.test(x.k));
const mes = r.find((x) => x.trida === 'hypo-mes');
pravda('„půjčíte si" je cena mínus vlastní peníze', pujcka && cislo(pujcka.v) === 600000 - 200000,
  `v tabulce ${pujcka && pujcka.v}`);
pravda('a LTV je podíl půjčky na ceně', pujcka && /67\s*%/.test(pujcka.pozn), `poznámka: ${pujcka && pujcka.pozn}`);

/* Tady se neporovnává vzorec se vzorcem: splátka se dosadí do umořování
   a po dvaceti letech musí zbýt nula. */
const s = mes ? cislo(mes.v) : 0;
pravda('měsíční splátka se ukazuje', s > 0, JSON.stringify(mes));
const zbytek = zbytekPoSplaceni(400000, 5, 20, s);
pravda('a po doplacení nezbývá dluh (ověřeno umořováním, ne týmž vzorcem)',
  Math.abs(zbytek) < 400, `po 240 měsících zbývá ${Math.round(zbytek)} Kč`);

/* Nula v úroku je mez, na které uzavřený vzorec dělí nulou. */
await p.fill('#hypo-urok', '0');
await p.waitForTimeout(250);
const r0 = await radky();
const mes0 = r0.find((x) => x.trida === 'hypo-mes');
pravda('bez úroku je splátka prostě jistina děleno počtem měsíců',
  mes0 && Math.abs(cislo(mes0.v) - 400000 / 240) < 2, `v tabulce ${mes0 && mes0.v}, čekáno ${Math.round(400000 / 240)}`);

/* Vlastní peníze vyšší než cena nesmí dát zápornou půjčku. */
await p.fill('#hypo-urok', '5');
await p.fill('#hypo-vlastni', '900000');
await p.waitForTimeout(250);
const r2 = await radky();
const pujcka2 = r2.find((x) => /půjčíte/i.test(x.k));
pravda('kdo má víc peněz než je cena, nepůjčuje si záporně',
  pujcka2 && cislo(pujcka2.v) === 0, `v tabulce ${pujcka2 && pujcka2.v}`);

const pozn = await p.evaluate(() => (document.querySelector('#hypo-vysledek .nak-pozn') || {}).textContent || '');
/* Věta zní „výpočet z vašich čísel, ne nabídka" — zkouška původně hledala
   „není nabídka" a chyba byla v ní, ne na stránce. */
pravda('pod tabulkou stojí, že to není nabídka banky',
  /\bne\s+nabídka/i.test(pozn), pozn.slice(0, 140));
pravda('a že kolik banka opravdu půjčí, závisí na pozemku',
  /banka opravdu půjčí/i.test(pozn), pozn.slice(0, 140));
pravda('stránka při tom nespadla', chyby.length === 0, chyby.join(' | '));

await prohlizec.close();
console.log('\nKalkulačka hypotéky');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Hypotéka: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
process.exit(0);
