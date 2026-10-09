/* Test: u verdiktu o ceně je vidět, z kolika nabídek vyšel.
   ==================================================================
   Spuštění: node scripts/test-vzorek-verdiktu.mjs
     (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=…/chrome)

   PROČ. „Dražší než 98 % pozemků téhož druhu ve Středočeském kraji"
   zní jako statistika trhu. Model na takový verdikt přitom stačí deset
   srovnatelných nabídek — a naměřeno na ostrých datech: verdikt dostane
   1 159 z 1 950 nabídek a u 489 z nich (42 %) stojí na vzorku menším
   než dvacet. Medián je 21, minimum 10. Ta první věta nahoře je
   skutečná, z benesov-benesov-1sjtz7b, a vyšla z DVANÁCTI nabídek.

   Kdo se podle verdiktu rozhoduje o kupní ceně, má nárok ten rozdíl
   vidět. Číslo model vrací (pc.sample) a stránka ho zahazovala.

   Co se měří na skutečných stránkách pozemků:
     1. verdikty se vůbec ukazují (jinak zkouška nic neměří);
     2. u KAŽDÉHO je počet nabídek;
     3. a ten počet se rovná tomu, co ze stejných dat spočítá cenový
        model TADY V NODE — text se tedy neporovnává s textem, ale
        s nezávislým výpočtem ze zdroje;
     4. a nikdy není menší než deset, protože pod to model verdikt
        nedává (kdyby dával, byla by to vada modelu, ne textu).
   ================================================================== */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mapaSouboru } from './generate-parcel-pages.mjs';
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

const PW = process.env.PW_CHROMIUM;
const browser = await chromium.launch(PW ? { executablePath: PW } : {});
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
const page = await ctx.newPage();
for (const v of ['**://*.tile.*/**', '**://*.openstreetmap.org/**', '**/_vercel/**']) {
  await page.route(v, (r) => r.fulfill({ status: 204, body: '' })).catch(() => {});
}

/* Očekávané počty se spočítají ZDE, ze stejných dat a týmž modelem,
   jaký běží v prohlížeči (js/ceny.js). Stránka se pak neporovnává
   s jinou stránkou, ale s nezávislým výpočtem ze zdroje. */
const require_ = createRequire(import.meta.url);
const PKH = require_(path.join(KOREN, 'js', 'hlidani-logika.js'));
new Function(fs.readFileSync(path.join(KOREN, 'js', 'ceny.js'), 'utf8'))();
const CENY = globalThis.PK_CENY;
const DATA = PKH.bezDuplicit(JSON.parse(fs.readFileSync(path.join(KOREN, 'data', 'opportunities.json'), 'utf8')).opportunities);
const MODEL = CENY.postav(DATA);
/* mapaSouboru vrací klíč nabídky → { d, soubor }. Otočíme to na
   jméno souboru → nabídka, protože zkouška jde od stránek. */
const podleSouboru = new Map();
for (const v of mapaSouboru(DATA).values()) if (v && v.soubor) podleSouboru.set(v.soubor, v.d);
pravda(`model i mapa stránek se načetly (${DATA.length} nabídek, ${podleSouboru.size} stránek)`,
  !!(MODEL && MODEL.percentil) && DATA.length > 100 && podleSouboru.size > 100,
  `nabídek ${DATA.length}, stránek ${podleSouboru.size} — bez nich se nedá porovnávat`);

const dejNabidku = (jmeno) => podleSouboru.get(jmeno) || null;

/* Vzorek stránek napříč abecedou, ne prvních pár z jednoho okresu —
   jinak by se měřil jeden kraj a jedna velikost vzorku. */
const vsechny = fs.readdirSync(KOREN).filter((f) => /^pozemek-.+-[0-9a-z]{5,8}\.html$/.test(f)).sort();
const KOLIK = 24;
const krok = Math.max(1, Math.floor(vsechny.length / KOLIK));
const stranky = [];
for (let i = 0; i < vsechny.length && stranky.length < KOLIK; i += krok) stranky.push(vsechny[i]);

let sVerdiktem = 0, bezPoctu = 0, nesedi = 0, podDeset = 0, jine = 0, porovnano = 0, nespojeno = 0, bezNabidky = 0;
const ukazky = [];
for (const s of stranky) {
  await page.goto(`${BASE}/${s}`, { waitUntil: 'load' });
  await page.waitForTimeout(700);
  const v = await page.evaluate(() => {
    const el = document.querySelector('.pz-verdict .pv-text');
    if (!el) return null;
    const odznak = ((document.querySelector('.pz-verdict .pv-badge') || {}).textContent || '').trim();
    const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
    const m = /\((\d+)\s+nabíd/.exec(text);
    return { text, odznak, vText: m ? Number(m[1]) : null };
  });
  if (!v) continue;
  /* TŘI VERDIKTY O CENĚ, NIC JINÉHO. Ve stejném rámečku se ukazuje
     i hláška o spoluvlastnickém podílu — ta žádný percentil netvrdí
     (u podílu je cena za metr nízká z podstaty věci), takže po ní
     počet nabídek chtít nelze. Měří se proto jen ty tři, které
     o ceně opravdu soudí. */
  if (!/^(Výhodná cena|Vyšší cena|Průměrná cena)$/.test(v.odznak)) { jine++; continue; }
  sVerdiktem++;
  if (v.vText === null) { bezPoctu++; if (ukazky.length < 4) ukazky.push(s + ': ' + v.text.slice(0, 90)); continue; }
  if (v.vText < 10) { podDeset++; if (ukazky.length < 4) ukazky.push(s + ': jen ' + v.vText); }
  const nab = dejNabidku(s);
  if (!nab) { bezNabidky++; if (ukazky.length < 4) ukazky.push(s + ': stránka nemá v datech nabídku (náhrobek?)'); continue; }
  const ocekavany = (MODEL.percentil(nab) || {}).sample;
  if (typeof ocekavany !== 'number') { nespojeno++; if (ukazky.length < 4) ukazky.push(s + ': prohlížeč verdikt ukázal, model v node ne'); continue; }
  porovnano++;
  if (ocekavany !== v.vText) {
    nesedi++;
    if (ukazky.length < 4) ukazky.push(s + ': v textu ' + v.vText + ', ze zdroje vychází ' + ocekavany);
  }
}

pravda(`verdikt o ceně se ukazuje (${sVerdiktem} z ${stranky.length} prohlédnutých stránek)`,
  sVerdiktem >= 8, `jen ${sVerdiktem} — zkouška by neměla co měřit`);
pravda('a u každého stojí, z kolika nabídek vyšel',
  bezPoctu === 0, `${bezPoctu} verdiktů bez počtu:\n      ` + ukazky.join('\n      '));
/* NEJDŘÍV, ŽE SE VŮBEC POROVNÁVALO. Napoprvé tu stálo jen „nesedí
   nula" — a protože se stránka k nabídce nespárovala (mapaSouboru vrací
   klíč → {d, soubor}, ne soubor → nabídka), neporovnalo se NIC a
   kontrola byla zeleně slepá. Prozradila to až sabotáž: natvrdo
   dosazené „(25 nabídek)" prošlo. */
pravda(`stránky se spárovaly s nabídkami a počty se porovnaly (${porovnano})`,
  porovnano >= 8, `porovnáno jen ${porovnano} — bez spárování kontrola níž nic neměří`);
/* Stránka, která v datech nabídku nemá, je náhrobek po zmizelé nabídce
   — těch pár smí být. Horší případ je druhý: prohlížeč verdikt UKÁZAL,
   ale model nad týmiž daty v node žádný nemá. To by znamenalo, že se
   oba výpočty rozešly, a to se stát nesmí. */
pravda(`náhrobků bez nabídky je pár (${bezNabidky})`, bezNabidky <= 2,
  `${bezNabidky} stránek nemá v datech protějšek:\n      ` + ukazky.join('\n      '));
pravda('a nikde prohlížeč verdikt neukázal tam, kde ho model nemá',
  nespojeno === 0,
  `${nespojeno} případů — výpočet v prohlížeči a v node se rozešel:\n      ` + ukazky.join('\n      '));
pravda('počet v textu se rovná tomu, co ze zdroje spočítá model v node',
  nesedi === 0, `${nesedi} se rozchází:\n      ` + ukazky.join('\n      '));
pravda('a nikdy není menší než deset (pod to model verdikt nedává)',
  podDeset === 0, `${podDeset} pod deset:\n      ` + ukazky.join('\n      '));
/* Pojistka proti tomu, aby výjimka výš spolkla všechno: hlášek bez
   percentilu (podíl) smí být jen menšina prohlédnutých stránek. */
pravda(`hlášky bez percentilu (podíl) jsou menšina (${jine} z ${jine + sVerdiktem})`,
  jine < sVerdiktem, `${jine} vynecháno, jen ${sVerdiktem} změřeno — výjimka přerostla pravidlo`);

await browser.close();
console.log('\nZ kolika nabídek verdikt o ceně vyšel');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Vzorek verdiktu: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
process.exit(0);
