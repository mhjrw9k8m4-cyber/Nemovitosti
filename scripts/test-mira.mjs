/* MÍRA SAZBY: kolik znaků je na řádku odstavce.
 *
 * Spuštění: node scripts/test-mira.mjs
 *   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome)
 *
 * PROČ TOHLE VŮBEC MĚŘIT. Délka řádku je jediná typografická míra, která
 * se dá splést s velkorysostí: čím širší sloupec, tím „vzdušněji" návrh
 * vypadá na snímku — a tím hůř se čte. Nad devadesát znaků oko na konci
 * řádku ztrácí, kde začít další, a čte tentýž řádek dvakrát. Čitelné
 * optimum je 60–75.
 *
 * Změřeno 13. 10. na monitoru 1440 px, PŘED opravou: 91 až 187 znaků.
 * Nejhorší byla poznámka pod metodikou cen — 13px písmo přes 1136 px,
 * tedy 187 znaků na řádek. Text článků měl 91–98. Token --m-text:62ch
 * přitom existoval a byl použitý na dvaceti místech; jen ne tam, kde se
 * text opravdu táhl. Po nasazení: medián 72–85, maximum 89.
 *
 * MĚŘÍ SE OPRAVDOVÁ ŠÍŘKA ZNAKU, ne odhad z font-size. Střední šířka se
 * změří v canvasu v tom písmu, které ten odstavec má — jinak by zkouška
 * u úzkého písma hlásila chybu, která tam není, a u širokého by ji
 * minula. Krátké odstavce (pod 90 znaků textu) se přeskakují: na nich
 * se délka řádku neprojeví.
 */
import { chromium } from 'playwright-core';
await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const BASE = 'http://127.0.0.1:8310';
/* Mez je 90. Není to optimum (to je 75), je to strop, za kterým čtení
   měřitelně trpí. Mediány po opravě sedí na 80, takže mez má rezervu
   a nepadne na jednom slově navíc. */
const MEZ = 90;
/* Stránky s dlouhým textem — rádcovské, právní a výpisové. Na kartách
   a ve formulářích se dlouhý odstavec nevyskytuje, tam není co měřit. */
const STRANKY = ['cena-pozemku.html', 'data.html', 'drazby-pozemku.html',
  'drazby-pozemku-nabidky.html', 'exekuce-pozemku.html', 'hypoteka-na-pozemek.html',
  'kolik-stoji-koupe-pozemku.html', 'kupni-smlouva-pozemek.html',
  'list-vlastnictvi-katastr.html', 'moje-data.html', 'muj-inzerat.html',
  'na-co-mam-pozemek.html', 'nove-pozemky.html', 'ochrana-udaju.html',
  'odhlasit-maily.html', 'podminky.html', 'porovnani.html', 'pravidla-inzerce.html',
  'pristupova-cesta-pozemek.html', 'stavebni-vs-zemedelsky-pozemek.html',
  'uzemni-plan-pozemek.html', 'vecne-bremeno-pozemek.html', 'index.html',
  'pozemky-okres-tabor.html', 'pozemky-stredocesky-kraj.html', 'pozemky-do-500-tisic.html'];

const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));

const dlouhe = [];
let zmereno = 0, stranek = 0;
for (const s of STRANKY) {
  const ctx = await prohlizec.newContext({ serviceWorkers: 'block', viewport: { width: 1440, height: 900 } });
  await ctx.route('**/config.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript',
    body: `window.PK_SUPABASE_URL='${BASE}';window.PK_SUPABASE_KEY='anon';` }));
  const p = await ctx.newPage();
  await p.goto(`${BASE}/${s}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  /* ČEKÁ SE NA PÍSMO, ne jen na čas. Inter je vlastní webfont
     (fonts/inter-latin*.woff2). Dokud se nenačte, kreslí prohlížeč
     v záložním Arialu — a ten je širší, takže se do téže šířky vejde
     MÍŇ znaků… jenže canvas, kterým se měří střední šířka znaku, taky
     ještě Inter nezná, a tak naměří Arial. Výsledek pak vychází o dva
     až tři znaky výš a je jiný místně a jiný v CI: 13. 10. kvůli tomu
     zkouška v CI nahlásila .okr-more s 91 znaky, zatímco místně vyšlo
     89. Nebyla to vada sazby, byl to závod. */
  await p.evaluate(() => document.fonts.ready).catch(() => {});
  await p.waitForTimeout(1400);
  const v = await p.evaluate(() => {
    const jm = (e) => (typeof e.className === 'string' && e.className.trim()
      ? '.' + e.className.trim().split(/\s+/)[0] : e.tagName.toLowerCase());
    const cv = document.createElement('canvas').getContext('2d');
    const out = [];
    for (const e of document.querySelectorAll('main p, main li')) {
      const t = (e.textContent || '').trim();
      if (t.length < 90) continue;
      const r = e.getBoundingClientRect();
      if (r.width < 100) continue;
      const c = getComputedStyle(e);
      if (c.visibility === 'hidden' || c.display === 'none') continue;
      cv.font = `${c.fontWeight} ${c.fontSize} ${c.fontFamily}`;
      const vzorek = t.slice(0, 200);
      const sirka = cv.measureText(vzorek).width / vzorek.length;
      if (!sirka) continue;
      const vnitrni = r.width - parseFloat(c.paddingLeft) - parseFloat(c.paddingRight);
      out.push({ znaku: Math.round(vnitrni / sirka), kde: jm(e), fs: c.fontSize, sirka: Math.round(r.width) });
    }
    return out;
  });
  if (v.length) stranek++;
  zmereno += v.length;
  for (const x of v) if (x.znaku > MEZ) dlouhe.push(Object.assign({ stranka: s }, x));
  await ctx.close();
}
await prohlizec.close();

console.log(`\nMíra sazby (strop ${MEZ} znaků na řádek)`);
console.log(`  změřeno ${zmereno} dlouhých odstavců na ${stranek} stránkách`);

/* PŘEDPOKLAD: opravdu se měřilo. Kdyby se stránky nenačetly nebo se
   změnila značka, zkouška by bez tohohle hlásila „všechno v pořádku"
   a přitom by se na žádný odstavec nepodívala. */
if (zmereno < 100 || stranek < 15) {
  console.error(`::error::Míra sazby: změřilo se jen ${zmereno} odstavců na ${stranek} stránkách `
    + '— to je málo na to, aby to něco znamenalo. Nejčastější důvod: stránky se nenačetly '
    + 'nebo se změnila značka odstavců. Kontrola by mlčela o celém textu webu.');
  process.exit(1);
}

if (!dlouhe.length) {
  console.log(`  ✓ žádný odstavec nemá přes ${MEZ} znaků na řádku\n`);
  process.exit(0);
}
const nej = dlouhe.sort((a, b) => b.znaku - a.znaku);
for (const x of nej.slice(0, 12)) {
  console.log(`  ✕ ${String(x.znaku).padStart(3)} znaků  ${x.kde} (${x.fs}, ${x.sirka}px) · ${x.stranka}`);
}
console.error(`::error::Míra sazby: ${dlouhe.length} odstavců přes ${MEZ} znaků na řádku. `
  + `Co padlo: ${nej.slice(0, 4).map((x) => `${x.kde} ${x.znaku} znaků na ${x.stranka}`).join(' | ')}`
  + '. Oprava je max-width:var(--m-text) na tom prvku — 62ch dává stejný počet znaků u 13px i 16px písma.');
process.exit(1);
