// Test: blok „Parametry pozemku".
//
// Spuštění: node scripts/test-parametry.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome)
//
// PROČ VZNIKL. Všech šest údajů stálo jako stejně vypadající řádky
// popisek-vlevo, hodnota-vpravo. Naměřeno: na počítači bylo mezi
// popiskem a hodnotou 435 px prázdna (na telefonu 133 px) a řádek se
// souřadnicemi byl na telefonu 149 px vysoký, protože se tlačítka
// zalamovala. Protože měly navíc všechny řádky tutéž velikost i váhu,
// nic nevedlo — výsledek vypadal jako výpis z databáze.
//
// Co se tu tedy hlídá:
//  • Tři čísla, podle kterých se člověk rozhoduje, stojí nahoře a jsou
//    větší než zbytek. Kdyby spadla zpátky mezi řádky, je to ten starý
//    nepřehledný seznam.
//  • Popisek a hodnota drží u sebe. Mez je 60 px: tolik je ještě vazba,
//    435 px už je přeskok přes půl obrazovky.
//  • Hodnoty začínají na JEDNÉ svislici. Rozházené hodnoty se čtou hůř
//    než zarovnané, a právě kvůli tomu je mřížka na celé tabulce.
//  • Nic nepřetéká do stran a na nic se dá klepnout prstem.
import { chromium } from 'playwright-core';
import { readdirSync } from 'node:fs';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { hlasPad } from './zkouska-pad.mjs';

/* STRÁNKA, NA KTERÉ SE DETAIL NEVYKRESLÍ.
   Pruh nahoře (třída `pz-konec`) nosí dva různé stavy: ukončenou
   nabídku a rozcestí na novou adresu (`pz-konec pz-presun`, vzniká při
   opravě jména obce — to je součást jména souboru). Na ani jedné
   js/pozemek.js detail nekreslí, takže se na nich nedá měřit.
   HLEDÁ SE TŘÍDA, NE PŘESNÝ ŘETĚZEC `class="pz-konec"`. Právě na tom
   tahle zkouška spadla v CI: vybrala si rozcestí, protože uzavírací
   uvozovka za `pz-konec` u dvou tříd nesedí — a pak čekala na dlaždice,
   které nikdy nepřijdou. */
const NEVYKRESLI = /class="[^"]*\bpz-konec\b/;

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8321;
const TYPY = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.png': 'image/png' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(req.url.split('?')[0]);
  const f = path.join(KOREN, u === '/' ? 'index.html' : u.replace(/^\/+/, ''));
  if (!f.startsWith(KOREN) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) {
    res.writeHead(404); res.end('ne'); return;
  }
  res.writeHead(200, { 'content-type': TYPY[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${PORT}`;

let ok = 0, chyb = 0;
const zpravy = [];
/* A KDYŽ TO SPADNE, AŤ TO TAKY NĚCO ŘEKNE — viz scripts/zkouska-pad.mjs.
   Bez tohohle se při výjimce (chybějící prvek, timeout klepnutí) zahodí
   všechny kontroly, které do té chvíle prošly, a v CI zbyde jen stopa. */
hlasPad('Parametry pozemku', zpravy);
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
function hotovo() {
  console.log('\nParametry pozemku');
  console.log(zpravy.join('\n'));
  console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
  server.close();
  if (chyb) { console.log('::error::Parametry pozemku: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
  process.exit(0);
}

/* MĚŘÍ SE STRÁNKA, KTERÁ TABULKU OPRAVDU MÁ. Od chvíle, kdy se zdroj
   nabídky přestěhoval pod cenu, zbývá v tabulce jediný možný řádek —
   parcelní číslo — a to zná jen část nabídek. První stránka v abecedě
   ho nemá, takže by se odstupy a svislice v tabulce měřily na prázdnu
   a kontroly by procházely samy od sebe. Pozná se to ze statické
   verze stránky (<dt>Parcela</dt>) nebo z ostrůvku PK_POZEMEK, kde
   generátor nese číslo vytažené z textu inzerátu (pc). */
const vsechny = readdirSync(KOREN).filter((f) => /^pozemek-.+\.html$/.test(f)).sort();
const sParcelou = vsechny.find((f) => {
  const h = fs.readFileSync(path.join(KOREN, f), 'utf8');
  /* Doběhlá nabídka ukáže místo stránky hlášku „už není aktuální"
     a nevykreslí ani dlaždice, ani tabulku — na té se měřit nedá.
     Hledá se TŘÍDA v značce, ne slovo `pz-konec` kdekoli: pravidla pro
     tu hlášku stojí ve vloženém stylu každé stránky. */
  return /"pc":/.test(h) && !NEVYKRESLI.test(h);
});
const stranka = sParcelou || vsechny[0];
pravda('je na čem měřit — stránka pozemku s tabulkou parametrů', !!sParcelou,
  sParcelou ? sParcelou : `žádná z ${vsechny.length} stránek nemá parcelní číslo`);
if (!stranka) hotovo();

const prohlizec = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });

for (const [sirka, popisSirky] of [[390, 'telefon'], [768, 'tablet'], [1280, 'počítač']]) {
  const p = await prohlizec.newPage({ viewport: { width: sirka, height: 1000 } });
  const padlo = [];
  p.on('pageerror', (e) => padlo.push(String(e)));
  await p.goto(`${BASE}/${stranka}`, { waitUntil: 'load' });
  await p.waitForTimeout(2400);

  const v = await p.evaluate(() => {
    const klic = [...document.querySelectorAll('.pz-klic')];
    const rows = [...document.querySelectorAll('.pz-spec')];
    const mezery = [], levyOkraj = [];
    for (const r of rows) {
      const k = r.querySelector('.k'), val = r.querySelector('.v');
      if (!k || !val) continue;
      const rk = k.getBoundingClientRect(), rv = val.getBoundingClientRect();
      /* Řádek, který má schválně celou šířku (souřadnice na telefonu),
         se do obou měr nepočítá: jeho hodnota stojí POD popiskem, ne
         vedle něj, takže by „mezera" i „svislice" měřily něco jiného
         než u ostatních. Pozná se podle toho, že nesdílí linku. */
      const vedleSebe = Math.abs(rk.top - rv.top) < 6;
      if (!vedleSebe) continue;
      mezery.push({ popis: k.textContent.trim(), mezera: Math.round(rv.left - rk.right),
        vyska: Math.round(Math.max(rk.height, rv.height)) });
      levyOkraj.push(Math.round(rv.left));
    }
    /* SOUŘADNICE UŽ V TABULCE NEJSOU — a kontroluje se právě to.
       Byly tu jediným řádkem se dvěma velkými tlačítky: 230 px ze čtyř
       set, které celá tabulka měla, a 2 100 px nad mapou (tabulka na
       634 px, „Pozemek na mapě" až na 2 697). Přestěhovaly se pod mapu,
       kde otázka „jak se tam dostanu" patří; jejich vlastní měření
       (popisek, 44px terče, tlačítka vedle sebe, výška) je teď v
       scripts/test-souradnice.mjs. Tady zůstává jen pojistka proti
       návratu — a proti tomu, aby stály na stránce dvakrát. */
    const sourVTabulce = !!document.querySelector('.pz-spec .pz-sour');
    const vel = (e) => parseFloat(getComputedStyle(e).fontSize);
    return {
      klicu: klic.length,
      klicePopisky: klic.map((e) => (e.querySelector('span') || {}).textContent || ''),
      klicVelikost: klic.length ? vel(klic[0].querySelector('b')) : 0,
      radekVelikost: rows.length ? vel(rows[0].querySelector('.v')) : 0,
      radku: mezery.length,
      nejvetsiMezera: mezery.length ? Math.max(...mezery.map((m) => m.mezera)) : 0,
      rozptylOkraju: levyOkraj.length ? Math.max(...levyOkraj) - Math.min(...levyOkraj) : 0,
      sourVTabulce: sourVTabulce,
      preteka: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });

  zpravy.push(`\n  — ${popisSirky} (${sirka} px)`);
  // PŘEDPOKLAD: bez bloku není co měřit
  pravda('nahoře stojí buňky s klíčovými čísly', v.klicu >= 2, `buněk: ${v.klicu}`);
  pravda('a je mezi nimi výměra i cena za metr',
    /Výměra/.test(v.klicePopisky.join('|')) && /Cena za m/.test(v.klicePopisky.join('|')),
    `popisky: ${v.klicePopisky.join(', ')}`);
  pravda('to hlavní číslo je větší než údaj v řádku',
    v.klicVelikost > v.radekVelikost, `${v.klicVelikost} px proti ${v.radekVelikost} px`);
  pravda('popisek a hodnota drží u sebe (nejvýš 60 px)',
    v.nejvetsiMezera <= 60, `největší mezera ${v.nejvetsiMezera} px`);
  /* KOLIK ŘÁDKŮ TABULKA MÁ, SE MUSÍ ŘÍCT. Od chvíle, kdy se zdroj
     nabídky přestěhoval pod cenu, zbývá v tabulce JEDINÝ možný řádek —
     parcelní číslo. Svislice se mezi jedním řádkem neměří: bez téhle
     poznámky by kontrola níž tiše procházela naprázdno. */
  zpravy.push(`    · řádků v tabulce: ${v.radku}`);
  if (v.radku >= 2) {
    pravda('hodnoty začínají na jedné svislici',
      v.rozptylOkraju <= 2, `levé okraje se rozcházejí o ${v.rozptylOkraju} px`);
  }
  pravda('souřadnice v tabulce parametrů nejsou (patří pod mapu)',
    v.sourVTabulce === false, 'řádek se souřadnicemi je zpátky v tabulce — zabere 230 px ze čtyř set');
  pravda('nic nepřetéká do stran', v.preteka <= 0, `přetéká o ${v.preteka} px`);
  pravda('a stránka u toho nespadne', padlo.length === 0, padlo.slice(0, 2).join(' | '));
  await p.close();
}

/* ===== DLOUHÁ HODNOTA SE MUSÍ VEJÍT DO DLAŽDICE ===================
 * Naměřeno na 390 px na pozemek-praha-zapad-jesenice-17ku2kl.html:
 * „23 458 Kč/m²" bylo 164,1 px široké, dlaždice má vnitřních 141 px
 * a z toho 28 px drží značka v rohu — číslo tedy přejelo přes značku
 * a „²" uřízl okraj karty (přesah 22 px za obsah dlaždice).
 *
 * PROČ TO NEZACHYTILA KONTROLA „nic nepřetéká do stran" výš: ta měří
 * `documentElement.scrollWidth`, tedy jestli se roluje CELÁ stránka.
 * Mřížka dlaždic má sloupce `minmax(0, 1fr)`, takže se nerozšíří —
 * text z ní vyteče, ale stránka o tom neví a hlásila nula.
 *
 * Měří se tedy obsah dlaždice, a to na stránkách s NEJDELŠÍMI
 * hodnotami v datech (vybírají se z ostrůvku PK_POZEMEK, ne ze
 * seznamu jmen — data se obnovují čtyřikrát denně) a na šířkách, kde
 * mřížka přepíná počet sloupců. Opravu dělá pzVelikostHodnot
 * v js/pozemek.js.
 */
{
  /* Nejdelší hodnoty v datech: výměra („547 418 m²") a cena za metr
     („23 458 Kč/m²"). Délka se počítá stejně, jako to dělá stránka —
     mezery po tisících a jednotka za nezlomitelnou mezerou. */
  const sMezerami = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const kandidati = [];
  let bezVymery = null;
  for (const f of vsechny) {
    const h = fs.readFileSync(path.join(KOREN, f), 'utf8');
    if (NEVYKRESLI.test(h)) continue;
    const m = h.match(/PK_POZEMEK=(\{.*?\});/s);
    if (!m) continue;
    let o;
    try { o = JSON.parse(m[1]); } catch { continue; }
    if (!o.v && !bezVymery) { bezVymery = f; continue; }
    if (!o.v) continue;
    const dl = Math.max(sMezerami(o.v).length + 3,
      o.c ? sMezerami(o.c / o.v).length + 6 : 0);
    kandidati.push({ f, dl });
  }
  kandidati.sort((a, b) => b.dl - a.dl);
  /* Tři nejdelší, k nim stránka bez výměry (hodnota „neuvedena", což
     jsou písmena, ne tabulkové číslice) a jedna obyčejná pro kontrast. */
  const mereneStranky = [...new Set([...kandidati.slice(0, 3).map((x) => x.f),
    bezVymery, stranka].filter(Boolean))];
  pravda('je na čem měřit — nejdelší hodnota v datech má aspoň 10 znaků',
    kandidati.length > 0 && kandidati[0].dl >= 10,
    kandidati.length ? `nejdelší ${kandidati[0].dl} znaků (${kandidati[0].f})` : 'žádná stránka s výměrou');

  /* Šířky: 320 px je nejužší telefon (jeden sloupec), 360 a 390 dva
     sloupce, 679/680 je mez, na které mřížka přepíná na čtyři, a 760
     je ta nejtěsnější varianta se čtyřmi sloupci. */
  const SIRKY = [320, 360, 390, 679, 680, 760];
  const p = await prohlizec.newPage({ viewport: { width: 390, height: 1000 } });
  const prilis = [];
  const velikosti = new Set();
  let dlazdic = 0;
  for (const f of mereneStranky) {
    for (const sirka of SIRKY) {
      await p.setViewportSize({ width: sirka, height: 1000 });
      await p.goto(`${BASE}/${f}`, { waitUntil: 'load' });
      /* NA VÝSLEDEK, NE NA ČAS: dlaždice kreslí js/pozemek.js až po
         dotažení dat okresu, takže pevné čekání by zkoušku buď
         zdržovalo, nebo ji nechalo měřit prázdno. */
      await p.waitForFunction(() => document.querySelectorAll('.pz-klic b').length > 0,
        null, { timeout: 30000 });
      const v = await p.evaluate(() => [...document.querySelectorAll('.pz-klic')].map((e) => {
        const b = e.querySelector('b');
        const r = document.createRange();
        r.selectNodeContents(b);
        const text = r.getBoundingClientRect();
        const cs = getComputedStyle(e), d = e.getBoundingClientRect();
        const obsahR = d.right - parseFloat(cs.paddingRight) - parseFloat(cs.borderRightWidth);
        const ic = e.querySelector('.pz-klic-ic');
        const znacka = ic && getComputedStyle(ic).display !== 'none'
          ? ic.getBoundingClientRect().left : null;
        return { t: b.textContent.trim(), px: parseFloat(getComputedStyle(b).fontSize),
          presah: Math.round((text.right - obsahR) * 10) / 10,
          naZnacku: znacka == null ? null : Math.round((text.right - znacka) * 10) / 10 };
      }));
      for (const x of v) {
        dlazdic++;
        velikosti.add(x.px);
        if (x.presah > 0.5) prilis.push(`${f} @${sirka}: „${x.t}" vyteklo z dlaždice o ${x.presah} px`);
        else if (x.naZnacku != null && x.naZnacku > 0.5) prilis.push(`${f} @${sirka}: „${x.t}" leze na značku o ${x.naZnacku} px`);
      }
    }
  }
  await p.close();

  zpravy.push(`\n  — dlaždice parametrů na ${mereneStranky.length} stránkách × ${SIRKY.length} šířkách`);
  // PŘEDPOKLAD: bez dlaždic by kontroly níž procházely naprázdno
  pravda('dlaždice se změřily', dlazdic >= mereneStranky.length * SIRKY.length * 2,
    `změřeno ${dlazdic}`);
  pravda('žádná hodnota nevyteče z dlaždice ani neleze na značku',
    prilis.length === 0, prilis.slice(0, 4).join('\n      '));
  /* ZMENŠOVÁNÍ SE UŽ NEMĚŘÍ — nemá se co zmenšovat. Dokud byly
     parametry DLAŽDICE, muselo se dlouhé číslo zmenšit, aby nevyteklo
     z pevné šířky sloupce; byla na to měřicí smyčka a ResizeObserver
     (pzVelikostHodnot v js/pozemek.js). Parametry jsou od 26. 10.
     tabulka řádků: hodnota stojí u pravého okraje a dlouhá se zalomí.
     Naměřeno po přestavbě na pěti stránkách × šesti šířkách:
     nezmenšila se ANI JEDNA hodnota, tedy ten kód už nic nedělal
     a zmizel. Místo „zmenšilo se to" se proto hlídá to, oč šlo
     doopravdy — že hodnota nevyteče (kontrola výš) a že všechny
     řádky mluví jednou velikostí. */
  pravda('hodnota má na všech řádcích jednu velikost',
    velikosti.size === 1,
    `naměřené velikosti: ${[...velikosti].sort((a, b) => b - a).join(', ')} px`);
  pravda('a je to stupeň ze stupnice',
    [...velikosti].every((x) => [24, 20, 18, 16].indexOf(x) !== -1),
    `naměřené velikosti: ${[...velikosti].join(', ')} px`);
}

/* ===== RYTMUS STRÁNKY: ČTYŘI ODSTUPY, NE DESET ==================
 * Stížnost majitele webu: „koukni, jak je to položené, ty mezery — web
 * má být sloučený a místo toho je to jak z Minecraftu."
 * Naměřeno na telefonu 390 px: mezi dvaceti bloky stránky pozemku bylo
 * DESET různých mezer (8, 10, 14, 16, 18, 20, 24, 28, 32, 40 px). Každý
 * blok jinak daleko — a to je přesně to, proč stránka nevypadá jako
 * jeden celek, ale jako poskládané kostky. Nic přitom nepřetékalo, takže
 * to žádná jiná kontrola nemohla najít.
 * Platí čtyři hodnoty a každá něco znamená: 40 před nadpisem oddílu,
 * 20 mezi bloky, 10 uvnitř skupiny, 8 pro poznámku pod blokem.
 * A druhá půlka téže stížnosti: osamělá dlaždice nechávala vedle sebe
 * díru (naměřeno 184 px z 358, tedy přes polovinu řádku).
 */
{
  const p = await prohlizec.newPage({ viewport: { width: 390, height: 1000 } });
  await p.goto(`${BASE}/${stranka}`, { waitUntil: 'load' });
  await p.waitForTimeout(2400);
  const v = await p.evaluate(() => {
    const h = [...document.querySelectorAll('h2')].find((x) => /Parametry pozemku/i.test(x.textContent));
    if (!h) return { chyba: 'nadpis „Parametry pozemku" nenalezen' };
    const sloupec = h.parentElement;
    /* OBALY S `display:contents` SE MUSÍ ROZBALIT. Takový obal nemá
       vlastní rámeček ani rozměr — jeho děti se chovají, jako by byly
       přímo tady. Když se nerozbalí, zkouška jeden blok přeskočí
       a mezeru mezi jeho sousedy naměří jako jednu velkou: po přibytí
       obalu `.pz-bok` (připnutý cenový pruh na monitoru) hlásila
       93 px tam, kde se na stránce vizuálně nic nezměnilo.
       Měří se tedy to, co je vidět, ne to, co je ve stromu. */
    const viditelne = (prvek) => {
      const ven = [];
      for (const c of prvek.children) {
        if (getComputedStyle(c).display === 'contents') { ven.push(...viditelne(c)); continue; }
        ven.push(c);
      }
      return ven;
    };
    const deti = viditelne(sloupec).filter((c) => c.getBoundingClientRect().height > 2);
    const mez = [];
    for (let i = 1; i < deti.length; i++) {
      const a = deti[i - 1].getBoundingClientRect(), c = deti[i].getBoundingClientRect();
      mez.push(Math.round(c.top - a.bottom));
    }
    // díra vedle osamělé dlaždice
    const mrizka = document.querySelector('.pz-klice');
    let dira = 0, dlazdic = 0;
    if (mrizka) {
      const dl = [...mrizka.querySelectorAll('.pz-klic')];
      dlazdic = dl.length;
      if (dl.length) {
        const r0 = mrizka.getBoundingClientRect();
        const posl = dl[dl.length - 1].getBoundingClientRect();
        const vRadku = dl.filter((c) => Math.abs(c.getBoundingClientRect().top - posl.top) < 6);
        const obsah = vRadku.reduce((a, c) => a + c.getBoundingClientRect().width, 0);
        const mezera = (parseFloat(getComputedStyle(mrizka).columnGap) || 0) * (vRadku.length - 1);
        dira = Math.round(r0.width - obsah - mezera);
      }
    }
    return { bloku: deti.length, mezery: mez, ruzne: [...new Set(mez)].sort((a, b) => a - b),
      dlazdic, dira, sirkaMrizky: mrizka ? Math.round(mrizka.getBoundingClientRect().width) : 0 };
  });
  pravda('je co měřit — stránka pozemku má svoje bloky',
    !v.chyba && v.bloku >= 10, v.chyba || `bloků ${v.bloku}`);
  if (!v.chyba) {
    /* 12 px přibylo s tokenem --mezera-bloku (css/styles.css): mezera
       mezi kartami je od 26. 10. jedna na celém webu a blok parametrů
       ji používá taky. Slovník není libovolný seznam — je to soupis
       stupňů, které na téhle stránce smějí být. */
    const SLOVNIK = [8, 10, 12, 20, 40];
    const mimo = v.ruzne.filter((x) => SLOVNIK.indexOf(x) === -1);
    pravda(`odstupy mezi bloky jsou ze slovníku ${SLOVNIK.join('/')} px`,
      mimo.length === 0, `navíc: ${mimo.join(', ')} px (všechny: ${v.ruzne.join(', ')})`);
    pravda('a není jich rozsypaných deset', v.ruzne.length <= 5,
      `různých odstupů ${v.ruzne.length}: ${v.ruzne.join(', ')}`);
    // PŘEDPOKLAD: bez dlaždic by kontrola díry neměřila nic
    pravda('dlaždice s čísly jsou na stránce', v.dlazdic >= 2, `dlaždic ${v.dlazdic}`);
    pravda('a nenechávají vedle sebe díru přes půl řádku',
      v.dira <= v.sirkaMrizky * 0.25,
      `díra ${v.dira} px z ${v.sirkaMrizky} px`);
  }
  await p.close();
}

await prohlizec.close();
hotovo();
