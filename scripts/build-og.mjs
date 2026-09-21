// Náhledové obrázky pro sdílení (Open Graph) — jeden pro každý kraj a okres.
//
// Spuštění: node scripts/build-og.mjs
//   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome)
//
// PROČ ZVLÁŠŤ, A NE V ROBOTOVI: robot, který 4× denně aktualizuje data,
// běží na holém Node bez závislostí — Playwright tam není a přidávat ho
// kvůli obrázkům by znamenalo instalovat celý prohlížeč při každém běhu.
// Tyhle obrázky se ale s daty nemění: nese je jen název kraje či okresu,
// a ten je stálý. Vyrobí se jednou, uloží do repozitáře a robot na ně jen
// odkazuje.
//
// PROČ NA NICH NEJSOU POČTY: obrázek se vyrábí jednou, data se mění
// každých šest hodin. Číslo na obrázku by za den lhalo — a Facebook si
// náhled navíc ukládá do mezipaměti na týdny.
//
// PÍSMO: sáhne po značkovém Source Serif 4, když je po ruce; jinak po
// nejbližším místním serifu. V uzavřeném prostředí bez přístupu na
// Google Fonts vyjdou obrázky v Charteru — pořád čitelné a v duchu webu.
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VEN = path.join(ROOT, 'assets', 'og');

function slug(s) {
  const map = { 'á':'a','č':'c','ď':'d','é':'e','ě':'e','í':'i','ň':'n','ó':'o','ř':'r','š':'s','ť':'t','ú':'u','ů':'u','ý':'y','ž':'z' };
  return String(s).toLowerCase().replace(/[áčďéěíňóřšťúůýž]/g, (c) => map[c] || c)
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

const KRAJE = ['Praha','Středočeský','Jihočeský','Plzeňský','Karlovarský','Ústecký','Liberecký',
  'Královéhradecký','Pardubický','Vysočina','Jihomoravský','Olomoucký','Zlínský','Moravskoslezský'];
const KRAJ_DISP = { 'Praha': 'Praha', 'Vysočina': 'Kraj Vysočina' };
const OKRESY = Object.keys(JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'okresy.json'), 'utf8')).okresy || {});

/** Stránka, ze které se obrázek fotí. Vše je v ní, žádné cizí zdroje. */
function sablona(nadpis, nadtitul) {
  const dlouhy = nadpis.length > 17;
  return `<!doctype html><html lang="cs"><head><meta charset="utf-8">
<style>
  *{margin:0; padding:0; box-sizing:border-box;}
  html,body{width:1200px; height:630px;}
  body{
    display:flex; flex-direction:column; justify-content:space-between;
    padding:68px 76px;
    /* Plochá barva, ne přechod. Přechod přes 1200×630 znamená desetitisíce
       odstínů a PNG z toho udělá čtvrt megabajtu na obrázek — u jednadevadesáti
       kusů dvacet megabajtů v repozitáři. Plocha s mřížkou má barev pár
       a zabere zlomek. */
    background:
      linear-gradient(to right, rgba(255,255,255,0.05) 1px, transparent 1px) 0 0/76px 76px,
      linear-gradient(to bottom, rgba(255,255,255,0.05) 1px, transparent 1px) 0 0/76px 76px,
      #16261F;
    color:#EAE6DD;
    font-family:'Source Serif 4','Charter','Bitstream Charter','DejaVu Serif',Georgia,serif;
  }
  .znacka{display:flex; align-items:center; gap:14px;}
  .mark{width:44px; height:44px; border-radius:13px; flex:none;
    background:#256443;
    display:flex; align-items:center; justify-content:center;}
  .mark span{width:14px; height:14px; border-radius:50%; background:#EAE6DD;}
  .znacka b{font-size:31px; font-weight:700; letter-spacing:-.01em;}
  .nadtitul{font-family:'IBM Plex Mono',ui-monospace,'DejaVu Sans Mono',monospace;
    font-size:17px; letter-spacing:.17em; text-transform:uppercase; color:#C99A5B;}
  h1{font-size:${dlouhy ? 78 : 96}px; font-weight:700; line-height:1.03; letter-spacing:-.025em;
    color:#FFFFFF; max-width:1000px;}
  .pod{margin-top:22px; font-size:27px; color:rgba(234,230,221,.78);}
  .pata{display:flex; align-items:center; gap:14px; font-size:21px; color:rgba(234,230,221,.6);}
  .tecka{width:7px; height:7px; border-radius:50%; background:#C99A5B; flex:none;}
</style></head><body>
  <div class="znacka"><span class="mark"><span></span></span><b>Parcelka</b></div>
  <div>
    <div class="nadtitul">${nadtitul}</div>
    <h1>${nadpis}</h1>
    <div class="pod">Pozemky na prodej i v dražbě — na jedné mapě.</div>
  </div>
  <div class="pata"><span class="tecka"></span>parcelaka.cz · data z veřejných zdrojů</div>
</body></html>`;
}

const ukoly = [
  ...KRAJE.map((k) => ({ soubor: `kraj-${slug(k)}.png`, nadpis: KRAJ_DISP[k] || `${k} kraj`, nadtitul: 'Pozemky v kraji' })),
  ...OKRESY.map((o) => ({ soubor: `okres-${slug(o)}.png`, nadpis: o, nadtitul: 'Pozemky v okrese' })),
];

fs.mkdirSync(VEN, { recursive: true });
const kde = process.env.PW_CHROMIUM || '';
const prohlizec = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, kde ? { executablePath: kde } : {}));
const ctx = await prohlizec.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
const p = await ctx.newPage();
let hotovo = 0;
for (const u of ukoly) {
  await p.setContent(sablona(u.nadpis, u.nadtitul), { waitUntil: 'load' });
  await p.screenshot({ path: path.join(VEN, u.soubor), type: 'png' });
  hotovo++;
}
await prohlizec.close();

const velikost = fs.readdirSync(VEN).reduce((a, f) => a + fs.statSync(path.join(VEN, f)).size, 0);
console.log(`Vyrobeno ${hotovo} náhledů do assets/og (${(velikost / 1048576).toFixed(1)} MB).`);
console.log('Písmo: ' + (process.env.PK_OG_FONT || 'nejbližší dostupný serif (Source Serif 4 jen tam, kde jsou Google Fonts po ruce)'));
process.exit(0);
