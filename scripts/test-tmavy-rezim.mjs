// Test: tmavý režim.
//
// Spuštění: node scripts/test-tmavy-rezim.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome)
//
// Tmavý režim není převrácení světlého. Každá plocha i text má vlastní
// hodnotu, protože stejný odstín se na tmavém chová jinak: značková
// zelená #1F5138 má na bílé kartě 7,0 : 1, ale na tmavé ploše 1,6 : 1
// a nepřečte se vůbec.
//
// Hlídají se čtyři věci, a každá z nich se dá pokazit tiše:
//  1. ŽE SE VŮBEC PŘEPNE podle nastavení systému.
//  2. ŽE NIC NEZŮSTANE SVÍTIT. Barva zapsaná napevno (#fff) token
//     neposlechne — a bílé záhlaví uprostřed tmavé stránky je přesně
//     to, co se stalo napoprvé. Měří se SKUTEČNÁ vykreslená plocha,
//     ne zdrojový kód.
//  3. KONTRAST. Text musí být čitelný v obou režimech (WCAG AA 4,5 : 1).
//  4. ŽE SE DVĚ KOPIE PRAVIDEL NEROZEJDOU. Tatáž paleta musí být
//     zapsaná dvakrát (jednou pro nastavení systému, jednou pro ruční
//     volbu), protože vlastní vlastnosti se mezi selektory nedědí.
//     Dvě kopie se dřív nebo později rozejdou, pokud je nic nehlídá.
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'http://127.0.0.1:8310';
/* Upozornění a Zprávy jsou tu kvůli tomu, že se měřily jen odhlášené —
   a tím se z nich měřila jen výzva „přihlaste se". Právě tam se našel
   odznak s počtem, který měl v tmavém režimu 3,14 : 1. */
const STRANKY = ['/index.html', '/pozemky-okres-breclav.html', '/hlidani.html',
  '/cena-pozemku.html', '/porovnani.html', '/kontakt.html',
  '/upozorneni.html', '/zpravy.html'];
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
function hotovo() {
  console.log('\nTmavý režim');
  console.log(zpravy.join('\n'));
  console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
  if (chyb) { console.log('::error::Tmavý režim: ' + chyb + ' kontrol neprošlo.'); process.exit(1); }
  process.exit(0);
}

/* ---- 1) obě kopie pravidel říkají totéž (bez prohlížeče) ---- */
{
  const css = readFileSync(path.join(KOREN, 'css', 'styles.css'), 'utf8');
  function tokeny(blok) {
    const out = {};
    for (const m of blok.matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
      out[m[1]] = m[2].trim().replace(/\s+/g, ' ');
    }
    return out;
  }
  /* Blok uvnitř @media (systémové nastavení) a blok pro ruční volbu.
     Berou se jen ty, které NASTAVUJÍ tokeny — podmínky pro jednotlivé
     prvky (pozadí tlačítek) jsou jinde a tokeny nenesou. */
  const mediaBloky = [...css.matchAll(/:root:not\(\[data-theme="light"\]\)\s*\{([^}]*)\}/g)]
    .map((m) => tokeny(m[1])).filter((t) => Object.keys(t).length > 3);
  const rucniBloky = [...css.matchAll(/:root\[data-theme="dark"\]\s*\{([^}]*)\}/g)]
    .map((m) => tokeny(m[1])).filter((t) => Object.keys(t).length > 3);
  const spoj = (a) => Object.assign({}, ...a);
  const media = spoj(mediaBloky), rucni = spoj(rucniBloky);

  // PŘEDPOKLAD: bez obou bloků by porovnání prošlo naprázdno
  pravda('tmavá paleta je zapsaná pro systémové nastavení i pro ruční volbu',
    Object.keys(media).length > 20 && Object.keys(rucni).length > 20,
    `systémová ${Object.keys(media).length} tokenů, ruční ${Object.keys(rucni).length}`);
  if (Object.keys(media).length < 20 || Object.keys(rucni).length < 20) { hotovo(); }

  const chybi = Object.keys(media).filter((k) => !(k in rucni));
  const navic = Object.keys(rucni).filter((k) => !(k in media));
  const jine = Object.keys(media).filter((k) => k in rucni && media[k] !== rucni[k]);
  pravda('a obě kopie nastavují tytéž tokeny', chybi.length === 0 && navic.length === 0,
    `jen v systémové: ${chybi.join(', ') || '—'} | jen v ruční: ${navic.join(', ') || '—'}`);
  pravda('a na tytéž hodnoty (jinak by se ruční volba lišila od systémové)',
    jine.length === 0,
    jine.slice(0, 4).map((k) => `${k}: „${media[k]}" × „${rucni[k]}"`).join('\n      '));
}

const prohlizec = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });

/* Pomůcka: jas barvy a poměr kontrastu — počítá se tady, ne ve stránce,
   aby se neměřilo týmž kódem, který se měří. */
function jas(rgb) {
  const m = String(rgb).match(/^rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)/);
  if (!m) return null;
  const f = (x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * f(+m[1]) + 0.7152 * f(+m[2]) + 0.0722 * f(+m[3]);
}
function kontrast(a, b) {
  const la = jas(a), lb = jas(b);
  if (la === null || lb === null) return null;
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/* ---- 2) přepne se podle systému ---- */
let svetloJas = null, tmaJas = null;
for (const rezim of ['light', 'dark']) {
  const ctx = await prohlizec.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: rezim });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/index.html`, { waitUntil: 'load' });
  await p.waitForTimeout(2000);
  const v = await p.evaluate(() => ({
    bg: getComputedStyle(document.body).backgroundColor,
    text: getComputedStyle(document.body).color,
    scheme: getComputedStyle(document.documentElement).colorScheme,
  }));
  const L = jas(v.bg);
  if (rezim === 'light') svetloJas = L; else tmaJas = L;
  pravda(`${rezim}: text má na ploše dost kontrastu (WCAG AA 4,5 : 1)`,
    kontrast(v.text, v.bg) >= 4.5,
    `poměr ${kontrast(v.text, v.bg) ? kontrast(v.text, v.bg).toFixed(2) : '?'} (${v.text} na ${v.bg})`);
  if (rezim === 'dark') {
    pravda('a prohlížeč se dozví, že je stránka tmavá (color-scheme)',
      /dark/.test(v.scheme), `color-scheme: ${v.scheme}`);
  }
  await ctx.close();
}
pravda('při tmavém nastavení systému je stránka opravdu tmavá',
  svetloJas !== null && tmaJas !== null && tmaJas < 0.1 && svetloJas > 0.5,
  `jas plochy: světlý ${svetloJas && svetloJas.toFixed(3)}, tmavý ${tmaJas && tmaJas.toFixed(3)}`);

/* ---- 3) nic velkého nezůstane svítit ---- */
{
  const ctx = await prohlizec.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'dark' });
  /* PŘIHLÁŠENÝ, jinak se na Upozorněních a Zprávách nevykreslí nic než
     výzva k přihlášení — a odznaky, karty a vlákna, tedy to, co má
     v tmavém režimu vlastní barvy, by se neměřily vůbec. */
  await ctx.route('**/config.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript',
    body: `window.PK_SUPABASE_URL='${BASE}';window.PK_SUPABASE_KEY='anon';` }));
  await ctx.addInitScript(() => {
    localStorage.setItem('pk_auth', JSON.stringify({ access_token: 'tok-majitel',
      refresh_token: 'ref-majitel',
      user: { id: '11111111-1111-4111-8111-111111111111', email: 'majitel@test.cz' } }));
  });
  const nalezy = [];
  for (const url of STRANKY) {
    const p = await ctx.newPage();
    await p.goto(BASE + url, { waitUntil: 'load' });
    await p.waitForTimeout(1800);
    await p.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
    await p.waitForTimeout(1000);
    const v = await p.evaluate(() => {
      const out = [];
      for (const e of document.querySelectorAll('*')) {
        const bg = getComputedStyle(e).backgroundColor;
        if (!bg || bg === 'rgba(0, 0, 0, 0)') continue;
        const al = bg.match(/[\d.]+/g);
        if (al && al.length > 3 && +al[3] < 0.5) continue;   // skoro průhledné nerozhoduje
        const r = e.getBoundingClientRect();
        if (r.width * r.height < 8000) continue;             // drobnosti neřešíme
        out.push({ bg, sel: e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') +
          (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/)[0] : ''),
          plocha: Math.round(r.width * r.height) });
      }
      return out;
    });
    for (const x of v) {
      const L = jas(x.bg);
      if (L !== null && L > 0.35) nalezy.push(`${url} ${x.sel} (${x.bg}, ${x.plocha} px²)`);
    }
    await p.close();
  }
  // PŘEDPOKLAD: kdyby se neprošla žádná plocha, kontrola projde naprázdno
  pravda(`je co měřit — prošlo se ${STRANKY.length} stránek`, STRANKY.length >= 5);
  pravda('v tmavém režimu nezůstane svítit žádná velká světlá plocha',
    nalezy.length === 0, [...new Set(nalezy)].slice(0, 6).join('\n      '));
  await ctx.close();
}

/* ---- 4) ruční volba přebije nastavení systému ---- */
{
  // tmavá volba na světlém systému
  /* Atribut se nastavuje AŽ PO načtení. addInitScript běží dřív, než
     dokument vůbec existuje, takže document.documentElement je null
     a nastavení propadne — napoprvé obě kontroly spadly právě na tom
     a vypadalo to, že ruční volba nefunguje. */
  const c1 = await prohlizec.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'light' });
  const p1 = await c1.newPage();
  await p1.goto(`${BASE}/index.html`, { waitUntil: 'load' });
  await p1.waitForTimeout(1500);
  await p1.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'));
  await p1.waitForTimeout(400);
  const bg1 = await p1.evaluate(() => getComputedStyle(document.body).backgroundColor);
  pravda('ruční „tmavý" platí i na světlém systému', jas(bg1) < 0.1,
    `plocha ${bg1} (jas ${jas(bg1) && jas(bg1).toFixed(3)})`);
  await c1.close();

  // světlá volba na tmavém systému
  const c2 = await prohlizec.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'dark' });
  const p2 = await c2.newPage();
  await p2.goto(`${BASE}/index.html`, { waitUntil: 'load' });
  await p2.waitForTimeout(1500);
  await p2.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  await p2.waitForTimeout(400);
  const bg2 = await p2.evaluate(() => getComputedStyle(document.body).backgroundColor);
  pravda('a ruční „světlý" přebije tmavé nastavení systému', jas(bg2) > 0.5,
    `plocha ${bg2} (jas ${jas(bg2) && jas(bg2).toFixed(3)})`);
  await c2.close();
}

/* ---- 5) přepínač: tři stavy, vydrží, a nebliká ---- */
{
  const ctx = await prohlizec.newContext({ viewport: { width: 1280, height: 900 }, colorScheme: 'light' });
  const p = await ctx.newPage();
  const chybyJs = [];
  p.on('pageerror', (e) => chybyJs.push(String(e)));
  await p.goto(`${BASE}/index.html`, { waitUntil: 'load' });
  await p.waitForTimeout(2000);
  const stav = () => p.evaluate(() => {
    const b = document.querySelector('#pk-rezim-btn');
    return { je: !!b, popis: b ? b.querySelector('span').textContent : null,
      theme: document.documentElement.getAttribute('data-theme'),
      bg: getComputedStyle(document.body).backgroundColor,
      vyska: b ? Math.round(b.getBoundingClientRect().height) : 0,
      popisek: b ? b.getAttribute('aria-label') : null };
  });
  const s0 = await stav();
  // PŘEDPOKLAD: bez tlačítka nemá smysl měřit nic dalšího
  pravda('v patičce je přepínač vzhledu', s0.je,
    'hák data-theme sice funguje, ale nikdo se k němu nedostane');
  if (!s0.je) { await ctx.close(); await prohlizec.close(); hotovo(); }

  pravda('a dá se trefit prstem (44 px)', s0.vyska >= 44, `${s0.vyska} px`);
  pravda('začíná se „podle systému" (nikomu se nic nepřepíná za zády)',
    s0.theme === null && /systém/i.test(s0.popis), JSON.stringify(s0));
  pravda('a odečítač se dozví i to, co klepnutí udělá',
    /klepnutím/i.test(s0.popisek || ''), String(s0.popisek));

  await p.click('#pk-rezim-btn'); await p.waitForTimeout(350);
  const s1 = await stav();
  await p.click('#pk-rezim-btn'); await p.waitForTimeout(350);
  const s2 = await stav();
  await p.click('#pk-rezim-btn'); await p.waitForTimeout(350);
  const s3 = await stav();
  pravda('klepáním se projdou tři stavy a vrátí se na začátek',
    s1.theme === 'light' && s2.theme === 'dark' && s3.theme === null,
    `${s1.theme} → ${s2.theme} → ${s3.theme}`);
  /* Tři stavy, ne dva: s přepínačem na dvě polohy se k „podle systému"
     už nedá vrátit a volba zůstane nalepená napořád. */
  pravda('a „tmavý" stránku opravdu ztmaví', jas(s2.bg) < 0.1, s2.bg);

  await p.click('#pk-rezim-btn'); await p.waitForTimeout(300);   // na „světlý"
  await p.reload({ waitUntil: 'load' });
  await p.waitForTimeout(1500);
  const s4 = await stav();
  pravda('volba vydrží i po načtení stránky znovu', s4.theme === 'light',
    `po obnovení: ${s4.theme}`);
  pravda('nic se u toho nerozbilo', chybyJs.length === 0, chybyJs.join(' | '));
  await ctx.close();
}

/* ---- 6) proti bliknutí: nastavení se použije PŘED vykreslením ---- */
{
  const { readdirSync } = await import('node:fs');
  const rucni = readdirSync(KOREN).filter((f) => /\.html$/.test(f)
    && !/^(pozemek-|pozemky-okres-|pozemky-.*-kraj\.html$)/.test(f));
  const bez = rucni.filter((f) => {
    const t = readFileSync(path.join(KOREN, f), 'utf8');
    const hlava = (t.match(/<head[\s\S]*?<\/head>/i) || [''])[0];
    return !/pk_rezim_v1/.test(hlava);
  });
  // PŘEDPOKLAD: kdyby se nenašly žádné stránky, kontrola projde naprázdno
  pravda('je co kontrolovat — ruční stránky', rucni.length >= 20, `stránek: ${rucni.length}`);
  pravda('každá stránka použije vzhled ještě PŘED vykreslením (žádné bliknutí)',
    bez.length === 0, `bez toho: ${bez.slice(0, 6).join(', ')}`);
  // a totéž u generovaných
  const gen = readdirSync(KOREN).filter((f) => /^pozemky-okres-.*\.html$/.test(f)).slice(0, 3);
  const genBez = gen.filter((f) => {
    const t = readFileSync(path.join(KOREN, f), 'utf8');
    return !/pk_rezim_v1/.test((t.match(/<head[\s\S]*?<\/head>/i) || [''])[0]);
  });
  pravda('a platí to i pro stránky, které se generují znovu při každém běhu robota',
    gen.length > 0 && genBez.length === 0, `bez toho: ${genBez.join(', ')}`);
}

await prohlizec.close();
hotovo();
