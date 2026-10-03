/* Test: odhad ceny na okresních, krajských a druhových stránkách.
 *
 * Spuštění: node scripts/test-odhad-regiony.mjs
 *
 * PROČ. Mapa i stránka pozemku u každé nabídky říkají, jak je drahá
 * proti okolí. Na stránkách, kam lidé chodí z vyhledávačů, stál jen holý
 * ceník — kdo přišel odtud, neměl jak poznat, jestli je 1 200 Kč/m²
 * v tom okrese hodně, nebo málo.
 *
 * Hlídá se, že se odznaky nerozejdou s modelem: každý řádek dostane
 * přesně to, co o té nabídce říká js/ceny.js, a hlavně že se DRŽÍ JEHO
 * OPATRNOSTI — u spoluvlastnického podílu se o slevě nemluví (cena je za
 * zlomek, výměra celá), neuvěřitelná sleva není nabídka, ale varování.
 * Bez toho by stránky mohly doporučovat právě ty nabídky, před kterými
 * mapa varuje.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { mapaSouboru } from './generate-parcel-pages.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const req = createRequire(import.meta.url);
req(path.join(ROOT, 'js', 'ceny.js'));
const CENY = globalThis.PK_CENY;

let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

pravda('cenový model se načetl', !!(CENY && CENY.postav), 'js/ceny.js nevydal PK_CENY.postav');

/* Model se staví ze STEJNÉ hromádky jako generátor: syrová data bez
   duplicit. Kdyby se tu vzaly jen nabídky, které dostaly vlastní
   stránku (což je podmnožina), vyšly by u hraničních nabídek jiné meze
   a kontrola by hlásila rozchod, který na stránce není.
   Vstup je tedy týž záměrně — úsudek pod tím je psaný nezávisle. */
const PKH = req(path.join(ROOT, 'js', 'hlidani-logika.js'));
const syrova = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'opportunities.json'), 'utf8')).opportunities || [];
const vsechny = PKH.bezDuplicit(syrova);
const MODEL = CENY.postav(vsechny);

/* Řádek se přiřazuje k nabídce podle ÚDAJŮ V ŘÁDKU, ne přes soubor.
   Dvě nabídky se shodnou cenou i výměrou v téže obci dostanou JEDNU
   stránku pozemku (slučuje je mapaSouboru), ale na okresní stránce jsou
   to dva řádky — v Bohumíně se takhle liší „orná půda" a „stavební
   pozemek", a ta druhá vlastní stránku vůbec nemá. Podle odkazu by se
   kontrola u jednoho z nich trefila do té druhé nabídky. */
const cislo = (x) => Number(String(x || '').replace(/[^\d]/g, '')) || 0;
const klic = (place, druh, area, price) =>
  [String(place || '').trim(), String(druh || '').trim().toLowerCase(), area, price].join('|');
const podleUdaju = new Map();
for (const o of vsechny) podleUdaju.set(klic(o.place, o.druh, o.area || 0, o.price || 0), o);

/* Co MÁ u nabídky stát — opsáno z js/main.js, ne z generátoru. Kdyby se
   to počítalo týmž kódem jako stránka, kontrola by jen opisovala sama
   sebe a prošla by i s úplně obrácenou úvahou. */
function cekano(o) {
  const od = MODEL.odhad(o);
  if (!od || !od.podleVelikosti) return '';
  if (od.pochybna) return 'overit';
  if (od.nejisty && od.podOdhadem >= 25 && !od.podil) return 'overit';
  if (od.podOdhadem >= 25 && !od.podil) return 'sleva';
  return '';
}

const stranky = fs.readdirSync(ROOT).filter((f) =>
  /^pozemky-okres-.+\.html$/.test(f) || /^pozemky-.+-kraj\.html$/.test(f) ||
  /^pozemky-(stavebni|lesni|louka|orna-puda|zahrada|vinice-sad|od-lidi)\.html$/.test(f));
pravda('našly se regionální a druhové stránky', stranky.length > 50, `nalezeno ${stranky.length}`);

let radkuCelkem = 0, sleva = 0, overit = 0;
const spatne = [];
for (const f of stranky) {
  const html = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const radky = html.split('<div class="okr-item">').slice(1);
  for (const r of radky) {
    const m = /href="(pozemek-[^"]+\.html)"/.exec(r);
    if (!m) continue;
    const place = (/class="okr-place"[^>]*>([^<]+)/.exec(r) || [, ''])[1].trim();
    const meta = (/class="okr-meta"[^>]*>([\s\S]*?)<\/span>/.exec(r) || [, ''])[1];
    const druh = meta.split('·')[0].replace(/<[^>]*>/g, '').trim();
    const area = cislo((/<b>([\d\s\u00a0]+)\s*m²<\/b>/.exec(r) || [, ''])[1]);
    const price = cislo((/class="okr-cena"><b>([^<]*)<\/b>/.exec(r) || [, ''])[1]);
    const o = podleUdaju.get(klic(place, druh, area, price));
    if (!o) continue;
    radkuCelkem++;
    const je = /okr-sleva/.test(r) ? 'sleva' : (/okr-overit/.test(r) ? 'overit' : '');
    if (je === 'sleva') sleva++;
    if (je === 'overit') overit++;
    const ma = cekano(o);
    if (je !== ma) spatne.push(`${f} → ${m[1]}: je „${je || '—'}", má být „${ma || '—'}"`);
  }
}

/* Pojistky proti měření na prázdnu: bez řádků, bez jediné slevy a bez
   jediného varování by tvrzení níž neplatilo o ničem. */
pravda('prošly se stovky řádků', radkuCelkem > 300, `řádků ${radkuCelkem}`);
pravda('a aspoň někde se sleva opravdu ukazuje', sleva > 0, `slev ${sleva}`);
pravda('a aspoň někde stojí varování „cena k ověření"', overit > 0, `varování ${overit}`);
pravda('žádný řádek se nerozchází s cenovým modelem', spatne.length === 0,
  spatne.slice(0, 4).join(' | '));

/* A ta nejdůležitější opatrnost zvlášť, ať je vidět i v názvu kontroly. */
const podilySeSlevou = vsechny.filter((o) => o.podil && cekano(o) === 'sleva');
pravda('u spoluvlastnického podílu se o slevě nemluví nikdy',
  podilySeSlevou.length === 0, `podílů se slevou ${podilySeSlevou.length}`);

console.log('\nOdhad ceny na regionálních stránkách');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Odhad na regionálních stránkách: ' + chyb + ' kontrol neprošlo.'); process.exit(1); }
process.exit(0);
