#!/usr/bin/env node
/* CO OPRAVDU UVIDÍ ČLOVĚK — KONTROLA ŽIVÉHO WEBU V PROHLÍŽEČI
   ==================================================================
   Spuštění:
     node scripts/kontrola-ziva-prohlizecem.mjs
     node scripts/kontrola-ziva-prohlizecem.mjs --web https://parcelaka.cz
     node scripts/kontrola-ziva-prohlizecem.mjs --mistni     (vlastní server z repozitáře)
   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome)

   PROČ. `kontrola-nasazeni.mjs` se ptá přes HTTP: odpovídá web, je
   venku ta verze, nejsou data stará. Všech devět jejích kontrol projde
   i tehdy, když se na stránce skript ZHROUTÍ při načtení a člověk
   uvidí prázdno — protože HTML se stáhlo a razítka sedí. Tohle je
   ta nejnepříjemnější možná kombinace: zelená CI, zelená kontrola
   nasazení a mrtvý web. Chyběl krok, který stránku OPRAVDU OTEVŘE.

   Dva způsoby, jak takhle umřít, jsou v tomhle repozitáři na dosah:
     • CSP se skládá z hashů vložených skriptů (`scripts/csp.mjs`).
       Nasadí-li se HTML a skripty rozdílně, prohlížeč vložený skript
       ZABLOKUJE. Stránka se stáhne celá a je nepoužitelná.
     • výpis se dokresluje z dat. Selže-li to načtení, stránka má
       hlavičku, patu a mezi nimi nic — a nikomu nic nesvítí.

   CO SE MĚŘÍ (každý bod umí říct, co je špatně):
     1. úvodní stránka se otevře a je naše,
     2. při načtení NEVYLETÍ výjimka ze skriptu,
     3. CSP nic nezablokovala (měří se v prohlížeči, ne čtením hlavičky),
     4. žádný náš podřízený požadavek nevrátil 400 a víc,
     5. výpis se dokreslil — karty jsou,
     6. mapa se opravdu postavila (Leaflet si vyrobí své vrstvy),
     7. na telefonní šířce nic nepřetéká do stran,
     8. HLEDÁNÍ OPRAVDU FILTRUJE — a když nenajde nic, řekne to,
     9. stránka pozemku ze sitemapy se otevře, taky bez výjimky a bez
        zablokované CSP — tedy nasadily se i generované stránky,
    10. a na té stránce se dokreslí dlaždice s klíčovými čísly,
    11. a totéž u OKRESNÍ a KRAJSKÉ stránky — to jsou tři různé rodiny
        generovaných stránek a každá se skládá jinak. Na okresní
        a krajské lidé přicházejí z vyhledávačů, takže rozbitá okresní
        stránka je ztracený návštěvník, i když úvodní stránka běží.

   CO TENHLE SKRIPT NEDĚLÁ: neopravuje a nehádá. Nasazení se odsud
   vyvolat nedá; „zkusit to znovu" u cizí služby není oprava. Říká
   PŘESNĚ, co člověk uvidí jinak, a u pádu skriptu i jeho hlášku.

   Když se nezměří NIC, je to nález, ne úspěch. Prohlížeč, který se
   nespustí, nesmí vypadat jako web, který je v pořádku.
   ================================================================== */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const arg = (jm, vychozi) => {
  const i = process.argv.indexOf(jm);
  if (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) return process.argv[i + 1];
  const s = process.argv.find((a) => a.startsWith(jm + '='));
  return s ? s.slice(jm.length + 1) : vychozi;
};
const MISTNI = process.argv.includes('--mistni');
const PORT_MISTNI = 8416;
const LIMIT = Math.max(5, parseInt(arg('--limit-s', process.env.PK_LIMIT_S || '45'), 10) || 45);
const MIN_KARET = Math.max(1, parseInt(arg('--min-karet', '1'), 10) || 1);

const dobre = [], vady = [], nezmereno = [];
const ANO = (t) => dobre.push(t);
const NE = (co, proc) => vady.push(`${co} — ${proc}`);
const NEVIM = (co, proc) => nezmereno.push(`${co} — ${proc}`);

/* ---- případný vlastní server (jen --mistni) ----------------------- */
const TYPY = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8', '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png' };
let server = null;
if (MISTNI) {
  server = http.createServer((req, res) => {
    const u = decodeURIComponent(req.url.split('?')[0]);
    const f = path.join(KOREN, u === '/' ? 'index.html' : u.replace(/^\/+/, ''));
    if (!f.startsWith(KOREN) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
      res.writeHead(404); res.end('ne'); return;
    }
    res.writeHead(200, { 'content-type': TYPY[path.extname(f)] || 'application/octet-stream' });
    fs.createReadStream(f).pipe(res);
  });
  await new Promise((r) => server.listen(PORT_MISTNI, '127.0.0.1', r));
}
const WEB = MISTNI
  ? `http://127.0.0.1:${PORT_MISTNI}`
  : String(arg('--web', process.env.PK_WEB || 'https://www.parcelaka.cz')).replace(/\/+$/, '');

/* ---- prohlížeč ---------------------------------------------------- */
let chromium = null;
try { ({ chromium } = await import('playwright-core')); } catch (e) {
  NEVIM('prohlížeč', `playwright-core se nenačetl (${e.message})`);
}
let prohlizec = null;
if (chromium) {
  try {
    prohlizec = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
  } catch (e) {
    NEVIM('prohlížeč', `nespustil se (${e.message}) — v sandboxu je potřeba PW_CHROMIUM`);
  }
}

/* Jedno otevření stránky = jeden sběr všeho, co se při něm pokazilo.
   Vrací { chyby, csp, spatne, strana } nebo null, když se to nezdařilo. */
async function otevri(adresa, sirka = 1280) {
  const kontext = await prohlizec.newContext({ viewport: { width: sirka, height: 900 } });
  const strana = await kontext.newPage();
  const chyby = [], csp = [], spatne = [];
  strana.on('pageerror', (e) => chyby.push(String(e.message || e).slice(0, 200)));
  strana.on('console', (m) => {
    const t = m.text();
    /* Prohlížeč hlásí zablokování CSP do konzole; `securitypolicyviolation`
       navíc odchytáváme uvnitř stránky (níž), protože konzolová hláška
       se dá v některých verzích zahodit. */
    if (/Content Security Policy|Refused to (execute|load|apply)/i.test(t)) csp.push(t.slice(0, 200));
  });
  strana.on('response', (r) => {
    if (r.status() >= 400 && r.url().startsWith(WEB)) spatne.push(`${r.status()} ${r.url().slice(WEB.length) || '/'}`);
  });
  await strana.addInitScript(() => {
    window.__pkCSP = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      window.__pkCSP.push(`${e.violatedDirective}: ${e.blockedURI || '(vložený kód)'}`);
    });
  });
  let odpoved = null;
  try {
    odpoved = await strana.goto(adresa, { waitUntil: 'load', timeout: LIMIT * 1000 });
  } catch (e) {
    await kontext.close();
    return { selhalo: String(e.message || e).slice(0, 200) };
  }
  return { strana, kontext, chyby, csp, spatne, stav: odpoved ? odpoved.status() : 0 };
}
async function cspZeStranky(v) {
  const vnitrni = await v.strana.evaluate(() => window.__pkCSP || []).catch(() => []);
  return [...new Set([...v.csp, ...vnitrni])];
}

if (prohlizec) {
  /* ---- 1-7: úvodní stránka --------------------------------------- */
  const u = await otevri(`${WEB}/`);
  if (u.selhalo) {
    NE('úvodní stránka se v prohlížeči neotevřela', u.selhalo);
  } else {
    if (u.stav && u.stav >= 400) NE('úvodní stránka', `vrátila ${u.stav}`);
    const titulek = await u.strana.title().catch(() => '');
    if (/parcel/i.test(titulek)) ANO(`úvodní stránka je naše („${titulek.slice(0, 40)}")`);
    else NE('úvodní stránka není naše', `titulek je „${titulek.slice(0, 60)}"`);

    /* výpis se dokresluje z dat — na karty se čeká, ne hádá */
    await u.strana.waitForSelector('.opp-item', { timeout: Math.min(25000, LIMIT * 1000) }).catch(() => {});
    const karet = await u.strana.evaluate(() => document.querySelectorAll('.opp-item').length).catch(() => -1);
    if (karet >= MIN_KARET) ANO(`výpis se dokreslil — ${karet} karet`);
    else if (karet === 0) NE('výpis zůstal prázdný', 'stránka má hlavičku a patu a mezi nimi nic — přesně ten případ, kvůli kterému tahle kontrola vznikla');
    else NEVIM('výpis', 'počet karet se nepodařilo přečíst');

    /* MAPA: Leaflet si při postavení vyrobí vlastní vrstvy.
       Mapa se staví až ve chvíli, kdy je na dohled, takže se k ní musí
       nejdřív posunout (to je úmysl, viz oddíl 30).
       NEHLEDÁ SE waitForSelectorem: vrstvy Leafletu (`.leaflet-pane`)
       mají position:absolute a NULOVÝ rozměr, takže je prohlížeč
       i Playwright považují za NEVIDITELNÉ a čekání na ně vyprší i na
       mapě, která se postavila správně. Právě na tomhle tahle kontrola
       nejdřív hlásila nepostavenou mapu na webu, kde byla v pořádku.
       Ptá se proto na to, co mapu opravdu popisuje: kontejner má třídu
       od Leafletu a aspoň jednu vrstvu. */
    await u.strana.evaluate(() => document.querySelector('#mapa')?.scrollIntoView()).catch(() => {});
    const mapa = await u.strana.waitForFunction(() => {
      const m = document.querySelector('#leaflet-map');
      return !!m && m.classList.contains('leaflet-container')
        && m.querySelectorAll('.leaflet-pane').length > 0;
    }, null, { timeout: Math.min(20000, LIMIT * 1000) }).then(() => true).catch(() => false);
    if (mapa) ANO('mapa se postavila (Leaflet má své vrstvy)');
    else NE('mapa se nepostavila', 'v #leaflet-map není ani jedna vrstva Leafletu — buď se knihovna nestáhla, nebo ji něco zablokovalo');

    /* přetečení do stran na telefonní šířce */
    await u.strana.setViewportSize({ width: 390, height: 844 }).catch(() => {});
    const pretek = await u.strana.evaluate(() =>
      document.documentElement.scrollWidth - window.innerWidth).catch(() => null);
    if (pretek === null) NEVIM('přetečení do stran', 'nezměřilo se');
    else if (pretek <= 2) ANO(`na 390 px nic nepřetéká (přes okraj ${pretek} px)`);
    else NE('na 390 px stránka přetéká do stran', `o ${pretek} px — na telefonu se web posouvá do prázdna`);

    /* HLEDÁNÍ: měří se tím, co je NEZÁVISLÉ NA DATECH — nesmyslný
       dotaz. Kdyby se hledalo podle jména obce, zkouška by platila jen
       do chvíle, kdy ta obec z nabídek vypadne. Nesmysl musí dát nulu
       VŽDY; kdyby zůstal původní počet, hledání nefiltruje vůbec.
       A pak se pole vyprázdní: výpis se musí vrátit. Hledání, které
       seznam zničí, je horší než hledání, které nehledá. */
    await u.strana.setViewportSize({ width: 1280, height: 900 }).catch(() => {});
    const hledani = await u.strana.$('#map-search');
    if (!hledani) NE('hledání', 'na stránce není pole #map-search');
    else if (karet < 1) NEVIM('hledání', 'nebylo co filtrovat — výpis je prázdný');
    else {
      await hledani.fill('xyzxyz-tenhle-dotaz-nic-nenajde').catch(() => {});
      const nula = await u.strana.waitForFunction(
        () => document.querySelectorAll('.opp-item').length === 0,
        null, { timeout: Math.min(15000, LIMIT * 1000) }).then(() => true).catch(() => false);
      const rekloTo = await u.strana.evaluate(
        () => /nenalezeno|nic jsme nenašli|žádn/i.test(document.body.innerText)).catch(() => false);
      await hledani.fill('').catch(() => {});
      const zpatky = await u.strana.waitForFunction(
        (p) => document.querySelectorAll('.opp-item').length >= p,
        karet, { timeout: Math.min(15000, LIMIT * 1000) }).then(() => true).catch(() => false);

      if (!nula) {
        const po = await u.strana.evaluate(() => document.querySelectorAll('.opp-item').length).catch(() => -1);
        NE('hledání nefiltruje', `po nesmyslném dotazu zůstalo ${po} karet z ${karet}`);
      } else if (!rekloTo) {
        NE('hledání nenašlo nic a mlčí o tom', 'výpis je prázdný a na stránce není ani slovo o tom,'
          + ' že se nic nenašlo — člověk neví, jestli hledá, nebo je web rozbitý');
      } else if (!zpatky) {
        NE('po vymazání dotazu se výpis nevrátil', `bylo ${karet} karet, po vyprázdnění pole se nevrátily`);
      } else ANO(`hledání filtruje (nesmysl → 0, prázdné pole → zpět na ${karet})`);
    }

    if (u.chyby.length === 0) ANO('při načtení úvodní stránky nevyletěla výjimka');
    else NE('skript na úvodní stránce spadl', u.chyby.join(' | '));
    const cspU = await cspZeStranky(u);
    if (cspU.length === 0) ANO('CSP na úvodní stránce nic nezablokovala');
    else NE('CSP zablokovala něco na úvodní stránce', cspU.join(' | ')
      + ' — tohle vzniká, když se HTML a skripty nasadí rozdílně');
    if (u.spatne.length === 0) ANO('žádný náš požadavek nevrátil 400 a víc');
    else NE('část stránky se nestáhla', [...new Set(u.spatne)].slice(0, 5).join(', '));
    await u.kontext.close();
  }

  /* ---- 8: generovaná stránka pozemku ze sitemapy ----------------- */
  let cesta = null;
  let adresySitemapy = [];
  try {
    const sm = await fetch(`${WEB}/sitemap.xml`, { signal: AbortSignal.timeout(LIMIT * 1000) });
    /* Rozdíl, na kterém záleží: nestažená sitemapa znamená „tohle jsem
       nezměřil", ne „generované stránky jsou rozbité". Hlásit obojí
       stejně = posílat člověka hledat vadu, která není. (Že sitemapa
       venku JE, hlídá kontrola nasazení, bod 6.) */
    const text = sm.ok ? await sm.text() : '';
    if (!sm.ok) NEVIM('stránka pozemku', `sitemap.xml vrátila ${sm.status}`);
    adresySitemapy = [...text.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
    const vse = adresySitemapy.filter((a) => /\/pozemek-/.test(a));
    if (vse.length) {
      /* Bere se CESTA, ne celá adresa: na živém webu je v sitemapě
         kanonická doména, ale měřit se může i jiná (--mistni, náhled). */
      const cela = vse[Math.floor(Math.random() * vse.length)];
      cesta = cela.replace(/^https?:\/\/[^/]+/, '');
    } else if (sm.ok) NEVIM('stránka pozemku', 'v sitemapě není ani jedna adresa pozemku');
  } catch (e) {
    NEVIM('stránka pozemku', `sitemap.xml se nestáhla (${e.message})`);
  }
  if (cesta) {
    const p = await otevri(`${WEB}${cesta}`);
    if (p.selhalo) NE(`stránka pozemku ${cesta} se neotevřela`, p.selhalo);
    else {
      if (p.chyby.length === 0) ANO(`stránka pozemku ${cesta} se otevřela bez výjimky`);
      else NE(`skript na stránce pozemku ${cesta} spadl`, p.chyby.join(' | '));
      const cspP = await cspZeStranky(p);
      if (cspP.length === 0) ANO('CSP na stránce pozemku nic nezablokovala');
      else NE('CSP zablokovala něco na stránce pozemku', cspP.join(' | '));

      /* DLAŽDICE S KLÍČOVÝMI ČÍSLY se dokreslují z dat stránky, takže
         jsou tím nejlepším důkazem, že se na detailu opravdu něco
         stalo. Dvě stránky je ale NEMAJÍ PRÁVEM: ukončená nabídka a
         rozcestí na novou adresu (třída `pz-konec`) detail nekreslí.
         Na nich je to NEZMĚŘENO, ne vada — hlásit to stejně znamená
         posílat člověka hledat vadu, která není. */
      const konec = await p.strana.evaluate(() => !!document.querySelector('.pz-konec')).catch(() => false);
      if (konec) NEVIM('dlaždice na stránce pozemku', 'stránka je ukončená nabídka nebo rozcestí — detail se na ní nekreslí');
      else {
        const dlazdic = await p.strana.waitForFunction(
          () => document.querySelectorAll('.pz-klic b').length,
          null, { timeout: Math.min(20000, LIMIT * 1000) })
          .then((h) => h.jsonValue()).catch(() => 0);
        if (dlazdic > 0) ANO(`dlaždice s klíčovými čísly se dokreslily (${dlazdic})`);
        else NE('dlaždice s klíčovými čísly se nedokreslily', 'detail pozemku zůstal bez čísel,'
          + ' podle kterých se člověk rozhoduje — data stránky se nenačetla, nebo se na nich skript zastavil');
      }
      await p.kontext.close();
    }
  }
  /* ---- 11: okresní a krajská stránka ----------------------------- */
  /* TŘI RODINY, NE JEDNA. Stránka pozemku, okresní a krajská se skládají
     jiným generátorem a jiným řezem dat, takže jedna z nich může být
     rozbitá, zatímco druhé dvě běží. Měří se na nich to, co je u nich
     důkazem, že se opravdu něco dokreslilo: seznam míst (`.okr-item`).
     Kdyby se měřily karty jako na úvodu, hlásilo by se prázdno vždycky
     — tyhle stránky karty nemají. */
  for (const [jmeno, vzor] of [
    ['okresní stránka', /pozemky-okres-[^<]*/],
    ['krajská stránka', /pozemky-[a-z-]+-kraj\.html/],
  ]) {
    const nalezene = adresySitemapy.filter((a) => vzor.test(a));
    if (!nalezene.length) { NEVIM(jmeno, 'v sitemapě pro ni není ani jedna adresa'); continue; }
    const cesta2 = nalezene[Math.floor(Math.random() * nalezene.length)]
      .replace(/^https?:\/\/[^/]+/, '');
    const o = await otevri(`${WEB}${cesta2}`);
    if (o.selhalo) { NE(`${jmeno} ${cesta2} se neotevřela`, o.selhalo); continue; }
    if (o.chyby.length) NE(`skript na ${jmeno} ${cesta2} spadl`, o.chyby.join(' | '));
    const cspO = await cspZeStranky(o);
    if (cspO.length) NE(`CSP zablokovala něco na ${jmeno} ${cesta2}`, cspO.join(' | '));
    const mist = await o.strana.waitForFunction(
      () => document.querySelectorAll('.okr-item').length,
      null, { timeout: Math.min(20000, LIMIT * 1000) })
      .then((h) => h.jsonValue()).catch(() => 0);
    if (mist > 0 && !o.chyby.length && !cspO.length) {
      ANO(`${jmeno} ${cesta2} se dokreslila (${mist} míst)`);
    } else if (mist === 0) {
      NE(`${jmeno} ${cesta2} zůstala bez seznamu míst`,
        'nedokreslil se ani jeden odkaz na místo — řez dat se nenačetl,'
        + ' nebo se na stránce zastavil skript');
    }
    await o.kontext.close();
  }

  /* ---- 12: SE ZAPNUTÝM SERVICE WORKEREM MUSÍ JÍT NAVIGACE ---------
     31. 10. ráno majitel klepl na webu na cokoli a Safari odpovědělo
     „Response served by service worker has redirections" — bílá
     stránka místo celého webu (viz docs/optimalizace.md, §268).
     Žádná z kontrol výš to zachytit nemohla: každá otevírá ČISTÝ
     kontext, kde service worker ještě neřídí, takže měřily web, jak
     vypadá pro návštěvníka poprvé — ne pro toho, kdo už tu byl.
     Tady se proto nejdřív počká, až worker převezme řízení, a teprve
     POTOM se kliká dál. Běží to na ostré doméně, protože tenhle druh
     vady se v repozitáři nepozná. */
  {
    const s = await otevri(`${WEB}/`);
    if (s.selhalo) NE('service worker: úvodní stránka se neotevřela', s.selhalo);
    else {
      const pripraven = await s.strana.evaluate(() => {
        if (!('serviceWorker' in navigator)) return 'bez podpory';
        return Promise.race([
          navigator.serviceWorker.ready.then(() => 'ano'),
          new Promise((r) => setTimeout(() => r('nedočkal se'), 20000)),
        ]);
      }).catch((e) => 'chyba: ' + String(e.message || e).slice(0, 80));
      if (pripraven !== 'ano') {
        NEVIM('service worker se nepřihlásil', String(pripraven));
      } else {
        /* Druhé načtení: teprve teď worker požadavky opravdu řídí. */
        await s.strana.goto(`${WEB}/`, { waitUntil: 'load', timeout: LIMIT * 1000 }).catch(() => {});
        const ridi = await s.strana.evaluate(() => !!navigator.serviceWorker.controller).catch(() => false);
        if (!ridi) NEVIM('service worker neřídí ani po druhém načtení', 'navigace pod workerem se nezměřila');
        else {
          ANO('service worker řídí stránku (navigace se měří pod ním)');
          let spadlo = null, stav = 0, titulek = '';
          try {
            const r = await s.strana.goto(`${WEB}/cena-pozemku.html`, { waitUntil: 'domcontentloaded', timeout: LIMIT * 1000 });
            stav = r ? r.status() : 0;
            titulek = await s.strana.title().catch(() => '');
          } catch (e) { spadlo = String(e.message || e).slice(0, 160); }
          if (spadlo) {
            NE('pod service workerem se stránka neotevře', spadlo
              + ' — přesně takhle vypadá vada, kdy worker vrací na navigaci přesměrovanou odpověď'
              + ' (Safari: „Response served by service worker has redirections")');
          } else if (stav >= 400 || !/parcel|cen/i.test(titulek)) {
            NE('pod service workerem se stránka otevřela špatně', `stav ${stav}, titulek „${titulek.slice(0, 60)}"`);
          } else {
            ANO(`pod service workerem se další stránka otevře (${stav}, „${titulek.slice(0, 30)}")`);
          }
        }
      }
      await s.kontext.close();
    }
  }

  await prohlizec.close();
}

/* ---- výsledek ----------------------------------------------------- */
if (server) server.close();
const out = [];
out.push(`\nCo uvidí člověk na ${WEB}`);
for (const t of dobre) out.push('  ✓ ' + t);
for (const t of nezmereno) out.push('  ? ' + t);
for (const t of vady) out.push('  ✕ ' + t);
/* NEZMĚŘILO SE NIC = NÁLEZ. Bez tohohle řádku by nespuštěný prohlížeč
   vypadal jako web v pořádku — a to je přesně ten druh mlčení, kvůli
   kterému tahle kontrola vznikla. */
if (dobre.length === 0 && vady.length === 0) {
  out.push('  ✕ nezměřilo se nic — a to není úspěch, jen mlčení');
  vady.push('nezměřilo se nic');
}
out.push(`\n  ${dobre.length} v pořádku, ${nezmereno.length} nezměřeno, ${vady.length} vad\n`);
console.log(out.join('\n'));
if (vady.length) {
  console.log('::error::Živý web v prohlížeči: ' + vady.length + ' vad. ' + vady.join(' // '));
  process.exit(1);
}
