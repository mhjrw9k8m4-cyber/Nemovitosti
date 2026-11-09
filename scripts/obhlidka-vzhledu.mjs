/* RUČNÍ NÁSTROJ: obhlídka vzhledu stránku po stránce
   ==================================================================
   Spuštění:  node scripts/obhlidka-vzhledu.mjs <adresář-snímků> [šířky]
              node scripts/obhlidka-vzhledu.mjs /tmp/ob 390,900,1440

   PROČ EXISTUJE. Majitel 9. 11.: „hodně věcí mi na webu připadá
   nedodělaných — chyby tam, ikonky, nebo je text moc rozházený nebo
   není symetrický; projdi web stránku po stránce a uprav to."
   Očima se dvacet typů stránek krát tři šířky neprojde spolehlivě:
   nesymetrický okraj o šest pixelů ani ikona o dva pixely větší se
   okem nechytí, ale ve výpisu čísel ano.

   CO MĚŘÍ (a proč zrovna tohle):
     1. VODOROVNÉ PŘETEČENÍ — scrollWidth > clientWidth. Znamená to, že
        se stránka dá táhnout do strany; na telefonu je to nejvíc vidět
        a nejvíc kazí dojem.
     2. CO LEZE VEN — prvky, jejichž levá hrana je záporná nebo pravá
        za šířkou okna. Viník přetečení z bodu 1.
     3. USEKNUTÝ TEXT — prvky, které mají scrollWidth větší než
        clientWidth, tedy nápis, který se do svého rámečku nevejde.
     4. NESYMETRICKÉ OKRAJE — levý a pravý odstup hlavního sloupce od
        okna. Když se liší o víc než 1 px, stránka vypadá nakřivo.
     5. IKONY MIMO MÍRU — vykreslená velikost .ik. Sada je kreslená na
        jednu stopu a dvě různé velikosti vedle sebe jsou vidět.
     6. PÁD SKRIPTU — co spadlo při vykreslování.
   A ke každé stránce udělá snímek na celou výšku.

   KDO TO VOLÁ: nikdo. Je to nástroj pro práci na vzhledu, ne zkouška.
   Co se má hlídat trvale, hlídají scripts/test-deska.mjs,
   scripts/test-odstupy.mjs, scripts/test-ikony.mjs a spol.
   ================================================================== */
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { domUtichlo } from './zkouska-pripraveno.mjs';

const { BASE } = await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const ADR = process.argv[2] || '/tmp/obhlidka';
const SIRKY = (process.argv[3] || '390,1280').split(',').map(Number);
fs.mkdirSync(ADR, { recursive: true });

/* Vzorek: od každého typu stránky jedna. Adresy nabídek a okresů se
   berou z dat, aby vzorek nezastaral s obsahem. */
const { adresaPozemku } = await import('./adresa-pozemku.mjs');
/* adresaPozemku vrací { url, d } a url je dotaz na pozemek.html, ne
   vlastní stránka nabídky. Obhlídka chce obojí: dotazovanou podobu
   (tu vidí člověk z mapy) i statickou stránku (tu vidí z Googlu). */
const POZEMEK = adresaPozemku((x) => x.area > 0).url;
const { zivaStranka } = await import('./vzorek-pozemku.mjs');
const STATICKA = zivaStranka();
const STRANKY = [
  ['uvod', '/index.html'],
  ['nabidka', '/' + POZEMEK],
  ['nabidka-staticka', '/' + STATICKA],
  ['okres', '/pozemky-okres-benesov.html'],
  ['kraj', '/pozemky-jihocesky-kraj.html'],
  ['druh', '/pozemky-lesni.html'],
  ['cena-do', '/pozemky-do-500-tisic.html'],
  ['drazby', '/drazby-pozemku-nabidky.html'],
  ['nove', '/nove-pozemky.html'],
  ['rozcestnik', '/pozemky-podle-okresu.html'],
  ['cena-pozemku', '/cena-pozemku.html'],
  ['radce', '/radce.html'],
  ['clanek', '/hypoteka-na-pozemek.html'],
  ['data', '/data.html'],
  ['pridat', '/pridat.html'],
  ['inzerce', '/inzerce.html'],
  ['kontakt', '/kontakt.html'],
  ['podminky', '/podminky.html'],
  ['ochrana', '/ochrana-udaju.html'],
  ['pravidla', '/pravidla-inzerce.html'],
  ['porovnani', '/porovnani.html'],
  ['moje-data', '/moje-data.html'],
  ['hlidani', '/hlidani.html'],
  ['zpravy', '/zpravy.html'],
  ['profil', '/muj-inzerat.html'],
  ['chyba404', '/404.html'],
];

const MERENI = () => {
  const W = document.documentElement.clientWidth;
  const out = { sirka: W, preteklo: document.documentElement.scrollWidth - W, ven: [], useknute: [], ikony: {}, okraje: null };
  const jmeno = (e) => e.tagName.toLowerCase()
    + (e.id ? '#' + e.id : '')
    + (e.className && typeof e.className === 'string' ? '.' + e.className.trim().split(/\s+/).slice(0, 3).join('.') : '');
  /* CO SE NEPOČÍTÁ ZA VADU — a proč:
       · prvky schované pro oči (skip-link, .visually-hidden): jsou
         useknuté schválně, to je jejich způsob, jak zmizet;
       · cokoli uvnitř <svg>: kresba má vlastní soustavu souřadnic
         a `preserveAspectRatio: slice` z ní schválně přetéká;
       · prvek v posuvném rodiči (tabulka v pásu, který se táhne):
         přetéká do něčeho, co se posouvá, tedy do ničeho zlého. */
  const schovane = (e) => e.closest('.visually-hidden, .skip-link, [hidden]') != null;
  const vSvg = (e) => e.closest('svg') != null;
  const vPosuvniku = (e) => {
    for (let x = e.parentElement; x && x !== document.body; x = x.parentElement) {
      if (/auto|scroll/.test(getComputedStyle(x).overflowX)) return true;
    }
    return false;
  };
  for (const e of document.querySelectorAll('body *')) {
    const st = getComputedStyle(e);
    if (st.display === 'none' || st.visibility === 'hidden' || !e.getClientRects().length) continue;
    if (schovane(e) || vSvg(e)) continue;
    const r = e.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    /* `overflow:hidden` je taky úmysl, ne vada: náhled okresu je 128 px
       široké okno do 256px dlaždice a usekává ji schválně. */
    const posouva = /auto|scroll|hidden/.test(st.overflowX) || vPosuvniku(e);
    if (!posouva && (r.left < -1 || r.right > W + 1)) {
      out.ven.push({ kdo: jmeno(e), left: Math.round(r.left), right: Math.round(r.right) });
    }
    /* Práh 4 px: zaokrouhlení subpixelů dělá rozdíl 1–2 px i tam, kde
       se text vejde. Pod čtyřmi pixely není co vidět. */
    if (!posouva && e.scrollWidth > e.clientWidth + 4 && e.clientWidth > 8) {
      out.useknute.push({ kdo: jmeno(e), je: e.clientWidth, treba: e.scrollWidth });
    }
  }
  /* VELIKOST SE ČTE ZE STYLU, NE Z OBDÉLNÍKU NA OBRAZOVCE. Tlačítko
     „Nahoru" se vysouvá zvětšením (transform: scale) a jeho 20px ikona
     se v obdélníku měří jako 19 — vypadalo to jako devátá velikost
     navíc, přitom je to jen rozjetá animace. */
  for (const i of document.querySelectorAll('.ik')) {
    const cs = getComputedStyle(i);
    const w = parseFloat(cs.width), h = parseFloat(cs.height);
    if (!w) continue;
    const k = Math.round(w) + '×' + Math.round(h);
    if (!out.ikony[k]) out.ikony[k] = { pocet: 0, kde: jmeno(i.parentElement || i) };
    out.ikony[k].pocet++;
  }
  const hl = document.querySelector('main .wrap, main .st-wrap, main .okr-wrap, main');
  if (hl) {
    const r = hl.getBoundingClientRect();
    out.okraje = { vlevo: Math.round(r.left), vpravo: Math.round(W - r.right) };
  }
  return out;
};

const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));
for (const SIRKA of SIRKY) {
  const ctx = await prohlizec.newContext({ bypassCSP: true, serviceWorkers: 'block',
    viewport: { width: SIRKA, height: 900 }, deviceScaleFactor: 1, locale: 'cs-CZ',
    isMobile: SIRKA < 700, hasTouch: SIRKA < 700 });
  await ctx.route('**/config.js*', (r) => r.fulfill({ status: 200, contentType: 'text/javascript',
    body: `window.PK_SUPABASE_URL='${BASE}';window.PK_SUPABASE_KEY='anon';` }));
  for (const [jm, cesta] of STRANKY) {
    const p = await ctx.newPage();
    const padlo = [];
    p.on('pageerror', (e) => padlo.push(String((e && e.message) || e).slice(0, 120)));
    try {
      const odp = await p.goto(`${BASE}${cesta}`, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await domUtichlo(p, 600);
      const m = await p.evaluate(MERENI);
      await p.screenshot({ path: path.join(ADR, `${SIRKA}-${jm}.png`), fullPage: true });
      const h = [];
      if (odp && odp.status() >= 400) h.push(`STAV ${odp.status()}`);
      if (m.preteklo > 0) h.push(`přeteklo o ${m.preteklo} px`);
      if (m.ven.length) h.push(`leze ven ${m.ven.length}× (${m.ven.slice(0, 3).map((x) => x.kdo).join(', ')})`);
      if (m.useknute.length) h.push(`useknutý text ${m.useknute.length}× (${m.useknute.slice(0, 3).map((x) => x.kdo + ' ' + x.je + '<' + x.treba).join(', ')})`);
      if (m.okraje && Math.abs(m.okraje.vlevo - m.okraje.vpravo) > 1) h.push(`okraje ${m.okraje.vlevo}/${m.okraje.vpravo}`);
      /* Hlásí se, co je MIMO STUPNICI, ne kolik je velikostí: stránka,
         která poctivě použije všech pět kroků, není vada. */
      const STUPNICE = ['16×16', '20×20', '24×24', '32×32', '48×48'];
      const mimo = Object.entries(m.ikony).filter(([k]) => STUPNICE.indexOf(k) < 0);
      if (mimo.length) {
        h.push('ikony mimo stupnici: '
          + mimo.map(([k, v]) => `${k}×${v.pocet} (${v.kde})`).join(', '));
      }
      if (padlo.length) h.push(`PÁD: ${padlo[0]}`);
      console.log(`${String(SIRKA).padStart(4)} ${jm.padEnd(14)} ${h.length ? h.join(' · ') : 'ok'}`);
    } catch (e) {
      console.log(`${String(SIRKA).padStart(4)} ${jm.padEnd(14)} CHYBA ${String(e.message || e).slice(0, 100)}`);
    }
    await p.close();
  }
  await ctx.close();
}
await prohlizec.close();
process.exit(0);
