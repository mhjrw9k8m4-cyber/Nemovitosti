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
  predvyplneno.replace(/[\s\u00a0]/g, '') === '450000', `v poli je „${predvyplneno}"`);

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

/* --- POLE MUSÍ PŘIJMOUT ČÍSLO TAK, JAK STOJÍ V INZERÁTU ---------------
 * Pole byla type="number". Ta mezeru nepustí dál: kdo zkopíroval
 * „450 000 Kč" z inzerátu — přesně jak to nabízí zástupný text toho
 * pole — dostal prázdno a nedozvěděl se proč. js/naklady.js přitom
 * mezery i desetinnou čárku odmazávat umí od začátku; u číselného
 * pole byl ten kód mrtvý, protože neplatnou hodnotu prohlížeč vůbec
 * nepředá. Vedle toho stálo v poli „6000" a o dva řádky níž v tabulce
 * „6 000 Kč" — totéž číslo dvakrát jinak na jedné obrazovce.
 */
{
  const vstupy = await p.evaluate(() => ['nak-cena', 'nak-advokat-kc', 'nak-uschova-kc',
    'nak-provize-pct', 'nak-geoplan-kc', 'nak-posudek-kc']
    .map((id) => { const e = document.getElementById(id);
      return e ? { id, typ: e.type, rezim: e.inputMode, hod: e.value } : { id, typ: null }; }));
  pravda('všechna pole kalkulačky na stránce jsou', vstupy.every((v) => v.typ),
    JSON.stringify(vstupy.filter((v) => !v.typ).map((v) => v.id)));
  pravda('a žádné z nich není type="number" (to by mezeru v čísle zahodilo)',
    vstupy.every((v) => v.typ !== 'number'),
    vstupy.filter((v) => v.typ === 'number').map((v) => v.id).join(', '));
  pravda('a každé si přesto říká o číselnou klávesnici',
    vstupy.every((v) => v.rezim === 'numeric' || v.rezim === 'decimal'),
    vstupy.map((v) => `${v.id}:${v.rezim || '—'}`).join(' '));

  // Výchozí hodnoty v poli a v tabulce se musí psát stejně.
  const vychozi = vstupy.filter((v) => v.id.endsWith('-kc'));
  pravda('výchozí částky jsou tisícové (jinak se zápis nemá na čem poznat)',
    vychozi.length >= 3 && vychozi.every((v) => v.hod.replace(/[\s ]/g, '').length >= 4),
    vychozi.map((v) => v.id + '=' + v.hod).join(' '));
  pravda('a v poli jsou psané s oddělovačem tisíců, stejně jako v tabulce pod nimi',
    vychozi.every((v) => /[\s ]/.test(v.hod)),
    vychozi.map((v) => `${v.id} „${v.hod}"`).join('; '));

  /* Meze dřív hlídal atribut max na číselném poli. Ten na textovém nic
     neznamená, takže je hlídá js/naklady.js — a ořez musí být vidět
     i v poli, jinak by se nedalo poznat, které číslo vlastně platí. */
  await p.fill('#nak-provize-pct', '99');
  await p.locator('#nak-provize-pct').blur();
  await p.waitForTimeout(250);
  const poOrezu = await p.evaluate(() => (document.getElementById('nak-provize-pct') || {}).value);
  pravda('nesmyslné procento se ořízne na mez a ořez je vidět i v poli',
    poOrezu.replace(',', '.') === '20', `v poli zůstalo „${poOrezu}"`);
  await p.fill('#nak-provize-pct', '5');
  await p.waitForTimeout(150);

  // A hlavní věc: číslo opsané z inzerátu projde.
  // Provize je v tuhle chvíli zapnutá z kontroly výš a počítá se z ceny,
  // takže by do součtu mluvila; pro tenhle výpočet ji vypnu.
  await p.uncheck('#nak-realitka');
  /* Vepsání si hlídá chybu samo: do type="number" prohlížeč mezeru
     nepustí a Playwright to rovnou odmítne. Bez tohohle odchycení by
     test spadl výjimkou dřív, než stihne vypsat, co se vlastně stalo. */
  const vepsano = await p.fill('#nak-cena', '450 000 Kč').then(() => '', (e) => String(e).slice(0, 90));
  pravda('do pole ceny jde vepsat číslo i s mezerou', !vepsano, vepsano);
  await p.waitForTimeout(250);
  const sMezerou = vepsano ? [] : await stav();
  const celkem = sMezerou.find((r) => r.trida === 'nak-celkem');
  pravda('a spočítá se z něj správná částka',
    !!celkem && cislo(celkem.v) === 450000 + 2000 + 6000 + 5000,
    celkem ? `v tabulce ${celkem.v}, čekáno ${450000 + 2000 + 6000 + 5000}`
      : 'řádek s celkovou částkou chybí');
}

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
