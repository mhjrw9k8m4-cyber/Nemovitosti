/* Test: rychlý výběr (js/rychlovyber.js).
 *
 * Spuštění: node scripts/test-rychlovyber.mjs
 *
 * Třídění po jedné kartě je rychlé — a rychlost je přesně to, co z toho
 * dělá riziko. Tři věci se tu musí držet, jinak nástroj škodí:
 *
 *   · JDE TO VZÍT ZPĚT. Palec sklouzne a pozemek za 800 tisíc zmizí.
 *     Bez kroku zpět by rychlost byla past.
 *   · ROZHODNUTÉ SE NEVRACÍ. Kdo jednou řekl „tohle ne", nesmí to
 *     dostat znovu — jinak se protáčí dokola přes totéž.
 *   · MÁ TO KONEC. Balíček je konečný. Kdyby se karty sypaly donekonečna,
 *     byl by z nástroje na hledání pozemku hrací automat.
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const R = createRequire(import.meta.url)(path.join(ROOT, 'js', 'rychlovyber.js'));

let ok = 0, chyb = 0; const zpravy = [];
function je(popis, vyslo, cekano) {
  const a = JSON.stringify(vyslo), b = JSON.stringify(cekano);
  if (a === b) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}\n      čekáno ${b}, vyšlo ${a}`); }
}
const pravda = (popis, podm, detail) => je(popis, !!podm, true) || detail;

const P = (k) => ({ k: k, place: 'Obec ' + k });

/* --- 1) Balíček vynechá, co je rozhodnuté ------------------------- */
{
  const vse = [P(1), P(2), P(3), P(4), P(5)];
  const b = R.balicek(vse, { jeSkryty: (d) => d.k === 2, jeUlozeny: (d) => d.k === 4 });
  je('rozhodnuté pozemky se do balíčku nedávají', b.map((d) => d.k), [1, 3, 5]);
  je('a pořadí zůstává (doporučené má zůstat doporučené)', b[0].k, 1);
  /* Předpoklad: kdyby se nevynechávalo nic, kontrola výš by nic neměřila. */
  je('(a bez vynechání by jich bylo pět)', R.balicek(vse, {}).length, 5);
  je('prázdný vstup nerozbije nic', R.balicek(null, {}), []);
}

/* --- 1b) DÁVKA: konec musí být na dohled -------------------------
   Bez stropu měl balíček 1 955 karet a v hlavičce stálo „Zbývá 1 955".
   To není síto, to je běžící pás — a modul si přitom v hlavičce psal,
   že „má to konec". Konec po dvou tisících rozhodnutích žádný konec
   není. */
{
  const vse = [];
  for (let i = 1; i <= 55; i++) vse.push(P(i));
  const b = R.balicek(vse, {});
  je('balíček se nabízí po dávkách, ne celý najednou', b.length, R.DAVKA);
  je('a dávka je tak malá, aby se dala dojet', R.DAVKA <= 30, true);
  je('a bere se od začátku (doporučené první)', b[0].k, 1);
  je('kdo chce jinou dávku, řekne si o ni', R.balicek(vse, { davka: 3 }).map((d) => d.k), [1, 2, 3]);
  je('davka:0 znamená bez stropu (pro spočítání, kolik zbývá)',
    R.balicek(vse, { davka: 0 }).length, 55);
  je('nerozhodnutých se počítá všech, ne jen dávka', R.nerozhodnutych(vse, {}), 55);
  je('a rozhodnuté se do toho počtu nepletou',
    R.nerozhodnutych(vse, { jeSkryty: (d) => d.k <= 5 }), 50);

  const s = R.stav(b, R.nerozhodnutych(vse, {}));
  je('stav ví, kolikátá karta je na řadě', R.poradi(s), 1);
  je('a jak velká dávka je', R.delkaDavky(s), R.DAVKA);
  je('a kolik zbude, až se dojede', R.zbyvaPoDavce(s), 55 - R.DAVKA);
  R.rozhodni(s, R.VPRAVO);
  je('po rozhodnutí je na řadě druhá', R.poradi(s), 2);
  /* Předpoklad: kdyby se počet nerozhodnutých nepředal, konec dávky by
     tvrdil, že je hotovo všechno — a to by byla lež. */
  je('bez druhého parametru se zbytek nevymýšlí', R.zbyvaPoDavce(R.stav(b)), 0);
}

/* --- 2) Rozhodování ----------------------------------------------- */
{
  const s = R.stav([P(1), P(2), P(3)]);
  je('na začátku je první karta', R.aktualni(s).k, 1);
  je('a zbývají tři', R.zbyva(s), 3);
  je('doprava znamená uložit', R.rozhodni(s, R.VPRAVO), { akce: 'uloz', pozemek: { k: 1, place: 'Obec 1' } });
  je('a posune se na další', R.aktualni(s).k, 2);
  je('doleva znamená skrýt', R.rozhodni(s, R.VLEVO).akce, 'skryj');
  je('nesmyslný směr neudělá nic', R.rozhodni(s, 'nahoru'), null);
  je('a karta se tím neposune', R.aktualni(s).k, 3);
}

/* --- 3) KROK ZPĚT — bez něj je rychlost past ---------------------- */
{
  const s = R.stav([P(1), P(2), P(3)]);
  je('na začátku není co vracet', R.lzeZpet(s), false);
  je('vracet naprázdno nic nerozbije', R.zpet(s), null);
  R.rozhodni(s, R.VLEVO);                 // omylem skryju pozemek 1
  je('po rozhodnutí už vracet jde', R.lzeZpet(s), true);
  const v = R.zpet(s);
  je('zpět odvolá právě to skrytí', v, { akce: 'zrus-skryj', pozemek: { k: 1, place: 'Obec 1' } });
  je('a vrátí se NA TU KARTU, ať se dá rozhodnout jinak', R.aktualni(s).k, 1);
  je('a znovu už není co vracet', R.lzeZpet(s), false);
  // a dá se rozhodnout opačně
  je('a opačné rozhodnutí projde', R.rozhodni(s, R.VPRAVO).akce, 'uloz');
}

/* --- 4) Má to konec ----------------------------------------------- */
{
  const s = R.stav([P(1), P(2)]);
  R.rozhodni(s, R.VPRAVO); R.rozhodni(s, R.VLEVO);
  je('po posledním je balíček hotový', R.hotovo(s), true);
  je('a nic dalšího nenabídne', R.aktualni(s), null);
  je('další rozhodnutí už neudělá nic', R.rozhodni(s, R.VPRAVO), null);
  je('a zbývá nula', R.zbyva(s), 0);
  je('souhrn sedí', R.souhrn(s), { ulozeno: 1, skryto: 1, celkem: 2 });
}

/* --- 5) Prázdný balíček ------------------------------------------- */
{
  const s = R.stav([]);
  je('prázdný balíček je rovnou hotový', R.hotovo(s), true);
  je('a nic nenabízí', R.aktualni(s), null);
}

console.log(`\nRychlý výběr: ${ok + chyb} kontrol`);
console.log(zpravy.join('\n'));
if (chyb) { console.error(`\n::error::Rychlý výběr: ${chyb} kontrol neprošlo.`); process.exit(1); }
console.log(`\n${ok} v pořádku, 0 chyb\n`);
