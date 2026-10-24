#!/usr/bin/env node
/* MĚŘIDLO PŘESNOSTI ODHADU CENY
   ==================================================================
   Spuštění: node scripts/mericka-odhadu.mjs            (dnešní model)
             node scripts/mericka-odhadu.mjs --okoli    (+ varianta „okolí")

   Čísla, podle kterých se v js/ceny.js rozhodovalo („medián chyby
   30,9 %", „párově lepší u 134, horší u 154"), se dosud počítala ručně
   a v repozitáři po nich zbyly jen komentáře. Kdo je chtěl ověřit nebo
   zopakovat s jiným nápadem, musel si postup napsat znovu. Tohle je ten
   postup, napsaný jednou.

   JAK SE MĚŘÍ. Křížově na desetinách: nabídky se rozdělí na deset dílů,
   model se vždycky postaví z devíti a odhaduje ten desátý. Odhad se
   porovná s NABÍDKOVOU cenou té nabídky. Bez toho by se model měřil na
   datech, ze kterých je postavený, a vyšel by vždycky skvěle.

   Dělení není náhodné: řídí se pořadím v datech (i % 10), takže dvě
   spuštění dají totéž číslo a dva nápady se dají porovnat.

   CO SE POROVNÁVÁ. Medián absolutní procentní chyby — medián proto, že
   pár pokřivených cen (podíl, překlep v inzerátu) by průměr utrhlo.
   A k tomu znaménkový test: u kolika nabídek je druhá varianta BLÍŽ
   a u kolika DÁL. Medián se může zlepšit a přitom být nápad horší
   u většiny nabídek — přesně na to se v js/ceny.js jednou narazilo.
   ================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require_ = createRequire(import.meta.url);
const PKH = require_(path.join(KOREN, 'js', 'hlidani-logika.js'));
const okno = {};
new Function('window', fs.readFileSync(path.join(KOREN, 'js', 'ceny.js'), 'utf8'))(okno);
const CENY = okno.PK_CENY;

const syrove = JSON.parse(fs.readFileSync(path.join(KOREN, 'data', 'opportunities.json'), 'utf8')).opportunities || [];
const VSE = PKH.bezDuplicit(syrove);

/* MĚŘÍ SE NA CELÝCH POZEMCÍCH NA PRODEJ. U podílu je cena za zlomek
   a výměra celá, takže „chyba odhadu" by měřila tu nesrovnalost, ne
   model. Dražby mají vyvolávací cenu, což není nabídková cena. */
const VZOREK = VSE.filter((d) => d.type === 'sale' && !d.podil && d.price > 0 && d.area > 0);

const median = (a) => {
  if (!a.length) return null;
  const b = a.slice().sort((x, y) => x - y);
  const i = Math.floor(b.length / 2);
  return b.length % 2 ? b[i] : (b[i - 1] + b[i]) / 2;
};
const km = (a, b, c, e) => {
  const R = 6371, r = Math.PI / 180;
  const dx = (c - a) * r, dy = (e - b) * r;
  const s = Math.sin(dx / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(dy / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
};

/* ---- varianta A: dnešní model (okres → kraj, podle js/ceny.js) ---- */
function odhadDnesni(model, d) {
  const o = model.odhad(d);
  return o && o.zaM2 > 0 ? o.zaM2 : null;
}

/* ---- varianta B: „okolí" — nejbližší nabídky bez ohledu na okres ----
   Nápad: hranice okresu je úřední čára, cena se po ní neláme. Místo
   okresu se vezme K nejbližších nabídek téhož druhu do R km a z nich
   medián ceny za metr. Když jich není dost, ustoupí se na dnešní model —
   jinak by se porovnávalo „odhad" proti „žádný odhad". */
/* STEJNÁ VSTUPNÍ PRAVIDLA JAKO ŽIVÝ MODEL, JINAK SE NEMĚŘÍ ZEMĚPIS.
   Tohle měřidlo tvrdilo, že „okolí" je o 2,3 až 3,0 p.b. lepší než
   dnešní model — a vypadalo to jako nápad k zavedení. Jenže okolí
   v js/ceny.js DÁVNO JE a jde první; rozdíl byl v tom, KDO se do
   srovnání počítá. Živý model bere jen běžné nabídky
   (`if (d.type !== 'sale') return;` v postav()), tahle varianta brala
   i dražby — a jejich VYVOLÁVACÍ cena je systematicky nízko, takže
   medián chyby spadl. Měřil se tím nový vstupní filtr, ne zeměpis.
   Dražby se proto vynechávají stejně jako v živém modelu; kdo chce
   změřit tu druhou otázku, pustí to s `--i-drazby` a dostane ji
   pojmenovanou zvlášť. */
const I_DRAZBY = process.argv.includes('--i-drazby');
function odhadOkoli(trenink, d, druhGroup, K, R, sklon, model) {
  const g = druhGroup(d.druh);
  const bliz = [];
  for (const x of trenink) {
    if (x === d || !(x.area > 0) || !(x.price > 0)) continue;
    if (!I_DRAZBY && x.type !== 'sale') continue;
    /* A TAKY CENY STANOVENÉ ÚŘEDNĚ (SPÚ). Živý model je ze srovnávací
       hladiny vynechává ze stejného důvodu jako dražby: cenu nestanovil
       trh. Tohle byla ta druhá a větší část záhady — bez tohohle řádku
       měřidlo tvrdilo, že „okolí" je o 2,6 p.b. lepší než živý model,
       který okolí DÁVNO MÁ. Měřil se tím vstupní filtr, ne zeměpis. */
    if (!I_DRAZBY && model && model.spravniCena && model.spravniCena(x)) continue;
    if (druhGroup(x.druh) !== g) continue;
    const vzd = km(d.lat, d.lng, x.lat, x.lng);
    if (vzd > R) continue;
    bliz.push({ vzd, m: x.price / x.area, a: x.area });
  }
  if (bliz.length < K) return null;
  bliz.sort((a, b) => a.vzd - b.vzd);
  const vyber = bliz.slice(0, K);
  /* S PŘEPOČTEM NA VELIKOST, nebo bez něj. Cena za metr s výměrou klesá
     a js/ceny.js na to má sklon fitovaný celostátně; otázka je, jestli
     se vyplatí i u okolí. Rozhoduje měření, ne úvaha. */
  const b = sklon ? (sklon[g] || 0) : 0;
  return median(vyber.map((x) => (b && d.area > 0 ? x.m * Math.pow(d.area / x.a, b) : x.m)));
}

/* ROZDĚLENÍ NA DESETINY SE DÁ POSUNOUT (--posun N). Jedno rozdělení
   nestačí: rozdíl 3 p.b. může být vlastnost toho, jak zrovna padly
   nabídky do dílů. Druhý běh s jiným rozdělením je nejlevnější způsob,
   jak si to ověřit — a když se výsledek rozejde, nápad neplatí. */
const SKLON = process.argv.includes('--sklon');
const POSUN = (() => {
  const i = process.argv.indexOf('--posun');
  return i > 0 ? (parseInt(process.argv[i + 1], 10) || 0) : 0;
})();
/* POZOR NA ZDÁNLIVĚ JINÉ ROZDĚLENÍ. Napoprvé tu stálo (i*7+posun)%10 —
   jenže to je jen přeznačkování týchž desetin (násobení číslem nesoudělným
   s deseti je permutace zbytků), takže všechny posuny vyšly na setinu
   stejně a vypadalo to jako úžasná stabilita. Skutečně jiné rozdělení
   musí vzniknout z OBSAHU nabídky, ne z jejího pořadí. */
function otisk(d, posun) {
  const s = `${d.place}|${d.okres}|${d.price}|${d.area}|${posun}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h) % 10;
}
const dil = (i) => (POSUN ? otisk(VSE[i], POSUN) : i % 10);

function krizove(odhadni, uprav) {
  const chyby = [], podle = new Map();
  for (let f = 0; f < 10; f++) {
    let trenink = VSE.filter((_, i) => dil(i) !== f);
    if (uprav) trenink = uprav(trenink);
    const model = CENY.postav(trenink);
    for (let i = 0; i < VZOREK.length; i++) {
      const d = VZOREK[i];
      if (dil(VSE.indexOf(d)) !== f) continue;
      const zaM2 = odhadni(model, d, trenink);
      if (!(zaM2 > 0)) continue;
      const skutecna = d.price / d.area;
      const ch = Math.abs(zaM2 - skutecna) / skutecna * 100;
      chyby.push(ch); podle.set(d, ch);
    }
  }
  return { median: median(chyby), kolik: chyby.length, podle };
}

console.log(`nabídek celkem ${VSE.length}, měří se na ${VZOREK.length} celých pozemcích na prodej\n`);

const A = krizove((model, d) => odhadDnesni(model, d));
console.log(`dnešní model            medián chyby ${A.median.toFixed(1)} %   (odhad vznikl u ${A.kolik} z ${VZOREK.length})`);

/* A ZNAMÉNKOVÁ ODCHYLKA, kterou tohle měřidlo dlouho nemělo. Absolutní
   chyba neřekne, jestli model střílí vedle, nebo soustavně vysoko —
   a to je rozdíl mezi „nepřesné" a „zkreslené".
   Naměřeno při doplnění (křížově, na téže množině jako chyba výš):
   medián +1,4 % celkem, z toho okolí +0,4 %, ústup na kraj +8,0 %
   a okres −9,0 % (jen 21 odhadů). Odhad z okolí je tedy prakticky
   nezkreslený; posouvá se až ten krajský.
   POZOR NA MNOŽINU, NA KTERÉ SE TO MĚŘÍ. Napoprvé jsem si to spočítal
   na všech nabídkách na prodej a vyšlo +4,8 % — jenže v tom byly
   i spoluvlastnické podíly, kterým web odhad vůbec nevydává. Měřila se
   tedy odchylka u čísel, která nikdo nikdy neuvidí.
   Opravit to kalibrací nejde; zkoušelo se to (--kalibrace) a ve třech
   rozděleních vyšla kalibrace o 0,2 p.b. lepší až o 1,0 p.b. horší,
   se znaménkovým testem pokaždé proti. Je to tedy vlastnost srovnání
   „místní medián proti jedné nabídce", ne vada k opravě. */
{
  const zn = [], podle = new Map();
  for (let f = 0; f < 10; f++) {
    const model = CENY.postav(VSE.filter((_, i) => dil(i) !== f));
    for (const d of VZOREK) {
      if (dil(VSE.indexOf(d)) !== f) continue;
      const o = model.odhad(d);
      if (!o || !(o.zaM2 > 0)) continue;
      const r = (o.zaM2 - d.price / d.area) / (d.price / d.area) * 100;
      zn.push(r);
      if (!podle.has(o.uroven)) podle.set(o.uroven, []);
      podle.get(o.uroven).push(r);
    }
  }
  const nad = zn.filter((x) => x > 0).length;
  console.log(`  znaménková odchylka    medián ${median(zn).toFixed(1)} %`
    + `   (+ = odhad nad cenou; nad cenou u ${(nad / zn.length * 100).toFixed(0)} % nabídek)`);
  for (const [u, a] of [...podle].sort((x, y) => y[1].length - x[1].length)) {
    console.log(`     · ${u.padEnd(6)} n=${String(a.length).padStart(4)}   medián ${median(a).toFixed(1).padStart(6)} %`);
  }
}

/* ROZPAD PODLE DRUHU (--podle-druhu). Jedno číslo za celý web zakrývá,
   že se přesnost mezi druhy liší několikanásobně — a právě podle toho se
   rozhoduje, kde odhad vydávat a kde mlčet. Počítá to scripts/presnost-odhadu.mjs,
   týž modul, ze kterého bere čísla generátor řezů do data/model.json:
   kdyby to byly dvě kopie, web by u čísla psal jinou nejistotu, než
   jakou naměří tohle měřidlo. */
/* NÁPAD: VYHODIT SPOLUVLASTNICKÉ PODÍLY ZE SROVNÁVACÍHO VZORKU.
   U podílu je v ceně zlomek pozemku, ale v inzerátu výměra celé parcely,
   takže jeho cena za metr vyjde uměle nízko — a medián, ze kterého se
   počítá obvyklá cena, to stahuje dolů. Podílů je 26 % nabídek, takže
   to není okrajová věc. Rozhodne měření, ne úvaha: medián chyby
   i znaménkový test. */
if (process.argv.includes('--bez-podilu')) {
  const B = krizove((model, d, trenink) => odhadDnesni(model, d), (trenink) => trenink.filter((x) => !x.podil));
  let lepsi = 0, horsi = 0, stejne = 0;
  for (const [d, chA] of A.podle) {
    const chB = B.podle.get(d);
    if (chB == null) continue;
    if (chB < chA - 0.05) lepsi++; else if (chB > chA + 0.05) horsi++; else stejne++;
  }
  const rozdil = (B.median - A.median).toFixed(1);
  console.log(`bez podílů ve vzorku    medián chyby ${B.median.toFixed(1)} % (${rozdil > 0 ? '+' : ''}${rozdil} p.b.)`
    + `   odhadů ${B.kolik}   párově: lepší ${lepsi}, horší ${horsi}, stejně ${stejne}`);
}

/* A TŘETÍ MOŽNOST: podíl nevyhodit, ale PŘEPOČÍTAT. Web už umí spočítat
   výměru, která kupujícímu doopravdy připadne (vymeraVCene v js/ceny.js
   — u části podílů je uložená výměra už ta podílová, u části celá, a dá
   se to z textu rozhodnout). Cena za metr z té výměry je poctivá, takže
   by podíl mohl ve vzorku ZŮSTAT a nic nekřivit. */
if (process.argv.includes('--podil-prepocet')) {
  const B = krizove((model, d) => odhadDnesni(model, d), (trenink) => trenink.map((x) => {
    if (!x.podil) return x;
    const v = CENY.vymeraVCene(x);
    if (!(v > 0) || v === x.area) return x;
    return Object.assign({}, x, { area: v, podil: false });
  }));
  let lepsi = 0, horsi = 0, stejne = 0;
  for (const [d, chA] of A.podle) {
    const chB = B.podle.get(d);
    if (chB == null) continue;
    if (chB < chA - 0.05) lepsi++; else if (chB > chA + 0.05) horsi++; else stejne++;
  }
  const rozdil = (B.median - A.median).toFixed(1);
  console.log(`podíl přepočtený        medián chyby ${B.median.toFixed(1)} % (${rozdil > 0 ? '+' : ''}${rozdil} p.b.)`
    + `   odhadů ${B.kolik}   párově: lepší ${lepsi}, horší ${horsi}, stejně ${stejne}`);
}

/* ---- varianta C: KALIBRACE (--kalibrace) ---------------------------
   Měřidlo dosud počítalo jen ABSOLUTNÍ chybu, a ta neřekne, jestli
   model střílí vedle nebo soustavně vysoko. Změřeno: medián znaménkové
   odchylky je +4,8 % (odhad je NAD nabídkovou cenou) a u ústupu na kraj
   +10,6 %. To není rozptyl, to je posun.
   Varianta C ho opravuje: na TRÉNINKOVÉ části se pro každou úroveň
   spočítá medián znaménkové odchylky a odhad testované desetiny se jím
   podělí. Kalibrace se tedy učí jinde, než kde se měří.
   Pozor na poctivost: konstanta se počítá z téhož modelu, který ji pak
   opravuje (uvnitř tréninku), takže je mírně optimistická. Proto se
   výsledek čte spolu se znaménkovým testem a s jinými rozděleními
   (--posun). */
if (process.argv.includes('--kalibrace')) {
  const medz = (a) => median(a);
  const C = krizove((model, d, trenink) => {
    const o = model.odhad(d);
    if (!o || !(o.zaM2 > 0)) return null;
    /* Konstanty z tréninku: pro každou úroveň medián (odhad/cena). */
    if (!model.__kal) {
      const sber = new Map();
      for (const t of trenink) {
        if (t.type !== 'sale' || !(t.area > 0) || !(t.price > 0)) continue;
        const ot = model.odhad(t);
        if (!ot || !(ot.zaM2 > 0)) continue;
        const r = ot.zaM2 / (t.price / t.area);
        if (!sber.has(ot.uroven)) sber.set(ot.uroven, []);
        sber.get(ot.uroven).push(r);
      }
      const kal = {};
      for (const [u, a] of sber) if (a.length >= 30) kal[u] = medz(a);
      model.__kal = kal;
    }
    const k = model.__kal[o.uroven];
    /* Konstanta musí vyjít rozumně; nesmyslnou se nic nepodělí.
       Rozhodnutí je schválně na samostatném řádku: porovnání s pětkou
       hned před otazníkem je vzorec, na který hlídá
       scripts/test-mnozstvi.mjs — v kódu, který skloňuje počty, tam
       chybí tvar pro nulu. Tady je to planý poplach (žádný počet se
       tu neskloňuje), ale učit se hlídače obcházet je horší než mu
       ustoupit. */
    const rozumna = k > 0.2 && k < 5;
    return rozumna ? o.zaM2 / k : o.zaM2;
  });
  let lepsi = 0, horsi = 0, stejne = 0;
  for (const [d, chA] of A.podle) {
    const chC = C.podle.get(d);
    if (chC == null) continue;
    if (chC < chA - 0.05) lepsi++; else if (chC > chA + 0.05) horsi++; else stejne++;
  }
  const r = (C.median - A.median).toFixed(1);
  console.log(`kalibrace podle úrovně  medián chyby ${C.median.toFixed(1)} % (${r > 0 ? '+' : ''}${r} p.b.)`
    + `   odhadů ${C.kolik}   párově: lepší ${lepsi}, horší ${horsi}, stejně ${stejne}`);
}

if (process.argv.includes('--podle-druhu')) {
  const { presnostPodleDruhu } = await import('./presnost-odhadu.mjs');
  const podle = presnostPodleDruhu(VSE, CENY);
  const radky = Object.entries(podle)
    .map(([g, z]) => ({ g: g || '(bez druhu)', ...z }))
    .sort((x, y) => (x.median ?? 1e9) - (y.median ?? 1e9));
  console.log('\ndruh'.padEnd(26) + 'medián chyby   odhad vznikl');
  for (const r of radky) {
    console.log(r.g.padEnd(25) + (r.median == null ? '     —' : (r.median.toFixed(1) + ' %').padStart(11))
      + ('   ' + r.kolik + ' z ' + r.celkem).padStart(16));
  }
  const soucet = radky.reduce((s2, r) => s2 + r.kolik, 0);
  console.log('\nSoučet „odhad vznikl" se rovná celkovému počtu odhadů: ' + soucet + ' = ' + A.kolik
    + (soucet === A.kolik ? '' : '   ← NESEDÍ, rozpad měří něco jiného než celek'));
}

if (process.argv.includes('--okoli')) {
  /* Zkouší se víc nastavení: jedno číslo by neřeklo, jestli nápad
     nefunguje, nebo jen není doladěný. */
  const NASTAVENI = process.argv.includes('--rychle') ? [[10, 25]] : [[10, 10], [10, 25], [20, 25], [10, 50], [20, 50], [30, 50]];
  for (const [K, R] of NASTAVENI) {
    const B = krizove((model, d, trenink) => {
      const o = odhadOkoli(trenink, d, CENY.druhGroup, K, R, SKLON ? model.sklon : null, model);
      return o != null ? o : odhadDnesni(model, d);
    });
    let lepsi = 0, horsi = 0, stejne = 0;
    for (const [d, chA] of A.podle) {
      const chB = B.podle.get(d);
      if (chB == null) continue;
      if (chB < chA - 0.05) lepsi++; else if (chB > chA + 0.05) horsi++; else stejne++;
    }
    const rozdil = (B.median - A.median).toFixed(1);
    console.log(`okolí K=${String(K).padStart(2)} R=${String(R).padStart(2)} km${SKLON ? ' +sklon' : '       '}   medián chyby ${B.median.toFixed(1)} % `
      + `(${rozdil > 0 ? '+' : ''}${rozdil} p.b.)   odhadů ${B.kolik}   `
      + `párově: lepší ${lepsi}, horší ${horsi}, stejně ${stejne}`);
  }
  console.log('\nZnaménkový test rozhoduje stejně jako medián: nápad, který zlepší medián'
    + '\na přitom je horší u většiny nabídek, se nepřijímá.');
}
