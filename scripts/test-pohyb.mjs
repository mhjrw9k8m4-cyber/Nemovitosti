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
import { pricinaChyb } from './chyby-hlaska.mjs';
/* ČEKÁ SE NA STAV, NE NA HODINKY: po goto se tu spalo pevně, než se
   rozběhne JS stránky. Viz scripts/zkouska-pripraveno.mjs. */
import { domUtichlo } from './zkouska-pripraveno.mjs';
import { hlasPad } from './zkouska-pad.mjs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const BASE = 'http://127.0.0.1:8310';
const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, chyb = 0;
const zpravy = [];
/* A KDYŽ TO SPADNE, AŤ TO TAKY NĚCO ŘEKNE — viz scripts/zkouska-pad.mjs.
   Bez tohohle se při výjimce (chybějící prvek, timeout klepnutí) zahodí
   všechny kontroly, které do té chvíle prošly, a v CI zbyde jen stopa. */
hlasPad('Pohyb', zpravy);
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

const LEAFLET = process.env.PK_LEAFLET_DIR || '';
const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));

async function kontext(pohybVypnut) {
  const ctx = await prohlizec.newContext({ bypassCSP: true,  serviceWorkers: 'block',
    viewport: { width: 1280, height: 900 },
    reducedMotion: pohybVypnut ? 'reduce' : 'no-preference',
  });
  await ctx.route('**/*', (r) => {
    const u = new URL(r.request().url());
    return (u.hostname === '127.0.0.1' || u.hostname === 'localhost') ? r.continue() : r.abort();
  });
  await ctx.route('**/config.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript',
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
  await domUtichlo(p, 350);   // bylo waitForTimeout(4200)

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
  /* A když kurzor z tečky sjede, zvýraznění zmizí.
     PRÁZDNÉ MÍSTO SE MUSÍ NAJÍT, NE ODHADNOUT. Dřív se tu odjelo slepě
     o 120 px nahoru — a na zaplněné mapě to prázdno není: naměřeno, že
     na tom místě stála tečka 7 px od kurzoru a do 20 px jich byly čtyři.
     Ukazovátko tam tedy JE správně (od té doby, co odpovídá i nad
     nahloučenými tečkami) a kontrola padala na vlastním předpokladu.
     Hledá se proto bod, od kterého je nejbližší tečka dál než 60 px. */
  const prazdno = nasel ? await p.evaluate(() => {
    const m = window.PK_MAPA;
    const ram = document.querySelector('#map .leaflet-container') || document.querySelector('.leaflet-container');
    const r = ram.getBoundingClientRect();
    const body = [];
    m.eachLayer((l) => { if (l._d && isFinite(l._d.lat)) {
      const q = m.latLngToContainerPoint([l._d.lat, l._d.lng]);
      body.push({ x: q.x, y: q.y });
    } });
    if (!body.length) return null;
    for (let y = 30; y < r.height - 20; y += 12) {
      for (let x = 20; x < r.width - 20; x += 12) {
        let nej = Infinity;
        for (const q of body) { const dd = Math.hypot(q.x - x, q.y - y); if (dd < nej) nej = dd; }
        if (nej <= 60) continue;
        /* A NA TOM BODĚ MUSÍ BÝT MAPA. Jinak se myš postaví na hlavičku
           nebo na ovládání přiblížení, mapa žádnou událost nedostane —
           a ukazovátko zůstane z předchozího místa. Kontrola by pak
           hlásila chybu webu, ačkoli jde o chybu zkoušky. */
        const px = Math.round(r.left + x), py = Math.round(r.top + y);
        const pod = document.elementFromPoint(px, py);
        if (!pod || !ram.contains(pod)) continue;
        if (pod.closest('.leaflet-control-container')) continue;
        /* A NESMÍ TO BÝT ODZNAK SHLUKU. Ten má záchytnou plochu 44 px a
           jeho členové leží až na okraji okruhu, takže odznak může stát
           dál než 60 px od každé tečky — a ukazovátko nad ním být MÁ.
           Bez tohohle kontrola padala na místě, kde web odpovídal
           správně. */
        if (pod.closest('.pk-shluk-obal') || pod.closest('.leaflet-marker-icon')) continue;
        return { x: px, y: py, nej: Math.round(nej), tecek: body.length };
      }
    }
    return { nenalezeno: true, tecek: body.length };
  }) : null;
  if (nasel) {
    /* Bez tohohle by se kontrola níž dala „splnit" tím, že se kurzor
       postaví někam, kde stejně nic není měřitelné. */
    pravda('našlo se na mapě místo dál než 60 px od každé tečky',
      !!(prazdno && !prazdno.nenalezeno),
      prazdno ? `mezi ${prazdno.tecek} tečkami takové místo není — kontrola níž by nic neměřila` : 'tečky se nepodařilo z mapy vyčíst');
  }
  if (nasel && prazdno && !prazdno.nenalezeno) {
    await p.evaluate(() => { window.__mm = 0; window.PK_MAPA.on('mousemove', () => { window.__mm++; }); });
    await p.mouse.move(prazdno.x, prazdno.y);
    await p.waitForTimeout(200);
    /* Když to padne, musí být z hlášky poznat PROČ: hádat se tady dá
       dlouho (leží tam odznak? nedostala mapa událost? je tam přece jen
       tečka?). */
    const kdyz = await p.evaluate((bod) => {
      const m = window.PK_MAPA;
      const ram = document.querySelector('#map .leaflet-container') || document.querySelector('.leaflet-container');
      const r = ram.getBoundingClientRect();
      const cp = { x: bod.x - r.left, y: bod.y - r.top };
      let nej = Infinity;
      m.eachLayer((l) => { if (l._d && isFinite(l._d.lat)) {
        const q = m.latLngToContainerPoint([l._d.lat, l._d.lng]);
        const dd = Math.hypot(q.x - cp.x, q.y - cp.y); if (dd < nej) nej = dd; } });
      const pod = document.elementFromPoint(bod.x, bod.y);
      return { cursor: document.getElementById('leaflet-map').style.cursor,
        udalosti: window.__mm || 0, nejTecka: Math.round(nej),
        pod: pod ? (pod.tagName.toLowerCase() + '.' + String(pod.className || '').split(' ').slice(0, 2).join('.')) : '(nic)' };
    }, { x: prazdno.x, y: prazdno.y });
    pravda('a když kurzor odjede na prázdné místo, zvýraznění zmizí',
      kdyz.cursor !== 'pointer',
      `nejbližší tečka ${kdyz.nejTecka} px, pod bodem „${kdyz.pod}", pohybů ${kdyz.udalosti}, cursor „${kdyz.cursor}"`);
  }
  pravda('při najíždění po mapě nespadl žádný skript', chyby.length === 0, chyby[0]);
  }
  await ctx.close();
}

// --- 2) Graf rozdělení cen se vykreslí a NEhýbe se -------------------
// Pozemek, u kterého se cenové srovnání opravdu vykreslí (má dost
// srovnatelných nabídek v okolí). U pozemku bez verdiktu není co měřit.
//
// DŘÍV TU BYL PUNTÍK NA PROUŽKU a měřilo se, že dojede zleva na svou
// hodnotu. Proužek nahradil graf rozdělení (viz pvGrafHtml
// v js/pozemek.js) a ten se schválně NENAJÍŽDÍ: sloupce jsou data, ne
// efekt, a po dojetí by stejně skončily tam, kde jsou hned. Měří se
// proto opak — že stojí a nepřeskakuje.
// Z teček se mezitím staly SLOUPCE (histogram, jako mají realitní
// weby). Měří se proto součet nabídek ve sloupcích, ne počet sloupců:
// každá nabídka musí v některém z nich být, i ta mimo osu — ta
// v krajním. Kdyby se počítaly sloupce, prošlo by i to, že jich graf
// nakreslí pět a polovinu nabídek po cestě ztratí.
/* ADRESA SE VYBÍRÁ MĚŘENÍM, NE RUKOU. Stála tu pevně („Valašská
   Senice, okres Vsetín") a 23. 10. ta stránka přestala mít graf — ne
   vadou, ale správně: od toho dne se verdikt o ceně nevydá tam, kde
   srovnávací přihrádku drží jediný inzerent (MEZ_JEDEN_INZERENT
   v js/ceny.js), a Vsetín je zrovna jeden z okresů, kde ten
   velkoobchodník drží 86 % nabídek. Čtyři kontroly pak padaly na
   „graf se nenašel" — a nebyla to vada grafu.
   Bere se tedy první nabídka, které TÝŽ model verdikt dá. Kdyby se
   takhle nedala najít žádná, zkouška to řekne (kontrola níž), ne aby
   měřila prázdno. */
const VYBER = (() => {
  const okno = {};
  // eslint-disable-next-line no-new-func
  new Function('window', readFileSync(path.join(KOREN, 'js', 'ceny.js'), 'utf8'))(okno);
  const PKH = createRequire(import.meta.url)(path.join(KOREN, 'js', 'hlidani-logika.js'));
  const vse = PKH.bezDuplicit(JSON.parse(readFileSync(path.join(KOREN, 'data', 'opportunities.json'), 'utf8')).opportunities || []);
  const model = okno.PK_CENY.postav(vse);
  for (const d of vse) {
    if (!d.lat || !d.lng || !d.place || !d.okres) continue;
    const pc = model.percentil(d);
    if (!pc || !(pc.sample >= 10)) continue;
    return d;
  }
  return null;
})();
const ADRESA = VYBER
  ? `${BASE}/pozemek.html?p=${encodeURIComponent(`${VYBER.place}|${VYBER.cast || '—'}|${VYBER.okres}`)}`
    + `&ll=${VYBER.lat},${VYBER.lng}`
  : `${BASE}/pozemek.html`;
const kdeJeZnacka = (p) => p.evaluate(() => {
  const g = document.querySelector('.pvg');
  if (!g) return null;
  const pas = g.querySelector('.pvg-pas'), z = g.querySelector('.pvg-nase');
  if (!pas || !z) return null;
  const t = pas.getBoundingClientRect(), r = z.getBoundingClientRect();
  const st = getComputedStyle(z);
  let vSloupcich = 0;
  g.querySelectorAll('.pvg-s').forEach((e) => { vSloupcich += parseInt(e.getAttribute('data-n'), 10) || 0; });
  return { posun: (r.left + r.width / 2) - t.left, stopa: t.width,
    vSloupcich, sloupcu: g.querySelectorAll('.pvg-s').length,
    anim: st.animationName, prechod: st.transitionProperty };
});
pravda('našel se pozemek, který verdikt o ceně dostane', !!VYBER,
  'žádná nabídka nedostane percentil — graf by se neměl na čem měřit');
{
  const ctx = await kontext(false);
  const p = await ctx.newPage();
  await p.goto(ADRESA, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('.pvg-nase', { timeout: 8000 }).catch(() => {});
  const hned = await kdeJeZnacka(p);
  /* PEVNĚ SCHVÁLNĚ: mezi `hned` a měřením níž leží OKNO ANIMACE, ne
     čekání na připravenost. Leaflet posouvá značku transformací, což
     DOM nemění — „DOM utichl" by se tedy dočkal hned a zkouška by
     změřila půl pohybu (nebo žádný). */
  await p.waitForTimeout(1200);
  const potom = await kdeJeZnacka(p);
  pravda('graf rozdělení cen se na stránce vykreslí', !!potom, 'element .pvg-nase se nenašel');
  if (potom) {
    /* Ve sloupcích musí stát tolik nabídek, kolik věta nad grafem
       slibuje. Bez tohohle by graf mohl ukázat tři nabídky z dvanácti
       a nikdo by se to nedozvěděl. */
    const kolikSlibuje = await p.evaluate(() => {
      const m = /\((\d+)\s+nab/.exec(document.querySelector('.pv-text').textContent || '');
      return m ? parseInt(m[1], 10) : null;
    });
    pravda('a ve sloupcích stojí tolik nabídek, kolik slibuje věta nad ním',
      kolikSlibuje !== null && potom.vSloupcich === kolikSlibuje,
      `ve sloupcích ${potom.vSloupcich}, věta slibuje ${kolikSlibuje}`);
    pravda('a sloupců je aspoň tři, ne jeden na všechno',
      potom.sloupcu >= 3, `sloupců ${potom.sloupcu}`);
    pravda('značka naší nabídky stojí a nenajíždí',
      Math.abs(hned.posun - potom.posun) < 1 && potom.anim === 'none',
      `hned ${hned.posun.toFixed(1)} px, potom ${potom.posun.toFixed(1)} px, animace ${potom.anim}`);
    pravda('a leží uvnitř grafu, ne za jeho krajem',
      potom.posun >= -1 && potom.posun <= potom.stopa + 1,
      `${potom.posun.toFixed(1)} px ze stopy ${potom.stopa.toFixed(1)} px`);
  }
  await ctx.close();
}

// --- 2b) GRAF SE DÁ PROJET PRSTEM ----------------------------------
// Celý graf je jeden terč: prst jede po ose a sloupec pod ním se
// zvýrazní. Nad ním vyskočí bublina s tím, kolik nabídek v tom
// cenovém pásmu je. Měří se čtyři věci, a každá je past na
// jinou chybu:
//   • terč má aspoň 44 px (jinak se do něj prstem nedá trefit),
//   • klepnutí opravdu ukáže bublinu s číslem, ne prázdnou,
//   • bublina zůstane uvnitř karty i u kraje osy,
//   • `touch-action` nechá stránku rolovat — bez toho by prst na grafu
//     přestal hýbat stránkou a web by působil zaseknutě.
{
  const ctx = await prohlizec.newContext({ bypassCSP: true,  serviceWorkers: 'block', viewport: { width: 390, height: 844 },
    hasTouch: true, isMobile: true });
  const p = await ctx.newPage();
  await p.goto(ADRESA, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('.pvg-nase', { timeout: 12000 }).catch(() => {});
  await p.waitForTimeout(2200);          // ať je po druhém vykreslení z dat
  /* NEJDŘÍV K NĚMU DOROLOVAT. `touchscreen.tap` klepe na souřadnice
     OKNA, ne stránky — a graf se mezitím posunul níž (parametry
     pozemku šly nahoru pod cenu, viz js/pozemek.js). Bez odrolování
     klepnutí dopadlo na y 1 206 v okně vysokém 844, tedy do prázdna,
     a kontrola hlásila „bublina se neukázala", přestože graf fungoval.
     Stálo to hodinu hledání v kódu, který byl v pořádku. */
  await p.locator('.pvg-pas').scrollIntoViewIfNeeded().catch(() => {});
  await p.waitForTimeout(400);
  const pas = await p.evaluate(() => {
    const e = document.querySelector('.pvg-pas');
    if (!e) return null;
    const r = e.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height, ta: getComputedStyle(e).touchAction };
  });
  pravda('graf na telefonu stojí', !!pas, 'element .pvg-pas se nenašel');
  if (pas) {
    pravda(`a jeho dotykový terč má aspoň 44 px na výšku (${Math.round(pas.h)})`,
      pas.h >= 44, `${pas.h.toFixed(1)} px`);
    pravda('stránka se dá přes graf dál rolovat', /pan-y/.test(pas.ta || ''),
      `touch-action je „${pas.ta}"`);
    /* Klepnutí u levého kraje: tam se pozná i to, jestli bublina
       nevyleze z karty ven. */
    await p.touchscreen.tap(pas.x + pas.w * 0.04, pas.y + pas.h / 2);
    await p.waitForTimeout(200);
    const v = await p.evaluate(() => {
      const bub = document.querySelector('.pvg-bub');
      const karta = document.querySelector('.pz-verdict');
      if (!bub || !karta) return null;
      const rb = bub.getBoundingClientRect(), rk = karta.getBoundingClientRect();
      return { skryta: bub.hidden, txt: (bub.textContent || '').trim(),
        vybranych: document.querySelectorAll('.pvg-s.je-vyb').length,
        vlevo: Math.round(rb.left - rk.left), vpravo: Math.round(rk.right - rb.right) };
    });
    pravda('klepnutí na graf ukáže bublinu s cenou za metr',
      !!v && !v.skryta && /\d/.test(v.txt) && /Kč\/m/.test(v.txt), JSON.stringify(v));
    pravda('a zvýrazní právě jeden sloupec', !!v && v.vybranych === 1,
      `zvýrazněných sloupců: ${v && v.vybranych}`);
    pravda('bublina zůstane uvnitř karty i u kraje osy',
      !!v && v.vlevo >= 0 && v.vpravo >= 0, JSON.stringify(v));
  }
  await ctx.close();
}

// --- 3) Kdo má vypnuté animace, vidí přesně totéž --------------------
// U grafu je to snadné: nenajíždí ani s animacemi zapnutými. Kontrola
// tu zůstává jako past — kdyby někdo graf „oživil", musí to projít
// i přes vypnuté animace.
{
  const ctx = await kontext(true);
  const p = await ctx.newPage();
  await p.goto(ADRESA, { waitUntil: 'domcontentloaded' });
  await p.waitForSelector('.pvg-nase', { timeout: 8000 }).catch(() => {});
  const hned = await kdeJeZnacka(p);
  /* PEVNĚ SCHVÁLNĚ: mezi `hned` a měřením níž leží OKNO ANIMACE, ne
     čekání na připravenost. Leaflet posouvá značku transformací, což
     DOM nemění — „DOM utichl" by se tedy dočkal hned a zkouška by
     změřila půl pohybu (nebo žádný). */
  await p.waitForTimeout(900);
  const potom = await kdeJeZnacka(p);
  pravda('s vypnutými animacemi se v grafu nic nehýbe',
    hned && potom && Math.abs(hned.posun - potom.posun) < 1 && potom.anim === 'none',
    `hned ${hned && hned.posun.toFixed(1)} px, potom ${potom && potom.posun.toFixed(1)} px (animace ${potom && potom.anim})`);
  pravda('a graf je i tak celý vykreslený',
    potom && potom.vSloupcich >= 10 && potom.sloupcu >= 3,
    potom ? `nabídek ve sloupcích ${potom.vSloupcich}, sloupců ${potom.sloupcu}` : 'graf se nenašel');
  await ctx.close();
}

/* ---- A NIC JINÉHO SE TAKY HÝBAT NESMÍ ----
   Kontroly výš měří dvě konkrétní odezvy, na kterých ten slib stojí.
   Tahle projde CELOU stránku a počítá to, co člověka s omezením pohybu
   obtěžuje nejvíc: NEKONEČNÉ animace (pulzování, probleskující kostra)
   a přechody, které něčím POSOUVAJÍ (transform).
   Naměřeno (oddíl 98): bez omezení pohybu je na úvodní stránce jedna
   nekonečná animace a 16 posunů, na stránce pozemku jedna a dva —
   a s omezením nula a nula na obou. Není to tedy kontrola prázdna:
   měří se obojí a číslo bez omezení musí být nenulové, jinak by
   stránka mohla být jen rozbitá.
   JEDNA KONTROLA NA OBOJÍ, A MÁ TO NAMĚŘENÝ DŮVOD. Nejdřív to byly
   dvě (animace zvlášť, posuny zvlášť) a ta na animace PADNOUT
   NEMOHLA: v css/styles.css je jedno globální pravidlo
   `@media (prefers-reduced-motion:reduce){ *{animation:none
   !important; transition:none !important} }`, takže s omezením pohybu
   nemá co proklouznout — a dokud tam je, nedá se ta kontrola shodit
   ani novou animací bez vlastního pravidla (zkoušeno). Drží to tedy
   jedno pravidlo a hlídá se jako jedna věc; sabotáž, která tuhle
   kontrolu shodí, je právě odebrání toho pravidla. */
for (const [jmeno, adresa] of [['úvodní stránka', `${BASE}/index.html`], ['stránka pozemku', ADRESA]]) {
  const pohyb = {};
  for (const vypnuto of [true, false]) {
    const ctx = await kontext(vypnuto);
    const p = await ctx.newPage();
    await p.goto(adresa, { waitUntil: 'load' }).catch(() => {});
    await p.waitForTimeout(2500);
    pohyb[vypnuto ? 'vypnuto' : 'zapnuto'] = await p.evaluate(() => {
      const nekonecne = [], posuny = [];
      for (const e of document.querySelectorAll('*')) {
        const st = getComputedStyle(e);
        const r = e.getBoundingClientRect();
        if (!(r.width > 0 && r.height > 0) || st.visibility === 'hidden' || st.display === 'none' || st.opacity === '0') continue;
        const jm = e.id ? '#' + e.id : e.tagName.toLowerCase() + '.' + ((e.className || '').toString().split(' ')[0] || '');
        if (st.animationName && st.animationName !== 'none' && st.animationIterationCount === 'infinite') {
          nekonecne.push(jm + ' ← ' + st.animationName);
        }
        const td = parseFloat(st.transitionDuration) || 0;
        if (td > 0 && /transform|all/.test(st.transitionProperty || '')) {
          posuny.push(jm + ' ← ' + st.transitionProperty);
        }
      }
      return { nekonecne: [...new Set(nekonecne)], posuny: [...new Set(posuny)] };
    });
    await ctx.close();
  }
  const zap = pohyb.zapnuto, vyp = pohyb.vypnuto;
  // PŘEDPOKLAD: bez omezení pohybu se hýbat MUSÍ, jinak se neměří nic
  pravda(`${jmeno}: bez omezení pohybu se opravdu hýbe (${zap.nekonecne.length} animací, ${zap.posuny.length} posunů)`,
    zap.nekonecne.length + zap.posuny.length > 0,
    'nic se nehýbe ani bez omezení — kontrola níž by byla planá');
  pravda(`${jmeno}: s omezením pohybu se nehýbe nic`,
    vyp.nekonecne.length === 0 && vyp.posuny.length === 0,
    `nekonečné animace: ${vyp.nekonecne.slice(0, 4).join(' | ') || 'žádné'}`
    + `\n      posuny: ${vyp.posuny.slice(0, 4).join(' | ') || 'žádné'}`);
}

await prohlizec.close();
console.log('\nPohyb — drobná odezva, a pro koho ne, tak žádná');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Pohyb: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy));
  process.exit(1);
}
process.exit(0);
