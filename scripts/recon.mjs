#!/usr/bin/env node
/**
 * Průzkum struktury oficiálního datasetu dražeb (Centrální evidence veřejných
 * dražeb, cevd.gov.cz — otevřená data z Národního katalogu otevřených dat).
 * Běží na GitHub Actions (internet). Jen vypisuje strukturu do logu.
 */
const UA = { 'user-agent': 'PozemkomatBot/0.1 (+https://github.com/mhjrw9k8m4-cyber/Nemovitosti)' };
const URL = 'https://cevd.gov.cz/opendata/drazby/drazby_2026.json';

const r = await fetch(URL, { headers: UA });
console.log(`HTTP ${r.status}, content-type: ${r.headers.get('content-type')}`);
const j = await r.json();

const arr = Array.isArray(j) ? j : (j.drazby || j.items || j.data || j.results || Object.values(j).find(Array.isArray) || []);
console.log('Kořen je pole:', Array.isArray(j), '| počet záznamů:', arr.length);

if (!Array.isArray(j)) {
  console.log('Klíče kořene:', Object.keys(j).slice(0, 30).join(', '));
}

if (arr.length) {
  console.log('\n--- KLÍČE PRVNÍHO ZÁZNAMU ---');
  console.log(Object.keys(arr[0]).join(', '));
  console.log('\n--- PRVNÍ ZÁZNAM (JSON) ---');
  console.log(JSON.stringify(arr[0], null, 2).slice(0, 3500));

  // hledáme, jestli jsou mezi předměty pozemky
  const asText = JSON.stringify(arr.slice(0, 50)).toLowerCase();
  console.log('\nObsahuje slovo "pozem":', asText.includes('pozem'));
  console.log('Obsahuje "parcel":', asText.includes('parcel'));
  console.log('Obsahuje "gps"/"lat"/"souřad":', asText.includes('gps') || asText.includes('lat') || asText.includes('souřad') || asText.includes('souradn'));
}
console.log('\nHotovo.');
