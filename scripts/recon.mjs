#!/usr/bin/env node
// Průzkum zdrojů pro kategorie: exekuce, prodej, obec. Kompaktní výstup.
const UA = { 'user-agent': 'PozemkomatBot/0.1 (+https://github.com/mhjrw9k8m4-cyber/Nemovitosti)' };

async function head(label, url, opts = {}) {
  try {
    const r = await fetch(url, { headers: { ...UA, ...(opts.headers || {}) }, redirect: 'follow' });
    const t = await r.text();
    console.log(`[${label}] ${r.status} ${r.headers.get('content-type')} ${t.length}B`);
    return { status: r.status, ct: r.headers.get('content-type'), text: t };
  } catch (e) { console.log(`[${label}] CHYBA ${e.message}`); return { status: 0, text: '' }; }
}

// ---------- 1) EXEKUCE: rozbor CEVD (typy dražeb, kolik nucených s pozemkem) ----------
console.log('=== CEVD: typy dražeb a nucené s pozemkem ===');
try {
  const y = new Date().getFullYear();
  const r = await fetch(`https://cevd.gov.cz/opendata/drazby/drazby_${y}.json`, { headers: UA });
  const data = await r.json();
  const arr = Array.isArray(data) ? data : (Object.values(data).find(Array.isArray) || []);
  const typy = {};
  let nucenaLand = 0, nucenaAny = 0;
  for (const rec of arr) {
    const zi = rec.zakladniInformace || {};
    const t = zi.typDrazby || '(none)';
    typy[t] = (typy[t] || 0) + 1;
    if (/nucen/i.test(t)) {
      nucenaAny++;
      for (const p of (rec.predmetyDrazby || [])) {
        for (const v of (p.veci || [])) {
          const vn = v.vecNemovita;
          if (vn && vn.pozemek && !vn.jednotka && !vn.stavba) { nucenaLand++; break; }
        }
      }
    }
  }
  console.log('celkem dražeb:', arr.length);
  console.log('typDrazby:', JSON.stringify(typy));
  console.log('nucených celkem:', nucenaAny, '| nucených s pozemkem:', nucenaLand);
} catch (e) { console.log('CEVD chyba:', e.message); }

// ---------- 2) PRODEJ: oficiální nabídky státní půdy ----------
console.log('\n=== PRODEJ: státní nabídky (ÚZSVM, SPÚ) ===');
await head('uzsvm-web', 'https://www.uzsvm.cz/');
await head('nabidkamajetku', 'https://nabidkamajetku.cz/');
await head('nabidka-api?', 'https://nabidkamajetku.cz/api/items');
await head('spucr', 'https://www.spucr.cz/');
await head('spu-prodej', 'https://spu.gov.cz/');
// data.gov.cz katalog — hledáme "pozem" datové sady
console.log('\n--- NKOD katalog: hledám sady s "pozem"/"nemovit"/"prodej" ---');
const q = encodeURIComponent('pozemek prodej nemovitost');
await head('nkod-hledani', `https://data.gov.cz/api/3/action/package_search?q=${q}&rows=5`);

// ---------- 3) OBEC: úřední desky jako otevřená data ----------
console.log('\n=== OBEC: úřední desky (OFN) přes NKOD ===');
// úřední desky mají v NKOD typ dat — zkusíme SPARQL na jejich distribuce
const sparql = `PREFIX dcterms:<http://purl.org/dc/terms/>
SELECT ?dist WHERE { ?d a <https://data.gov.cz/slovník/nkod/DatováSada> ; dcterms:title ?t . FILTER(CONTAINS(LCASE(STR(?t)),"úřední deska")) } LIMIT 3`;
await head('nkod-sparql-deska', 'https://data.gov.cz/sparql?query=' + encodeURIComponent(sparql), { headers: { accept: 'application/sparql-results+json' } });

console.log('\nHotovo.');
