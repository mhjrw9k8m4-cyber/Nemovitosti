#!/usr/bin/env node
/* JEDNORÁZOVÉ DOPLNĚNÍ: ulice v poli pro obec.
   ==================================================================
   Spuštění: node scripts/doplnit-obce.mjs --zkouska   (jen vypíše)
             node scripts/doplnit-obce.mjs             (zapíše)

   PROČ TO JE ZVLÁŠŤ. Pravidlo samo žije v robotovi
   (opravUliceVObci v scripts/fetch-opportunities.mjs) a při každém
   stažení dat se uplatní samo. Jenže robot potřebuje síť a běží
   v CI — u sebe ho pustit nejde (API Bezrealitky je přes proxy
   nedostupné). Aby se oprava dostala do dat, která v repozitáři
   LEŽÍ, pustí se tenhle skript jednou nad data/opportunities.json.
   Pak už není k ničemu, dokud nevznikne další takové pravidlo —
   a tahle cesta je stejná jako u scripts/doplnit-inzerenty.mjs.

   POZOR, MĚNÍ SE TÍM ADRESY STRÁNEK. Jméno souboru stránky pozemku
   nese obec, takže opravené nabídky dostanou novou adresu a ta stará
   se přepíše na rozcestí (prestehovanaStranka v
   scripts/generate-parcel-pages.mjs). Po skriptu je proto potřeba
   pustit `node scripts/oprav.mjs`.
   ================================================================== */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { opravUliceVObci } from './fetch-opportunities.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CESTA = path.join(KOREN, 'data', 'opportunities.json');
const ZKOUSKA = process.argv.includes('--zkouska');

const data = JSON.parse(readFileSync(CESTA, 'utf8'));
const nabidky = data.opportunities || [];
const pred = nabidky.map((o) => o.place);
const kolik = opravUliceVObci(nabidky);

for (let i = 0; i < nabidky.length; i++) {
  if (nabidky[i].place !== pred[i]) {
    console.log(`  ${pred[i]} → ${nabidky[i].place}  (okres ${nabidky[i].okres})`);
  }
}
if (!kolik) { console.log('Není co opravit.'); process.exit(0); }
if (ZKOUSKA) { console.log(`\nZkouška: opravilo by se ${kolik}. Bez --zkouska se to zapíše.`); process.exit(0); }
writeFileSync(CESTA, JSON.stringify(data));
console.log(`\nOpraveno ${kolik} míst. Teď pusťte: node scripts/oprav.mjs`);
