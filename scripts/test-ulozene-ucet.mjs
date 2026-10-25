// Test: uložené pozemky leží na ÚČTU, ne jen v jednom prohlížeči.
//
// Spuštění: node scripts/test-ulozene-ucet.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome)
//
// Uložené pozemky byly poslední věc, kterou si web pamatoval POUZE
// v prohlížeči. Kdo si v autobuse uložil dvacet pozemků na telefonu,
// doma na počítači neviděl ani jeden. Poznámky i hlídání chodí na účet
// už dávno; tohle dorovnává to nejčastější.
//
// Hlídá se obojí — že to odejde, i že to NEODEJDE, když nemá:
//  • NEPŘIHLÁŠENÉMU nesmí uložení opustit zařízení. Uložené pozemky
//    jsou seznam toho, o co se člověk zajímá; bez účtu to není naše věc.
//  • PŘIHLÁŠENÉMU odejít MUSÍ a musí se objevit v DRUHÉM prohlížeči,
//    který ten pozemek nikdy neměl — jinak celá funkce nic nemění.
//  • SMAZÁNÍ MUSÍ DRŽET. To je ta část, na které pohořely poznámky:
//    „mám to tady a na účtu to není" jsou dvě různé situace. Klíč, který
//    už byl nahraný, zmizel z účtu ⇒ smazal ho jiný telefon, zmiz i tady.
//    Klíč, který nahraný nikdy nebyl ⇒ ulož ho, nemazat. Když se to
//    splete, buď se smazané pozemky vracejí jako duch, nebo se naopak
//    tiše mažou ty čerstvě uložené.
//  • JEDEN ÚČET NESMÍ VIDĚT DO DRUHÉHO.
/* SERVISNÍ PRACOVNÍK VYPNUTÝ: sw.js volá `skipWaiting()` i `clients.claim()`,
   takže by převzal i právě načtenou stránku a obsluhoval `config.js` sám —
   podstrčení přes `ctx.route` by přestalo platit. (Viz CLAUDE.md.) */
import { chromium } from 'playwright-core';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { hlasPad } from './zkouska-pad.mjs';

const { BASE } = await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FAV = 'pk_fav_v1';
const NAHRANO = 'pk_fav_nahrano_v1';
let ok = 0, chyb = 0;
const zpravy = [];
/* A KDYŽ TO SPADNE, AŤ TO TAKY NĚCO ŘEKNE — viz scripts/zkouska-pad.mjs.
   Bez tohohle se při výjimce (chybějící prvek, timeout klepnutí) zahodí
   všechny kontroly, které do té chvíle prošly, a v CI zbyde jen stopa. */
hlasPad('Uložené na účtu', zpravy);
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
function hotovo() {
  console.log('\nUložené pozemky na účtu');
  console.log(zpravy.join('\n'));
  console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
  if (chyb) { console.log('::error::Uložené na účtu: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
  process.exit(0);
}

const stranka = readdirSync(KOREN).filter((f) => /^pozemek-.+\.html$/.test(f)).sort()[0];
pravda('je na čem měřit — stránka pozemku', !!stranka);
if (!stranka) hotovo();

const prohlizec = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });

const UCTY = {
  majitel: { access_token: 'tok-majitel', refresh_token: 'ref-majitel',
    user: { id: '11111111-1111-4111-8111-111111111111', email: 'majitel@test.cz' } },
  zajemce: { access_token: 'tok-zajemce', refresh_token: 'ref-zajemce',
    user: { id: '22222222-2222-4222-8222-222222222222', email: 'zajemce@test.cz' } },
};
/* config.js míří na OSTROU Supabase. Bez podstrčení by zkouška volala do
   produkce — a protože je ze sandboxu nedostupná, tiše by „neprošla"
   z úplně jiného důvodu, než co měří. */
async function kontext(kdo, predem) {
  const ctx = await prohlizec.newContext({ bypassCSP: true,  serviceWorkers: 'block', viewport: { width: 1100, height: 900 } });
  await ctx.route('**/config.js*', (r) => r.fulfill({ status: 200,
    contentType: 'text/javascript',
    body: `window.PK_SUPABASE_URL='${BASE}';window.PK_SUPABASE_KEY='anon-klic';`
      + 'window.PK_MAIL_ZAPNUTO=false;' }));
  await ctx.addInitScript(([ucet, nastav]) => {
    if (ucet) localStorage.setItem('pk_auth', JSON.stringify(ucet));
    if (nastav) Object.keys(nastav).forEach((k) => localStorage.setItem(k, JSON.stringify(nastav[k])));
  }, [kdo ? UCTY[kdo] : null, predem || null]);
  return ctx;
}
/* Odchozí volání se zapisují všechna — zkouška se pak může ptát i na to,
   co se stát NEMĚLO. */
function sleduj(p, kam) {
  p.on('request', (r) => {
    const m = /\/rpc\/(ulozeny_uloz|ulozeny_smaz|moje_ulozene|ulozene_nahraj)\b/.exec(r.url());
    if (m) kam.push({ fn: m[1], telo: r.postData() || '' });
  });
}
async function otevri(ctx) {
  const p = await ctx.newPage();
  const volani = [];
  const chybyJs = [];
  p.on('pageerror', (e) => chybyJs.push(String(e)));
  sleduj(p, volani);
  await p.goto(`${BASE}/${stranka}`, { waitUntil: 'load' });
  await p.waitForSelector('#pz-fav', { timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(2200);
  return { p, volani, chybyJs };
}
const schranka = (p) => p.evaluate(([f, n]) => ({
  favs: JSON.parse(localStorage.getItem(f) || '[]'),
  nahrano: Object.keys(JSON.parse(localStorage.getItem(n) || '{}')),
}), [FAV, NAHRANO]);

/* ---- 1) nepřihlášenému uložení NEOPUSTÍ zařízení ---- */
{
  const ctx = await kontext(null);
  const { p, volani, chybyJs } = await otevri(ctx);
  const je = await p.evaluate(() => !!document.querySelector('#pz-fav'));
  pravda('na stránce pozemku je tlačítko Uložit', je);
  if (!je) { await prohlizec.close(); hotovo(); }
  await p.click('#pz-fav');
  await p.waitForTimeout(900);
  const s = await schranka(p);
  pravda('nepřihlášenému se pozemek uloží v prohlížeči', s.favs.length === 1,
    `ve schránce: ${JSON.stringify(s.favs)}`);
  pravda('ale NEODEŠLE se nikam na účet', volani.length === 0,
    `odešlo: ${JSON.stringify(volani.map((v) => v.fn))}`);
  pravda('a stránka přitom nespadne', chybyJs.length === 0, chybyJs[0]);
  await ctx.close();
}

/* ---- 2) přihlášenému uložení odejde na účet ---- */
let KLIC = null;
{
  const ctx = await kontext('majitel');
  const { p, volani, chybyJs } = await otevri(ctx);
  await p.click('#pz-fav');
  await p.waitForTimeout(1200);
  const s = await schranka(p);
  KLIC = s.favs[0] || null;
  pravda('přihlášenému se pozemek uloží taky v prohlížeči', !!KLIC);
  const uloz = volani.filter((v) => v.fn === 'ulozeny_uloz');
  pravda('a ODEŠLE se na účet', uloz.length > 0,
    `odešlo: ${JSON.stringify(volani.map((v) => v.fn))}`);
  pravda('a pošle se TÝŽ klíč, jaký si web zapsal k sobě',
    !!KLIC && uloz.some((v) => v.telo.indexOf(KLIC) >= 0),
    `klíč: „${KLIC}", tělo: ${uloz[0] ? uloz[0].telo.slice(0, 120) : '(žádné)'}`);
  pravda('a web si poznamená, že účet ten klíč zná',
    !!KLIC && s.nahrano.indexOf(KLIC) >= 0, `nahráno: ${JSON.stringify(s.nahrano)}`);
  pravda('stránka nespadne', chybyJs.length === 0, chybyJs[0]);
  await ctx.close();
}
if (!KLIC) { await prohlizec.close(); hotovo(); }

/* ---- 3) DRUHÝ PROHLÍŽEČ, tentýž účet ----
   Prázdná schránka: co se v ní objeví, přišlo z účtu, odjinud přijít
   nemohlo. Tohle je to „vidím to i na druhém telefonu". */
{
  const ctx = await kontext('majitel');
  const { p } = await otevri(ctx);
  await p.waitForTimeout(1500);
  const s = await schranka(p);
  pravda('v DRUHÉM prohlížeči se uložený pozemek stáhne z účtu',
    s.favs.indexOf(KLIC) >= 0, `ve schránce: ${JSON.stringify(s.favs)}`);
  const text = await p.evaluate(() => {
    const b = document.querySelector('#pz-fav');
    return b ? (b.textContent || '').replace(/\s+/g, ' ').trim() + '|' + (b.classList.contains('on') ? 'on' : '') : '';
  });
  pravda('a tlačítko se srovná — hlásí Uloženo, ne Uložit',
    /Uloženo/.test(text) && /on$/.test(text), `tlačítko: „${text}"`);
  await ctx.close();
}

/* ---- 4) CIZÍ ÚČET nevidí nic ---- */
{
  const ctx = await kontext('zajemce');
  const { p } = await otevri(ctx);
  await p.waitForTimeout(1200);
  const s = await schranka(p);
  pravda('jiný účet uložené pozemky prvního NEVIDÍ', s.favs.length === 0,
    `ve schránce: ${JSON.stringify(s.favs)}`);
  await ctx.close();
}

/* ---- 5) SLOUČENÍ: smazání drží, čerstvé se nemaže ----
   Nachystá se prohlížeč, který má dva klíče, co na účtu nejsou — jeden
   s poznámkou „účet ho zná" (odebrán na jiném telefonu), druhý bez ní
   (uložen před přihlášením). Rozdíl mezi nimi je celá ta věc. */
const SMAZANY = 'zkouska-smazany-jinde#v100';
const NOVY = 'zkouska-novy-tady#v200';
{
  const ctx = await kontext('majitel', {
    [FAV]: [SMAZANY, NOVY],
    [NAHRANO]: { [SMAZANY]: 1 },
  });
  const { p, volani } = await otevri(ctx);
  await p.waitForTimeout(1800);
  const s = await schranka(p);
  pravda('klíč odebraný na jiném zařízení se smaže i tady',
    s.favs.indexOf(SMAZANY) < 0, `ve schránce: ${JSON.stringify(s.favs)}`);
  pravda('klíč uložený před přihlášením se NEsmaže',
    s.favs.indexOf(NOVY) >= 0, `ve schránce: ${JSON.stringify(s.favs)}`);
  pravda('a nahraje se na účet',
    volani.some((v) => v.fn === 'ulozene_nahraj' && v.telo.indexOf(NOVY) >= 0),
    `odešlo: ${JSON.stringify(volani.map((v) => v.fn))}`);
  pravda('a co leží na účtu, se do prázdného prohlížeče přidá',
    s.favs.indexOf(KLIC) >= 0, `ve schránce: ${JSON.stringify(s.favs)}`);
  await ctx.close();
}
/* A JEŠTĚ JEDNO KOLO. Nahrání z předchozího kroku musí znamenat, že se
   už nikdy nebude považovat za „smazaný jinde" — jinak by čerstvě
   uložený pozemek zmizel při druhém otevření stránky. */
{
  const ctx = await kontext('majitel', { [FAV]: [NOVY], [NAHRANO]: { [NOVY]: 1 } });
  const { p } = await otevri(ctx);
  await p.waitForTimeout(1500);
  const s = await schranka(p);
  pravda('nahraný klíč při druhém otevření nezmizí',
    s.favs.indexOf(NOVY) >= 0, `ve schránce: ${JSON.stringify(s.favs)}`);
  await ctx.close();
}

/* ---- 6) ODEBRÁNÍ jde na účet a drží i v druhém prohlížeči ---- */
{
  const ctx = await kontext('majitel');
  const { p, volani } = await otevri(ctx);
  await p.waitForTimeout(1500);
  const pred = await schranka(p);
  pravda('před odebráním je pozemek uložený', pred.favs.indexOf(KLIC) >= 0,
    `ve schránce: ${JSON.stringify(pred.favs)}`);
  await p.click('#pz-fav');
  await p.waitForTimeout(1200);
  pravda('odebrání ODEJDE na účet',
    volani.some((v) => v.fn === 'ulozeny_smaz' && v.telo.indexOf(KLIC) >= 0),
    `odešlo: ${JSON.stringify(volani.map((v) => v.fn))}`);
  await ctx.close();

  const ctx2 = await kontext('majitel');
  const { p: p2 } = await otevri(ctx2);
  await p2.waitForTimeout(1500);
  const s2 = await schranka(p2);
  pravda('a v DRUHÉM prohlížeči se odebraný pozemek už neobjeví',
    s2.favs.indexOf(KLIC) < 0, `ve schránce: ${JSON.stringify(s2.favs)}`);
  await ctx2.close();
}

/* ---- 7) DATABÁZE JEŠTĚ NEUMÍ, CO WEB VOLÁ ------------------------
   Tohle NENÍ vymyšlená situace: supabase/ulozene-na-uctu.sql je v
   docs/pred-vydanim.md jako věc, kterou má majitel teprve pustit.
   Mezi nasazením webu a puštěním SQL tedy existuje okno, ve kterém
   PostgREST na ulozeny_uloz i moje_ulozene odpoví „takovou funkci
   neznám" (404). V tom okně se nesmí stát TO NEJHORŠÍ, co se stát
   může: že web uložené pozemky smaže, protože je „na účtu nenašel".
   Měří se proto obojí — že se uložení dál zapíše v prohlížeči,
   a že se nic neztratí. */
{
  const ctx = await kontext('majitel', { [FAV]: [NOVY], [NAHRANO]: { [NOVY]: 1 } });
  /* 404 na všechny čtyři funkce — přesně jako databáze, která je nezná. */
  await ctx.route(/\/rest\/v1\/rpc\/(ulozeny_uloz|ulozeny_smaz|moje_ulozene|ulozene_nahraj)/,
    (r) => r.fulfill({ status: 404, contentType: 'application/json',
      body: JSON.stringify({ message: 'Could not find the function public.ulozeny_uloz(p_klic)' }) }));
  const { p, chybyJs } = await otevri(ctx);
  await p.waitForTimeout(1500);
  const pred = await schranka(p);
  pravda('při neznámé funkci se uložené pozemky NESMAŽOU',
    pred.favs.indexOf(NOVY) >= 0, `ve schránce: ${JSON.stringify(pred.favs)}`);
  await p.click('#pz-fav');
  await p.waitForTimeout(1000);
  const po = await schranka(p);
  pravda('a uložení se dál zapíše aspoň v prohlížeči',
    po.favs.length === pred.favs.length + 1,
    `před: ${JSON.stringify(pred.favs)}, po: ${JSON.stringify(po.favs)}`);
  pravda('a stránka přitom nespadne', chybyJs.length === 0, chybyJs[0]);
  await ctx.close();
}

await prohlizec.close();
hotovo();
