/* Test: práva úloh v CI a odkud se berou balíčky.
 * ====================================================================
 * Spuštění: node scripts/test-ci-prava.mjs
 *
 * PROČ. Naměřeno 23. 10.: z osmi úloh v .github/workflows mělo
 * `permissions:` napsané **jen tři**. Zbylých pět — a jsou mezi nimi
 * všechny tři, které drží nejsilnější tajemství (service-role klíč
 * k databázi, klíč k Resendu, privátní VAPID) — jelo s právy, která
 * má repozitář ve svém nastavení. To nastavení v repozitáři vidět
 * není: dá se přepnout v prohlížeči, mimo historii, a nikdo si toho
 * nevšimne.
 *
 * Druhá věc z téhož měření: závislosti se v CI instalovaly JMÉNEM.
 * `npm install jpeg-js` si verzi vybere znovu podle rozsahu ^0.4.4,
 * takže package-lock.json u toho neplatí, a `npm install playwright`
 * bez verze vzal to, co bylo na npm nejnovější v minutě běhu — mezi
 * připnutou 1.47.2 ve fetch-nsfw-model.yml a tím, co se instalovalo
 * tady, bylo sedmnáct menších vydání. Jednou to už rozsvítilo CI při
 * zelené zkoušce (docs/optimalizace.md, oddíl 101). A instalace pouští
 * životní skripty balíčků: dnes žádný náš balíček žádný nemá, ale nové
 * vydání ho přidat může a spustilo by se v téže úloze, kde je klíč
 * k databázi, bez toho, že by si ho kdokoli přečetl.
 *
 * CO SE HLÍDÁ
 *   A) každá úloha má napsaná práva, a nejvýš `contents`
 *   B) `contents: write` jen tam, kde se opravdu pushuje
 *   C) úloha, která nepushuje, si nenechává token z checkoutu na disku
 *      (a úloha, která pushuje, si ho nechat MUSÍ — jinak by push padl)
 *   D) instalace balíčků: podle zámku, nebo s připnutou verzí, a vždy
 *      bez životních skriptů
 *   E) cizí akce (co není actions/*) musí být připnutá na SHA
 *   F) do `run:` nejde text, který může napsat kdokoli (vložení příkazu)
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pricinaChyb } from './chyby-hlaska.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ULOHY = path.join(KOREN, '.github', 'workflows');
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

const soubory = readdirSync(ULOHY).filter((f) => /\.ya?ml$/.test(f)).sort();
pravda(`úlohy se našly (${soubory.length})`, soubory.length >= 8,
  'našlo se jich jen ' + soubory.length);

const text = {};
for (const f of soubory) text[f] = readFileSync(path.join(ULOHY, f), 'utf8');

/* Komentáře pryč, ať `git push` ani `npm install` v poznámce nic
   netvrdí. Komentář v YAMLu je „#" na začátku (po mezerách) — „#"
   uvnitř příkazu v `run:` je taky komentář, jenže shellu, a ten se
   tady počítá stejně: ani jeden se nevykoná. */
function kod(s) { return s.replace(/^\s*#.*$/gm, ' ').replace(/\s#[^\n]*/g, ' '); }
const K = {};
for (const f of soubory) K[f] = kod(text[f]);

/* Která úloha opravdu pushuje. Ne podle jména, podle příkazu. */
const pushuje = soubory.filter((f) => /\bgit push\b/.test(K[f]));
pravda(`pushující úlohy se poznaly podle příkazu (${pushuje.length})`,
  pushuje.length >= 1 && pushuje.length < soubory.length,
  'našlo se ' + pushuje.length + ' z ' + soubory.length);

/* --- A) každá úloha má napsaná práva ------------------------------ */
const bezPrav = soubory.filter((f) => !/^\s*permissions:/m.test(K[f]));
pravda('každá úloha má napsaná práva (permissions)', bezPrav.length === 0,
  'bez práv: ' + bezPrav.join(', ') + ' — jedou s tím, co je nastavené v repozitáři');

/* Co je v těch blocích napsané. `write-all` a jakýkoli jiný rozsah než
   `contents` je nález: nic z toho tyhle úlohy nepotřebují. */
const siroka = [];
const rozsahy = {};
for (const f of soubory) {
  if (/permissions:\s*write-all/.test(K[f])) { siroka.push(f + ' (write-all)'); continue; }
  const nalezene = {};
  for (const m of K[f].matchAll(/^\s*permissions:\s*\n((?:\s+[a-z-]+:\s*\S+\s*\n)+)/gm)) {
    for (const r of m[1].matchAll(/\s+([a-z-]+):\s*(\S+)/g)) nalezene[r[1]] = r[2];
  }
  rozsahy[f] = nalezene;
  for (const [jm, hod] of Object.entries(nalezene)) {
    if (jm !== 'contents') siroka.push(`${f} (${jm}: ${hod})`);
    else if (!/^(read|write)$/.test(hod)) siroka.push(`${f} (contents: ${hod})`);
  }
}
pravda('a nikde si nebere víc než čtení nebo zápis zdroje', siroka.length === 0,
  'navíc: ' + siroka.join(', '));

/* --- B) zápis jen tam, kde se pushuje ----------------------------- */
const zbytecnyZapis = soubory.filter((f) =>
  rozsahy[f] && rozsahy[f].contents === 'write' && !pushuje.includes(f));
pravda('zápis do zdroje má jen úloha, která opravdu pushuje',
  zbytecnyZapis.length === 0,
  'zápis bez pushe: ' + zbytecnyZapis.join(', '));
const chybiZapis = pushuje.filter((f) => !(rozsahy[f] && rozsahy[f].contents === 'write'));
pravda('a pushující úloha ten zápis napsaný má (jinak by push padl)',
  chybiZapis.length === 0, 'pushuje bez práva: ' + chybiZapis.join(', '));

/* --- C) token z checkoutu nezůstává na disku ---------------------- */
const checkouty = {};
for (const f of soubory) {
  /* Krok checkoutu i s jeho `with:` blokem. Nejde to vzít „odsazenější
     řádky za ním": mezi `uses:` a `persist-credentials` leží prázdné
     řádky a komentáře (ty tu jsou zahlazené na mezery), a na prvním
     takovém by se čtení zastavilo — přesně na to tahle kontrola
     nejdřív spadla, i když to v souboru napsané bylo. Čte se proto od
     `uses:` po začátek dalšího kroku („- " na jeho odsazení). */
  checkouty[f] = [];
  const t = K[f];
  let od = 0;
  for (;;) {
    const i = t.indexOf('actions/checkout@', od);
    if (i < 0) break;
    const dalsi = t.slice(i).search(/\n[ \t]*- /);
    checkouty[f].push(dalsi < 0 ? t.slice(i) : t.slice(i, i + dalsi));
    od = i + 1;
  }
}
const sTokenem = [];
for (const f of soubory) {
  if (pushuje.includes(f)) continue;
  for (const blok of checkouty[f]) if (!/persist-credentials:\s*false/.test(blok)) sTokenem.push(f);
}
pravda('úloha, která nepushuje, si token z checkoutu nenechává na disku',
  sTokenem.length === 0,
  'token zůstává v .git/config: ' + [...new Set(sTokenem)].join(', '));
/* Opačný směr, aby předchozí kontrola nešla „splnit" všude: kdo
   pushuje, ten token POTŘEBUJE. */
const pushBezTokenu = pushuje.filter((f) =>
  checkouty[f].some((b) => /persist-credentials:\s*false/.test(b)));
pravda('a kdo pushuje, ten si ho nechává (jinak by push neprošel)',
  pushBezTokenu.length === 0, 'push bez tokenu: ' + pushBezTokenu.join(', '));

/* --- D) odkud se berou balíčky ------------------------------------ */
const neprinute = [];
const seSkripty = [];
for (const f of soubory) {
  for (const m of K[f].matchAll(/^\s*(npm (?:ci|install|i)\b[^\n]*)$/gm)) {
    const prikaz = m[1].trim();
    if (!/--ignore-scripts\b/.test(prikaz)) seSkripty.push(`${f}: ${prikaz}`);
    if (/^npm ci\b/.test(prikaz)) continue;          // zámek rozhoduje za nás
    /* Jmenované balíčky: všechno, co není přepínač. Příkaz se nejdřív
       usekne u prvního znaku shellu (`>`, `&`, `|`, `;`) — jinak se za
       balíček počítá i `2>&1`, na což tahle kontrola nejdřív spadla. */
    const bezShellu = prikaz.split(/[>&|;]/)[0];
    const balicky = bezShellu.split(/\s+/).slice(2).filter((t) => t && !t.startsWith('-'));
    for (const b of balicky) {
      if (!/@\d+\.\d+\.\d+$/.test(b)) neprinute.push(`${f}: ${b}`);
    }
  }
}
pravda('balíčky se instalují podle zámku, nebo s připnutou verzí',
  neprinute.length === 0,
  'bez verze: ' + neprinute.join(', ') + ' — nainstaluje se to, co je na npm nejnovější v minutě běhu');
pravda('a instalace nepouští životní skripty balíčků',
  seSkripty.length === 0, 'bez --ignore-scripts: ' + seSkripty.join(' | '));

/* --- E) cizí akce připnuté na SHA --------------------------------- */
const akce = new Set();
for (const f of soubory) for (const m of K[f].matchAll(/uses:\s*([^\s]+)/g)) akce.add(m[1]);
const cizi = [...akce].filter((a) => !/^actions\//.test(a) && !/^\.\//.test(a));
const ciziBezSha = cizi.filter((a) => !/@[0-9a-f]{40}$/.test(a));
pravda('cizí akce (co není actions/*) jsou připnuté na SHA',
  ciziBezSha.length === 0,
  'na pohyblivou značku: ' + ciziBezSha.join(', '));

/* --- F) do příkazů nejde text, který může napsat kdokoli ---------- */
/* Jméno větve, titulek pull requestu nebo tělo komentáře smí napsat
   kdokoli, kdo umí otevřít pull request. Vložené do `run:` je to cesta,
   jak v úloze spustit vlastní příkaz. Vstupy z workflow_dispatch sem
   nepatří: to spouští majitel repozitáře. */
const CIZI_TEXT = /\$\{\{\s*github\.(head_ref|event\.(?:pull_request\.(?:title|body|head\.ref|head\.label)|issue\.(?:title|body)|comment\.body|review\.body|head_commit\.message))/;
const vlozeni = [];
for (const f of soubory) {
  for (const m of K[f].matchAll(/^\s*run:\s*\|?([\s\S]*?)(?=\n\s*- |\n\s*[a-z-]+:|\n*$)/gm)) {
    if (CIZI_TEXT.test(m[1])) vlozeni.push(f);
  }
}
pravda('do příkazů v úlohách nejde text, který může napsat kdokoli',
  vlozeni.length === 0, 'vložení příkazu: ' + [...new Set(vlozeni)].join(', '));

console.log('\nPráva úloh v CI a odkud se berou balíčky');
console.log(zpravy.join('\n'));
console.log(`\n  · úloh: ${soubory.length}, z toho pushuje ${pushuje.length} (${pushuje.join(', ')})`);
console.log(`  · akcí: ${akce.size} (${[...akce].sort().join(', ')})`);
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Práva v CI: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
