// Test: graf vývoje cenové hladiny na stránce okresu a kraje.
//
// Spuštění: node scripts/test-graf-cen.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome)
//
// Graf ukazuje číslo, které se nedá ověřit zvenčí — minulou hladinu vidí
// člověk jen od nás. Tím spíš musí sedět, a hlavně nesmí tvrdit víc, než
// data unesou. Hlídá se proto trojí:
//
//  1. ŘÍKÁ PRAVDU. Čísla v grafu i v tabulce musí sedět s tím, co je
//     v data/historie-cen.json, a popisek musí přiznat, že jsou to ceny
//     NABÍDKOVÉ a že hladinou hýbe i výměna nabídek.
//  2. MLČÍ, KDYŽ NEMÁ CO ŘÍCT. Okres bez dost klidné řady nesmí dostat
//     ani prázdný rámeček. (Klidná = nepohnula se o víc než 3 % za den;
//     u malých okresů jinak převáží výměna nabídek nad pohybem cen —
//     naměřeno +132 % za tři týdny u Brna-venkova.)
//  3. NEDĚLÁ Z NIČEHO DRAMA. Osa drží nejméně desetinu hladiny. Bez toho
//     se okres, který se za dvacet dní pohnul o 0,2 %, kreslil jako
//     schodiště přes celou výšku grafu — poznámka pod grafem rozpětí
//     uváděla, jenže oko čte tvar, ne poznámku.
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pricinaChyb } from './chyby-hlaska.mjs';

await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const BASE = 'http://127.0.0.1:8310';
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
function hotovo() {
  console.log('\nGraf vývoje cenové hladiny');
  console.log(zpravy.join('\n'));
  console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
  if (chyb) { console.log('::error::Graf cen: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
  process.exit(0);
}
const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const H = JSON.parse(readFileSync(path.join(KOREN, 'data', 'historie-cen.json'), 'utf8'));
/* Které okresy mají dost klidnou řadu, a které ne — počítá se to tady
   ZNOVU z dat, ne ze stránek, aby se měřilo proti zdroji. */
const bodu = (r) => r.cena.filter((x) => x !== null).length;
const sKlidnou = new Set(), vsechny = new Set();
for (const k of Object.keys(H.rady)) {
  const [uroven, nazev] = k.split('|');
  if (uroven !== 'okres') continue;
  vsechny.add(nazev);
  if (H.rady[k].klidna && bodu(H.rady[k]) >= 5) sKlidnou.add(nazev);
}
/* Okres pro měření se nevybírá první, na který se narazí. Napoprvé to
   tak bylo a padla na Českou Lípu, jejíž řada je ÚPLNĚ plochá (0,0 %) —
   a na dokonale ploché řadě se nedá poznat, jestli osa drží minimální
   rozpětí, nebo sedí na datech: obojí nakreslí rovnou čáru. Sabotáž
   „osa sedne na data" proto prošla nepovšimnuta. Hledá se tedy okres,
   jehož řada se HÝBE, ale málo — tam a jen tam to pravidlo něco řeší. */
function pohybRady(r) {
  const c = r.cena.filter((x) => x !== null);
  if (c.length < 5) return 0;
  const min = Math.min(...c), max = Math.max(...c);
  return (max - min) / ((max + min) / 2) * 100;
}
/* Stejné rozhodování jako v js/graf-cen.js: nejvíc naměřených dnů,
   při shodě větší vzorek. Bez té druhé podmínky vybral test jinou řadu
   než graf a Uherské Hradiště (4,98 %) mu uniklo. */
function nejlepsiRada(okres) {
  const vzorekMax = (r) => Math.max(...r.vzorek.filter((x) => x !== null), 0);
  return Object.keys(H.rady)
    .filter((k) => k.startsWith(`okres|${okres}|`) && H.rady[k].klidna && bodu(H.rady[k]) >= 5)
    .sort((a, b) => (bodu(H.rady[b]) - bodu(H.rady[a])) || (vzorekMax(H.rady[b]) - vzorekMax(H.rady[a])))[0];
}
const sGrafem = [...sKlidnou].find((o) => {
  const k = nejlepsiRada(o);
  const ph = k ? pohybRady(H.rady[k]) : 0;
  return ph > 0.3 && ph < 10;
}) || [...sKlidnou][0];
const bezGrafu = [...vsechny].find((o) => !sKlidnou.has(o));

// PŘEDPOKLAD: bez obou případů by kontroly níž prošly naprázdno
pravda('v datech je okres s klidnou řadou i okres bez ní (je co porovnat)',
  !!sGrafem && !!bezGrafu, `s klidnou: ${sKlidnou.size}, bez: ${vsechny.size - sKlidnou.size}`);
if (!sGrafem || !bezGrafu) hotovo();

const prohlizec = await chromium.launch({ executablePath: process.env.PW_CHROMIUM || undefined });
/* SERVICE WORKER SE TU MUSÍ ZABLOKOVAT, JINAK PODSTRČENÍ DAT TIŠE PŘESTANE PLATIT.
   Kontrola čtvrtá podstrkuje vlastní data/historie-cen.json přes p.route()
   a ptá se, co graf napíše. Jenže web má service worker, který si datové
   soubory ukládá — a jakmile se jednou zaregistruje, obslouží je z
   mezipaměti a k route() se požadavek vůbec nedostane. Podstrčení pak
   nedělá nic, graf čte skutečná data a kontrola spadne nebo projde podle
   toho, jaká data zrovna jsou.
   Přistiženo takhle: zkouška v dávce spadla, při třech samostatných
   bězích prošla, a pak spadla zas — po obnovení dat, kdy okres vybraný
   pro graf měl 18 nabídek proti mezi 25. Ostatní zkoušky, které data
   podstrkují (test-barva-ceny, test-cenova-mapa), si service worker
   blokují; tahle jediná ne, protože si stránky otevírala rovnou z
   prohlížeče, bez vlastního kontextu. */
const kontext = await prohlizec.newContext({ serviceWorkers: 'block' });

async function otevri(okres, sirka) {
  const p = await kontext.newPage();
  await p.setViewportSize({ width: sirka, height: 900 });
  const chybyJs = [];
  p.on('pageerror', (e) => chybyJs.push(String(e)));
  await p.goto(`${BASE}/pozemky-okres-${slug(okres)}.html`, { waitUntil: 'load' });
  const misto = await p.$('[data-graf-cen]');
  if (misto) await misto.scrollIntoViewIfNeeded();
  await p.waitForTimeout(2500);
  return { p, chybyJs };
}

/* ---- 1) okres s klidnou řadou graf dostane a graf sedí s daty ---- */
{
  const { p, chybyJs } = await otevri(sGrafem, 1100);
  const v = await p.evaluate(() => {
    const f = document.querySelector('figure.gc');
    if (!f) return { je: false };
    const body = [...f.querySelectorAll('.gc-tab tbody tr')].map((tr) =>
      [...tr.children].map((td) => td.textContent.trim()));
    const r = f.getBoundingClientRect();
    return { je: true,
      rada: f.getAttribute('data-rada'),
      nadpis: f.querySelector('.gc-hlava b').textContent,
      ted: f.querySelector('.gc-ted').textContent.replace(/\s+/g, ' ').trim(),
      teckyNaGrafu: f.querySelectorAll('.gc-bod').length,
      radkyTabulky: body.length, prvniRadek: body[0], posledniRadek: body[body.length - 1],
      pozn: f.querySelector('.gc-pozn').textContent,
      legend: f.querySelectorAll('.gc-legenda, .legend').length,
      pretejka: r.right > document.documentElement.clientWidth + 1 };
  });
  pravda(`okres ${sGrafem} graf dostane`, v.je, 'figure.gc na stránce není');
  if (!v.je) { await prohlizec.close(); hotovo(); }

  /* Graf sám říká, KTEROU řadu kreslí (data-rada) — porovnává se proto
     s touhle řadou, ne s tou, kterou by si vybral test. Napoprvé si test
     vybíral vlastním pravidlem a při shodě počtu bodů sáhl po jiném
     druhu než graf; vypadalo to jako chyba grafu, přitom chyboval test. */
  pravda('graf říká, kterou řadu kreslí', !!v.rada && !!H.rady[v.rada],
    `data-rada="${v.rada}" — v datech taková řada není`);
  pravda('a je to řada pro tenhle okres, a klidná',
    v.rada && v.rada.startsWith(`okres|${sGrafem}|`) && H.rady[v.rada] && H.rady[v.rada].klidna,
    String(v.rada));
  const r = H.rady[v.rada] || { cena: [], vzorek: [] };
  const posl = r.cena.filter((x) => x !== null).slice(-1)[0];
  pravda('a je v něm tolik bodů, kolik je v datech naměřeno',
    v.teckyNaGrafu === bodu(r) && v.radkyTabulky === bodu(r),
    `graf ${v.teckyNaGrafu}, tabulka ${v.radkyTabulky}, data ${bodu(r)}`);
  pravda('a poslední hodnota sedí s daty',
    v.ted.replace(/ /g, ' ').includes(String(posl).replace('.', ',')),
    `v grafu „${v.ted}", v datech ${posl}`);
  pravda('a nadpis říká, čí je to cena a jakého druhu',
    /nabídková cena/i.test(v.nadpis) && v.nadpis.includes(sGrafem), v.nadpis);
  pravda('a jedna řada nemá legendu (co je v grafu, říká nadpis)', v.legend === 0);
  pravda('a pod grafem stojí, že jsou to ceny NABÍDKOVÉ', /nabídkov/i.test(v.pozn), v.pozn.slice(0, 90));
  pravda('a varování, že hladinou hýbe i výměna nabídek',
    /přibývaj|mizí|výměn/i.test(v.pozn), v.pozn.slice(0, 120));
  pravda('a že osa nezačíná od nuly', /ne od nuly|nezačíná/i.test(v.pozn), v.pozn.slice(-80));
  pravda('a graf nepřetéká ze stránky', !v.pretejka);

  /* odečet: kříž, bublina i zvýrazněný bod */
  const box = await (await p.$('.gc-plocha')).boundingBox();
  await p.mouse.move(box.x + box.width * 0.4, box.y + box.height / 2);
  await p.waitForTimeout(400);
  const od = await p.evaluate(() => {
    const b = document.querySelector('.gc-bublina');
    const bub = b.getBoundingClientRect(), pl = document.querySelector('.gc-plocha').getBoundingClientRect();
    return { skryta: b.hidden, text: b.textContent.trim(),
      kriz: !document.querySelector('.gc-kriz').hidden,
      bod: !!document.querySelector('.gc-bod.on'),
      vejdeSe: bub.left >= pl.left - 1 && bub.right <= pl.right + 1 };
  });
  pravda('pod myší se ukáže odečet (bublina, kříž i bod)',
    !od.skryta && od.kriz && od.bod, JSON.stringify(od));
  pravda('a v odečtu stojí cena, den i z kolika nabídek',
    /Kč\/m²/.test(od.text) && /nabídek/.test(od.text), od.text);
  pravda('a bublina se vejde do šířky grafu', od.vejdeSe, JSON.stringify(od));
  pravda('nic se u toho v prohlížeči nerozbilo', chybyJs.length === 0, chybyJs.join(' | '));
  await p.close();
}

/* ---- 2) okres bez klidné řady nedostane ani prázdný rámeček ---- */
{
  const { p } = await otevri(bezGrafu, 1100);
  const v = await p.evaluate(() => {
    const m = document.querySelector('[data-graf-cen]');
    return { misto: !!m, graf: !!document.querySelector('figure.gc'),
      vyska: m ? Math.round(m.getBoundingClientRect().height) : null };
  });
  pravda(`okres ${bezGrafu} (bez dost klidné řady) graf NEDOSTANE`, v.misto && !v.graf,
    JSON.stringify(v));
  pravda('a nezbude po něm ani prázdné místo', v.vyska === 0, `místo je vysoké ${v.vyska} px`);
  await p.close();
}

/* ---- 3) plochá řada vypadá ploše (osa nedělá z ničeho drama) ---- */
{
  const { p } = await otevri(sGrafem, 1100);
  const v = await p.evaluate(() => {
    const f = document.querySelector('figure.gc');
    const svg = f.querySelector('svg');
    const vb = svg.getAttribute('viewBox').split(' ').map(Number);
    const d = f.querySelector('.gc-cara').getAttribute('d');
    const ys = [...d.matchAll(/[ML]\s*[\d.]+\s+([\d.]+)/g)].map((m) => +m[1]);
    const ceny = [...f.querySelectorAll('.gc-tab tbody tr')]
      .map((tr) => parseFloat(tr.children[1].textContent.replace(/\s/g, '').replace(',', '.')));
    return { vyskaSvg: vb[3], rozsahY: Math.max(...ys) - Math.min(...ys),
      minC: Math.min(...ceny), maxC: Math.max(...ceny) };
  });
  // PŘEDPOKLAD: musí jít o řadu, která se opravdu hýbe málo
  const pohyb = (v.maxC - v.minC) / ((v.maxC + v.minC) / 2) * 100;
  /* Obě meze jsou nutné. Pod 0,3 % je řada plochá a kontrola níž by
     prošla i s osou nasazenou přesně na data. Nad 10 % si osu roztáhne
     sama a minimální rozpětí už nic neřeší. */
  pravda('měří se řada, která se hýbe — ale málo (jinak kontrola nic neřeší)',
    pohyb > 0.3 && pohyb < 10, `řada se za celé období pohnula o ${pohyb.toFixed(2)} %`);
  /* Když se řada pohne o 1 % a osa drží 10 %, nesmí čára zabrat víc než
     zhruba pětinu výšky. Kdyby osa seděla na datech, zabere skoro celou. */
  pravda('a čára proto nezabírá víc než pětinu výšky grafu',
    v.rozsahY <= v.vyskaSvg * 0.2,
    `čára zabírá ${Math.round(v.rozsahY)} z ${v.vyskaSvg} px (${Math.round(100 * v.rozsahY / v.vyskaSvg)} %)`);
  await p.close();
}

/* ---- 4) na telefonu je graf čitelný a nepřetéká ---- */
{
  const { p, chybyJs } = await otevri(sGrafem, 390);
  const v = await p.evaluate(() => {
    const f = document.querySelector('figure.gc');
    if (!f) return { je: false };
    const svg = f.querySelector('svg').getBoundingClientRect();
    const r = f.getBoundingClientRect();
    return { je: true, vyskaGrafu: Math.round(svg.height),
      pretejka: r.right > document.documentElement.clientWidth + 1,
      tabSummary: Math.round(f.querySelector('.gc-tab summary').getBoundingClientRect().height) };
  });
  pravda('na telefonu se graf vykreslí taky', v.je);
  pravda('a je dost vysoký, aby se dal číst', v.je && v.vyskaGrafu >= 110,
    `výška grafu ${v.vyskaGrafu} px`);
  pravda('a nepřetéká ze stránky', v.je && !v.pretejka);
  pravda('a na „Čísla v tabulce" se dá trefit prstem (44 px)',
    v.je && v.tabSummary >= 44, `${v.tabSummary} px`);
  pravda('a nic se nerozbilo', chybyJs.length === 0, chybyJs.join(' | '));
  await p.close();
}

/* ---- 4) VÝHRADA U MALÉHO VZORKU ------------------------------------
   Nad grafem stojí medián a u něj, je-li nabídek málo, „na cenu okresu je
   to málo". Graf kreslí od osmi nabídek — a dokud výhradu neměl, vypadalo
   méně doložené tvrzení přesvědčivěji než to lépe doložené, protože oko
   čte tvar čáry, ne poznámku.
   Měří se oba směry na PODSTRČENÉM souboru s historií: ve skutečných
   datech se dnes malý vzorek s klidnou řadou nesejde (23 okresů s grafem,
   30 s výhradou, průnik nula), takže by se na nich nedalo ověřit nic —
   a přitom nic nebrání tomu, aby se sešly po dalším obnovení dat. */
{
  const puvodni = JSON.parse(JSON.stringify(H));
  async function sVzorkem(kolik) {
    const kopie = JSON.parse(JSON.stringify(puvodni));
    for (const k of Object.keys(kopie.rady)) {
      kopie.rady[k].vzorek = kopie.rady[k].vzorek.map((x) => (x === null ? null : kolik));
    }
    const p = await kontext.newPage();
    await p.setViewportSize({ width: 1100, height: 900 });
    await p.route('**/data/historie-cen.json*', (r) => r.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify(kopie) }));
    await p.goto(`${BASE}/pozemky-okres-${slug(sGrafem)}.html`, { waitUntil: 'load' });
    const misto = await p.$('[data-graf-cen]');
    if (misto) await misto.scrollIntoViewIfNeeded();
    await p.waitForTimeout(2500);
    const pozn = await p.evaluate(() => {
      const f = document.querySelector('figure.gc');
      return f ? f.querySelector('.gc-pozn').textContent.replace(/\s+/g, ' ') : null;
    });
    await p.close();
    return pozn;
  }
  const dost = puvodni.dost;
  pravda('soubor s historií nese mez „kolik je dost"', typeof dost === 'number' && dost >= 15,
    `dost = ${dost}`);
  const male = await sVzorkem(Math.max(1, dost - 10));
  pravda('u malého vzorku graf výhradu napíše',
    !!male && /je to málo/.test(male) && /hrubé vodítko/.test(male), String(male).slice(0, 220));
  const velke = await sVzorkem(dost + 40);
  /* Druhá strana: kdyby se výhrada psala vždycky, přestala by něco
     znamenat — a kontrola výš by procházela i tak. */
  pravda('u dostatečného vzorku ji nepíše (jinak by nic neznamenala)',
    !!velke && !/je to málo/.test(velke), String(velke).slice(0, 220));
  pravda('a počet nabídek se v poznámce opravdu mění (podstrčení zabralo)',
    !!male && !!velke && male !== velke,
    'poznámka je v obou případech stejná — podstrčený soubor se nepoužil');
}

/* ---- CELOSTÁTNÍ GRAF NA STRÁNCE „CENY POZEMKŮ" -------------------
   Klíč řady je „úroveň|název|druh" a u celé ČR je prostřední část
   prázdná (`cr||Orná půda`). Podmínka `!nazev` v js/graf-cen.js takový
   graf zahazovala, takže data pro něj v souboru ležela a nikdo je
   nevykreslil. Měří se tedy obojí: že graf na té stránce je, a že mluví
   o celé ČR, ne o okrese. */
{
  const p = await kontext.newPage();
  await p.setViewportSize({ width: 1100, height: 900 });
  const chybyJs = [];
  p.on('pageerror', (e) => chybyJs.push(String(e)));
  await p.goto(`${BASE}/cena-pozemku.html`, { waitUntil: 'load' });
  const misto = await p.$('[data-graf-cen]');
  pravda('stránka „Ceny pozemků" má místo pro graf', !!misto,
    'prvek [data-graf-cen] tam není');
  if (misto) await misto.scrollIntoViewIfNeeded();
  await p.waitForTimeout(2500);
  const v = await p.evaluate(() => {
    const f = document.querySelector('figure.gc');
    if (!f) return { je: false };
    return { je: true, rada: f.getAttribute('data-rada'),
      nadpis: f.querySelector('.gc-hlava b').textContent,
      tecek: f.querySelectorAll('.gc-bod').length,
      radku: f.querySelectorAll('.gc-tab tbody tr').length,
      pozn: f.querySelector('.gc-pozn').textContent.replace(/\s+/g, ' '),
      cesta: (f.querySelector('path.gc-cara') || f.querySelector('path') || {}).getAttribute
        ? (f.querySelector('path.gc-cara') || f.querySelector('path')).getAttribute('d') : null };
  });
  pravda('a graf se na ní opravdu vykreslil', v.je === true,
    'figure.gc na stránce není — celostátní řada se nenakreslila');
  if (v.je) {
    pravda('je to celostátní řada (klíč začíná „cr|")',
      /^cr\|/.test(String(v.rada)), `data-rada = ${v.rada}`);
    pravda('a mluví o celé ČR, ne o okrese',
      /v celé ČR/.test(v.nadpis + ' ' + v.pozn) && !/okres/i.test(v.nadpis),
      `nadpis „${v.nadpis}"`);
    pravda('má nakreslenou čáru aspoň z pěti bodů', v.tecek >= 5, `bodů ${v.tecek}`);
    pravda('a čísla jsou i v tabulce pod ním', v.radku === v.tecek,
      `tečky ${v.tecek}, řádky ${v.radku}`);
    pravda('poznámka přiznává, že jsou to ceny nabídkové',
      /nabídkové/.test(v.pozn), v.pozn.slice(0, 160));
    /* Výhrada o malém vzorku se u celostátní řady psát NEMÁ (vzorek jsou
       stovky nabídek) — a kdyby se psala, nesmí mluvit o okrese. */
    pravda('a nepíše výhradu o okrese (ta se u celé ČR nehodí)',
      !/celého okresu/.test(v.pozn), v.pozn.slice(0, 200));
  }
  pravda('a stránka při tom nehlásí chybu skriptu', chybyJs.length === 0, chybyJs.join(' | '));
  await p.close();
}

await prohlizec.close();
hotovo();
