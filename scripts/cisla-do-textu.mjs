/* =====================================================================
   ČÍSLA V TEXTU SE NEPÍŠOU RUKOU, DOPLNÍ JE SESTAVENÍ.
   =====================================================================

   Lišta má počet nabídek odjakživa (scripts/hlavicka.mjs, poctyZDat).
   V TEXTU stránek ale žádné takové číslo nebylo — a je proč: ručně
   napsané „2 329 nabídek" je pravda jen do nejbližšího běhu robota,
   a pak je to na webu lež, které si nikdo nevšimne, protože tu větu
   už podruhé nikdo nečte.

   Stránka pro realitní kanceláře je první, která se bez čísel neobejde:
   kdo zvažuje, jestli sem dá své pozemky, se ptá „kolik toho máte"
   a „odkud to berete". Proto se čísla píšou jako prázdná značka

       <span data-pk-cislo="nabidky"></span>

   a tenhle krok do ní při sestavení vloží hodnotu z data/mapa.json —
   z TÉHOŽ souboru, ze kterého je má lišta, takže se obě čísla nemůžou
   rozejít.

   Co se umí doplnit:
     nabidky  — kolik nabídek je na webu, s českou sazbou tisíců
     okresy   — v kolika okresech nějaká je
     zdroje   — z kolika zdrojů se sbírá
     kdy      — kdy robot naposledy obešel zdroje („7. 11.")

   KDYŽ DATA CHYBĚJÍ (čerstvý klon), značka se nechá prázdná a stránka
   dál dává smysl — věty jsou psané tak, aby bez čísla nebyly rozbité.
   Tiché selhání je tu správně: web bez dat se sestavit musí. Naopak
   NEZNÁMÁ značka je vada a sestavení ji shodí: překlep v klíči by
   jinak zůstal na stránce jako prázdné místo uprostřed věty.
   ===================================================================== */

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ZNAME = ['nabidky', 'okresy', 'zdroje', 'kdy'];
/* A JEDNA ZNAČKA S PARAMETREM: `zdroj:Bezrealitky` doplní, kolik nabídek
   dnes nese právě ten zdroj. Vzniklo to proto, že úvodní stránka tvrdila
   „5 veřejných zdrojů" a vypisovala pět čipů, zatímco robot jich čte osm
   — tedy stránka si odporovala s vlastním pásem o kus výš (ten má 8
   z dat) a zároveň podhodnocovala to jediné, čím se web obhajuje.
   Seznam zdrojů se mění (ÚZSVM přibyl 6. 11.), takže psát počty rukou
   znamená, že jednou zestárnou — a zestárne to tiše. Proto se doplňují
   odsud, z týchž dat jako všechna ostatní čísla na webu.
   JMÉNO, KTERÉ V DATECH NENÍ, JE CHYBA, NE NULA. Kdyby se zdroj
   přejmenoval, tiše doplněná nula by na webu vypadala jako „ten zdroj
   dnes nic nepřinesl" — tedy nepravda, která se sama neukáže (§228). */
const PREDPONA_ZDROJ = 'zdroj:';

/* Česká sazba tisíců: 2 329 s nezlomitelnou mezerou. Totéž, co dělá
   hlavicka.mjs — schválně stejnou cestou, ať se čísla nerozejdou
   tvarem, když už se nerozejdou hodnotou. */
const sazba = (x) => String(x).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

function hodnoty() {
  try {
    const d = JSON.parse(readFileSync(path.join(KOREN, 'data', 'mapa.json'), 'utf8'));
    const o = Array.isArray(d.opportunities) ? d.opportunities : [];
    if (!o.length) return null;
    const okresy = new Set();
    const zdroje = new Set();
    for (const x of o) {
      if (x && x.okres) okresy.add(String(x.okres));
      if (x && x.zdroj) zdroje.add(String(x.zdroj));
    }
    const [, m, den] = String(d.updated || '').split('-');
    const poZdroji = new Map();
    for (const x of o) {
      if (!x || !x.zdroj) continue;
      const k = String(x.zdroj);
      poZdroji.set(k, (poZdroji.get(k) || 0) + 1);
    }
    const ven = {
      nabidky: sazba(o.length),
      okresy: sazba(okresy.size),
      zdroje: sazba(zdroje.size),
      kdy: (m && den) ? `${Number(den)}. ${Number(m)}.` : '',
    };
    for (const [kz, nz] of poZdroji) ven[PREDPONA_ZDROJ + kz] = sazba(nz);
    return ven;
  } catch (e) { return null; }
}

const H = hodnoty();
const ZNACKA = /(<span[^>]*\sdata-pk-cislo="([^"]+)"[^>]*>)([\s\S]*?)(<\/span>)/g;

let souboru = 0, doplneno = 0;
const neznama = new Set();

for (const jm of readdirSync(KOREN)) {
  if (!jm.endsWith('.html')) continue;
  const cesta = path.join(KOREN, jm);
  const puv = readFileSync(cesta, 'utf8');
  if (!puv.includes('data-pk-cislo=')) continue;
  let kolik = 0;
  const novy = puv.replace(ZNACKA, (cely, pred, klic, _vnitrek, za) => {
    const jeZdroj = klic.startsWith(PREDPONA_ZDROJ);
    if (!ZNAME.includes(klic) && !jeZdroj) { neznama.add(klic); return cely; }
    if (!H) return pred + za;                 // bez dat: značka zůstane prázdná
    /* Zdroj, který v datech není, se nedoplní nulou — to by byla tichá
       nepravda. Ozve se jako neznámá značka a sestavení skončí chybou. */
    if (jeZdroj && !(klic in H)) { neznama.add(klic); return cely; }
    kolik++;
    return pred + H[klic] + za;
  });
  if (novy !== puv) writeFileSync(cesta, novy);
  souboru++; doplneno += kolik;
}

if (neznama.size) {
  console.log('::error::Čísla do textu: neznámá značka data-pk-cislo: '
    + [...neznama].join(', ') + '. Známé: ' + ZNAME.join(', ')
    + ', a „' + PREDPONA_ZDROJ + '<jméno zdroje>" pro zdroj, který je v datech'
    + (H ? ': ' + Object.keys(H).filter((k) => k.startsWith(PREDPONA_ZDROJ))
      .map((k) => k.slice(PREDPONA_ZDROJ.length)).join(', ') : ''));
  process.exit(1);
}
console.log(`    ${doplneno} čísel doplněno z dat do ${souboru} stránek`
  + (H ? '' : ' (data/mapa.json chybí — značky zůstaly prázdné)'));
