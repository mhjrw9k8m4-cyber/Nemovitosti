/* Doběhne robot dat? (bez sítě, v pískovišti)
   ==================================================================
   Spuštění: node scripts/test-robot-dojede.mjs   (bez prohlížeče)

   PROČ TENHLE SOUBOR VZNIKL. 3. 11. padal noční robot dat na
   `ReferenceError: Cannot access 'dnesISO' before initialization`.
   Nabídky se přestaly obnovovat, web ukazoval stará data — a rychlá
   sada 139 kontrol byla přitom zelená. Důvod: ze 2 958 řádků
   fetch-opportunities.mjs měly zkoušky každou JEDNOTLIVOU funkci,
   ale `main()`, která je skládá dohromady, NIKDO nikdy nespustil.
   Vada byla v tom skládání: deklarace data stála o 280 řádků níž, než
   kde se jí poprvé použilo (mrtvá zóna `const`).

   CO TEDY MĚŘÍ TAHLE ZKOUŠKA. Pustí celý robot NAOSTRO, ale do
   pískoviště a s podstrčenou sítí, takže nic nestahuje a do
   repozitáře nepíše. Tomu, co se naměří, se nedá podstrčením uvěřit
   víc, než kolik je v tom pravdy: běží opravdový `main()`.

   STATICKÁ CESTA BYLA ZMĚŘENA A ZAHOZENA. Nejdřív jsem zkusil vadu
   hledat čtením kódu — hledat jméno použité výš, než je deklarované.
   Na repozitáři to dalo 22 nálezů, z nichž byl pravdivý jeden;
   zbytek byly proměnné z vnořených bloků. Hlídač, který má 21 lží na
   jednu pravdu, nehlídá, jen otravuje. Proto se běží naostro.

   ŽÁDNÝ ZDROJ NEODPOVÍ — a to je v pořádku. Podstrčená síť vrací
   prázdné pole, takže všech pět zdrojů skončí s nulou. Tím se projde
   DRŽENÍ NABÍDEK (§220) i pojistka „ponechávám stávající soubor" a
   běh skončí nulou. To je LEGITIMNÍ cesta, ne pád — a vede přes to
   místo, kde robot 3. 11. umřel (držení se volá dřív než ta
   pojistka). Prokázáno sabotáží: s deklarací vrácenou zpět dolů
   zkouška spadne na tom samém ReferenceError, který hlásilo Actions.
   ================================================================== */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { pricinaChyb } from './chyby-hlaska.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* Co robot ke svému běhu potřebuje mít po ruce. Kdyby přibylo něco
   dalšího, zkouška spadne na ENOENT — a to je správně: ať je vidět,
   že se robotu rozšířila vstupní plocha. */
const SLOZKY = ['scripts', 'js', 'data', 'css', 'vendor'];
const PISEK = fs.mkdtempSync(path.join(os.tmpdir(), 'robot-dojede-'));
let vysledek = { kod: null, vystup: '' };
try {
  for (const s of SLOZKY) {
    const z = path.join(KOREN, s);
    if (fs.existsSync(z)) fs.cpSync(z, path.join(PISEK, s), { recursive: true });
  }
  /* PODSTRČENÁ SÍŤ. Prázdné pole je odpověď, kterou unese každý z pěti
     zdrojů: JSON ji přečte jako „nic", HTML v ní nenajde inzerát.
     Tvar je opravdový `Response`, tedy `text()` je FUNKCE (§337). */
  fs.writeFileSync(path.join(PISEK, 'sit-nanic.mjs'),
    'const telo = JSON.stringify([]);\n'
    + 'globalThis.fetch = async () => new Response(telo,'
    + " { status: 200, headers: { 'content-type': 'application/json' } });\n");
  const zacatek = Date.now();
  /* spawnSync, NE execFileSync: ten při úspěšném běhu vrací jen stdout,
     takže by hláška z `console.error` propadla — a „Chyba při sběru dat"
     se vypisuje právě tam. Hlídač by měl slepé místo přesně na té
     hlášce, kterou hledá. */
  const beh = spawnSync(process.execPath,
    ['--import', `file://${path.join(PISEK, 'sit-nanic.mjs')}`, 'scripts/fetch-opportunities.mjs'],
    { cwd: PISEK, encoding: 'utf8', timeout: 600000 });
  vysledek = {
    kod: beh.status === null ? `bez kódu (${beh.signal || beh.error})` : beh.status,
    vystup: `${beh.stdout || ''}${beh.stderr || ''}`,
    ms: Date.now() - zacatek,
  };

  /* 1. PÁD V NAŠEM KÓDU. Tahle jména chyb znamenají, že se robot
        rozsypal na sobě samém, ne na cizím webu. */
  const PADY = ['ReferenceError', 'TypeError', 'SyntaxError', 'RangeError',
    'Cannot access', 'is not a function', 'is not defined', 'Chyba při sběru dat'];
  const nalezene = PADY.filter((p) => vysledek.vystup.includes(p));
  pravda('robot dat doběhne bez pádu ve vlastním kódu',
    nalezene.length === 0,
    `našlo se: ${nalezene.join(', ')} — výpis: `
    + (vysledek.vystup.split('\n').filter((r) => nalezene.some((p) => r.includes(p)))[0] || '').slice(0, 200));

  /* 2. DOŠEL AŽ ZA DRŽENÍ NABÍDEK. Bez tohohle by stačilo, aby robot
        spadl tiše hned na začátku, a kontrola 1 by byla zelená. */
  pravda('běh došel až za držení nabídek vypadlých zdrojů',
    vysledek.vystup.includes('Žádný zdroj zatím nevrací data'),
    'ta hláška stojí ZA voláním podrzNabidkyVypadlych — chybí-li, robot'
    + ' se zastavil dřív, než se k opravenému místu dostal; výpis končí: '
    + vysledek.vystup.trim().split('\n').slice(-2).join(' | ').slice(0, 200));

  /* 3. Výpadek všech zdrojů NENÍ pád. Držení nabídek (§220) má robot
        dovést do konce s nulou, ne ho shodit. */
  pravda('výpadek všech zdrojů skončí nulou, ne chybovým kódem',
    vysledek.kod === 0, `návratový kód ${vysledek.kod}`);

  zpravy.push(`  · běh trval ${(vysledek.ms / 1000).toFixed(1)} s`);
} finally {
  try { fs.rmSync(PISEK, { recursive: true, force: true }); } catch (e) { /* pískoviště v /tmp zmizí samo */ }
}

console.log('\nRobot dat doběhne (bez sítě, v pískovišti)');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.error(`::error::Robot dat: ${chyb} kontrol neprošlo.${pricinaChyb(zpravy)}`); process.exit(1); }
process.exit(0);
