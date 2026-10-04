// Test: kanál s novými pozemky (RSS).
//
// Spuštění: node scripts/test-rss.mjs   (nepotřebuje prohlížeč)
//
// Hlídání na webu potřebuje účet a chodí e-mailem. Kdo chce sledovat
// nové pozemky po svém — ve čtečce, v automatizaci, v jiné aplikaci —
// neměl kudy. Kanál je na to nejlevnější způsob: stačí adresa.
//
// U kanálu se dá pokazit víc věcí potichu než u stránky, protože ho
// nikdo nevidí — čte ho stroj:
//  • NEPLATNÉ XML. Jediný neescapovaný ampersand v názvu obce a čtečka
//    kanál odmítne celý. Člověk se nedozví nic, jen mu přestanou chodit
//    novinky.
//  • NESTÁLÉ guid. Podle něj čtečka pozná, co už ukázala. Kdyby se
//    měnilo, hlásila by tytéž pozemky jako nové při každém běhu robota
//    — tedy čtyřikrát denně.
//  • ODKAZY DO PRÁZDNA. Stránky pozemků se generují a mažou; kanál,
//    který ukazuje na neexistující soubor, vede čtenáře na 404.
//  • MLČENÍ O PODÍLU. U spoluvlastnického podílu je cena za zlomek, ale
//    výměra za celou parcelu — ve čtečce není nic, co by to vysvětlilo,
//    a nabídka tam vypadá jako trhák.
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
function hotovo() {
  console.log('\nKanál s novými pozemky');
  console.log(zpravy.join('\n'));
  console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
  if (chyb) { console.log('::error::Kanál: ' + chyb + ' kontrol neprošlo.'); process.exit(1); }
  process.exit(0);
}

const soubory = readdirSync(KOREN).filter((f) => /^novinky.*\.xml$/.test(f));
// PŘEDPOKLAD: bez kanálů nemá smysl měřit nic dalšího
pravda('kanály existují — celostátní i krajské', soubory.length >= 10 && soubory.includes('novinky.xml'),
  `nalezeno: ${soubory.length} souborů`);
if (!soubory.includes('novinky.xml')) hotovo();

const hlavni = readFileSync(path.join(KOREN, 'novinky.xml'), 'utf8');

/* ---- 1) platné XML ---- */
{
  let spatne = [];
  for (const f of soubory) {
    const t = readFileSync(path.join(KOREN, f), 'utf8');
    /* Holý ampersand je nejčastější způsob, jak kanál rozbít — a čtečka
       pak odmítne CELÝ soubor, ne jen jednu položku. */
    const holy = (t.match(/&(?!amp;|lt;|gt;|quot;|apos;|#\d+;|#x[0-9a-fA-F]+;)/g) || []).length;
    if (holy) spatne.push(`${f}: ${holy}× holý &`);
    if (!/^<\?xml version="1\.0" encoding="UTF-8"\?>/.test(t)) spatne.push(`${f}: chybí hlavička XML`);
    if (!/<rss version="2\.0"/.test(t)) spatne.push(`${f}: není to RSS 2.0`);
    // párování značek item
    const otev = (t.match(/<item>/g) || []).length, zav = (t.match(/<\/item>/g) || []).length;
    if (otev !== zav) spatne.push(`${f}: ${otev} <item> proti ${zav} </item>`);
  }
  pravda('každý kanál je platné XML', spatne.length === 0, spatne.slice(0, 5).join('\n      '));
}

/* ---- 1b) escapování se zkouší PŘÍMO ----
   Nad hotovým souborem je tahle kontrola slepá: žádná česká obec nemá
   v názvu & ani <, takže se escapování na dnešních datech nikdy
   nespustí a sabotáž „zruš escapování" projde. Mechanismus se proto
   krmí nepřátelským vstupem. Není to teorie: zdrojem jsou inzeráty,
   kde si název píše člověk. */
{
  const { esc, popisPolozky } = await import('./generate-rss.mjs');
  const vstup = 'Pole & louka <script>alert("x")</script> "u Nás"';
  const ven = esc(vstup);
  pravda('escapování přepíše ampersand, špičaté závorky i uvozovky',
    ven.indexOf('&amp;') >= 0 && ven.indexOf('&lt;script&gt;') >= 0
      && ven.indexOf('&quot;') >= 0,
    ven.slice(0, 80));
  pravda('a v tom, co projde, nezůstane holý < ani &',
    !/[<>]/.test(ven) && !/&(?!amp;|lt;|gt;|quot;|apos;|#)/.test(ven), ven.slice(0, 80));
  const p = popisPolozky({ price: 1000, area: 10, podil: true, druh: 'Orná & louka' });
  pravda('a popis položky mluví u podílu o zlomku',
    /zlomek/i.test(p), p.slice(0, 90));
}

/* ---- 2) položky vedou na stránky, které opravdu existují ---- */
{
  const odkazy = [...hlavni.matchAll(/<link>https:\/\/www\.parcelaka\.cz\/([^<]+)<\/link>/g)]
    .map((m) => m[1]).filter((f) => /\.html$/.test(f));
  pravda('je co měřit — kanál má položky', odkazy.length >= 20, `odkazů: ${odkazy.length}`);
  const chybi = odkazy.filter((f) => !existsSync(path.join(KOREN, f)));
  pravda('a všechny vedou na existující stránku', chybi.length === 0,
    chybi.slice(0, 4).join(', '));
}

/* ---- 3) guid je trvalé a jedinečné ---- */
{
  const g = [...hlavni.matchAll(/<guid[^>]*>([^<]+)<\/guid>/g)].map((m) => m[1]);
  pravda('každá položka má jedinečné guid', g.length > 0 && new Set(g).size === g.length,
    `jedinečných ${new Set(g).size} z ${g.length}`);
  pravda('a je to adresa stránky, ne pořadí nebo datum',
    g.every((x) => /^https:\/\/www\.parcelaka\.cz\/pozemek-.*\.html$/.test(x)),
    g.filter((x) => !/^https:/.test(x)).slice(0, 3).join(', '));

  /* To hlavní: guid se nesmí měnit mezi běhy. Generátor se pustí
     dvakrát a porovná se — kdyby se guid odvozovalo od času nebo
     pořadí, hlásila by čtečka staré pozemky jako nové čtyřikrát denně. */
  execFileSync('node', [path.join(KOREN, 'scripts', 'generate-rss.mjs')], { cwd: KOREN });
  const znovu = readFileSync(path.join(KOREN, 'novinky.xml'), 'utf8');
  const g2 = [...znovu.matchAll(/<guid[^>]*>([^<]+)<\/guid>/g)].map((m) => m[1]);
  pravda('a po dalším běhu robota zůstane stejné',
    g.length === g2.length && g.every((x, i) => x === g2[i]),
    'guid se mezi dvěma běhy změnilo — čtečky by hlásily staré pozemky jako nové');
}

/* ---- 4) datum, řazení a jazyk ---- */
{
  const d = [...hlavni.matchAll(/<pubDate>([^<]+)<\/pubDate>/g)].map((m) => Date.parse(m[1]));
  pravda('datum u položek je ve tvaru, který čtečky umí přečíst',
    d.length > 0 && d.every(Number.isFinite),
    `nečitelných: ${d.filter((x) => !Number.isFinite(x)).length}`);
  pravda('a položky jdou od nejnovější', d.every((v, i) => i === 0 || d[i - 1] >= v));
  pravda('a kanál se hlásí jako český', /<language>cs<\/language>/.test(hlavni));
  pravda('a ví, na jaké adrese sám leží (atom:link rel="self")',
    /<atom:link href="https:\/\/www\.parcelaka\.cz\/novinky\.xml" rel="self"/.test(hlavni));
}

/* ---- 5) u podílu to musí stát ---- */
{
  const data = JSON.parse(readFileSync(path.join(KOREN, 'data', 'opportunities.json'), 'utf8'));
  const podilu = (data.opportunities || []).filter((o) => o && o.podil).length;
  // PŘEDPOKLAD: kdyby v datech žádný podíl nebyl, kontrola níž projde naprázdno
  pravda('v datech jsou spoluvlastnické podíly (jinak není co hlídat)', podilu > 50,
    `podílů: ${podilu}`);
  const polozky = hlavni.split('<item>').slice(1);
  const sPodilem = polozky.filter((p) => /spoluvlastnick/i.test(p));
  const bezVysvetleni = sPodilem.filter((p) => !/zlomek/i.test(p));
  pravda('a kde kanál mluví o podílu, vysvětlí i proč je cena nízká',
    bezVysvetleni.length === 0,
    `${bezVysvetleni.length} položek zmiňuje podíl bez vysvětlení`);
}

/* ---- 6) čtečka kanál najde a člověk se k němu doklikne ---- */
{
  const idx = readFileSync(path.join(KOREN, 'index.html'), 'utf8');
  pravda('čtečka kanál najde z úvodní stránky',
    /<link rel="alternate" type="application\/rss\+xml"[^>]*novinky\.xml/.test(idx));
  pravda('a člověk se k němu doklikne z patičky',
    /href="novinky\.xml"[^>]*>Kanál/.test(idx));
  const okres = readdirSync(KOREN).find((f) => /^pozemky-okres-.*\.html$/.test(f));
  if (okres) {
    const t = readFileSync(path.join(KOREN, okres), 'utf8');
    pravda('a platí to i pro stránky, které se generují při každém běhu robota',
      /application\/rss\+xml/.test(t) && /href="novinky\.xml"/.test(t), okres);
  }
}

hotovo();
