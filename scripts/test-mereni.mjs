/* Test: měření návštěvnosti počítá, co má, a neodesílá, co nemá.
   ==================================================================
   Spuštění: node scripts/test-mereni.mjs
     (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=…/chrome)

   js/mereni.js je na 2 177 stránkách a posílá do databáze. Dvě věci se
   tedy musí držet úplně přesně:

     A) NEODESLAT NIC, CO NEMÁ ODEJÍT. Mimo ostrý web, při „nesledovat",
        v automatizovaném prohlížeči. Kdyby se měřilo z localhostu
        a ze zkoušek, byla by čísla k ničemu — a to je horší než je
        nemít, protože se podle nich rozhoduje.
     B) NEPOSLAT NIC OSOBNÍHO. Z odkazujícího jen doména. Celá adresa
        umí nést jméno (odkaz z pošty, ze sdílené konverzace), takže se
        zahazuje v prohlížeči a na server nesmí dorazit vůbec.

   Měří se na podstrčené doméně parcelaka.cz — jinak by se kontrolovalo
   jen to, že stráž na localhostu mlčí, a nikdy to, co se posílá doopravdy.
   ================================================================== */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pricinaChyb } from './chyby-hlaska.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

const TYPY = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };

const PW = process.env.PW_CHROMIUM;
const browser = await chromium.launch(PW ? { executablePath: PW } : {});

/* Otevře stránku, jako by běžela na parcelaka.cz, a vrátí, co odletělo
   do zapis_navstevu. `nastav` smí před načtením dosadit vlastní stráže
   (nesledovat, webdriver…). */
async function otevri(stranka, nastav) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const poslano = [];
  /* Celý web se servíruje z disku pod jménem parcelaka.cz. */
  await ctx.route('https://parcelaka.cz/**', (r) => {
    const u = new URL(r.request().url());
    const rel = decodeURIComponent(u.pathname).replace(/^\//, '') || 'index.html';
    const f = path.join(KOREN, rel);
    if (!f.startsWith(KOREN) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return r.fulfill({ status: 404, body: '' });
    return r.fulfill({ status: 200, contentType: TYPY[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) });
  });
  /* Databáze: zachytit volání a odpovědět prázdnem. */
  await ctx.route('**/rest/v1/rpc/zapis_navstevu*', (r) => {
    let telo = null;
    try { telo = JSON.parse(r.request().postData() || '{}'); } catch (e) { telo = { nelzePrecist: true }; }
    poslano.push({ telo, adresa: r.request().url() });
    return r.fulfill({ status: 204, body: '' });
  });
  /* Nic jiného ven nepouštět — ať se nepozná měření od cizího volání. */
  for (const v of ['**://*.tile.*/**', '**://*.openstreetmap.org/**', '**/_vercel/**']) {
    await ctx.route(v, (r) => r.fulfill({ status: 204, body: '' })).catch(() => {});
  }
  /* PLAYWRIGHT JE PODLE PROHLÍŽEČE ROBOT a js/mereni.js roboty schválně
     nepočítá — jinak by čísla nafoukly vlastní zkoušky. Pro případy,
     kde se MÁ měřit, se tedy musí tvářit jako člověk; že stráž na
     roboty funguje, ověřuje vlastní případ níž. */
  /* `configurable: true` je tu podstatné: bez něj by se druhé
     addInitScript (to z `nastav`) na téže vlastnosti rozbilo o tu
     první definici, tiše by ho spolkl try/catch a případ s robotem by
     měřil opak toho, co tvrdí. */
  await page.addInitScript(() => {
    try { Object.defineProperty(navigator, 'webdriver', { get: () => false, configurable: true }); } catch (e) {}
  });
  if (nastav) await page.addInitScript(nastav);
  await page.goto('https://parcelaka.cz/' + stranka, { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  await ctx.close();
  return poslano;
}

/* ---- A) co se posílá, když se posílat má --------------------------- */
const a = await otevri('kontakt.html');
pravda('na ostré doméně se měření odešle (právě jednou)', a.length === 1, `odesláno ${a.length}×`);
if (a.length) {
  const t = a[0].telo;
  pravda(`posílá jméno stránky („${t.p_stranka}")`, t.p_stranka === 'kontakt.html', JSON.stringify(t));
  pravda(`posílá druh displeje („${t.p_zarizeni}")`, t.p_zarizeni === 'stolni' || t.p_zarizeni === 'mobil', JSON.stringify(t));
  pravda('první stránka v relaci se počítá jako návštěva', t.p_prvni === true, JSON.stringify(t));
  pravda('a nic víc než čtyři pole neposílá',
    Object.keys(t).sort().join(',') === 'p_prvni,p_stranka,p_zarizeni,p_zdroj',
    'pole: ' + Object.keys(t).join(', '));
}

/* ---- B) z odkazujícího jen doména ---------------------------------- */
const b = await otevri('kontakt.html', () => {
  Object.defineProperty(document, 'referrer', {
    get: () => 'https://mail.seznam.cz/tajna-slozka?token=abc123&email=jan.novak%40seznam.cz',
  });
});
if (b.length) {
  const z = b[0].telo.p_zdroj;
  pravda(`z odkazu zbyde jen doména („${z}")`, z === 'mail.seznam.cz', `posláno „${z}"`);
  pravda('a nic z cesty, parametrů ani adresy v nich',
    !/token|email|jan|novak|tajna|\/|\?|=/.test(String(z)),
    `v poli zdroj stojí „${z}" — tohle by byl osobní údaj v databázi`);
} else {
  pravda('měření s odkazujícím odešlo', false, 'nic neodletělo, zkouška B nic neměří');
}

/* Proklik v rámci webu není zdroj návštěvy. */
const c = await otevri('kontakt.html', () => {
  Object.defineProperty(document, 'referrer', { get: () => 'https://parcelaka.cz/index.html' });
});
pravda('vlastní web se jako zdroj nepočítá', c.length === 1 && c[0].telo.p_zdroj === '',
  c.length ? `posláno „${c[0].telo.p_zdroj}"` : 'nic neodletělo');

/* ---- C) kdy se nesmí poslat nic ------------------------------------ */
const dnt = await otevri('kontakt.html', () => {
  Object.defineProperty(navigator, 'doNotTrack', { get: () => '1' });
});
pravda('„nesledovat" (DNT) měření úplně vypne', dnt.length === 0, `přesto odesláno ${dnt.length}×`);

const gpc = await otevri('kontakt.html', () => {
  Object.defineProperty(navigator, 'globalPrivacyControl', { get: () => true });
});
pravda('Global Privacy Control taky', gpc.length === 0, `přesto odesláno ${gpc.length}×`);

/* Robot se nepočítá — tohle je ta stráž, kterou si otevri() vypíná. */
const robot = await otevri('kontakt.html', () => {
  try { Object.defineProperty(navigator, 'webdriver', { get: () => true, configurable: true }); } catch (e) {}
});
pravda('automatizovaný prohlížeč se nepočítá (vlastní zkoušky nekazí čísla)',
  robot.length === 0, `přesto odesláno ${robot.length}×`);

/* ---- D) mimo ostrý web ---------------------------------------------- */
{
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  const poslano = [];
  await ctx.route('**/rest/v1/rpc/zapis_navstevu*', (r) => { poslano.push(1); return r.fulfill({ status: 204, body: '' }); });
  await ctx.route('http://127.0.0.1:8777/**', (r) => {
    const rel = decodeURIComponent(new URL(r.request().url()).pathname).replace(/^\//, '') || 'index.html';
    const f = path.join(KOREN, rel);
    if (!f.startsWith(KOREN) || !fs.existsSync(f)) return r.fulfill({ status: 404, body: '' });
    return r.fulfill({ status: 200, contentType: TYPY[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) });
  });
  await page.goto('http://127.0.0.1:8777/kontakt.html', { waitUntil: 'load' });
  await page.waitForTimeout(1200);
  pravda('z localhostu se neměří (jinak by čísla počítala vývoj a zkoušky)',
    poslano.length === 0, `přesto odesláno ${poslano.length}×`);
  await ctx.close();
}

/* ---- E) pokrytí stránek a obsah migrace ---------------------------- */
const stranky = fs.readdirSync(KOREN).filter((f) => f.endsWith('.html'));
const s = stranky.filter((f) => /<script src="js\/(min\/)?mereni\.js/.test(fs.readFileSync(path.join(KOREN, f), 'utf8')));
pravda(`měření je skoro na všech stránkách (${s.length} z ${stranky.length})`,
  s.length > stranky.length - 10, `jen ${s.length}`);
/* 404 schválně ne: musí se zobrazit, i když je web rozbitý, takže si
   nenačítá vůbec nic. Diagnostika a přesměrovací útržky taky ne. */
pravda('404.html měření nemá (musí jít zobrazit i při rozbitém webu)',
  !/mereni\.js/.test(fs.readFileSync(path.join(KOREN, '404.html'), 'utf8')), '404 si načítá měření');

const sql = fs.readFileSync(path.join(KOREN, 'supabase', 'navstevnost.sql'), 'utf8');
pravda('tabulka nemá sloupec, do kterého by šel uložit člověk',
  !/\b(ip|ip_adresa|user_agent|user_id|email|session|cookie|fingerprint)\b/i.test(sql.split('create table')[1].split(');')[0]),
  'v tabulce je sloupec, který umí identifikovat návštěvníka');
/* ZAPSAT SMÍ KDOKOLI, PŘEČÍST SOUHRN NIKDO Z PROHLÍŽEČE.
   Tahle odrážka dřív hlídala „číst smí jen přihlášený" — a bylo to
   málo: přihlásit se může kdokoli, takže statistiku návštěvnosti webu
   si mohl přečíst každý, kdo si založil účet. Teď je `prehled_
   navstevnosti` jen pro service_role, tedy pro běh v CI, a z webu ho
   nepřečte ani přihlášený. Zapisovat musí umět i nepřihlášený, jinak
   by se měřili jen uživatelé s účtem a čísla by lhala. */
/* VZOREK SE MUSÍ DRŽET V JEDNÉ VĚTĚ SQL, proto [^;]* a ne [\s\S]*?.
   S [\s\S]*? hledání přeběhlo přes konec příkazu a sedlo na grant
   NĚJAKÉ JINÉ funkce dál v souboru: zkusil jsem revoke u
   prehled_navstevnosti zúžit na „from public" a kontrola prošla
   zeleně, protože si našla „from public, anon, authenticated" až
   u uklid_navstevnosti. Tutéž chybu měla i původní podoba téhle
   odrážky, takže hlídala slabší věc, než o které mluvila. */
const veta = (re) => {
  const m = new RegExp(re.source + '[^;]*', re.flags).exec(sql);
  return m ? m[0] : '';
};
const gZapis = veta(/grant execute on function zapis_navstevu/);
const gPrehled = veta(/grant execute on function prehled_navstevnosti/);
const rPrehled = veta(/revoke all on function prehled_navstevnosti/);
pravda('zapsat návštěvu smí i nepřihlášený',
  /\bto anon, authenticated\b/.test(gZapis),
  'bez toho by se měřili jen přihlášení — ' + (gZapis || 'grant vůbec není'));
pravda('souhrn nepřečte z prohlížeče nikdo — ani přihlášený',
  /\bto service_role\b/.test(gPrehled) && !/\b(anon|authenticated)\b/.test(gPrehled),
  'souhrn je dostupný z prohlížeče: ' + (gPrehled || 'grant vůbec není'));
pravda('a zákaz je vysloven proti všem třem rolím',
  /from public, anon, authenticated/.test(rPrehled),
  'revoke jen od public nestačí — Supabase dává anon i authenticated přímý grant: '
  + (rPrehled || 'revoke vůbec není'));
pravda('a je to v balíku supabase/00-vse.sql',
  fs.readFileSync(path.join(KOREN, 'supabase', '00-vse.sql'), 'utf8').includes('zapis_navstevu'),
  'migrace by se při nasazení přeskočila');

/* ---- F) zásady soukromí popisují to, co se opravdu děje ------------
   scripts/test-cizi-servery.mjs hlídá jinou osu: kdo se o návštěvě
   dozví tím, že se z něj něco stahuje. Tahle odrážka neprasklo —
   měření totiž žádný cizí server nestahuje. Zásady přesto roky
   slibovaly „anonymní statistiky návštěvnosti" od Vercelu a GitHub
   Pages, a neměřilo se nic. Dokument o zpracování osobních údajů
   nemá popisovat ani víc, ani míň, než co kód dělá. */
{
  const z = fs.readFileSync(path.join(KOREN, 'ochrana-udaju.html'), 'utf8')
    .replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  const meriSe = fs.existsSync(path.join(KOREN, 'js', 'mereni.js'))
    && /<script src="js\/(min\/)?mereni\.js/.test(fs.readFileSync(path.join(KOREN, 'index.html'), 'utf8'));
  pravda('web návštěvnost opravdu měří (jinak následující nic neznamená)', meriSe,
    'js/mereni.js chybí nebo ho index nenačítá');
  pravda('zásady měření popisují', /návštěvnost/i.test(z) && /čítač|zvýší|počítáme/i.test(z),
    'v zásadách o měření nic není — nepopsané zpracování osobních údajů');
  pravda('a říkají, co se NEukládá (cookie, IP, identifikátor)',
    /žádná cookie/i.test(z) && /žádná IP/i.test(z) && /identifikátor/i.test(z),
    'chybí výčet toho, co se neukládá — to je u čítačů ta podstatná věta');
  pravda('a že „nesledovat" měření vypne', /nesledovat|Global Privacy Control|DNT/i.test(z),
    'respekt k DNT není nikde napsaný');
  pravda('a NEtvrdí, že statistiky dělá Vercel nebo GitHub Pages',
    !/(Vercel|GitHub\s*Pages)[^.]{0,80}statistik/i.test(z),
    'zásady jmenují zpracovatele, který s měřením nemá nic společného — přesně tahle věta tam roky stála nepravdivě');
}

await browser.close();
console.log('\nMěření návštěvnosti');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Měření: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
process.exit(0);
