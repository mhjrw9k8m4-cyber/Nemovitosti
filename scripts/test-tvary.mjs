// Test: druh příležitosti se pozná i bez barev.
//
// Spuštění: node scripts/test-tvary.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome
//    a PK_LEAFLET_DIR=cesta/k/leaflet/dist)
//
// Proč: druh (prodej / dražba / exekuce / obec / majitel) rozlišovala jedině
// barva. Zhruba každý dvanáctý muž rozlišuje barvy jinak a zrovna červená
// proti oranžové — tedy exekuce proti dražbě — je nejčastější dvojice, která
// splyne. Každý druh proto má na mapě vlastní TVAR.
//
// Test nespoléhá na to, že v HTML existuje nějaká třída. Kreslení na plátno
// si píšeme sami (Leaflet umí jen kolečka), takže nejpravděpodobnější tichá
// porucha je, že se naše kreslení přestane volat a všechno se vrátí ke
// kolečkům — a toho si nikdo nevšimne. Test proto ČTE PIXELY z plátna mapy
// a z nich pozná, jestli je tam trojúhelník, kosočtverec nebo kolečko.
import { chromium } from 'playwright-core';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { hlasPad } from './zkouska-pad.mjs';

const { BASE } = await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

let ok = 0, chyb = 0;
const zpravy = [];
/* A KDYŽ TO SPADNE, AŤ TO TAKY NĚCO ŘEKNE — viz scripts/zkouska-pad.mjs.
   Bez tohohle se při výjimce (chybějící prvek, timeout klepnutí) zahodí
   všechny kontroly, které do té chvíle prošly, a v CI zbyde jen stopa. */
hlasPad('Tvary', zpravy);
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

const DATA = JSON.parse(readFileSync(new URL('../data/opportunities.json', import.meta.url), 'utf8')).opportunities;
/* VZOREK MUSÍ STÁT SÁM. Bral se prostě první pozemek daného druhu —
   jenže tvar se měří z pixelů ve čtverci 22×22 kolem jeho tečky, a když
   má soused tečku pár pixelů vedle, připočítá se do měření jeho.
   Stalo se to po jedné dávce dat od robota: poměr „dole ku nahoře" spadl
   z dvojnásobku na 1,93 a zkouška hlásila, že se trojúhelníky přestaly
   kreslit. Nepřestaly — do měření se přimíchal soused. Bere se proto
   pozemek, kolem kterého do pěti kilometrů žádný jiný není. */
const kmMezi = (a1, b1, a2, b2) => {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (a2 - a1) * rad, dLng = (b2 - b1) * rad;
  const q = Math.sin(dLat / 2) ** 2 + Math.cos(a1 * rad) * Math.cos(a2 * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(q)));
};
const vzorek = (t) => DATA.find((d) => d.type === t && d.lat && d.lng
    && !DATA.some((y) => y !== d && y.lat && y.lng && kmMezi(d.lat, d.lng, y.lat, y.lng) < 5))
  || DATA.find((d) => d.type === t && d.lat && d.lng);

const PRAZDNA_DLAZDICE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64');
const LEAFLET = process.env.PK_LEAFLET_DIR || '';
const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));
const ctx = await prohlizec.newContext({ bypassCSP: true,  serviceWorkers: 'block', viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
// Pořadí je důležité: Playwright bere POSLEDNÍ shodu, takže obecné pravidlo první.
await ctx.route('**/*', (r) => {
  const u = new URL(r.request().url());
  if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') return r.continue();
  if (r.request().resourceType() === 'image') return r.fulfill({ status: 200, contentType: 'image/png', body: PRAZDNA_DLAZDICE });
  return LEAFLET ? r.abort() : r.continue();
});
await ctx.route('**/config.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript',
  body: `window.PK_SUPABASE_URL='${BASE}';window.PK_SUPABASE_KEY='anon';` }));
if (LEAFLET) {
  await ctx.route('https://unpkg.com/leaflet@**', (r) => {
    const f = path.join(LEAFLET, path.basename(new URL(r.request().url()).pathname));
    if (!existsSync(f)) return r.abort();
    return r.fulfill({ status: 200, contentType: f.endsWith('.css') ? 'text/css' : 'text/javascript', body: readFileSync(f) });
  });
  await ctx.route(`${BASE}/index.html`, async (r) => {
    const o = await r.fetch();
    return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8',
      body: (await o.text()).replace(/\s+integrity="[^"]*"/g, '') });
  });
}

const p = await ctx.newPage();
const chyby = [];
p.on('pageerror', (e) => chyby.push(String(e)));
await p.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(4200);
await p.evaluate(() => document.querySelector('.mvt-btn[data-mv="mapa"]')?.click());
await p.waitForTimeout(700);

// --- 1) Tabulka tvarů: každý druh musí mít svůj vlastní ---------------
const tvary = await p.evaluate(() => window.PK_TVARY || null);
pravda('mapa zná tabulku tvarů', !!tvary, 'window.PK_TVARY chybí');
if (tvary) {
  const vData = [...new Set(DATA.map((d) => d.type))];
  const prirazene = vData.map((t) => tvary[t]);
  pravda('každý druh v datech má přiřazený tvar', prirazene.every(Boolean),
    `chybí tvar pro ${vData.filter((t) => !tvary[t]).join(', ')}`);
  pravda('žádné dva druhy nesdílejí tvar', new Set(prirazene).size === prirazene.length,
    `tvary ${JSON.stringify(Object.fromEntries(vData.map((t, i) => [t, prirazene[i]])))}`);
}

// --- 2) Legenda učí tentýž tvar, jaký je na mapě ----------------------
const legenda = await p.evaluate(() => [...document.querySelectorAll('#map-legend .lg-item')]
  .filter((e) => !e.classList.contains('lg-urgent'))
  .map((e) => ({ popis: e.textContent.trim(), tvar: [...e.querySelector('.lg-dot').classList].find((c) => c.startsWith('tv-')) })));
pravda('legenda má u každého druhu tvar, ne jen barvu',
  legenda.length > 0 && legenda.every((l) => !!l.tvar),
  JSON.stringify(legenda));
pravda('tvary v legendě se navzájem liší',
  new Set(legenda.map((l) => l.tvar)).size === legenda.length,
  JSON.stringify(legenda.map((l) => l.tvar)));

/* --- 2b) A JE TA LEGENDA VŮBEC ČITELNÁ? ------------------------------
   Tvar v legendě je k ničemu, když ho nikdo nepřečte. Majitel poslal
   snímek telefonu s větou „dole je jen malý nápis co je co, chtělo by
   to výraznější text, aby věděli, co ty barvy znamenají" — a měl pravdu
   na milimetr: naměřeno 12px písmo (nejmenší stupeň na webu), tečky
   10–12 px a max-width, která legendě ubírala 86 px z 390. Hlídá se
   proto i VELIKOST, ne jen přítomnost.
   Měří se na TELEFONU, protože tam je místa nejmíň a tam to taky
   majitel vyfotil. */
{
  const tel = await prohlizec.newContext({ bypassCSP: true,  serviceWorkers: 'block',
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'cs-CZ' });
  const tp = await tel.newPage();
  await tp.goto(`${BASE}/index.html`, { waitUntil: 'load' });
  await tp.waitForTimeout(2600);
  // Na telefonu se začíná seznamem; legenda je u mapy.
  await tp.evaluate(() => { const b = document.querySelector('.mvt-btn[data-mv="mapa"]'); if (b) b.click(); });
  await tp.waitForTimeout(1600);
  const lg = await tp.evaluate(() => {
    const e = document.getElementById('map-legend');
    if (!e) return null;
    const cs = getComputedStyle(e);
    const r = e.getBoundingClientRect();
    const rodic = e.parentElement.getBoundingClientRect();
    const tecky = [...e.querySelectorAll('.lg-dot')].map((d) => Math.round(d.getBoundingClientRect().width));
    const nad = e.querySelector('.lg-nadpis');
    /* PULZUJÍCÍ KRUH SE MUSÍ VEJÍT. Puntík „končí do 14 dní" se
       v legendě láme na druhý řádek, takže stojí jako první zleva —
       a kruh kolem něj se při animaci roztahuje. Naměřeno na 390 px:
       základ 19 px (poloměr 9,5), střed 18,5 px od okraje; při
       scale(2,2) z toho vyšel poloměr 20,9 px a kruh přetekl o 2,4 px
       ZA OKRAJ OKNA, kde ho hrana uřízla na placku.
       Nejširší okamžik se nedá změřit snímkem (je to pseudoprvek
       a animace běží dokola), takže se spočítá: vnějšek základního
       kruhu × největší scale z @keyframes. */
    const kr = e.querySelector('.lg-ring');
    let pulz = null;
    if (kr) {
      const a = getComputedStyle(kr, '::after');
      const kb = kr.getBoundingClientRect();
      let max = 1;
      for (const ss of document.styleSheets) {
        let pravidla;
        try { pravidla = ss.cssRules; } catch { continue; }
        for (const pr of pravidla) {
          if (pr.name !== a.animationName || !pr.cssRules) continue;
          for (const kf of pr.cssRules) {
            const m = /scale\(([\d.]+)\)/.exec(kf.style.transform || '');
            if (m) max = Math.max(max, parseFloat(m[1]));
          }
        }
      }
      const ram = parseFloat(a.borderTopWidth) || 0;
      const vnejsi = a.boxSizing === 'border-box'
        ? parseFloat(a.width) : parseFloat(a.width) + 2 * ram;
      const stred = kb.left + kb.width / 2;
      pulz = { max, vnejsi,
        vlevoVOkne: Math.round((stred - (vnejsi / 2) * max) * 10) / 10,
        vlevoVLegende: Math.round((stred - (vnejsi / 2) * max - r.left) * 10) / 10 };
    }
    return { pismo: parseFloat(cs.fontSize), vaha: parseInt(cs.fontWeight, 10),
      sirka: Math.round(r.width), rodicSirka: Math.round(rodic.width),
      tecky, pulz, nadpis: nad ? nad.textContent.trim() : null };
  });
  pravda('legenda se na telefonu vůbec vykreslila', !!lg, 'prvek #map-legend nemá rozměr');
  if (lg) {
    /* Třináct je nejmenší stupeň, jakým na tomhle webu mluví ovládání
       (viz řada nad výpisem). Vysvětlivky k mapě nesmějí být menší. */
    pravda('legenda má aspoň 13px písmo', lg.pismo >= 13, 'má ' + lg.pismo + ' px');
    /* Tvar se pozná od tvaru až od určité velikosti: při deseti
       pixelech splývá kosočtverec s trojúhelníkem. */
    pravda('a tečky v ní mají aspoň 13 px', lg.tecky.length > 0 && Math.min(...lg.tecky) >= 13,
      'nejmenší má ' + (lg.tecky.length ? Math.min(...lg.tecky) : '—') + ' px');
    /* Legenda leží POD mapou a nemá čemu uhýbat. Když si někdo zase
       vzpomene na max-width z dob, kdy plavala nad ní, text se zbytečně
       láme a majitel pošle další snímek. */
    pravda('a bere celou šířku pruhu pod mapou', lg.sirka >= lg.rodicSirka - 1,
      lg.sirka + ' px z ' + lg.rodicSirka + ' px');
    /* Bez nadpisu je to řádek slov s puntíky a nikde není řečeno,
       že je to klíč k mapě. */
    pravda('a má nadpis, který říká, co to je', /^Co znamenaj/.test(lg.nadpis || ''),
      'nadpis: ' + JSON.stringify(lg.nadpis));
    // PŘEDPOKLAD: bez pulzujícího puntíku není co měřit
    pravda('legenda má i pulzující puntík „končí do ... dní"', !!lg.pulz,
      'prvek .lg-ring v legendě není');
    if (lg.pulz) {
      pravda('a jeho kruh se v nejširší chvíli vejde do okna',
        lg.pulz.vlevoVOkne >= -0.5,
        `v nejširší chvíli sahá na ${lg.pulz.vlevoVOkne} px, tedy ${-lg.pulz.vlevoVOkne} px za okraj `
        + `(základ ${lg.pulz.vnejsi} px × scale ${lg.pulz.max})`);
      pravda('a nevyteče ani z legendy', lg.pulz.vlevoVLegende >= -0.5,
        `sahá ${lg.pulz.vlevoVLegende} px od levého okraje legendy`);
    }
  }
  await tel.close();
}

// --- 3) Jádro: opravdu se ty tvary na plátno kreslí? ------------------
// Přečteme pixely kolem bodu a porovnáme, kolik barvy je v horní a v dolní
// desetině výšky tvaru. Trojúhelník má nahoře špičku a dole základnu, takže
// je poměr výrazný; kolečko i kosočtverec jsou nahoru dolů symetrické. Kdyby
// se naše kreslení přestalo volat, Leaflet by nakreslil kolečko.
//
// OKNO SE TVARU PŘIZPŮSOBÍ, A TO JE TU PODSTATNÉ
// Dřív se čtlo pevné okno 22×22 px na středu bodu. Jenže značka je mnohem
// větší: naměřená výška tvaru je 26 až 44 px podle přiblížení. Okno tedy
// leželo CELÉ UVNITŘ tvaru — u kolečka vyšlo 484 barevných pixelů ze 484,
// tedy úplně plné — a „poměr horní a dolní třetiny" nebyl o špičce
// a základně, ale o tom, kudy náhodou procházely šikmé strany. Vycházelo
// z toho 1,93 proti mezi 2,0, takže zkouška padala a vstávala podle toho,
// jak se značka zvětšila. Okno se teď zvětšuje, dokud nemá kolem tvaru
// volno, a teprve pak se měří. Naměřeno s ním:
//   trojúhelník 4,67–5,01 · kolečko 1,00–1,01 · kosočtverec 1,00–1,08
// Mez 2,5 tedy leží mezi dvěma skupinami, ne na jedné z nich.
async function profil(d) {
  return await p.evaluate(({ lat, lng }) => {
    const map = window.PK_MAPA;
    if (!map) return null;
    map.setView([lat, lng], 14, { animate: false });
    const pane = document.querySelector('.leaflet-dots-pane') || document.querySelector('[class*="dots"]');
    const cv = pane && pane.querySelector('canvas');
    if (!cv) return null;
    const pt = map.latLngToContainerPoint([lat, lng]);
    const rc = cv.getBoundingClientRect();
    const mapR = map.getContainer().getBoundingClientRect();
    // plátno může být posunuté proti kontejneru mapy
    const x = Math.round(pt.x + mapR.left - rc.left);
    const y = Math.round(pt.y + mapR.top - rc.top);
    const g = cv.getContext('2d');
    function radkyPro(R) {
      let img;
      try { img = g.getImageData(x - R, y - R, R * 2, R * 2); } catch (e) { return null; }
      const out = [];
      for (let j = 0; j < R * 2; j++) {
        let n = 0;
        for (let i = 0; i < R * 2; i++) if (img.data[(j * R * 2 + i) * 4 + 3] > 40) n++;
        out.push(n);
      }
      return out;
    }
    let R = 12, radky = null, volno = false;
    for (; R <= 96; R *= 2) {
      radky = radkyPro(R);
      if (!radky) return null;
      if (radky[0] === 0 && radky[radky.length - 1] === 0) { volno = true; break; }
    }
    return { radky, R, volno };
  }, { lat: d.lat, lng: d.lng });
}
/** Horní a dolní desetina VÝŠKY TVARU (ne okna). */
function kraje(r) {
  const radky = r.radky;
  const prvni = radky.findIndex((v) => v > 0);
  if (prvni < 0) return { celkem: 0, rozsah: 0, horni: 0, dolni: 0, pomer: 0 };
  const posledni = radky.length - 1 - [...radky].reverse().findIndex((v) => v > 0);
  const rozsah = posledni - prvni + 1;
  const k = Math.max(1, Math.round(rozsah * 0.3));
  const sou = (a, b) => radky.slice(a, b).reduce((x, y) => x + y, 0);
  const horni = sou(prvni, prvni + k), dolni = sou(posledni - k + 1, posledni + 1);
  return { celkem: sou(0, radky.length), rozsah, horni, dolni,
    pomer: dolni / Math.max(1, horni), prvniRadek: radky[prvni] };
}

const exek = vzorek('exekuce');
const prodej = vzorek('sale');
const drazba = vzorek('drazba');

if (exek) {
  const r = await profil(exek);
  const t = r && kraje(r);
  pravda('na plátně je u exekuce vůbec něco nakresleno', !!(t && t.celkem > 8),
    `napočítáno ${t && t.celkem} barevných pixelů`);
  /* Pojistka, bez které měřila předchozí verze patu uvnitř tvaru: okolo
     tvaru musí být v okně volno, jinak se špička ani základna nevidí. */
  pravda('a vešel se do okna i s volným okrajem', !!(r && r.volno),
    `okno došlo na R=${r && r.R} a pořád je u kraje barva — v okně je asi i soused`);
  if (t && t.celkem > 8 && r.volno) {
    pravda('exekuce se kreslí jako trojúhelník (dole širší než nahoře)',
      t.pomer >= 2.5,
      `horní desetina výšky ${t.horni} px, dolní ${t.dolni} px, poměr ${t.pomer.toFixed(2)} ` +
      `(výška tvaru ${t.rozsah} px) — u kolečka i kosočtverce vychází 1,0, takže se nejspíš ` +
      'přestalo volat naše kreslení a Leaflet vrátil kolečka');
  }
}
let prodejR = null;
if (prodej) {
  const r = await profil(prodej);
  const t = r && kraje(r);
  if (t && t.celkem > 8 && r.volno) {
    prodejR = t;
    pravda('na prodej se kreslí jako kolečko (nahoře i dole stejně)',
      t.pomer > 0.7 && t.pomer < 1.4, `poměr dolní/horní desetiny je ${t.pomer.toFixed(2)}`);
  }
}
/* Kosočtverec má nahoře špičku taky — a přesto to není trojúhelník. Tohle
   hlídá, že se tvary nerozlišují podle „je nahoře úzký", ale podle
   souměrnosti; jinak by zkouška prošla, i kdyby se z trojúhelníku stal
   kosočtverec. */
if (drazba) {
  const r = await profil(drazba);
  const t = r && kraje(r);
  if (t && t.celkem > 8 && r.volno) {
    pravda('dražba je souměrná (kosočtverec, ne trojúhelník)',
      t.pomer > 0.7 && t.pomer < 1.4, `poměr dolní/horní desetiny je ${t.pomer.toFixed(2)}`);
    if (prodejR) {
      pravda('a přitom má nahoře špičku, kdežto kolečko ne',
        t.prvniRadek < prodejR.prvniRadek,
        `kosočtverec má první řádek ${t.prvniRadek} px, kolečko ${prodejR.prvniRadek} px`);
    }
  }
}

pravda('na stránce nespadl žádný skript', chyby.length === 0, chyby[0]);

/* --- ODZNAKY MLUVÍ JEDNÍM HLASEM -----------------------------------
   Na jedné kartě stojí vedle sebe „Dražba", „−48 % proti okolí",
   „Doporučujeme", „podíl 15/128" a „úřední cena (§ 12)". Když má každý
   jinou velikost nebo váhu, karta vypadá slepená ze tří webů.
   MĚŘÍ SE VYKRESLENÝ STAV, ne pravidla ve stylopisu: ta se překrývají
   (v css/styles.css má půl tuctu odznaků napsáno 12 px, ale
   `.opp-chips > *` je přebíjí na 13 px) — zkouška nad zdrojem by tedy
   hlídala něco jiného, než co lidé vidí. Naměřeno 19. 10.: 13 px / 600
   u všech. */
{
  const odznaky = await p.evaluate(() => {
    const ven = [];
    for (const k of [...document.querySelectorAll('.opp-item')].slice(0, 12)) {
      for (const e of k.querySelectorAll('.opp-chips > *, .opp-badge')) {
        const s = getComputedStyle(e);
        ven.push({ trida: e.className, px: s.fontSize, vaha: s.fontWeight });
      }
    }
    return ven;
  });
  /* PŘEDPOKLAD: bez odznaků se nedá měřit jejich jednota. */
  pravda('je co měřit — odznaky na kartách', odznaky.length >= 5,
    `našlo se jich ${odznaky.length}`);
  if (odznaky.length >= 5) {
    const velikosti = [...new Set(odznaky.map((o) => o.px))];
    const vahy = [...new Set(odznaky.map((o) => o.vaha))];
    pravda('odznaky na kartách mají jednu velikost', velikosti.length === 1,
      `velikosti: ${velikosti.join(', ')} — např. ${odznaky.map((o) => o.trida + ' ' + o.px).slice(0, 4).join(' | ')}`);
    pravda('a jednu váhu', vahy.length === 1,
      `váhy: ${vahy.join(', ')} — např. ${odznaky.map((o) => o.trida + ' ' + o.vaha).slice(0, 4).join(' | ')}`);
  }
}

await prohlizec.close();
console.log('\nDruh příležitosti se pozná i bez barev');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Tvary: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy));
  process.exit(1);
}
process.exit(0);
