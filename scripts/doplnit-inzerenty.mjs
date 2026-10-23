#!/usr/bin/env node
/* DOPLNÍ OTISK INZERENTA DO data/opportunities.json.
   ==================================================================
   Spuštění: node scripts/doplnit-inzerenty.mjs
             node scripts/doplnit-inzerenty.mjs --zkouska   (jen vypíše)

   PROČ EXISTUJE. Pole `inz` nasazuje robot při stahování
   (scripts/fetch-opportunities.mjs), protože tam má popis po ruce.
   Jenže data v repozitáři jsou starší než to pole, a čekat na další
   běh robota by znamenalo pár hodin, kdy cenový verdikt počítá podle
   starého pravidla. Tenhle skript to doplní z data/popisy.json, které
   už v repozitáři leží — stejnou funkcí, jakou používá robot, takže
   nemůže vyjít něco jiného.

   Je to i záchranná cesta: kdyby pole z dat kdykoli vypadlo, hlídač
   (scripts/test-inzerenti.mjs) na to upozorní a tohle je příkaz, který
   to spraví. Nic jiného se v souboru nemění.
   ================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { otiskInzerenta } from './text-inzeratu.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CESTA = path.join(KOREN, 'data', 'opportunities.json');
const POPISY = path.join(KOREN, 'data', 'popisy.json');
const jenZkouska = process.argv.includes('--zkouska');

/* Klíč popisu skládá robot (klicNabidky) a stejně ho čte generátor
   stránek pozemků. Tahle podoba musí být s nimi shodná, jinak by se
   popis k nabídce nenašel — a skript by tiše nedoplnil nic. */
const klic = (o) => `${o.place}|${o.cast || '—'}|${o.okres}|${Number(o.lat).toFixed(3)}|${Number(o.lng).toFixed(3)}#${o.price}|${o.area}`;

const celek = JSON.parse(fs.readFileSync(CESTA, 'utf8'));
const popisy = JSON.parse(fs.readFileSync(POPISY, 'utf8'));
const nabidky = celek.opportunities || [];

let doplneno = 0, melo = 0, bezPopisu = 0;
for (const o of nabidky) {
  const t = popisy[klic(o)];
  if (!t) { bezPopisu++; continue; }
  const otisk = otiskInzerenta(t);
  if (!otisk) continue;
  if (o.inz === otisk) { melo++; continue; }
  o.inz = otisk;
  doplneno++;
}

const inzerenti = new Map();
for (const o of nabidky) if (o.inz) inzerenti.set(o.inz, (inzerenti.get(o.inz) || 0) + 1);
const nejvetsi = [...inzerenti.values()].sort((a, b) => b - a)[0] || 0;

console.log(`nabídek ${nabidky.length}, s popisem ${nabidky.length - bezPopisu}`);
console.log(`otisk doplněn u ${doplneno}, už ho mělo ${melo}`);
console.log(`inzerentů ${inzerenti.size}, největší má ${nejvetsi} nabídek `
  + `(${(100 * nejvetsi / Math.max(nabidky.length, 1)).toFixed(0)} % všech)`);

if (jenZkouska) { console.log('\n(--zkouska: nic se nezapsalo)'); process.exit(0); }
if (!doplneno) { console.log('\nNic k doplnění.'); process.exit(0); }
/* Zapisuje se stejným tvarem jako robot (JSON.stringify bez odsazení
   a s koncovým řádkem), aby se soubor nezměnil na každém řádku. */
fs.writeFileSync(CESTA, JSON.stringify(celek) + '\n', 'utf8');
console.log('\ndata/opportunities.json přepsán.');
