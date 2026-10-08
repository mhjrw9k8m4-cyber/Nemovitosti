/* Test: počet nepřečtených visí na záložce Zprávy na celém účtu.
   ==================================================================
   Spuštění: node scripts/test-odznak-zprav.mjs
     (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=…/chrome)

   PROČ. Účet má tři záložky a číslo nepřečtených bylo jen na dlaždici
   v profilu — tedy na jedné ze tří stránek, a i tam až po sjetí dolů.
   Kdo zrovna spravoval hlídání, o nové zprávě se nedozvěděl. Zájemce
   o pozemek přitom píše právě sem a rychlá odpověď prodává.

   Co se měří:
     1. odznak je na VŠECH třech stránkách účtu (profil, hlídání,
        zprávy), ne jen tam, kde se to zrovna hodí;
     2. nese správné číslo — součet nepřečtených přes vlákna;
     3. při nule se nevykreslí vůbec (prázdný kroužek by lhal);
     4. ze stránky jde JEDEN dotaz na my_threads, ne dva (profil
        potřebuje totéž číslo pro dlaždici a půjčuje si ho);
     5. čtečka u něj slyší větu, ne holou číslovku u slova „Zprávy".

   Bez bodu 3 by prošla i podoba, která kroužek maluje pořád; bez
   bodu 2 by prošla i podoba, která do něj píše cokoli.
   ================================================================== */
import { chromium } from 'playwright-core';
import { UID_MAJITEL } from './falesna-supabase-chat.mjs';

await new Promise((r) => setTimeout(r, 300));
const BASE = 'http://127.0.0.1:8310';
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

const PW = process.env.PW_CHROMIUM;
const browser = await chromium.launch(PW ? { executablePath: PW } : {});

/** Otevře stránku účtu s podstrčeným seznamem vláken. */
async function ucet(stranka, vlakna) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.addInitScript(([u]) => {
    const t = 'tok-' + u;
    localStorage.setItem('pk_auth', JSON.stringify({
      access_token: t, refresh_token: t.replace('tok-', 'ref-'),
      user: { id: u, email: u + '@test.cz' },
    }));
  }, [UID_MAJITEL]);
  let dotazu = 0;
  await page.route('**/rest/v1/rpc/my_threads*', (r) => {
    dotazu++;
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(vlakna) });
  });
  await page.goto(`${BASE}/${stranka}`, { waitUntil: 'load' });
  await page.waitForTimeout(2200);
  const v = await page.evaluate(() => {
    const a = document.querySelector('.uc-taby a[href="zpravy.html"]');
    const o = document.getElementById('uc-tab-pocet');
    const vidno = (e) => {
      if (!e) return false;
      const r = e.getBoundingClientRect(), s = getComputedStyle(e);
      return !e.hidden && s.display !== 'none' && s.visibility !== 'hidden' && r.height > 0 && r.width > 0;
    };
    return {
      zalozka: !!a, odznak: vidno(o),
      text: o ? (o.textContent || '').trim() : null,
      popis: o ? o.getAttribute('aria-label') : null,
      popisOdkazu: a ? a.getAttribute('aria-describedby') : null,
      dlazdice: (document.getElementById('pf-zpravy') || {}).textContent || null,
    };
  });
  v.dotazu = dotazu;
  await ctx.close();
  return v;
}

const TRI = [{ listing_id: 'a', buyer_id: 'b', last_at: '2026-10-08', unread: 2 },
             { listing_id: 'c', buyer_id: 'd', last_at: '2026-10-08', unread: 1 }];
const NULA = [{ listing_id: 'a', buyer_id: 'b', last_at: '2026-10-08', unread: 0 }];

for (const s of ['muj-inzerat.html', 'hlidani.html', 'zpravy.html']) {
  const v = await ucet(s, TRI);
  pravda(`${s}: pás záložek účtu tam je`, v.zalozka, 'záložka Zprávy se nenašla — zbytek by měřil prázdno');
  pravda(`${s}: odznak je vidět`, v.odznak, 'odznak s počtem chybí');
  pravda(`${s}: a říká 3 (2 + 1 přes dvě vlákna)`, v.text === '3', `stojí tam „${v.text}"`);
  pravda(`${s}: čtečka slyší větu („${v.popis}")`,
    /nepřečten/.test(String(v.popis)) && v.popisOdkazu === 'uc-tab-pocet',
    `aria-label „${v.popis}", aria-describedby „${v.popisOdkazu}"`);
  pravda(`${s}: dotaz na vlákna šel jednou (${v.dotazu}×)`, v.dotazu === 1,
    `${v.dotazu} dotazů — stejné číslo se tahá vícekrát`);
}

/* Profilová dlaždice si bere TÝŽ výsledek. */
const prof = await ucet('muj-inzerat.html', TRI);
pravda(`profil: dlaždice „Nepřečtené zprávy" nese 3 (${prof.dlazdice})`,
  String(prof.dlazdice).trim() === '3', `stojí tam „${prof.dlazdice}"`);

/* Nula = žádný kroužek. */
const nula = await ucet('hlidani.html', NULA);
pravda('při nule se odznak nevykreslí', !nula.odznak,
  `je vidět a stojí v něm „${nula.text}" — prázdný kroužek lže o tom, že něco čeká`);

await browser.close();
console.log('\nOdznak nepřečtených na záložce Zprávy');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Odznak zpráv: ' + chyb + ' kontrol neprošlo.'); process.exit(1); }
process.exit(0);
