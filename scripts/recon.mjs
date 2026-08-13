#!/usr/bin/env node
/**
 * Průzkum dostupnosti reálných zdrojů (běží na GitHub Actions, kde je internet).
 * Nic nestahuje k použití — jen zjišťuje, co je dostupné a co dovolují pravidla,
 * a vypisuje to do logu.
 */

const UA = { 'user-agent': 'PozemkomatBot/0.1 (+https://github.com/mhjrw9k8m4-cyber/Nemovitosti)' };

async function show(label, url, opts = {}) {
  try {
    const r = await fetch(url, { headers: UA, ...opts });
    const body = await r.text();
    console.log(`\n=== ${label} → HTTP ${r.status} (${body.length} B) ===`);
    console.log(body.slice(0, opts.max || 1200));
  } catch (e) {
    console.log(`\n=== ${label} → CHYBA: ${e.message} ===`);
  }
}

console.log('Ověřuji internet a zdroje...');
await show('Test internetu (example.com)', 'https://example.com/', { max: 200 });

// Pravidla portálů — smíme vůbec stahovat?
await show('robots.txt · portaldrazeb.cz', 'https://www.portaldrazeb.cz/robots.txt');
await show('robots.txt · exdrazby.cz', 'https://www.exdrazby.cz/robots.txt');

// Národní katalog otevřených dat — hledáme dataset o dražbách / pozemcích
const sparql = `PREFIX dcterms:<http://purl.org/dc/terms/>
PREFIX dcat:<http://www.w3.org/ns/dcat#>
SELECT DISTINCT ?title ?dl WHERE {
  ?d a dcat:Dataset ; dcterms:title ?title .
  OPTIONAL { ?d dcat:distribution/dcat:downloadURL ?dl . }
  FILTER(LANG(?title)="cs")
  FILTER(CONTAINS(LCASE(STR(?title)), "dražb") || CONTAINS(LCASE(STR(?title)), "pozemk"))
} LIMIT 30`;
await show(
  'NKOD SPARQL (dražby/pozemky)',
  'https://data.gov.cz/sparql?query=' + encodeURIComponent(sparql) + '&format=application%2Fsparql-results%2Bjson',
  { headers: { ...UA, accept: 'application/sparql-results+json' }, max: 4000 }
);

console.log('\nHotovo.');
