// Projde chat v opravdovém prohlížeči: zájemce napíše, majitel to uvidí
// a odpoví, zájemce odpověď dostane. Plus věci, které se v Node otestovat
// nedají — odznak v menu, hlavička konverzace a chování posuvníku.
import { chromium } from 'playwright-core';

// Zkušební Supabase si test spustí sám — jedním příkazem a bez přípravy.
// Spuštění: node scripts/test-chat-prohlizec.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome)
await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const BASE = 'http://127.0.0.1:8310';
const LISTING = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';
const UID_MAJITEL = '11111111-1111-4111-8111-111111111111';
const UID_ZAJEMCE = '22222222-2222-4222-8222-222222222222';

let ok = 0, chyb = 0;
const zpravy = [];
function je(popis, vyslo, cekano) {
  const a = JSON.stringify(vyslo), b = JSON.stringify(cekano);
  if (a === b) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}\n      čekáno ${b}, vyšlo ${a}`); }
}

// Cesta k prohlížeči: v CI ji dodá playwright sám, tady v sandboxu je
// Chromium předinstalovaný jinde — proto proměnná PW_CHROMIUM.
const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] },
  kde ? { executablePath: kde } : {}));

async function kontext(uid, token) {
  const ctx = await prohlizec.newContext({ viewport: { width: 390, height: 760 } });
  // config.js míří na ostrou Supabase — podstrčíme falešnou.
  await ctx.route('**/js/config.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript',
    body: `window.PK_SUPABASE_URL='${BASE}';window.PK_SUPABASE_KEY='anon-klic';` }));
  await ctx.addInitScript(([u, t]) => {
    localStorage.setItem('pk_auth', JSON.stringify({ access_token: t, refresh_token: t.replace('tok-', 'ref-'), user: { id: u, email: u + '@test.cz' } }));
  }, [uid, token]);
  return ctx;
}

/* ---------- 1. zájemce otevře nové vlákno z tlačítka „Napsat majiteli" ---------- */
const cZajemce = await kontext(UID_ZAJEMCE, 'tok-zajemce');
const pZ = await cZajemce.newPage();
const chybyKonzole = [];
pZ.on('pageerror', (e) => chybyKonzole.push(String(e)));
await pZ.goto(`${BASE}/zpravy.html?l=${LISTING}&new=1&p=Kol%C3%ADn&ok=Kol%C3%ADn`);
await pZ.waitForSelector('#zc-ta', { timeout: 10000 });

je('hlavička ukazuje obec i okres z adresy', (await pZ.textContent('#zc-title b')).trim(), 'Kolín · okr. Kolín');
je('zájemce vidí, že píše majiteli', (await pZ.textContent('#zc-sub')).trim(), 'Majitel pozemku');

await pZ.fill('#zc-ta', 'Dobrý den, je pozemek ještě volný?');
await pZ.click('#zc-send');
await pZ.waitForFunction(() => document.querySelectorAll('.zp-b.me').length === 1 &&
  !document.querySelector('.zp-b.me').classList.contains('ceka'), null, { timeout: 8000 });
je('zpráva zájemce odešla a je vidět', (await pZ.textContent('.zp-b.me')).includes('je pozemek ještě volný'), true);
je('psací pole se vyprázdnilo', await pZ.inputValue('#zc-ta'), '');

/* ---------- 2. majitel vidí vlákno ve schránce i odznak v menu ---------- */
const cMajitel = await kontext(UID_MAJITEL, 'tok-majitel');
const pM = await cMajitel.newPage();
pM.on('pageerror', (e) => chybyKonzole.push(String(e)));

// odznak se zkouší na běžné stránce okresu — tam dřív nebyl vůbec,
// a rovnou v mobilním rozměru, kde je celé menu schované za hamburgerem
await pM.goto(`${BASE}/pozemky-okres-tabor.html`);
await pM.waitForSelector('.nav-toggle .nav-dot', { timeout: 10000 });
je('na mobilu je nepřečtená zpráva vidět i se zavřeným menu',
  await pM.locator('.nav-toggle .nav-dot').isVisible(), true);
// Tečka pokrývá zprávy i hlídání, proto neutrální „novinky".
je('tlačítko menu to řekne i nevidomému',
  await pM.getAttribute('.nav-toggle', 'aria-label'), 'Otevřít menu — čekají na vás novinky');
je('odznak u položky Zprávy existuje', (await pM.textContent('#nav-zpravy .nav-unread')).trim(), '1');
await pM.click('.nav-toggle');
je('po otevření menu je odznak vidět',
  await pM.locator('#nav-zpravy .nav-unread').isVisible(), true);

/* ---------- odznak hlídání: hlídací pes musí štěkat i mimo svou stránku ---------- */
// Kolik nových pozemků má vyjít, spočítáme týmž modulem, který používá web —
// tady se ověřuje to ostatní: že se data vůbec stáhnou, spojí s uloženým
// hledáním a výsledek doputuje až do menu.
const { createRequire } = await import('node:module');
const req2 = createRequire(import.meta.url);
const HL = req2(new URL('../js/hlidani-logika.js', import.meta.url).pathname);
const dataSoubor = JSON.parse((await import('node:fs')).readFileSync(new URL('../data/opportunities.json', import.meta.url), 'utf8'));
const cekanoHl = HL.novychCelkem(
  [{ okres: 'Tábor', druh: '', ptype: '', max_price: 0, min_area: 0, features: [], seen_keys: [] }],
  dataSoubor.opportunities || []);
je('zkušební hledání vůbec něco najde', cekanoHl > 0, true);

await pM.waitForSelector('#nav-hlidani .nav-unread', { state: 'attached', timeout: 15000 });
je('odznak hlídání ukazuje počet nových pozemků',
  (await pM.textContent('#nav-hlidani .nav-unread')).trim(), cekanoHl > 9 ? '9+' : String(cekanoHl));
je('titulek záložky sečte zprávy i hlídání',
  (await pM.title()).startsWith('(' + (1 + cekanoHl > 9 ? '9+' : String(1 + cekanoHl)) + ') '), true);

/* Na širokém displeji je lišta rozbalená, tam tečka na tlačítku menu
   překážet nemusí. Osobní položky (Upozornění, Zprávy, Hlídání, Můj
   profil) jsou ale nově pod jednou skupinou „Moje", takže odznak
   u Zpráv je v zavřené nabídce — a tím pádem neviditelný. Počet proto
   svítí i na samotné skupině; kdyby nesvítil, člověk by se o čekající
   zprávě dozvěděl, jen kdyby nabídku náhodou rozbalil. */
const pSirs = await cMajitel.newPage();
await pSirs.setViewportSize({ width: 1280, height: 800 });
await pSirs.goto(`${BASE}/pozemky-okres-tabor.html`);
await pSirs.waitForSelector('#nav-moje-sum .nav-unread', { timeout: 10000 });
je('na počítači je odznak rovnou vidět na skupině „Moje"',
  await pSirs.locator('#nav-moje-sum .nav-unread').isVisible(), true);
// A po rozbalení i u konkrétní položky.
await pSirs.click('#nav-moje-sum');
await pSirs.waitForTimeout(400);
je('a po rozbalení i u Zpráv',
  await pSirs.locator('#nav-zpravy .nav-unread').isVisible(), true);
await pSirs.close();

await pM.goto(`${BASE}/zpravy.html`);
await pM.waitForSelector('.zp-thread', { timeout: 10000 });
je('majitel vidí jedno vlákno', await pM.locator('.zp-thread').count(), 1);
je('majitel pozná konkrétního zájemce', (await pM.textContent('.zp-trole')).trim(), 'Zájemce 2222');
je('u vlákna svítí počet nepřečtených', (await pM.textContent('.zp-badge')).trim(), '1');

/* ---------- 3. majitel odpoví ---------- */
await pM.click('.zp-thread');
await pM.waitForSelector('#zc-ta', { timeout: 10000 });
je('majitel vidí v hlavičce, komu odpovídá', (await pM.textContent('#zc-sub')).trim(), 'Zájemce 2222');
await pM.fill('#zc-ta', 'Dobrý den, ano, je volný.');
await pM.click('#zc-send');
await pM.waitForFunction(() => document.querySelectorAll('.zp-b').length === 2, null, { timeout: 8000 });
je('ve vlákně jsou obě zprávy', await pM.locator('.zp-b').count(), 2);

/* ---------- 4. zájemce dostane odpověď (bez znovunačtení stránky) ---------- */
await pZ.waitForFunction(() => document.querySelectorAll('.zp-b.them').length === 1, null, { timeout: 25000 });
je('odpověď dorazila sama, bez obnovení stránky',
  (await pZ.textContent('.zp-b.them')).includes('ano, je volný'), true);

/* ---------- 5. odmítnutí od serveru se ukáže srozumitelně ---------- */
await pZ.fill('#zc-ta', 'RYCHLE');
await pZ.click('#zc-send');
await pZ.waitForSelector('#zc-err:not([hidden])', { timeout: 8000 });
je('hláška „chvíli počkejte" je přeložená do věty',
  (await pZ.textContent('#zc-err')).trim(), 'Moment — mezi zprávami nechte pár vteřin.');
je('neodeslaný text zůstal v poli, nemusí se psát znovu', await pZ.inputValue('#zc-ta'), 'RYCHLE');
je('neodeslaná bublina je označená', await pZ.locator('.zp-b.chyba').count(), 1);

/* ---------- 6. počítadlo znaků ---------- */
await pZ.fill('#zc-ta', 'a'.repeat(1900));
await pZ.waitForSelector('#zc-pocet:not([hidden])', { timeout: 5000 });
je('u dlouhé zprávy se ukáže, kolik zbývá', (await pZ.textContent('#zc-pocet')).trim(), 'zbývá 100 znaků');
await pZ.fill('#zc-ta', 'a'.repeat(2005));
je('po překročení meze to pole řekne samo', (await pZ.textContent('#zc-pocet')).trim(), 'o 5 znaků moc');

/* ---------- 7. po přečtení odznak zprávy zmizí, hlídání zůstane ---------- */
// Počet se drží minutu v paměti prohlížeče, ať se web neptá na každé
// stránce znovu. Návštěva schránky ho proto musí zahodit — jinak by odznak
// ještě minutu hlásil zprávu, kterou si člověk právě přečetl.
const pPo = await cMajitel.newPage();
await pPo.goto(`${BASE}/pozemky-okres-tabor.html`);
await pPo.waitForSelector('#nav-hlidani .nav-unread', { state: 'attached', timeout: 15000 });
je('po přečtení zpráv odznak u Zpráv zhasne', await pPo.locator('#nav-zpravy .nav-unread').count(), 0);
je('odznak hlídání tím ale nezhasne', await pPo.locator('#nav-hlidani .nav-unread').count(), 1);
je('tečka na menu svítí dál kvůli hlídání', await pPo.locator('.nav-toggle .nav-dot').isVisible(), true);
await pPo.close();

/* ---------- 8. centrum upozornění ---------- */
// Odznak řekne, že něco je. Teprve tahle stránka řekne CO a od koho —
// a to je celý smysl centra upozornění.
// Majitelova konverzace z kroku 3 se musí zavřít. Dokud je otevřená, ptá
// se každých 15 s na nové zprávy a tím si je rovnou označuje za přečtené —
// je to správné chování aplikace, ale nepřečtená zpráva by tu nevydržela.
await pM.close();

const pC = await cMajitel.newPage();
pC.on('pageerror', (e) => chybyKonzole.push(String(e)));
// ať je zas jedna nepřečtená zpráva, na které jde centrum ukázat
await fetch(`${BASE}/rest/v1/rpc/send_message`, { method: 'POST',
  headers: { Authorization: 'Bearer tok-zajemce', 'Content-Type': 'application/json' },
  body: JSON.stringify({ p_listing: LISTING, p_buyer: null, p_body: 'Ještě dotaz na přístupovou cestu.' }) });

await pC.goto(`${BASE}/upozorneni.html`);
await pC.waitForSelector('.up-item', { timeout: 15000 });
je('centrum ukáže obojí — zprávu i pozemky', await pC.locator('.up-item').count(), 2);
je('u zprávy je vidět ukázka textu',
  (await pC.textContent('.up-ico.zprava ~ .up-main .up-quote')).includes('přístupovou cestu'), true);
je('u pozemků je vidět, co přibylo',
  await pC.locator('.up-ico.pozemky ~ .up-main .up-list li').count() > 0, true);
je('nepřečtené má tečku', await pC.locator('.up-ico .dot').count(), 2);
je('je tam živá oblast pro odečítač obrazovky',
  await pC.getAttribute('#up-live', 'aria-live'), 'polite');

// filtry
await pC.click('[data-f="zpravy"]');
await pC.waitForFunction(() => document.querySelectorAll('.up-item').length === 1, null, { timeout: 5000 });
je('filtr Zprávy nechá jen zprávy', await pC.locator('.up-ico.zprava').count(), 1);
je('filtr Zprávy schová pozemky', await pC.locator('.up-ico.pozemky').count(), 0);
je('vybraný filtr je označený i pro odečítač',
  await pC.getAttribute('[data-f="zpravy"]', 'aria-pressed'), 'true');
await pC.click('[data-f="vse"]');
await pC.waitForFunction(() => document.querySelectorAll('.up-item').length === 2, null, { timeout: 5000 });

// nastavení: co nechci vidět
await pC.click('#pf-p');
await pC.waitForFunction(() => document.querySelectorAll('.up-ico.pozemky').length === 0, null, { timeout: 5000 });
je('vypnutí pozemků je schová', await pC.locator('.up-ico.pozemky').count(), 0);
await pC.click('#pf-p');
await pC.waitForFunction(() => document.querySelectorAll('.up-ico.pozemky').length === 1, null, { timeout: 5000 });

// označit vše jako viděné
await pC.click('#up-all');
await pC.waitForFunction(() => document.querySelectorAll('.up-ico.pozemky').length === 0, null, { timeout: 8000 });
je('po označení pozemky z centra zmizí', await pC.locator('.up-ico.pozemky').count(), 0);
je('zpráva tím ale nezmizí', await pC.locator('.up-ico.zprava').count(), 1);
je('odečítači se řekne, co se stalo',
  (await pC.textContent('#up-live')).includes('viděné'), true);

// a po obnovení stránky to platí dál (server si to opravdu zapsal)
await pC.reload();
await pC.waitForSelector('.up-item', { timeout: 15000 });
je('označení přežije obnovení stránky', await pC.locator('.up-ico.pozemky').count(), 0);
await pC.close();

/* ---------- 9. vyskakovací upozornění jen při přírůstku ---------- */
const pT = await cMajitel.newPage();
pT.on('pageerror', (e) => chybyKonzole.push(String(e)));
await pT.goto(`${BASE}/pozemky-okres-tabor.html`);
await pT.waitForTimeout(1500);
je('při prvním příchodu nic nevyskakuje', await pT.locator('.upo-toast').count(), 0);

// jako by mezitím něco přibylo: snížíme poslední známý počet a zahodíme paměť
await pT.evaluate(() => {
  sessionStorage.setItem('pk_upozorneni_znamo_v1', '0');
  sessionStorage.removeItem('pk_upozorneni_v1');
});
await pT.reload();
await pT.waitForSelector('.upo-toast.show', { timeout: 15000 });
je('při přírůstku vyskočí upozornění', await pT.locator('.upo-toast').isVisible(), true);
je('a vede do centra',
  (await pT.getAttribute('.upo-toast a', 'href')), 'upozorneni.html');
je('vyskakovací upozornění je oznámeno šetrně, ne přes hlasitý alert',
  await pT.getAttribute('.upo-toast', 'aria-live'), 'polite');
await pT.click('.upo-toast button');
await pT.waitForFunction(() => !document.querySelector('.upo-toast'), null, { timeout: 5000 });
je('jde zavřít', await pT.locator('.upo-toast').count(), 0);
await pT.close();

/* ---------- 10. žádné chyby v konzoli ---------- */
je('na stránkách nespadl žádný skript', chybyKonzole, []);

console.log('\nChat v prohlížeči: ' + (ok + chyb) + ' kontrol');
console.log(zpravy.join('\n'));
await prohlizec.close();
if (chyb) { console.error(`\n${chyb} NEPROŠLO.`); process.exit(1); }
console.log('\nVšechny prošly.\n');
process.exit(0);   // zkušební server jinak drží běh naživu
