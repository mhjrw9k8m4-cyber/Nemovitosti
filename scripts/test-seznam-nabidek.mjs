/* Test: názvy obcí v seznamu nabídek stojí na jedné svislici.
   ==================================================================
   Spuštění: node scripts/test-seznam-nabidek.mjs
     (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=…/chrome)

   PROČ TOHLE VZNIKLO. Naměřeno na pozemky-stavebni.html, prvních
   14 řádků: levý okraj názvu měl TŘI různé hodnoty — 195, 266 a 273 px.
   Rozdíl 78 px uvnitř jednoho seznamu, kde pod sebou stojí „Jizerní
   Vtelno" a o dva řádky níž odsazené „Lovosice".

   Příčina: každý řádek je vlastní mřížka a sloupec s odznakem byl
   `auto`. Řádek bez odznaku ho zúžil na nulu, s „Dražba" na 71 px,
   s „Exekuce" na 78 — a mřížky spolu nemluví. Na stránkách s jedním
   druhem nabídky to vidět nebylo (odznak mají všechny řádky nebo žádný);
   vylézalo to na přehledech, kde se druhy míchají.

   CO SE MĚŘÍ. Jedna věc, a výsledek, ne zápis: v každém seznamu musí
   mít všechny názvy TÝŽ levý okraj. Stránky se berou takové, kde se
   druhy míchají — na jednodruhové by kontrola prošla i rozbitá.
   ================================================================== */
import { chromium } from 'playwright-core';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { hlasPad } from './zkouska-pad.mjs';

await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const BASE = 'http://127.0.0.1:8310';
const STRANKY = ['pozemky-stavebni.html', 'pozemky-lesni.html',
  'pozemky-do-1-milionu.html', 'pozemky-stredocesky-kraj.html'];

let ok = 0, chyb = 0;
const zpravy = [];
/* A KDYŽ TO SPADNE, AŤ TO TAKY NĚCO ŘEKNE — viz scripts/zkouska-pad.mjs.
   Bez tohohle se při výjimce (chybějící prvek, timeout klepnutí) zahodí
   všechny kontroly, které do té chvíle prošly, a v CI zbyde jen stopa. */
hlasPad('Seznam nabídek', zpravy);
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
function hotovo(spadlo) {
  console.log('\nSeznam nabídek na vstupní stránce');
  console.log(zpravy.join('\n'));
  if (spadlo) console.log('  ✕ zkouška spadla dřív, než dojela:\n      ' + String(spadlo).split('\n')[0]);
  console.log(`\n${ok} v pořádku, ${chyb + (spadlo ? 1 : 0)} chyb\n`);
  if (chyb || spadlo) {
    console.log('::error::Seznam nabídek: ' + (chyb + (spadlo ? 1 : 0)) + ' kontrol neprošlo.' + pricinaChyb(zpravy));
    process.exit(1);
  }
  process.exit(0);
}

const prohlizec = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || undefined,
  args: ['--no-sandbox'],
});
try {
  const ctx = await prohlizec.newContext({
    viewport: { width: 1440, height: 900 }, serviceWorkers: 'block', locale: 'cs-CZ',
  });
  const p = await ctx.newPage();
  const krive = [], prazdne = [], prelite = [];
  let sOdznaky = 0, radkuCelkem = 0;
  for (const stranka of STRANKY) {
    await p.goto(BASE + '/' + stranka, { waitUntil: 'load' });
    await p.waitForTimeout(500);
    const m = await p.evaluate(() => {
      const out = [];
      for (const seznam of document.querySelectorAll('.okr-list')) {
        const mista = [...seznam.querySelectorAll('.okr-item .okr-place')]
          .map((e) => Math.round(e.getBoundingClientRect().left));
        /* Odznak se nesmí přelít do názvu. Sloupec je pevný, takže
           kdyby ho někdo zúžil pod šířku slova „Exekuce", názvy by
           pořád stály na svislici — jen by přes ně ležel odznak.
           Zarovnání a nepřekrývání jsou dvě různé otázky. */
        let prekryv = 0;
        for (const polozka of seznam.querySelectorAll('.okr-item')) {
          const z = polozka.querySelector('.okr-badge');
          const m = polozka.querySelector('.okr-place');
          if (!z || !m) continue;
          if (Math.round(z.getBoundingClientRect().right) > Math.round(m.getBoundingClientRect().left)) prekryv++;
        }
        out.push({ pocet: mista.length, prekryv,
          odznaku: seznam.querySelectorAll('.okr-badge').length,
          ruznych: [...new Set(mista)].length,
          min: mista.length ? Math.min(...mista) : null,
          max: mista.length ? Math.max(...mista) : null });
      }
      return out;
    });
    if (!m.length || !m.some((s) => s.pocet >= 5)) { prazdne.push(stranka); continue; }
    for (const s of m) {
      if (s.pocet < 2) continue;
      radkuCelkem += s.pocet;
      if (s.odznaku > 0) sOdznaky++;
      if (s.ruznych !== 1) {
        krive.push(`${stranka}: ${s.ruznych} různých levých okrajů (${s.min}–${s.max} px) na ${s.pocet} řádcích`);
      }
      if (s.prekryv) {
        prelite.push(`${stranka}: ${s.prekryv} odznaků zasahuje do názvu`);
      }
    }
  }
  pravda('je co měřit — seznamy nabídek se našly a nejsou prázdné',
    prazdne.length === 0 && radkuCelkem >= 40,
    `bez seznamu: ${prazdne.join(', ') || '—'}; řádků celkem ${radkuCelkem}`);
  /* Past na kontrolu, která by platila jen díky tomu, že se zkouší
     stránky bez odznaků. Tam jsou okraje stejné samy od sebe a chyba
     by prošla. */
  pravda('a aspoň jeden z nich odznaky opravdu obsahuje',
    sOdznaky >= 1, 'žádný zkoušený seznam neměl odznak — kontrola by nic neřešila');
  pravda('názvy obcí v každém seznamu stojí na jedné svislici',
    krive.length === 0, krive.join('\n      '));
  pravda('a odznak „Dražba" ani „Exekuce" do názvu nezasahuje',
    prelite.length === 0, prelite.join('\n      '));
  await ctx.close();
} catch (e) {
  try { await prohlizec.close(); } catch (e2) {}
  hotovo(e);
}
await prohlizec.close();
hotovo();
