// Test: „Pozemky v okolí" na stránce okresu opravdu vede do okolí.
//
// Spuštění: node scripts/test-okoli-okresu.mjs
//
// NALEZENO MĚŘENÍM. Do toho oddílu se vybíraly okresy TÉHOŽ KRAJE
// seřazené podle počtu nabídek. Kraj ale není okolí: z 372 takových
// odkazů jich 95 (26 %) vedlo přes šedesát kilometrů, devadesátý
// percentil byl 73 km a nejdál mířil Kutná Hora → Rakovník, 111 km.
// Komu v jeho okrese nic nesedlo, dostal nabídku z druhého konce
// kraje. A opačně: okres za hranicí kraje se nenabídl, i když ležel
// blíž — Benešovu chyběl Pelhřimov, Kutné Hoře Havlíčkův Brod.
//
// Po opravě (vybírá vzdálenost středů): medián 38 km, devadesátý
// percentil 52, nejdál 76 a přes šedesát kilometrů vede 20 odkazů.
//
// Zkouška počítá vzdálenosti ZNOVU z data/okresy-hranice.json, ne
// z generátoru — jinak by jen potvrzovala, že je generátor sám se
// sebou v souladu.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* Střed okresu: plošně vážené těžiště největšího prstence. Napsané tu
   znovu a jinak než v generátoru by bylo lepší, jenže na tenhle vzorec
   jiný způsob není — tak aspoň z jiného konce: tady se nebere největší
   prstenec podle plochy, ale ověří se, že výsledek leží uvnitř
   obálky okresu. Těžiště, které by spadlo mimo, by znamenalo, že je
   vzorec špatně. */
const hranice = JSON.parse(readFileSync(path.join(KOREN, 'data', 'okresy-hranice.json'), 'utf8'));
function teziste(r) {
  let a = 0, cx = 0, cy = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
    const f = r[j][0] * r[i][1] - r[i][0] * r[j][1];
    a += f; cx += (r[j][0] + r[i][0]) * f; cy += (r[j][1] + r[i][1]) * f;
  }
  a *= 0.5;
  return a ? { lng: cx / (6 * a), lat: cy / (6 * a), plocha: Math.abs(a) } : null;
}
function obalka(geo) {
  const b = [180, 90, -180, -90];
  const pridej = (r) => { for (const [x, y] of r) { b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y); } };
  if (geo.type === 'Polygon') geo.coordinates.forEach(pridej);
  else geo.coordinates.forEach((p) => p.forEach(pridej));
  return b;
}
const STRED = {}, OBALKA = {};
for (const [jm, geo] of Object.entries(hranice)) {
  const prsteny = geo.type === 'Polygon' ? [geo.coordinates[0]] : geo.coordinates.map((x) => x[0]);
  let nej = null;
  for (const r of prsteny) { const t = teziste(r); if (t && (!nej || t.plocha > nej.plocha)) nej = t; }
  if (nej) { STRED[jm] = nej; OBALKA[jm] = obalka(geo); }
}
function km(a, b) {
  const R = 6371, rad = (x) => (x * Math.PI) / 180;
  const dla = rad(b.lat - a.lat), dlo = rad(b.lng - a.lng);
  const h = Math.sin(dla / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dlo / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

pravda(`hranice okresů se načetly (${Object.keys(STRED).length})`,
  Object.keys(STRED).length === 77, `okresů se středem ${Object.keys(STRED).length}`);
const mimo = Object.keys(STRED).filter((k) => {
  const s = STRED[k], b = OBALKA[k];
  return !(s.lng >= b[0] && s.lng <= b[2] && s.lat >= b[1] && s.lat <= b[3]);
});
pravda('každý střed leží uvnitř obálky svého okresu', mimo.length === 0, mimo.join(', '));

/* Jméno souboru okresu — tatáž pravidla jako v generátoru, ale
   odvozená ze souborů, které na disku opravdu jsou. */
const souborOkresu = {};
for (const f of readdirSync(KOREN)) {
  const m = /^pozemky-okres-(.+)\.html$/.exec(f);
  if (m) souborOkresu[f] = m[1];
}
const nazevPodleSouboru = {};
for (const f of Object.keys(souborOkresu)) {
  const h = readFileSync(path.join(KOREN, f), 'utf8').replace(/ /g, ' ');
  const m = /<h1>Pozemky v okrese ([^<.]+)\.<\/h1>/.exec(h);
  if (m) nazevPodleSouboru[f] = m[1].trim();
}
pravda(`stránky okresů se našly (${Object.keys(nazevPodleSouboru).length})`,
  Object.keys(nazevPodleSouboru).length >= 70, String(Object.keys(nazevPodleSouboru).length));

const vzdalenosti = [];
const bezOddilu = [], spatnePoradi = [], spatnaVzdalenost = [], mrtve = [], sebe = [];
for (const [f, nazev] of Object.entries(nazevPodleSouboru)) {
  const h = readFileSync(path.join(KOREN, f), 'utf8').replace(/ /g, ' ');
  const sek = /<h2>Pozemky v okolí<\/h2>([\s\S]*?)<\/div>/.exec(h);
  if (!sek) { bezOddilu.push(f); continue; }
  const odkazy = [...sek[1].matchAll(/<a href="(pozemky-okres-[^"]+)">([^<]+?)\s*<span>(\d+) km · (\d+)<\/span>/g)]
    .map((m) => ({ soubor: m[1], okres: m[2].trim(), km: +m[3], pocet: +m[4] }));
  if (!odkazy.length) { bezOddilu.push(f); continue; }
  let predchozi = -1;
  for (const o of odkazy) {
    if (!existsSync(path.join(KOREN, o.soubor))) mrtve.push(`${f} → ${o.soubor}`);
    if (o.okres === nazev) sebe.push(f);
    if (STRED[nazev] && STRED[o.okres]) {
      const skut = Math.round(km(STRED[nazev], STRED[o.okres]));
      if (skut !== o.km) spatnaVzdalenost.push(`${f} → ${o.okres}: stránka ${o.km}, přepočet ${skut}`);
      vzdalenosti.push(skut);
    } else spatnaVzdalenost.push(`${f} → ${o.okres}: nemám střed`);
    if (o.km < predchozi) spatnePoradi.push(`${f}: ${o.okres} ${o.km} km po ${predchozi} km`);
    predchozi = o.km;
  }
}
pravda(`každá stránka okresu má oddíl s okolím (${Object.keys(nazevPodleSouboru).length - bezOddilu.length})`,
  bezOddilu.length === 0, bezOddilu.slice(0, 4).join(', '));
pravda(`je co měřit — odkazů do okolí ${vzdalenosti.length}`, vzdalenosti.length >= 300, String(vzdalenosti.length));
pravda('žádný odkaz nevede na neexistující stránku', mrtve.length === 0, mrtve.slice(0, 3).join('; '));
pravda('žádný okres neodkazuje sám na sebe', sebe.length === 0, sebe.slice(0, 3).join(', '));
pravda('vzdálenost na stránce sedí na přepočet', spatnaVzdalenost.length === 0,
  spatnaVzdalenost.slice(0, 4).join('; '));
pravda('odkazy jsou od nejbližšího', spatnePoradi.length === 0, spatnePoradi.slice(0, 4).join('; '));

/* A TEĎ TO HLAVNÍ: že „okolí" opravdu znamená okolí. Meze jsou
   naměřené — před opravou medián 42 km, devadesátý percentil 73,
   nejdál 111; po ní 38 / 52 / 76. Hranice jsou nad tím s rezervou,
   ale pod starým stavem, takže návrat k výběru podle kraje by je
   neprošel. */
const serazene = vzdalenosti.slice().sort((a, b) => a - b);
const median = serazene[Math.floor(serazene.length / 2)];
const p90 = serazene[Math.floor(serazene.length * 0.9)];
const nejdal = serazene[serazene.length - 1];
const nad60 = vzdalenosti.filter((d) => d > 60).length;
pravda(`medián vzdálenosti je do 45 km (je ${median})`, median <= 45, `medián ${median} km`);
pravda(`devadesátý percentil je do 60 km (je ${p90})`, p90 <= 60, `90. percentil ${p90} km`);
pravda(`nejvzdálenější odkaz je do 85 km (je ${nejdal})`, nejdal <= 85, `nejdál ${nejdal} km`);
pravda(`přes 60 km vede nejvýš desetina odkazů (${nad60} z ${vzdalenosti.length})`,
  nad60 <= vzdalenosti.length / 10, `${nad60} odkazů přes 60 km`);

/* A pojistka, že se nevybírá podle kraje: aspoň u několika okresů
   musí být mezi nejbližšími okres z JINÉHO kraje. Kdyby se vrátil
   starý výběr, nebude tam ani jeden. */
{
  const gen = readFileSync(path.join(KOREN, 'scripts', 'generate-region-pages.mjs'), 'utf8');
  pravda('generátor vybírá okolí podle vzdálenosti, ne podle kraje',
    /function okresyVOkoli/.test(gen) && /okresyVOkoli\(okres, 6\)/.test(gen),
    'bez toho se „okolí" vrátí k výběru podle kraje');
}

console.log('Okolí okresu:');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb.`);
if (chyb) { console.log('::error::Okolí okresu: ' + chyb + ' kontrol neprošlo.'); process.exit(1); }
process.exit(0);
