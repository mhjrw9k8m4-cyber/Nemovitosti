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

/* ---- 3b) a totéž ve VŠECH kanálech, ne jen v hlavním ----
   Kontrola „každá položka má jedinečné guid" o oddíl výš existovala,
   jenže se dívala jedině do novinky.xml — a shody byly v krajských:
   šestnáct položek ve čtyřech kanálech, z toho šest v jediném. Kanál
   si přitom bral jméno stránky přes souborPro(), tedy z klíče, na kterém
   se nabídky srážejí; generátor stránek dává druhé z nich jméno jiné.
   Čtenář tedy klepl na jednu nabídku a dostal stránku jiné: cizí cenu,
   cizí výměru. Kontrola, která se dívá na jeden soubor z patnácti,
   neříká nic o těch čtrnácti. */
{
  const polozkyKanalu = (x) => [...x.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);
  const kus = (it, tag) => (it.match(new RegExp('<' + tag + '[^>]*>([\\s\\S]*?)</' + tag + '>')) || [])[1] || '';
  let polozek = 0, drazeb = 0;
  const shodnyGuid = [], nerozlisitelne = [], bezTerminu = [], mrtvyOdkaz = [];
  for (const f of soubory) {
    const x = readFileSync(path.join(KOREN, f), 'utf8');
    const it = polozkyKanalu(x);
    polozek += it.length;
    const guidy = new Map(), obsahy = new Map();
    for (const i of it) {
      const g = kus(i, 'guid'), t = kus(i, 'title'), d = kus(i, 'description');
      guidy.set(g, (guidy.get(g) || 0) + 1);
      obsahy.set(t + '|' + d, (obsahy.get(t + '|' + d) || 0) + 1);
      const cil = g.replace('https://www.parcelaka.cz/', '');
      if (/\.html$/.test(cil) && !existsSync(path.join(KOREN, cil))) mrtvyOdkaz.push(f + ' → ' + cil);
      /* Dražba a exekuce musí nést termín: tři dražby v Polici nad
         Metují měly stejnou výměru i cenu a lišily se jen datem, takže
         bez něj byly v kanálu znak za znak stejné. */
      if (/— (?:Dražba|Exekuce),/.test(t)) {
        drazeb++;
        if (!/\d{1,2}\.\s\d{1,2}\.\s\d{4}/.test(d)) bezTerminu.push(f + ': ' + t);
      }
    }
    for (const [g, n] of guidy) if (n > 1) shodnyGuid.push(`${f}: ${g} ${n}×`);
    for (const [, n] of obsahy) if (n > 1) nerozlisitelne.push(f);
  }
  pravda(`prohledalo se ${soubory.length} kanálů a ${polozek} položek (jinak kontrola měří prázdno)`,
    soubory.length >= 15 && polozek > 600, `${soubory.length} kanálů, ${polozek} položek`);
  pravda('v žádném kanálu nejsou dvě položky se shodným guid',
    shodnyGuid.length === 0, `${shodnyGuid.length}: ` + shodnyGuid.slice(0, 4).join('; '));
  pravda('a žádné dvě položky nejsou na pohled stejné (titulek i popis)',
    nerozlisitelne.length === 0, `${nerozlisitelne.length}: ` + nerozlisitelne.slice(0, 4).join(', '));
  pravda('a žádný odkaz nevede na stránku, která není',
    mrtvyOdkaz.length === 0, `${mrtvyOdkaz.length}: ` + mrtvyOdkaz.slice(0, 3).join(', '));
  pravda(`dražeb a exekucí je v kanálech dost na kontrolu (${drazeb})`, drazeb > 20, `jen ${drazeb}`);
  pravda('a každá nese termín, aby se dvě různé nepletly',
    bezTerminu.length === 0, `${bezTerminu.length}: ` + bezTerminu.slice(0, 3).join('; '));
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
      /application\/rss\+xml/.test(t), okres);
  }
}

/* ---- 7) KRAJSKÉ KANÁLY MUSÍ BÝT ODKUD NAJÍT ----------------------
   Čtrnáct krajských kanálů se obnovuje čtyřikrát denně — a odkazovala na
   ně JEDINÁ stránka, data.html s popisem dat. Na stránce kraje si čtenář
   nemohl všimnout, že existuje kanál právě pro jeho kraj: v hlavičce
   stál celostátní a ve textu nic. Soubory, které nikdo nenajde, se
   stejně dobře nemusely dělat.
   Kontroluje se obojí, protože obojí je potřeba k něčemu jinému:
   <link rel="alternate"> najde ČTEČKA, viditelný odkaz najde ČLOVĚK. */
{
  const kanaly = readdirSync(KOREN).filter((f) => /^novinky-[a-z0-9-]+\.xml$/.test(f));
  pravda(`krajských kanálů se našlo dost na kontrolu (${kanaly.length})`,
    kanaly.length >= 10, `nalezeno ${kanaly.length}`);

  const bezCtecky = [], bezOdkazu = [], naNeexistujici = [];
  for (const kanal of kanaly) {
    const stranka = 'pozemky-' + kanal.replace(/^novinky-/, '').replace(/\.xml$/, '') + '-kraj.html';
    if (!existsSync(path.join(KOREN, stranka))) { naNeexistujici.push(`${kanal} → ${stranka}`); continue; }
    const t = readFileSync(path.join(KOREN, stranka), 'utf8');
    const re = new RegExp('<link rel="alternate"[^>]*href="' + kanal.replace('.', '\\.') + '"');
    if (!re.test(t)) bezCtecky.push(stranka);
    if (!new RegExp('<a href="' + kanal.replace('.', '\\.') + '"').test(t)) bezOdkazu.push(stranka);
  }
  pravda('každý krajský kanál najde čtečka na stránce svého kraje',
    bezCtecky.length === 0, bezCtecky.slice(0, 4).join(', '));
  pravda('a člověk se k němu doklikne z textu té stránky',
    bezOdkazu.length === 0, bezOdkazu.slice(0, 4).join(', '));
  pravda('a ke každému kanálu ta stránka vůbec existuje',
    naNeexistujici.length === 0, naNeexistujici.join(', '));

  /* Druhá strana: stránka nesmí nabízet kanál, který neexistuje —
     to by byl mrtvý odkaz v hlavičce, který čtečka ohlásí jako chybu. */
  const slibyNaPrazdno = [];
  for (const f of readdirSync(KOREN).filter((x) => /\.html$/.test(x) && !/^pozemek-.+-[0-9a-z]{5,8}\.html$/.test(x))) {
    const t = readFileSync(path.join(KOREN, f), 'utf8');
    for (const m of t.matchAll(/(?:href)="(novinky[a-z0-9-]*\.xml)"/g)) {
      if (!existsSync(path.join(KOREN, m[1]))) slibyNaPrazdno.push(`${f} → ${m[1]}`);
    }
  }
  pravda('a žádná stránka nenabízí kanál, který neexistuje',
    slibyNaPrazdno.length === 0, slibyNaPrazdno.slice(0, 4).join(', '));
}

hotovo();
