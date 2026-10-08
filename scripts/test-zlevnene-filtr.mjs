/* Test: přepínač „Zlevněné" ukazuje právě to, co zlevnilo.
   ==================================================================
   Spuštění: PW_CHROMIUM=… node scripts/test-zlevnene-filtr.mjs

   PROČ. Karta na mapě umí říct „Zlevněno o 11 %", ale uměla to jen
   z POSLEDNÍHO běhu robota: pole cena_drive má 21 nabídek z 2 004,
   protože se při každém běhu přepíše. Archiv zná víc, a tak se
   historie dosazuje z data/zlevneni.json a přibyl k tomu filtr.

   Filtr je nebezpečnější než odznak. Odznak se splete u jedné karty;
   filtr řekne „tohle je VŠECHNO, co zlevnilo" — a kdo si podle něj
   vybírá, tomu chybějící nabídky nedojdou. Tahle zkouška proto počítá
   očekávaný výsledek NEZÁVISLE, v Node, z týchž modulů (js/klic.js,
   js/zlevneni.js, js/cisteni.js, js/hlidani-logika.js), a porovná ho
   s tím, co stránka opravdu ukáže.

   CO SE HLÍDÁ:
     A) data/zlevneni.json má tvar a klíče, na které se dá napojit
     B) po zapnutí filtru zbude přesně tolik nabídek, kolik má
     C) a každá viditelná karta má odznak o změně ceny
     D) zdražení ani podezřelý skok filtrem neprojdou
     E) vypnutí a „Zrušit filtry" filtr opravdu zruší
   ================================================================== */
import { chromium } from 'playwright-core';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const req = createRequire(import.meta.url);
const KLIC = req(path.join(ROOT, 'js', 'klic.js')).PKKlic;
const Z = req(path.join(ROOT, 'js', 'zlevneni.js'));
const PKC = req(path.join(ROOT, 'js', 'cisteni.js'));
const PKH = req(path.join(ROOT, 'js', 'hlidani-logika.js'));

let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* ---- A) soubor se zlevněními ---- */
const cestaZl = path.join(ROOT, 'data', 'zlevneni.json');
if (!existsSync(cestaZl)) {
  console.error('::error::data/zlevneni.json není — spusťte node scripts/oprav.mjs');
  process.exit(1);
}
const zl = JSON.parse(readFileSync(cestaZl, 'utf8'));
const klice = Object.keys(zl.nabidky || {});
pravda(`data/zlevneni.json má nabídky (${klice.length})`, klice.length >= 20,
  'je jich jen ' + klice.length);
pravda('každá má aspoň dva body historie',
  klice.every((k) => Array.isArray(zl.nabidky[k]) && zl.nabidky[k].length > 1));
pravda('body jsou [den, cena] a dny jdou odpředu',
  klice.every((k) => zl.nabidky[k].every((b) => /^\d{4}-\d{2}-\d{2}$/.test(b[0]) && b[1] > 0)
    && zl.nabidky[k].every((b, i, a) => i === 0 || a[i - 1][0] <= b[0])));
/* Klíč MUSÍ být klíč archivu, ne hrubý pkey: ten sedí na dva různé
   pozemky naráz a historie by se přilepila k cizí nabídce. */
pravda('klíče jsou klíče archivu (pkey#otisk), ne hrubý pkey',
  klice.every((k) => /#/.test(k)), 'například: ' + klice[0]);

/* ---- očekávaný výsledek, spočítaný nezávisle na stránce ---- */
const data = JSON.parse(readFileSync(path.join(ROOT, 'data', 'opportunities.json'), 'utf8'));
/* Tatáž cesta jako v js/main.js: PKCisteni.pozemky na načtená data,
   pak PKHlidani.bezDuplicit v boot(). */
const vse = PKH.bezDuplicit(PKC.pozemky((data.opportunities || data).slice()));
/* POČÍTAJÍ SE VŠECHNY NABÍDKY, ne jen ty z archivu. Nejdřív jsem
   procházel jen klíče z data/zlevneni.json a vyšlo 57, kdežto stránka
   ukázala 59 — a stránka měla pravdu: PKZlevneni.zmena() bere nejdřív
   cena_drive z posledního běhu robota a až potom historii z archivu.
   Dvě nabídky tedy zlevnily podle posledního běhu, a v archivu to ještě
   není. Filtr je má pustit dál a tahle zkouška je musí umět spočítat. */
const cekano = { zlevnene: [], zdrazene: [], podezrele: [], sum: 0, zArchivu: 0, zBehu: 0 };
for (const d of vse) {
  const h = zl.nabidky[KLIC.klicArchivu(d)];
  if (h && h.length > 1) d.h = h;
  const z = Z.zmena(d);
  if (!z) { if (d.h) cekano.sum++; continue; }
  if (d.cena_drive > 0) cekano.zBehu++; else cekano.zArchivu++;
  if (z.podezrela) cekano.podezrele.push(d);
  else if (z.dolu) cekano.zlevnene.push(d);
  else cekano.zdrazene.push(d);
}
pravda(`očekáváme ${cekano.zlevnene.length} zlevněných nabídek`, cekano.zlevnene.length >= 10,
  'spočítalo se jich jen ' + cekano.zlevnene.length);
/* Kvůli čemu to celé vzniklo: archiv ví o mnohonásobně víc změnách než
   poslední běh robota. Kdyby tenhle poměr spadl, filtr je k ničemu
   a nemá smysl kvůli němu stahovat další soubor. */
pravda(`archiv dodal ${cekano.zArchivu} změn, poslední běh robota ${cekano.zBehu}`,
  cekano.zArchivu > cekano.zBehu * 2,
  'archiv už nepřidává dost, aby se ten soubor vyplatil');

const kde = process.env.PW_CHROMIUM || '';
await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));
/* serviceWorkers: 'block' — jinak stránku obsluhuje uložená kopie
   z offline režimu a zkouška čte staré HTML i stará data. */
const ctx = await prohlizec.newContext({ viewport: { width: 1280, height: 900 },
  locale: 'cs-CZ', serviceWorkers: 'block' });
await ctx.route('**/*', (r) => {
  const u = new URL(r.request().url());
  return (u.hostname === '127.0.0.1' || u.hostname === 'localhost') ? r.continue() : r.abort();
});
const page = await ctx.newPage();
await page.goto('http://127.0.0.1:8310/index.html', { waitUntil: 'load' });
await page.waitForFunction(() => {
  const el = document.getElementById('map-count');
  return el && /\d/.test(el.textContent);
}, { timeout: 20000 }).catch(() => {});

/* Kolik nabídek web pokládá za zlevněné — ptáme se jeho vlastním
   modulem nad jeho vlastními daty, ne přes DOM: karty se vypisují
   po stránkách a ve výpisu jich nikdy není všech dva tisíce. */
const vPage = await page.evaluate(() => {
  const out = { modul: typeof window.PKZlevneni, klic: typeof window.PKKlic };
  return out;
});
pravda('stránka má oba moduly', vPage.modul === 'object' && vPage.klic === 'object',
  JSON.stringify(vPage));

/* ---- B) + C) zapnutí filtru ---- */
/* Přepínače leží ve sbaleném panelu filtrů (<details id="ms-filters">).
   Panel se musí nejdřív otevřít — a to je samo o sobě kontrola: kdyby
   se přepínač do panelu nedostal, zůstal by neviditelný a klepnutí by
   nešlo. */
await page.evaluate(() => { const p = document.getElementById('ms-filters'); if (p) p.open = true; });
await page.waitForTimeout(300);
const tlacitko = await page.$('#map-zlevnene');
pravda('přepínač „Zlevněné" je na stránce', !!tlacitko);
pravda('a v otevřeném panelu je vidět',
  !!tlacitko && await tlacitko.isVisible());
if (tlacitko) {
  const pred = await page.$eval('#map-count', (e) => e.textContent.replace(/\D/g, ''));
  await tlacitko.click();
  await page.waitForTimeout(600);
  const po = await page.$eval('#map-count', (e) => e.textContent.replace(/\D/g, ''));
  pravda(`počet se zapnutím zmenšil (${pred} → ${po})`, Number(po) < Number(pred),
    `před ${pred}, po ${po}`);
  pravda(`a zbylo přesně ${cekano.zlevnene.length}, jak vyšlo v Node`,
    Number(po) === cekano.zlevnene.length, `stránka ukazuje ${po}`);
  pravda('přepínač hlásí stav i pro odečítač obrazovky',
    await page.$eval('#map-zlevnene', (e) => e.getAttribute('aria-pressed')) === 'true');

  /* Každá vypsaná karta musí mít odznak o změně ceny — jinak filtr
     pustil dál něco, o čem karta mlčí.
     VÝPIS JE #opp-list, ne #deals-grid. Napoprvé jsem hledal karty
     v #deals-grid („Nejvýhodnější právě teď"), ten byl prázdný a
     kontrola prošla naprázdno nad čtyřmi cizími prvky — přesně ten
     druh zelené slepoty, kvůli které se tyhle věci sabotují. */
  const karty = await page.evaluate(() => {
    /* Ve výpisu nejsou jen karty: je v něm i řádek se stránkováním
       („Strana 1 z 3") a kostry před načtením. Za kartu se bere to, co
       má tělo nabídky. */
    const k = [...document.querySelectorAll('#opp-list > li')]
      .filter((li) => !li.classList.contains('opp-skel') && li.querySelector('.opp-body'));
    return { pocet: k.length,
      bezOdznaku: k.filter((c) => !c.querySelector('.opp-zlevneno, .opp-zdrazeno, .opp-overit')).length,
      prvniBez: (k.find((c) => !c.querySelector('.opp-zlevneno, .opp-zdrazeno, .opp-overit')) || { innerText: '' })
        .innerText.slice(0, 80) };
  });
  pravda(`vypsané karty (${karty.pocet}) mají odznak o změně ceny`,
    karty.pocet > 0 && karty.bezOdznaku === 0,
    `bez odznaku: ${karty.bezOdznaku} · první: ${karty.prvniBez.replace(/\n/g, ' / ')}`);

  /* ---- D) zdražení a podezřelý skok neprojdou ---- */
  pravda(`zdražení (${cekano.zdrazene.length}) ani podezřelý skok (${cekano.podezrele.length}) se nepočítají`,
    Number(po) === cekano.zlevnene.length
    && !cekano.zdrazene.some((d) => cekano.zlevnene.indexOf(d) >= 0));
  pravda(`a změna pod ${Z.MEZ_PROCENT} % je šum, taky neprojde (${cekano.sum} nabídek)`,
    cekano.sum > 0 && Number(po) === cekano.zlevnene.length);

  /* ---- E) vypnutí ---- */
  await tlacitko.click();
  await page.waitForTimeout(600);
  const zpet = await page.$eval('#map-count', (e) => e.textContent.replace(/\D/g, ''));
  pravda('druhé klepnutí filtr zruší', zpet === pred, `zpátky ${zpet}, původně ${pred}`);

  /* A „Zrušit filtry" taky — ten se dřív u dvou filtrů zapomněl
     a tlačítko neudělalo, co má napsané. */
  await tlacitko.click();
  await page.waitForTimeout(400);
  const zrusit = await page.$('#mcf-zrusit');
  if (zrusit) {
    await page.evaluate(() => { const b = document.getElementById('mcf-zrusit'); if (b) b.click(); });
    await page.waitForTimeout(700);
    const poZruseni = await page.$eval('#map-count', (e) => e.textContent.replace(/\D/g, ''));
    pravda('„Zrušit filtry" zruší i tenhle', poZruseni === pred,
      `po zrušení ${poZruseni}, původně ${pred}`);
    pravda('a přepínač zhasne',
      await page.$eval('#map-zlevnene', (e) => e.getAttribute('aria-pressed')) === 'false');
  } else {
    pravda('tlačítko „Zrušit filtry" se objevilo', false, '#mcf-zrusit není');
  }
}

await ctx.close();
await prohlizec.close();

console.log('\nFiltr „Zlevněné": ' + (ok + chyb) + ' kontrol');
console.log(zpravy.join('\n'));
if (chyb) { console.error(`\n::error::Filtr „Zlevněné": ${chyb} kontrol neprošlo.`); process.exit(1); }
console.log('\nVšechny prošly.\n');
process.exit(0);
