// Test: každá barva/míra, na kterou se styl odvolává, je někde určená.
//
// Spuštění: node scripts/test-tokeny.mjs   (nepotřebuje prohlížeč ani síť)
//
// PROČ. `var(--neco)` bez záložní hodnoty, kde `--neco` nikdo nedefinoval,
// prohlížeč neohlásí ani nepřeskočí jen tu jednu hodnotu — zneplatní
// CELOU vlastnost. Napsat `border-radius:var(--r-karta)` a token zapomenout
// tedy neznamená „zaoblení bude výchozí", ale „zaoblení tam nebude" —
// a nic se nerozsvítí, protože stránka se vykreslí dál.
//
// Přišlo se na to takhle: při stavbě stránky s podkladem pro smlouvu
// jsem si vymyslel --r-karta, --r-mala a --stin-karta, které v paletě
// nikdy nebyly. Karty by byly bez zaoblení i bez stínu a vypadalo by
// to jako nedodělaný návrh, ne jako chyba v jednom slově.
//
// VÝJIMKY SE NEVĚŘÍ NA SLOVO. Tři tokeny se opravdu nedefinují ve
// stylopisu, protože je nastavuje skript do atributu style (barva druhu
// pozemku, barva shluku, šířka pruhu v animaci). Každá taková výjimka
// musí být DOLOŽENÁ: zkouška najde místo, které token opravdu nastavuje.
// Bez toho by se seznam výjimek stal smetištěm pro zapomenuté tokeny.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
let ok = 0, chyb = 0; const zpravy = [];
function pravda(popis, v, proc) {
  if (v) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* KOMENTÁŘE SE MUSÍ VYHODIT PŘED HLEDÁNÍM, A TOHLE JE TO PODSTATNÉ.
   Napsal jsem tuhle zkoušku bez toho a hned mi nahlásila --text-onlight
   jako „určený" token — jenže ten se ve stylopisu vyskytuje jedině ve
   vysvětlivce, která popisuje, že byl zrušen. Hledání v komentářích
   by tedy udělalo pravý opak toho, k čemu zkouška je: token zmíněný
   ve vysvětlivce by umlčel hlášení o tom, že chybí. */
const STYL_SUROVY = readFileSync(path.join(ROOT, 'css', 'styles.css'), 'utf8');
const STYL = STYL_SUROVY.replace(/\/\*[\s\S]*?\*\//g, ' ');

/* Definice: `--jmeno:` kdekoli (v :root, v tmavém režimu, v pravidle). */
const urcene = new Set([...STYL.matchAll(/(--[A-Za-z0-9_-]+)\s*:/g)].map((m) => m[1]));
/* Použití BEZ záložní hodnoty. S `var(--x, 10px)` se nic nestane, i když
   token chybí, takže se nekontroluje. */
const pouzite = [...STYL.matchAll(/var\(\s*(--[A-Za-z0-9_-]+)\s*\)/g)].map((m) => m[1]);

/* PŘEDPOKLADY. Kdyby se rozbila jedna z těch dvou regulárek, seznam by
   vyšel prázdný a „nic nechybí" by byla pravda o ničem. */
pravda(`tokeny se ve stylu opravdu našly (${urcene.size} určených)`, urcene.size >= 60,
  'nalezeno jen ' + urcene.size);
pravda(`a odvolávky taky (${new Set(pouzite).size} různých)`, new Set(pouzite).size >= 50,
  'nalezeno jen ' + new Set(pouzite).size);

/* Tokeny, které stylopis záměrně nedefinuje, protože je nastavuje kód
   do atributu style. Ke každému je napsané, kde se to děje — a zkouška
   si to ověří, takže tahle tabulka nemůže zestárnout nepozorovaně. */
const ZJS = {
  '--c-druh': 'barva druhu pozemku na odznaku nabídky',
  '--sh': 'barva shluku na mapě',
  '--w': 'šířka pruhu v animaci najetí',
};
const ZDROJE = [];
for (const d of ['js', '.']) {
  const kde = path.join(ROOT, d);
  for (const f of readdirSync(kde)) {
    if (!/\.(js|html)$/.test(f)) continue;
    if (/^pozemek-|^pozemky-okres-|-kraj\.html$/.test(f)) continue;   // generované kopie
    ZDROJE.push(readFileSync(path.join(kde, f), 'utf8'));
  }
}
pravda(`je v čem hledat nastavení z kódu (${ZDROJE.length} souborů)`, ZDROJE.length >= 40,
  'jen ' + ZDROJE.length + ' souborů');

const nedolozene = Object.keys(ZJS).filter((t) =>
  !ZDROJE.some((s) => s.includes(t + ':') && /style/.test(s)));
pravda('každá výjimka je doložená místem, které ji nastavuje',
  nedolozene.length === 0,
  'bez nalezeného nastavení: ' + nedolozene.join(', ')
  + ' — pokud už se nenastavuje, patří ze seznamu výjimek ven');

const chybi = [...new Set(pouzite)].filter((t) => !urcene.has(t) && !(t in ZJS));
pravda('každý token, na který se styl odvolává, je určený', chybi.length === 0,
  chybi.map((t) => t + ' (×' + pouzite.filter((x) => x === t).length + ')').join(', '));

/* A obráceně: token určený a nikde nepoužitý je mrtvý řádek v paletě.
   Není to chyba vzhledu, ale mate při každé další úpravě — člověk ladí
   barvu, která se nikde neprojeví. Hlásí se, ale nepadá se na tom. */
const JEN_PRO_REZIM = /^--(e[0-9]|r-(xs|sm|md|lg|pill))$/;   // stavební kameny palety
/* Token může být „nepoužitý ve stylopisu" a přesto živý: skripty si
   některé barvy čtou (tokenBarva) nebo je vpisují do atributu style.
   Kdo se objeví v kódu stránek, mrtvý není. */
const mrtve = [...urcene].filter((t) =>
  !STYL.includes('var(' + t + ')') && !STYL.includes('var(' + t + ',')
  && !JEN_PRO_REZIM.test(t) && !ZDROJE.some((s) => s.includes(t)));
zpravy.push('  · určených a nikde nepoužitých: ' + (mrtve.length || 0)
  + (mrtve.length ? ' (' + mrtve.slice(0, 8).join(', ') + ')' : ''));

console.log('\nTokeny stylu (barvy, míry, stíny)');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  for (const z of zpravy.filter((x) => x.indexOf('✕') >= 0).slice(0, 8)) {
    console.log('::error::Tokeny: ' + z.replace(/\s+/g, ' ').replace(/^ *✕ */, '').trim());
  }
  console.log('::error::Tokeny: ' + chyb + ' kontrol neprošlo.');
  process.exit(1);
}
process.exit(0);
