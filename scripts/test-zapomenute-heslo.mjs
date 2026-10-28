// Test: kde se dá přihlásit, dá se i obnovit zapomenuté heslo.
//
// Spuštění: node scripts/test-zapomenute-heslo.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome)
//
// PROČ VZNIKL. Naměřeno 28. 10.: web má ČTYŘI místa, kde se člověk
// přihlašuje — pridat.html, muj-inzerat.html, hlidani.html a zpravy.html —
// a odkaz na obnovu hesla byl jen na prvních dvou. Hlídání i Zprávy jsou
// přitom přímo v nabídce, takže kdo si je otevřel a heslo nepamatoval,
// neměl odsud kudy ven; musel sám uhodnout, že na Můj profil ten odkaz je.
//
// Nevzniklo to nedbalostí, ale tím, že každá z těch stránek si přihlášení
// kreslí sama. Čtyři formuláře, čtyři příležitosti na něco zapomenout —
// a žádná kontrola, která by to spočítala. Tohle je ta kontrola.
//
// Měří se trojí, a všechno na tom, co se opravdu vykreslí:
//   1. formulář s heslem na té stránce vůbec je (jinak by kontrola
//      procházela naprázdno),
//   2. je u něj ovladač na obnovu hesla a dá se na něj trefit prstem,
//   3. a opravdu něco dělá: bez e-mailu poradí, s e-mailem potvrdí
//      odeslání. Pouhá existence nápisu nestačí — nápis bez obsluhy
//      vypadá stejně jako hotová věc.
import { chromium } from 'playwright-core';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { hlasPad } from './zkouska-pad.mjs';

const { BASE } = await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

let ok = 0, chyb = 0;
const zpravy = [];
hlasPad('Zapomenuté heslo', zpravy);
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
  return vyslo;
}
function hotovo() {
  console.log('\nObnova zapomenutého hesla');
  console.log(zpravy.join('\n'));
  console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
  if (chyb) { console.log('::error::Zapomenuté heslo: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
  process.exit(0);
}

/* Mez dotykového terče je tatáž, jakou drží zbytek webu (scripts/test-dotyk.mjs). */
const DOTYK = 44;

/* Stránky, kde se člověk přihlašuje. Kdo přidá pátou, přidá i řádek sem —
   a hned uvidí, jestli na ni obnovu hesla dal. */
const STRANKY = ['pridat.html', 'muj-inzerat.html', 'hlidani.html', 'zpravy.html'];

const prohlizec = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox'],
});

for (const s of STRANKY) {
  /* Telefon: tam je terč nejtěsnější a tam se taky nejvíc píše heslo. */
  const ctx = await prohlizec.newContext({ bypassCSP: true, serviceWorkers: 'block',
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'cs-CZ' });
  const chybyJs = [];
  const p = await ctx.newPage();
  p.on('pageerror', (e) => chybyJs.push(String(e)));
  await p.goto(`${BASE}/${s}`, { waitUntil: 'load' }).catch(() => {});
  await p.waitForTimeout(1800);

  // PŘEDPOKLAD: bez přihlašovacího pole by kontroly níž neměly co měřit
  const poleHesla = await p.$('input[type="password"]');
  if (!pravda(`${s}: je na ní přihlášení (pole pro heslo)`, !!poleHesla,
    'pole pro heslo se nevykreslilo — kontrola by prošla naprázdno')) { await ctx.close(); continue; }

  /* Hledá se podle TEXTU, ne podle id: každá stránka si přihlášení kreslí
     po svém a id se jmenují jinak (au-forgot, hforgot, zforgot). Co má být
     stejné, je to, co z toho vidí člověk. */
  const odkaz = p.locator('button, a').filter({ hasText: /zapomn/i }).first();
  const je = await odkaz.count() > 0;
  if (!pravda(`${s}: a je u něj obnova zapomenutého hesla`, je,
    'na stránce není nic, co by mluvilo o zapomenutém heslu')) { await ctx.close(); continue; }

  const r = await odkaz.boundingBox();
  pravda(`${s}: a dá se na ni trefit prstem (${r ? Math.round(r.height) : 0} px)`,
    !!r && r.height >= DOTYK, `${r ? Math.round(r.height) : 0} px, mez ${DOTYK}`);

  /* ŽE TAM NĚCO JE, JEŠTĚ NEZNAMENÁ, ŽE TO NĚCO DĚLÁ. Nápis bez obsluhy
     vypadá na stránce úplně stejně jako hotová věc — proto se klepne. */
  const zivaOblast = p.locator('[role="status"]').first();
  await odkaz.click({ force: true }).catch(() => {});
  await p.waitForTimeout(500);
  const bezEmailu = (await zivaOblast.textContent().catch(() => '')) || '';
  pravda(`${s}: bez e-mailu poradí, co má člověk udělat`,
    /e-mail/i.test(bezEmailu), `hláška: „${bezEmailu.slice(0, 80)}"`);

  const pole = p.locator('input[type="email"], input[inputmode="email"]').first();
  await pole.fill('nekdo@priklad.cz').catch(() => {});
  await odkaz.click({ force: true }).catch(() => {});
  await p.waitForTimeout(1200);
  const sEmailem = (await zivaOblast.textContent().catch(() => '')) || '';
  pravda(`${s}: a s e-mailem potvrdí, že odkaz odešel`,
    /odkaz|poslali|e-mail/i.test(sEmailem) && sEmailem !== bezEmailu,
    `hláška: „${sEmailem.slice(0, 90)}"`);

  pravda(`${s}: a nic se u toho v prohlížeči nerozbilo`, chybyJs.length === 0,
    chybyJs.slice(0, 2).join(' | '));
  await ctx.close();
}

await prohlizec.close();
hotovo();
