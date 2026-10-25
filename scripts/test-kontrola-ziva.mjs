/* Test: kontrola živého webu v prohlížeči umí najít každou z vad,
   kvůli kterým vznikla — a na zdravém webu mlčí.
   ==================================================================
   Spuštění: node scripts/test-kontrola-ziva.mjs
   (potřebuje playwright-core; v sandboxu navíc PW_CHROMIUM=cesta/k/chrome)

   PROČ. `kontrola-ziva-prohlizecem.mjs` běží proti cizí službě, takže
   se na ní nedá nic rozbít na zkoušku. Místo toho se tady postaví
   FALEŠNÝ WEB, na kterém se každá vada vyrobí schválně, a kontrola se
   proti němu pustí jako podřízený proces. Hlídač, u kterého nikdo
   nedokázal, že vadu POZNÁ, hlídá jen to, že se neozývá.
   ================================================================== */
import http from 'node:http';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pricinaChyb } from './chyby-hlaska.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8417;
const BASE = `http://127.0.0.1:${PORT}`;

/* Co server právě servíruje. Jeden klíč = jedna vyrobená vada. */
let varianta = 'zdravy';

/* Zdravá úvodní stránka: má vše, na co se kontrola ptá. Jednotlivé
   vady z ní pak vždy UBEROU nebo PŘIDAJÍ právě jednu věc. */
const uvod = (v) => {
  const csp = v === 'csp'
    ? '<meta http-equiv="Content-Security-Policy" content="script-src \'sha256-AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=\'">'
    : '';
  const titulek = v === 'cizi' ? 'Úplně jiný web' : 'Parcelaka — pozemky';
  const karty = v === 'prazdno' ? '' : '<div class="opp-item">karta 1</div><div class="opp-item">karta 2</div>';
  /* Mapa se nepozná podle `#leaflet-map` (ten je v HTML vždycky), ale
     podle toho, že ji Leaflet opravdu postavil: kontejner dostane svou
     třídu a vznikne aspoň jedna vrstva. Falešný web to tedy musí
     napodobit obojím. */
  const mapa = v === 'bezmapy'
    ? '<div id="leaflet-map"></div>'
    : '<div id="leaflet-map" class="leaflet-container"><div class="leaflet-pane"></div></div>';
  const sirokyPrvek = v === 'pretek' ? '<div style="width:1200px;height:10px"></div>' : '';
  const chybejici = v === 'ctyristactyri' ? '<img src="/tenhle-obrazek-neexistuje.png" alt="">' : '';
  const pad = v === 'pad' ? '<script>window.neexistujiciFunkce();</script>' : '';
  return `<!doctype html><html lang="cs"><head><meta charset="utf-8">${csp}
<title>${titulek}</title></head><body>
<h1>Falešný web pro zkoušku</h1>
${karty}
${sirokyPrvek}
${chybejici}
<section id="mapa">${mapa}</section>
<script>window.__zdravy = 1;</script>
${pad}
</body></html>`;
};

const pozemek = (v) => `<!doctype html><html lang="cs"><head><meta charset="utf-8">
<title>Pozemek — Parcelaka</title></head><body><h1>Pozemek</h1>
${v === 'padPozemek' ? '<script>window.anoTohleTakyNeexistuje();</script>' : ''}
</body></html>`;

const server = http.createServer((req, res) => {
  const u = req.url.split('?')[0];
  if (u === '/' || u === '/index.html') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(uvod(varianta)); return;
  }
  if (u === '/sitemap.xml') {
    if (varianta === 'bezSitemapy') { res.writeHead(404); res.end('ne'); return; }
    res.writeHead(200, { 'content-type': 'application/xml; charset=utf-8' });
    res.end(`<?xml version="1.0" encoding="UTF-8"?><urlset><url><loc>${BASE}/pozemek-zkouska.html</loc></url></urlset>`);
    return;
  }
  if (u === '/pozemek-zkouska.html') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(pozemek(varianta)); return;
  }
  res.writeHead(404); res.end('ne');
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* ASYNCHRONNĚ, a to je tu podstatné: falešný web běží v TOMHLE
   procesu. `spawnSync` by zablokoval smyčku událostí, server by
   neodpověděl ani na jediný dotaz a kontrola by vypršela na všem —
   což přesně vypadalo jako „hlídač nic nepozná". Zkouška, která měří
   sama sebe místo toho, co má, je horší než žádná. */
function spust(prostredi = {}) {
  return new Promise((hotovo) => {
    const d = spawn(process.execPath,
      /* `--limit-s 8` není zlehčení: falešný web odpovídá z paměti
         okamžitě, takže osm sekund je tu mnohonásobek toho, co
         potřebuje. Na třiceti stála celá zkouška přes devět minut —
         každý pokus s úmyslně chybějícím prvkem vyčkal celý limit. */
      ['scripts/kontrola-ziva-prohlizecem.mjs', '--web', BASE, '--limit-s', '8'],
      { cwd: KOREN, env: { ...process.env, ...prostredi } });
    let text = '';
    d.stdout.on('data', (b) => { text += b; });
    d.stderr.on('data', (b) => { text += b; });
    const utni = setTimeout(() => d.kill('SIGKILL'), 120000);
    d.on('close', (kod) => { clearTimeout(utni); hotovo({ kod, text }); });
  });
}

/* ---- 1. zdravý web: kontrola musí projít a NIC nenahlásit -------- */
varianta = 'zdravy';
const z = await spust();
pravda('na zdravém webu kontrola projde', z.kod === 0,
  `vrátila ${z.kod}, výpis:\n` + z.text.split('\n').filter((r) => /✕|\?/.test(r)).join('\n'));
pravda('na zdravém webu projde všech osm kontrol',
  (z.text.match(/✓/g) || []).length >= 8,
  `prošlo jen ${(z.text.match(/✓/g) || []).length}`);

/* ---- 2.-8. jedna vyrobená vada po druhé ------------------------- */
const VADY = [
  ['prazdno', 'výpis zůstal prázdný', 'výpis se nedokreslil (karty nejsou)'],
  ['pad', 'skript na úvodní stránce spadl', 'výjimka ze skriptu při načtení'],
  ['csp', 'CSP zablokovala', 'CSP zablokovala vložený skript'],
  ['ctyristactyri', 'část stránky se nestáhla', 'podřízený požadavek vrátil 404'],
  ['pretek', 'přetéká do stran', 'na 390 px stránka přetéká'],
  ['bezmapy', 'mapa se nepostavila', 'mapa bez vrstev Leafletu'],
  ['cizi', 'není naše', 'cizí titulek stránky'],
  ['padPozemek', 'stránce pozemku', 'výjimka na generované stránce pozemku'],
];
for (const [klic, ocekavano, popis] of VADY) {
  varianta = klic;
  const v = await spust();
  pravda(`pozná: ${popis}`, v.kod === 1 && v.text.includes(ocekavano),
    `vrátila ${v.kod} a v textu ${v.text.includes(ocekavano) ? 'nález je' : `chybí „${ocekavano}"`}`
    + '\n      ' + v.text.split('\n').filter((r) => r.includes('✕')).join('\n      '));
}

/* ---- 9. chybějící sitemapa je NEZMĚŘENO, ne vada ---------------- */
/* Rozdíl, na kterém záleží: sitemapa se nestáhla znamená „tohle jsem
   nezměřil", ne „generované stránky jsou rozbité". Kontrola, která
   obojí hlásí stejně, posílá člověka hledat vadu, co není. */
varianta = 'bezSitemapy';
const bs = await spust();
pravda('chybějící sitemapa je nezměřeno, ne vada',
  bs.kod === 0 && /\?\s+stránka pozemku/.test(bs.text),
  `vrátila ${bs.kod}; řádky:\n      ` + bs.text.split('\n').filter((r) => /✕|\?/.test(r)).join('\n      '));

/* ---- 10. nespuštěný prohlížeč NESMÍ vypadat jako úspěch --------- */
varianta = 'zdravy';
const np = await spust({ PW_CHROMIUM: '/tenhle/prohlizec/neexistuje' });
pravda('nespuštěný prohlížeč je vada, ne zelená',
  np.kod === 1 && np.text.includes('nezměřilo se nic'),
  `vrátila ${np.kod}; výpis:\n      ` + np.text.split('\n').filter((r) => /✕|\?/.test(r)).join('\n      '));

console.log('\nKontrola živého webu v prohlížeči');
console.log(zpravy.join('\n'));
console.log(`\n  ${ok} v pořádku, ${chyb} chyb\n`);
server.close();
if (chyb) {
  console.log('::error::Kontrola živého webu: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy));
  process.exit(1);
}
