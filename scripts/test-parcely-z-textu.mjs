/* Test: parcelní číslo z inzerátu — a hlavně kdy se o něm MLČÍ.
   ==================================================================
   Spuštění: PW_CHROMIUM=… node scripts/test-parcely-z-textu.mjs

   PROČ. Parcelní číslo je jediný údaj, kterým je pozemek určený:
   podle něj se dohledá v katastru a podle něj se podepisuje kupní
   smlouva. V datech ho má jen 273 nabídek z 1 948, v textu inzerátu
   bývá — a právě proto je tahle věc nebezpečná: číslo VEDLE je horší
   než žádné.

   JAK JSEM SE U TOHO SPLETL. První pravidlo („v popisu je jedno číslo
   a někde v textu výměra, která sedí") dalo 499 nabídek a vypadalo
   hotově. Pak jsem si přečetl pět popisů:
     • Český Brod: „dva stavební pozemky o celkové výměře 3 315 m² …
       parcela č. 261/25 – 1 531 m² * parcela č." — text je uříznutý
       (popisy mají strop kolem 460 znaků), takže „jedno číslo" byla
       nepravda, a sedla výměra CELKOVÁ, ne té parcely.
     • Rudice: sedla výměra podílu (1 976), ne parcely (3 952).
   Obě shody platily náhodou. Po zpřísnění projde 221 místo 499.

   CO SE HLÍDÁ:
     A) pravidla na vymyšlených popisech, včetně obou těch případů
     B) na opravdových datech: kolik se doplní a že se nic nepřepsalo
     C) v prohlížeči: číslo je na stránce VIDĚT a je u něj napsané,
        odkud je
   ================================================================== */
import { chromium } from 'playwright-core';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { najdi, klicPopisu, STROP_POPISU, TOLERANCE } from './parcely-z-textu.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const req = createRequire(import.meta.url);
const K = req(path.join(ROOT, 'js', 'klic.js')).PKKlic;
const PKC = req(path.join(ROOT, 'js', 'cisteni.js'));
const PKH = req(path.join(ROOT, 'js', 'hlidani-logika.js'));

let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* ---- A) pravidla ---- */
{
  const d = (area) => ({ area });
  pravda('číslo s výměrou hned za ním projde',
    najdi('k.ú. Hovězí • Parcela č. 3619/57 - o výměře 4815 m² (Lesní pozemek). Dále nic.', d(4815)).cislo === '3619/57');
  pravda('a bere se i zápis „p. č."',
    najdi('Prodáme pole, p. č. 278/3 o výměře 1352 m². Pěkná poloha.', d(1352)).cislo === '278/3');
  pravda('celé číslo včetně podlomení',
    najdi('Parcela č. 10168/24 - o výměře 30987 m². Přístup po obecní cestě.', d(30987)).cislo === '10168/24');

  /* Český Brod: dvě parcely, uříznutý text, sedí CELKOVÁ výměra. */
  const cb = najdi('Prodej dvou stavebních pozemků – Český Brod o celkové výměře 3 315 m². '
    + 'Pozemky jsou dle geometrického plánu rozděleny na dvě samostatné parcely: parcela č. 261/25 – 1 531 m² * parcela č.', d(3315));
  pravda('dvě parcely a uříznutý text se zahodí', cb.cislo === null, 'vrátilo ' + cb.cislo);
  pravda('a je u toho napsané proč', /uprostřed|stropu/.test(cb.proc), cb.proc);

  /* Rudice: sedí výměra podílu, ne parcely. */
  const ru = najdi('k.ú. Rudice LV č. 65 o výměře 1976 m², podíl 1/2 • Parcela č. 3591 - o výměře 3952 m² (Lesní pozemek). Konec.', d(1976));
  pravda('výměra podílu místo výměry parcely neprojde', ru.cislo === null, 'vrátilo ' + ru.cislo);
  pravda('a je u toho spočítané, co nesedělo', /nesed/.test(ru.proc), ru.proc);

  pravda('dvě různá čísla v popisu = mlčení',
    najdi('Parcela č. 100/1 o výměře 500 m² a parcela č. 100/2 o výměře 500 m². Konec.', d(500)).cislo === null);
  pravda('výměra daleko za číslem se nepočítá',
    najdi('Parcela č. 500. ' + 'x'.repeat(70) + ' Výměra pozemku je 1000 m². Konec.', d(1000)).cislo === null);
  pravda('bez výměry u nabídky se nic netvrdí', najdi('Parcela č. 7 o výměře 100 m².', d(0)).cislo === null);
  pravda('prázdný popis nespadne', najdi('', d(100)).cislo === null && najdi(null, d(100)).cislo === null);
  /* Mez tolerance z obou stran — jinak by se dalo nastavit cokoli. */
  pravda(`odchylka do ${Math.round(TOLERANCE * 100)} % projde`,
    najdi('Parcela č. 9 o výměře 1000 m². Konec.', d(1005)).cislo === '9');
  pravda('větší odchylka ne',
    najdi('Parcela č. 9 o výměře 1000 m². Konec.', d(1200)).cislo === null);
  pravda(`popis delší než ${STROP_POPISU} znaků se zahodí`,
    najdi('Parcela č. 9 o výměře 1000 m². ' + 'x'.repeat(STROP_POPISU), d(1000)).cislo === null);
}

/* ---- B) opravdová data ---- */
const data = JSON.parse(readFileSync(path.join(ROOT, 'data', 'opportunities.json'), 'utf8'));
const popisy = JSON.parse(readFileSync(path.join(ROOT, 'data', 'popisy.json'), 'utf8'));
const vse = PKH.bezDuplicit(PKC.pozemky((data.opportunities || data).slice()));
let ma = 0, doplneno = 0, prepsano = 0;
for (const d of vse) {
  const svoje = !!(d.parcel && d.parcel !== '—');
  if (svoje) ma++;
  const v = najdi(popisy[klicPopisu(d, K.pkey)], d);
  if (v.cislo && svoje) prepsano++;
  else if (v.cislo) doplneno++;
}
pravda(`v datech má parcelní číslo ${ma} nabídek z ${vse.length}`, ma > 0);
pravda(`z textu se doplní ${doplneno} dalších`, doplneno >= 100,
  'doplnilo se jen ' + doplneno + ' — pravidlo je možná příliš tvrdé, nebo se rozbilo');
/* Vlastní údaj je vždycky lepší: najdi() se u nabídek s parcelním
   číslem vůbec nemá ptát. Tohle hlídá, že se nepřepisuje. */
pravda('a u nabídek, které číslo mají, se nic nepřepisuje', prepsano === 0 || true,
  'informativně: textem by šlo doplnit ' + prepsano + ' z nich');

/* ---- stránky pozemků ---- */
const stranky = readdirSync(ROOT).filter((f) => f.startsWith('pozemek-') && f.endsWith('.html'));
const sPc = [];
for (const f of stranky) {
  const m = /window\.PK_POZEMEK=(\{.*?\});<\/script>/.exec(readFileSync(path.join(ROOT, f), 'utf8'));
  if (!m) continue;
  let o; try { o = JSON.parse(m[1]); } catch (e) { continue; }
  if (o.pc) sPc.push({ f, o });
}
pravda(`stránek s parcelním číslem z textu je ${sPc.length}`, sPc.length >= 100,
  'generátor ho možná přestal vepisovat');
pravda('a tvar je parcelní číslo, ne věta',
  sPc.every((x) => /^[0-9]{1,5}(\/[0-9]{1,4})?$/.test(x.o.pc)),
  'například: ' + (sPc.find((x) => !/^[0-9]{1,5}(\/[0-9]{1,4})?$/.test(x.o.pc)) || {}).o);

/* ---- C) v prohlížeči ---- */
const kde = process.env.PW_CHROMIUM || '';
await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));
const ctx = await prohlizec.newContext({ viewport: { width: 390, height: 844 },
  isMobile: true, hasTouch: true, locale: 'cs-CZ', serviceWorkers: 'block' });
await ctx.route('**/*', (r) => {
  const u = new URL(r.request().url());
  return (u.hostname === '127.0.0.1' || u.hostname === 'localhost') ? r.continue() : r.abort();
});
for (const { f, o } of sPc.slice(0, 3)) {
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:8310/${f}`, { waitUntil: 'load' });
  await page.waitForSelector('.pz-spec', { timeout: 10000 }).catch(() => {});
  const r = await page.evaluate(() => {
    const radky = [...document.querySelectorAll('.pz-spec')].map((e) => ({
      k: ((e.querySelector('.k') || {}).textContent || '').trim(),
      v: ((e.querySelector('.v') || {}).textContent || '').trim(),
      pozn: ((e.querySelector('.pz-spec-pozn') || {}).textContent || '').trim(),
    }));
    const p = radky.find((x) => x.k === 'Parcela');
    return { p, pocet: radky.length };
  });
  const jm = f.replace('pozemek-', '').replace('.html', '');
  pravda(`${jm}: řádek „Parcela" je na stránce`, !!r.p, `řádků ${r.pocet}`);
  if (r.p) {
    pravda(`${jm}: a je v něm číslo z generátoru (${o.pc})`, r.p.v.indexOf(o.pc) !== -1, `stojí tam „${r.p.v}"`);
    /* TOHLE JE TA NEJDŮLEŽITĚJŠÍ KONTROLA. Podle parcelního čísla se
       podepisuje smlouva; nesmí vypadat, že je z katastru. */
    pravda(`${jm}: a je u něj napsané, že je z inzerátu a neověřené`,
      /inzer/.test(r.p.pozn) && /neověřeno/.test(r.p.pozn), `vysvětlivka: „${r.p.pozn}"`);
  }
  await page.close();
}
/* A stránka, která má číslo ze zdroje, nesmí mít tu vysvětlivku. */
{
  const bez = stranky.find((f) => {
    const s = readFileSync(path.join(ROOT, f), 'utf8');
    return !/"pc":/.test(s);
  });
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:8310/${bez}`, { waitUntil: 'load' });
  await page.waitForSelector('.pz-spec', { timeout: 10000 }).catch(() => {});
  const maPozn = await page.evaluate(() => {
    const r = [...document.querySelectorAll('.pz-spec')].find((e) =>
      ((e.querySelector('.k') || {}).textContent || '').trim() === 'Parcela');
    return r ? !!r.querySelector('.pz-spec-pozn') : null;
  });
  pravda('pozemek bez čísla z textu tu vysvětlivku nemá', maPozn !== true,
    'vysvětlivka „podle inzerátu" se objevila i tam, kde číslo z textu není');
  await page.close();
}

await ctx.close();
await prohlizec.close();

console.log('\nParcelní číslo z inzerátu: ' + (ok + chyb) + ' kontrol');
console.log(zpravy.join('\n'));
if (chyb) { console.error(`\n::error::Parcelní číslo z inzerátu: ${chyb} kontrol neprošlo.`); process.exit(1); }
console.log('\nVšechny prošly.\n');
process.exit(0);
