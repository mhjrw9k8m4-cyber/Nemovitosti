// Test: výpočet návratnosti koupě pozemku (js/navratnost.js).
//
// Spuštění: node scripts/test-navratnost.mjs   (bez prohlížeče)
//
// Kalkulačka návratnosti je nejnebezpečnější věc na celém webu: dává
// číslo, podle kterého se někdo rozhodne dát za pozemek statisíce. Každá
// z chyb níž vypadá nevinně a každá vychází NAHORU — tedy ve prospěch
// nákupu. Proto se hlídají jmenovitě.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const kod = readFileSync(path.join(KOREN, 'js', 'navratnost.js'), 'utf8');
const sandbox = {};
new Function('globalThis', 'window', kod).call(sandbox, sandbox, undefined);
const N = sandbox.PKNavratnost;

let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
const blizko = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;

pravda('modul se načetl', !!(N && N.spocti));
if (!N || !N.spocti) { console.log(zpravy.join('\n')); process.exit(1); }

/* --- 1) Bez obou cen se nepočítá nic ------------------------------
   Výsledek z poloviny zadání je číslo bez významu — a kdyby se ukázal,
   člověk by ho četl jako odpověď. */
pravda('bez prodejní ceny nevrací výsledek', N.spocti({ kupni: 500000 }) === null);
pravda('bez kupní ceny taky ne', N.spocti({ prodejni: 900000 }) === null);
pravda('a prázdné zadání taky ne', N.spocti({}) === null && N.spocti() === null);

/* --- 2) Náklady kolem koupě jsou taky vložené peníze ---------------
   Kdyby se zhodnocení počítalo jen z kupní ceny, vyšlo by vyšší, než
   doopravdy je — a to u KAŽDÉHO pozemku. */
{
  const r = N.spocti({ kupni: 500000, naklady: 20000, prodejni: 800000, let: 10 });
  pravda('vložené peníze = kupní cena + náklady', r.vlozeno === 520000, `vyšlo ${r.vlozeno}`);
  pravda('a výdělek se počítá proti nim, ne proti kupní ceně',
    r.vydelek === 280000, `vyšlo ${r.vydelek} (z kupní ceny by to bylo 300000)`);
  pravda('zhodnocení se počítá z vložených peněz',
    blizko(r.zhodnoceni, 280000 / 520000 * 100, 0.001), `vyšlo ${r.zhodnoceni}`);
}

/* --- 3) DAŇ Z PŘÍJMU. Tohle je ta položka, kterou rada „přidejte ROI
   kalkulačku" vůbec nezmiňuje — a je to pětina výdělku. ------------- */
{
  const kratce = N.spocti({ kupni: 500000, naklady: 0, prodejni: 800000, let: 3 });
  pravda('při prodeji do deseti let se daň odvede',
    kratce.dan > 0 && blizko(kratce.dan, 300000 * 0.15), `daň vyšla ${kratce.dan}`);
  pravda('a čistý zisk je o ni nižší',
    blizko(kratce.cisty, 300000 - 45000), `vyšlo ${kratce.cisty}`);

  const dlouho = N.spocti({ kupni: 500000, naklady: 0, prodejni: 800000, let: 10 });
  pravda('po deseti letech je příjem osvobozený',
    dlouho.osvobozeno === true && dlouho.dan === 0, JSON.stringify(dlouho));
  pravda('a je to na výsledku vidět — liší se o celou daň',
    dlouho.cisty - kratce.cisty === 45000,
    `rozdíl ${dlouho.cisty - kratce.cisty}`);

  /* Lhůta i sazba se musí dát přepsat: zákon se mění a modul není jeho
     výklad. Kdyby byly napevno, zastaral by web potichu. */
  const jina = N.spocti({ kupni: 500000, prodejni: 800000, let: 6, lhuta: 5 });
  pravda('lhůtu osvobození jde přepsat', jina.osvobozeno === true, JSON.stringify(jina));
  const sazba23 = N.spocti({ kupni: 500000, prodejni: 800000, let: 1, sazba: 23 });
  pravda('a sazbu daně taky', blizko(sazba23.dan, 300000 * 0.23), `daň ${sazba23.dan}`);
}

/* --- 4) ZTRÁTA SE NEDANÍ ------------------------------------------
   Bez téhle podmínky by kalkulačka u prodělku „vrátila daň" a ztráta by
   vyšla MENŠÍ, než je. Chyba, kterou by si nikdo nevšiml, protože
   prodělek nikdo nečeká. */
{
  const r = N.spocti({ kupni: 800000, naklady: 20000, prodejni: 600000, let: 2 });
  pravda('u prodělku se žádná daň nepočítá', r.dan === 0, `daň vyšla ${r.dan}`);
  pravda('a ztráta se nijak nezmenšuje', r.cisty === -220000, `vyšlo ${r.cisty}`);
  pravda('a je poznat, že je to prodělek', r.prodelek === true);
  pravda('zhodnocení je záporné', r.zhodnoceni < 0, `vyšlo ${r.zhodnoceni}`);
}

/* --- 5) ROČNÍ ZHODNOCENÍ SLOŽENĚ, NE PODÍLEM -----------------------
   Dělit zhodnocení počtem let je nadsazené: 100 % za deset let není
   10 % ročně, ale 7,18 %. Rozdíl roste s délkou držby a vždycky nahoru. */
{
  const r = N.spocti({ kupni: 1000000, naklady: 0, prodejni: 2000000, let: 10, lhuta: 10 });
  pravda('zhodnocení 100 % za deset let', blizko(r.zhodnoceni, 100, 0.001), `${r.zhodnoceni}`);
  pravda('ale ročně 7,18 %, ne 10 %',
    blizko(r.rocne, 7.177, 0.01), `vyšlo ${r.rocne} (podílem by to bylo 10)`);

  /* Krátká držba: přepočet na rok dává stovky procent a není to údaj,
     je to iluze. Radši se nepočítá vůbec. */
  const kratka = N.spocti({ kupni: 500000, prodejni: 560000, let: 0.5 });
  pravda('u držby kratší než rok se roční číslo nepočítá',
    kratka.rocne === null, `vyšlo ${kratka.rocne}`);
  const bezLet = N.spocti({ kupni: 500000, prodejni: 560000 });
  pravda('a bez zadané doby taky ne', bezLet.rocne === null, `vyšlo ${bezLet.rocne}`);
}

/* --- 6) Čísla se čtou tolerantně ------------------------------------
   Z inzerátu se kopíruje „450 000 Kč". Kdyby pole spolklo jen holé
   číslice, dostal by člověk prázdný výsledek a nedozvěděl se proč. */
{
  const r = N.spocti({ kupni: '500 000 Kč', prodejni: '800 000', naklady: '20 000', let: '3' });
  pravda('„500 000 Kč" i s mezerou a měnou se přečte',
    r && r.vlozeno === 520000, JSON.stringify(r && r.vlozeno));
  const des = N.spocti({ kupni: 500000, prodejni: 800000, let: '2,5' });
  pravda('a desetinná čárka taky', des && des.osvobozeno === false);
  pravda('nesmysl v poli se bere jako nevyplněno',
    N.spocti({ kupni: 'ahoj', prodejni: 800000 }) === null);
  pravda('a záporná cena taky', N.spocti({ kupni: -5, prodejni: 800000 }) === null);
}

/* --- 7) Nula v nákladech je platná odpověď, ne chybějící údaj ------- */
{
  const r = N.spocti({ kupni: 500000, naklady: 0, prodejni: 500000, let: 1 });
  pravda('prodej za stejnou cenu není ani zisk, ani ztráta',
    r.cisty === 0 && r.zhodnoceni === 0, JSON.stringify(r));
  pravda('a žádná daň se z nuly neplatí', r.dan === 0);
}

console.log('\nNávratnost koupě pozemku');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Návratnost: ' + chyb + ' kontrol neprošlo.'); process.exit(1); }
