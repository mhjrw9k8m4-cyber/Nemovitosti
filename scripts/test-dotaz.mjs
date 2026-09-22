// Test: jedno políčko, které rozumí celé větě.
//
// Spuštění: node scripts/test-dotaz.mjs   (nepotřebuje prohlížeč ani síť)
//
// Hledání umělo jen místo, okres, parcelu a druh — a to jen jako text.
// Kdo chtěl „stavební pozemek na Berounsku do milionu, kde je elektřina",
// musel projít čtyři ovládátka na třech místech stránky. Přitom je to
// jedna věta, kterou si člověk v hlavě stejně řekne najednou.
//
// js/dotaz.js tu větu rozebere. Tři pravidla, na kterých to stojí, a
// všechna tři se dají porušit tiše, takže je hlídá test:
//
//  1. JEDNOTKA ROZHODUJE, NE POŘADÍ. „do 2 ha" je výměra, „do 2 mil" cena.
//     Holé číslo („769/2") musí zůstat textem — je to nejspíš parcela,
//     a kdyby se z něj stal filtr ceny, zmizely by všechny výsledky.
//  2. DELŠÍ VAZBA MÁ PŘEDNOST. „trvalý travní porost" se musí poznat dřív
//     než samotné „travní", jinak zbytek věty osiří a hledá se podle něj
//     obec, která neexistuje.
//  3. CO SE NEPOZNÁ, SE NEZAHODÍ. Zbytek jde na hledání místa. Kdyby se
//     ztratil, „Beroun" vedle „stavební" by přestal fungovat.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
const ROOT = new URL('..', import.meta.url).pathname;
const req = createRequire(import.meta.url);
const P = req(path.join(ROOT, 'js', 'dotaz.js'));
const DATA = JSON.parse(readFileSync(path.join(ROOT, 'data', 'opportunities.json'), 'utf8')).opportunities;
const okno = { window: {} };
new Function('window', readFileSync(path.join(ROOT, 'js', 'ceny.js'), 'utf8'))(okno.window);
const druhGroup = okno.window.PK_CENY.druhGroup;

let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* --- 1) Celé věty ------------------------------------------------------ */
{
  const r = P.rozeber('stavební beroun do 1 mil elektřina');
  pravda('věta „stavební beroun do 1 mil elektřina" se rozebere celá',
    r.druh === 'Stavební / zastavěná' && r.cenaDo === 1000000
    && r.site.join() === 'elektrina' && r.text === 'beroun',
    JSON.stringify(r));
  pravda('a zbytek zůstane na hledání obce', r.text === 'beroun', `„${r.text}"`);
  pravda('každá pochopená část má svůj odznak', r.casti.length === 3,
    r.casti.map((c) => c.popis).join(' | '));
}
{
  const r = P.rozeber('trvalý travní porost od 5000 m2');
  pravda('delší vazba má přednost („trvalý travní porost", ne „travní")',
    r.druh === 'Louka / travní porost' && r.text === '', JSON.stringify(r));
  pravda('a výměra se pozná podle jednotky', r.plochaOd === 5000 && r.cenaOd === null);
}
{
  const r = P.rozeber('orná nad 2 ha');
  pravda('„nad 2 ha" je dolní mez výměry', r.plochaOd === 20000 && r.plochaDo === null, JSON.stringify(r));
  pravda('a v odznaku stojí, co člověk napsal', r.casti.some((c) => c.popis === 'nad 2 ha'),
    r.casti.map((c) => c.popis).join(' | '));
}

/* --- 2) Jednotka rozhoduje --------------------------------------------- */
{
  pravda('„do 2 mil" je cena', P.rozeber('do 2 mil').cenaDo === 2000000);
  pravda('„do 2 ha" je výměra', P.rozeber('do 2 ha').plochaDo === 20000);
  pravda('„do 500 tis" je cena', P.rozeber('do 500 tis').cenaDo === 500000);
  pravda('„do 1000 m2" je výměra', P.rozeber('do 1000 m2').plochaDo === 1000);
  pravda('desetinné číslo s čárkou', P.rozeber('do 1,5 mil').cenaDo === 1500000);
  // A hlavně: bez jednotky se nehádá.
  const r = P.rozeber('do 500');
  pravda('holé číslo bez jednotky se na filtr nepřevádí',
    r.cenaDo === null && r.plochaDo === null && r.text === 'do 500', JSON.stringify(r));
  const p2 = P.rozeber('769/2');
  pravda('parcelní číslo zůstane textem', p2.text === '769/2' && !p2.casti.length, JSON.stringify(p2));
}

/* --- 3) Co se nesmí ztratit -------------------------------------------- */
{
  pravda('samotná obec projde beze změny', P.rozeber('Říčany').text === 'ricany');
  pravda('dvě slova obce taky', P.rozeber('Police nad Metují').text.indexOf('police') === 0,
    P.rozeber('Police nad Metují').text);
  pravda('prázdný dotaz nic nefiltruje',
    P.rozeber('').casti.length === 0 && P.rozeber('  ').text === '');
  pravda('nesmysl zůstane textem', P.rozeber('xqzwkj').text === 'xqzwkj');
}

/* --- 4) Na skutečných datech musí každé slovo něco najít --------------- */
{
  const sedi = (r, d) => {
    if (r.druh && druhGroup(d.druh) !== r.druh) return false;
    if (r.typ && d.type !== r.typ) return false;
    if (r.jenCelek && d.podil) return false;
    for (const s of r.site) if (!d.site || d.site.indexOf(s) < 0) return false;
    if (r.cenaDo && !(d.price > 0 && d.price <= r.cenaDo)) return false;
    if (r.cenaOd && !(d.price >= r.cenaOd)) return false;
    if (r.plochaDo && !(d.area > 0 && d.area <= r.plochaDo)) return false;
    if (r.plochaOd && !(d.area >= r.plochaOd)) return false;
    return true;
  };
  const kolik = (q) => { const r = P.rozeber(q); return DATA.filter((d) => sedi(r, d)).length; };
  // Každý druh ve slovníku musí na ostrých datech něco vracet — jinak je to
  // slovo, které nabízíme a po kterém zůstane prázdno.
  const prazdne = [];
  for (const d of P.DRUHY) if (!kolik(d[1])) prazdne.push(d[1]);
  pravda('každý druh ze slovníku něco najde', prazdne.length === 0, 'prázdné: ' + prazdne.join(', '));
  /* U typů nabídky to platit NEMŮŽE: „od obce" a „od majitele" jsou
     platné pojmy (web je má i v legendě), ale vlastní inzeráty zatím
     žádné nejsou, takže by vracely prázdno. Hlídá se proto to podstatné —
     že se prázdné slovo NENABÍZÍ. O tom rozhoduje jedna podmínka v
     js/main.js a ta tu musí zůstat. */
  const main0 = readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8');
  pravda('našeptávač nenabídne slovo, pod kterým nic není',
    /if \(pocet\) ven\.push/.test(main0),
    'bez téhle podmínky by web nabídl „od obce" a po klepnutí ukázal prázdno');
  const zive = P.TYPY.filter((t) => kolik(t[2]) > 0).map((t) => t[2]);
  pravda(`a typy, které v datech jsou, fungují (${zive.join(', ')})`, zive.length >= 3,
    'z pěti typů má nabídky jen ' + zive.length);
  pravda('a kombinace zužuje, ne rozšiřuje',
    kolik('stavební do 1 mil') <= kolik('stavební') && kolik('stavební') <= DATA.length,
    `${kolik('stavební do 1 mil')} ≤ ${kolik('stavební')}`);
  pravda('„dražba les" najde jen lesní dražby', (() => {
    const r = P.rozeber('dražba les');
    return DATA.filter((d) => sedi(r, d)).every((d) => d.type === 'drazba' && druhGroup(d.druh) === 'Lesní pozemek');
  })());
}

/* --- 5) Slovo, které se vkládá z našeptávače, musí jít zase přečíst ---- */
{
  let spatne = [];
  for (const d of P.DRUHY) if (P.rozeber(d[1]).druh !== d[0]) spatne.push(d[1]);
  for (const t of P.TYPY) if (P.rozeber(t[2]).typ !== t[0]) spatne.push(t[2]);
  for (const s of P.SITE) if (P.rozeber(s[2]).site.join() !== s[0]) spatne.push(s[2]);
  pravda('každé nabízené slovo parser zase přečte', spatne.length === 0,
    'nepřečte: ' + spatne.join(', ') + ' — našeptávač by vložil do věty něco, co ji rozbije');
}

/* --- 6) Je to zapojené? ------------------------------------------------ */
{
  const main = readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8');
  const idx = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  pravda('index.html načítá js/dotaz.js', /<script src="js\/dotaz\.js/.test(idx));
  pravda('web větu rozebírá', /PKDotaz\.rozeber\(syrovy\)/.test(main));
  pravda('a filtruje podle toho, co pochopil', /okDotaz;/.test(main));
  pravda('pochopené části se ukazují jako odznaky', /ms-chipy/.test(idx) && /prekresliChipy/.test(main));
  pravda('a jdou zrušit', /class="msch"/.test(main));
  pravda('našeptávač nabízí i slovník, ne jen obce', /navrhySlovnik/.test(main));
}

console.log('\nJedno políčko, které rozumí celé větě');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Dotaz: ' + chyb + ' kontrol neprošlo.'); process.exit(1); }
process.exit(0);
