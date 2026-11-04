#!/usr/bin/env node
/* ZDROJ, KTERÝ JE TIŠE ROZBITÝ, SE MUSÍ OZVAT
   ==================================================================
   Spuštění: node scripts/hlidka-zdroju.mjs

   NALEZENO 3. 11. ČTENÍM KÓDU, ne pádem. Robot dat skončí chybou jen
   tehdy, když spadne `main()`. Zdroj, který je rozbitý a ani druhá
   cesta ho nezachrání, se obslouží „hezky": nabídky se podrží (§220),
   do logu jde `::error::` — a běh je ZELENÝ. Takže `if: failure()`
   nevystřelí, žádný úkol se nezaloží, a protože nabídky na webu dál
   jsou, nevypadá nic špatně. Zdroj může být tiše rozbitý týdny.
   Je to táž rodina vad jako §356: nic nespadne, jen se tiše lže.

   PROČ SAMOSTATNÝ KROK, A AŽ ZA COMMITEM. Kdyby na tohle skončil
   chybou krok „Stáhnout data", GitHub by přeskočil všechno za ním —
   tedy i commit. Den, kdy se zdroj pokazí, by byl i dnem, kdy se
   zahodí všechno, co se stáhnout PODAŘILO, a kdy se nezapíše ani to
   počítadlo, podle kterého se příště pozná, že je to už potřetí.
   Hlídka proto běží jako poslední krok: data jsou v té chvíli
   uložená a `if: failure()` pak založí úkol s diagnózou.

   MEZ JE 3 BĚHY V ŘADĚ. Robot jede 4× denně, takže je to necelý den.
   Jeden výpadek je normální provoz cizího webu; tři po sobě ne.   */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { BEHU_NEZ_SE_OZVEME, dlouhoMimo, kOhlaseni, dalsiMeznik } from './fetch-opportunities.mjs';

const KOREN = join(dirname(fileURLToPath(import.meta.url)), '..');
const HIST = join(KOREN, 'data', 'zdroje-historie.json');

export function hlaseni(nalez, mez = BEHU_NEZ_SE_OZVEME) {
  const radky = nalez.map((z) => `  • ${z.nazev}: ${z.behu}. běh v řadě mimo pořádek`
    + ` (stav „${z.stav}", od ${z.od})${z.duvod ? ' — ' + z.duvod : ''}`);
  return `Zdroj mimo pořádek nejméně ${mez}× v řadě:\n${radky.join('\n')}`;
}

function main() {
  let historie = null;
  try { historie = JSON.parse(readFileSync(HIST, 'utf8')); } catch { historie = null; }
  if (!historie) {
    console.log('Historie zdrojů zatím není — hlídka nemá co měřit.');
    return;
  }
  /* „NIC JSEM NENAŠEL" A „VŠECHNO JE V POŘÁDKU" NEJSOU TOTÉŽ.
     Když počítadlo v souboru vůbec není, robot ho ještě nikdy
     nezapsal (stará verze historie) — a hlásit z toho, že jsou
     zdroje v pořádku, by bylo tvrzení bez měření. Přesně ta vada,
     kterou tahle hlídka vznikla hlídat. */
  if (!historie.mimoProvoz) {
    console.log('Hlídka zdrojů: počítadlo v historii zatím není'
      + ` (verze ${historie.verze == null ? '?' : historie.verze}).`
      + ' Zapíše ho první běh robota — do té doby hlídka nic netvrdí.');
    return;
  }
  const mimo = historie.mimoProvoz;
  const vsichni = Object.entries(mimo);
  /* Ozve se jen na mezníku (3., 6., 12., 24. běh v řadě). Mezi nimi se
     stav VYPÍŠE, ale běh nekončí červeně — viz jeMeznik(). */
  const prekrocili = dlouhoMimo(mimo);
  const nalez = kOhlaseni(mimo);
  if (!nalez.length && prekrocili.length) {
    for (const p of prekrocili) {
      console.log(`Hlídka zdrojů: ${p.nazev} je mimo pořádek ${p.behu}. běh v řadě`
        + ` (stav „${p.stav}", od ${p.od}). Ohlášeno to bylo při ${BEHU_NEZ_SE_OZVEME}. běhu;`
        + ` znovu se to připomene při ${dalsiMeznik(p.behu)}. — denně červeně ze stejného`
        + ' důvodu by se hlídka přestala čist.');
    }
    return;
  }
  if (!nalez.length) {
    console.log(vsichni.length
      ? `Hlídka zdrojů: nikdo není mimo pořádek ${BEHU_NEZ_SE_OZVEME}× v řadě.`
        + ` Sledovaní: ${vsichni.map(([j, d]) => `${j} (${d.behu}×)`).join(', ')}.`
      : 'Hlídka zdrojů: všechny zdroje odpověděly, nikdo není mimo pořádek.');
    return;
  }
  /* HLÁSÍ SE NAHLAS A BĚH KONČÍ ČERVENĚ. Tohle je celý smysl: bez
     červené se nezaloží úkol a nikdo se to nedozví. */
  console.error('::error::' + hlaseni(nalez).replace(/\n/g, ' '));
  console.error('');
  console.error(hlaseni(nalez));
  console.error('');
  console.error('Co s tím: podívat se, jestli ten web změnil podobu (pak je to na');
  console.error('stahovač), nebo jestli nás začal zakazovat (pak je to rozhodnutí');
  console.error('jeho, a zdroj se vypne). Nabídky se zatím drží z minulého běhu');
  console.error('(§220), takže web nic neztratil — ale nové už z toho zdroje nejdou.');
  process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) main();
