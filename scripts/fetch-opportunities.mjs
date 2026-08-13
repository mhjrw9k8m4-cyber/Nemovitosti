#!/usr/bin/env node
/**
 * Pozemkomat — sběr příležitostí z veřejných zdrojů.
 *
 * Robot stáhne data z jednotlivých zdrojů, sjednotí je do jednoho formátu
 * a zapíše do data/opportunities.json. Web si ten soubor pak jen načte.
 *
 * DŮLEŽITÉ: jednotlivé funkce zdrojů jsou zatím prázdné (TODO) — sem se
 * doplní reálné stahování. Dokud žádný zdroj nevrátí data, ponecháme
 * stávající soubor beze změny, aby web nezůstal prázdný.
 *
 * Formát jedné příležitosti:
 *   { place, okres, type, parcel, druh, area, price, extra, lat, lng }
 *   type ∈ 'sale' | 'drazba' | 'exekuce' | 'obec'
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'data', 'opportunities.json');

/* ---------- Zdroje (doplnit reálné stahování) ---------- */

// Portál dražeb — veřejné dražby pozemků.
// TODO: stáhnout a rozparsovat nabídky, vyfiltrovat pozemky, doplnit GPS.
async function fetchDrazby() {
  return [];
}

// Insolvenční rejstřík (ISIR) — majetek v úpadku, který půjde na prodej.
// TODO: napojit veřejnou službu ISIR, vytáhnout nemovitosti.
async function fetchInsolvence() {
  return [];
}

// Úřední desky obcí — záměry obcí prodat pozemek.
// TODO: sbírat z úředních desek (mnoho zdrojů), normalizovat.
async function fetchUredniDesky() {
  return [];
}

// Veřejné inzertní portály — pozemky na prodej.
// TODO: pouze v souladu s podmínkami daného portálu.
async function fetchInzeraty() {
  return [];
}

/* ---------- Sjednocení a zápis ---------- */

const REQUIRED = ['place', 'okres', 'type', 'parcel', 'druh', 'area', 'price', 'lat', 'lng'];
const TYPES = new Set(['sale', 'drazba', 'exekuce', 'obec']);

function valid(o) {
  if (!o || typeof o !== 'object') return false;
  if (!TYPES.has(o.type)) return false;
  return REQUIRED.every((k) => o[k] !== undefined && o[k] !== null && o[k] !== '');
}

async function main() {
  const results = await Promise.allSettled([
    fetchDrazby(),
    fetchInsolvence(),
    fetchUredniDesky(),
    fetchInzeraty(),
  ]);

  const fresh = results
    .filter((r) => r.status === 'fulfilled')
    .flatMap((r) => r.value || [])
    .filter(valid);

  if (fresh.length === 0) {
    console.log('Žádný zdroj zatím nevrací data — ponechávám stávající soubor beze změny.');
    return;
  }

  const payload = {
    updated: new Date().toISOString().slice(0, 10),
    source: 'automatický sběr z veřejných zdrojů',
    opportunities: fresh,
  };
  writeFileSync(OUT, JSON.stringify(payload, null, 2) + '\n', 'utf8');
  console.log(`Zapsáno ${fresh.length} příležitostí do ${OUT}.`);
}

main().catch((err) => {
  console.error('Chyba při sběru dat:', err);
  process.exitCode = 1;
});
