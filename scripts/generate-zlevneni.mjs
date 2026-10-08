#!/usr/bin/env node
/* KTERÉ NABÍDKY ZLEVNILY — malý soubor pro mapu a výpis
   ==================================================================
   Spuštění: node scripts/generate-zlevneni.mjs   (píše data/zlevneni.json)

   PROČ. Karta na mapě umí říct „Zlevněno o 11 %", ale ví to jen
   z POSLEDNÍHO běhu robota: pole cena_drive má 21 nabídek z 2 004,
   protože se při každém běhu přepíše. Archiv přitom zná 129 nabídek,
   u kterých se cena změnila. Stránka pozemku to už ukazuje (historii
   si nese vepsanou v HTML), ale kdo prochází mapu, o ní neví — a je
   to přitom to nejlepší síto na příležitost, jaké web má.

   Celý archiv (596 kB jsonl) se do prohlížeče tahat nedá a nemá to
   smysl: z 2 727 sledovaných nabídek se cena změnila u 129. Tenhle
   soubor je právě těch 129 a nic víc.

   TVAR. { den, nabidky: { "<klíč pozemku>": [[den, cena], …] } }
   Klíč je tentýž pkey jako všude jinde (obec|parcela|okres|šířka|délka,
   BEZ ceny) — jinak by se každá sleva jevila jako nový pozemek.
   Dvojice jsou odpředu: den, kdy ta cena ZAČALA platit.

   PROČ NE DO data/opportunities.json. Ten soubor píše robot
   (scripts/fetch-opportunities.mjs) a při každém běhu přepíše; co by
   do něj dopsal někdo jiný, zmizí. Navíc by každý, kdo si data bere,
   stahoval historii, i když o ni nestojí.
   ================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { historiePodleKlice, jenZmeny } from './cenova-historie.mjs';
import { nactiArchiv } from './archiv-statistiky.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function sestav(uzavrene, stav) {
  const zmeny = jenZmeny(historiePodleKlice(uzavrene, stav));
  /* JEN ŽIVÉ NABÍDKY. Archiv zná historii i u těch, co už na trhu
     nejsou — z 131 je 59 pryč. Na mapě by se nikdy nepoužily (karta
     se staví z dnešních nabídek), jen by se stahovaly. */
  const zive = (stav && stav.nabidky) || {};
  const nabidky = {};
  /* Klíče seřazené, aby se soubor při stejných datech nelišil — jinak
     by se commitoval při každém běhu robota, i když se nic nestalo
     (tatáž past jako u kanálů novinky-*.xml). */
  for (const k of [...zmeny.keys()].sort()) {
    if (!Object.prototype.hasOwnProperty.call(zive, k)) continue;
    nabidky[k] = zmeny.get(k).body.map((b) => [b.d, b.c]);
  }
  return { den: (stav && stav.den) || '', nabidky };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { uzavrene, stav } = nactiArchiv();
  const out = sestav(uzavrene, stav);
  const cil = path.join(KOREN, 'data', 'zlevneni.json');
  const text = JSON.stringify(out);
  const stary = fs.existsSync(cil) ? fs.readFileSync(cil, 'utf8') : '';
  if (stary === text) {
    console.log(`  data/zlevneni.json beze změny (${Object.keys(out.nabidky).length} nabídek)`);
  } else {
    fs.writeFileSync(cil, text);
    console.log(`  data/zlevneni.json: ${Object.keys(out.nabidky).length} nabídek`
      + ` se změnou ceny, ${(text.length / 1024).toFixed(1)} kB`);
  }
}
