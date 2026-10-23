/* Test: popis od inzerenta — uklidí se a dojde až na stránku pozemku?
 *
 * Spuštění: node scripts/test-popisy.mjs
 *
 * PROČ TAHLE ZKOUŠKA JE. Dotaz na Bezrealitky stahoval popis inzerátu
 * odjakživa, ale používal se jen k uhodnutí druhu a sítí a pak se zahodil.
 * Na stránce pozemku tedy nestálo ani slovo od toho, kdo ho zná — jen
 * čísla a věty, které si web poskládal sám. U 1 787 z 2 018 nabídek
 * (devět z deseti) je ten text k dispozici.
 *
 * Hlídají se tři věci, každá na jiném místě řetězu:
 *   1. ÚKLID. Z cizího inzerátu se nesmí přenést telefon, e-mail ani
 *      odkaz. Vyhazují se CELÉ VĚTY, ve kterých kontakt byl — napoprvé
 *      jsem mazal jen ta slova a zbylo „Volejte   nebo pište na   Více na".
 *   2. ULOŽENÍ. Popisy nesmí skončit v opportunities.json: ten soubor čte
 *      úvodní stránka a megabajt navíc se platí časem na telefonu.
 *   3. DORUČENÍ. Generátor musí popis vepsat do stránky pozemku a stránka
 *      ho musí umět přečíst.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cistyPopis } from './fetch-opportunities.mjs';
import { stranka, klicNabidky } from './generate-parcel-pages.mjs';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { pocetnostVet, bezReklamy } from './text-inzeratu.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* ---------- 1. úklid ---------- */
const VETA = 'Prodáme rovinatý pozemek 2 697 m² v obci Libochovice, v územním plánu orná půda.';
const sKontakty = `<p>${VETA}</p> Volejte 777 123 456 nebo pište na jan@novak.cz. Více na https://example.cz/inzerat`;
const uklizeny = cistyPopis(sKontakty);
pravda('popis se vůbec vrátí (jinak by další tvrzení platila o prázdnu)',
  uklizeny.length > 40, `vrátilo se ${uklizeny.length} znaků`);
pravda('a nese tu větu, kvůli které se sbírá', uklizeny.indexOf('rovinatý pozemek') !== -1, uklizeny);
pravda('telefon se nepřenese', !/\d{3}\s?\d{3}\s?\d{3}/.test(uklizeny), uklizeny);
pravda('e-mail se nepřenese', uklizeny.indexOf('@') === -1, uklizeny);
pravda('odkaz se nepřenese', !/https?:\/\/|www\./i.test(uklizeny), uklizeny);
/* Tohle je ta vada, kvůli které se mažou věty, ne slova. */
pravda('a nezůstane po nich věta bez obsahu („Volejte   nebo pište na")',
  uklizeny.indexOf('Volejte') === -1 && uklizeny.indexOf('pište') === -1, uklizeny);
pravda('dvě slova nejsou popis', cistyPopis('Pozemek na prodej.') === '', JSON.stringify(cistyPopis('Pozemek na prodej.')));
/* DROBNÁ TYPOGRAFIE. Inzeráty chodí tak, jak je kdo napsal — naměřeno
   na patnácti vygenerovaných stránkách: mezera PŘED čárkou („v obci
   Boseň , v atraktivní lokalitě"). Opravuje se jen to, co je bez
   výjimky chyba; desetinná čárka se nesmí rozpadnout, proto se mezera
   ZA čárkou nedoplňuje. */
{
  const t = cistyPopis('Nabízím k prodeji svažitý stavební pozemek o výměře 865 m² , '
    + 'který je  kompletně zasíťovaný a připravený ke stavbě rodinného domu o výměře 1,5 ha.');
  pravda('mezera před čárkou zmizí', t.indexOf(' ,') === -1 && t.indexOf('m²,') !== -1, t);
  pravda('a zdvojená mezera taky', t.indexOf('  ') === -1, t);
  pravda('ale desetinná čárka zůstane celá', t.indexOf('1,5 ha') !== -1, t);
}
pravda('prázdný vstup nespadne', cistyPopis(null) === '' && cistyPopis(undefined) === '');
const dlouhy = cistyPopis(('Nabízíme ke koupi zemědělský pozemek o výměře 1,2 ha. '
  + 'Pozemek je přístupný po zpevněné cestě. Vhodné jako investice. ').repeat(8));
pravda('dlouhý text se zkrátí a končí větou, ne půlkou slova',
  dlouhy.length <= 470 && /[.…]$/.test(dlouhy), `${dlouhy.length} znaků, konec: ${JSON.stringify(dlouhy.slice(-24))}`);

/* ---------- 1b) ŘEZ NESMÍ PADNOUT DO ZKRATKY ----------------------
   „Končí to tečkou" nestačí. Zkracovalo se podle `lastIndexOf('. ')`,
   a u inzerátů na spoluvlastnické podíly tečka s mezerou není konec
   věty, ale zkratka: „• Parcela č. 1002/2 - o výměře 32 m²". Řez padl
   hned za „Parcela č." a na stránce zůstal viselec, který TEČKOU KONČÍ
   — takže ho kontrola o kus výš pustila dál. Naměřeno na 1 623
   uložených popisech: takhle uříznutých bylo 292, tedy 18 %, a nový
   řez to spraví u 1 120 z nich, aniž by jediný pokazil. */
const VYPIS = 'Nabízíme podíl na pozemcích přímo od vlastníka, bez provize a bez zbytečných výdajů. '
  + 'k.ú. Slatina LV č. 2515 o výměře 4024 m², podíl 1/12'
  + (' • Parcela č. 2189/1 - o výměře 40387 m² (Orná půda)').repeat(12);
{
  const t = cistyPopis(VYPIS);
  pravda('výpis parcel se neuřízne uprostřed položky',
    !/(?:Parcela č\.|LV č\.|o výměře|podíl)\s*$/.test(t.trim()),
    `konec: ${JSON.stringify(t.slice(-40))}`);
  pravda('a uřízne se mezi odrážkami, takže poslední položka je celá',
    /\(Orná půda\)…$/.test(t.trim()) || /[.!?]$/.test(t.trim()),
    `konec: ${JSON.stringify(t.slice(-40))}`);
  pravda('a je vidět, že text pokračuje',
    /…$/.test(t.trim()) || t.length < 460, `konec: ${JSON.stringify(t.slice(-16))}`);
}
{
  /* Totéž u věty, která končí zkratkou „apod." uprostřed — tam se řezat
     smí, protože za ní věta opravdu končí... ale „č." nikdy. */
  const t = cistyPopis('Pozemek je rovinatý a oplocený. '.repeat(10) + 'Parcela č. 125/3 v k.ú. Lhota.');
  pravda('zkratka „č." se nepovažuje za konec věty',
    !/Parcela č\.$/.test(t.trim()), `konec: ${JSON.stringify(t.slice(-30))}`);
}
{
  /* A text bez odrážek i bez tečky se pořád uřízne na mezeře, ne v půlce
     slova — to je ta poslední záchrana, kterou nová pravidla nesmí vzít. */
  const t = cistyPopis('slovobeztecky '.repeat(60));
  pravda('text bez tečky a bez odrážek se uřízne s výpustkou', /…$/.test(t.trim()),
    `konec: ${JSON.stringify(t.slice(-24))}`);
  pravda('a ne v půlce slova', /\bslovobeztecky…$/.test(t.trim()),
    `konec: ${JSON.stringify(t.slice(-24))}`);
}

/* ---------- 2. uložení ---------- */
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'opportunities.json'), 'utf8'));
const nabidky = data.opportunities || [];
pravda('data se načetla a nabídky v nich jsou', nabidky.length > 100, `${nabidky.length} nabídek`);
const sPopisem = nabidky.filter((o) => o.popis || o._popis || o.description);
pravda('popisy nejsou v opportunities.json (úvodní stránka je nepotřebuje)',
  sPopisem.length === 0, `${sPopisem.length} nabídek nese popis`);

/* ---------- 3. doručení ---------- */
const sablona = fs.readFileSync(path.join(ROOT, 'pozemek.html'), 'utf8');
const vzor = nabidky[0];
const POPISY = path.join(ROOT, 'data', 'popisy.json');
const bylo = fs.existsSync(POPISY) ? fs.readFileSync(POPISY, 'utf8') : null;
/* Generátor čte popisy při načtení modulu, takže se zkouší obojí stav
   přes stránku vyrobenou TEĎ a přes tu, která leží na disku. */
const h = stranka(sablona, vzor);
const maOstrov = /<p id="pz-popis-text">/.test(h);
const popisProVzor = (() => {
  try { return JSON.parse(fs.readFileSync(POPISY, 'utf8'))[klicNabidky(vzor)]; } catch { return undefined; }
})();
/* POPIS JE OD 14. 10. V HTML, NE V DATOVÉM OSTRŮVKU. Změřeno
   v prohlížeči s vypnutým JavaScriptem: ze stránky pozemku zbylo
   699 znaků z 3 101 (23 %), a nejdelší nezaměnitelný kus textu — právě
   popis — v tom nebyl. Hlídá se tedy totéž co dřív, jen na jiném
   místě: že tam je právě tehdy, když popis existuje, a že se z cizího
   textu nedostane do stránky holá lomená závorka. */
pravda('stránka pozemku nese popis v HTML právě tehdy, když popis existuje',
  maOstrov === !!(popisProVzor && String(popisProVzor).trim().length >= 60),
  `v HTML ${maOstrov}, popis v souboru ${!!popisProVzor}`);
if (popisProVzor) {
  /* Text v ostrůvku nesmí obsahovat holé „<" — jinak by lomená závorka
     z cizího inzerátu mohla ukončit skript. */
  const m = h.match(/<p id="pz-popis-text">([\s\S]*?)<\/p>/);
  pravda('text v HTML nenese holou lomenou závorku', !!m && !/[<>]/.test(m[1]),
    m ? m[1].slice(0, 80) : 'popis v HTML nenalezen');
  /* Ampersand tu BÝT SMÍ — ale jen jako entita. Holý by rozbil zápis
     stejně jako lomená závorka. */
  pravda('a ampersand je v něm jen jako entita',
    !!m && !/&(?!(amp|lt|gt|quot|#\d+|#x[0-9a-f]+);)/i.test(m[1]), m ? m[1].slice(0, 80) : '');
  /* TEXT V HTML SE ROVNÁ DATŮM — PO ÚKLIDU REKLAMY, ne surovým.
     Od 23. 10. se z popisu zahazují věty, které stojí v padesáti a více
     nabídkách (prodejní text inzerenta, oddíl 136 v
     docs/optimalizace.md). Srovnávat se surovým souborem by tedy teď
     bylo srovnávání se stavem před úklidem — a tahle kontrola je
     o tom, že si stránka text NEVYMÝŠLÍ, ne o tom, že se neuklízí.
     Čistí se stejnou funkcí, jakou použil generátor; kdyby se rozešly,
     nesedělo by to. */
  const pocty = pocetnostVet(Object.values(JSON.parse(fs.readFileSync(POPISY, 'utf8'))));
  const ocekavany = bezReklamy(String(popisProVzor), pocty);
  pravda('a stejný text je i v datech (po úklidu reklamy inzerenta)', !!m
    && m[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/[\s\u00a0]+/g, ' ').trim()
       === ocekavany.replace(/[\s\u00a0]+/g, ' ').trim(),
    'text v HTML se rozešel s data/popisy.json po úklidu');
}
const pz = fs.readFileSync(path.join(ROOT, 'js', 'pozemek.js'), 'utf8');
pravda('stránka ten popis opravdu čte z HTML', pz.indexOf("getElementById('pz-popis-text')") !== -1);
/* Archiv se záměrně nepřegenerovává, takže ukončené stránky si drží
   starý datový ostrůvek — čtení z něj proto musí zůstat. */
pravda('a umí přečíst i starý ostrůvek kvůli archivu',
  pz.indexOf("getElementById('pz-popis-data')") !== -1);
pravda('a vypisuje ho jinou funkcí než popis od majitele (stejné jméno by jednu z nich tiše smazalo)',
  pz.indexOf('function pzPopisInzerentaHtml') !== -1 && pz.indexOf('function pzPopisHtml') !== -1);
if (bylo === null && fs.existsSync(POPISY)) fs.unlinkSync(POPISY);

console.log('\nPopisy od inzerentů');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Popisy: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
process.exit(0);
