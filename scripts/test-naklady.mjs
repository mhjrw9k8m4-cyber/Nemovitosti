/* Test: kalkulačka nákladů počítá, co slibuje — a nic si nevymýšlí.
 *
 * Spuštění: PW_CHROMIUM=… node scripts/test-naklady.mjs
 *
 * PROČ VZNIKLA. Stránka „Kolik stojí koupě pozemku" měla devět nadpisů
 * textu a ani jedno vstupní pole: vyjmenovala vklad do katastru, advokáta,
 * úschovu, provizi i geometrický plán — a sečíst si to musel člověk sám.
 * Kalkulačka je od toho; tahle zkouška hlídá, že počítá správně a že
 * nevydává odhad za jistotu.
 *
 * SOUČET SE NEPOROVNÁVÁ S TÍMŽ VÝRAZEM, KTERÝ HO VYROBIL. Zkouška si
 * sahá na jednotlivé řádky tabulky a sčítá si je sama; kdyby brala číslo
 * ze souhrnu a porovnávala ho se souhrnem, prošla by i tehdy, kdyby
 * kalkulačka sčítala špatně.
 */
import { chromium } from 'playwright-core';

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

const nactena = await p.goto(`${BASE}/kolik-stoji-koupe-pozemku.html?cena=450000`, { waitUntil: 'domcontentloaded' })
  .then((r) => r && r.ok()).catch(() => false);
pravda('stránka s kalkulačkou se načetla', nactena);
await p.waitForTimeout(1500);

const jeTam = await p.evaluate(() => !!document.getElementById('naklady'));
pravda('kalkulačka na stránce je', jeTam);

const predvyplneno = await p.evaluate(() => (document.getElementById('nak-cena') || {}).value);
pravda('cena z odkazu se předvyplní (ze stránky pozemku se sem chodí s ?cena=)',
  predvyplneno === '450000', `v poli je „${predvyplneno}"`);

function stav() {
  return p.evaluate(() => {
    const t = document.querySelector('#nak-vysledek .nak-tab');
    if (!t) return null;
    const radky = [...t.querySelectorAll('tbody > tr')].map((r) => ({
      k: r.querySelector('th').childNodes[0].textContent.trim(),
      v: r.querySelector('td').textContent.trim(),
      trida: r.className,
    }));
    return radky;
  });
}
const r1 = await stav();
pravda('výsledek je tabulka s řádky', !!r1 && r1.length >= 3, JSON.stringify(r1 && r1.length));
if (!r1) { await prohlizec.close(); process.exit(1); }

const polozky1 = r1.filter((r) => !r.trida);
const mezi1 = r1.find((r) => r.trida === 'nak-mezi');
const celkem1 = r1.find((r) => r.trida === 'nak-celkem');
const soucet1 = polozky1.reduce((a, r) => a + cislo(r.v), 0);
pravda('jednotlivé položky nejsou prázdné (jinak by součet seděl na nule)',
  polozky1.length >= 3 && polozky1.every((r) => cislo(r.v) > 0), JSON.stringify(polozky1));
pravda('„Náklady navíc" je součet položek nad ním',
  mezi1 && cislo(mezi1.v) === soucet1, `v tabulce ${mezi1 && mezi1.v}, sečteno ${soucet1}`);
pravda('celkem je cena pozemku plus náklady',
  celkem1 && cislo(celkem1.v) === 450000 + soucet1, `v tabulce ${celkem1 && celkem1.v}, čekáno ${450000 + soucet1}`);
pravda('vklad do katastru je mezi položkami (jediná pevná částka, kterou článek uvádí číslem)',
  polozky1.some((r) => /vklad/i.test(r.k) && cislo(r.v) === 2000), JSON.stringify(polozky1.map((r) => r.k)));

/* Provize se počítá z ceny, ne z paušálu — tohle je ta položka, kde se
   nejspíš někdo splete. */
await p.check('#nak-realitka');
await p.waitForTimeout(250);
const r2 = await stav();
const provize = r2.find((r) => /provize/i.test(r.k));
pravda('po zaškrtnutí realitky přibude provize', !!provize, JSON.stringify(r2.map((r) => r.k)));
pravda('a je to procento z kupní ceny, ne paušál',
  provize && cislo(provize.v) === Math.round(450000 * 0.04), `v tabulce ${provize && provize.v}, čekáno ${450000 * 0.04}`);
await p.fill('#nak-provize-pct', '5');
await p.waitForTimeout(250);
const provize5 = (await stav()).find((r) => /provize/i.test(r.k));
pravda('změna procenta se projeví', provize5 && cislo(provize5.v) === Math.round(450000 * 0.05),
  `v tabulce ${provize5 && provize5.v}`);

/* Bez ceny se nesmí tvářit, že zná celkovou částku. */
await p.fill('#nak-cena', '');
await p.waitForTimeout(250);
const r3 = await stav();
pravda('bez zadané ceny se neukazuje součet s cenou pozemku',
  !r3.some((r) => r.trida === 'nak-celkem'), JSON.stringify(r3.map((r) => r.trida)));

const pozn = await p.evaluate(() => (document.querySelector('.nak-pozn') || {}).textContent || '');
pravda('pod tabulkou stojí, že je to odhad, ne cena, kterou web zaručuje',
  /zhruba/i.test(pozn) && /odhad/i.test(pozn), pozn.slice(0, 120));
pravda('a že daň z nabytí se neplatí (článek to uvádí jako nejčastější dotaz)',
  /nabytí/i.test(pozn), pozn.slice(0, 120));
pravda('stránka při tom nespadla', chyby.length === 0, chyby.join(' | '));

await prohlizec.close();
console.log('\nKalkulačka nákladů při koupi');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Kalkulačka: ' + chyb + ' kontrol neprošlo.'); process.exit(1); }
process.exit(0);
