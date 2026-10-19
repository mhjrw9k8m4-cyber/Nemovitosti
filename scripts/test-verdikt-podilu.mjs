/* Test: verdikt u spoluvlastnického podílu nesmí tvrdit opak toho, co je
 * v datech.
 *
 * Spuštění: PW_CHROMIUM=…/chrome node scripts/test-verdikt-podilu.mjs
 *
 * NALEZENO MĚŘENÍM. U podílu stránka ukazuje vlastní verdikt místo
 * běžného srovnání s okolím — a ten verdikt všem podílům tvrdil:
 *
 *   „V ceně je pak jen zlomek pozemku, kdežto VÝMĚRA JE UVEDENÁ CELÁ —
 *    cena za metr proto vychází nízká sama od sebe a s celými pozemky
 *    se srovnat nedá."
 *
 * Jenže robot umí z textu inzerátu DOKÁZAT, že uložená výměra je už ta
 * podílová (příznak `vymera_podilu`, dvě nezávislé cesty v
 * scripts/parcely-z-textu.mjs), a v datech ho má 400 z 507 podílů,
 * tedy 79 %. Těm 400 tedy web radil nevěřit číslu, které je správné,
 * a ještě naznačoval, že pozemek je zlomek toho, co je napsáno.
 *
 * Cenový model ty dva případy rozlišuje odjakživa — zaMetrPopis má pro
 * každý svou větu. Rozešel se s ním jen verdikt o kus výš, a to je ta
 * nejvíc viditelná věta na stránce.
 *
 * Měří se na ČTYŘECH SKUTEČNÝCH STRÁNKÁCH (dvě z každé skupiny), a vždy
 * obojí: že se správná věta objeví, a že se ta druhá neobjeví.
 */
import { chromium } from 'playwright-core';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { mapaSouboru, nabidky } from './generate-parcel-pages.mjs';
import { hlasPad } from './zkouska-pad.mjs';

const KOREN = new URL('..', import.meta.url).pathname;
await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));
const BASE = 'http://127.0.0.1:8310';

let ok = 0, chyb = 0;
const zpravy = [];
/* A KDYŽ TO SPADNE, AŤ TO TAKY NĚCO ŘEKNE — viz scripts/zkouska-pad.mjs.
   Bez tohohle se při výjimce (chybějící prvek, timeout klepnutí) zahodí
   všechny kontroly, které do té chvíle prošly, a v CI zbyde jen stopa. */
hlasPad('Verdikt podílu', zpravy);
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* Stránky se vybírají z DAT, ne ze seznamu v testu: jména souborů se
   mění s každým během robota. */
const mapa = mapaSouboru(nabidky());
const podilove = [], cele = [];
for (const { d, soubor } of mapa.values()) {
  if (!d.podil || !existsSync(path.join(KOREN, soubor))) continue;
  (d.vymera_podilu ? podilove : cele).push({ d, soubor });
}

/* Pojistka proti bezzubosti: kdyby v datech jedna ze skupin nebyla,
   test by prošel, aniž by co změřil. */
pravda('v datech jsou podíly s podílovou výměrou', podilove.length >= 2, `je jich ${podilove.length}`);
pravda('i podíly, u kterých je výměra celé parcely', cele.length >= 2, `je jich ${cele.length}`);

/* STATICKÁ ČÁST A STRUKTUROVANÁ DATA. Tatáž nepravda byla na pěti
   místech, ne na jednom: ve verdiktu, v tabulce „Vlastnictví", u
   srovnání podílů v okolí, ve výhradě v JSON-LD (tu si opisuje
   vyhledávač do výsledku) a v souhrnu na stránkách okresů. Verdikt se
   měří v prohlížeči, tyhle čtou HOTOVÉ soubory — a čtou se obě skupiny,
   ať se neopraví jen jedna. */
for (const [skupina, kde] of [['podílová výměra', podilove], ['výměra celé parcely', cele]]) {
  for (const { soubor } of kde.slice(0, 2)) {
    const h = readFileSync(path.join(KOREN, soubor), 'utf8').replace(/\u00a0/g, ' ');
    const radek = (h.match(/<dd>spoluvlastnický podíl[^<]*<\/dd>/) || [''])[0];
    const vyhrada = (h.match(/Cena je za spoluvlastnický podíl[^"]*/) || [''])[0];
    if (kde === podilove) {
      pravda(`${soubor}: tabulka říká, že výměra je ta podílová`,
        /je ta podílová/.test(radek), `vyšlo „${radek}"`);
      pravda('  a výhrada ve strukturovaných datech taky',
        /je ta podílová/.test(vyhrada), `vyšlo „${vyhrada}"`);
    } else {
      pravda(`${soubor}: tabulka říká, že výměra je za celou parcelu`,
        /výměra za celou parcelu/.test(radek), `vyšlo „${radek}"`);
      pravda('  a výhrada ve strukturovaných datech taky',
        /patří celé parcele/.test(vyhrada), `vyšlo „${vyhrada}"`);
    }
  }
}
/* A nikde na stránce podílu s podílovou výměrou nesmí zůstat věta, která
   tvrdí opak — ať už ji napíše kterýkoli z generátorů. */
for (const { soubor } of podilove.slice(0, 6)) {
  const h = readFileSync(path.join(KOREN, soubor), 'utf8').replace(/\u00a0/g, ' ');
  pravda(`${soubor}: nikde netvrdí, že výměra je celé parcely`,
    !/výměra za celou parcelu|patří celé parcele|výměra je uvedená celá/.test(h),
    (h.match(/.{0,60}(?:výměra za celou parcelu|patří celé parcele|výměra je uvedená celá).{0,20}/) || [''])[0]);
}

const LEAFLET = process.env.PK_LEAFLET_DIR || '';
const PRAZDNA = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64');
const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));
const ctx = await prohlizec.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 900 } });
await ctx.route('**/*', (r) => {
  const u = new URL(r.request().url());
  if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') return r.continue();
  if (r.request().resourceType() === 'image') return r.fulfill({ status: 200, contentType: 'image/png', body: PRAZDNA });
  return LEAFLET ? r.abort() : r.continue();
});
if (LEAFLET) {
  await ctx.route('https://unpkg.com/leaflet@**', (r) => {
    const f = path.join(LEAFLET, path.basename(new URL(r.request().url()).pathname));
    if (!existsSync(f)) return r.abort();
    return r.fulfill({ status: 200, contentType: f.endsWith('.css') ? 'text/css' : 'text/javascript', body: readFileSync(f) });
  });
}

async function verdikt(soubor) {
  const p = await ctx.newPage();
  const chyby = [];
  p.on('pageerror', (e) => chyby.push(String(e)));
  await p.goto(`${BASE}/${soubor}`, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('#pz-verdict .pv-text', { timeout: 30000 }).catch(() => {});
  const t = await p.evaluate(() => {
    const v = document.querySelector('#pz-verdict');
    return v ? v.textContent.replace(/\s+/g, ' ').trim() : '';
  });
  await p.close();
  return { t, chyby };
}

try {
  for (const { d, soubor } of podilove.slice(0, 2)) {
    const { t, chyby } = await verdikt(soubor);
    pravda(`${soubor}: verdikt o podílu se ukáže`, /spoluvlastnick/i.test(t), `vyšlo „${t.slice(0, 120)}"`);
    pravda('  a říká, že výměra je ta podílová',
      /výměra je <?ta podílová|je ta podílová/i.test(t), `vyšlo „${t.slice(0, 200)}"`);
    pravda('  a NETVRDÍ, že je uvedená celá',
      !/výměra je uvedená celá/i.test(t), `vyšlo „${t.slice(0, 200)}"`);
    pravda('  a nespadl u toho skript', chyby.length === 0, chyby[0]);
  }
  for (const { d, soubor } of cele.slice(0, 2)) {
    const { t, chyby } = await verdikt(soubor);
    pravda(`${soubor}: verdikt o podílu se ukáže`, /spoluvlastnick/i.test(t), `vyšlo „${t.slice(0, 120)}"`);
    pravda('  a říká, že výměra je uvedená celá',
      /výměra je uvedená celá/i.test(t), `vyšlo „${t.slice(0, 200)}"`);
    pravda('  a NETVRDÍ, že je podílová',
      !/je ta podílová/i.test(t), `vyšlo „${t.slice(0, 200)}"`);
    pravda('  a nespadl u toho skript', chyby.length === 0, chyby[0]);
  }
  zpravy.push(`  · naměřeno: ${podilove.length} podílů s podílovou výměrou,`
    + ` ${cele.length} s výměrou celé parcely (z ${podilove.length + cele.length} podílů)`);
} catch (e) {
  chyb++;
  zpravy.push('  ✕ zkouška spadla: ' + (e && e.message));
}

await ctx.close();
await prohlizec.close();
console.log('\nVerdikt u spoluvlastnického podílu');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Verdikt podílu: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
process.exit(0);
