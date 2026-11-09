/* Test: odznak u ceny a verdikt o ceně říkají totéž.
 * ====================================================================
 * Spuštění: node scripts/test-cenovy-stupen.mjs
 *   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta)
 *
 * PROČ. Verdikt o ceně je jediné, co tenhle web o nabídce ví a zdroj
 * ne — a ležel pod ohybem. Naměřeno 27. 10. na telefonu 390×844 na
 * vzorku 24 stránek pozemků: verdikt má 15 z nich a začíná průměrně
 * na y = 1 157 px, kdežto cena stojí na 580. Od té doby nese jedno
 * slovo z verdiktu odznak hned u ceny (změřeno znovu: y = 673, tedy
 * na první obrazovce) a odkazuje na celou větu o kus níž.
 *
 * A PRÁVĚ PROTO TAHLE ZKOUŠKA. Dvě místa, která mluví o jedné věci,
 * se dřív nebo později rozejdou — u ceny bude stát „Výhodná cena"
 * a o dvě obrazovky níž „Dražší než 78 %". Rozhodnutí proto dělá
 * jediná funkce (cenovyStupen v js/pozemek.js) a tahle zkouška hlídá
 * výsledek: slovo na odznaku se musí DOSLOVA rovnat slovu na
 * verdiktu, a odznak musí být právě tam, kde je verdikt — ani jeden
 * bez druhého.
 *
 * CO TAHLE ZKOUŠKA NEUHLÍDÁ. Jestli je verdikt spočítaný správně;
 * to je práce scripts/test-ceny.mjs a modelu v js/ceny.js. Tady se
 * měří jen to, že se dvě místa na stránce shodnou.
 */
import { chromium } from 'playwright-core';
import path from 'node:path';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { hlasPad } from './zkouska-pad.mjs';
import { zivyVzorek } from './vzorek-pozemku.mjs';

const { BASE } = await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const KOREN = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const OBRAZOVKA = 844;   // iPhone 390×844, na kterém se měřilo
const DOTYK = 44;

let ok = 0, chyb = 0;
const zpravy = [];
hlasPad('Cenový stupeň', zpravy);
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* Vzorek se rozprostře po abecedě, ne po prvních deseti souborech:
   stránky jsou pojmenované po okresech, takže prvních deset je deset
   nabídek z Benešova a o zbytku republiky by zkouška nevěděla nic.

   DVACET, NE DVANÁCT — a není to z opatrnosti, je to z měření.
   Verdikt o ceně nedostane každá nabídka: u podílů bez výměry se
   nepíše. Na třiceti živých stránkách rozprostřených po abecedě jich
   verdikt mělo 21, tedy 70 %; při dvaceti vychází kolem čtrnácti,
   takže mez pěti zůstává. Mez se nesnižuje: snížit ji by znamenalo,
   že kontroly výš smějí měřit míň.

   A VZOREK JE ZE ŽIVÝCH STRÁNEK, ne z celé abecedy. Vyřazená stránka
   nabídku nevykresluje, takže na ní není ani odznak, ani verdikt — a
   vyřazených je dnes víc než živých (9. 11. 2026: 9 241 z 12 674, tedy
   73 %). Rozprostřený krok přes VŠECHNY soubory proto padal na archiv
   a naměřil 3 stránky s verdiktem z 20; na webu přitom nebylo nic
   rozbitého. Výběr živých je v scripts/vzorek-pozemku.mjs, na jednom
   místě pro všechny zkoušky. */
const VZOREK = zivyVzorek(20);

const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] },
  kde ? { executablePath: kde } : {}));
const ctx = await prohlizec.newContext({ bypassCSP: true, serviceWorkers: 'block',
  viewport: { width: 390, height: OBRAZOVKA }, deviceScaleFactor: 1,
  isMobile: true, hasTouch: true, locale: 'cs-CZ' });
/* Ven se nechodí — model i data jsou v repozitáři a mapové dlaždice
   by zkoušku jen zdržely. */
await ctx.route('**/*', (r) => {
  const u = new URL(r.request().url());
  return (u.hostname === '127.0.0.1' || u.hostname === 'localhost') ? r.continue() : r.abort();
});

let sVerdiktem = 0, naPrvni = 0;
const p = await ctx.newPage();
for (const s of VZOREK) {
  const nactena = await p.goto(`${BASE}/${s}`, { waitUntil: 'domcontentloaded' })
    .then((r) => r && r.ok()).catch(() => false);
  if (!nactena) { pravda(`${s} se načetla`, false, 'stránka nedojela'); continue; }
  await p.waitForTimeout(1800);

  const v = await p.evaluate(() => {
    const odznak = document.querySelector('.pz-stupen');
    const slovoO = document.querySelector('.pz-stupen-t');
    const slovoV = document.querySelector('#pz-verdict .pv-badge');
    const cil = odznak ? document.querySelector(odznak.getAttribute('href') || '#nic') : null;
    const r = odznak ? odznak.getBoundingClientRect() : null;
    return { maOdznak: !!odznak, maVerdikt: !!slovoV,
      slovoO: slovoO ? slovoO.textContent.trim() : null,
      slovoV: slovoV ? slovoV.textContent.trim() : null,
      cil: !!cil, odkaz: odznak ? odznak.getAttribute('href') : null,
      y: r ? Math.round(r.top + window.pageYOffset) : null,
      vyska: r ? Math.round(r.height) : null };
  });

  pravda(`${s}: odznak je právě tam, kde je verdikt`, v.maOdznak === v.maVerdikt,
    `odznak ${v.maOdznak}, verdikt ${v.maVerdikt} — jedno bez druhého nedává smysl`);
  if (!v.maOdznak) continue;
  sVerdiktem++;
  pravda(`${s}: a říká doslova totéž co verdikt`, v.slovoO === v.slovoV,
    `u ceny „${v.slovoO}", ve verdiktu „${v.slovoV}"`);
  pravda(`${s}: odkaz z odznaku někam vede`, v.cil === true, `href „${v.odkaz}"`);
  pravda(`${s}: dá se na něj klepnout`, v.vyska >= DOTYK, `${v.vyska} px, mez ${DOTYK}`);
  if (v.y < OBRAZOVKA) naPrvni++;
  else console.log(`      ! ${s}: odznak až na y = ${v.y} px (mez ${OBRAZOVKA})`);
}
await p.close();

// PŘEDPOKLAD: bez stránek s verdiktem by kontroly výš prošly naprázdno
pravda('ve vzorku je aspoň pět stránek s verdiktem o ceně', sVerdiktem >= 5,
  `${sVerdiktem} z ${VZOREK.length}`);
/* A TEĎ TO, KVŮLI ČEMU ODZNAK VZNIKL. Kdyby se někdy posunul pod
   ohyb, celá změna by byla k ničemu a nic jiného by to nepoznalo. */
pravda('a odznak je na každé z nich na první obrazovce',
  sVerdiktem > 0 && naPrvni === sVerdiktem,
  `na první obrazovce ${naPrvni} z ${sVerdiktem} (obrazovka ${OBRAZOVKA} px)`);

await ctx.close();
await prohlizec.close();
console.log('\nCenový stupeň u ceny');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Cenový stupeň: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy));
  process.exit(1);
}
process.exit(0);
