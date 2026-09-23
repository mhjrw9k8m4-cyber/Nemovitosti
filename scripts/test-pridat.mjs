// Test: vložení vlastního pozemku — celá cesta od formuláře po databázi.
//
// Spuštění: node scripts/test-pridat.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome)
//
// Proč vznikl: „Přidat pozemek" je JEDINÁ cesta, kudy se na web dostane
// vlastní obsah — a neprocházel ji žádný test. Kontrolovalo se jen to, že
// stránka nespadne a že odkazy vedou někam. Jestli formulář opravdu uloží
// pozemek, jestli odmítne nesmysl a jestli člověku řekne PROČ, nehlídalo
// nic. Přitom právě tady se nejvíc pozná, že web „nefunguje": kdo dvakrát
// marně odešle inzerát, potřetí nepřijde.
//
// Hlídá se:
//   1. bez přihlášení se formulář vůbec nenabídne (a je vidět proč),
//   2. po přihlášení jde vyplnit a odeslat a pozemek se opravdu uloží,
//   3. meze serveru platí a jejich porušení má SROZUMITELNOU hlášku
//      (ne obecné „nepovedlo se"),
//   4. co server odmítne, to web nevydává za uložené.
import { chromium } from 'playwright-core';
await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const BASE = 'http://127.0.0.1:8310';
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));

async function otevri(prihlasit) {
  const ctx = await prohlizec.newContext({ viewport: { width: 1280, height: 900 } });
  /* POZOR NA POŘADÍ: platí poslední zaregistrovaná cesta, ne první.
     Když se hrubý zákaz ven zapsal až nakonec, přebil i podstrčenou
     odpověď geokodéru — formulář pak skončil na „obec jsme nenašli"
     a o ukládání se test nedozvěděl nic. */
  await ctx.route('**/*', (r) => {
    const u = new URL(r.request().url());
    return (u.hostname === '127.0.0.1' || u.hostname === 'localhost') ? r.continue() : r.abort();
  });
  await ctx.route('**/js/config.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript',
    body: `window.PK_SUPABASE_URL='${BASE}';window.PK_SUPABASE_KEY='anon';` }));
  /* Geokódování jde na nominatim.openstreetmap.org — ven se v testu
     nechodí, tak se odpověď podstrčí. */
  await ctx.route('**nominatim.openstreetmap.org**', (r) => r.fulfill({ status: 200,
    contentType: 'application/json', body: JSON.stringify([{ lat: '50.0281', lon: '15.2000' }]) }));
  if (prihlasit) {
    await ctx.addInitScript(() => {
      try {
        localStorage.setItem('pk_auth', JSON.stringify({ access_token: 'tok-majitel',
          refresh_token: 'ref-majitel', expires_at: Math.floor(Date.now() / 1000) + 3600,
          user: { id: '11111111-1111-4111-8111-111111111111', email: 'majitel@parcelka.test' } }));
      } catch (e) {}
    });
  }
  const p = await ctx.newPage();
  const padlo = [];
  p.on('pageerror', (e) => padlo.push(String(e).slice(0, 160)));
  p.setDefaultTimeout(8000);
  await p.goto(`${BASE}/pridat.html`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2600);
  return { ctx, p, padlo };
}

/* --- 1) Bez přihlášení ------------------------------------------------ */
{
  const { ctx, p } = await otevri(false);
  const v = await p.evaluate(() => ({
    obec: !!(document.getElementById('p-obec') || {}).offsetParent,
    email: !!(document.getElementById('au-email') || {}).offsetParent,
    text: document.body.textContent.replace(/\s+/g, ' '),
  }));
  pravda('bez přihlášení se formulář nenabídne', v.obec === false);
  pravda('a je vidět, čím se to odemkne', v.email === true,
    'chybí přihlašovací pole — člověk by nevěděl, co má udělat');
  pravda('a stojí u toho proč', /přihlá|účet/i.test(v.text));
  await ctx.close();
}

/* --- 2) Vyplnit a odeslat --------------------------------------------- */
async function vypln(p, zmeny) {
  const zaklad = { 'p-obec': 'Kolín', 'p-vymera': '1200', 'p-cena': '480000',
    'p-okres': 'Kolín', 'p-parcela': '254/1', 'p-popis': 'Rovinatý pozemek na okraji obce.',
    'p-jmeno': 'Jan Novák', 'p-kontakt': 'jan@example.com' };
  const pole = Object.assign({}, zaklad, zmeny || {});
  for (const [id, hod] of Object.entries(pole)) {
    if (hod === null) continue;
    await p.fill('#' + id, String(hod)).catch(() => {});
  }
  await p.check('#p-souhlas').catch(() => {});
}
async function odesli(p) {
  /* Schválně tlačítko UVNITŘ formuláře s pozemkem. Na stránce je i druhý
     odesílací knoflík — přihlašovací — a ten je v DOM první; klepnutí na
     „první submit na stránce" tedy přihlašovalo místo odesílání a test
     pak tvrdil, že web nic neuložil. */
  const btn = await p.$('#form-prodej button[type="submit"]');
  if (!btn) return { url: '(chyba)', hlaska: 'tlačítko odeslat ve formuláři nenalezeno' };
  await btn.click().catch(() => {});
  await p.waitForTimeout(2200);
  return p.evaluate(() => ({
    url: location.pathname,
    hlaska: [...document.querySelectorAll('#msg-prodej, .add-msg, [role="alert"]')]
      .map((e) => e.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean).join(' | '),
  }));
}

{
  const { ctx, p, padlo } = await otevri(true);
  pravda('po přihlášení je formulář k dispozici',
    await p.evaluate(() => !!(document.getElementById('p-obec') || {}).offsetParent));

  await vypln(p);
  const v = await odesli(p);
  pravda('vyplněný pozemek se uloží a web přejde na „moje inzeráty"',
    /muj-inzerat/.test(v.url), `zůstali jsme na ${v.url}, hláška: „${v.hlaska}"`);

  const ulozeno = await fetch(`${BASE}/rest/v1/rpc/my_listings`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok-majitel' },
    body: '{}',
  }).then((r) => r.json()).catch(() => []);
  pravda('a v databázi opravdu je', Array.isArray(ulozeno) && ulozeno.length === 1,
    `uloženo záznamů: ${Array.isArray(ulozeno) ? ulozeno.length : '?'}`);
  if (ulozeno[0]) {
    pravda('se vším, co člověk vyplnil',
      ulozeno[0].place === 'Kolín' && ulozeno[0].area === 1200 && ulozeno[0].price === 480000
      && ulozeno[0].contact === 'jan@example.com',
      JSON.stringify(ulozeno[0]).slice(0, 200));
    pravda('a se souřadnicemi, ne bez nich',
      typeof ulozeno[0].lat === 'number' && typeof ulozeno[0].lng === 'number',
      'pozemek bez polohy se na mapě neukáže');
  }
  pravda('a nic při tom nespadlo', padlo.length === 0, padlo.join(' | '));
  await ctx.close();
}

/* --- 3) Co server odmítne, se nesmí tvářit jako uložené ---------------
   Meze jsou na serveru schválně — prohlížeči se věřit nedá. Test je ale
   o tom, co uvidí ČLOVĚK: odmítnutí musí dojít až k němu a musí z něj
   jít poznat, co opravit. */
{
  const spatne = [
    ['výměra pod deseti metry', { 'p-vymera': '5' }, /výměr/i],
    ['nesmyslná cena za metr', { 'p-vymera': '100000', 'p-cena': '2000' }, /cen|metr/i],
    ['kontakt, který není kontakt', { 'p-kontakt': 'zavolejte mi' }, /kontakt|telefon|e-mail/i],
    ['sprostý popis', { 'p-popis': 'Tenhle pozemek je uplne na hovno.' }, /nevhodn|obsah/i],
  ];
  for (const [popis, zmeny, ocekavana] of spatne) {
    const { ctx, p } = await otevri(true);
    await vypln(p, zmeny);
    const v = await odesli(p);
    pravda(`odmítne: ${popis}`, !/muj-inzerat/.test(v.url),
      `web přešel na ${v.url}, jako by to uložil`);
    pravda(`a řekne proč: ${popis}`, ocekavana.test(v.hlaska),
      `hláška byla „${v.hlaska}"`);
    await ctx.close();
  }
}

await prohlizec.close();
console.log('\nPřidání vlastního pozemku — celá cesta');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Přidání pozemku: ' + chyb + ' kontrol neprošlo.'); process.exit(1); }
process.exit(0);
