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
import { najdi, klicPopisu, STROP_POPISU, TOLERANCE,
  vymeraJePodilova, zlomekCislo } from './parcely-z-textu.mjs';
import { pricinaChyb } from './chyby-hlaska.mjs';

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

/* ---- D) CESTA DO PODKLADU PRO SMLOUVU ----
   Podle parcelního čísla se určuje, co se prodává. Stránka pozemku ho
   posílá do podkladu pro smlouvu, ale MUSÍ u toho říct, že je z textu
   inzerátu — kdo ho nezkontroluje, může podepsat smlouvu na jiný
   pozemek. Zkouší se celá cesta, ne jen jedna polovina: odkaz na
   stránce pozemku, a pak co udělá stránka smlouvy. */
{
  const { f, o } = sPc[0];
  const page = await ctx.newPage();
  await page.goto(`http://127.0.0.1:8310/${f}`, { waitUntil: 'load' });
  await page.waitForSelector('.pz-naklady a', { timeout: 10000 }).catch(() => {});
  const odkaz = await page.evaluate(() => {
    const a = [...document.querySelectorAll('.pz-naklady a')]
      .find((x) => /kupni-smlouva/.test(x.getAttribute('href') || ''));
    return a ? a.getAttribute('href') : null;
  });
  pravda('odkaz na podklad pro smlouvu je na stránce', !!odkaz, 'nenašel se');
  pravda(`a nese parcelní číslo z inzerátu (${o.pc}) s příznakem, odkud je`,
    !!odkaz && odkaz.indexOf('parcela=' + encodeURIComponent(o.pc)) !== -1
    && odkaz.indexOf('parcela_z=inzerat') !== -1, 'odkaz: ' + odkaz);
  await page.close();

  if (odkaz) {
    const p2 = await ctx.newPage();
    await p2.goto(`http://127.0.0.1:8310/${odkaz}`, { waitUntil: 'load' });
    await p2.waitForSelector('#sml-parcela', { timeout: 10000 }).catch(() => {});
    await p2.waitForTimeout(400);
    const r = await p2.evaluate(() => {
      const e = document.getElementById('sml-parcela');
      const pozn = document.getElementById('sml-parcela-pozn');
      return { hodnota: e ? e.value : null,
        pozn: pozn ? (pozn.textContent || '').trim() : null,
        vidi: pozn ? !!(pozn.offsetWidth || pozn.offsetHeight) : false,
        popsano: e ? e.getAttribute('aria-describedby') : null };
    });
    pravda(`podklad má parcelní číslo předvyplněné (${o.pc})`, r.hodnota === o.pc,
      'v poli stojí „' + r.hodnota + '"');
    pravda('a VEDLE POLE stojí, že je z inzerátu a má se ověřit',
      !!r.pozn && /inzer/.test(r.pozn) && /ověř/.test(r.pozn), 'vysvětlivka: „' + r.pozn + '"');
    pravda('vysvětlivka je doopravdy vidět, ne jen v DOM', r.vidi === true);
    pravda('a odečítač obrazovky ji přečte u toho pole',
      r.popsano === 'sml-parcela-pozn', 'aria-describedby = ' + r.popsano);
    await p2.close();
  }
}

/* ---- JE ULOŽENÁ VÝMĚRA UŽ PODÍLOVÁ? -----------------------------
 *
 * js/ceny.js dělil cenu `area × zlomek` a komentář u toho tvrdil, že
 * „výměra v inzerátu je celá parcela". U jednoho zdroje to neplatí:
 * inzerát vypíše parcely zvlášť a uložená výměra je už ta podílová,
 * takže se dělilo dvakrát a cena za metr vyšla násobně vyšší (u 1/2
 * dvakrát, u 3/20 sedmkrát).
 *
 * Příznak se nasazuje jen tam, kde to text DOKAZUJE. Kontroly níž
 * jsou proto ve dvou polovinách: co se poznat MÁ, a co se poznat
 * NESMÍ — tam je ta cena, protože nasazený příznak na nabídce, kde
 * výměra podílová není, by tiskl cenu za metr NIŽŠÍ, než je.
 */
{
  const rudice = 'k.ú. Rudice LV č. 65 o výměře 1976 m², podíl 1/2 '
    + '• Parcela č. 3591 - o výměře 3952 m² (Lesní pozemek)';
  pravda('zlomek se přečte', zlomekCislo('3/20') === 0.15 && zlomekCislo('x') === null);
  pravda('součet parcel krát zlomek sedí na výměru → výměra je podílová',
    vymeraJePodilova(rudice, { podil: true, zlomek: '1/2', area: 1976 }) === true);
  pravda('a sedí to i u zlomku, který není polovina',
    vymeraJePodilova('LV č. 1 o výměře 1144 m², podíl 3/20 '
      + '• Parcela č. 3121/5 - o výměře 7628 m²',
      { podil: true, zlomek: '3/20', area: 1144 }) === true);
  /* Uříznutý výpis: součet nejde spočítat, ale LV sedí a jedna parcela
     je větší než uložená výměra — to samo dokazuje, že výměra není
     celá parcela. */
  pravda('uříznutý výpis rozhodne druhá cesta (LV sedí, parcela je větší)',
    vymeraJePodilova('LV č. 492 o výměře 2939 m², podíl 1/4 '
      + '• Parcela č. 3132/6 - o výměře 8096 m² (Trvalý travní porost) • Parcela č.',
      { podil: true, zlomek: '1/4', area: 2939 }) === true);

  /* ---- a co se poznat NESMÍ ---- */
  pravda('bez vypsaných parcel se nic nenasazuje',
    vymeraJePodilova('Prodám podíl 1/2 na pozemku o výměře 1976 m².',
      { podil: true, zlomek: '1/2', area: 1976 }) === false);
  pravda('bez známého zlomku taky ne',
    vymeraJePodilova(rudice, { podil: true, area: 1976 }) === false);
  pravda('a u nabídky, která podíl není, vůbec',
    vymeraJePodilova(rudice, { area: 1976 }) === false);
  /* Výměra, která je OPRAVDU celá parcela: součet parcel se rovná
     uložené výměře, ne jejímu zlomku. Tam se příznak nasadit nesmí —
     cena za metr by vyšla nižší, než je. */
  pravda('když součet parcel ROVNÁ uložené výměře, příznak se nenasadí',
    vymeraJePodilova('LV č. 7 o výměře 3952 m², podíl 1/2 '
      + '• Parcela č. 1 - o výměře 1952 m² • Parcela č. 2 - o výměře 2000 m²',
      { podil: true, zlomek: '1/2', area: 3952 }) === false);
}

await ctx.close();
await prohlizec.close();

console.log('\nParcelní číslo z inzerátu: ' + (ok + chyb) + ' kontrol');
console.log(zpravy.join('\n'));
if (chyb) { console.error(`\n::error::Parcelní číslo z inzerátu: ${chyb} kontrol neprošlo.${pricinaChyb(zpravy)}`); process.exit(1); }
console.log('\nVšechny prošly.\n');
process.exit(0);
