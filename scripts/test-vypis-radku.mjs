// Test: řádek výpisu neopakuje, co už jinde stojí — a neschovává, co má říct.
//
// Spuštění: node scripts/test-vypis-radku.mjs
//
// Výpis nabídek je nejčastější tvar obsahu na webu: 2 820 řádků na 103
// stránkách. Co se v něm opakuje, opakuje se tisíckrát; co v něm chybí,
// chybí tisíckrát. Tahle zkouška hlídá tři pravidla, každé vzniklo
// z naměřené vady:
//
//  A) OKRES V KAŽDÉM ŘÁDKU, KDE NENÍ V NADPISU. V generátoru stálo
//     `list.map(itemRow)`. `map` ale předává jako druhý argument POŘADÍ
//     a druhý argument `itemRow` je `skryjOkres` — takže u prvního
//     řádku (0 = nepravda) se okres ukázal a u všech dalších se
//     schoval. Na krajské stránce ho tedy mělo 1 z 12 řádků, na
//     celostátním přehledu dražeb 1 z 84. Nic nespadlo, ten údaj tam
//     prostě nebyl. Na stránce okresu se naopak skrývá správně — název
//     okresu je v nadpisu.
//
//  B) ODZNAK, KTERÝ MAJÍ VŠECHNY ŘÁDKY STEJNÝ, JE VÝPLŇ. Z 103
//     výpisových stránek jich 55 mělo ve všech řádcích týž odznak;
//     u rozpočtových stránek je to dané stavbou řezu (jsou v něm jen
//     prodeje), takže čtyřicet odznaků „NA PRODEJ" pod sebou
//     nerozlišovalo nic. Typ se místo toho jednou řekne nad výpisem —
//     a to je to podstatné: skrýt odznak se smí JEN tehdy, když se typ
//     řekne jinak.
//
//  C) TOTÉŽ DVAKRÁT V JEDNOM ŘÁDKU. U státní půdy stálo
//     v podrobnostech „prodej státní půdy (SPÚ, § 12)" a hned vedle
//     odkaz „Nabídka SPÚ ↗" — v 523 řádcích z 2 820.
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

const JE_POZEMEK = /^pozemek-.+-[0-9a-z]{5,8}\.html$/;
/* Stránka okresu má okres v nadpisu, takže ho v řádcích schovává
   schválně — a je to jediná taková. */
const JE_OKRES = /^pozemky-okres-/;

const stranky = [];
for (const f of readdirSync(KOREN).filter((x) => x.endsWith('.html') && !JE_POZEMEK.test(x)).sort()) {
  const h = readFileSync(path.join(KOREN, f), 'utf8').replace(/ /g, ' ');
  const radky = h.split('<div class="okr-item">').slice(1).map((x) => x.split('</div>\n      </div>')[0]);
  if (!radky.length) continue;
  stranky.push({ f, h, radky });
}
const celkemRadku = stranky.reduce((s, x) => s + x.radky.length, 0);
pravda(`je co měřit (${stranky.length} výpisových stránek, ${celkemRadku} řádků)`,
  stranky.length >= 80 && celkemRadku >= 1500, `${stranky.length} stránek, ${celkemRadku} řádků`);

// --- A) OKRES V ŘÁDKU --------------------------------------------
{
  const spatne = [];
  for (const s of stranky) {
    if (JE_OKRES.test(s.f)) continue;
    const s_okresem = s.radky.filter((r) => /·\s*okres /.test(r)).length;
    /* Část nabídek okres v datech nemá — proto se nežádá 100 %, ale
       to, aby se podíl neblížil jedné jediné. Vada vypadala přesně
       takhle: 1 řádek z 12, 1 z 84. */
    if (s.radky.length >= 5 && s_okresem <= 1) spatne.push(`${s.f}: ${s_okresem} z ${s.radky.length}`);
  }
  pravda('mimo stránky okresů nese okres víc než jeden řádek', spatne.length === 0,
    spatne.slice(0, 5).join('; '));
  /* A pojistka na druhou stranu: na stránce okresu se opakovat NEMÁ. */
  const zbytecne = [];
  for (const s of stranky) {
    if (!JE_OKRES.test(s.f)) continue;
    const n = s.radky.filter((r) => /·\s*okres /.test(r)).length;
    if (n) zbytecne.push(`${s.f}: ${n}`);
  }
  pravda('na stránce okresu se název okresu v řádcích neopakuje', zbytecne.length === 0,
    zbytecne.slice(0, 5).join('; '));
}

// --- B) ODZNAK TYPU ----------------------------------------------
{
  const vyplne = [], zamlcene = [];
  let skrytych = 0, sOdznaky = 0;
  for (const s of stranky) {
    const typy = new Set();
    let bezOdznaku = 0;
    for (const r of s.radky) {
      const m = /class="okr-badge t-(\w+)"/.exec(r);
      if (m) typy.add(m[1]); else bezOdznaku++;
    }
    if (bezOdznaku === s.radky.length) {
      skrytych++;
      /* Když odznak není, typ MUSÍ stát nad výpisem slovy. */
      const rekne = /Všechny nabídky v tomhle výpisu jsou <b>/.test(s.h)
        || /V ceně jsou <b>jen prodeje<\/b>/.test(s.h);
      if (!rekne) zamlcene.push(s.f);
    } else if (bezOdznaku === 0) {
      sOdznaky++;
      if (typy.size === 1 && s.radky.length >= 10) vyplne.push(`${s.f}: ${s.radky.length}× ${[...typy][0]}`);
    } else {
      vyplne.push(`${s.f}: odznak má jen část řádků (${s.radky.length - bezOdznaku} z ${s.radky.length})`);
    }
  }
  pravda(`odznak se skrývá tam, kde nic nerozlišuje (${skrytych} stránek)`, skrytych > 0,
    'kdyby se neskrýval nikde, tahle kontrola nic neměří');
  pravda(`a nechává se tam, kde rozlišuje (${sOdznaky} stránek)`, sOdznaky > 0);
  pravda('žádná stránka nemá deset a víc řádků s jedním a týmž odznakem',
    vyplne.length === 0, vyplne.slice(0, 5).join('; '));
  pravda('a kde odznak není, stojí typ nad výpisem slovy', zamlcene.length === 0,
    'bez toho stránka zamlčí, jestli jsou nabídky na prodej, nebo v dražbě: ' + zamlcene.slice(0, 5).join(', '));
}

// --- C) TOTÉŽ DVAKRÁT V ŘÁDKU ------------------------------------
{
  let spu = 0;
  const kde = [];
  for (const s of stranky) {
    for (const r of s.radky) {
      if (/prodej státní půdy/.test(r) && /Nabídka SPÚ/.test(r)) { spu++; if (kde.length < 3) kde.push(s.f); }
    }
  }
  pravda('státní půda se v řádku neříká dvakrát', spu === 0,
    `${spu} řádků má „prodej státní půdy" v podrobnostech i odkaz „Nabídka SPÚ": ${kde.join(', ')}`);
  /* Odkaz na nabídku SPÚ ale zůstat MUSÍ — bez něj by u dvou set
     nabídek nebylo kam kliknout. */
  const sOdkazem = stranky.reduce((n, s) => n + s.radky.filter((r) => /Nabídka SPÚ/.test(r)).length, 0);
  pravda(`a odkaz na nabídku SPÚ zůstal (${sOdkazem} řádků)`, sOdkazem > 100, String(sOdkazem));
}

console.log('Řádky výpisu:');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb.`);
if (chyb) { console.log('::error::Řádky výpisu: ' + chyb + ' kontrol neprošlo.'); process.exit(1); }
process.exit(0);
