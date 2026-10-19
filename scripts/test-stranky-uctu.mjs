/* Test: stránky účtu stojí na středu, ne přilepené k levému okraji.
   ==================================================================
   Spuštění: node scripts/test-stranky-uctu.mjs
     (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=…/chrome)

   PROČ TOHLE VZNIKLO. Naměřeno na 1440 px: na „Můj profil", „Zprávy"
   i „Hlídání" stála hlavní karta na x 152–592 a napravo od ní zbývalo
   696 px prázdné stránky — skoro polovina okna. Vedle ní přitom NIC
   nebylo (změřeno: nula prvků za x 640), takže to nebyl dvousloupcový
   rozvrh, ale telefonní stránka roztažená na monitor.

   CO SE MĚŘÍ. Že je obsah vystředěný — tedy že prázdno vlevo a vpravo
   je zhruba stejné. Ne pevná čísla: text se mění a pevná by padala.
   A zvlášť se hlídá stránka „Přidat pozemek", kde se středit NEMÁ:
   tam je vedle karty panel s tipy a karta patří k jeho hornímu rohu.
   ================================================================== */
import { chromium } from 'playwright-core';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { hlasPad } from './zkouska-pad.mjs';

await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const BASE = 'http://127.0.0.1:8310';
const SIRKA = 1440;
const UCET = ['muj-inzerat.html', 'zpravy.html', 'hlidani.html'];
const SLOUPCOVE = ['pridat.html', 'inzerce.html'];

let ok = 0, chyb = 0;
const zpravy = [];
/* A KDYŽ TO SPADNE, AŤ TO TAKY NĚCO ŘEKNE — viz scripts/zkouska-pad.mjs.
   Bez tohohle se při výjimce (chybějící prvek, timeout klepnutí) zahodí
   všechny kontroly, které do té chvíle prošly, a v CI zbyde jen stopa. */
hlasPad('Stránky účtu', zpravy);
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
function hotovo(spadlo) {
  console.log('\nStránky účtu');
  console.log(zpravy.join('\n'));
  if (spadlo) console.log('  ✕ zkouška spadla dřív, než dojela:\n      ' + String(spadlo).split('\n')[0]);
  console.log(`\n${ok} v pořádku, ${chyb + (spadlo ? 1 : 0)} chyb\n`);
  if (chyb || spadlo) {
    console.log('::error::Stránky účtu: ' + (chyb + (spadlo ? 1 : 0)) + ' kontrol neprošlo.' + pricinaChyb(zpravy));
    process.exit(1);
  }
  process.exit(0);
}

/* Hlavní blok stránky: největší viditelný rámeček, který není celoplošný
   pás. Hledá se na stránce, ne podle názvu třídy — tři stránky účtu mají
   tři různé (.auth-card, .zp-auth, .hl-ukazka) a čtvrtá bude mít čtvrtou. */
async function hlavniBlok(p) {
  return p.evaluate(() => {
    let nej = null, plocha = 0;
    for (const e of document.querySelectorAll('main div, main section, main form')) {
      const r = e.getBoundingClientRect(); const st = getComputedStyle(e);
      if (r.top + window.scrollY > 1400 || r.height < 80 || r.width < 120 || r.width > 1100) continue;
      if (st.visibility === 'hidden' || st.display === 'none') continue;
      const ramecek = st.borderTopWidth !== '0px' || st.boxShadow !== 'none'
        || st.backgroundColor !== 'rgba(0, 0, 0, 0)';
      if (!ramecek) continue;
      const pl = r.width * Math.min(r.height, 900);
      if (pl > plocha) { plocha = pl; nej = e; }
    }
    if (!nej) return null;
    const r = nej.getBoundingClientRect();
    return { l: Math.round(r.left), r: Math.round(r.right), tridy: String(nej.className).slice(0, 30),
      vpravoOdNej: Array.from(document.querySelectorAll('main *')).filter((e) => {
        const b = e.getBoundingClientRect(); const s = getComputedStyle(e);
        return b.left > r.right + 40 && b.height > 20 && b.width > 60 && b.width < 1100
          && s.visibility !== 'hidden' && s.display !== 'none' && b.top + window.scrollY < 1600;
      }).length };
  });
}

const prohlizec = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || undefined,
  args: ['--no-sandbox'],
});
try {
  const ctx = await prohlizec.newContext({
    viewport: { width: SIRKA, height: 900 }, serviceWorkers: 'block', locale: 'cs-CZ',
  });
  const p = await ctx.newPage();
  const krive = [], chybi = [];
  for (const stranka of UCET) {
    await p.goto(BASE + '/' + stranka, { waitUntil: 'load' });
    await p.waitForTimeout(900);
    const m = await hlavniBlok(p);
    if (!m) { chybi.push(stranka); continue; }
    /* Vedle hlavního bloku nesmí nic stát — jinak je to sloupcový
       rozvrh a vystředění by bylo chybné. Když tam něco je, stránka
       do téhle kontroly nepatří a je to nález sám o sobě. */
    if (m.vpravoOdNej > 0) { krive.push(`${stranka}: vedle bloku stojí ${m.vpravoOdNej} prvků — není to stránka na střed`); continue; }
    const vlevo = m.l, vpravo = SIRKA - m.r;
    if (Math.abs(vlevo - vpravo) > 40) {
      krive.push(`${stranka}: vlevo ${vlevo} px, vpravo ${vpravo} px (blok ${m.l}–${m.r}, ${m.tridy})`);
    }
  }
  pravda('je co měřit — hlavní blok se našel na všech stránkách účtu',
    chybi.length === 0, 'nenašel se na: ' + chybi.join(', '));
  pravda('„Můj profil", „Zprávy" i „Hlídání" mají obsah na středu',
    krive.length === 0, krive.join('\n      '));

  /* Past na opravu, která by vystředila i to, co se středit nemá. */
  const spatneVystredene = [];
  for (const stranka of SLOUPCOVE) {
    await p.goto(BASE + '/' + stranka, { waitUntil: 'load' });
    await p.waitForTimeout(900);
    const m = await hlavniBlok(p);
    if (!m) continue;
    if (m.vpravoOdNej === 0) { spatneVystredene.push(`${stranka}: vedle karty zmizel postranní panel`); continue; }
    if (m.l > 260) spatneVystredene.push(`${stranka}: karta se odsunula na x ${m.l} — má zůstat u levého okraje vedle panelu`);
  }
  pravda('a „Přidat pozemek" si kartu nechává vlevo vedle panelu s tipy',
    spatneVystredene.length === 0, spatneVystredene.join('\n      '));
  await ctx.close();
} catch (e) {
  try { await prohlizec.close(); } catch (e2) {}
  hotovo(e);
}
await prohlizec.close();
hotovo();
