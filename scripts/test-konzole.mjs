// Test: žádná stránka nehlásí chybu a nic z ní nevyčuhuje.
//
// Spuštění: node scripts/test-konzole.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome
//    a PK_LEAFLET_DIR=cesta/k/leaflet/dist)
//
// Proč tohle existuje:
//
// Tuhle kontrolu jsem několikrát dělal ručně a pokaždé něco našla — naposledy
// to, že se na stránce pozemku vůbec nevykresloval odhad ceny, protože se
// skripty načetly ve špatném pořadí. Ručně dělaná kontrola ale platí jen do
// další změny. Proto je z ní test.
//
// Hlídají se dvě věci, které se jinak snadno přehlédnou:
//
// 1) CHYBY SKRIPTŮ. Rozbitý skript se navenek nijak neprojeví — jen některá
//    část stránky tiše chybí. Testy jednotlivých funkcí to nezachytí, protože
//    každý kouká jen na svůj kousek.
//
// 2) VODOROVNÉ PŘETÉKÁNÍ. Když je jeden prvek širší než obrazovka, celá
//    stránka se na mobilu posouvá do stran a působí rozbitě. Vzniká to
//    nenápadně — dlouhým slovem, širokou tabulkou, odsazením navíc — a na
//    počítači to není vidět vůbec.
import { chromium } from 'playwright-core';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pricinaChyb } from './chyby-hlaska.mjs';

await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const BASE = 'http://127.0.0.1:8310';
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

// Od každého druhu stránky jedna. Krajské a okresní jsou generované ze
// stejné šablony, takže stačí vzorek.
const STRANKY = [
  'index.html',
  'pozemek.html?p=Police%7C6242%7CVset%C3%ADn&ll=48.97,15.63',
  'pridat.html', 'hlidani.html', 'zpravy.html',
  'muj-inzerat.html', 'kontakt.html', 'cena-pozemku.html',
  'hypoteka-na-pozemek.html', 'podminky.html', 'pravidla-inzerce.html',
  /* Nový druh stránky: velký formulář, který při každém stisku klávesy
     překresluje výstup. Je to jediné místo na webu, kde se text skládá
     průběžně z toho, co člověk píše — tedy i jediné, kde se chyba
     skriptu projeví až po vyplnění, ne hned při načtení. */
  'kupni-smlouva-pozemek.html',
  'pozemky-okres-tabor.html', 'pozemky-stredocesky-kraj.html',
  'pozemky-podle-okresu.html', 'drazby-pozemku.html',
  'drazby-pozemku-nabidky.html', 'predloha.html', '404.html',
];

const PRAZDNA_DLAZDICE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64');
const LEAFLET = process.env.PK_LEAFLET_DIR || '';
const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));

async function projdi(sirka, popisSirky) {
  const ctx = await prohlizec.newContext({ viewport: { width: sirka, height: 900 } });
  // Pořadí je důležité: Playwright bere POSLEDNÍ shodu, takže obecné pravidlo první.
  await ctx.route('**/*', (r) => {
    const u = new URL(r.request().url());
    if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') return r.continue();
    if (r.request().resourceType() === 'image') return r.fulfill({ status: 200, contentType: 'image/png', body: PRAZDNA_DLAZDICE });
    return LEAFLET ? r.abort() : r.continue();
  });
  await ctx.route('**/config.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript',
    body: `window.PK_SUPABASE_URL='${BASE}';window.PK_SUPABASE_KEY='anon';`
      + 'window.PK_MAIL_ZAPNUTO=true;' }));
  /* PŘIHLÁŠENÝ. Bez toho se na Upozorněních, Zprávách a Můj profil
     vykreslí jen výzva „přihlaste se" — a chyba skriptu ve vypisování
     upozornění, vláken nebo uložených hledání by se nikde neprojevila.
     Fail-open chování webu ji navíc spolkne: co se nepovede, se tiše
     vynechá. Totéž se ukázalo u dotykových terčů a u kontrastu. */
  await ctx.addInitScript(() => {
    localStorage.setItem('pk_auth', JSON.stringify({ access_token: 'tok-majitel',
      refresh_token: 'ref-majitel',
      user: { id: '11111111-1111-4111-8111-111111111111', email: 'majitel@test.cz' } }));
  });
  if (LEAFLET) {
    await ctx.route('https://unpkg.com/leaflet@**', (r) => {
      const f = path.join(LEAFLET, path.basename(new URL(r.request().url()).pathname));
      if (!existsSync(f)) return r.abort();
      return r.fulfill({ status: 200, contentType: f.endsWith('.css') ? 'text/css' : 'text/javascript', body: readFileSync(f) });
    });
    // Podpis (integrity) místní kopii Leafletu nesedí — prohlížeč by ji zahodil.
    for (const c of ['index.html', 'pozemek.html']) {
      await ctx.route(`${BASE}/${c}*`, async (r) => {
        const o = await r.fetch();
        return r.fulfill({ status: 200, contentType: 'text/html; charset=utf-8',
          body: (await o.text()).replace(/\s+integrity="[^"]*"/g, '') });
      });
    }
  }

  const sChybou = [], sPretekem = [], sDoStran = [];

  const sBezPisma = [];
  for (const s of STRANKY) {
    const p = await ctx.newPage();
    const chyby = [];
    p.on('pageerror', (e) => chyby.push(String(e).slice(0, 140)));
    p.on('console', (m) => {
      if (m.type() !== 'error') return;
      const t = m.text();
      // Nenačtený obrázek nebo favicona není chyba kódu — ty tu schválně
      // nahrazujeme prázdnými, aby test nesahal ven z počítače.
      if (/favicon|net::ERR|Failed to load resource/i.test(t)) return;
      chyby.push(t.slice(0, 140));
    });
    await p.goto(`${BASE}/${s}`, { waitUntil: 'domcontentloaded' });
    await p.waitForTimeout(3800);

    if (chyby.length) sChybou.push({ s, proc: chyby[0] });

    /* A JEŠTĚ: PÍSMA SE OPRAVDU POUŽILA.
       Písma jsou podřezaná na znaky, které web ukazuje (fonts/PUVOD.md),
       a 253 kB z nich je 149 kB. Že v sadě nic nechybí, hlídá staticky
       scripts/test-pisma.mjs; tady se ověřuje to druhé — že podřezaný
       soubor je pořád platné písmo a prohlížeč ho použil. Poškozený
       woff2 by se tiše nahradil systémovým písmem a vypadalo by to jen
       „trochu jinak".
       Měří se obojí: jestli písmo umí celou českou větu se symboly,
       a jestli se s ním text opravdu vykresluje — šířka téhož textu
       v našem písmu se musí lišit od šířky v záložním. */
    const pisma = await p.evaluate(async () => {
      const CES = 'Příliš žluťoučký kůň úpěl ďábelské ódy — 6 336 m², 1 990 000 Kč §©°±²·×÷';
      /* NEJDŘÍV SI O NĚ ŘÍCT. Prohlížeč stahuje řezy písma AŽ PODLE
         znaků, které se na stránce opravdu vyskytnou, takže
         fonts.check() napoprvé odpovídal „neumí" u stránek, kde se
         zatím žádný znak z rozšířeného rozsahu nevykreslil — to ale
         není vada písma, jen pořadí. Měří se tedy po načtení: umí ho
         písmo vykreslit, když si o to řekneme? */
      try {
        await document.fonts.load('600 16px Inter', CES);
        await document.fonts.load('700 32px Fraunces', CES);
      } catch (e) {}
      await document.fonts.ready;
      /* Stránka bez našeho stylopisu (404.html) žádné @font-face nemá —
         není co měřit a není to vada. */
      if (!document.fonts.size) return { preskoc: true };
      const sirka = (font) => {
        const c = document.createElement('canvas').getContext('2d');
        c.font = font;
        return Math.round(c.measureText(CES).width);
      };
      return {
        inter: document.fonts.check('600 16px Inter', CES),
        fraunces: document.fonts.check('700 32px Fraunces', CES),
        interPouzito: sirka('600 16px Inter, serif') !== sirka('600 16px serif'),
        frauncesPouzito: sirka('700 32px Fraunces, monospace') !== sirka('700 32px monospace'),
      };
    });
    if (pisma.preskoc) {
      /* nic: stránka bez @font-face */
    } else if (!pisma.inter || !pisma.fraunces) {
      sBezPisma.push(`${s}: neumí celou českou větu (Inter ${pisma.inter}, Fraunces ${pisma.fraunces})`);
    } else if (!pisma.interPouzito || !pisma.frauncesPouzito) {
      sBezPisma.push(`${s}: písmo se nepoužilo (Inter ${pisma.interPouzito}, Fraunces ${pisma.frauncesPouzito})`);
    }

    const pretek = await p.evaluate(() => {
      const w = document.documentElement.clientWidth;
      // Nestačí koukat, jestli se stránka posouvá do stran: web má na <body>
      // overflow-x:clip, takže se nic neposune — příliš široký obsah se prostě
      // UŘÍZNE. To je horší než posuv a přes scrollWidth to vidět není.
      // Proto se měří prvky přímo.
      const vPosuvniku = (e) => {
        for (let x = e.parentElement; x && x !== document.body; x = x.parentElement) {
          const o = getComputedStyle(x).overflowX;
          // Posuvný nebo ořezávající rodič si svůj obsah řídí sám (mapa,
          // vodorovné pásy). Tam přesah do stran není vada rozvržení.
          if (o === 'auto' || o === 'scroll' || o === 'hidden' || o === 'clip') return true;
        }
        return false;
      };
      for (const e of document.querySelectorAll('body *')) {
        const st = getComputedStyle(e);
        if (st.display === 'none' || st.visibility === 'hidden' || st.position === 'fixed') continue;
        const r = e.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        /* POZOR, tahle výjimka tu kdysi byla a byla špatně:
             „prvek celý mimo obrazovku vlevo je schválně schovaný,
              tak se dělá přeskočit na obsah — to není vada rozvržení."
           Jenže právě takový prvek (.skip-link na left:-9999px) dělá
           stránku širokou přes deset tisíc pixelů. Vidět to není, protože
           se to ořezává, ale na iPhonu s takovou stránkou jde posouvat do
           stran — obsah ujede a nahoře se k tomu odlepí lepivá hlavička.
           Schovává se zmenšením na jeden pixel a ořezem, ne odsunutím. */
        if (r.right <= w + 1 && r.left >= -1) continue;
        if (vPosuvniku(e)) continue;
        return {
          kdo: (e.tagName.toLowerCase() + '.' + String(e.className || '').split(' ').filter(Boolean).slice(0, 2).join('.')).slice(0, 60),
          prave: Math.round(r.right), vlevo: Math.round(r.left), sirka: w,
        };
      }
      return null;
    });
    if (pretek) sPretekem.push({ s, pretek });
    // Nejpřímější měřítko: jde stránkou pohnout do stran?
    const doStran = await p.evaluate(() => {
      const de = document.documentElement;
      return de.scrollWidth > de.clientWidth + 1
        ? { sirka: de.scrollWidth, okno: de.clientWidth } : null;
    });
    if (doStran) sDoStran.push({ s, doStran });
    await p.close();
  }
  await ctx.close();

  pravda(`${popisSirky}: na každé stránce se použila podřezaná písma`,
    sBezPisma.length === 0, sBezPisma.slice(0, 3).join(' | '));
  pravda(`${popisSirky}: žádná stránka nehlásí chybu skriptu`, sChybou.length === 0,
    sChybou.map((x) => `${x.s} → ${x.proc}`).join('\n      '));
  pravda(`${popisSirky}: žádnou stránkou nejde pohnout do stran`, sDoStran.length === 0,
    sDoStran.map((x) => `${x.s} → obsah je ${x.doStran.sirka} px široký, okno má ${x.doStran.okno}`).join('\n      '));
  pravda(`${popisSirky}: nic z žádné stránky nevyčuhuje do stran`, sPretekem.length === 0,
    sPretekem.map((x) => `${x.s} → ${x.pretek.kdo} zabírá ${x.pretek.vlevo}–${x.pretek.prave} px při šířce okna ${x.pretek.sirka}`).join('\n      '));
}

await projdi(1280, 'Počítač');
await projdi(390, 'Mobil');

await prohlizec.close();
console.log('\nChyby skriptů a přetékání — ' + STRANKY.length + ' druhů stránek, na mobilu i na počítači');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Kontrola stránek: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy));
  process.exit(1);
}
process.exit(0);
