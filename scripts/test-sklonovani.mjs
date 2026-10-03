/* Test: číslo a podstatné jméno se musí shodnout.
 *
 * Spuštění: node scripts/test-sklonovani.mjs
 *
 * PROČ. V odznaku hlídání stálo „1 nových". Čeština má tři tvary — 1,
 * 2–4, 5 a víc — a kdo je píše natvrdo, trefí se jen v jednom případě ze
 * tří. Web přitom funkci na to má (PKFeed.mnozne), jenže není vidět
 * odkud, takže si ji každý soubor obešel po svém: našlo se pět míst,
 * kde to bylo špatně („1 nových", „za 2 dní", „1 pozemky", „zbývá 2
 * dní", „1 nabídek").
 *
 * Je to drobnost, kterou ale čtenář pozná okamžitě — a web, který neumí
 * česky, vypadá jako strojový překlad. Proto se to hlídá.
 *
 * PRAVIDLO: kde se k číslu lepí tvar, který se ohýbá, musí být poblíž
 * vidět, že se podle počtu rozhoduje — větev (=== 1, < 5), nebo volání
 * mnozne()/cislovka()/tvar…(). Co to nesplňuje, musí být na seznamu
 * výjimek s důvodem. Žádná třetí možnost.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

let ok = 0, chyb = 0; const zpravy = [];
function pravda(popis, podm, detail) {
  if (podm) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${detail ? '\n      ' + detail : ''}`); }
}

/* Tvary, které se ohýbají. Hledá se připojení k výrazu: `+ ' dní'`. */
const TVARY = ['dní', 'dny', 'den', 'pozemků', 'pozemky', 'pozemek',
  'nabídek', 'nabídky', 'nabídka', 'nových', 'nové', 'nový',
  'zpráv', 'zprávy', 'zpráva', 'hlídání', 'dražeb', 'dražby', 'dražba'];
/* Důkaz, že se o počtu rozhoduje. Stačí poblíž. */
/* Důkazem je POROVNÁNÍ S ČÍSLEM nebo volání funkce na tvary — ne
   jakýkoli ternární operátor. Původně tu stálo i `\?\s*'`, čímž se za
   „rozhoduje se podle počtu" počítal každý ternár s textem poblíž, a
   pojistka propustila i `newN + ' nových'`. Ukázala to až sabotáž:
   vrácená chyba prošla. Takhle vágní kontrola je horší než žádná —
   tváří se, že se hlídá, a nehlídá. */
const VETVI = /===\s*1\b|==\s*1\b|<\s*5\b|>=\s*5\b|<=\s*4\b|mnozne\s*\(|cislovka\s*\(|tvar[A-ZČŘŠ]\w*\s*\(/;
/* Výjimky: místa, kde je pevný tvar správně, i s důvodem. */
const VYJIMKY = [
  { kde: 'DNI_KONCI', proc: 'DNI_KONCI je konstanta 14 — po „do" je genitiv vždycky správně' },
  { kde: 'tedy před ', proc: 'po „před" je sedmý pád „dny" správně pro jakýkoli počet — „před 2 dny" i „před 100 dny"' },
];

const SOUBORY = [];
for (const f of readdirSync(path.join(ROOT, 'js'))) if (f.endsWith('.js')) SOUBORY.push('js/' + f);
/* Jen ručně psané stránky. Vygenerované pozemek-*.html vznikají ze
   šablony, takže by se tatáž chyba hlásila dva tisíckrát. */
for (const f of readdirSync(ROOT)) {
  if (!f.endsWith('.html')) continue;
  if (/^pozemek-|^pozemky-okres-|^pozemky-kraj-/.test(f)) continue;
  SOUBORY.push(f);
}

const podezrele = [];
for (const rel of SOUBORY) {
  const zdroj = readFileSync(path.join(ROOT, rel), 'utf8');
  const radky = zdroj.split('\n');
  /* KOMENTÁŘE SE VYMAŽOU Z CELÉHO SOUBORU NAJEDNOU, ne až z okna.
     Okno o čtyřech řádcích totiž často obsahuje jen KONEC blokového
     komentáře, který začal výš — a ten se bez své první poloviny
     nerozpozná, takže v něm zůstala slova jako „tvarPozemku()" a
     propustila chybný řádek pod sebou. Zalomení se zachovají (komentář
     se nahradí mezerami), aby čísla řádků dál seděla. */
  const ciste = zdroj
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, ' '))
    .split('\n');
  radky.forEach((r, i) => {
    for (const t of TVARY) {
      if (r.indexOf(`+ ' ${t}'`) < 0 && r.indexOf(`+' ${t}'`) < 0) continue;
      /* Okolí: řádek sám a dva nad ním — větev bývá o kus výš.
         KOMENTÁŘE SE VYHAZUJÍ. Bez toho stačilo nad chybný řádek napsat
         „tvar podle počtu umí tvarPozemku()" a pojistka ho propustila,
         protože to jméno našla v textu. Zjistila to sabotáž: vrácená
         chyba prošla dvakrát po sobě. Kontrola, kterou umlčí komentář,
         je horší než žádná. */
      /* Spojuje se ZALOMENÍM, ne mezerou: bez konců řádků sežere
         odstraňovač řádkových komentářů („//…") všechno až do konce
         okna, a s tím i důkaz o dva řádky níž. Chytil to falešný poplach
         na DNI_KONCI. */
      const okoli = ciste.slice(Math.max(0, i - 2), i + 2).join('\n');
      if (VETVI.test(okoli)) return;
      if (VYJIMKY.some((v) => okoli.indexOf(v.kde) >= 0)) return;
      podezrele.push(`${rel}:${i + 1} „${t}" — ${r.trim().slice(0, 80)}`);
      return;
    }
  });
}
pravda('nikde se k číslu nelepí pevný tvar bez rozhodnutí podle počtu',
  podezrele.length === 0, podezrele.join('\n      '));

/* Předpoklad: kdyby se nic neprohledalo, kontrola výš by prošla naprázdno. */
pravda('a bylo co prohledávat', SOUBORY.length >= 30, `souborů ${SOUBORY.length}`);

/* A že to měřidlo vůbec umí najít chybu: na vymyšleném řádku musí
   zabrat. Bez toho by „nic jsme nenašli" neznamenalo nic. */
{
  const spatny = "html += n + ' nových';";
  const dobry = "html += (n === 1 ? n + ' nový' : n + ' nových');";
  pravda('(a měřidlo pozná chybný řádek)', !VETVI.test(spatny) && spatny.indexOf("+ ' nových'") >= 0);
  pravda('(a správný řádek projde)', VETVI.test(dobry));
}

/* Samotná funkce na tvary musí umět všechny tři případy. */
{
  const src = readFileSync(path.join(ROOT, 'js', 'upozorneni-feed.js'), 'utf8');
  const F = (await import('node:module')).createRequire(import.meta.url)(path.join(ROOT, 'js', 'upozorneni-feed.js'));
  const t = ['pozemek', 'pozemky', 'pozemků'];
  pravda('1 → první tvar', F.mnozne(1, t) === 'pozemek', F.mnozne(1, t));
  pravda('2 až 4 → druhý', F.mnozne(2, t) === 'pozemky' && F.mnozne(4, t) === 'pozemky');
  pravda('5 a víc → třetí', F.mnozne(5, t) === 'pozemků' && F.mnozne(25, t) === 'pozemků');
  pravda('0 → třetí („žádný pozemek" se píše jinak)', F.mnozne(0, t) === 'pozemků', F.mnozne(0, t));
  pravda('a cislovka připojí číslo', F.cislovka(3, t) === '3 pozemky', F.cislovka(3, t));
  void src;
}

console.log(`\nSkloňování podle počtu: ${ok + chyb} kontrol`);
console.log(zpravy.join('\n'));
if (chyb) { console.error(`\n::error::Skloňování: ${chyb} kontrol neprošlo.`); process.exit(1); }
console.log(`\n${ok} v pořádku, 0 chyb\n`);
