/* Test: „NEVÍM" SE NESMÍ ZAPAMATOVAT JAKO „NEEXISTUJE".
   ==================================================================
   Spuštění: node scripts/test-geokoder-pamet.mjs

   PROČ TOHLE VZNIKLO. Všechny tři dotazy do geokodéru (obec, katastrální
   území, čtvrť podle GPS) měly tvar „zkus, a co nevyjde, zapiš jako
   null". Mezipaměť data/geocode-cache.json se přitom commituje a ptá
   se na PŘÍTOMNOST klíče, takže jedno zaškobrtnutí sítě, jedno 429 od
   Nominatimu nebo jedna odpověď, která se nepřečte jako JSON, vyřadily
   jméno NAVŽDY: nabídka by neměla okres, nedostala by se na web
   a nikdo by se nedozvěděl proč. Nominatim tempo omezuje, takže 429
   není hypotéza.

   CO SE MĚŘÍ. Rozdíl mezi „služba odpověděla" a „nešlo se zeptat",
   a to na FALEŠNÉM SERVERU na smyčce — žádný dotaz neopouští stroj.
   Prázdné pole je ODPOVĚĎ („v Česku to neznám") a pamatovat se má:
   na tom stojí úspora u zahraničních adres, které by se jinak ptaly
   každou noc znovu.
   ================================================================== */
import http from 'node:http';
import { pricinaChyb } from './chyby-hlaska.mjs';
import { volnyPort } from './port-zkousky.mjs';
import { geoDotaz, geoZapis, geoZed, geoPoDotazu, geoStavReset, GEO_SELHANI_STROP }
  from './fetch-opportunities.mjs';

let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
function hotovo() {
  console.log('\nMezipaměť geokodéru');
  console.log(zpravy.join('\n'));
  console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
  if (chyb) { console.log('::error::Mezipaměť geokodéru: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
  process.exit(0);
}

/* Falešný geokodér: cestou se volí, co odpoví. */
const port = await volnyPort();
const server = http.createServer((req, res) => {
  if (req.url.startsWith('/najde')) {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify([{ lat: '49.1', lon: '16.6' }]));
  } else if (req.url.startsWith('/prazdno')) {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('[]');
  } else if (req.url.startsWith('/429')) {
    res.writeHead(429, { 'content-type': 'text/plain' });
    res.end('Too Many Requests');
  } else if (req.url.startsWith('/smeti')) {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end('<html>tohle není JSON</html>');
  } else {
    res.writeHead(404); res.end('');
  }
});
await new Promise((r) => server.listen(port, '127.0.0.1', r));
const BASE = `http://127.0.0.1:${port}`;
/* Jeden pokus a žádné čekání: zkouška měří rozhodnutí, ne trpělivost. */
const JEDEN = { pokusy: 1, cekaniNasobek: 0 };

const najde = await geoDotaz(`${BASE}/najde`, JEDEN);
pravda('odpověď s nálezem se pozná jako odpověď', najde.odpovedel === true && Array.isArray(najde.data) && najde.data.length === 1,
  JSON.stringify(najde));
const prazdno = await geoDotaz(`${BASE}/prazdno`, JEDEN);
pravda('prázdné pole je TAKY odpověď („v Česku to neznám")',
  prazdno.odpovedel === true && Array.isArray(prazdno.data) && prazdno.data.length === 0,
  JSON.stringify(prazdno));
const odmitnuto = await geoDotaz(`${BASE}/429`, JEDEN);
pravda('odmítnutí tempem (429) NENÍ odpověď', odmitnuto.odpovedel === false,
  JSON.stringify(odmitnuto) + ' — jinak by se do mezipaměti zapsalo „místo neexistuje"');
const smeti = await geoDotaz(`${BASE}/smeti`, JEDEN);
pravda('co se nepřečte jako JSON, není odpověď', smeti.odpovedel === false, JSON.stringify(smeti));
const mimo = await geoDotaz(`http://127.0.0.1:${port + 1}/najde`, JEDEN);
pravda('nedostupná služba není odpověď', mimo.odpovedel === false, JSON.stringify(mimo));

/* A TEĎ TO PODSTATNÉ: co se z toho zapamatuje. */
const cache = {};
pravda('skutečná odpověď se zapamatuje', geoZapis(cache, 'brno|*', [49.1, 16.6], true) === true
  && ('brno|*' in cache), JSON.stringify(cache));
pravda('prázdná odpověď se zapamatuje jako „není" (ať se neptáme každou noc znovu)',
  geoZapis(cache, 'berlin|*', null, true) === true && 'berlin|*' in cache && cache['berlin|*'] === null,
  JSON.stringify(cache));
pravda('ale NEODPOVĚĎ se nezapamatuje', geoZapis(cache, 'zlin|*', null, false) === false
  && !('zlin|*' in cache),
  JSON.stringify(cache) + ' — klíč v mezipaměti znamená „na tohle se už neptej"');

/* ZEĎ: když služba odmítá v řadě, přestane se ptát. Bez toho by se běh
   protáhl o 1,1 s za každé zbylé jméno a nezapsal by ani jeden výsledek. */
geoStavReset();
pravda('na začátku žádná zeď není', geoZed() === false, 'geoZed() hlásí zeď hned po resetu');
for (let i = 0; i < GEO_SELHANI_STROP - 1; i++) geoPoDotazu(false, 'zkouška');
pravda(`${GEO_SELHANI_STROP - 1} nezdarů ještě zeď není`, geoZed() === false,
  'zeď přišla dřív, než říká GEO_SELHANI_STROP = ' + GEO_SELHANI_STROP);
geoPoDotazu(false, 'zkouška');
pravda(`${GEO_SELHANI_STROP} nezdarů v řadě zeď je`, geoZed() === true,
  'po stropu se robot pořád ptá — při odmítání tempem by běh prospal zbytek stropu');
geoStavReset();
geoPoDotazu(false, 'zkouška');
geoPoDotazu(true, 'zkouška');
for (let i = 0; i < GEO_SELHANI_STROP - 1; i++) geoPoDotazu(false, 'zkouška');
pravda('jedna odpověď počítadlo vynuluje', geoZed() === false,
  'počítadlo se po úspěšné odpovědi nevynulovalo — náhodné nezdary by se sčítaly přes celý běh');

server.close();
hotovo();
