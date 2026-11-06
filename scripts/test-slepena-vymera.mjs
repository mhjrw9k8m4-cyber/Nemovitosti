// Test: číslo výměry se nesmí slepit s číslem, které stojí před ním (§462).
//
// Spuštění: node scripts/test-slepena-vymera.mjs   (nepotřebuje síť ani prohlížeč)
//
// NALEZENO MĚŘENÍM 6. 11. na prvním skutečném běhu Sreality. Na webu
// viselo 44 PRAŽSKÝCH BYTŮ jako pozemky s výměrou kolem 1 111 m². Číslo
// se čte z názvu inzerátu a názvy byly „Prodej bytu 2+1 111 m²".
// Vzorek /(\d[\d\s.]*)\s*m²/ začal u jedničky z „2+1", třída [\d\s.]*
// spolkla mezeru a ze dvou čísel vyrobila jedno: z 51 m² bylo 151,
// z 105 m² 1 105. Nepoznalo se to, protože výsledek je pořád číslo —
// jen desetkrát větší. A cena za metr, podle které web počítá odhady,
// rozdává odznaky „pod obvyklou cenou" a staví statistiky okresů, z něj
// vyšla desetkrát nižší. Právě ta nesmyslně nízká cena za metr nabídky
// protáhla sítem, které mělo byty zahodit.
//
// PRAVIDLO: mezera uvnitř čísla je oddělovač tisíců, ne spojka dvou
// čísel. Tvar, který to drží:
//     (?<![\d+])(\d{1,3}(?:[\s.]\d{3})*|\d+)
// tedy (a) před číslem nesmí stát čislice ani plus (počet pokojů),
// (b) za mezerou musí následovat přesně tři čislice.
//
// Hlídá se dvojím způsobem:
//   1) CHOVÁNÍ — na skutečných čtecích funkcích robota;
//   2) TVAR — v celé čtecí vrstvě nesmí být znaková třída, která drží
//      čislice i mezeru, a za kterou stojí jednotka plochy. Výjimkou je
//      jen místo, které žádné číslo nebere (počítadlo zmínek), a místo,
//      kde číslo stojí hned za slovem „výměra" — tam se počet pokojů
//      mezi slovo a číslo nevejde. Obě výjimky se POZNAJÍ Z KÓDU, ne ze
//      seznamu, který bych musel udržovat (§438).
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { vymeraZTextu } from './cteni-zdroje.mjs';
import { najdi } from './parcely-z-textu.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
function hotovo() {
  console.log('\nSlepená výměra');
  console.log(zpravy.join('\n'));
  console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
  if (chyb) { console.log('::error::Slepená výměra: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
  process.exit(0);
}

/* ---------- kód bez komentářů a řetězců ----------
   Komentář v tomhle souboru mluví o vadných vzorcích a nesmí se počítat
   za vadu; řetězce taky ne (bývá v nich „120 m²" jako text). */
function bezKomentaruARetezcu(kod) {
  let s = String(kod || '');
  s = s.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
  const ven = [];
  for (const radek of s.split('\n')) {
    let r = radek
      .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
      .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
      .replace(/`(?:[^`\\]|\\.)*`/g, '``');
    const i = r.indexOf('//');
    if (i !== -1) r = r.slice(0, i);
    ven.push(r);
  }
  return ven.join('\n');
}

/* ---------- hledání podezřelých míst ----------
   Podezřelé je místo, kde znaková třída drží ČISLICI I MEZERU a za ní
   (po oddělovačích a uzávěrkách) stojí JEDNOTKA PLOCHY. Takové místo
   umí z „2+1 51 m²" vyrobit 151. Bezpečný tvar z pravidla výš do téhle
   sítě vůbec nespadne — čislice a mezera v jedné třídě nejsou. */
/* Část VZORCE před nalezenou třídou: od posledního neescapovaného
   lomítka, tedy od začátku regulárního výrazu, dál. */
export function vzorecPred(pred) {
  for (let i = pred.length - 1; i >= 0; i--) {
    if (pred[i] !== '/') continue;
    let zpetnych = 0;
    for (let j = i - 1; j >= 0 && pred[j] === '\\'; j--) zpetnych++;
    if (zpetnych % 2 === 0) return pred.slice(i + 1);
  }
  return pred;
}
/* Je místo uvnitř ZÁCHYTNÉ závorky? `(?:`, `(?=`, `(?!` a `(?<` se
   nepočítají — ty nic nezachytávají, takže z nich číslo nevzejde. */
export function vZachytneZavorce(vzorec) {
  const bez = String(vzorec).replace(/\\./g, '').replace(/\[[^\]]*\]?/g, '');
  const zasobnik = [];
  for (let i = 0; i < bez.length; i++) {
    if (bez[i] === '(') zasobnik.push(bez[i + 1] !== '?');
    else if (bez[i] === ')') zasobnik.pop();
  }
  return zasobnik.some(Boolean);
}
const TRIDA = /\[(?:[^\]\\]|\\.)*\]/g;
const JEDNOTKA_ZA = /^(?:[^A-Za-z]|\\s|\\u00a0|\\d)*(?:m(?:\\s\*)?(?:\(\?:2\|²\)|2|²)|ha)/;
export function mistaVymer(kod) {
  const ven = [];
  TRIDA.lastIndex = 0;
  let m;
  while ((m = TRIDA.exec(kod)) !== null) {
    const trida = m[0];
    if (!/\\d|0-9/.test(trida)) continue;
    if (!/\\s|\\u00a0|\\t|[  ]/.test(trida)) continue;
    const konec = m.index + trida.length;
    if (!JEDNOTKA_ZA.test(kod.slice(konec, konec + 40))) continue;
    /* 120 znaků dozadu: slovo „výměře" bývá ve vzorci rozepsané na
       třídy (v[yý]m[eě][rř]) a do kratšího okna se nevejde. Posuzuje se
       z toho jen část patřící témuž vzorci, ne okolní kód. */
    const pred = kod.slice(Math.max(0, m.index - 120), m.index);
    ven.push({
      trida,
      pred,
      radek: kod.slice(0, m.index).split('\n').length,
      /* POČÍTADLO: třída NENÍ uvnitř otevřené záchytné závorky, takže
         z nálezu žádné číslo nevzniká — jen se počítá, kolikrát se
         výměra v textu zmiňuje. Posuzuje se jen VZOREC, ne okolní kód:
         `(text.match(/\d…` má závorku v JS, ne v regulárním výrazu,
         a na tom se první verze téhle sítě spletla. */
      pocitadlo: !vZachytneZavorce(vzorecPred(pred)),
      /* U SLOVA: před číslem stojí ve vzorci slovo o výměře. Mezi slovo
         a číslo se počet pokojů nevejde: na „výměře 2+1 51 m²" vzorec
         nesedne vůbec a výměra zůstane prázdná — a prázdná výměra je
         bezpečný konec, kdežto slepené číslo se nepozná. */
      uSlova: /v[\[\]ýy]*m[\[\]ěe]*[rř]|Výměra|vymer/i.test(vzorecPred(pred)),
    });
  }
  return ven;
}

/* ---------- 1) chování skutečných čtecích funkcí ---------- */
const src = readFileSync(path.join(KOREN, 'scripts', 'fetch-opportunities.mjs'), 'utf8');
const kusy = [
  src.match(/function parseArea\(text\)[\s\S]*?\n}/),
  src.match(/const AREA_POZEMEK[\s\S]*?\nfunction parseAreaPopis[\s\S]*?\n  return null;\n}/),
];
pravda('čtení výměry se dá v robotovi najít a spustit', kusy.every(Boolean),
  'parseArea nebo parseAreaPopis ve scripts/fetch-opportunities.mjs nejsou — přejmenovaly se?');
if (!kusy.every(Boolean)) hotovo();
const F = new Function(kusy.map((k) => k[0]).join('\n') + '; return { parseArea, parseAreaPopis };')();

/* Názvy opsané ze skutečného výstupu Apify (běh 42252438914): tohle
   jsou doopravdy inzeráty, které na web poslaly 44 bytů jako pozemky. */
const NAZVY = [
  ['Prodej bytu 2+1 111 m²', 111],
  ['Prodej bytu 3+1 105 m²', 105],
  ['Prodej bytu 2+1 51 m²', 51],
  ['Prodej bytu 4+kk 190 m²', 190],
  ['Prodej chaty 1+1 35 m²', 35],
];
for (const [nazev, cekam] of NAZVY) {
  pravda(`z názvu „${nazev}" vyjde ${cekam} m²`, F.parseArea(nazev) === cekam,
    `vyšlo ${F.parseArea(nazev)} — číslo se slepilo s počtem pokojů`);
}
/* A co se slepit NESMÍ přestat: oddělovač tisíců. */
const TISICE = [
  ['Prodej pozemku 1 250 m2, Benešov', 1250],
  ['Prodej pozemku 54 930 m²', 54930],
  ['pozemek 1.500 m²', 1500],
  ['Prodej pozemku 12355 m²', 12355],
];
for (const [nazev, cekam] of TISICE) {
  pravda(`oddělovač tisíců drží: „${nazev}" → ${cekam} m²`, F.parseArea(nazev) === cekam,
    `vyšlo ${F.parseArea(nazev)}`);
}
pravda('mezera, za kterou nejsou tři čislice, oddělovač tisíců není',
  F.parseArea('Prodej 12 34 m²') === 34, String(F.parseArea('Prodej 12 34 m²')));
pravda('v POPISU se bere výměra pozemku, ne podlahová plocha bytu před ní',
  F.parseAreaPopis('Byt 2+1 51 m² v domě, k němu pozemek o výměře 800 m².') === 800,
  String(F.parseAreaPopis('Byt 2+1 51 m² v domě, k němu pozemek o výměře 800 m².')));
pravda('čtečka cizích výpisů (cteni-zdroje) se taky neslepí',
  vymeraZTextu('Byt 2+1 51 m²') === 51, String(vymeraZTextu('Byt 2+1 51 m²')));
pravda('a nelepí ani u hektarů',
  vymeraZTextu('Pozemek 3+1 1,5 ha') === 15000, String(vymeraZTextu('Pozemek 3+1 1,5 ha')));
const PARCELNI = 'Prodej: p.č. 123/4, byt 2+1 111 m²';
pravda('parcelní číslo z textu: výměra za počtem pokojů se přečte správně, a tak se číslo najde',
  najdi(PARCELNI, { area: 111 }).cislo === '123/4', JSON.stringify(najdi(PARCELNI, { area: 111 })));

/* ---------- 2) tvar v celé čtecí vrstvě ---------- */
const CTECI = [
  'scripts/fetch-opportunities.mjs',
  'scripts/cteni-zdroje.mjs',
  'scripts/cti-nabidky-statu.mjs',
  'scripts/cti-uzsvm.mjs',
  'scripts/parcely-z-textu.mjs',
  'scripts/predpisy-zdroju.mjs',
  'scripts/nalezce.mjs',
];
pravda('čtecí vrstva je na svém místě', CTECI.every((f) => existsSync(path.join(KOREN, f))),
  'chybí: ' + CTECI.filter((f) => !existsSync(path.join(KOREN, f))).join(', '));
const nalezeno = [];
for (const f of CTECI) {
  const p = path.join(KOREN, f);
  if (!existsSync(p)) continue;
  for (const m of mistaVymer(bezKomentaruARetezcu(readFileSync(p, 'utf8')))) {
    nalezeno.push({ ...m, soubor: f });
  }
}
const vadna = nalezeno.filter((m) => !m.pocitadlo && !m.uSlova);
pravda('žádné místo nečte výměru třídou, která drží čislici i mezeru',
  vadna.length === 0,
  vadna.map((m) => `${m.soubor}:${m.radek}  ${m.trida}  …${m.pred.slice(-40).trim()}`).join('\n      '));
/* Hlídač, který nic nenajde, nic nehlídá: ať je vidět, že síť měří. */
pravda('síť má co měřit — nějaká podezřelá místa v kódu jsou (a jsou obhájená)',
  nalezeno.length > 0, 'žádné místo se nenašlo: přestal vzorec hledat?');
pravda('mezi obhájenými je počítadlo i vazba na slovo „výměra"',
  nalezeno.some((m) => m.pocitadlo) && nalezeno.some((m) => m.uSlova),
  'obhájená místa: ' + nalezeno.map((m) => `${m.soubor}:${m.radek} ${m.pocitadlo ? 'počítadlo' : ''}${m.uSlova ? 'u slova' : ''}`).join(', '));
zpravy.push(`      (podezřelých míst v čtecí vrstvě: ${nalezeno.length}, z toho počítadel ${nalezeno.filter((m) => m.pocitadlo).length}, u slova ${nalezeno.filter((m) => m.uSlova && !m.pocitadlo).length})`);

/* ---------- 3) síť sama: pozná vadu a nechá být dobrý tvar ---------- */
const VADNE = [
  "const V = /([\\d][\\d\\s.]*)\\s*m²/i;",
  "const V = /(\\d[\\d\\s\\u00a0]*)\\s*m(?:2|²)/i;",
  "const V = /([0-9][0-9\\s ]{0,8})\\s*m\\s*2/i;",
  "const V = /([\\d][\\d\\s.,]*)\\s*ha/i;",
];
for (const vzor of VADNE) {
  const m = mistaVymer(vzor);
  pravda('rozpozná vadu: ' + vzor.slice(10, 48), m.length === 1 && !m[0].pocitadlo && !m[0].uSlova,
    JSON.stringify(m.map((x) => ({ t: x.trida, p: x.pocitadlo, u: x.uSlova }))));
}
const DOBRE = [
  "const V = /(?<![\\d+])(\\d{1,3}(?:[\\s.]\\d{3})*|\\d+)\\s*m(?:2|²)/i;",
  "const V = /(?<![\\d+])((?:\\d{1,3}(?:[\\s\\u00a0]\\d{3})*|\\d+)(?:[.,]\\d+)?)\\s*ha\\b/i;",
];
for (const vzor of DOBRE) {
  pravda('dobrý tvar nehlásí: ' + vzor.slice(10, 48), mistaVymer(vzor).length === 0,
    JSON.stringify(mistaVymer(vzor)));
}
pravda('vazbu na slovo „výměře" uzná za obhajobu',
  (() => { const m = mistaVymer("const V = /o\\s*v[ýy]m[ěe]ře\\s*([\\d\\s]+)\\s*m²/i;"); return m.length === 1 && m[0].uSlova; })(),
  JSON.stringify(mistaVymer("const V = /o\\s*v[ýy]m[ěe]ře\\s*([\\d\\s]+)\\s*m²/i;")));
pravda('počítadlo bez závorky uzná za obhajobu',
  (() => { const m = mistaVymer("const n = (t.match(/\\d[\\d\\s.,]*\\s*(?:m²|m2|ha)\\b/gi) || []).length;"); return m.length === 1 && m[0].pocitadlo; })(),
  JSON.stringify(mistaVymer("const n = (t.match(/\\d[\\d\\s.,]*\\s*(?:m²|m2|ha)\\b/gi) || []).length;")));
pravda('„120 m²" v komentáři ani v řetězci se za vzorec nepočítá',
  mistaVymer(bezKomentaruARetezcu("/* vzor /([\\d][\\d\\s]*)\\s*m²/ je vadný */\nconst s = 'plocha [\\d\\s] m²';")).length === 0,
  JSON.stringify(mistaVymer(bezKomentaruARetezcu("/* vzor /([\\d][\\d\\s]*)\\s*m²/ */\nconst s = 'plocha [\\d\\s] m²';"))));

hotovo();
