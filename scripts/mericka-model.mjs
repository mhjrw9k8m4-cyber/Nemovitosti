#!/usr/bin/env node
/* MĚŘIDLO VLASTNÍHO PREDIKČNÍHO MODELU (gradient boosting nad regresními stromy)
   ==========================================================================
   Spuštění: node scripts/mericka-model.mjs
             node scripts/mericka-model.mjs --mrizka    (hledání nastavení)
             node scripts/mericka-model.mjs --vahy       (co model váží)

   PROČ VLASTNÍ IMPLEMENTACE. Web je statický a bez závislostí (package.json
   má dvě, obě na něco jiného). Gradient boosting nad regresními stromy je
   ale tak málo kódu, že se vejde sem — a hlavně je DETERMINISTICKÝ, takže
   dvě spuštění dají stejné číslo a dvě nastavení se dají porovnat.

   VÝSLEDEK (naměřeno 2026-10-05 na 1 995 nabídkách po odstranění duplicit).
   STROM NEPŘIDÁVÁ NIC. Při srovnání na týchž pozemcích, kde odhad vydají
   oba (999 z 1 332), vyšlo:

     nastavení                         medián chyby   znaménkový test
     dnešní model (js/ceny.js)             25,7 %     —
     strom, 0 stromů (= žádná oprava)      25,8 %     508 blíž / 491 dál
     strom, 50 stromů, hloubka 2           27,1 %     507 / 492
     strom, 150 stromů, hloubka 3          29,4 %     485 / 514
     strom, 300 stromů, hloubka 4          30,8 %     499 / 500

   Celá mřížka (3 hloubky × 4 počty stromů × 3 rychlosti, --mrizka) má
   nejlepší položku v „nula stromů", tedy v tom NIC NEDĚLAT, a chyba roste
   monotónně s hloubkou, počtem stromů i rychlostí učení. To není otázka
   nastavení: na 1 200 tréninkových řádcích a dvaceti třech příznacích se
   strom učí šum. Signál, který by dnešnímu modelu unikal, v těch datech
   není.

   KDE JE STROP. Nejde o algoritmus, ale o data: ceny v nich jsou
   NABÍDKOVÉ, ne realizované. Model se tedy učí, za kolik lidé chtějí
   prodat, a měří se proti témuž. Skutečné zlepšení by přinesly ceny, za
   které se pozemky opravdu prodaly (ČÚZK, dálkový přístup na smlouvu) —
   ne lepší model nad týmiž čísly.

   Tenhle soubor tu zůstává, aby se to dalo přeměřit, až dat bude víc nebo
   až přibude příznak. Nic z něj se na web nevozí.

   CO SE MĚŘÍ. Totéž co v scripts/mericka-odhadu.mjs a stejným způsobem:
   křížově na desetinách, medián absolutní procentní chyby proti NABÍDKOVÉ
   ceně, znaménkový test proti dnešnímu modelu. Jen tak se dá rozhodnout,
   jestli má smysl dnešní vysvětlitelný odhad (medián z deseti nejbližších
   nabídek) čímkoli nahrazovat.

   KDE SE DÁ PODVÁDĚT A JAK SE TOMU TADY BRÁNÍ:

   1. Model nesmí vidět cenu pozemku, který odhaduje. Zařizuje to dělení
      na desetiny: trénuje se z devíti, měří na desáté.
   2. PŘÍZNAKY Z OKOLÍ se taky musí počítat jen z tréninkových dat. Kdyby
      se medián okolí počítal ze všech dat, nesla by ta hodnota cenu
      měřeného pozemku a model by ji jen opsal. Proto se index sousedů
      staví pro každou desetinu zvlášť, jen z jejích tréninkových řádků.
   3. Ani u tréninkového řádku se nesmí do jeho vlastních sousedů počítat
      on sám — jinak se model naučí opisovat a na novém pozemku zklame.
   4. Chyba se počítá proti ceně z inzerátu, ne proti ničemu, co by
      vycházelo z modelu.
   ========================================================================== */
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

const VSE = PKH.bezDuplicit(JSON.parse(fs.readFileSync(path.join(KOREN, 'data', 'opportunities.json'), 'utf8')).opportunities);
/* Měří se na celých pozemcích na prodej — u podílu je cena za zlomek
   a výměra celá, u dražby je cena vyvolávací. */
const jeMereny = (d) => d.type === 'sale' && !d.podil && d.price > 0 && d.area > 0;
/* DO TRÉNINKU PATŘÍ JEN TO, ČEMU VĚŘÍ I DNEŠNÍ MODEL. js/ceny.js vyřazuje
   nabídky s cenou pod padesátinou místní hladiny (překlep v inzerátu,
   cena za podíl u nabídky, která se za podíl nepřiznala). Nechat je v
   tréninku znamená učit strom z cen, které v realitě nejsou — a zároveň
   měřit proti modelu, který je nevidí. Rozhoduje o tom hladina spočítaná
   z TRÉNINKOVÝCH dat, ne ze všech. */
const MERENE = new Set(VSE.filter(jeMereny));

const median = (a) => {
  if (!a.length) return null;
  const b = a.slice().sort((x, y) => x - y), i = Math.floor(b.length / 2);
  return b.length % 2 ? b[i] : (b[i - 1] + b[i]) / 2;
};
const km = (a, b, c, e) => {
  const R = 6371, r = Math.PI / 180;
  const dx = (c - a) * r, dy = (e - b) * r;
  const s = Math.sin(dx / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(dy / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
};

/* ---------------- regresní strom na kvadratickou chybu ---------------- */
/* Dělicí body se berou z kvantilů, ne ze všech hodnot: u 1 300 řádků a
   dvaceti příznaků by to bylo zbytečně pomalé a výsledek stejný. */
function postavStrom(X, y, indexy, hloubka, minList, prahy) {
  const n = indexy.length;
  let soucet = 0;
  for (const i of indexy) soucet += y[i];
  /* LIST JE MEDIÁN ZBYTKŮ, ne jejich průměr. Měří se medián absolutní
     procentní chyby, kdežto průměr sleduje kvadratickou chybu — a ta se
     u cen pozemků řídí hrstkou extrémů (cena za metr jde v datech od
     5 do 23 498 Kč). Naměřeno: s průměrem vyšel strom 37 %, s mediánem
     se vejde pod dnešní model. Dělení se pořád vybírá podle úbytku
     kvadratické chyby, protože to jde spočítat jedním průchodem;
     posouvá se ale o medián. */
  const list = { hodnota: medianZ(y, indexy) };
  if (hloubka === 0 || n < 2 * minList) return list;

  let nej = null;
  const zaklad = soucet * soucet / n;
  for (let p = 0; p < prahy.length; p++) {
    for (const prah of prahy[p]) {
      let sL = 0, nL = 0, sR = 0, nR = 0;
      for (const i of indexy) {
        if (X[i][p] <= prah) { sL += y[i]; nL++; } else { sR += y[i]; nR++; }
      }
      if (nL < minList || nR < minList) continue;
      /* Zisk = úbytek kvadratické chyby; pro kvadratickou chybu stačí
         porovnávat součty čtverců průměrů (zbytek je konstanta). */
      const zisk = sL * sL / nL + sR * sR / nR - zaklad;
      if (!nej || zisk > nej.zisk) nej = { zisk, p, prah };
    }
  }
  if (!nej || nej.zisk <= 0) return list;

  const L = [], R = [];
  for (const i of indexy) (X[i][nej.p] <= nej.prah ? L : R).push(i);
  return {
    p: nej.p, prah: nej.prah,
    vlevo: postavStrom(X, y, L, hloubka - 1, minList, prahy),
    vpravo: postavStrom(X, y, R, hloubka - 1, minList, prahy)
  };
}
function medianZ(y, indexy) {
  const v = indexy.map((i) => y[i]).sort((a, b) => a - b);
  const i = Math.floor(v.length / 2);
  return v.length % 2 ? v[i] : (v[i - 1] + v[i]) / 2;
}
function zeStromu(strom, x) {
  let u = strom;
  while (u.p !== undefined) u = (x[u.p] <= u.prah ? u.vlevo : u.vpravo);
  return u.hodnota;
}
function kvantilovePrahy(X, pocetPriznaku, kosu) {
  const prahy = [];
  for (let p = 0; p < pocetPriznaku; p++) {
    const v = X.map((x) => x[p]).sort((a, b) => a - b);
    const sada = new Set();
    for (let k = 1; k < kosu; k++) {
      const a = v[Math.floor(k / kosu * v.length)];
      const b = v[Math.min(v.length - 1, Math.floor(k / kosu * v.length) + 1)];
      if (a !== b) sada.add((a + b) / 2);
    }
    prahy.push([...sada]);
  }
  return prahy;
}
/* Gradient boosting: každý další strom se učí, co předchozí nedovysvětlily. */
function trenuj(X, y, nast) {
  const zaklad = medianZ(y, y.map((_, i) => i));
  const pred = new Array(y.length).fill(zaklad);
  const prahy = kvantilovePrahy(X, X[0].length, nast.kosu);
  const indexy = X.map((_, i) => i);
  const stromy = [];
  for (let t = 0; t < nast.stromu; t++) {
    const zbytek = y.map((v, i) => v - pred[i]);
    const s = postavStrom(X, zbytek, indexy, nast.hloubka, nast.minList, prahy);
    stromy.push(s);
    for (let i = 0; i < X.length; i++) pred[i] += nast.rychlost * zeStromu(s, X[i]);
  }
  return { zaklad, stromy, rychlost: nast.rychlost };
}
function predikuj(m, x) {
  let v = m.zaklad;
  for (const s of m.stromy) v += m.rychlost * zeStromu(s, x);
  return v;
}

/* ---------------- příznaky ---------------- */
const SKUPINY = ['Stavební / zastavěná', 'Ostatní plocha', 'Louka / travní porost',
  'Lesní pozemek', 'Orná půda', 'Jiný pozemek', 'Vinice / sad', 'Zahrada'];
const SITE = ['elektrina', 'voda', 'plyn', 'cesta', 'kanalizace'];
export const JMENA_PRIZNAKU = [
  'log výměry', 'zem. šířka', 'zem. délka',
  ...SKUPINY.map((s) => 'druh: ' + s),
  'log mediánu okolí', 'počet sousedů do 25 km', 'vzdálenost 10. souseda',
  'rozptyl okolí', 'log mediánu okresu', 'log mediánu kraje',
  ...SITE.map((s) => 'síť: ' + s), 'sítě známy',
  'vzorek dnešního modelu', 'rozptyl dnešního modelu', 'úroveň srovnání'
];

/* Index sousedů POSTAVENÝ JEN Z TRÉNINKOVÝCH ŘÁDKŮ — viz bod 2 v hlavičce.
   Do cenových hladin se, stejně jako v js/ceny.js, nepočítají vyvolávací
   ceny dražeb ani spoluvlastnické podíly. */
function postavOkoli(trenink) {
  const body = [];
  const okres = {}, kraj = {};
  const okresKraj = CENY.OKRES_KRAJ || {};
  for (const d of trenink) {
    if (d.type !== 'sale' || d.podil || !(d.price > 0) || !(d.area > 0)) continue;
    const g = CENY.druhGroup(d.druh);
    const m = d.price / d.area;
    if (isFinite(d.lat) && isFinite(d.lng)) body.push({ lat: d.lat, lng: d.lng, a: d.area, m, g, d });
    (okres[g + '|' + d.okres] = okres[g + '|' + d.okres] || []).push(m);
    const k = okresKraj[d.okres];
    if (k) (kraj[g + '|' + k] = kraj[g + '|' + k] || []).push(m);
  }
  /* Dnešní model postavený z TÝCHŽ tréninkových dat — slouží jako základ
     i jako soupeř, takže obojí vidí stejně málo. */
  return { body, okres, kraj, okresKraj, dnes: CENY.postav(trenink) };
}
function priznaky(d, ix) {
  const g = CENY.druhGroup(d.druh);
  const x = [Math.log(d.area), d.lat || 0, d.lng || 0];
  for (const s of SKUPINY) x.push(g === s ? 1 : 0);
  /* Sousedé: sám sebe ne (bod 3 v hlavičce). Shoda se poznává po
     totožnosti objektu, ne po hodnotách — dva různé pozemky mohou mít
     stejnou cenu i výměru. */
  const bliz = [];
  for (const b of ix.body) {
    if (b.d === d || b.g !== g) continue;
    const v = km(d.lat, d.lng, b.lat, b.lng);
    if (v <= 25) bliz.push({ v, m: b.m, a: b.a });
  }
  bliz.sort((p, q) => (p.v - q.v) || (p.a - q.a) || (p.m - q.m));
  const deset = bliz.slice(0, 10).map((b) => b.m).sort((p, q) => p - q);
  const medO = deset.length ? median(deset) : null;
  const kv = (p) => deset[Math.min(deset.length - 1, Math.floor(p * deset.length))];
  x.push(medO ? Math.log(medO) : 0);
  x.push(bliz.length);
  x.push(bliz.length >= 10 ? bliz[9].v : 99);
  x.push(medO && deset.length >= 4 ? (kv(0.75) - kv(0.25)) / medO : 0);
  const mo = median(ix.okres[g + '|' + d.okres] || []);
  const mk = median(ix.kraj[g + '|' + (ix.okresKraj[d.okres] || '')] || []);
  x.push(mo ? Math.log(mo) : 0);
  x.push(mk ? Math.log(mk) : 0);
  const site = new Set(d.site || []);
  for (const s of SITE) x.push(site.has(s) ? 1 : 0);
  x.push(d.site ? 1 : 0);
  /* ZÁKLAD JE ODHAD DNEŠNÍHO MODELU, ne vlastní medián okolí.
     Otázka totiž není „umí strom odhadnout cenu", ale „ví strom něco,
     co dnešní model ještě neví". Dnešní model přepočítává ceny sousedů
     na výměru odhadovaného pozemku podle nafitovaného sklonu; vlastní
     holý medián okolí má chybu 32,7 % proti jeho 25,4 %, takže se s ním
     jako základ začíná o sedm bodů pozadu. Když se za základ vezme jeho
     odhad, měří se přesně to, co nás zajímá: zbývá v datech signál,
     který mu uniká? */
  const o = ix.dnes.odhad(d);
  if (o && o.podleVelikosti) {
    x.push(o.vzorek, o.rozptyl || 0,
      o.uroven === 'okoli' ? 0 : o.uroven === 'okres' ? 1 : 2);
  } else x.push(0, 0, 3);
  return { x: x, zaklad: o && o.podleVelikosti ? o.zaM2 : null };
}

/* STROM SE UČÍ JEN OPRAVU PROTI ZÁKLADU, ne celou cenu.
 *
 * Napoprvé tu strom dostal „log mediánu okolí" jako jeden z příznaků a
 * měl si z něj celou cenu poskládat sám. Nešlo to a nemohlo: strom vrací
 * po částech konstantní hodnotu, takže příznak neumí PROPUSTIT — umí ho
 * jen rozsekat na pár hladin. Naměřeno 35 % proti 25 % dnešního modelu,
 * a celý ten rozdíl byl v tom, že se strom musel učit i to, co už víme.
 *
 * Teď se předpovídá log(cena za m²) − log(základu), tedy kolikrát je
 * pozemek dražší nebo levnější, než říká okolí. Základ se přenese
 * přesně a strom řeší jen zbytek — výměru, druh, sítě, polohu v rámci
 * okolí. Když vyjde oprava nula, je výsledek na korunu dnešní model. */

/* ---------------- křížové měření ---------------- */
function otisk(d, posun) {
  const s = `${posun}|${d.place}|${d.okres}|${d.price}|${d.area}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h) % 10;
}
export function mer(nast, posun = 0) {
  const dil = (d, i) => (posun === 0 ? i % 10 : otisk(d, posun));
  const chybyML = [], chybyDnes = [], pary = [];
  let bezOdhadu = 0, bezZakladu = 0;
  for (let k = 0; k < 10; k++) {
    const trenink = VSE.filter((d, i) => dil(d, i) !== k);
    const ix = postavOkoli(trenink);
    const treninkMereny = trenink.filter((d) => jeMereny(d) && !ix.dnes.neduveryhodna(d));
    const radky = treninkMereny.map((d) => ({ d, p: priznaky(d, ix) })).filter((r) => r.p.zaklad);
    const X = radky.map((r) => r.p.x);
    const y = radky.map((r) => Math.log(r.d.price / r.d.area) - Math.log(r.p.zaklad));
    const m = trenuj(X, y, nast);
    const dnes = ix.dnes;
    for (let i = 0; i < VSE.length; i++) {
      const d = VSE[i];
      if (dil(d, i) !== k || !MERENE.has(d)) continue;
      const p = priznaky(d, ix);
      if (!p.zaklad) { bezZakladu++; continue; }
      const cML = p.zaklad * Math.exp(predikuj(m, p.x)) * d.area;
      const eML = Math.abs(cML - d.price) / d.price * 100;
      chybyML.push(eML);
      const o = dnes.odhad(d);
      if (o && o.podleVelikosti) {
        const eD = Math.abs(o.castka - d.price) / d.price * 100;
        chybyDnes.push(eD);
        pary.push({ eML, eD });
      } else bezOdhadu++;
    }
  }
  const bliz = pary.filter((p) => p.eML < p.eD).length;
  return {
    pocet: chybyML.length, medML: median(chybyML), medDnes: median(chybyDnes),
    bliz, dal: pary.length - bliz, pary: pary.length, bezOdhadu, bezZakladu,
    /* Dnešní model u části pozemků odhad nevydá vůbec; model se tedy
       porovnává i jen na těch, kde oba odhad mají. */
    medMLparove: median(pary.map((p) => p.eML))
  };
}

const ZAKLAD = { stromu: 300, hloubka: 3, rychlost: 0.05, minList: 20, kosu: 24 };
if (process.argv.includes('--mrizka')) {
  console.log('nastavení                                   párově ML   dnes   ML na všech   blíž/dál');
  /* Včetně krajní možnosti „žádná oprava" (nula stromů): když vyhraje
     ona, je odpověď, že strom nemá co přidat. */
  for (const hloubka of [2, 3, 4])
    for (const stromu of [0, 50, 150, 300])
      for (const rychlost of [0.02, 0.05, 0.1]) {
        const n = { ...ZAKLAD, hloubka, stromu, rychlost };
        const r = mer(n);
        console.log(`hloubka ${hloubka} stromů ${String(stromu).padStart(3)} rychlost ${rychlost}`.padEnd(44)
          + `${r.medMLparove.toFixed(1)} %   ${r.medDnes.toFixed(1)} %   ${r.medML.toFixed(1)} %`
          + `   ${r.bliz}/${r.dal}`);
      }
} else if (process.argv.includes('--vahy')) {
  /* Kolik každý příznak přinesl: součet zisku ze všech dělení, co ho použila. */
  const ix = postavOkoli(VSE);
  const mer_ = VSE.filter((d) => jeMereny(d) && !ix.dnes.neduveryhodna(d));
  const radky = mer_.map((d) => ({ d, p: priznaky(d, ix) })).filter((r) => r.p.zaklad);
  const X = radky.map((r) => r.p.x);
  const y = radky.map((r) => Math.log(r.d.price / r.d.area) - Math.log(r.p.zaklad));
  const m = trenuj(X, y, ZAKLAD);
  const pocty = new Array(JMENA_PRIZNAKU.length).fill(0);
  const spocti = (s) => { if (s.p === undefined) return; pocty[s.p]++; spocti(s.vlevo); spocti(s.vpravo); };
  m.stromy.forEach(spocti);
  const celkem = pocty.reduce((a, b) => a + b, 0);
  JMENA_PRIZNAKU.map((j, i) => [j, pocty[i]]).sort((a, b) => b[1] - a[1])
    .forEach(([j, p]) => console.log(`${j.padEnd(26)} ${String(p).padStart(5)} dělení  ${(p / celkem * 100).toFixed(1)} %`));
} else {
  /* SROVNÁVAT SE MUSÍ NA TÝCHŽ POZEMCÍCH. Dnešní model odhad u části
     pozemků vědomě nevydá (málo srovnání, nebo cena tak nad hladinou, že
     to nebude srovnatelný pozemek), kdežto strom odpoví vždycky. Kdyby se
     medián dnešního modelu z té snazší části porovnal s mediánem stromu
     ze všech, vyšel by strom hůř, i kdyby byl lepší — na to se tady
     poprvé narazilo (46 % proti 26 %, a celý rozdíl byl v tom). */
  console.log('Křížové měření na desetinách, pět různých rozdělení dat.');
  console.log('Medián chyby se počítá na POZEMCÍCH, KDE ODHAD VYDAJÍ OBA.\n');
  console.log('rozdělení   vlastní model   dnešní model   blíž/dál   srovnáno na   strom sám na všech');
  for (const posun of [0, 1, 2, 3, 4]) {
    const r = mer(ZAKLAD, posun);
    console.log(`${String(posun).padEnd(12)}${r.medMLparove.toFixed(1)} %`.padEnd(28)
      + `${r.medDnes.toFixed(1)} %`.padEnd(15)
      + `${r.bliz}/${r.dal}`.padEnd(11)
      + `${r.pary}`.padEnd(14) + `${r.medML.toFixed(1)} % z ${r.pocet}`);
  }
}
