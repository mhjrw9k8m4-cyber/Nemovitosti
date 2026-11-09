/* Test: historie ceny u pozemku — a že si ji web nevymýšlí.
   ==================================================================
   Spuštění: PW_CHROMIUM=… node scripts/test-cenova-historie.mjs

   PROČ. „Cena šla dolů z 189 000 na 179 000 dne 29. 9." je na stránce
   pozemku údaj, který si člověk nemůže ověřit nikde jinde — minulou
   cenu vidí jen od nás. Tím spíš musí sedět, a proto se tu zkouší
   dvakrát: nejdřív sám výpočet nad vymyšleným archivem, kde předem
   víme, co je pravda, a potom opravdová stránka v prohlížeči, kde se
   vykreslené řádky porovnají s tím, co je do ní vepsané.

   DVĚ PASTI, KTERÉ TO HLÍDÁ:
     1. Archiv při změně ceny uzavře období se STAROU cenou a nabídka
        běží dál s novou. Novou cenu tedy drží NÁSLEDUJÍCÍ řádek a
        u poslední změny živý stav. Kdo to spojí špatně, poslední
        zlevnění vůbec neuvidí — a to je to nejzajímavější.
     2. Skok nad PKZlevneni.MEZ_PODEZRELA (125 000 → 9 000 Kč) není
        sleva, ale chyba zdroje. Nesmí se o něm říkat „zlevněno".
   ================================================================== */
import { chromium } from 'playwright-core';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { historiePodleKlice, jenZmeny } from './cenova-historie.mjs';
import { nactiArchiv } from './archiv-statistiky.mjs';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { hlasPad } from './zkouska-pad.mjs';
import { stavStranky } from './vzorek-pozemku.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const Z = createRequire(import.meta.url)(path.join(ROOT, 'js', 'zlevneni.js'));

let ok = 0, chyb = 0;
const zpravy = [];
/* A KDYŽ TO SPADNE, AŤ TO TAKY NĚCO ŘEKNE — viz scripts/zkouska-pad.mjs.
   Bez tohohle se při výjimce (chybějící prvek, timeout klepnutí) zahodí
   všechny kontroly, které do té chvíle prošly, a v CI zbyde jen stopa. */
hlasPad('Historie ceny', zpravy);
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
/* K prvkům polí se chodí přes tohle: při sabotáži jinak test spadne
   výjimkou a z červeného CI není poznat, co se pokazilo. */
const pol = (p, i) => (p && p[i]) || {};

/* ================= 1) VÝPOČET NAD VYMYŠLENÝM ARCHIVEM ============= */
{
  const A = 'Kolín|1/1|Kolín|50.0|15.2';   /* tři ceny, visí dál */
  const B = 'Brno|2/2|Brno|49.2|16.6';     /* zlevnila a zmizela */
  const C = 'Zlín|3/3|Zlín|49.2|17.6';     /* zmizela a vrátila se za totéž */
  const uzavrene = [
    { k: A, c: 1000000, od: '2026-02-01', do: '2026-02-11', proc: 'cena' },
    { k: A, c: 900000, od: '2026-02-12', do: '2026-02-22', proc: 'cena' },
    { k: B, c: 500000, od: '2026-02-05', do: '2026-02-09', proc: 'cena' },
    { k: B, c: 450000, od: '2026-02-10', do: '2026-02-20', proc: 'zmizela' },
    { k: C, c: 300000, od: '2026-02-01', do: '2026-02-03', proc: 'zmizela' },
    { k: C, c: 300000, od: '2026-02-08', do: '2026-02-15', proc: 'zmizela' },
  ];
  const stav = { nabidky: { [A]: { od: '2026-02-23', c: 810000 } } };
  const h = historiePodleKlice(uzavrene, stav);

  const a = h.get(A) || {};
  pravda('tři ceny dají tři body', (a.body || []).length === 3,
    JSON.stringify(a.body));
  pravda('a poslední je ta živá, ne ta z archivu',
    pol(a.body, 2).c === 810000 && pol(a.body, 2).d === '2026-02-23', JSON.stringify(a.body));
  pravda('u každého bodu je den, kdy ta cena ZAČALA platit',
    pol(a.body, 0).d === '2026-02-01' && pol(a.body, 1).d === '2026-02-12', JSON.stringify(a.body));
  pravda('nabídka, co visí dál, nemá den zmizení', a.zmizela === null);

  const b = h.get(B) || {};
  pravda('u zmizelé nabídky je poslední cena ta z archivu',
    (b.body || []).length === 2 && pol(b.body, 1).c === 450000, JSON.stringify(b.body));
  pravda('a je u ní den, kdy zmizela', b.zmizela === '2026-02-20');

  /* Zmizení a vrácení za TOUTÉŽ cenu není změna ceny. Bez téhle
     podmínky by v historii stál dvakrát týž údaj a vypadalo by to,
     že se něco dělo. */
  const c = h.get(C) || {};
  pravda('zmizení a vrácení za stejnou cenu nedělá druhý bod',
    (c.body || []).length === 1, JSON.stringify(c.body));

  /* Začátek: co má `od` přesně na prvním dni, který archiv zná, jsme
     vzniknout neviděli — to datum je převzaté ze zdroje. */
  pravda('začátek na prvním dni archivu se nepočítá za viděný', a.zacatekVidet === false);
  pravda('začátek později už ano', (h.get(B) || {}).zacatekVidet === true);

  pravda('jenZmeny() nechá jen nabídky, kde se cena měnila',
    jenZmeny(h).size === 2 && jenZmeny(h).has(A) && jenZmeny(h).has(B),
    'zbylo: ' + [...jenZmeny(h).keys()].join(', '));

  /* Kroky skládá PKZlevneni — tady se jen ověří, že na těchhle datech
     vydá to, co má, včetně obou mezí. */
  pravda('krok A1→A2 je sleva o 10 %', (Z.krok(1000000, 900000, '') || {}).procent === 10);
  pravda('a skok 125 000 → 9 000 je „k ověření", ne sleva',
    (Z.krok(125000, 9000, '') || {}).podezrela === true && !/levněno/.test(Z.text(Z.krok(125000, 9000, ''))));
}

/* ================= 2) OPRAVDOVÁ STRÁNKA ========================== */
/* Která stránka má historii, se nehádá — hledá se v HTML ostrůvek
   window.PK_POZEMEK s polem h. Kdyby generátor historii přestal
   vepisovat, nenajde se žádná a zkouška to řekne, místo aby mlčela. */
const sHistorii = [], bezHistorie = [];
for (const f of readdirSync(ROOT).filter((x) => x.startsWith('pozemek-') && x.endsWith('.html'))) {
  const m = /window\.PK_POZEMEK=(\{.*?\});<\/script>/.exec(readFileSync(path.join(ROOT, f), 'utf8'));
  if (!m) continue;
  let o; try { o = JSON.parse(m[1]); } catch (e) { continue; }
  /* JEN ŽIVÉ STRÁNKY. Na vyřazené („Tato nabídka už není aktuální")
     se blok historie nekreslí — a je to tak správně. Dokud se vzorek
     bral v pořadí adresáře, spadly do něj právě ty a zkouška hlásila
     „blok historie se vykreslil: ne" jako vadu webu. Táž příčina jako
     u třinácti dalších zkoušek, proto týž pomocník. */
  if (stavStranky(f) !== 'ziva') continue;
  if (o.h && o.h.length > 1) { if (sHistorii.length < 3) sHistorii.push({ f, o }); }
  else if (bezHistorie.length < 1) bezHistorie.push({ f, o });
}
{
  const vse = readdirSync(ROOT).filter((x) => x.startsWith('pozemek-') && x.endsWith('.html')).length;
  const kolik = readdirSync(ROOT).filter((x) => x.startsWith('pozemek-') && x.endsWith('.html'))
    .filter((f) => /"h":\[\[/.test(readFileSync(path.join(ROOT, f), 'utf8'))).length;
  pravda(`historii má aspoň 20 z ${vse} stránek pozemků (${kolik})`, kolik >= 20,
    'generátor ji možná přestal vepisovat');
  pravda('a ne všechny — jeden bod není historie', kolik < vse);
}

/* ---- ČTYŘI SLEPÁ MÍSTA, KTERÁ NAŠLA SABOTÁŽ -------------------
 * ==================================================================
 * Smyčka samorozvoje 4. 11. obrátila v `scripts/cenova-historie.mjs`
 * čtyři věci a tahle zkouška mlčela — přitom ten soubor nehlídá nikdo
 * jiný (§397), takže obvinění bylo pevné. Každá z nich je tady
 * doložená fixturou, nad kterou je PŘEDEM jasné, co má vyjít.
 */
{
  /* 1) DVA BODY NESMÍ MÍT TÝŽ DEN. Živá cena si nese `od` = věk
     inzerátu, ne den, kdy začala platit. Když se rovná dni poslední
     uzavřené ceny, musí se posunout na konec toho období — jinak by
     v grafu stály dvě různé ceny na jednom dni a nebylo by poznat,
     která je novější. Sabotáž `<=` na `<` tu rovnost pustí dál. */
  const h1 = historiePodleKlice(
    [{ k: 'X', od: '2026-01-10', do: '2026-02-20', c: 500000, proc: 'cena' }],
    { nabidky: { X: { od: '2026-01-10', c: 400000 } } });
  const b1 = (h1.get('X') || {}).body || [];
  pravda('živá cena se stejným dnem jako uzavřená se posune na konec období',
    b1.length === 2 && pol(b1, 1).d === '2026-02-20',
    `vyšlo ${JSON.stringify(b1)}`);
  pravda('a dny v historii jdou dopředu, ne dvakrát týž',
    b1.length === 2 && pol(b1, 0).d < pol(b1, 1).d,
    `${pol(b1, 0).d} → ${pol(b1, 1).d}`);

  /* 2) ŘADÍ SE PODLE `od`, NE PODLE `do`. Dvě období téže nabídky se
     mohou překrývat (to starší skončí později), a kdo je srovná podle
     `do`, obrátí historii: zlevnění vypadá jako zdražení. Sabotáž
     `===` na `!==` v porovnávači přepne klíč řazení. */
  const h2 = historiePodleKlice([
    { k: 'Y', od: '2026-02-01', do: '2026-02-05', c: 200000, proc: 'cena' },
    { k: 'Y', od: '2026-01-01', do: '2026-03-01', c: 100000, proc: 'cena' },
  ], { nabidky: {} });
  const b2 = (h2.get('Y') || {}).body || [];
  pravda('období se řadí podle začátku, i když to pozdější skončí dřív',
    b2.length === 2 && pol(b2, 0).c === 100000 && pol(b2, 1).c === 200000,
    `vyšlo ${JSON.stringify(b2)}`);
  pravda('a začátek celé historie je den prvního období',
    (h2.get('Y') || {}).od === '2026-01-01', String((h2.get('Y') || {}).od));

  /* 3) ŘÁDEK BEZ CENY NEBO BEZ DNE NENÍ BOD. Archiv může mít řádek
     s nulou (nabídka bez ceny) i bez `od`; obojí se zahazuje. Sabotáž
     tu pojistku vypne a do grafu se dostane bod s cenou 0 — a to je
     na stránce vidět jako „zlevněno na 0 Kč". */
  const h3 = historiePodleKlice([
    { k: 'Z', od: '2026-01-05', do: '2026-01-20', c: 0, proc: 'cena' },
    { k: 'Z', od: '', do: '2026-01-25', c: 300000, proc: 'cena' },
    { k: 'Z', od: '2026-01-20', do: '2026-02-02', c: 300000, proc: 'cena' },
  ], { nabidky: {} });
  const b3 = (h3.get('Z') || {}).body || [];
  pravda('řádek bez ceny ani bez dne se do historie nedostane',
    b3.length === 1 && pol(b3, 0).c === 300000 && pol(b3, 0).d === '2026-01-20',
    `vyšlo ${JSON.stringify(b3)}`);
  pravda('a žádný bod nemá cenu nula ani prázdný den',
    b3.every((x) => x.c > 0 && !!x.d), `vyšlo ${JSON.stringify(b3)}`);

  /* 4) PRÁZDNÉ „od" NESMÍ URČIT ZAČÁTEK POZOROVÁNÍ. Začátek je
     nejstarší den, který archiv zná; prázdná hodnota se musí vyhodit,
     jinak je „začátek" prázdný řetězec, `zacatekVidet` spadne na false
     a web přestane u nabídek přiznávat, že jejich vznik neviděl.
     Sabotáž zahodí `.filter(Boolean)`. */
  const h4 = historiePodleKlice([
    { k: 'A', od: '', do: '2026-01-02', c: 111000, proc: 'cena' },
    { k: 'A', od: '2026-01-02', do: '2026-01-20', c: 111000, proc: 'cena' },
    { k: 'B', od: '2026-03-01', do: '2026-03-20', c: 222000, proc: 'cena' },
    { k: 'B', od: '2026-03-20', do: '2026-04-01', c: 333000, proc: 'cena' },
  ], { nabidky: {} });
  pravda('prázdné „od" neurčuje začátek pozorování',
    (h4.get('B') || {}).zacatekVidet === true,
    'B začíná 1. 3., nejstarší známý den je 2. 1. — vznik jsme tedy viděli;'
    + ` vyšlo ${JSON.stringify((h4.get('B') || {}).zacatekVidet)}`);
  pravda('a nabídka z nejstaršího dne se za viděnou nevydává',
    (h4.get('A') || {}).zacatekVidet === false,
    `vyšlo ${JSON.stringify((h4.get('A') || {}).zacatekVidet)}`);
}

const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));
const { BASE } = await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));
/* serviceWorkers: 'block' — bez toho stránku obsluhuje uložená kopie
   z offline režimu a zkouška čte staré HTML, aniž by to poznala. */
const ctx = await prohlizec.newContext({ bypassCSP: true,  viewport: { width: 390, height: 844 },
  isMobile: true, hasTouch: true, locale: 'cs-CZ', serviceWorkers: 'block' });
await ctx.route('**/*', (r) => {
  const u = new URL(r.request().url());
  return (u.hostname === '127.0.0.1' || u.hostname === 'localhost') ? r.continue() : r.abort();
});

for (const { f, o } of sHistorii) {
  const page = await ctx.newPage();
  await page.goto(`${BASE}/${f}`, { waitUntil: 'load' });
  await page.waitForSelector('.pz-historie', { timeout: 8000 }).catch(() => {});
  const m = await page.evaluate(() => {
    const blok = document.querySelector('.pz-historie');
    if (!blok) return null;
    const radky = [...blok.querySelectorAll('.pz-hist-radek')].map((r) => ({
      den: (r.querySelector('.pz-hist-den') || {}).textContent || '',
      cena: (r.querySelector('.pz-hist-cena') || {}).textContent || '',
      zmena: (r.querySelector('.pz-hist-zmena') || {}).textContent || '',
      ted: r.classList.contains('ted'),
    }));
    const r = blok.getBoundingClientRect();
    return { radky, pozn: (blok.querySelector('.pz-hist-pozn') || {}).textContent || '',
      preteka: r.right > window.innerWidth + 0.5 || r.left < -0.5,
      sirkaStranky: document.documentElement.scrollWidth, okno: window.innerWidth };
  });
  const jm = f.replace('pozemek-', '').replace('.html', '');
  pravda(`${jm}: blok historie se vykreslil`, !!m);
  if (!m) { await page.close(); continue; }
  pravda(`${jm}: má tolik řádků, kolik je bodů (${o.h.length})`, m.radky.length === o.h.length,
    JSON.stringify(m.radky.map((x) => x.cena)));
  const cis = (t) => Number(String(t).replace(/[^\d]/g, ''));
  pravda(`${jm}: ceny v řádcích sedí na vepsaná data`,
    o.h.every((b, i) => cis(pol(m.radky, i).cena) === b[1]),
    JSON.stringify(m.radky.map((x) => x.cena)) + ' vs ' + JSON.stringify(o.h.map((b) => b[1])));
  pravda(`${jm}: dny sedí a jsou česky (ne 2026-09-19)`,
    o.h.every((b, i) => pol(m.radky, i).den === Z.lidsky(b[0])),
    JSON.stringify(m.radky.map((x) => x.den)));
  pravda(`${jm}: poslední řádek je označený jako dnešní cena`,
    m.radky.length > 0 && m.radky[m.radky.length - 1].ted === true
    && m.radky.slice(0, -1).every((x) => !x.ted));
  /* Procenta nesmí vzniknout na stránce podruhé — musí vyjít stejně
     jako z modulu, který je skládá i pro kartu na mapě. */
  for (let i = 1; i < o.h.length; i++) {
    const k = Z.krok(o.h[i - 1][1], o.h[i][1], o.h[i][0]);
    if (!k) continue;
    pravda(`${jm}: změna u ${i + 1}. řádku je ${k.procent} % jako z PKZlevneni`,
      cis(pol(m.radky, i).zmena) === k.procent, 'na stránce „' + pol(m.radky, i).zmena + '"');
    pravda(`${jm}: a ${k.podezrela ? 'podezřelý skok nemá' : 'sleva má'} znaménko`,
      k.podezrela ? !/[−+]/.test(pol(m.radky, i).zmena) : /[−+]/.test(pol(m.radky, i).zmena),
      'na stránce „' + pol(m.radky, i).zmena + '"');
  }
  pravda(`${jm}: u historie stojí, odkud je a co v ní není`,
    /zapisujeme/.test(m.pozn) && /starší/.test(m.pozn), 'poznámka: ' + m.pozn);
  pravda(`${jm}: na 390 px nic nepřetéká`, !m.preteka && m.sirkaStranky <= m.okno + 1,
    `scrollWidth ${m.sirkaStranky} / okno ${m.okno}`);
  await page.close();
}

/* A stránka BEZ historie nesmí mít prázdný nadpis „Historie ceny". */
for (const { f } of bezHistorie) {
  const page = await ctx.newPage();
  await page.goto(`${BASE}/${f}`, { waitUntil: 'load' });
  await page.waitForSelector('.pz-priceblock', { timeout: 8000 }).catch(() => {});
  const ma = await page.evaluate(() => !!document.querySelector('.pz-historie'));
  pravda('pozemek s jednou známou cenou žádnou historii neukazuje', ma === false);
  await page.close();
}

/* A ještě jedna věta pravdy: kolik jich v archivu vůbec je. */
{
  const { uzavrene, stav } = nactiArchiv();
  const zmeny = jenZmeny(historiePodleKlice(uzavrene, stav));
  pravda(`archiv zná historii ceny u ${zmeny.size} nabídek (dřív web ukazoval jen poslední běh)`,
    zmeny.size > 50, 'v archivu je jen ' + zmeny.size);
}

await ctx.close();
await prohlizec.close();

console.log('\nHistorie ceny u pozemku: ' + (ok + chyb) + ' kontrol');
console.log(zpravy.join('\n'));
if (chyb) { console.error(`\n::error::Historie ceny: ${chyb} kontrol neprošlo.${pricinaChyb(zpravy)}`); process.exit(1); }
console.log('\nVšechny prošly.\n');
process.exit(0);
