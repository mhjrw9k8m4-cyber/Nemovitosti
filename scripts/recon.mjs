#!/usr/bin/env node
// Hledá další využitelné otevřené datasety (nabídky pozemků, SPÚ, exekuce/insolvence)
// a vypisuje jejich odkazy ke stažení.
const UA = { 'user-agent': 'PozemkomatBot/0.1 (+https://github.com/mhjrw9k8m4-cyber/Nemovitosti)' };

async function nkod(filterExpr, label) {
  const q = `PREFIX dcterms:<http://purl.org/dc/terms/>
PREFIX dcat:<http://www.w3.org/ns/dcat#>
SELECT DISTINCT ?title ?dl WHERE {
  ?d a dcat:Dataset ; dcterms:title ?title .
  OPTIONAL { ?d dcat:distribution/dcat:downloadURL ?dl . }
  FILTER(LANG(?title)="cs")
  FILTER(${filterExpr})
} LIMIT 40`;
  const url = 'https://data.gov.cz/sparql?query=' + encodeURIComponent(q) + '&format=application%2Fsparql-results%2Bjson';
  try {
    const r = await fetch(url, { headers: { ...UA, accept: 'application/sparql-results+json' } });
    const j = await r.json();
    console.log(`\n===== ${label} =====`);
    for (const b of j.results.bindings) {
      const dl = b.dl ? b.dl.value : '(bez odkazu)';
      console.log('•', b.title.value, '→', dl);
    }
  } catch (e) { console.log(label, 'CHYBA', e.message); }
}

await nkod('CONTAINS(LCASE(STR(?title)), "nab\\u00EDdk") && CONTAINS(LCASE(STR(?title)), "pozemk")', 'Nabídky pozemků');
await nkod('CONTAINS(LCASE(STR(?title)), "st\\u00E1tn\\u00ED pozemkov")', 'Státní pozemkový úřad');
await nkod('CONTAINS(LCASE(STR(?title)), "prodej") && CONTAINS(LCASE(STR(?title)), "pozemk")', 'Prodej pozemků');
await nkod('CONTAINS(LCASE(STR(?title)), "exeku") || CONTAINS(LCASE(STR(?title)), "insolv")', 'Exekuce / insolvence');
console.log('\nHotovo.');
