// Velikost dotykových terčů na mobilu.
//
// Spuštění: node scripts/test-dotyk.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome)
//
// Norma sice propustí i drobné tlačítko, ale palec ne. Právě tohle dělá
// rozdíl mezi „web funguje" a „web se dobře ovládá": hamburger měl 36×28,
// filtry 30 px na výšku a rychlé hodnoty 26 px.
//
// Měří se JEN samostatná tlačítka a odkazy. Odkaz uvnitř věty se zvětšit
// nedá a nemá — na ten se míří jinak než na tlačítko.
import { chromium } from 'playwright-core';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const BASE = 'http://127.0.0.1:8310';
const LEAFLET = process.env.PK_LEAFLET_DIR || '';
/* hlidani.html je tu kvůli přepínači „Posílat e-mailem": vykresluje se
   jen přihlášenému a jen se zapnutou vlajkou, takže by se bez obojího
   nikdy nezměřil — a právě on byl pod normou. */
const STRANKY = ['index.html', 'pridat.html', 'pozemky-okres-tabor.html', 'upozorneni.html',
  'kontakt.html', 'hlidani.html'];
/* MEZ JE 44 — tedy norma, ne sleva z ní. Stála tu 36 s poznámkou
   „nižší než doporučených 44, ale vyšší než dnešní stav": ráčna nasazená
   proto, aby aspoň něco držela, dokud se web nespraví.
   Změřeno na mobilu 390×844 na pěti stránkách: ze 110 dotykových terčů
   bylo pod 44 px jen 48, a byla to právě dvě tlačítka nad fotkou karty,
   každé jednou na kartu — ✕ „skrýt" 28 px a ♥ „uložit" 36 px. Všechno
   ostatní normu splňovalo už dřív. Obojí je teď 44 px (viditelný kroužek
   zůstal menší, roste jen plocha pro prst), takže mez může být pravdivá. */
const MIN = 44;

const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));

const male = new Map();
let zaskrtavatek = 0;
for (const s of STRANKY) {
  /* DOTYKOVÉ ZAŘÍZENÍ, ne jen úzké okno. Bez hasTouch/isMobile neplatí
     pravidla @media (hover:none) — tedy zrovna ta, která terče na dotyk
     zvětšují. Test by pak měřil podobu pro myš a hlásil chyby, které na
     mobilu nejsou (a naopak by minul ty, které tam jsou). */
  const ctx = await prohlizec.newContext({ viewport: { width: 390, height: 844 },
    hasTouch: true, isMobile: true });
  // Bez Leafletu se skript mapy ukončí dřív, než vykreslí karty nabídek —
  // a jejich tlačítka (srdíčko) by se tím vůbec nezměřila. Je-li po ruce
  // místní kopie, podstrčíme ji; jinak jde požadavek ven jako dřív.
  if (LEAFLET) {
    await ctx.route('https://unpkg.com/leaflet@**', (r) => {
      const soubor = path.join(LEAFLET, path.basename(new URL(r.request().url()).pathname));
      if (!existsSync(soubor)) return r.abort();
      return r.fulfill({ status: 200, contentType: soubor.endsWith('.css') ? 'text/css' : 'text/javascript',
        body: readFileSync(soubor) });
    });
    await ctx.route(`${BASE}/${s}`, async (r) => {
      const o = await r.fetch();
      return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8',
        body: (await o.text()).replace(/\s+integrity="[^"]*"/g, '') });
    });
  }
  await ctx.route('**/js/config.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript',
    body: `window.PK_SUPABASE_URL='${BASE}';window.PK_SUPABASE_KEY='anon';`
      + 'window.PK_MAIL_ZAPNUTO=true;' }));
  /* Přihlášení kvůli uloženým hledáním — bez něj je na hlidani.html jen
     formulář a přepínač posílání se nevykreslí. */
  await ctx.addInitScript(() => {
    localStorage.setItem('pk_auth', JSON.stringify({ access_token: 'tok-majitel',
      refresh_token: 'ref-majitel',
      user: { id: '11111111-1111-4111-8111-111111111111', email: 'majitel@test.cz' } }));
  });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/${s}`, { waitUntil: 'domcontentloaded' }).catch(() => {});
  await p.waitForTimeout(1600);
  /* CO SE NEUKÁŽE ODHLÁŠENÉMU, TO SE DŘÍV NEMĚŘILO. Tahle kontrola běžela
     bez přihlášení a tím minula celou jednu polovinu webu: formulář na
     pridat.html, přepínače v Upozorněních, uložená hledání. Naměřeno:
     bez přihlášení se nezměřilo ANI JEDNO zaškrtávátko, s přihlášením
     deset — a mezi nimi tři terče pod normou („Odhlásit" 22 px,
     „Označit vše jako viděné" 38 px a přepínač filtru 38 px).
     Zkoušel jsem k tomu i rozbalovat kartu #prodej-card; ukázalo se, že
     to není potřeba (se stejným počtem i bez toho), tak to tu není. */
  await p.waitForTimeout(300);
  const nalezy = await p.evaluate((MIN) => {
    const out = [];
    /* ZAŠKRTÁVÁTKA SE DŘÍV NEMĚŘILA. Seznam selektorů znal tlačítka
       a odkazy, ale ne input[type=checkbox] — a prstem se klepe i na ně.
       Projevilo se to na přepínači „Posílat e-mailem" u uloženého
       hledání: terč 22 px, tedy polovina normy, a nic to nehlásilo.
       U zaškrtávátka se měří TERČ, ne vstup sám: obalující <label>
       (nebo label[for=…]) je to, na co se klepe, takže 18px vstup uvnitř
       44px label je v pořádku — a právě tak to má pridat.html. */
    const terc = (e) => {
      const lab = e.closest('label') || (e.id ? document.querySelector('label[for="' + e.id + '"]') : null);
      const r = e.getBoundingClientRect();
      if (!lab) return r;
      const lr = lab.getBoundingClientRect();
      return { width: Math.max(r.width, lr.width), height: Math.max(r.height, lr.height) };
    };
    let zaskrtnuto = 0;
    document.querySelectorAll('button, a.btn-primary, a.filter-chip, .filter-chip, .nav-toggle, .mvt-btn, .up-f, .up-a, input[type=checkbox], input[type=radio]').forEach((e) => {
      const jeZaskrt = /^(checkbox|radio)$/.test(e.type || '');
      const r = jeZaskrt ? terc(e) : e.getBoundingClientRect();
      if (!r.width || !r.height) return;
      if (jeZaskrt) zaskrtnuto++;
      const s = getComputedStyle(e);
      if (s.visibility === 'hidden' || parseFloat(s.opacity) < 0.05) return;
      if (r.height < MIN || r.width < MIN) out.push({
        co: (e.textContent || e.getAttribute('aria-label') || e.tagName).trim().slice(0, 24),
        trida: (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/)[0] : e.tagName),
        rozmer: Math.round(r.width) + '×' + Math.round(r.height)
      });
    });
    return { out: out, zaskrtnuto: zaskrtnuto };
  }, MIN);
  zaskrtavatek += nalezy.zaskrtnuto;
  if (process.env.PK_DOTYK_PODROBNE) console.log(`   ${s}: zaškrtávátek ${nalezy.zaskrtnuto}`);
  nalezy.out.forEach((n) => male.set(n.trida + n.rozmer, Object.assign({ stranka: s }, n)));
  await ctx.close();
}
await prohlizec.close();

const seznam = [...male.values()];
console.log(`\nDotykové terče (min ${MIN} px): ${seznam.length} pod mezí`
  + ` · zaškrtávátek změřeno: ${zaskrtavatek}`);
/* PŘEDPOKLAD: zaškrtávátka se opravdu měřila. Formulář na pridat.html je
   zabalený a dokud se nerozbalí, mají jeho vstupy nulové rozměry — kdyby
   se nerozbalil, kontrola by hlásila „všechny prošly" a přitom by se
   na žádné zaškrtávátko nepodívala. */
if (!zaskrtavatek) {
  console.error('\n::error::Nezměřilo se ani jedno zaškrtávátko. Nejčastější důvod: '
    + 'nepovedlo se přihlášení (odhlášenému se formulář ani přepínače nevykreslí) '
    + 'nebo se změnily selektory. Kontrola by mlčela o celé jedné třídě ovládání.');
  process.exit(1);
}
seznam.slice(0, 15).forEach((n) => console.log(`  ✕ ${n.rozmer.padStart(7)}  ${n.trida}  „${n.co}"  · ${n.stranka}`));
if (seznam.length) {
  console.error(`\n::error::${seznam.length} ovládacích prvků je na mobilu menších než ${MIN} px.`);
  process.exit(1);
}
console.log('Všechny prošly.\n');
process.exit(0);
