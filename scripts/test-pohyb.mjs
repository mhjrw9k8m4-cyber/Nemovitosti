// Test: web dává najevo, že je živý — a umí být i úplně v klidu.
//
// Spuštění: node scripts/test-pohyb.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome
//    a PK_LEAFLET_DIR=cesta/k/leaflet/dist)
//
// Dvě drobnosti, obě k něčemu:
//
// 1) TEČKA POD KURZOREM NAROSTE. Není to ozdoba. Tečky se na mapě překrývají
//    a bez odezvy člověk neví, KTERÝ pozemek by se mu otevřel. Tečky se
//    kreslí do plátna a mají interactive:false, takže přes CSS to nejde —
//    hledá se nejbližší bod, stejně jako u kliknutí. Snadno se to rozbije
//    a nikde to nezpůsobí chybu, jen to přestane fungovat.
//
// 2) PRUH S CENOU DOJEDE NA SVOU HODNOTU. Je to jediný údaj na kartě, který
//    je MĚŘÍTKO — krátký pohyb řekne „tohle je škála a tady na ní jsi" líp
//    než popisek.
//
// A hlavně: kdo má v systému vypnuté animace, nesmí dostat nic z toho —
// a zároveň musí pruh pořád ukazovat správnou hodnotu, ne nulu.
import { chromium } from 'playwright-core';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const BASE = 'http://127.0.0.1:8310';
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

const LEAFLET = process.env.PK_LEAFLET_DIR || '';
const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));

async function kontext(pohybVypnut) {
  const ctx = await prohlizec.newContext({
    viewport: { width: 1280, height: 900 },
    reducedMotion: pohybVypnut ? 'reduce' : 'no-preference',
  });
  await ctx.route('**/*', (r) => {
    const u = new URL(r.request().url());
    return (u.hostname === '127.0.0.1' || u.hostname === 'localhost') ? r.continue() : r.abort();
  });
  await ctx.route('**/js/config.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript',
    body: `window.PK_SUPABASE_URL='${BASE}';window.PK_SUPABASE_KEY='anon';` }));
  if (LEAFLET) {
    await ctx.route('https://unpkg.com/leaflet@**', (r) => {
      const f = path.join(LEAFLET, path.basename(new URL(r.request().url()).pathname));
      if (!existsSync(f)) return r.abort();
      return r.fulfill({ status: 200, contentType: f.endsWith('.css') ? 'text/css' : 'text/javascript', body: readFileSync(f) });
    });
    for (const c of ['index.html', 'pozemek.html']) {
      await ctx.route(`${BASE}/${c}*`, async (r) => {
        const o = await r.fetch();
        return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8',
          body: (await o.text()).replace(/\s+integrity="[^"]*"/g, '') });
      });
    }
  }
  return ctx;
}

// --- 1) Tečka pod kurzorem ------------------------------------------
{
  const ctx = await kontext(false);
  const p = await ctx.newPage();
  const chyby = [];
  p.on('pageerror', (e) => chyby.push(String(e)));
  await p.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(4200);

  /* V CI se Leaflet stahuje ze sítě, takže se hranice krajů vykreslí později
     než na místním stroji. Pevné čekání 4 sekundy tam nestačilo a test se
     místo poctivé hlášky ukončil výjimkou uprostřed — v logu pak nebylo
     vidět, co vlastně neprošlo. Čeká se proto na hranice, ne na hodinky. */
  const kraje = p.locator('#leaflet-map path.leaflet-interactive');
  await p.waitForSelector('#leaflet-map path.leaflet-interactive', { timeout: 25000 }).catch(() => {});
  const pocet = await kraje.count();
  pravda('kraje se na mapě vykreslily', pocet >= 10, `jen ${pocet}`);
  if (pocet < 4) {
    pravda('bez hranic krajů nemá smysl zkoušet tečky', false,
      'mapa se nevykreslila — zbytek kontrol se přeskakuje');
  } else {
  // Dokud není vybraný kraj, tečky nejsou klikací — a tedy ani nemají reagovat.
  const box = await p.locator('#leaflet-map').boundingBox();
  await p.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.45);
  await p.waitForTimeout(150);
  pravda('před výběrem kraje tečky nereagují',
    (await p.evaluate(() => document.getElementById('leaflet-map').style.cursor)) !== 'pointer',
    'tečka se hlásí k ruce, i když se na ni kliknout nedá');

  await kraje.nth(3).click({ force: true });
  await p.waitForTimeout(1800);
  const odemceno = await p.evaluate(() => !document.getElementById('leaflet-map').classList.contains('kraj-lock'));
  pravda('klepnutí do kraje odemkne tečky', odemceno,
    'mapa zůstala zamčená — tečky se nedají rozkliknout ani zvýraznit');
  /* Kde tečky vlastně jsou, se nedá tipnout — mapa se po výběru kraje
     přiblíží a rozložení se pokaždé liší. Projíždět mapu naslepo je proto
     nespolehlivé (a taky se to tak chovalo: jednou to trefilo, podruhé ne).
     Tečky se kreslí do plátna, takže se v něm dají NAJÍT: hledá se bod
     v barvě kategorie. To je přesně to, co na mapě vidí člověk. */
  await p.evaluate(() => document.getElementById('leaflet-map').scrollIntoView({ block: 'center' }));
  await p.waitForTimeout(600);
  const body = await p.evaluate(() => {
    const platno = document.querySelector('.leaflet-dots-pane canvas') || document.querySelector('#leaflet-map canvas');
    if (!platno) return { chyba: 'plátno s tečkami se nenašlo' };
    const r = platno.getBoundingClientRect();
    const ctx2 = platno.getContext('2d');
    const cs = getComputedStyle(document.documentElement);
    const cile = ['--c-sale', '--c-drazba', '--c-exekuce'].map((n) => {
      const h = cs.getPropertyValue(n).trim().replace('#', '');
      return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
    });
    const img = ctx2.getImageData(0, 0, platno.width, platno.height);
    const mer = platno.width / r.width;             // poměr plátna k bodům na obrazovce
    const nalez = [];
    for (let y = 0; y < platno.height && nalez.length < 40; y += 2) {
      for (let x = 0; x < platno.width; x += 2) {
        const i = (y * platno.width + x) * 4;
        if (img.data[i + 3] < 200) continue;
        for (const c of cile) {
          if (Math.abs(img.data[i] - c[0]) < 26 && Math.abs(img.data[i + 1] - c[1]) < 26 && Math.abs(img.data[i + 2] - c[2]) < 26) {
            nalez.push({ x: r.left + x / mer, y: r.top + y / mer });
            break;
          }
        }
        if (nalez.length >= 40) break;
      }
    }
    return { nalez, oknoVyska: window.innerHeight };
  });
  pravda('tečky pozemků jsou na plátně opravdu vidět',
    !body.chyba && body.nalez && body.nalez.length > 0, body.chyba || 'v plátně není ani jeden barevný bod');

  let nasel = null;
  for (const b of (body.nalez || [])) {
    if (b.y < 10 || b.y > body.oknoVyska - 10) continue;   // mimo okno myš nedosáhne
    await p.mouse.move(b.x, b.y);
    await p.waitForTimeout(40);
    if ((await p.evaluate(() => document.getElementById('leaflet-map').style.cursor)) === 'pointer') {
      nasel = b; break;
    }
  }
  pravda('po výběru kraje tečka pod kurzorem odpoví', !!nasel,
    `najel jsem na ${(body.nalez || []).length} teček a žádná nereagovala`);
  // A když kurzor z tečky sjede, zvýraznění zmizí.
  if (nasel) {
    await p.mouse.move(nasel.x, Math.max(12, nasel.y - 120));
    await p.waitForTimeout(120);
    pravda('a když kurzor odjede, zvýraznění zmizí',
      (await p.evaluate(() => document.getElementById('leaflet-map').style.cursor)) !== 'pointer',
      'tečka zůstala zvýrazněná, i když už na ní kurzor není');
  }
  pravda('při najíždění po mapě nespadl žádný skript', chyby.length === 0, chyby[0]);
  }
  await ctx.close();
}

// --- 2) Pruh s cenou dojede na svou hodnotu --------------------------
// Pozemek, u kterého se cenové měřítko opravdu vykreslí (má dost srovnatelných
// nabídek v okolí). U pozemku bez verdiktu by tu nebylo co měřit.
const ADRESA = `${BASE}/pozemek.html?p=Vala%C5%A1sk%C3%A1%20Senice%7C%E2%80%94%7CVset%C3%ADn&ll=49.238051,18.105773`;
{
  const ctx = await kontext(false);
  const p = await ctx.newPage();
  await p.goto(ADRESA, { waitUntil: 'domcontentloaded' });
  // Hned po vykreslení: pruh má být teprve na cestě.
  await p.waitForSelector('.pv-fill', { timeout: 6000 }).catch(() => {});
  const hned = await p.evaluate(() => {
    const f = document.querySelector('.pv-fill');
    if (!f) return null;
    return { sirka: f.getBoundingClientRect().width, cil: getComputedStyle(f).getPropertyValue('--w').trim() };
  });
  await p.waitForTimeout(1200);
  const potom = await p.evaluate(() => {
    const f = document.querySelector('.pv-fill');
    const d = document.querySelector('.pv-dot');
    if (!f) return null;
    return {
      sirka: f.getBoundingClientRect().width,
      stopa: f.parentElement.getBoundingClientRect().width,
      cil: getComputedStyle(f).getPropertyValue('--w').trim(),
      puntikVlevo: d ? getComputedStyle(d).left : null,
    };
  });
  pravda('pruh s cenou se na stránce vykreslí', !!potom, 'element .pv-fill se nenašel');
  if (potom) {
    pravda('pruh se hýbe, ne že tam rovnou stojí', hned && hned.sirka < potom.sirka - 1,
      `hned ${hned && hned.sirka.toFixed(1)} px, potom ${potom.sirka.toFixed(1)} px`);
    const chtena = parseFloat(potom.cil) / 100 * potom.stopa;
    pravda('a dojede přesně tam, kam má', Math.abs(potom.sirka - chtena) < 2,
      `skončil na ${potom.sirka.toFixed(1)} px, mělo být ${chtena.toFixed(1)} px (${potom.cil})`);
    pravda('puntík na měřítku dojede taky', potom.puntikVlevo && parseFloat(potom.puntikVlevo) > 0,
      `puntík zůstal na ${potom.puntikVlevo}`);
  }
  await ctx.close();
}

// --- 3) Kdo má vypnuté animace, nevidí ŽÁDNÝ pohyb -------------------
// A pořád vidí správné číslo — vypnutá animace nesmí znamenat prázdný pruh.
{
  const ctx = await kontext(true);
  const p = await ctx.newPage();
  await p.goto(ADRESA, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('.pv-fill', { timeout: 6000 }).catch(() => {});
  const hned = await p.evaluate(() => {
    const f = document.querySelector('.pv-fill');
    return f ? { sirka: f.getBoundingClientRect().width, anim: getComputedStyle(f).animationName } : null;
  });
  await p.waitForTimeout(900);
  const potom = await p.evaluate(() => {
    const f = document.querySelector('.pv-fill');
    return f ? { sirka: f.getBoundingClientRect().width, stopa: f.parentElement.getBoundingClientRect().width,
      cil: getComputedStyle(f).getPropertyValue('--w').trim() } : null;
  });
  pravda('s vypnutými animacemi se nic nehýbe',
    hned && potom && Math.abs(hned.sirka - potom.sirka) < 1 && hned.anim === 'none',
    `hned ${hned && hned.sirka.toFixed(1)} px (animace ${hned && hned.anim}), potom ${potom && potom.sirka.toFixed(1)} px`);
  pravda('ale hodnota na měřítku je správná i tak',
    potom && Math.abs(potom.sirka - parseFloat(potom.cil) / 100 * potom.stopa) < 2,
    potom ? `${potom.sirka.toFixed(1)} px místo ${potom.cil}` : '');
  await ctx.close();
}

await prohlizec.close();
console.log('\nPohyb — drobná odezva, a pro koho ne, tak žádná');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Pohyb: ' + chyb + ' kontrol neprošlo.');
  process.exit(1);
}
process.exit(0);
