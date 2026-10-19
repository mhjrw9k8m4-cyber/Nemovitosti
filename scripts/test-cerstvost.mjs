// Test: je na webu poznat, jak čerstvá data jsou — a který zdroj vypadl.
//
// Spuštění: node scripts/test-cerstvost.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome
//    a PK_LEAFLET_DIR=cesta/k/leaflet/dist)
//
// Proč: web ukazoval jedno datum za všechno dohromady — „aktualizováno
// 20. 9.". To zakrývá nejnebezpečnější případ, jaký u sbíraných dat je:
// JEDEN ZDROJ TIŠE PŘESTANE VRACET DATA a web dál tvrdí, že je čerstvý.
// Dražeb pomalu ubývá, nikdo si toho měsíce nevšimne.
//
// Robot proto u každého zdroje zapisuje, kdy naposledy odpověděl a kolik
// přinesl. Ostrý datový soubor to zatím nemá (robot od té změny neběžel),
// takže se tu podstrkuje — jinak by test jen mlčel a tvářil se spokojeně.
//
// Ověřuje se taky, že web zvládne STARÝ soubor bez těch údajů: nesmí se
// nic rozbít ani vypsat „undefined".
import { chromium } from 'playwright-core';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { hlasPad } from './zkouska-pad.mjs';

const KOREN_TESTU = new URL('..', import.meta.url).pathname;

await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const BASE = 'http://127.0.0.1:8310';
let ok = 0, chyb = 0;
const zpravy = [];
/* A KDYŽ TO SPADNE, AŤ TO TAKY NĚCO ŘEKNE — viz scripts/zkouska-pad.mjs.
   Bez tohohle se při výjimce (chybějící prvek, timeout klepnutí) zahodí
   všechny kontroly, které do té chvíle prošly, a v CI zbyde jen stopa. */
hlasPad('Čerstvost dat', zpravy);
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

const OSTRA = JSON.parse(readFileSync(new URL('../data/opportunities.json', import.meta.url), 'utf8'));
const dnes = new Date();
const dnesISO = dnes.toISOString().slice(0, 10);

/** Data s vyplněným stavem zdrojů — jeden z nich schválně spadlý. */
const SE_STAVEM = {
  updated: dnesISO,
  updated_at: new Date(dnes.getFullYear(), dnes.getMonth(), dnes.getDate(), 7, 0).toISOString(),
  sources: [
    { nazev: 'Dražby', stav: 'ok', pocet: 61, cas: dnesISO, chyba: null },
    { nazev: 'Bezrealitky', stav: 'chyba', pocet: 0, cas: dnesISO, chyba: 'HTTP 503' },
    /* NEZNÁMÝ stav s počtem. Robot jich umí zapsat šest a může přidat
       sedmý; odznak ho nemá ukázat jako „v pořádku" — to je přesně ta
       chyba, co tady byla, jen obráceně. */
    { nazev: 'Farmy', stav: 'neco-noveho', pocet: 412, cas: dnesISO, chyba: null },
    /* OSLABENÝ zdroj: odpověděl a něco přinesl, ale výrazně méně než
       jinak. Scraper pro to má vlastní stavy („pokles" proti mediánu
       posledních dnů, „propad" proti minulému běhu) — a odznak na webu
       je dlouho ignoroval, protože se řídil jen `stav === 'ok'`. Takový
       zdroj se hlásil jako „nedostupný" s popiskem „neodpověděl", což
       nebyla jen nepřesnost: v ostrých datech měly „OK dražby" stav
       „pokles" a 45 záznamů, a web u nich tvrdil, že neodpověděly. */
    { nazev: 'OK dražby', stav: 'pokles', pocet: 45, cas: dnesISO, chyba: null },
    /* A zdroj, který odpověděl a nic nepřinesl. Dřív u něj stálo
       „nedostupný / neodpověděl" — to je jiná porucha a vede k jinému
       hledání: tady neselhalo spojení, ale čtení stránky. */
    { nazev: 'SPÚ', stav: 'prazdno', pocet: 0, cas: dnesISO, chyba: null },

  ],
  opportunities: OSTRA.opportunities,
};
/** Starý soubor — přesně to, co na webu leží dnes, bez času a bez stavů. */
const STARA = { updated: dnesISO, source: OSTRA.source, opportunities: OSTRA.opportunities };

const PRAZDNA_DLAZDICE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64');
const LEAFLET = process.env.PK_LEAFLET_DIR || '';
const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));

async function otevri(data) {
  const ctx = await prohlizec.newContext({ serviceWorkers: 'block', viewport: { width: 1280, height: 900 } });
  // Pořadí je důležité: Playwright bere POSLEDNÍ shodu, takže obecné pravidlo první.
  await ctx.route('**/*', (r) => {
    const u = new URL(r.request().url());
    if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') return r.continue();
    if (r.request().resourceType() === 'image') return r.fulfill({ status: 200, contentType: 'image/png', body: PRAZDNA_DLAZDICE });
    return LEAFLET ? r.abort() : r.continue();
  });
  await ctx.route('**/config.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript',
    body: `window.PK_SUPABASE_URL='${BASE}';window.PK_SUPABASE_KEY='anon';` }));
  await ctx.route('**/data/opportunities.json*', (r) => r.fulfill({ status: 200,
    contentType: 'application/json', body: JSON.stringify(data) }));
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
  return { ctx, p, chyby };
}

// --- 1) S vyplněným stavem zdrojů ------------------------------------
{
  const { ctx, p, chyby } = await otevri(SE_STAVEM);
  const v = await p.evaluate(() => ({
    hlavicka: (document.getElementById('data-updated') || {}).textContent || '',
    znacky: [...document.querySelectorAll('.source-chip')].map((c) => {
      const z = c.querySelector('.src-stav');
      return { zdroj: c.getAttribute('data-zdroj') || '', text: c.textContent.trim(),
        stav: z ? z.textContent : null,
        zle: z ? z.classList.contains('src-zle') : false,
        slabe: z ? z.classList.contains('src-slabe') : false,
        popis: z ? z.title : null };
    }),
  }));
  /* MEZERA MŮŽE BÝT NEZLOMITELNÁ. Od 14. 10. sází krok sazby i texty,
     které skládá prohlížeč, takže se ve větě objeví „v\u00a0…". Vzor
     hlídá SLOVA, ne tvar mezery — tahle past dostala za jedno
     odpoledne pět zkoušek, a pokaždé měla pravdu o smyslu a mýlila se
     o zápisu. */
  pravda('čerstvost se uvádí i s časem, ne jen datem', /dnes v[\s\u00a0]7:00/.test(v.hlavicka),
    `vyšlo „${v.hlavicka}"`);
  const sesStavem = v.znacky.filter((z) => z.stav);
  pravda('u zdrojů je vidět, kolik naposledy přinesly', sesStavem.length >= 2,
    `se stavem jen ${sesStavem.length} z ${v.znacky.length}`);
  /* Konkrétní zdroj, ne „některý z nich". Dřív stálo `/61×|412×/` přes
     celý seznam — a tím by prošlo i to, že se číslo ukáže u cizího
     odznaku. Právě na tom se tady už jednou pohořelo (páruje se podle
     data-zdroj, ne podle textu). */
  const funkcni = sesStavem.find((z) => z.zdroj === 'Dražby');
  pravda('funkční zdroj ukazuje počet záznamů, a svůj',
    !!(funkcni && funkcni.stav === '61×'), JSON.stringify(funkcni));
  // Tohle je jádro testu.
  const spadly = sesStavem.find((z) => z.zdroj === 'Bezrealitky');
  pravda('spadlý zdroj je označený jako nedostupný',
    !!(spadly && /nedostupn/.test(spadly.stav)), JSON.stringify(spadly));
  pravda('a je odlišený i barvou, ne jen slovem',
    !!(spadly && spadly.zle === true));
  /* A teď ten čtvrtý stav. Oslabený zdroj má říct dvě věci zároveň:
     KOLIK přinesl (bez čísla nepoznám, jak hluboko to spadlo) a že to
     je málo. Nesmí tedy tvrdit „nedostupný", ani se tvářit normálně. */
  const slaby = sesStavem.find((z) => z.zdroj === 'OK dražby');
  pravda('oslabený zdroj ukazuje počet, který přinesl',
    !!(slaby && /45/.test(slaby.stav)), JSON.stringify(slaby));
  pravda('a netvrdí o sobě, že neodpověděl',
    !!(slaby && !/nedostupn|bez záznam/.test(slaby.stav)), JSON.stringify(slaby));
  pravda('ale je označený jako oslabený, ne jako v pořádku',
    !!(slaby && slaby.slabe === true && slaby.zle === false), JSON.stringify(slaby));
  pravda('a popisek vysvětluje, že přinesl méně než jinak',
    !!(slaby && /méně/.test(slaby.popis || '')), JSON.stringify(slaby && slaby.popis));
  /* Prázdná odpověď ≠ žádná odpověď. Obojí je špatně, ale hledá se
     jinde: u prázdné stránka odpověděla a selhalo čtení. */
  const prazdny = sesStavem.find((z) => z.zdroj === 'SPÚ');
  pravda('zdroj, který odpověděl a nic nepřinesl, netvrdí „nedostupný"',
    !!(prazdny && /bez záznam/.test(prazdny.stav)), JSON.stringify(prazdny));
  pravda('a jeho popisek nemluví o neodpovězení',
    !!(prazdny && !/neodpověděl/.test(prazdny.popis || '')), JSON.stringify(prazdny && prazdny.popis));
  /* ŽÁDNÝ STAV NESMÍ PROPADNOUT do „v pořádku". */
  const neznamy = sesStavem.find((z) => z.zdroj === 'Farmy');
  pravda('neznámý stav s počtem se neukáže jako v pořádku',
    !!(neznamy && neznamy.slabe === true && /412/.test(neznamy.stav)), JSON.stringify(neznamy));
  pravda('se stavem zdrojů nespadl žádný skript', chyby.length === 0, chyby[0]);
  await ctx.close();
}

// --- 1b) Neúplný sken není změřený úbytek ----------------------------
/* „OK dražby" se nestahují seznamem — projíždí se tři tisíce ID po
   jednom. Když se část dotazů nedoručí, NEVÍME, jestli je nabídek míň;
   víme jen, že jsme se na všechno nezeptali. Odznak to tedy nesmí
   vydávat za zjištěný úbytek, protože to je jiné zjištění a vede
   k jinému hledání: u poklesu se čte parser, u neúplného skenu síť.
   Má to vlastní načtení stránky, protože dlaždic se zdroji je na webu
   pět a všech pět už obsadily stavy výš. */
{
  const NEUPLNY = Object.assign({}, SE_STAVEM, { sources: [
    { nazev: 'OK dražby', stav: 'neuplne', pocet: 52, cas: dnesISO, chyba: null,
      dotazu: 3021, selhalo: 400 },
  ] });
  const { ctx, p, chyby } = await otevri(NEUPLNY);
  const z = await p.evaluate(() => {
    const chip = document.querySelector('.source-chip[data-zdroj="OK dražby"]');
    const s = chip && chip.querySelector('.src-stav');
    return s ? { stav: s.textContent, popis: s.title,
      slabe: s.classList.contains('src-slabe'), zle: s.classList.contains('src-zle') } : null;
  });
  pravda('neúplný sken ukazuje počet, který stihl přinést',
    !!(z && /52/.test(z.stav)), JSON.stringify(z));
  pravda('a je označený jako oslabený, ne jako v pořádku',
    !!(z && z.slabe === true && z.zle === false), JSON.stringify(z));
  pravda('a popisek mluví o nedoručených dotazech, ne o zjištěném úbytku',
    !!(z && /nedoručila/.test(z.popis || '') && !/výrazně méně/.test(z.popis || '')),
    JSON.stringify(z && z.popis));
  pravda('s neúplným skenem nespadl žádný skript', chyby.length === 0, chyby[0]);
  await ctx.close();
}

// --- 2) Starý soubor bez těch údajů ----------------------------------
{
  const { ctx, p, chyby } = await otevri(STARA);
  const v = await p.evaluate(() => ({
    hlavicka: (document.getElementById('data-updated') || {}).textContent || '',
    znacky: document.querySelectorAll('.src-stav').length,
  }));
  pravda('starý soubor bez času se vypíše bez „undefined"',
    v.hlavicka.length > 0 && !/undefined|NaN|null/.test(v.hlavicka), `vyšlo „${v.hlavicka}"`);
  pravda('a bez stavů zdrojů se žádné značky nevyrábějí', v.znacky === 0,
    `značek ${v.znacky}`);
  pravda('se starým souborem nespadl žádný skript', chyby.length === 0, chyby[0]);
  await ctx.close();
}

// --- 3) Robot ty údaje opravdu zapisuje ------------------------------
// Sběr odsud spustit nejde (všechny zdroje jsou z téhle schránky blokované),
// takže se kontroluje aspoň to, že je robot do souboru zapisuje.
{
  const robot = readFileSync(new URL('../scripts/fetch-opportunities.mjs', import.meta.url), 'utf8');
  pravda('robot zapisuje přesný čas kontroly', /updated_at:/.test(robot));
  pravda('robot zapisuje stav každého zdroje', /sources:\s*zdroje/.test(robot));
  pravda('a u spadlého zdroje i důvod', /chyba:\s*r\.status === 'rejected'/.test(robot));
}

await prohlizec.close();
/* --- Stará kopie v prohlížeči --------------------------------------
   Čerstvost dat není jen otázka robota. GitHub Pages posílá soubory
   s „nech si to deset minut", takže když se stahují napřímo, člověk může
   po opravě koukat na stará data i hodinu — a hlásit chybu, která už
   neexistuje. Přesně to se stalo. Každé stažení datového souboru se proto
   musí u serveru ověřit („no-cache" = použij kopii, ale zeptej se, jestli
   platí; při shodě přijde jen prázdná odpověď, nic se nestahuje znovu). */
{
  const SOUBORY = ['js/main.js', 'js/pozemek.js', 'js/nove-pozemky.js', 'hlidani.html', 'muj-inzerat.html'];
  const spatne = [];
  for (const f of SOUBORY) {
    const t = readFileSync(path.join(KOREN_TESTU, f), 'utf8');
    // najdeme každé stažení datového souboru a podíváme se, s jakým nastavením
    const re = /fetch\(\s*(?:url|u|'data\/[a-z-]+\.json')\s*(?:,\s*\{([^}]*)\})?\s*\)/g;
    let m;
    while ((m = re.exec(t))) {
      const volby = m[1] || '';
      if (!/cache:\s*'no-(cache|store)'/.test(volby)) spatne.push(`${f}: ${m[0].slice(0, 60)}`);
    }
  }
  pravda('datové soubory se vždycky ověří u serveru', spatne.length === 0,
    'bez toho zůstane v telefonu stará kopie:\n      ' + spatne.join('\n      '));
}

console.log('\nČerstvost dat a stav zdrojů');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Čerstvost dat: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy));
  process.exit(1);
}
process.exit(0);
