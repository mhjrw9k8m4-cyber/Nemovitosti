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
   Klíč je `PKKlic.klicPozemku`, tedy pkey (obec|parcela|okres|šířka|
   délka, BEZ ceny) a výměra — tentýž klíč, pod kterým si lidé ukládají
   pozemky. Dvojice jsou odpředu: den, kdy ta cena ZAČALA platit.

   PROČ NE KLÍČ ARCHIVU (ten nese otisk adresy inzerátu): úvodní stránka
   od 20. 10. stahuje řez bez adres (data/mapa.json), protože adresa je
   v souboru největší pole — 160 kB surově, 18,6 kB po zabalení, tedy
   čtvrtina toho, co se přenese. Bez adresy ale nejde složit klíč
   archivu, a odznak „Zlevněno" by na mapě zmizel u všech nabídek, které
   adresu mají (1 720 z 1 940). Klíč pozemku se spočítá i bez ní.
   Archiv sám si adresu v klíči nechává dál: pamatuje si JEDNU NABÍDKU,
   kdežto tenhle soubor je zobrazovací řez pro dnešní nabídky.
   Kdyby dvě dnešní nabídky vyšly na týž klíč pozemku, nezapíše se ani
   jedna: radši žádný odznak než odznak u cizí nabídky.

   PROČ NE DO data/opportunities.json. Ten soubor píše robot
   (scripts/fetch-opportunities.mjs) a při každém běhu přepíše; co by
   do něj dopsal někdo jiný, zmizí. Navíc by každý, kdo si data bere,
   stahoval historii, i když o ni nestojí.
   ================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { historiePodleKlice, jenZmeny } from './cenova-historie.mjs';
import { nactiArchiv } from './archiv-statistiky.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/* Klíč pozemku se skládá TOUŽ funkcí jako na webu, ne podruhé tady. */
const KLIC = createRequire(import.meta.url)(path.join(KOREN, 'js', 'klic.js')).PKKlic;

/* Ze záznamu archivu zpátky na klíč pozemku. Archiv drží klíč nabídky
   (`pkey#otisk adresy`) a u něj zkrácená pole: v = výměra, dr = druh.
   Klíč pozemku je pkey + výměra, u nabídek bez výměry navíc otisk
   druhu — viz js/klic.js, kde je napsané proč. */
export function klicPozemkuZArchivu(klicNabidky, zapis) {
  const pkeyCast = String(klicNabidky).split('#')[0];
  if (!pkeyCast) return '';
  const v = (zapis && typeof zapis.v === 'number' && isFinite(zapis.v)) ? Math.round(zapis.v) : 0;
  if (v > 0) return pkeyCast + '#v' + v;
  const dr = String((zapis && zapis.dr) == null ? '' : zapis.dr).trim().toLowerCase();
  return pkeyCast + '#v0' + (dr ? 'd' + KLIC.otisk(dr) : '');
}

export function sestav(uzavrene, stav) {
  const zmeny = jenZmeny(historiePodleKlice(uzavrene, stav));
  /* JEN ŽIVÉ NABÍDKY. Archiv zná historii i u těch, co už na trhu
     nejsou — z 131 je 59 pryč. Na mapě by se nikdy nepoužily (karta
     se staví z dnešních nabídek), jen by se stahovaly. */
  const zive = (stav && stav.nabidky) || {};
  const nabidky = {};
  const kolize = new Set();
  /* Klíče seřazené, aby se soubor při stejných datech nelišil — jinak
     by se commitoval při každém běhu robota, i když se nic nestalo
     (tatáž past jako u kanálů novinky-*.xml). */
  for (const k of [...zmeny.keys()].sort()) {
    if (!Object.prototype.hasOwnProperty.call(zive, k)) continue;
    const kp = klicPozemkuZArchivu(k, zive[k]);
    if (!kp) continue;
    const body = zmeny.get(k).body.map((b) => [b.d, b.c]);
    if (Object.prototype.hasOwnProperty.call(nabidky, kp)) {
      /* Dvě dnešní nabídky na týž klíč pozemku: odznak by se připíchl
         k nesprávné z nich, tak se nezapíše ani jedna. */
      if (JSON.stringify(nabidky[kp]) !== JSON.stringify(body)) { kolize.add(kp); }
      continue;
    }
    nabidky[kp] = body;
  }
  for (const kp of kolize) delete nabidky[kp];
  return { den: (stav && stav.den) || '', nabidky, kolizi: kolize.size };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { uzavrene, stav } = nactiArchiv();
  const out = sestav(uzavrene, stav);
  const cil = path.join(KOREN, 'data', 'zlevneni.json');
  /* `kolizi` je údaj o sestavení pro výpis, ne součást dat — do souboru
     se nepíše, aby ho nemusel nikdo zvenčí vysvětlovat. */
  const text = JSON.stringify({ den: out.den, nabidky: out.nabidky });
  const stary = fs.existsSync(cil) ? fs.readFileSync(cil, 'utf8') : '';
  if (stary === text) {
    console.log(`  data/zlevneni.json beze změny (${Object.keys(out.nabidky).length} nabídek)`);
  } else {
    fs.writeFileSync(cil, text);
    console.log(`  data/zlevneni.json: ${Object.keys(out.nabidky).length} nabídek`
      + ` se změnou ceny, ${(text.length / 1024).toFixed(1)} kB`
      + (out.kolizi ? `, ${out.kolizi} vynecháno pro kolizi klíče pozemku` : ''));
  }
}
