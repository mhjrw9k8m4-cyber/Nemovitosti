#!/usr/bin/env node
/* CO SE DÁ Z ARCHIVU POCTIVĚ SPOČÍTAT — A CO NE
   ==================================================================
   Spuštění:  node scripts/archiv-statistiky.mjs

   PROČ TENHLE SOUBOR VZNIKL. V roadmapě stálo „doba na trhu (medián
   7 dnů u zmizelých)". To číslo je spočítané správně a přitom je
   hluboce zavádějící — a kdyby se dostalo na veřejnou stránku, byl by
   to nepravdivý údaj o trhu.

   PROČ JE ŠPATNĚ. Archiv pozoruje trh od 14. 9. 2026, tedy 24 dní.
   Za tu dobu zmizelo 782 nabídek a jejich medián je 7 dní. Jenže
   zároveň 1 949 nabídek na trhu POŘÁD JE — a 95 % z nich tam je déle
   než těch sedm dní. Medián „u zmizelých" tedy popisuje jen tu menšinu,
   která zmizela rychle, a mlčí o většině, která nezmizela. Skutečný
   medián doby na trhu je prokazatelně vyšší než 24 dní a z čtyřiadvaceti-
   denního okna se spočítat NEDÁ. Statistika tomu říká cenzurování
   zprava: delší případy ještě neskončily, takže ve vzorku chybí.

   CO SE SPOČÍTAT DÁ. Otočit otázku: místo „jak dlouho tu nabídka je"
   se ptát „kolik nabídek je po N dnech pryč". To jde, protože do
   každého takového podílu se počítají jen nabídky, které MĚLY ŠANCI
   být sledované celých N dní. Žádná se nevynechá kvůli tomu, že ještě
   trvá — buď se do kohorty vejde celá, nebo tam není.

   Výsledek (8. 10. 2026): do 7 dní je pryč 6 %, do 14 dní 11 %.
   To je úplně jiný obrázek než „medián 7 dnů" a je to ten pravdivý:
   pozemky se prodávají pomalu.

   TENHLE SOUBOR MEDIÁN DOBY NA TRHU NEVYDÁ, DOKUD NA NĚJ NEBUDE OKNO.
   Není to opomenutí, je to pravidlo: dokud je víc než polovina
   sledovaných nabídek pořád živá, medián neexistuje a každé číslo,
   které by se místo něj vypsalo, by lhalo.
   ================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ARCHIV = path.join(KOREN, 'data', 'archiv');

/** Dny mezi dvěma „YYYY-MM-DD". */
export function dny(od, do_) {
  return Math.round((Date.parse(do_ + 'T00:00:00Z') - Date.parse(od + 'T00:00:00Z')) / 86400000);
}

/* Kolik nabídek musí do kohorty spadnout, aby se podíl vůbec vypsal.
   Pod to je to šum: u 58 nabídek vyšlo „29 % do 21 dní", kdežto
   u 852 nabídek „6 % do 7 dní" — to první je jedna stará kohorta,
   ne vlastnost trhu. */
export const MIN_KOHORTA = 100;

/**
 * Poctivé statistiky z archivu.
 *   uzavrene — řádky z data/archiv/*.jsonl
 *   stav     — data/archiv/stav.json (živé nabídky)
 *   dnes     — „YYYY-MM-DD"
 */
export function statistiky(uzavrene, stav, dnes) {
  const zive = Object.values((stav && stav.nabidky) || {});
  const vsechnyOd = [...uzavrene.map((x) => x.od), ...zive.map((x) => x.od)].filter(Boolean).sort();
  const zacatek = vsechnyOd[0] || dnes;
  const oknoDni = dny(zacatek, dnes);

  /* Do kohort jdou JEN nabídky, u kterých jsme viděli, kdy se objevily.
     Ty, co tu byly před začátkem pozorování, mají `od` převzaté
     z first_seen zdroje — tomu datu se nedá věřit stejně a hlavně
     nevíme, co všechno zmizelo, než jsme se začali dívat. */
  const pozorovane = [
    ...uzavrene.filter((x) => x.proc === 'zmizela' && x.od > zacatek).map((x) => ({ od: x.od, konec: x.do })),
    ...zive.filter((x) => x.od > zacatek).map((x) => ({ od: x.od, konec: null })),
  ];

  const krivka = [];
  for (const n of [3, 7, 14, 21, 30, 60, 90]) {
    /* „Mohla být sledovaná n dní" = od jejího objevení uplynulo aspoň n dní. */
    const zpusobile = pozorovane.filter((x) => dny(x.od, dnes) >= n);
    if (zpusobile.length < MIN_KOHORTA) continue;
    const pryc = zpusobile.filter((x) => x.konec && dny(x.od, x.konec) <= n).length;
    krivka.push({ dni: n, zKolika: zpusobile.length, pryc, podil: Math.round((100 * pryc) / zpusobile.length) });
  }

  /* MEDIÁN DOBY NA TRHU — jen když na něj okno stačí.
     Podmínka: víc než polovina pozorovaných nabídek už skončila.
     Dokud ne, medián leží za hranicí okna a nedá se změřit. */
  const skoncilo = pozorovane.filter((x) => x.konec).length;
  let median = null;
  if (pozorovane.length >= MIN_KOHORTA && skoncilo > pozorovane.length / 2) {
    const d = pozorovane.filter((x) => x.konec).map((x) => dny(x.od, x.konec)).sort((a, b) => a - b);
    median = d[Math.floor(d.length / 2)];
  }

  const zlevneni = uzavrene.filter((x) => x.proc === 'cena');
  /* Podíl zlevnění se počítá ze STEJNÉ pozorované množiny jako křivka,
     ne ze všeho — jinak by se dělilo jablky a hruškami. */
  const zlevnilyKlice = new Set(zlevneni.map((x) => x.k));

  return {
    okno: { od: zacatek, do: dnes, dni: oknoDni },
    sledovano: { pozorovanych: pozorovane.length, zivych: zive.length, uzavrenych: uzavrene.length },
    krivka,
    median,                       // null = okno na něj zatím nestačí
    medianProc: median === null
      ? `okno má ${oknoDni} dní a skončilo jen ${skoncilo} z ${pozorovane.length} pozorovaných nabídek — medián leží za hranicí pozorování a nedá se spočítat`
      : null,
    zlevneni: { pocet: zlevneni.length, nabidek: zlevnilyKlice.size },
  };
}

export function nactiArchiv() {
  const uzavrene = [];
  if (!fs.existsSync(ARCHIV)) return { uzavrene, stav: { nabidky: {} } };
  for (const f of fs.readdirSync(ARCHIV).filter((x) => x.endsWith('.jsonl')).sort()) {
    for (const r of fs.readFileSync(path.join(ARCHIV, f), 'utf8').split('\n')) {
      if (!r.trim()) continue;
      try { uzavrene.push(JSON.parse(r)); } catch (e) { /* poškozený řádek se přeskočí */ }
    }
  }
  const sc = path.join(ARCHIV, 'stav.json');
  const stav = fs.existsSync(sc) ? JSON.parse(fs.readFileSync(sc, 'utf8')) : { nabidky: {} };
  return { uzavrene, stav };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { uzavrene, stav } = nactiArchiv();
  const s = statistiky(uzavrene, stav, stav.den || new Date().toISOString().slice(0, 10));
  console.log(`\nArchiv trhu — okno ${s.okno.od} → ${s.okno.do} (${s.okno.dni} dní)`);
  console.log('='.repeat(52));
  console.log(`sledovaných nabídek s pozorovaným začátkem: ${s.sledovano.pozorovanych}`);
  console.log(`živých dnes: ${s.sledovano.zivych} · uzavřených období: ${s.sledovano.uzavrenych}`);
  console.log('\nKolik nabídek je po N dnech pryč');
  if (!s.krivka.length) console.log('  zatím na to není dost dat');
  for (const k of s.krivka) {
    console.log(`  do ${String(k.dni).padStart(2)} dní  ${String(k.podil).padStart(3)} %   `
      + '█'.repeat(Math.max(1, Math.round(k.podil / 2))) + `   (${k.pryc} z ${k.zKolika})`);
  }
  console.log('\nMedián doby na trhu');
  console.log(s.median === null ? `  NELZE: ${s.medianProc}` : `  ${s.median} dní`);
  console.log(`\nZlevnění: ${s.zlevneni.pocet}× u ${s.zlevneni.nabidek} nabídek\n`);
}
