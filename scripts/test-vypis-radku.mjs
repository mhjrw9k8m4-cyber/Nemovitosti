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
/* Odznak patří výjimce, ne pravidlu. Na 48 stránkách bylo 1 616
   odznaků a 1 433 z nich jen opakovalo, co platí o většině řádků —
   v okrese Hodonín 114× „NA PRODEJ" a mezi tím čtyři exekuce, které
   se v tom ztratily. Po úpravě jich je 228.

   A JEDNA VĚC, KTERÁ SE HLÍDÁ PŘÍSNĚJI NEŽ VŠECHNO OSTATNÍ: řádek bez
   odznaku nesmí být dražba. Splést si dražbu s prodejem je ta
   nejdražší chyba, kterou tu člověk může udělat — u dražby se platí
   jistota předem a kupuje se, jak to stojí a leží. Mlčky se proto
   vynechává jen „na prodej"; jedinou výjimkou je stránka, kde mají
   VŠECHNY řádky týž typ a řekne se to celou větou. */
{
  const bezVety = [], tichaDrazba = [], vyplne = [];
  let odznaku = 0, bezOdznaku = 0, sVetouVsechny = 0, sVetouJinak = 0;
  for (const s of stranky) {
    const vsechnyJeden = /Všechny nabídky v tomhle výpisu jsou <b>/.test(s.h);
    /* Třetí povolený tvar věty. Rozpočtové stránky mají jen prodeje
       už tím, jak je postavený řez, a říkají to konkrétněji: „V ceně
       jsou jen prodeje — dražba má vyvolávací cenu, ne cenu…". Nutit
       jim obecnou větu by znamenalo napsat totéž dvakrát. */
    const jenProdeje = /V ceně jsou <b>jen prodeje<\/b>/.test(s.h);
    const neniLiJinak = /Není-li u řádku uvedeno jinak, je nabídka <b>na prodej<\/b>/.test(s.h)
      || jenProdeje;
    if (vsechnyJeden || jenProdeje) sVetouVsechny++;
    if (neniLiJinak) sVetouJinak++;
    const typy = {};
    let bez = 0;
    for (const r of s.radky) {
      const m = /class="okr-badge t-(\w+)"/.exec(r);
      if (m) { odznaku++; typy[m[1]] = (typy[m[1]] || 0) + 1; continue; }
      bez++; bezOdznaku++;
      /* Dražbu v řádku poznáme z podrobností (text zdroje) i z odpočtu. */
      const vypadaJakoDrazba = /\b(dražba|dražby|dražbě|exekuce|exekuční)\b/i
        .test(r.replace(/<a [^>]*>[\s\S]*?<\/a>/g, ''));
      if (vypadaJakoDrazba && !vsechnyJeden) tichaDrazba.push(s.f);
    }
    if (bez && !vsechnyJeden && !neniLiJinak) bezVety.push(s.f);
    for (const t of Object.keys(typy)) {
      if (typy[t] >= 10 && typy[t] === s.radky.length) vyplne.push(`${s.f}: ${typy[t]}× ${t}`);
    }
  }
  pravda(`odznaků zbylo jen na výjimkách (${odznaku} z ${odznaku + bezOdznaku} řádků)`,
    odznaku > 0 && odznaku < (odznaku + bezOdznaku) / 4,
    `odznaků ${odznaku}, řádků ${odznaku + bezOdznaku}`);
  pravda(`a pořád někde jsou (jinak by se nehlídalo nic)`, odznaku >= 50, String(odznaku));
  pravda(`stránky to říkají větou (${sVetouVsechny}× „všechny", ${sVetouJinak}× „není-li uvedeno jinak")`,
    sVetouVsechny > 0 && sVetouJinak > 0, `${sVetouVsechny} / ${sVetouJinak}`);
  pravda('kde odznak chybí, stojí nad výpisem, co to znamená', bezVety.length === 0,
    bezVety.slice(0, 5).join(', '));
  pravda('ŽÁDNÝ řádek bez odznaku nevypadá jako dražba', tichaDrazba.length === 0,
    'splést si dražbu s prodejem je nejdražší chyba na tomhle webu: '
    + [...new Set(tichaDrazba)].slice(0, 4).join(', '));
  pravda('žádná stránka nemá deset a víc řádků s jedním a týmž odznakem',
    vyplne.length === 0, vyplne.slice(0, 5).join('; '));
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

// --- D) ODPOČET DO DRAŽBY -----------------------------------------
/* U dražby je termín to rozhodující: kdo se o ní dozví den po ní,
   nedozvěděl se nic. V mapě i na stránce pozemku se odpočet ukazuje
   odjakživa, na statických výpisech chyběl. Hlídá se, že tam je, že
   sedí na datum vedle sebe a že má správnou naléhavost — a že se
   nelepí na obyčejný prodej, kde by nedával smysl. */
{
  new Function(readFileSync(path.join(KOREN, 'js', 'terminy.js'), 'utf8'))();
  const T = globalThis.PK_TERMINY;
  let sDatem = 0, bezOdpoctu = 0, spatnyText = [], spatnaTrida = [], uProdeje = [];
  const dnes = new Date(); dnes.setHours(0, 0, 0, 0);
  for (const s of stranky) {
    /* Typ se pozná z odznaku, a kde odznak není (stránka s jediným
       typem), tak z věty nad výpisem. Na první pokus jsem hledal
       „· Dražba " v podrobnostech — jenže tam stojí to, co napsal
       zdroj, tedy „dražba 12. 10. 2026 · OK dražby" s malým d.
       Kontrola pak hlásila odpočet u „běžného prodeje" na stránce,
       kde jsou samé dražby. */
    const stranVDrazbe = /Všechny nabídky v tomhle výpisu jsou <b>(ve veřejné dražbě|v exekuční dražbě)<\/b>/.test(s.h);
    for (const r of s.radky) {
      const jeDrazba = stranVDrazbe
        || /class="okr-badge t-(drazba|exekuce)"/.test(r)
        || /\b(dražba|dražby|dražbě|exekuce|exekuční)\b/i.test(r.replace(/<a [^>]*>[\s\S]*?<\/a>/g, ''));
      const md = /(\d{1,2})\. (\d{1,2})\. (\d{4})/.exec(r);
      const mo = /<span class="opp-cd([^"]*)">([^<]+)<\/span>/.exec(r);
      if (!jeDrazba) { if (mo) uProdeje.push(s.f); continue; }
      if (!md) continue;
      sDatem++;
      if (!mo) { bezOdpoctu++; continue; }
      const cil = new Date(+md[3], +md[2] - 1, +md[1]);
      const dni = Math.round((cil - dnes) / 86400000);
      if (mo[2].trim() !== T.countdownText(dni)) spatnyText.push(`${s.f}: „${mo[2]}" vs. ${T.countdownText(dni)} (${dni} dní)`);
      if (mo[1].trim() !== T.countdownClass(dni).trim()) spatnaTrida.push(`${s.f}: „${mo[1]}" vs. „${T.countdownClass(dni)}"`);
    }
  }
  pravda(`je co měřit — dražeb s termínem ve výpisech: ${sDatem}`, sDatem >= 50, String(sDatem));
  pravda('každá dražba s termínem má odpočet', bezOdpoctu === 0, `${bezOdpoctu} bez odpočtu`);
  pravda('odpočet sedí na datum vedle sebe', spatnyText.length === 0, spatnyText.slice(0, 4).join('; '));
  pravda('a naléhavost (barva) sedí na počet dnů', spatnaTrida.length === 0, spatnaTrida.slice(0, 4).join('; '));
  pravda('u běžného prodeje odpočet není', uProdeje.length === 0,
    'prodej nemá termín, odpočet by si ho vymýšlel: ' + [...new Set(uProdeje)].slice(0, 3).join(', '));
}

// --- E) PŘEHLED DRAŽEB JE ŘAZENÝ PODLE TERMÍNU --------------------
{
  const f = 'drazby-pozemku-nabidky.html';
  const s = stranky.find((x) => x.f === f);
  if (!s) {
    pravda(`${f} existuje`, false, 'celostátní přehled dražeb se negeneruje');
  } else {
    const dny = [];
    for (const r of s.radky) {
      const m = /(\d{1,2})\. (\d{1,2})\. (\d{4})/.exec(r);
      if (m) dny.push(new Date(+m[3], +m[2] - 1, +m[1]).getTime());
    }
    pravda(`přehled dražeb má řádky s termínem (${dny.length})`, dny.length >= 20, String(dny.length));
    const poradi = dny.every((d, i) => i === 0 || dny[i - 1] <= d);
    pravda('a jsou seřazené od nejbližšího termínu', poradi,
      'u dražby rozhoduje datum, ne cena — kdo se dozví den po dražbě, nedozvěděl se nic');
    pravda('a stránka to u výpisu říká', /Seřazeno <b>podle termínu<\/b>/.test(s.h));
  }
}

console.log('Řádky výpisu:');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb.`);
if (chyb) { console.log('::error::Řádky výpisu: ' + chyb + ' kontrol neprošlo.'); process.exit(1); }
process.exit(0);
