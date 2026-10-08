#!/usr/bin/env node
/* HISTORIE CENY JEDNÉ NABÍDKY — z archivu, ne z posledního běhu.
   ==================================================================
   Spuštění:  node scripts/cenova-historie.mjs        (výpis do terminálu)

   PROČ TENHLE SOUBOR VZNIKL. Web o změně ceny věděl jen z POSLEDNÍHO
   běhu robota: `cena_drive` a `cena_zmena` v datech má 21 nabídek
   z 2 004, protože se při každém běhu přepíšou. Archiv přitom ví
   o 127 zlevněních u 121 nabídek — sto nabídek, u kterých cena
   prokazatelně spadla, to na webu neukazovalo.

   A právě tohle je u pozemku ta nejcennější věta, jakou mu web může
   říct: „cena šla dolů z 450 000 na 399 000 dne 15. 9." je argument
   při smlouvání, a nikde jinde se nedočte.

   CO SE DÁ A NEDÁ TVRDIT O DATU, KDY SE NABÍDKA OBJEVILA. Pole
   `first_seen` má v datech každá nabídka, ale u 1 644 z 2 004 je
   v něm 19. 9. 2026 — den, kdy ho robot začal zapisovat, ne den, kdy
   pozemek šel do prodeje. „V nabídce od 19. 9." by tedy byla nepravda
   u 82 % pozemků. Proto se začátek hlásí JEN tam, kde jsme ho opravdu
   viděli, tedy kde nabídka vznikla až po začátku pozorování. U ostatních
   se mlčí; každým dnem jich je méně.

   O CENÁCH TO NEPLATÍ: změnu ceny jsme viděli celou, ať nabídka vznikla
   kdykoli. Proto historie ceny jde u všech, a začátek u menšiny.
   ================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { nactiArchiv, dny } from './archiv-statistiky.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Z archivu udělá historii ceny podle klíče pozemku (pkey, bez ceny).
 *
 * Vrací Map(klíč → {
 *   body: [{ d, c }]   dny, kdy která cena ZAČALA platit, odpředu
 *   od                 první známý den nabídky
 *   zacatekVidet       true = ten den jsme opravdu viděli (ne převzatý)
 *   zmizela            den, kdy nabídka zmizela ze zdroje, jinak null
 * })
 *
 * Archiv při změně ceny uzavře období se STAROU cenou a nabídka běží dál
 * s novou. Poslední cenu tedy nedrží žádný řádek, ale živý stav — a kdo
 * to spojí špatně, poslední zlevnění vůbec neuvidí.
 */
export function historiePodleKlice(uzavrene, stav) {
  const zive = (stav && stav.nabidky) || {};
  /* Začátek pozorování: nejstarší den, který archiv zná. Starší „od"
     být nemůže, takže co se mu rovná, jsme neviděli vzniknout. */
  const vsechnyOd = [...uzavrene.map((x) => x.od), ...Object.values(zive).map((x) => x.od)]
    .filter(Boolean).sort();
  const zacatek = vsechnyOd[0] || '';

  const podle = new Map();
  for (const r of uzavrene) {
    if (!podle.has(r.k)) podle.set(r.k, []);
    podle.get(r.k).push(r);
  }
  for (const k of Object.keys(zive)) if (!podle.has(k)) podle.set(k, []);

  const out = new Map();
  for (const [k, rs] of podle) {
    rs.sort((a, b) => (a.od === b.od
      ? String(a.do).localeCompare(String(b.do))
      : String(a.od).localeCompare(String(b.od))));
    const body = [];
    for (const r of rs) {
      if (!(r.c > 0) || !r.od) continue;
      /* Zmizení a opětovné objevení za TOUTÉŽ cenu není změna ceny.
         Bez tohohle by se v historii opakoval týž údaj dvakrát a
         vypadalo by to, že se něco dělo. */
      if (body.length && body[body.length - 1].c === r.c) continue;
      body.push({ d: r.od, c: r.c });
    }
    const z = zive[k];
    if (z && z.c > 0 && z.od && (!body.length || body[body.length - 1].c !== z.c)) {
      body.push({ d: z.od, c: Math.round(z.c) });
    }
    if (!body.length) continue;
    /* Zmizela? Jen když po ní nic živého není a poslední řádek to říká. */
    const posledni = rs.length ? rs[rs.length - 1] : null;
    const zmizela = (!z && posledni && posledni.proc === 'zmizela') ? posledni.do : null;
    out.set(k, {
      body,
      od: body[0].d,
      zacatekVidet: !!zacatek && body[0].d > zacatek,
      zmizela,
    });
  }
  return out;
}

/** Jen nabídky, u kterých se cena aspoň jednou změnila. */
export function jenZmeny(mapa) {
  const m = new Map();
  for (const [k, v] of mapa) if (v.body.length > 1) m.set(k, v);
  return m;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { uzavrene, stav } = nactiArchiv();
  const vse = historiePodleKlice(uzavrene, stav);
  const zmeny = jenZmeny(vse);
  const dnes = stav.den || new Date().toISOString().slice(0, 10);
  console.log(`\nHistorie ceny — ${vse.size} nabídek v archivu, u ${zmeny.size} se cena změnila`);
  console.log('='.repeat(62));
  const videt = [...vse.values()].filter((v) => v.zacatekVidet).length;
  console.log(`začátek nabídky jsme opravdu viděli u ${videt} z ${vse.size}`
    + ` (u ostatních je datum převzaté ze zdroje a neukazuje se)`);
  const serad = [...zmeny].sort((a, b) =>
    (b[1].body[0].c - b[1].body[b[1].body.length - 1].c) / b[1].body[0].c
    - (a[1].body[0].c - a[1].body[a[1].body.length - 1].c) / a[1].body[0].c);
  console.log('\nNejvětší poklesy:');
  for (const [k, v] of serad.slice(0, 8)) {
    const prvni = v.body[0], posl = v.body[v.body.length - 1];
    const pct = Math.round((100 * (prvni.c - posl.c)) / prvni.c);
    console.log(`  ${String(pct).padStart(3)} %  ${k.split('|').slice(0, 3).join(', ')}`);
    console.log('        ' + v.body.map((b) => `${b.d} ${b.c.toLocaleString('cs-CZ')}`).join('  →  ')
      + (v.zmizela ? `  →  zmizela ${v.zmizela}` : ''));
  }
  const delky = [...zmeny.values()].map((v) => v.body.length);
  console.log(`\nNejvíc změn u jedné nabídky: ${Math.max(...delky) - 1}`);
  const stare = [...vse.values()].filter((v) => v.zacatekVidet).map((v) => dny(v.od, dnes));
  if (stare.length) {
    stare.sort((a, b) => a - b);
    console.log(`U nabídek s viděným začátkem je medián ${stare[Math.floor(stare.length / 2)]} dní`
      + ` v nabídce (nejdéle ${stare[stare.length - 1]})\n`);
  }
}
