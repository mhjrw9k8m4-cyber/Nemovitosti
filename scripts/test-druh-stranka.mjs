// Test: stránky podle druhu pozemku (les, orná půda, stavební…).
//
// Spuštění: node scripts/test-druh-stranka.mjs   (nepotřebuje prohlížeč)
//
// Web měl 77 stránek podle okresů a ani jednu podle druhu, přitom „les na
// prodej" je to, s čím člověk přichází. Tyhle stránky tvrdí dvě čísla —
// kolik je toho druhu nabídek a kolik z nich jsou spoluvlastnické podíly —
// a nesou odkaz „otevřít na mapě", který musí ukázat PRÁVĚ TY nabídky.
// Druh se proto musí brát tímtéž rozřazením, jaké používá mapa i cenový
// model (js/ceny.js); kdyby si stránka rozřazovala po svém, odkaz by
// sliboval jiný počet, než co mapa ukáže.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const req = createRequire(import.meta.url);
const PKH = req(path.join(ROOT, 'js', 'hlidani-logika.js'));
new Function(readFileSync(path.join(ROOT, 'js', 'ceny.js'), 'utf8'))();
const CENY = globalThis.PK_CENY;

let ok = 0, chyb = 0; const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
const cistyText = (h) => h.replace(/ /g, ' ');

pravda('cenový model se načetl', !!(CENY && CENY.druhGroup && CENY.zaMetr));

const vse = JSON.parse(readFileSync(path.join(ROOT, 'data', 'opportunities.json'), 'utf8')).opportunities;
const all = PKH.bezDuplicit(vse);
const DNES = new Date(); DNES.setHours(0, 0, 0, 0);
function poTerminu(o) {
  const m = /(\d{4})-(\d{2})-(\d{2})/.exec((o && o.extra) || '');
  if (!m) return false;
  const t = new Date(+m[1], +m[2] - 1, +m[3]);
  return !isNaN(t) && t < DNES;
}
const aktualni = all.filter((o) => !poTerminu(o));

/* Které stránky mají existovat, se čte ze ZDROJE generátoru — jinak by
   zkouška hlídala jen ty, na které si vzpomenu. */
const gen = readFileSync(path.join(ROOT, 'scripts', 'generate-region-pages.mjs'), 'utf8');
const definice = [...gen.matchAll(/\{ skupina: '([^']+)', soubor: '([^']+)',/g)]
  .map((m) => ({ skupina: m[1], soubor: m[2] }));
pravda('v generátoru jsou vypsané stránky podle druhu', definice.length >= 5,
  `${definice.length} definic`);

const MIN_DRUH = Number((/const MIN_DRUH = (\d+)/.exec(gen) || [])[1] || 0);
const STROP = Number((/const STROP_RADKU = (\d+)/.exec(gen) || [])[1] || 0);
pravda('a mez i strop se ze zdroje přečetly', MIN_DRUH > 0 && STROP > 0,
  `MIN_DRUH ${MIN_DRUH}, STROP_RADKU ${STROP}`);

let stranek = 0;
const spatne = [];
for (const d of definice) {
  const list = aktualni.filter((o) => CENY.druhGroup(o.druh) === d.skupina);
  const cesta = path.join(ROOT, d.soubor);
  if (list.length < MIN_DRUH) {
    if (existsSync(cesta)) spatne.push(`${d.soubor}: druh má jen ${list.length} nabídek, a stránka přesto existuje`);
    continue;
  }
  if (!existsSync(cesta)) { spatne.push(`${d.soubor}: chybí, přitom druh má ${list.length} nabídek`); continue; }
  stranek++;
  const html = cistyText(readFileSync(cesta, 'utf8'));
  // 1) počet nabídek v úvodní větě
  const mc = /Evidujeme <b>([\d\s]+) /.exec(html);
  const psano = mc ? Number(mc[1].replace(/\s/g, '')) : null;
  if (psano !== list.length) spatne.push(`${d.soubor}: psáno ${psano}, v datech ${list.length}`);
  // 2) počet podílů
  const podilu = list.filter((o) => o.podil).length;
  const mp = /Z toho (?:je|jsou) <b>([\d\s]+)<\/b> spoluvlastnick/.exec(html);
  const psanoP = mp ? Number(mp[1].replace(/\s/g, '')) : 0;
  if (psanoP !== podilu) spatne.push(`${d.soubor}: podílů psáno ${psanoP}, v datech ${podilu}`);
  // 3) odkaz na mapu nese ten druh
  const mm = /index\.html\?druh=([^"#]+)#mapa/.exec(html);
  const druhVOdkazu = mm ? decodeURIComponent(mm[1]) : null;
  if (druhVOdkazu !== d.skupina) {
    spatne.push(`${d.soubor}: odkaz na mapu nese „${druhVOdkazu}", stránka je o „${d.skupina}"`);
  }
  // 4) vypsaných řádků nejvýš strop
  const radku = (html.match(/<div class="okr-item">/g) || []).length;
  if (radku > STROP) spatne.push(`${d.soubor}: vypsáno ${radku} řádků, strop je ${STROP}`);
  if (radku !== Math.min(STROP, list.length)) {
    spatne.push(`${d.soubor}: řádků ${radku}, čekáno ${Math.min(STROP, list.length)}`);
  }
  // 5) je v sitemap
  const sm = readFileSync(path.join(ROOT, 'sitemap.xml'), 'utf8');
  if (sm.indexOf('/' + d.soubor) < 0) spatne.push(`${d.soubor}: není v sitemap.xml`);
}
pravda('stránky podle druhu se vygenerovaly', stranek >= 5, `${stranek} stránek`);
pravda('a všechna čísla na nich sedí s daty', spatne.length === 0, spatne.slice(0, 5).join('; '));

/* A nejdůležitější: ten druh v odkazu musí mapa pochopit. Čte se týmž
   slovníkem, jakým ho čte mapa (js/dotaz.js); kdyby se název neshodl,
   mapa by filtr tiše nenastavila a ukázala všechno. */
{
  const D = req(path.join(ROOT, 'js', 'dotaz.js'));
  const znameDruhy = D.DRUHY.map((x) => x[0]);
  const nezname = definice.map((d) => d.skupina).filter((g) => znameDruhy.indexOf(g) === -1);
  pravda('každý druh na stránce zná i slovník mapy',
    nezname.length === 0, nezname.join(', '));
}

/* Ceny za metr v řádcích: týž modul jako mapa — pojistka proti tomu, aby
   se nové stránky rozešly tak, jak se rozešly ty okresní. */
{
  const { mapaSouboru } = await import('./generate-parcel-pages.mjs');
  const podleSouboru = new Map();
  for (const { d, soubor } of mapaSouboru(all).values()) podleSouboru.set(soubor, d);
  let radku = 0; const rozdily = [];
  for (const d of definice) {
    const cesta = path.join(ROOT, d.soubor);
    if (!existsSync(cesta)) continue;
    const html = readFileSync(cesta, 'utf8');
    const re = /<div class="okr-item">([\s\S]*?)<\/div>/g;
    let m;
    while ((m = re.exec(html))) {
      const mh = /<a class="okr-place" href="(pozemek-[^"]+\.html)"/.exec(m[1]);
      if (!mh) continue;
      const o = podleSouboru.get(mh[1]);
      if (!o) continue;
      radku++;
      const mz = /okr-zametr"[^>]*>([\d\s ]+)[\s ]*Kč\/m²/.exec(m[1]);
      const psano = mz ? Number(mz[1].replace(/[\s ]/g, '')) : null;
      const ceka = CENY.zaMetr(o);
      if (ceka == null) { if (psano != null) rozdily.push(`${d.soubor} ${o.place}: ${psano} u podílu bez zlomku`); }
      else if (psano !== Math.round(ceka)) rozdily.push(`${d.soubor} ${o.place}: psáno ${psano}, modul ${Math.round(ceka)}`);
    }
  }
  pravda('řádků na kontrolu ceny je dost', radku > 200, `${radku} řádků`);
  pravda('cena za metr je tatáž jako v mapě', rozdily.length === 0, rozdily.slice(0, 4).join('; '));
}

console.log('\nStránky podle druhu pozemku');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Druhy: ' + chyb + ' kontrol neprošlo.'); process.exit(1); }
process.exit(0);
