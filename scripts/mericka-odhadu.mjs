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
function odhadOkoli(trenink, d, druhGroup, K, R, sklon) {
  const g = druhGroup(d.druh);
  const bliz = [];
  for (const x of trenink) {
    if (x === d || !(x.area > 0) || !(x.price > 0)) continue;
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

function krizove(odhadni) {
  const chyby = [], podle = new Map();
  for (let f = 0; f < 10; f++) {
    const trenink = VSE.filter((_, i) => dil(i) !== f);
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

if (process.argv.includes('--okoli')) {
  /* Zkouší se víc nastavení: jedno číslo by neřeklo, jestli nápad
     nefunguje, nebo jen není doladěný. */
  const NASTAVENI = process.argv.includes('--rychle') ? [[10, 25]] : [[10, 10], [10, 25], [20, 25], [10, 50], [20, 50], [30, 50]];
  for (const [K, R] of NASTAVENI) {
    const B = krizove((model, d, trenink) => {
      const o = odhadOkoli(trenink, d, CENY.druhGroup, K, R, SKLON ? model.sklon : null);
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
