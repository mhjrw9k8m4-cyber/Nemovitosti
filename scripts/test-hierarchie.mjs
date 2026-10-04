// Zkouška: je poznat, která akce je na stránce hlavní?
//
// Spuštění: node scripts/test-hierarchie.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome
//    a PK_LEAFLET_DIR=cesta/k/leaflet/dist)
//
// Sytá zelená plocha je na tomhle webu příslib: „tohle je tady ta hlavní
// věc". Nosila ji ale i tlačítka, která hlavní akcí nejsou — změřeno na
// úvodní stránce šest prvků v jedné a téže zelené, od „Přidat pozemek"
// po „Nahoru". Když křičí všechno, neslyšíte nic a oko nemá podle čeho
// vybrat.
//
// Druhá polovina zkoušky je o obrysech. Sekundární tlačítko je bílé na
// bílém, takže obrys je JEDINÉ, podle čeho se pozná, že tam tlačítko je.
// Na to má WCAG vlastní mez 3:1 (1.4.11, netextový kontrast) — a obrysy
// tu bývaly na alfě 0,28, tedy 1,66:1.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';

const BASE = 'http://127.0.0.1:8310';
const LEAFLET = process.env.PK_LEAFLET_DIR || '';
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push('  ✕ ' + popis + (proc ? '\n      ' + proc : '')); }
}

/* Kolik AKCÍ smí na jedné stránce nést sytou značkovou plochu. Čísla nejsou
   od oka — je to přesně to, co tam dnes je, aby se přírůstek hned poznal:
     index.html   3  tlačítko v hlavičce, „Zobrazit N pozemků", spodní výzva
     pozemek.html 2  tlačítko v hlavičce a hlavní akce stránky („K dražbě")
     hlidani.html 2  tlačítko v hlavičce a „Přihlásit se"
     pridat.html  2  totéž
   Trvalé tlačítko v hlavičce se počítá taky: je sice v liště, ale sytou
   plochu nese. Když jich přibude, zelená se zase začala rozdávat — a pak je
   potřeba rozhodnout, co je opravdu hlavní, ne zvednout tohle číslo. */
const STROP = { 'index.html': 3, 'pozemek.html': 2, 'hlidani.html': 2, 'pridat.html': 2 };

await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));
const PRAZDNA = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));
const ctx = await prohlizec.newContext({ viewport: { width: 1280, height: 900 } });
await ctx.route('**/*', (r) => {
  const u = new URL(r.request().url());
  if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') return r.continue();
  if (LEAFLET && /unpkg\.com\/leaflet/.test(u.href)) {
    const f = path.join(LEAFLET, path.basename(u.pathname));
    if (fs.existsSync(f)) return r.fulfill({ status: 200, body: fs.readFileSync(f),
      contentType: f.endsWith('.css') ? 'text/css' : 'text/javascript' });
  }
  if (r.request().resourceType() === 'image') return r.fulfill({ status: 200, contentType: 'image/png', body: PRAZDNA });
  return r.abort();
});
await ctx.route('**/config.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript',
  body: "window.PK_SUPABASE_URL='" + BASE + "';window.PK_SUPABASE_KEY='anon';" }));

const MERENI = `(() => {
  function lin(v){ v/=255; return v<=0.03928 ? v/12.92 : Math.pow((v+0.055)/1.055, 2.4); }
  function jas(c){ const m=(c.match(/[\\d.]+/g)||[]).map(Number); if(m.length<3) return null;
    return 0.2126*lin(m[0])+0.7152*lin(m[1])+0.0722*lin(m[2]); }
  function slozit(popredi, pozadi){
    const a=(popredi.match(/[\\d.]+/g)||[]).map(Number), b=(pozadi.match(/[\\d.]+/g)||[]).map(Number);
    if(a.length<3||b.length<3) return null;
    const al = a.length>3 ? a[3] : 1;
    return 'rgb(' + [0,1,2].map(i=>Math.round(al*a[i] + (1-al)*b[i])).join(',') + ')';
  }
  function pomer(x,y){ const a=jas(x), b=jas(y); if(a==null||b==null) return null;
    return +(((Math.max(a,b)+0.05)/(Math.min(a,b)+0.05)).toFixed(2)); }
  function podklad(el){
    for(let e=el.parentElement; e; e=e.parentElement){
      const c=getComputedStyle(e).backgroundColor;
      if(c && c!=='rgba(0, 0, 0, 0)' && c!=='transparent') return c;
    }
    return 'rgb(255,255,255)';
  }
  // Rodina tlačítek, u kterých je obrys jediné, podle čeho se poznají.
  const SEKUNDARNI = '.btn-secondary, .map-near-btn, .to-top, .lp-btn, .pz-btn.ghost, .pz-abtn';
  /* Proměnná je zapsaná šestnáctkově (#235B3F), kdežto spočítané pozadí
     prvku vrací prohlížeč jako rgb(). Porovnávat jedno s druhým rovnou
     nejde — parsování čísel z hexu vrátí nesmysl a shoda by nikdy
     nenastala, takže by zkouška mlčky tvrdila, že hlavní akce nikde není.
     Proto se barva nechá přepočítat prohlížečem. */
  const sonda = document.createElement('span');
  sonda.style.cssText = 'position:absolute;left:-9999px;background-color:var(--plocha-znacka)';
  document.body.appendChild(sonda);
  const znacka = getComputedStyle(sonda).backgroundColor;
  sonda.remove();
  const out = { syte: [], slabeObrysy: [], sekundarnich: 0, nahoruSyte: null, okoliSyte: null, znacka };
  document.querySelectorAll('a,button').forEach(el => {
    const r = el.getBoundingClientRect(); if (r.width < 50 || r.height < 26) return;
    const c = getComputedStyle(el);
    if (c.display === 'none' || c.visibility === 'hidden') return;
    const txt = (el.textContent||'').trim().replace(/\\s+/g,' ').slice(0, 30);
    if (!txt) return;
    const bg = c.backgroundColor;
    const jeZnacka = jas(bg) != null && jas(znacka) != null && Math.abs(jas(bg) - jas(znacka)) < 0.004;
    /* Vybraný stav se nepočítá. Zapnutá pilulka filtru nebo zapnutá mapová
       vrstva sytou plochou neříká „udělej tohle", ale „tohle je zapnuté" —
       a tenhle odstín je na to na webu zavedený. Rozdělují se tu tedy AKCE,
       kterých má být vidět jedna hlavní. */
    const vybrany = el.matches('[aria-pressed="true"], [aria-selected="true"], .active, .on');
    if (jeZnacka && !vybrany) out.syte.push(txt);
    /* Obrys se měří JEN u rodiny sekundárních tlačítek. Orámovaný odkaz
       v seznamu krajů nebo přepínač mapové vrstvy má rámeček jako ozdobu —
       identifikuje ho jeho vlastní text, ne čára kolem. Kdyby se měřilo
       všechno, zkouška by hlásila věci, které chybou nejsou, a přestala by
       se číst. */
    if (el.matches(SEKUNDARNI) && !jeZnacka) {
      out.sekundarnich++;
      const pod = podklad(el);
      const plocha = slozit(bg, pod) || pod;
      const obrys = slozit(c.borderTopColor, plocha);
      if (obrys) {
        const k = pomer(obrys, plocha);
        if (k != null && k < 3) out.slabeObrysy.push(txt + ' (' + k + ':1)');
      }
    }
  });
  const nahoru = document.querySelector('.to-top');
  if (nahoru) out.nahoruSyte = Math.abs((jas(getComputedStyle(nahoru).backgroundColor)||0) - (jas(znacka)||0)) < 0.004;
  const okoli = document.getElementById('map-near');
  if (okoli) out.okoliSyte = Math.abs((jas(getComputedStyle(okoli).backgroundColor)||0) - (jas(znacka)||0)) < 0.004;
  return out;
})()`;

for (const [stranka, strop] of Object.entries(STROP)) {
  const adresa = stranka === 'pozemek.html' ? 'pozemek.html?ll=49.46,17.87' : stranka;
  const p = await ctx.newPage();
  await p.goto(BASE + '/' + adresa, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2800);
  /* Nahoře i po odrolování. Hlavní akce v hlavičce se při rolování schová,
     takže měřit jen dole by znamenalo tvrdit, že stránka žádnou nemá. */
  const nahore = await p.evaluate(MERENI);
  await p.evaluate(() => window.scrollTo(0, 1400));
  await p.waitForTimeout(700);
  const v = await p.evaluate(MERENI);
  v.syteNahore = nahore.syte;
  v.slabeObrysy = [...new Set([...nahore.slabeObrysy, ...v.slabeObrysy])];
  v.sekundarnich = Math.max(nahore.sekundarnich, v.sekundarnich);
  pravda(`${stranka}: značková plocha se dá změřit (jinak zkouška nic neměří)`,
    /^rgba?\(/.test(v.znacka || ''), 'z proměnné --plocha-znacka vyšlo „' + v.znacka + '" — porovnání by nikdy nesedlo');
  const syte = [...new Set([...v.syteNahore, ...v.syte])];
  pravda(`${stranka}: sytou značkovou plochu nese nejvýš ${strop} prvků`,
    syte.length <= strop,
    'je jich ' + syte.length + ': ' + syte.join(' | ')
    + '\n      Když křičí všechno, neslyšíte nic — rozhodněte, co je hlavní, místo zvedání stropu.');
  pravda(`${stranka}: aspoň jedna hlavní akce sytou plochu má`, syte.length >= 1,
    'žádná — pak není poznat, co se od člověka čeká');
  pravda(`${stranka}: obrysy tlačítek, která splývají s podkladem, jsou vidět (3:1)`,
    v.slabeObrysy.length === 0, v.slabeObrysy.slice(0, 5).join('\n      '));
  if (v.nahoruSyte !== null) {
    pravda(`${stranka}: „Nahoru" není hlavní akce stránky`, v.nahoruSyte === false,
      'tlačítko na odrolování nahoru nese tutéž plochu jako „Přidat pozemek"');
  }
  if (v.okoliSyte !== null) {
    pravda(`${stranka}: „Pozemky v okolí" je vedlejší akce`, v.okoliSyte === false,
      'nese tutéž plochu jako hlavní akce, takže si s ní konkuruje');
  }
  await p.close();
}
await ctx.close();
await prohlizec.close();

console.log('\nHierarchie tlačítek — co je tu hlavní?');
console.log(zpravy.join('\n'));
console.log('\n' + ok + ' v pořádku, ' + chyb + ' chyb\n');
if (chyb) { console.log('::error::Hierarchie tlačítek: ' + chyb + ' kontrol neprošlo.'); process.exit(1); }
process.exit(0);
