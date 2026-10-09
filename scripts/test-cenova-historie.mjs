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

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const Z = createRequire(import.meta.url)(path.join(ROOT, 'js', 'zlevneni.js'));

let ok = 0, chyb = 0;
const zpravy = [];
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

const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));
await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));
const BASE = 'http://127.0.0.1:8310';
/* serviceWorkers: 'block' — bez toho stránku obsluhuje uložená kopie
   z offline režimu a zkouška čte staré HTML, aniž by to poznala. */
const ctx = await prohlizec.newContext({ viewport: { width: 390, height: 844 },
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
