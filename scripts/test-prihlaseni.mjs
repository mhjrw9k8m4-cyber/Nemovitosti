// Test: web nesmí člověka odhlašovat sám od sebe.
//
// Spuštění: node scripts/test-prihlaseni.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome)
//
// „Web mě pořád odhlašuje." Měly na tom podíl dvě věci v js/auth.js:
//
// 1) OBNOVOVACÍ TOKEN JE JEDNORÁZOVÝ. Server ho po použití vymění za nový,
//    starý zneplatní. Funkce keepAlive() ho přitom pálila při KAŽDÉM načtení
//    stránky, a volá se na pěti různých stránkách. Kdo prošel z „Moje
//    inzeráty" do „Zprávy", spustil dvě obnovení hned za sebou — to druhé
//    poslalo token, který už byl spotřebovaný, server ho odmítl a přihlášení
//    bylo pryč. Totéž stačilo vyrobit dvěma otevřenými kartami.
//
// 2) JAKÁKOLI NEÚSPĚŠNÁ ODPOVĚĎ SESSION SMAZALA. Jenže 503 od serveru, 429
//    „moc požadavků" nebo výpadek sítě v tunelu neznamenají, že přihlášení
//    neplatí. Znamenají „zkus to za chvíli".
//
// Obojí se tu zkouší proti podstrčenému serveru, který se chová jako
// Supabase — včetně toho, že obnovovací token použije jen jednou.
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { pricinaChyb } from './chyby-hlaska.mjs';

let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* Falešný Supabase. Hlídá si, kolikrát se kdo pokusil obnovit a jestli
   nepoužil už spotřebovaný token — přesně jako ten skutečný. */
let stav;
let cekajiciOdpovedi = [];
function pustZadrzene() {
  const v = cekajiciOdpovedi; cekajiciOdpovedi = [];
  for (const f of v) f();
}
function resetStav() {
  stav = { platnyToken: 'r1', pocetObnov: 0, pouzite: new Set(), odpoved: 'ok', poradi: [],
    /* Kolik odpovědí na obnovu se zadrží a pustí NARÁZ. Nula = odpovídá se
       hned (tak se chová server při jediné stránce). Dvojka vyrábí to, co
       se děje doopravdy při dvou kartách: oba prohlížeče dostanou odpověď
       v tutéž chvíli. Bez toho se závod skoro nikdy nestihne — pod zátěží
       vyšel jednou ze třiceti pokusů, při odpovědích naráz desetkrát
       z dvaceti. */
    drzObnovy: 0 };
  cekajiciOdpovedi = [];
}
resetStav();
const server = createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.setHeader('Access-Control-Allow-Methods', '*');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
    if (req.url.indexOf('/auth/v1/token') === 0) {
      let telo = {};
      try { telo = JSON.parse(Buffer.concat(chunks).toString() || '{}'); } catch (e) {}
      stav.pocetObnov++;
      stav.poradi.push(telo.refresh_token);
      if (stav.odpoved === '503') { res.writeHead(503, { 'Content-Type': 'application/json' }); return res.end('{"msg":"upstream"}'); }
      if (stav.odpoved === '429') { res.writeHead(429, { 'Content-Type': 'application/json' }); return res.end('{"msg":"rate limit"}'); }
      let posli;
      if (stav.pouzite.has(telo.refresh_token) || telo.refresh_token !== stav.platnyToken) {
        posli = () => { res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end('{"error":"invalid_grant","error_description":"Invalid Refresh Token: Already Used"}'); };
      } else {
        stav.pouzite.add(telo.refresh_token);
        stav.platnyToken = 'r' + (stav.pocetObnov + 1);
        const novyToken = stav.platnyToken, novyAccess = 'a' + stav.pocetObnov;
        posli = () => { res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ access_token: novyAccess, refresh_token: novyToken,
            expires_in: 3600, user: { id: 'u1', email: 'test@example.invalid' } })); };
      }
      if (!stav.drzObnovy) return posli();
      cekajiciOdpovedi.push(posli);
      if (cekajiciOdpovedi.length >= stav.drzObnovy) pustZadrzene();
      else setTimeout(() => { if (cekajiciOdpovedi.length) pustZadrzene(); }, 900);
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{}');
  });
});
await new Promise((r) => server.listen(8399, '127.0.0.1', r));

const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));

/** Stránka s načteným auth.js a uloženým přihlášením. */
async function sPrihlasenim(vyprsiZa) {
  const ctx = await prohlizec.newContext();
  const p = await ctx.newPage();
  await p.goto('http://127.0.0.1:8399/prazdno');
  await p.evaluate((v) => {
    localStorage.setItem('pk_auth', JSON.stringify({
      access_token: 'a0', refresh_token: 'r1',
      expires_at: Math.floor(Date.now() / 1000) + v,
      user: { id: 'u1', email: 'test@example.invalid' },
    }));
    window.PK_SUPABASE_URL = 'http://127.0.0.1:8399';
    window.PK_SUPABASE_KEY = 'anon';
  }, vyprsiZa);
  await p.addScriptTag({ path: new URL('../js/auth.js', import.meta.url).pathname });
  return { ctx, p };
}
const jePrihlasen = (p) => p.evaluate(() => !!(window.PKAuth && PKAuth.loggedIn()));

// --- 1) Platné přihlášení se zbytečně neobnovuje ----------------------
{
  resetStav();
  const { ctx, p } = await sPrihlasenim(3600);      // platí ještě hodinu
  for (let i = 0; i < 5; i++) await p.evaluate(() => PKAuth.keepAlive());
  await p.waitForTimeout(300);
  pravda('platné přihlášení se při každém načtení neobnovuje', stav.pocetObnov === 0,
    `server dostal ${stav.pocetObnov} žádostí o obnovu — každá spálí jednorázový token`);
  pravda('a člověk zůstává přihlášený', await jePrihlasen(p));
  await ctx.close();
}

// --- 2) Když platnost dochází, obnoví se (a jen jednou) ---------------
{
  resetStav();
  const { ctx, p } = await sPrihlasenim(60);        // zbývá minuta
  await p.evaluate(() => Promise.all([PKAuth.keepAlive(), PKAuth.keepAlive(), PKAuth.keepAlive()]));
  await p.waitForTimeout(400);
  pravda('před vypršením se přihlášení obnoví', stav.pocetObnov >= 1, 'neobnovilo se vůbec');
  pravda('a tři žádosti naráz vyrobí jen jednu obnovu', stav.pocetObnov === 1,
    `server dostal ${stav.pocetObnov} — druhá by poslala už spotřebovaný token`);
  pravda('po obnově je člověk pořád přihlášený', await jePrihlasen(p));
  await ctx.close();
}

// --- 3) Výpadek serveru NESMÍ odhlásit --------------------------------
for (const [kod, popis] of [['503', 'server má výpadek'], ['429', 'server hlásí „moc požadavků"']]) {
  resetStav();
  stav.odpoved = kod;
  const { ctx, p } = await sPrihlasenim(60);
  await p.evaluate(() => PKAuth.keepAlive());
  await p.waitForTimeout(400);
  pravda(`${popis} (${kod}) — přihlášení zůstane`, await jePrihlasen(p),
    'dočasná chyba serveru smazala přihlášení; to není „neplatíš", to je „zkus to za chvíli"');
  await ctx.close();
}

// --- 4) Když token opravdu neplatí, odhlásit se má --------------------
{
  resetStav();
  stav.platnyToken = 'jiny';    // uložený „r1" už neplatí
  const { ctx, p } = await sPrihlasenim(60);
  await p.evaluate(() => PKAuth.keepAlive());
  /* Čeká se dýl než dřív, a je to ta cena opravy níž (oddíl 6): než se
     session smaže, dá se sekunda druhé stránce, aby stihla zapsat nový
     token. Odhlášení tím nezmizelo, jen přijde o tu sekundu později. */
  await p.waitForTimeout(1600);
  pravda('neplatný token přihlášení ukončí', (await jePrihlasen(p)) === false,
    'tady se odhlásit MÁ — jinak by web tvrdil, že jste přihlášení, a nic by nešlo');
  await ctx.close();
}

// --- 5) Průchod webem: pět stránek za sebou ---------------------------
// Přesně to, co se dělo doopravdy — a co člověka vyhazovalo.
{
  resetStav();
  const ctx = await prohlizec.newContext();
  const p = await ctx.newPage();
  await p.goto('http://127.0.0.1:8399/prazdno');
  await p.evaluate(() => {
    localStorage.setItem('pk_auth', JSON.stringify({
      access_token: 'a0', refresh_token: 'r1',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: 'u1', email: 'test@example.invalid' } }));
  });
  for (let i = 0; i < 5; i++) {
    await p.goto('http://127.0.0.1:8399/prazdno');
    await p.evaluate(() => { window.PK_SUPABASE_URL = 'http://127.0.0.1:8399'; window.PK_SUPABASE_KEY = 'anon'; });
    await p.addScriptTag({ path: new URL('../js/auth.js', import.meta.url).pathname });
    await p.evaluate(() => PKAuth.keepAlive());
    await p.waitForTimeout(120);
  }
  pravda('po pěti stránkách je člověk pořád přihlášený', await jePrihlasen(p),
    `server dostal ${stav.pocetObnov} žádostí o obnovu; poslané tokeny: ${stav.poradi.join(', ')}`);
  pravda('a nespálilo se pět jednorázových tokenů', stav.pocetObnov <= 1,
    `obnov: ${stav.pocetObnov}`);
  await ctx.close();
}

/* --- 6) DVĚ STRÁNKY NARÁZ ------------------------------------------
 * To, co člověk hlásil jako „web mě pořád odhlašuje". Kontrola č. 2
 * hlídá dvě obnovy v JEDNÉ stránce — na to je proměnná probihaObnova.
 * Jenže web je vícestránkový: každé klepnutí na odkaz je nové načtení
 * a nová proměnná. Kdo klepne ve chvíli, kdy první stránka zrovna
 * obnovuje, pošle druhou obnovu se STARÝM tokenem. Supabase token při
 * obnově otáčí, takže starý tím okamžitě neplatí — a odpověď „invalid"
 * se brala jako „účet neplatí" a session se smazala.
 * Tady se ty dvě stránky spustí opravdu vedle sebe, ve stejném
 * prohlížeči, nad týmž localStorage.
 *
 * PROČ OSM POKUSŮ A PROČ ODPOVĚDI NARÁZ
 * Závod je zrádný v tom, že se do něj musí trefit: opozdilec čte
 * úložiště přesně ve chvíli, kdy do něj vítěz zapisuje. Naměřeno na
 * vadném kódu — při obyčejném odpovídání po sobě to padlo jednou ze
 * třiceti pokusů (a to teprve pod zátěží stroje), kdežto když server
 * pustí obě odpovědi NARÁZ, padalo to desetkrát z dvaceti. Jedna
 * obrátka by tedy vadu minula v polovině běhů; osm za sebou ji mine
 * jednou ze dvou set padesáti šesti. Opravený kód prošel 60 obrátkami
 * bez jediného odhlášení.
 */
{
  const POKUSU = 8;
  let odhlaseno = 0, prazdno = 0, bezZavodu = 0, duvod = '';
  for (let i = 0; i < POKUSU; i++) {
    resetStav();
    stav.drzObnovy = 2;          // obě odpovědi ve stejnou chvíli
    const ctx = await prohlizec.newContext();
    const zaloz = async () => {
      const p = await ctx.newPage();
      await p.goto('http://127.0.0.1:8399/prazdno');
      await p.evaluate(() => {
        if (!localStorage.getItem('pk_auth')) {
          localStorage.setItem('pk_auth', JSON.stringify({
            access_token: 'a0', refresh_token: 'r1',
            expires_at: Math.floor(Date.now() / 1000) + 60,
            user: { id: 'u1', email: 'test@example.invalid' },
          }));
        }
        window.PK_SUPABASE_URL = 'http://127.0.0.1:8399';
        window.PK_SUPABASE_KEY = 'anon';
      });
      await p.addScriptTag({ path: new URL('../js/auth.js', import.meta.url).pathname });
      return p;
    };
    const p1 = await zaloz();
    const p2 = await zaloz();
    /* Obě naráz. Jedna vyhraje, druhá dostane „tenhle token už byl
       použit" — a to NESMÍ nikoho odhlásit. */
    await Promise.all([
      p1.evaluate(() => PKAuth.keepAlive()).catch(() => {}),
      p2.evaluate(() => PKAuth.keepAlive()).catch(() => {}),
    ]);
    await p1.waitForTimeout(1500);   // vejde se do toho i čekání v auth.js
    if (stav.pocetObnov < 2) bezZavodu++;
    const obe = (await jePrihlasen(p1)) && (await jePrihlasen(p2));
    /* A pořád se dá pracovat: v úložišti musí zůstat POUŽITELNÝ token,
       ne prázdno. */
    const zbylo = await p1.evaluate(() => {
      try { return JSON.parse(localStorage.getItem('pk_auth') || 'null'); } catch (e) { return null; }
    });
    const maToken = !!(zbylo && zbylo.access_token && zbylo.refresh_token);
    if (!obe) odhlaseno++;
    if (!maToken) prazdno++;
    if ((!obe || !maToken) && !duvod) {
      duvod = `pokus ${i + 1}: přihlášen na obou ${obe}, v úložišti ${JSON.stringify(zbylo)}`
        + `, server dostal ${stav.pocetObnov} žádostí (${stav.poradi.join(', ')})`;
    }
    await ctx.close();
  }
  pravda(`závod se opravdu konal ve všech ${POKUSU} pokusech`, bezZavodu === 0,
    `v ${bezZavodu} pokusech se druhá stránka vůbec nepokusila — kontrola by neměla co ověřovat`);
  pravda(`a člověk zůstal přihlášený na obou (${POKUSU}× za sebou)`, odhlaseno === 0,
    `opozdilec se spotřebovaným tokenem smazal přihlášení, které platí — ${odhlaseno} z ${POKUSU}; ${duvod}`);
  pravda(`a v úložišti zůstal platný token, ne prázdno (${POKUSU}× za sebou)`, prazdno === 0,
    `prázdno v ${prazdno} z ${POKUSU}; ${duvod}`);
}

/* --- 7) OBNOVUJE SE NA KAŽDÉ STRÁNCE, NE JEN NA PĚTI --------------
 * keepAlive() volaly jen hlidani, zpravy, muj-inzerat, upozorneni
 * a pridat. Na úvodní stránce a na stránkách pozemků — tedy tam, kde
 * člověk tráví většinu času — se přihlášení neobnovovalo vůbec.
 * Volání je teď v hlavičce, která je na 2 050 z 2 055 stránek.
 */
{
  resetStav();
  const ctx = await prohlizec.newContext();
  const p = await ctx.newPage();
  await p.goto('http://127.0.0.1:8399/prazdno');
  await p.evaluate(() => {
    localStorage.setItem('pk_auth', JSON.stringify({
      access_token: 'a0', refresh_token: 'r1',
      expires_at: Math.floor(Date.now() / 1000) + 60,   // dochází
      user: { id: 'u1', email: 'test@example.invalid' },
    }));
    window.PK_SUPABASE_URL = 'http://127.0.0.1:8399';
    window.PK_SUPABASE_KEY = 'anon';
    // hlavička hledá tyhle prvky; bez nich by se překreslení vzdalo
    document.body.innerHTML = '<a id="nav-ucet"><span id="nav-stav">Nepřihlášeno</span></a>';
  });
  await p.addScriptTag({ path: new URL('../js/auth.js', import.meta.url).pathname });
  /* Nic mezi tím: jediné, co se načte navíc, je hlavička. Kdyby se
     obnova spustila odjinud, tahle kontrola by lhala. */
  const predHlavickou = stav.pocetObnov;
  await p.addScriptTag({ path: new URL('../js/hlavicka.js', import.meta.url).pathname });
  await p.waitForTimeout(800);
  pravda('před načtením hlavičky se nic neobnovovalo', predHlavickou === 0,
    `server dostal ${predHlavickou} žádostí ještě před hlavičkou`);
  pravda('samotná hlavička dochází platnost obnoví', stav.pocetObnov >= 1,
    'na stránce bez vlastního volání keepAlive() se přihlášení neobnoví — a tiše doběhne');
  pravda('a člověk zůstává přihlášený', await jePrihlasen(p));
  /* A na stránce, kde platnost NEdochází, se nic posílat nemá —
     jinak by se jednorázové tokeny pálily při každém načtení. */
  resetStav();
  const ctx2 = await prohlizec.newContext();
  const p2 = await ctx2.newPage();
  await p2.goto('http://127.0.0.1:8399/prazdno');
  await p2.evaluate(() => {
    localStorage.setItem('pk_auth', JSON.stringify({
      access_token: 'a0', refresh_token: 'r1',
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      user: { id: 'u1', email: 'test@example.invalid' },
    }));
    window.PK_SUPABASE_URL = 'http://127.0.0.1:8399';
    window.PK_SUPABASE_KEY = 'anon';
    document.body.innerHTML = '<a id="nav-ucet"><span id="nav-stav">Nepřihlášeno</span></a>';
  });
  await p2.addScriptTag({ path: new URL('../js/auth.js', import.meta.url).pathname });
  await p2.addScriptTag({ path: new URL('../js/hlavicka.js', import.meta.url).pathname });
  await p2.waitForTimeout(700);
  pravda('ale platné přihlášení hlavička zbytečně neobnovuje', stav.pocetObnov === 0,
    `server dostal ${stav.pocetObnov} žádostí — každá spálí jednorázový token`);
  await ctx.close(); await ctx2.close();
}

await prohlizec.close();
server.close();
console.log('\nPřihlášení — web nesmí odhlašovat sám od sebe');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Přihlášení: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy));
  process.exit(1);
}
process.exit(0);
