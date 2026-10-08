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

/* Kolik změn ceny musí být po kupě, aby se z nich vypsal medián.
   Pod to je to jednotlivý případ, ne vlastnost trhu: u max 92,8%
   slevy jde o špatně načtenou cenu, a tři takové uprostřed deseti
   případů medián přetočí. */
export const MIN_ZMEN = 30;

/**
 * ZMĚNY CENY — kdo zlevnil, o kolik a po kolika dnech.
 *
 * Archiv při změně ceny uzavře období se STAROU cenou a nabídka běží
 * dál s novou. Novou cenu tedy nemá ten řádek, ale ten NÁSLEDUJÍCÍ —
 * a u poslední změny ji drží živý stav. Kdo to spojí špatně, dostane
 * procenta spočítaná ze dvou různých pozemků.
 *
 * Vrací se i zdražení, protože bez nich by „trh zlevňuje" byla
 * polovina pravdy.
 */
export function zmenyCen(uzavrene, stav) {
  const zive = (stav && stav.nabidky) || {};
  const podle = new Map();
  for (const r of uzavrene) {
    if (!podle.has(r.k)) podle.set(r.k, []);
    podle.get(r.k).push(r);
  }
  const zlevneni = [], zdrazeni = [];
  for (const [k, rs] of podle) {
    rs.sort((a, b) => (a.od === b.od ? String(a.do).localeCompare(String(b.do)) : String(a.od).localeCompare(String(b.od))));
    for (let i = 0; i < rs.length; i++) {
      const r = rs[i];
      if (r.proc !== 'cena') continue;
      const nova = i + 1 < rs.length ? rs[i + 1].c : (zive[k] || {}).c;
      if (!(r.c > 0) || !(nova > 0) || nova === r.c) continue;
      const z = {
        k, o: r.o || '', dr: r.dr || '', stara: r.c, nova,
        procent: Math.round((100 * Math.abs(nova - r.c)) / r.c),
        dni: dny(r.od, r.do),
      };
      (nova < r.c ? zlevneni : zdrazeni).push(z);
    }
  }
  return { zlevneni, zdrazeni };
}

function prostredni(cisla) {
  if (!cisla.length) return null;
  const d = cisla.slice().sort((a, b) => a - b);
  return d[Math.floor(d.length / 2)];
}

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

  /* ZMĚNY CENY. Počítají se ze všech období, ne jen z pozorovaných:
     u zlevnění nejde o to, kdy se nabídka objevila, ale že jsme tu
     změnu viděli — a tu jsme viděli celou. */
  const zm = zmenyCen(uzavrene, stav);
  const zlevnilyKlice = new Set(zm.zlevneni.map((x) => x.k));
  const dostZmen = zm.zlevneni.length >= MIN_ZMEN;
  const okresy = new Map();
  for (const z of zm.zlevneni) if (z.o) okresy.set(z.o, (okresy.get(z.o) || 0) + 1);

  return {
    okno: { od: zacatek, do: dnes, dni: oknoDni },
    sledovano: { pozorovanych: pozorovane.length, zivych: zive.length, uzavrenych: uzavrene.length },
    krivka,
    median,                       // null = okno na něj zatím nestačí
    medianProc: median === null
      ? `okno má ${oknoDni} dní a skončilo jen ${skoncilo} z ${pozorovane.length} pozorovaných nabídek — medián leží za hranicí pozorování a nedá se spočítat`
      : null,
    zlevneni: {
      pocet: zm.zlevneni.length,
      nabidek: zlevnilyKlice.size,
      zdrazeni: zm.zdrazeni.length,
      /* null = případů je málo, medián by byl náhoda */
      medianSleva: dostZmen ? prostredni(zm.zlevneni.map((x) => x.procent)) : null,
      medianDni: dostZmen ? prostredni(zm.zlevneni.map((x) => x.dni)) : null,
      okresy: [...okresy].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'cs')).slice(0, 5),
    },
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
  const z = s.zlevneni;
  console.log(`\nZměny ceny: ${z.pocet}× zlevnění u ${z.nabidek} nabídek, ${z.zdrazeni}× zdražení`);
  console.log(z.medianSleva === null
    ? `  medián slevy: NELZE, je to jen ${z.pocet} případů (potřeba ${MIN_ZMEN})`
    : `  medián slevy ${z.medianSleva} % po ${z.medianDni} dnech na trhu`);
  console.log('  nejčastěji: ' + (z.okresy.map(([o, n]) => `${o} ${n}×`).join(' · ') || '—') + '\n');
}
