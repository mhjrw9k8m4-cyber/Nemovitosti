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
je('tlačítko menu to řekne i nevidomému',
  await pM.getAttribute('.nav-toggle', 'aria-label'), 'Otevřít menu — máte nepřečtené zprávy');
je('odznak u položky Zprávy existuje', (await pM.textContent('#nav-zpravy .nav-unread')).trim(), '1');
await pM.click('.nav-toggle');
je('po otevření menu je odznak vidět',
  await pM.locator('#nav-zpravy .nav-unread').isVisible(), true);
je('počet je i v titulku záložky', (await pM.title()).startsWith('(1) '), true);

// na širokém displeji je menu rozbalené, tam tečka překážet nemusí
const pSirs = await cMajitel.newPage();
await pSirs.setViewportSize({ width: 1280, height: 800 });
await pSirs.goto(`${BASE}/pozemky-okres-tabor.html`);
await pSirs.waitForSelector('#nav-zpravy .nav-unread', { timeout: 10000 });
je('na počítači je odznak rovnou vidět',
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

/* ---------- 7. žádné chyby v konzoli ---------- */
je('na stránkách nespadl žádný skript', chybyKonzole, []);

console.log('\nChat v prohlížeči: ' + (ok + chyb) + ' kontrol');
console.log(zpravy.join('\n'));
await prohlizec.close();
if (chyb) { console.error(`\n${chyb} NEPROŠLO.`); process.exit(1); }
console.log('\nVšechny prošly.\n');
process.exit(0);   // zkušební server jinak drží běh naživu
