/* Test: cesta zpátky na výpis je na KAŽDÉ stránce a všude vypadá stejně.
   ==================================================================
   Spuštění: node scripts/test-zpet-tlacitko.mjs
     (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=…/chrome)

   PROČ VZNIKL. Majitel: „Zpět na pozemky by mělo být všude a více
   viditelné, a věci normálně — z toho udělej tlačítko, neboj se toho."
   Naměřeno 1. 11. před opravou: 2 328 stránek pozemků mělo tichý šedý
   odkaz „Zpět na seznam" (.pz-back), 20 ručně psaných jiný tichý odkaz
   na pásu (.st-zpet), 3 stránky účtu třetí (.uc-zpet-a) — a 103
   krajských, okresních a druhových stránek NEMĚLO cestu zpátky žádnou.
   Tři různé vzhledy a jedna díra.

   CO SE MĚŘÍ. Dvě věci, a ani jedna neplyne z té druhé:
     1) ŽE TAM JE — staticky, nad zdrojem všech stránek v repozitáři.
        Jen tak se pozná díra o 103 stránkách; v prohlížeči by se
        kontrola konala nad hrstkou, kterou zkouška stihne otevřít.
     2) ŽE VYPADÁ JAKO TLAČÍTKO A VŠUDE STEJNĚ — měřením v prohlížeči.
        Stránka pozemku si nenačítá styles.css, ale vlastní
        css/pozemek-vlozeny.css, takže recept je ve dvou souborech
        a může se rozejít. Porovnává se VYKRESLENÝ tvar, ne zdrojový
        text: kdyby se jeden z nich změnil, srovnání textu by to
        nepoznalo.
   ================================================================== */
import { chromium } from 'playwright-core';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { hlasPad } from './zkouska-pad.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, chyb = 0; const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
hlasPad('Zpět', zpravy, () => chyb);

/* VÝJIMKY, KAŽDÁ S DŮVODEM — ne seznam toho, na co se zapomnělo.
   index.html    je ten cíl; odkaz sám na sebe nedává smysl.
   pozemek.html  a predloha.html jsou předlohy, neservírují se.
   404.html      nenačítá stylopis (viz komentář v ní) a nese vlastní
                 rozcestník okresů, tedy víc než jeden odkaz zpět.
   inzerce.html a pozemky-od-lidi.html jsou přesměrovací útržky o jedné
                 větě — hned odnavigují jinam a žádný vzhled nemají. */
const VYJIMKY = new Set(['index.html', 'pozemek.html', 'predloha.html', '404.html',
  'inzerce.html', 'pozemky-od-lidi.html']);

// --- 1) STATICKY: je na každé stránce? -------------------------------
{
  const vsechny = readdirSync(ROOT).filter((f) => f.endsWith('.html') && !VYJIMKY.has(f));
  const bez = [];
  let sTlacitkem = 0;
  for (const f of vsechny) {
    const h = readFileSync(path.join(ROOT, f), 'utf8');
    if (/class="[^"]*\bzpet-btn\b/.test(h)) sTlacitkem++; else bez.push(f);
  }
  /* Bez tohohle by kontrola níž prošla i nad prázdným seznamem. */
  pravda(`je co měřit — ${vsechny.length} stránek mimo šest vyjmenovaných výjimek`,
    vsechny.length > 2000, `nalezeno jen ${vsechny.length}`);
  pravda(`tlačítko zpět je na všech ${sTlacitkem} stránkách`, bez.length === 0,
    `chybí na ${bez.length}: ` + bez.slice(0, 10).join(', ')
    + (bez.length > 10 ? ` … a dalších ${bez.length - 10}` : ''));
  /* Staré tiché odkazy se nesmějí vrátit zadními vrátky. */
  const stare = vsechny.filter((f) => /class="(st-zpet|uc-zpet-a)"/.test(readFileSync(path.join(ROOT, f), 'utf8')));
  pravda('a nikde nezbyl starý tichý odkaz (.st-zpet / .uc-zpet-a)', stare.length === 0,
    stare.slice(0, 6).join(', '));
}

// --- 2) V PROHLÍŽEČI: vypadá jako tlačítko a všude stejně ------------
const { BASE } = await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));
const prohlizec = await chromium.launch({
  executablePath: process.env.PW_CHROMIUM || undefined, args: ['--no-sandbox'],
});
/* Po jedné z každé rodiny, která má vlastní cestu ke stylu: stránka
   pozemku (vlastní stylopis), okres (generovaná), ručně psaná,
   účet. Víc stránek téže rodiny by měřilo totéž. */
const prvniPozemek = readdirSync(ROOT).filter((f) => /^pozemek-.+\.html$/.test(f)).sort()[0];
const VZORKY = [
  ['stránka pozemku', prvniPozemek],
  ['okres', 'pozemky-okres-znojmo.html'],
  ['ručně psaná', 'kontakt.html'],
  ['účet', 'muj-inzerat.html'],
];
const tvary = [];
for (const [jmeno, soubor] of VZORKY) {
  const ctx = await prohlizec.newContext({ bypassCSP: true, viewport: { width: 390, height: 844 },
    isMobile: true, hasTouch: true, locale: 'cs-CZ', serviceWorkers: 'block' });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/${soubor}`, { waitUntil: 'load' });
  await p.waitForTimeout(1200);
  const v = await p.evaluate(() => {
    const e = document.querySelector('.zpet-btn');
    if (!e) return null;
    const r = e.getBoundingClientRect(); const s = getComputedStyle(e);
    const ik = e.querySelector('svg');
    return {
      v: Math.round(r.height), sirka: Math.round(r.width),
      vidno: r.width > 0 && r.height > 0 && s.visibility !== 'hidden',
      ram: s.borderTopWidth + ' ' + s.borderTopStyle,
      plocha: s.backgroundColor, barva: s.color, rez: s.fontWeight,
      zaobleni: s.borderTopLeftRadius, stin: s.boxShadow !== 'none',
      ikona: !!ik, text: (e.textContent || '').trim(),
      ciluje: e.getAttribute('href') || '',
    };
  });
  pravda(`${jmeno} (${soubor}): tlačítko zpět tam je a je vidět`, !!v && v.vidno,
    v ? JSON.stringify(v) : 'prvek .zpet-btn na stránce není');
  if (v) {
    pravda(`${jmeno}: unese prst (44 px) a má ikonu i nápis`,
      v.v >= 44 && v.ikona && /^Zpět/.test(v.text), JSON.stringify(v));
    /* Tohle je ta vlastní otázka: vypadá to jako TLAČÍTKO, ne jako
       odkaz? Rám, plocha a stín jsou tři věci, které z textu dělají
       ovladač; tichý odkaz neměl ani jednu. */
    /* RÁM SE MĚŘÍ JAKO „ASPOŇ 1 px", NE PŘESNĚ 1,5.
       Ve zdroji je 1.5px, ale prohlížeč vrací POUŽITOU hodnotu
       zaokrouhlenou na pixel obrazovky — při dpr 1 tedy „1px".
       První verze téhle kontroly žádala „1.5px solid" a padala na
       všech čtyřech rodinách, přestože web byl v pořádku. Že ty
       rodiny mají rám STEJNÝ, hlídá srovnání níž. */
    pravda(`${jmeno}: vypadá jako tlačítko (rám, bílá plocha, stín)`,
      /^([1-9]|\d\.\d)[\d.]*px solid/.test(v.ram) && /rgb\(255, 255, 255\)/.test(v.plocha) && v.stin,
      `rám „${v.ram}", plocha ${v.plocha}, stín ${v.stin}`);
    tvary.push([jmeno, v]);
  }
  await ctx.close();
}
/* --- 3) NA STRÁNKÁCH ÚČTU STOJÍ V ŘÁDKU S NADPISEM ------------------
   Majitel 2. 11. zakroužkoval prázdno vpravo vedle nadpisu „Můj
   profil": „zpět na pozemky by mělo být tam, kde jsem to označil."
   Tlačítko mělo vlastní pruh pod zeleným pásem (.uc-zpet) — naměřeno
   52 px řádku, ve kterém stálo samo u levého okraje.
   Měří se TŘI věci, a ani jedna neplyne z druhé:
     a) že pruh .uc-zpet zmizel ze VŠECH stránek (staticky),
     b) že tlačítko je u PRAVÉHO okraje sloupce — i tam, kde se
        na řádek nevejde a spadne pod nadpis („Hlídání pozemků"),
     c) že tam, kde se vejde, skutečně STOJÍ V TOM ŘÁDKU, tedy že má
        s nadpisem společný svislý střed. Kdyby `align-items` vypadlo,
        bod b) by prošel dál a vypadalo by to pořád špatně.
   Šířka 768 px je ta, na které se nápis vejde vedle každého ze tří
   nadpisů; na 390 px se u „Hlídání pozemků" (215 px + 171 px tlačítko
   proti 350 px sloupce) zalomí vždy, proto se řádek měří na 768. */
{
  const UCET = ['muj-inzerat.html', 'hlidani.html', 'zpravy.html'];
  const vsechny = readdirSync(ROOT).filter((f) => f.endsWith('.html'));
  const sPruhem = vsechny.filter((f) => /class="uc-zpet"/.test(readFileSync(path.join(ROOT, f), 'utf8')));
  pravda('starý pruh pod pásem (.uc-zpet) zmizel ze všech stránek',
    sPruhem.length === 0, 'ještě ho má: ' + sPruhem.slice(0, 6).join(', '));

  let zmereno = 0;
  for (const soubor of UCET) {
    for (const sirka of [390, 768]) {
      const ctx = await prohlizec.newContext({ bypassCSP: true, viewport: { width: sirka, height: 900 },
        isMobile: sirka < 500, hasTouch: sirka < 500, locale: 'cs-CZ', serviceWorkers: 'block' });
      const p2 = await ctx.newPage();
      await p2.goto(`${BASE}/${soubor}`, { waitUntil: 'load' });
      await p2.waitForTimeout(900);
      const m = await p2.evaluate(() => {
        const hlava = document.querySelector('.uc-hlava');
        const b = document.querySelector('.uc-hlava > .zpet-btn');
        const h1 = hlava && hlava.querySelector('h1');
        const sloupec = document.querySelector('.add-wrap');
        if (!hlava || !b || !h1 || !sloupec) {
          return { chyba: `hlava=${!!hlava} tlacitko=${!!b} h1=${!!h1} sloupec=${!!sloupec}` };
        }
        const rb = b.getBoundingClientRect(), rh = h1.getBoundingClientRect();
        /* Pravý okraj OBSAHU, ne rámečku sloupce: .add-wrap nese
           odsazení (20 px na telefonu, 32 na 768), takže proti
           `rect.right` by i správně zarovnané tlačítko vycházelo
           o to odsazení dovnitř. Změřeno: 20 a 32 px. */
        const rs = sloupec.getBoundingClientRect();
        const odsazeniVpravo = parseFloat(getComputedStyle(sloupec).paddingRight) || 0;
        const pod = hlava.nextElementSibling;
        return {
          odPrava: Math.round((rs.right - odsazeniVpravo) - rb.right),
          stredTlacitka: Math.round(rb.top + rb.height / 2),
          stredNadpisu: Math.round(rh.top + rh.height / 2),
          naRadku: rb.top < rh.bottom && rh.top < rb.bottom,
          nadTextem: !pod || rb.bottom <= pod.getBoundingClientRect().top + 1,
          nadpis: (h1.textContent || '').trim(),
        };
      });
      await ctx.close();
      if (m.chyba) { pravda(`${soubor} @${sirka}: nadpis a tlačítko jsou v jednom bloku`, false, m.chyba); continue; }
      zmereno++;
      pravda(`${soubor} @${sirka} („${m.nadpis}"): tlačítko je u pravého okraje sloupce`,
        Math.abs(m.odPrava) <= 2, `od pravého okraje ${m.odPrava} px`);
      pravda(`${soubor} @${sirka}: tlačítko stojí nad textem, ne v pruhu pod ním`,
        m.nadTextem, 'tlačítko přesahuje pod následující blok');
      if (sirka === 768) {
        pravda(`${soubor} @768: stojí v TÉMŽ ŘÁDKU jako nadpis, svisle na střed`,
          m.naRadku && Math.abs(m.stredTlacitka - m.stredNadpisu) <= 2,
          `střed tlačítka ${m.stredTlacitka}, střed nadpisu ${m.stredNadpisu}, na řádku ${m.naRadku}`);
      }
    }
  }
  /* Bez tohohle by celá sekce „prošla" i tehdy, kdyby se nezměřilo nic. */
  pravda('a změřily se všechny tři stránky účtu na obou šířkách',
    zmereno === UCET.length * 2, `změřeno ${zmereno} z ${UCET.length * 2}`);
}

await prohlizec.close();

/* A TEĎ TO HLAVNÍ: shodují se ty čtyři rodiny? Recept je ve dvou
   souborech (styles.css a pozemek-vlozeny.css) a rozejít se můžou
   kdykoli. Šířka se neporovnává — ta závisí na délce nápisu. */
if (tvary.length === VZORKY.length) {
  const klice = ['v', 'ram', 'plocha', 'barva', 'rez', 'zaobleni', 'stin', 'ikona'];
  const [prvniJm, prvni] = tvary[0];
  const rozdily = [];
  for (const [jm, t] of tvary.slice(1)) {
    for (const k of klice) {
      if (String(t[k]) !== String(prvni[k])) rozdily.push(`${jm}.${k} = ${t[k]} ≠ ${prvniJm}.${k} = ${prvni[k]}`);
    }
  }
  pravda('a na všech čtyřech rodinách stránek vypadá STEJNĚ', rozdily.length === 0,
    rozdily.slice(0, 6).join('\n      '));
} else {
  pravda('a na všech čtyřech rodinách stránek vypadá STEJNĚ', false,
    `změřily se jen ${tvary.length} ze ${VZORKY.length} — není co porovnávat`);
}

console.log('\nTlačítko „Zpět na pozemky"');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Zpět: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
process.exit(0);
