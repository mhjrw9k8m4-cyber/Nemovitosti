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
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { hlasPad } from './zkouska-pad.mjs';

const { BASE } = await import('./falesna-supabase-chat.mjs');
await new Promise((r) => setTimeout(r, 300));

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, chyb = 0;
const zpravy = [];
/* A KDYŽ TO SPADNE, AŤ TO TAKY NĚCO ŘEKNE — viz scripts/zkouska-pad.mjs.
   Bez tohohle se při výjimce (chybějící prvek, timeout klepnutí) zahodí
   všechny kontroly, které do té chvíle prošly, a v CI zbyde jen stopa. */
hlasPad('Graf cen', zpravy);
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
const kontext = await prohlizec.newContext({ bypassCSP: true,  serviceWorkers: 'block' });

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
    /* Kříž odměřuje OSU: jeho y1 je horní okraj kreslicí plochy, y2 dolní.
       Není to údaj vyrobený kvůli zkoušce — kreslený kříž se po něm vodí
       pod prstem, zkouška si ho jen přečte. */
    const kriz = f.querySelector('.gc-kriz');
    return { vyskaSvg: vb[3], rozsahY: Math.max(...ys) - Math.min(...ys),
      minC: Math.min(...ceny), maxC: Math.max(...ceny),
      rada: f.getAttribute('data-rada'), pozn: f.querySelector('.gc-pozn').textContent,
      ys: ys, krizNahore: +kriz.getAttribute('y1'), krizDole: +kriz.getAttribute('y2') };
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

  /* A TEĎ TO, CO SE O OSE PÍŠE, PROTI TOMU, CO JE NAKRESLENÉ.
     ------------------------------------------------------------------
     Pod grafem stálo „Svislá osa je v rozpětí 45,7–46,6 Kč/m²" — a to
     bylo rozpětí DAT, ne osy; osa šla od 43,8 do 48,5. Kontrola výš
     tomu nebránila: ta hlídá jen to, že čára nezabere víc než pětinu.
     Proto se tu osa ODMĚŘUJE z toho, co je na obrazovce: dva body
     s různou cenou dají přepočet px → Kč a ten se natáhne na horní
     a dolní okraj kreslicí plochy (y1 a y2 kříže).
     Ceny se berou ze zdrojových dat, ne z tabulky pod grafem: ta je
     zaokrouhlená na desetinu a při přepočtu přes dvacetinásobek by
     z té desetiny byly celé koruny. */
  const rr = H.rady[v.rada];
  if (rr) {
    const ceny = rr.cena.filter((x) => x !== null);
    const iMin = ceny.indexOf(Math.min(...ceny)), iMax = ceny.indexOf(Math.max(...ceny));
    // PŘEDPOKLAD: bez dvou různých cen nejde přepočet px → Kč sestavit
    pravda('měří se řada, která má aspoň dvě různé ceny (jinak osa nejde odměřit)',
      ceny[iMin] !== ceny[iMax] && v.ys.length === ceny.length,
      `cen ${ceny.length}, bodů na čáře ${v.ys.length}`);
    if (ceny[iMin] !== ceny[iMax] && v.ys.length === ceny.length) {
      const hodnota = (yy) => ceny[iMax] +
        (yy - v.ys[iMax]) * (ceny[iMin] - ceny[iMax]) / (v.ys[iMin] - v.ys[iMax]);
      const nahoru = hodnota(v.krizNahore), dolu = hodnota(v.krizDole);
      const cis = (t) => parseFloat(String(t).replace(/[\s\u00a0]/g, '').replace(',', '.'));
      const m = v.pozn.match(/Svisl\u00e1 osa jde od ([\d\s\u00a0,]+?) do ([\d\s\u00a0,]+?)\s*K\u010d/);
      pravda('pod grafem stojí, odkud kam jde osa', !!m, v.pozn.slice(-160));
      if (m) {
        /* Mez 0,15 Kč: body na čáře jsou zaokrouhlené na desetinu pixelu
           a při natažení na celou osu se ta chyba násobí. Na nepravdu,
           kvůli které kontrola vznikla (osa opsaná z dat), je to málo
           o řád: tam se oba konce mýlily o celé koruny. */
        pravda('a jsou to konce osy, jak je graf opravdu nakreslil',
          Math.abs(cis(m[1]) - dolu) <= 0.15 && Math.abs(cis(m[2]) - nahoru) <= 0.15,
          `v poznámce ${m[1]}\u2013${m[2]}, nakresleno ${dolu.toFixed(2)}\u2013${nahoru.toFixed(2)} K\u010d/m\u00b2`);
      }
      const osaVyska = v.krizDole - v.krizNahore;
      const pod = v.pozn.match(/\u010d\u00e1ra zab\u00edr\u00e1 (\d+)\s*%/);
      if (pod) {
        const kreslene = v.rozsahY / osaVyska * 100;
        pravda('a kolik výšky osy čára podle poznámky zabírá, tolik zabírá i na obrazovce',
          Math.abs(+pod[1] - kreslene) <= 1.5,
          `poznámka ${pod[1]} %, nakresleno ${kreslene.toFixed(1)} % (${v.rozsahY.toFixed(1)} z ${osaVyska} px)`);
      }
    }
  }
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

/* ---- KŘIVKA NA DETAILU NABÍDKY (karta „Vývoj ceny v okolí") ------
   Křivka byla dosud všude kromě místa, kde se o jednom pozemku
   rozhoduje. Tady je, a stojí a padá se třemi věcmi, které se jinde
   neřeší:
    1. MÍSTO PRO GRAF VZNIKÁ AŽ V PROHLÍŽEČI. Detail nabídky skládá
       js/pozemek.js, takže prvek `data-graf-cen` v HTML NENÍ — graf si
       ho při startu nenajde a musí mu ho stránka podat (PKGrafCen.postav).
       Statické hlídače ho proto na pozemek.html vidět nemůžou a mají
       tam zapsanou výjimku; pravda o tom, že se čára opravdu nakreslí,
       se dá změřit JEN tady.
    2. PRÁZDNÁ KARTA NESMÍ BÝT VIDĚT. Klidnou řadu má menšina okresů,
       takže na většině stránek se nenakreslí nic — a nadpis nad
       prázdným rámečkem by tvrdil, že o vývoji něco víme.
    3. DATA AŽ NA DOHLED. Soubor s historií má přes 60 kB a karta leží
       pod verdiktem. Stahovat ho hned na každé stránce pozemku by byl
       provoz za nic. */
{
  /* Kandidáti se berou z ŽIVÝCH nabídek okresu, ne z názvů souborů:
     stránky vyřazených nabídek se nevykreslují z JS (zůstanou tak, jak
     je uložil generátor), takže by na nich karta nebyla — a kontrola by
     hlásila chybu tam, kde žádná není. I tak se zkouší víc souborů:
     jedna obec může mít nabídek víc a hash v názvu se odsud nedopočítá. */
  const souborySeznam = readdirSync(KOREN).filter((f) => /^pozemek-.+-[0-9a-z]{5,8}\.html$/.test(f));
  function kandidati(okres) {
    let zivé = [];
    try {
      const j = JSON.parse(readFileSync(path.join(KOREN, 'data', 'okres', slug(okres) + '.json'), 'utf8'));
      zivé = (j.opportunities || []).map((o) => o.place).filter(Boolean);
    } catch (e) { /* okres bez vlastního souboru — zkusí se podle názvu */ }
    const predpony = [...new Set(zivé)].map((m) => `pozemek-${slug(okres)}-${slug(m)}-`);
    const nalez = [];
    for (const pre of predpony) {
      const f = souborySeznam.find((x) => x.startsWith(pre));
      if (f) nalez.push(f);
      if (nalez.length >= 4) break;
    }
    return nalez;
  }

  /* OKNO JE ÚMYSLNĚ MALÉ (390 × 400). Karta stojí hned pod verdiktem
     o ceně, takže na krátké nabídce (bez fotek, s krátkým popisem) leží
     jen asi 1 000 px pod hranou okna — a záložka 300 px, se kterou se
     na ni čeká, ji na okně vysokém 900 px chytne rovnou při vykreslení.
     Odložení by se pak nedalo změřit vůbec: kontrola by procházela
     i tehdy, kdyby se historie stahovala dychtivě. V malém okně leží
     karta prokazatelně mimo dosah, a že opravdu leží, se níž ověřuje
     jako PŘEDPOKLAD. */
  async function otevriPozemek(soubor) {
    const p = await kontext.newPage();
    await p.setViewportSize({ width: 390, height: 400 });
    const chybyJs = [];
    const dotazy = [];
    p.on('pageerror', (e) => chybyJs.push(String(e)));
    p.on('request', (r) => { if (/historie-cen\.json/.test(r.url())) dotazy.push(r.url()); });
    await p.goto(`${BASE}/${soubor}`, { waitUntil: 'load' });
    await p.waitForTimeout(1200);
    return { p, chybyJs, dotazy };
  }
  const stavSekce = () => {
    const s = document.querySelector('#pz-vyvoj');
    if (!s) return { sekce: false };
    const h2 = s.querySelector('.pz-sect-h');
    const f = document.querySelector('figure.gc');
    const svg = f && f.querySelector('svg');
    return { sekce: true,
      maGraf: s.classList.contains('ma-graf'),
      vyska: Math.round(s.getBoundingClientRect().height),
      nadpisVidet: !!h2 && getComputedStyle(h2).display !== 'none',
      graf: !!f,
      rada: f ? f.getAttribute('data-rada') : null,
      tecek: f ? f.querySelectorAll('.gc-bod').length : 0,
      podOknem: (() => { const m = document.querySelector('[data-graf-cen]');
        return m ? Math.round(m.getBoundingClientRect().top - window.innerHeight) : null; })(),
      viewBoxW: svg ? Number(String(svg.getAttribute('viewBox')).split(' ')[2]) : null,
      svgW: svg ? Math.round(svg.getBoundingClientRect().width) : null,
      pretejka: f ? f.getBoundingClientRect().right > document.documentElement.clientWidth + 1 : false };
  };

  /* --- okres, který křivku má --- */
  let stranka = null, prvni = null, drzak = null;
  for (const f of kandidati(sGrafem)) {
    const o = await otevriPozemek(f);
    const st = await o.p.evaluate(stavSekce);
    if (st.sekce) { stranka = f; prvni = st; drzak = o; break; }
    await o.p.close();
  }
  // PŘEDPOKLAD: bez živé stránky v tomhle okrese by kontroly níž neměly co měřit
  pravda(`v okrese ${sGrafem} se našla vykreslená stránka pozemku`, !!stranka,
    `zkoušeno: ${kandidati(sGrafem).join(', ') || 'nic'}`);

  if (stranka) {
    /* PŘEDPOKLAD: kdyby karta ležela do 300 px pod hranou okna, obě
       kontroly odložení by prošly samy od sebe — i kdyby se nic
       neodkládalo. */
    pravda('místo pro graf leží víc než 300 px pod hranou okna (je co měřit)',
      prvni.podOknem !== null && prvni.podOknem > 300, `pod oknem ${prvni.podOknem} px`);
    pravda('karta se před dorolováním NEUKAZUJE (nulová výška, bez nadpisu)',
      prvni.vyska === 0 && !prvni.maGraf && !prvni.nadpisVidet,
      JSON.stringify(prvni));
    pravda('a soubor s historií se do té doby nestahuje',
      drzak.dotazy.length === 0, `dotazů ${drzak.dotazy.length}`);

    const misto = await drzak.p.$('[data-graf-cen]');
    if (misto) await misto.scrollIntoViewIfNeeded();
    await drzak.p.waitForTimeout(2500);
    const po = await drzak.p.evaluate(stavSekce);

    pravda('po dorolování se křivka nakreslí', po.graf === true,
      `stránka ${stranka}: figure.gc není`);
    pravda('a je to řada tohohle okresu', String(po.rada || '').startsWith(`okres|${sGrafem}|`),
      `data-rada = ${po.rada}`);
    pravda('a karta dostane nadpis i rám (.ma-graf)',
      po.maGraf === true && po.nadpisVidet === true, JSON.stringify(po));
    pravda('a má nakreslenou čáru aspoň z pěti bodů', po.tecek >= 5, `bodů ${po.tecek}`);
    /* ŠÍŘKA SE MĚŘÍ Z VNITŘKU PRVKU. Karta má 16 px odsazení z každé
       strany a clientWidth je nese taky — kdo je neodečte, nakreslí
       viewBox o 32 px širší, než na kolik se SVG natáhne, a kolečka
       odečtu se protáhnou na elipsy. Naměřeno i na 2 px rámu. */
    pravda('a soustava grafu sedí s tím, jak je široký (žádné protažení)',
      po.viewBoxW !== null && Math.abs(po.viewBoxW - po.svgW) <= 1,
      `viewBox ${po.viewBoxW}, nakresleno ${po.svgW}`);
    pravda('a karta nepřetéká ze stránky', po.pretejka === false);
    pravda('a historie se stáhla právě jednou', drzak.dotazy.length === 1,
      `dotazů ${drzak.dotazy.length}`);
    pravda('a nic se u toho v prohlížeči nerozbilo', drzak.chybyJs.length === 0,
      drzak.chybyJs.join(' | '));
    await drzak.p.close();
  }

  /* --- okres, který křivku nemá: po kartě nesmí zbýt ani místo --- */
  let bezStranka = null, bezDrzak = null, bezStav = null;
  for (const f of kandidati(bezGrafu)) {
    const o = await otevriPozemek(f);
    const st = await o.p.evaluate(stavSekce);
    if (st.sekce) { bezStranka = f; bezDrzak = o; bezStav = st; break; }
    await o.p.close();
  }
  // PŘEDPOKLAD: druhý směr se dá měřit jen na živé stránce v okrese bez klidné řady
  pravda(`v okrese ${bezGrafu} (bez klidné řady) se našla vykreslená stránka`,
    !!bezStranka, `zkoušeno: ${kandidati(bezGrafu).join(', ') || 'nic'}`);
  if (bezStranka) {
    const m = await bezDrzak.p.$('[data-graf-cen]');
    if (m) await m.scrollIntoViewIfNeeded();
    await bezDrzak.p.waitForTimeout(2500);
    const po = await bezDrzak.p.evaluate(stavSekce);
    pravda('nenakreslí se nic — ani prázdný rámeček', po.graf === false && !po.maGraf,
      JSON.stringify(po));
    pravda('a po kartě nezbude ani místo ani nadpis',
      po.vyska === 0 && po.nadpisVidet === false, `výška ${po.vyska}, nadpis ${po.nadpisVidet}`);
    pravda('a stránka při tom nehlásí chybu skriptu', bezDrzak.chybyJs.length === 0,
      bezDrzak.chybyJs.join(' | '));
    await bezDrzak.p.close();
  }
}

await prohlizec.close();
hotovo();
