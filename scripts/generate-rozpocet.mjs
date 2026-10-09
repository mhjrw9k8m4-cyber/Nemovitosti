/* Tenký řez dat pro stránku „Na co mám?".
   ====================================================================
   Stránka odpovídá na otázku, kterou má kupující první a web ji dosud
   neuměl: mám milion, kde za to něco koupím. Odpověď se NEMODELUJE —
   počítají se skutečné nabídky, které se do rozpočtu vejdou. Tím je to
   fakt („v okrese Benešov je takových sedm"), ne odhad.

   PROČ VLASTNÍ SOUBOR A NE data/opportunities.json. Ten má 633 kB
   (79 kB po kompresi) a nese popisy, odkazy, souřadnice a termíny —
   z toho stránka nepotřebuje nic. Tady stačí čtyři čísla na nabídku:
   okres, druh, cena, výměra. Měřeno níž při každém sestavení.

   POLE MÍSTO OBJEKTŮ. `{"okres":3,"druh":1,"cena":450000,"vymera":1200}`
   stojí 48 bajtů, `[3,1,450000,1200]` devatenáct. Při dvou tisících
   nabídkách je to rozdíl 58 kB proti 23 kB, a jména polí by se stejně
   opakovala dva tisíckrát.

   CO SE SEM NEDOSTANE:
   · dražby a exekuce — vyvolávací cena není cena, za kterou se koupí,
     a smíchat ji s nabídkovou by rozpočet posunulo dolů (a tedy lhalo
     ve prospěch webu);
   · spoluvlastnické podíly — v ceně je zlomek, ve výměře celá parcela,
     takže by se tvářily jako největší trháky přesně tam, kde člověk
     hledá podle rozpočtu;
   · ceny, kterým cenový model nevěří (`pochybna`) — totéž, co jinde na
     webu: tvrdit něco cenou, před kterou sám varuju, nejde.
   ==================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require2 = createRequire(import.meta.url);

/** Skupiny druhů, ve kterých lidé hledají. Pořadí je i pořadí v nabídce. */
export const DRUHY = ['Stavební', 'Zemědělská', 'Les', 'Zahrada', 'Ostatní'];

/** Mapuje druh z dat na jednu z pěti skupin. */
export function skupinaDruhu(s) {
  s = String(s || '').toLowerCase();
  if (s.indexOf('stav') >= 0 || s.indexOf('zastav') >= 0) return 0;
  if (s.indexOf('les') >= 0) return 2;
  if (s.indexOf('zahrad') >= 0) return 3;
  if (/orná|orna|louk|travn|pastvin|zeměděl|zemedel|chmel|vinice|sad|ovocn|pole/.test(s)) return 1;
  return 4;
}

/**
 * Složí řez z nabídek.
 * @returns {{okresy: string[], druhy: string[], n: Array<number[]>}}
 */
export function slozRez(nabidky, { jePochybna, souborOkresu } = {}) {
  const okresy = [];
  const cisloOkresu = new Map();
  const n = [];
  for (const o of nabidky) {
    if (!o || o.type !== 'sale') continue;
    if (o.podil) continue;
    if (!(o.price > 0) || !(o.area > 0)) continue;
    if (!o.okres) continue;
    if (jePochybna && jePochybna(o)) continue;
    if (!cisloOkresu.has(o.okres)) { cisloOkresu.set(o.okres, okresy.length); okresy.push(o.okres); }
    n.push([cisloOkresu.get(o.okres), skupinaDruhu(o.druh), Math.round(o.price), Math.round(o.area)]);
  }
  /* Pořadí dané daty, ne pořadím v souboru: jinak by se řez měnil při
     každém přeskládání dat a robot by commitoval soubor beze změny
     obsahu. Týž důvod jako u data/zlevneni.json. */
  const prejmenuj = okresy.map((x, i) => [x, i]).sort((a, b) => a[0].localeCompare(b[0], 'cs'));
  const nove = new Map(prejmenuj.map(([jm], i) => [cisloOkresu.get(jm), i]));
  /* ODKAZ NA OKRES SE NEHÁDÁ, DODÁ HO GENERÁTOR. Stránka by si jméno
     souboru musela složit z názvu okresu (odstranit háčky, nahradit
     mezery) — a první okres, u kterého se to rozejde, pošle člověka
     na 404. Okresní stránka navíc nevzniká všude: kde není, zůstane
     prázdno a odkaz se nevypíše. */
  return {
    okresy: prejmenuj.map(([jm]) => jm),
    soubory: prejmenuj.map(([jm]) => (souborOkresu ? souborOkresu(jm) || '' : '')),
    druhy: DRUHY,
    n: n.map((r) => [nove.get(r[0]), r[1], r[2], r[3]])
      .sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || a[3] - b[3]),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const PKH = require2(path.join(ROOT, 'js', 'hlidani-logika.js'));
  const syrova = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'opportunities.json'), 'utf8')).opportunities || [];
  const nabidky = PKH.bezDuplicit(syrova);

  /* Týž cenový model jako mapa, stránka pozemku i rozesílač pošty. */
  new Function(fs.readFileSync(path.join(ROOT, 'js', 'ceny.js'), 'utf8'))();
  const CENY = globalThis.PK_CENY;
  if (!CENY || !CENY.postav) {
    console.error('::error::js/ceny.js se nenačetl — řez by nesl i ceny, kterým web nevěří');
    process.exit(1);
  }
  const MODEL = CENY.postav(nabidky);
  const jePochybna = (o) => {
    if (MODEL.neduveryhodna && MODEL.neduveryhodna(o)) return true;
    const od = MODEL.odhad && MODEL.odhad(o);
    return !!(od && od.pochybna);
  };

  const slug = (x) => String(x).toLowerCase()
    .replace(/[áä]/g, 'a').replace(/[čć]/g, 'c').replace(/ď/g, 'd').replace(/[éěë]/g, 'e')
    .replace(/[íï]/g, 'i').replace(/ň/g, 'n').replace(/[óö]/g, 'o').replace(/ř/g, 'r')
    .replace(/[šś]/g, 's').replace(/ť/g, 't').replace(/[úůü]/g, 'u').replace(/[ýÿ]/g, 'y')
    .replace(/[žź]/g, 'z').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const souborOkresu = (jm) => {
    const f = `pozemky-okres-${slug(jm)}.html`;
    return fs.existsSync(path.join(ROOT, f)) ? f : '';
  };
  const rez = slozRez(nabidky, { jePochybna, souborOkresu });
  const cesta = path.join(ROOT, 'data', 'rozpocet.json');
  const telo = JSON.stringify(rez);
  /* Nepsat, když se nic nezměnilo: robot sestavuje čtyřikrát denně
     a soubor se stejným obsahem by dělal prázdné commity. */
  let drive = '';
  try { drive = fs.readFileSync(cesta, 'utf8'); } catch (e) { /* první běh */ }
  if (drive !== telo) fs.writeFileSync(cesta, telo, 'utf8');

  const cele = fs.statSync(path.join(ROOT, 'data', 'opportunities.json')).size;
  const bezOdkazu = rez.soubory.filter((x) => !x).length;
  if (bezOdkazu) console.log(`  (${bezOdkazu} okresů nemá vlastní stránku — odkaz se u nich nevypíše)`);
  console.log(`Řez pro rozpočet: ${rez.n.length} nabídek v ${rez.okresy.length} okresech, `
    + `${Math.round(telo.length / 1024)} kB (celá data ${Math.round(cele / 1024)} kB)`
    + (drive === telo ? ' — beze změny' : ''));
}
