// Testy opakované kontroly odkazů a fotek (js/opakovana-kontrola.js).
//
// Síť se tu nepoužívá — testuje se rozhodování nad výsledky pokusů.
// Právě tahle část rozhoduje, jestli se inzerát označí za vadný kvůli
// skutečné chybě, nebo kvůli desetivteřinovému výpadku cizího serveru.
//
// Spuštění: node scripts/test-opakovana.mjs
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const K = createRequire(import.meta.url)(path.join(ROOT, 'js', 'opakovana-kontrola.js'));

let bezi = 0, spadlo = 0;
function tvrdi(popis, podminka, detail) {
  bezi++;
  if (!podminka) { spadlo++; console.log(`  ✕ ${popis}${detail ? '\n      ' + detail : ''}`); }
}
const odpoved = (stav, url, typ) => ({ stav, url: url || null, typ: typ || '', chyba: null });
const selhani = (chyba) => ({ stav: 0, url: null, typ: '', chyba: chyba || 'ETIMEDOUT' });

const URL_ = 'https://www.bezrealitky.cz/nemovitosti/123';

/* ---------- odkazy ---------- */

tvrdi('odkaz, který hned odpoví, je v pořádku',
  K.vyhodnotOdkaz(URL_, [odpoved(200, URL_)]).stav === 'ok');

tvrdi('odkaz, který uspěje až napotřetí, je v pořádku',
  K.vyhodnotOdkaz(URL_, [selhani(), selhani('ECONNRESET'), odpoved(200, URL_)]).stav === 'ok',
  JSON.stringify(K.vyhodnotOdkaz(URL_, [selhani(), selhani('ECONNRESET'), odpoved(200, URL_)])));

const trojiVypadek = K.vyhodnotOdkaz(URL_, [selhani(), selhani(), selhani()]);
tvrdi('třikrát neúspěšné spojení → nedostupný, ne mrtvý', trojiVypadek.stav === 'nedostupny', JSON.stringify(trojiVypadek));
tvrdi('hláška zmíní počet pokusů', /3krát/.test(trojiVypadek.msg), trojiVypadek.msg);

tvrdi('jediná 503 při údržbě neznamená mrtvý odkaz',
  K.vyhodnotOdkaz(URL_, [odpoved(503), odpoved(503), odpoved(503)]).stav === 'nedostupny');

tvrdi('dvakrát 404 → odkaz je mrtvý',
  K.vyhodnotOdkaz(URL_, [odpoved(404), odpoved(404)]).stav === 'mrtvy');

tvrdi('404 a pak úspěch → v pořádku (server se probral)',
  K.vyhodnotOdkaz(URL_, [odpoved(404), odpoved(200, URL_)]).stav === 'ok');

tvrdi('přesměrování v rámci webu je v pořádku',
  K.vyhodnotOdkaz(URL_, [odpoved(200, 'https://www.bezrealitky.cz/nabidka/123-prodej')]).stav === 'ok');

const jinam = K.vyhodnotOdkaz(URL_, [odpoved(200, 'https://parkovaci-stranka.example/?ad=1')]);
tvrdi('přesměrování na cizí doménu se hlásí', jinam.stav === 'presmerovan', JSON.stringify(jinam));
tvrdi('hláška řekne, kam odkaz vede', /parkovaci-stranka\.example/.test(jinam.msg), jinam.msg);

tvrdi('www. se nepočítá jako jiná doména',
  K.vyhodnotOdkaz('https://bezrealitky.cz/a', [odpoved(200, 'https://www.bezrealitky.cz/a')]).stav === 'ok');

tvrdi('bez pokusů → nedostupný, ne mrtvý', K.vyhodnotOdkaz(URL_, []).stav === 'nedostupny');

/* ---------- fotky ---------- */
const FOTO = 'https://x.supabase.co/storage/v1/object/public/listing-photos/a.jpg';

tvrdi('dostupná fotka projde',
  K.vyhodnotFotku(FOTO, [odpoved(200, FOTO, 'image/jpeg')]).stav === 'ok');

tvrdi('smazaná fotka se pozná (dvakrát 404)',
  K.vyhodnotFotku(FOTO, [odpoved(404), odpoved(404)]).stav === 'chybi');

const neniObrazek = K.vyhodnotFotku(FOTO, [odpoved(200, FOTO, 'text/html; charset=utf-8')]);
tvrdi('chybová stránka místo fotky se pozná', neniObrazek.stav === 'nenifotka', JSON.stringify(neniObrazek));

tvrdi('dočasný výpadek úložiště fotku neodsoudí',
  K.vyhodnotFotku(FOTO, [selhani(), selhani(), selhani()]).stav === 'nedostupny');

/* ---------- otisk fotky ---------- */

// Umělé jasy 9×8. Dvě „fotky" téhož motivu se liší jen mírně.
function jasy(fn) {
  const out = [];
  for (let y = 0; y < 8; y++) for (let x = 0; x < 9; x++) out.push(fn(x, y));
  return out;
}
const motiv = jasy((x, y) => 40 + x * 18 + y * 4);                    // plynulý přechod
const motivJinakOrezany = jasy((x, y) => 44 + x * 18 + y * 4 + ((x + y) % 2));  // + šum z komprese
const jinyMotiv = jasy((x, y) => 200 - x * 9 + ((y * 37) % 50));

const o1 = K.otisk(motiv), o2 = K.otisk(motivJinakOrezany), o3 = K.otisk(jinyMotiv);
tvrdi('otisk má 16 znaků', o1 && o1.length === 16, String(o1));
tvrdi('tentýž motiv má stejný nebo skoro stejný otisk', K.jeStejnaFotka(o1, o2),
  `${o1} vs ${o2}, rozdíl ${K.vzdalenostOtisku(o1, o2)} bitů`);
tvrdi('jiný motiv se nepovažuje za kopii', !K.jeStejnaFotka(o1, o3),
  `${o1} vs ${o3}, rozdíl ${K.vzdalenostOtisku(o1, o3)} bitů`);
tvrdi('shodné otisky mají vzdálenost nula', K.vzdalenostOtisku(o1, o1) === 0);
tvrdi('málo dat → žádný otisk', K.otisk([1, 2, 3]) === null);
tvrdi('chybějící otisk se neporovnává', K.vzdalenostOtisku(o1, null) === null);

/* ---------- pomocné ---------- */
tvrdi('doména se čte bez www', K.domena('https://www.Seznam.CZ/a/b') === 'seznam.cz');
tvrdi('nesmyslná adresa nevyhodí výjimku', K.domena('nesmysl') === '');

console.log(`\nOpakovaná kontrola odkazů a fotek: ${bezi} testů`);
if (spadlo) { console.error(`\n${spadlo} z ${bezi} NEPROŠLO.`); process.exit(1); }
console.log('Všechny prošly.\n');
