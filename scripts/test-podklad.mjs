// Test: mapový podklad je tlumený a nepřebíjí web.
//
// Spuštění: node scripts/test-podklad.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome)
//
// Podklad z OpenStreetMap je sám o sobě pestrý: zelené lesy, modrá voda,
// lososové silnice. Na zeleno-béžovém webu to byla nejbarevnější plocha
// z celé stránky — mapa netvořila pozadí, ale pralas se zbytkem. Tlumí ji
// filtr v pravidle .pk-basemap.
//
// Filtr je snadné omylem vypnout nebo přetáhnout, a ani jedno není v kódu
// vidět: mapa pořád funguje. Proto se tu MĚŘÍ, co filtr s barvami udělá.
// Skutečné dlaždice se sem stáhnout nedají (schránka nemá ven), takže se
// filtr pouští na přesné barvy, které standardní OSM dlaždice používá.
//
// Dvě hranice proti sobě:
//   – barevnost musí klesnout (jinak mapa dál křičí),
//   – popisky obcí musí zůstat čitelné (jinak jsme mapu vybělili do ztracena).
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';

let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

const css = readFileSync(new URL('../css/styles.css', import.meta.url), 'utf8');
const m = css.match(/\.pk-basemap\{[\s\S]*?filter:([^;]+);/);
pravda('podklad má v CSS filtr', !!m, 'pravidlo .pk-basemap filter nenalezeno');
const filtr = m ? m[1].trim() : 'none';

// Barvy standardní dlaždice openstreetmap.org (styl „Standard").
const DLAZDICE = {
  les: '#ADD19E', voda: '#AAD3DF', louka: '#CDEBB0', pole: '#EEF0D5',
  zastavba: '#E0DFDF', budova: '#D9D0C9', 'silnice hlavní': '#F9B29C',
  'silnice vedlejší': '#FCD6A4', dálnice: '#E892A2', park: '#C8FACC',
};
// Popisky a podklad pod nimi — na čitelnost.
const POPISKY = { obec: '#333333', ulice: '#6C6C6C', papír: '#F2EFE9' };

const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));
const p = await (await prohlizec.newContext()).newPage();

/** Projede vzorky filtrem a vrátí výslednou barvu každého z nich. */
async function pres(filtr, vzorky) {
  await p.setContent(`<style>body{margin:0}.t{width:24px;height:24px;display:inline-block}
    #f{filter:${filtr}}</style><div id="f">` +
    Object.entries(vzorky).map(([k, v]) => `<span class="t" data-k="${k}" style="background:${v}"></span>`).join('') +
    '</div>');
  await p.waitForTimeout(150);
  const out = {};
  for (const k of Object.keys(vzorky)) {
    const png = await (await p.$(`.t[data-k="${k}"]`)).screenshot();
    out[k] = await p.evaluate(async (d) => {
      const i = new Image(); i.src = 'data:image/png;base64,' + d; await i.decode();
      const c = document.createElement('canvas'); c.width = i.width; c.height = i.height;
      const x = c.getContext('2d'); x.drawImage(i, 0, 0);
      const q = x.getImageData(12, 12, 1, 1).data; return [q[0], q[1], q[2]];
    }, png.toString('base64'));
  }
  return out;
}
/** Barevnost pixelu: rozdíl nejsilnější a nejslabší složky. 0 = šedá. */
const barevnost = (rgb) => Math.max(...rgb) - Math.min(...rgb);
function pomer(a, b) {
  const l = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const x = l(a), y = l(b), hi = Math.max(x, y), lo = Math.min(x, y);
  return (hi + 0.05) / (lo + 0.05);
}

// --- 1) Barevnost podkladu klesne ------------------------------------
const bez = await pres('none', DLAZDICE);
const s = await pres(filtr, DLAZDICE);
const klice = Object.keys(DLAZDICE);
const prumBez = klice.reduce((a, k) => a + barevnost(bez[k]), 0) / klice.length;
const prumS = klice.reduce((a, k) => a + barevnost(s[k]), 0) / klice.length;
const maxS = Math.max(...klice.map((k) => barevnost(s[k])));
const nejvic = klice.slice().sort((a, b) => barevnost(s[b]) - barevnost(s[a]))[0];

pravda('filtr barevnost podkladu opravdu srazí', prumS <= prumBez * 0.55,
  `z ${prumBez.toFixed(0)} na ${prumS.toFixed(0)} — to je jen o ${(100 - prumS / prumBez * 100).toFixed(0)} %`);
pravda('průměrná barevnost je nízká', prumS <= 18, `vyšlo ${prumS.toFixed(1)}`);
pravda('ani nejbarevnější plocha nekřičí', maxS <= 26,
  `nejbarevnější je „${nejvic}" s ${maxS}`);
pravda('podklad je světlý, aby na něm tečky vynikly',
  klice.every((k) => (s[k][0] + s[k][1] + s[k][2]) / 3 >= 170),
  klice.filter((k) => (s[k][0] + s[k][1] + s[k][2]) / 3 < 170).join(', '));

// --- 2) Ale ne tak, aby se vybělily popisky --------------------------
const t = await pres(filtr, POPISKY);
const obec = pomer(t.obec, t['papír']);
const ulice = pomer(t.ulice, t['papír']);
pravda('názvy obcí zůstanou na podkladu dobře čitelné', obec >= 7,
  `vyšlo ${obec.toFixed(2)} : 1 — filtr mapu vybělil`);
pravda('a názvy ulic aspoň rozeznatelné', ulice >= 3.4, `vyšlo ${ulice.toFixed(2)} : 1`);

// --- 3) Tečky pozemků musí být proti podkladu vidět ------------------
// Podklad je teď skoro šedý; smysl to má jen tehdy, když na něm kategorie
// jasně vystoupí. Bere se přímo z proměnných v CSS, ne z opsaných hodnot.
const tokeny = {};
for (const n of ['--c-sale', '--c-drazba', '--c-exekuce']) {
  const r = css.match(new RegExp(n + ':(#[0-9A-Fa-f]{6})'));
  if (r) tokeny[n] = r[1];
}
pravda('kategorie mají v CSS svoje barvy', Object.keys(tokeny).length === 3, JSON.stringify(tokeny));
const papir = t['papír'];
for (const [n, h] of Object.entries(tokeny)) {
  const rgb = [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const k = pomer(rgb, papir);
  pravda(`${n} je proti podkladu vidět`, k >= 3,
    `jen ${k.toFixed(2)} : 1 — tečka na mapě splývá`);
}

await prohlizec.close();
console.log('\nMapový podklad — tlumený, ale ne vybělený');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Podklad mapy: ' + chyb + ' kontrol neprošlo.');
  process.exit(1);
}
process.exit(0);
