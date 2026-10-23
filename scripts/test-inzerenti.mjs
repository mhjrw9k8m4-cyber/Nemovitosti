/* Test: značka inzerenta v datech, a jak je trh soustředěný.
 * ====================================================================
 * Spuštění: node scripts/test-inzerenti.mjs   (bez prohlížeče)
 *
 * PROČ. Verdikt o ceně („Výhodná cena — levnější než 78 % pozemků
 * téhož druhu v okrese") je nejsilnější tvrzení, jaké web vyslovuje
 * o penězích. Stojí na srovnání s ostatními nabídkami — a naměřeno
 * 23. 10.: z 1 932 nabídek je 900 (47 %) od JEDNOHO velkoobchodníka
 * (druhý největší inzerent má šest, 594 inzerentů má jedinou).
 * V některých okresech drží u jednoho druhu 86 až 100 % nabídek, takže
 * percentil tam nesrovnával s trhem, ale s jeho vlastním cenníkem.
 *
 * Opraveno tím, že data nesou značku inzerenta (`inz`) a model podle
 * ní mlčí nebo přiznává (oddíl 135 v docs/optimalizace.md). Tahle
 * zkouška hlídá obojí: že značka v datech JE a je spočítaná tak, jak
 * říká scripts/text-inzeratu.mjs, a že model se podle ní opravdu
 * chová. Bez první části by druhá tiše přestala platit: kdyby pole
 * z dat vypadlo, každá nabídka by se zas počítala sama za sebe
 * a všechno by vypadalo v pořádku.
 *
 * A JEDNA KONTROLA JE O TRHU, NE O KÓDU: když soustředění ještě
 * poroste, je to zpráva pro majitele (druhý zdroj dat), ne vada
 * v programu — a má to být vidět, ne se o tom dohadovat.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { otiskInzerenta } from './text-inzeratu.mjs';
import { pricinaChyb } from './chyby-hlaska.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require_ = createRequire(import.meta.url);
const PKH = require_(path.join(KOREN, 'js', 'hlidani-logika.js'));
const okno = {};
new Function('window', fs.readFileSync(path.join(KOREN, 'js', 'ceny.js'), 'utf8'))(okno);
const CENY = okno.PK_CENY;

let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

const celek = JSON.parse(fs.readFileSync(path.join(KOREN, 'data', 'opportunities.json'), 'utf8'));
const popisy = JSON.parse(fs.readFileSync(path.join(KOREN, 'data', 'popisy.json'), 'utf8'));
const VSE = PKH.bezDuplicit(celek.opportunities || []);
const klic = (o) => `${o.place}|${o.cast || '—'}|${o.okres}|${Number(o.lat).toFixed(3)}|${Number(o.lng).toFixed(3)}#${o.price}|${o.area}`;

/* ---- A) ZNAČKA V DATECH -------------------------------------------- */
const sPopisem = VSE.filter((o) => popisy[klic(o)]);
const sZnackou = VSE.filter((o) => o.inz);
pravda(`nabídek s popisem je dost na měření (${sPopisem.length})`,
  sPopisem.length >= 500, 'bez popisů se inzerent poznat nedá a zkouška nic neměří');
pravda(`a značku inzerenta jich má (${sZnackou.length})`,
  sZnackou.length >= sPopisem.length * 0.95,
  `jen ${sZnackou.length} z ${sPopisem.length} — doplní to: node scripts/doplnit-inzerenty.mjs`);

/* Značka se musí rovnat tomu, co z popisu spočítá jedno místo. Kdyby
   se rozešly, model by slučoval podle starých otisků a nikdo by to
   nepoznal — čísla by pořád vycházela, jen jinak. */
const rozesle = VSE.filter((o) => {
  const t = popisy[klic(o)];
  if (!t) return false;
  const chtelo = otiskInzerenta(t);
  return chtelo ? o.inz !== chtelo : !!o.inz;
});
pravda('a každá sedí s tím, co spočítá otiskInzerenta z popisu',
  rozesle.length === 0, `rozešlo se ${rozesle.length}, např. ${rozesle.slice(0, 2).map(klic).join(' · ')}`);

/* ---- B) JAK SOUSTŘEDĚNÝ TRH TO JE ---------------------------------- */
const podleInz = new Map();
for (const o of VSE) if (o.inz) podleInz.set(o.inz, (podleInz.get(o.inz) || 0) + 1);
const nejvetsi = [...podleInz.entries()].sort((a, b) => b[1] - a[1])[0] || ['', 0];
const podil = nejvetsi[1] / Math.max(VSE.length, 1);
/* MEZ JE TRIPWIRE, NE CÍL. Dnes je to 47 %; kdyby to přešlo 60 %, je
   celý výpis jednoho velkoobchodu a verdikt o ceně nebude mít s čím
   srovnávat ani s přiznáním. Spravit to nejde v kódu — chce to druhý
   zdroj dat (docs/pro-majitele.md). */
pravda(`největší inzerent drží ${(podil * 100).toFixed(0)} % nabídek (${nejvetsi[1]} z ${VSE.length})`,
  podil < 0.6,
  'jeden inzerent má nadpoloviční většinu trhu v datech — verdikt o ceně nemá s čím srovnávat; '
  + 'je potřeba druhý zdroj dat, viz docs/pro-majitele.md');
pravda(`a inzerentů je víc než jeden (${podleInz.size})`, podleInz.size >= 50,
  `jen ${podleInz.size} — vzorek na srovnání cen tím padá`);

/* ---- C) MODEL SE PODLE TOHO OPRAVDU CHOVÁ -------------------------- */
const M = CENY.postav(VSE);
let verdiktu = 0, sPriznanim = 0, nadMezi = 0;
for (const o of VSE) {
  const p = M.percentil(o);
  if (!p) continue;
  verdiktu++;
  if (p.podilInz > CENY.MEZ_PRIZNAT_INZERENTA) sPriznanim++;
  if (p.podilInz > 0.9) nadMezi++;
}
pravda(`verdikt o ceně vzniká (${verdiktu} nabídek)`, verdiktu >= 300,
  `jen ${verdiktu} — pravidlo o inzerentech zasáhlo i poctivá srovnání`);
pravda(`a u každého se ví, jak je soustředěný (${sPriznanim} nad mezí ${CENY.MEZ_PRIZNAT_INZERENTA})`,
  sPriznanim > 0, 'žádný verdikt nehlásí soustředění — podilInz se nepočítá');
pravda('žádný verdikt nestojí na přihrádce jednoho inzerenta (nad 90 %)',
  nadMezi === 0, `${nadMezi} verdiktů stojí na cenníku jednoho prodejce`);

/* A jedna sabotáž naživo: bez značky se chová jako dřív. Kdyby to
   nebylo poznat, znamenalo by to, že se podilInz nepočítá z dat. */
const bezZnacky = VSE.map((o) => { const c = Object.assign({}, o); delete c.inz; return c; });
const M2 = CENY.postav(bezZnacky);
let bezPriznani = 0;
for (const o of bezZnacky) { const p = M2.percentil(o); if (p && p.podilInz > 0) bezPriznani++; }
pravda('a bez značky model žádné soustředění nehlásí (je to z dat, ne z kódu)',
  bezPriznani === 0, `${bezPriznani} verdiktů hlásí soustředění i bez značky`);

/* ---- D) ÚVODNÍ STRÁNKA TAKOVOU NABÍDKU NEDOPORUČÍ -----------------
   „Nejlepší příležitosti" je doporučení, ne jen číslo — a doporučovat
   se nemá to, o čem víme, že se neporovnalo s trhem. Měří se dvakrát:
   v kódu (pravidlo ve js/main.js existuje) a na datech (opravdu něco
   vyřadí a něco nechá). Jedno bez druhého nestačí: pravidlo, které
   nikdy nic nevyřadí, je mrtvé, a data bez pravidla neznamenají nic. */
const mainJs = fs.readFileSync(path.join(KOREN, 'js', 'main.js'), 'utf8');
/* Hledá se v okolí výběru příležitostí, ne kdekoli v souboru — jinak by
   stačilo slovo v komentáři. */
const vyber = (() => {
  const i = mainJs.indexOf('di.cheaper < 65');
  return i < 0 ? '' : mainJs.slice(Math.max(0, i - 400), i + 400);
})();
pravda('js/main.js vybírá příležitosti a dívá se u toho na soustředění',
  /di\.podilInz/.test(vyber), 'v okolí výběru příležitostí se podilInz nečte');

let bylyBy = 0, zbydou = 0;
for (const o of VSE) {
  const p = M.percentil(o);
  if (!p || p.cheaper < 65) continue;
  bylyBy++;
  if (!(p.podilInz > CENY.MEZ_PRIZNAT_INZERENTA)) zbydou++;
}
pravda(`pravidlo opravdu vyřazuje (${bylyBy} by se nabízelo, zbude ${zbydou})`,
  zbydou < bylyBy, 'nevyřadilo nic — pak je to mrtvé pravidlo');
pravda('a nevyřadí všechno (jinak blok příležitostí zmizí)', zbydou >= 20,
  `zbylo by jen ${zbydou} nabídek na celou republiku`);

/* ---- E) MALÝ MODELOVÝ SOUBOR ZNAČKU NESE --------------------------- */
const model = JSON.parse(fs.readFileSync(path.join(KOREN, 'data', 'model.json'), 'utf8'));
pravda(`data/model.json nese slovník inzerentů (${(model.inzerenti || []).length})`,
  (model.inzerenti || []).length >= 50, 'bez něj počítá stránka pozemku jinak než mapa');
pravda('a sloupec je stejně dlouhý jako ostatní',
  Array.isArray(model.s) && model.s.length === model.a.length,
  `s: ${(model.s || []).length}, a: ${(model.a || []).length}`);

console.log('\nZnačka inzerenta a soustředění trhu');
console.log(zpravy.join('\n'));
console.log(`\n  · nabídek ${VSE.length}, inzerentů ${podleInz.size}, největší ${nejvetsi[1]} (${(podil * 100).toFixed(0)} %)`);
console.log(`  · verdiktů ${verdiktu}, z toho s přiznáním soustředění ${sPriznanim}`);
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Inzerenti: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
