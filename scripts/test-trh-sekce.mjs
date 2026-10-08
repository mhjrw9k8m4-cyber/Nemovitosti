/* Test: sekce „Jak dlouho se pozemek prodává" musí říkat totéž co archiv.
   ==================================================================
   Spuštění: PW_CHROMIUM=… node scripts/test-trh-sekce.mjs

   PROČ. Na cena-pozemku.html je jediná část webu, která tvrdí něco
   o trhu V ČASE: kolik nabídek je po N dnech pryč a kdo slevuje.
   Čísla se počítají při sestavení (scripts/archiv-statistiky.mjs),
   takže na stránce stojí jako hotový text — a hotový text v HTML se
   dá zapomenout přepsat, odnést z generátoru ruční úpravou nebo
   zděděně zkopírovat. Pak by stránka měsíce tvrdila cizí čísla a nic
   by nespadlo.

   Tahle zkouška proto čísla ze stránky PŘEČTE a porovná je s tím, co
   modul spočítá teď. A hlídá to, co se v tom nejsnáz pokazí:

     A) každý řádek křivky ze stránky sedí na modul (podíl i „z kolika")
     B) stránka neuvádí medián doby na trhu — ani slovem
     C) věta o slevách sedí na modul
     D) na telefonu nic nepřetéká a pruh je vidět
     E) pruhy stojí na stupnici 0–100 %, ne na nejdelším řádku
     F) drobný text pod pruhem má čitelný kontrast

   Kontrola B je ta nejdůležitější. Medián „u zmizelých" vycházel
   7 dní, bylo to spočítané správně a byla to nepravda — většina
   nabídek na trhu pořád je a je tam déle. Modul ho proto odmítá
   vydat; tohle hlídá, že se na stránku nedostane jinou cestou.
   ================================================================== */
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { statistiky, nactiArchiv, MIN_ZMEN } from './archiv-statistiky.mjs';

await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'http://127.0.0.1:8310';
const STRANKA = 'cena-pozemku.html';

let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* Co má na stránce stát. Počítá se z TÉHOŽ modulu jako při sestavení —
   kdyby si zkouška počítala po svém, hlídala by svoji vlastní kopii. */
const a = nactiArchiv();
const S = statistiky(a.uzavrene, a.stav, a.stav.den || new Date().toISOString().slice(0, 10));

/* SEBEKONTROLA. Kdyby archiv v repozitáři zmizel nebo se zmenšil, modul
   by vrátil prázdnou křivku, generátor by sekci vynechal — a tahle
   zkouška by prošla naprázdno, protože by neměla co hledat. */
if (S.krivka.length < 2) {
  console.error(`::error::Archiv dává jen ${S.krivka.length} kohort — zkouška by neměla co kontrolovat.`);
  process.exit(1);
}

const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));
/* serviceWorkers: 'block' — bez toho obsluhuje stránku uložená kopie
   z offline režimu a zkouška čte staré HTML, aniž by to poznala. */
const ctx = await prohlizec.newContext({ viewport: { width: 390, height: 844 },
  isMobile: true, hasTouch: true, locale: 'cs-CZ', serviceWorkers: 'block' });
const page = await ctx.newPage();
await page.route('**/*', (r) => {
  const u = new URL(r.request().url());
  if (u.hostname === '127.0.0.1' || u.hostname === 'localhost') return r.continue();
  return r.abort();
});
await page.goto(`${BASE}/${STRANKA}`, { waitUntil: 'domcontentloaded' });

/* ---- A) křivka na stránce sedí na modul ---- */
const radky = await page.$$eval('.trh-radek', (el) => el.map((r) => ({
  popis: (r.querySelector('.trh-popis') || {}).textContent || '',
  cislo: (r.querySelector('.trh-cislo') || {}).textContent || '',
  zkolika: (r.querySelector('.trh-zkolika') || {}).textContent || '',
  sirka: (() => { const i = r.querySelector('.trh-pas > i'); return i ? i.style.width : ''; })(),
})));
pravda(`sekce má ${S.krivka.length} řádků jako modul (${radky.length})`,
  radky.length === S.krivka.length, 'na stránce: ' + JSON.stringify(radky.map((x) => x.popis)));
const cislo = (t) => Number(String(t).replace(/[^\d]/g, ''));
for (let i = 0; i < S.krivka.length; i++) {
  const k = S.krivka[i], r = radky[i] || {};
  pravda(`řádek „do ${k.dni} dní" má popis i podíl z modulu`,
    new RegExp(`do\\s*${k.dni}\\s*dní`).test(r.popis || '') && cislo(r.cislo) === k.podil,
    `na stránce „${r.popis}" / „${r.cislo}", modul ${k.dni} dní / ${k.podil} %`);
  /* „53 z 852" — obě čísla, protože právě velikost kohorty dělá ten
     podíl poctivým a právě ta se při ruční úpravě zapomene.
     DĚLÍ SE REGULÁRNÍM VÝRAZEM, ne split(' z '): scripts/sazba.mjs
     vkládá při sestavení pevné mezery, takže v HTML nestojí „53 z 852“
     s obyčejnými mezerami a prosté dělení vracelo undefined — kontrola
     padala na správně vysázené stránce. */
  const dvojice = /(\d[\d\s\u00a0]*)\D+?(\d[\d\s\u00a0]*)/.exec(r.zkolika || '') || [];
  pravda(`a je u něj, z kolika nabídek to je (${k.pryc} z ${k.zKolika})`,
    cislo(dvojice[1]) === k.pryc && cislo(dvojice[2]) === k.zKolika,
    `na stránce „${r.zkolika}"`);
}

/* ---- E) pruhy stojí na stupnici 0–100 % ----
   Kdyby se přepočítaly na nejdelší řádek, byly by tři skoro stejně
   dlouhé pruhy a obrázek by říkal „pozemky mizí rychle" — přesný
   opak toho, co data říkají. */
{
  const sirky = radky.map((r) => parseFloat(r.sirka) || 0);
  const nejvic = Math.max(...S.krivka.map((k) => k.podil));
  pravda('pruhy odpovídají procentům, ne přepočtu na nejdelší řádek',
    sirky.every((w, i) => Math.abs(w - Math.max(1.5, S.krivka[i].podil)) < 0.6),
    `šířky ${JSON.stringify(sirky)}, podíly ${JSON.stringify(S.krivka.map((k) => k.podil))}`);
  pravda('a nejdelší pruh nesahá do kraje, protože největší podíl je jen ' + nejvic + ' %',
    Math.max(...sirky) < 60, `nejdelší pruh ${Math.max(...sirky)} %`);
}

/* ---- B) žádný medián doby na trhu ---- */
{
  /* textContent, ne innerText: metodika je ve sbaleném <details>, takže
     ji innerText nevidí. Na sbalený text by se dala schovat i ta
     nepravda, kterou tu hlídám — proto se čte všechno, co na stránce
     stojí, bez ohledu na to, co je právě rozbalené. */
  const text = await page.$eval('main', (m) => m.textContent);
  /* Hledá se tvrzení, ne slovo: v metodice je u slova „medián" napsané,
     proč tam není, a to je v pořádku a musí to tam zůstat. */
  const tvrzeni = /medi[áa]n\s+(?:doby|délky)\s+(?:na\s+trhu|prodeje)\s*(?:je|:)?\s*\d/i.test(text)
    || /(?:prům[ěe]rn[áě]|obvykl[áá]?)\s+doba\s+prodeje\s*(?:je|:)?\s*\d/i.test(text)
    || /pozemek\s+se\s+prod[áa]v[áa]\s+(?:prům[ěe]rn[ěe]\s+)?za\s+\d+\s+dn/i.test(text);
  pravda('stránka netvrdí žádnou „průměrnou dobu prodeje"', !tvrzeni);
  pravda('ale vysvětluje, proč tu takové číslo není',
    /cenzurov[áa]n[íi]\s+zprava/i.test(text), 'v metodice chybí vysvětlení');
  pravda('a modul ho opravdu odmítá vydat', S.median === null,
    'modul vydal medián ' + S.median + ' — pak se musí přepsat i tahle zkouška');
}

/* ---- C) věta o slevách sedí na modul ---- */
if (S.zlevneni.pocet >= MIN_ZMEN) {
  const veta = await page.$eval('.trh-veta', (e) => e.innerText).catch(() => '');
  pravda('věta o slevách na stránce je', veta.length > 20, 'věta: ' + veta);
  pravda(`uvádí počet nabídek z modulu (${S.zlevneni.nabidek})`,
    new RegExp('\\b' + S.zlevneni.nabidek + '\\b').test(veta.replace(/ /g, ' ')),
    'věta: ' + veta);
  if (S.zlevneni.medianSleva !== null) {
    pravda(`a obvyklou slevu i dobu z modulu (${S.zlevneni.medianSleva} % / ${S.zlevneni.medianDni} dní)`,
      new RegExp(S.zlevneni.medianSleva + '\\s*%').test(veta)
      && new RegExp('\\b' + S.zlevneni.medianDni + '\\b').test(veta), 'věta: ' + veta);
  }
  pravda(`a zmiňuje i zdražení (${S.zlevneni.zdrazeni}×), aby to nebyla polovina pravdy`,
    new RegExp('\\b' + S.zlevneni.zdrazeni + '\\b').test(veta), 'věta: ' + veta);
}

/* ---- D) na telefonu nic nepřetéká a pruh je vidět ---- */
{
  const m = await page.evaluate(() => {
    const sek = document.querySelector('#trh-nadpis');
    const karta = sek && sek.closest('.add-card');
    const sirkaStranky = document.documentElement.scrollWidth;
    const prvky = [...document.querySelectorAll('.trh-radek, .trh-popis, .trh-pas, .trh-cislo, .trh-zkolika, .trh-veta')];
    const prestrelily = prvky.filter((e) => {
      const r = e.getBoundingClientRect();
      return r.right > window.innerWidth + 0.5 || r.left < -0.5;
    }).map((e) => e.className + ' → ' + Math.round(e.getBoundingClientRect().right));
    const pasy = [...document.querySelectorAll('.trh-pas')].map((e) => {
      const i = e.querySelector('i');
      return { pas: Math.round(e.getBoundingClientRect().width),
        plneni: i ? +i.getBoundingClientRect().width.toFixed(1) : -1 };
    });
    return { maKartu: !!karta, sirkaStranky, okno: window.innerWidth, prestrelily, pasy };
  });
  pravda('sekce je na stránce i v prohlížeči', m.maKartu);
  pravda('stránka se na 390 px neroztahuje do šířky',
    m.sirkaStranky <= m.okno + 1, `scrollWidth ${m.sirkaStranky} > okno ${m.okno}`);
  pravda('žádný prvek sekce nepřetéká z obrazovky', m.prestrelily.length === 0,
    m.prestrelily.slice(0, 3).join(' · '));
  /* Pruh u 3 % je jen pár pixelů — ale nesmí být NULA, jinak si řádek
     s malým podílem uživatel přečte jako „žádný údaj". */
  pravda('dráha pruhu má na telefonu šířku',
    m.pasy.length > 0 && m.pasy.every((p) => p.pas >= 60), JSON.stringify(m.pasy));
  pravda('a i nejmenší podíl je vidět aspoň na pixel',
    m.pasy.every((p) => p.plneni >= 1), JSON.stringify(m.pasy));
}

/* ---- F) kontrast drobného textu ---- */
{
  const k = await page.evaluate(() => {
    function barva(s) {
      const m = /rgba?\(([^)]+)\)/.exec(s);
      if (!m) return null;
      const c = m[1].split(',').map((x) => parseFloat(x));
      return { r: c[0], g: c[1], b: c[2], a: c.length > 3 ? c[3] : 1 };
    }
    function pozadi(el) {
      for (let e = el; e; e = e.parentElement) {
        const b = barva(getComputedStyle(e).backgroundColor);
        if (b && b.a > 0.5) return b;
      }
      return { r: 255, g: 255, b: 255, a: 1 };
    }
    const lum = (c) => {
      const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
      return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
    };
    const out = [];
    for (const sel of ['.trh-zkolika', '.trh-popis', '.trh-cislo', '.trh-veta']) {
      const e = document.querySelector(sel);
      if (!e) { out.push({ sel, pomer: 0 }); continue; }
      const p = barva(getComputedStyle(e).color), z = pozadi(e);
      const l1 = lum(p), l2 = lum(z);
      out.push({ sel, pomer: +(((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05))).toFixed(2),
        velikost: parseFloat(getComputedStyle(e).fontSize) });
    }
    return out;
  });
  for (const x of k) {
    /* 4,5 : 1 platí pro běžný text; nad 24 px (nebo 18,66 px tučně) stačí 3 : 1,
       ale tady to nikde nepotřebujeme — tak se to ani nepovoluje. */
    pravda(`${x.sel} má čitelný kontrast (${x.pomer} : 1 při ${x.velikost} px)`, x.pomer >= 4.5);
  }
}

await ctx.close();
await prohlizec.close();

console.log('\nSekce o chování trhu: ' + (ok + chyb) + ' kontrol');
console.log(zpravy.join('\n'));
if (chyb) { console.error(`\n::error::Sekce o chování trhu: ${chyb} kontrol neprošlo.`); process.exit(1); }
console.log('\nVšechny prošly.\n');
process.exit(0);
