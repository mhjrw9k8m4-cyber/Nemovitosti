/* Test: odhad ceny na okresních, krajských a druhových stránkách.
 *
 * Spuštění: node scripts/test-odhad-regiony.mjs
 *
 * PROČ. Mapa i stránka pozemku u každé nabídky říkají, jak je drahá
 * proti okolí. Na stránkách, kam lidé chodí z vyhledávačů, stál jen holý
 * ceník — kdo přišel odtud, neměl jak poznat, jestli je 1 200 Kč/m²
 * v tom okrese hodně, nebo málo.
 *
 * Hlídá se, že se odznaky nerozejdou s modelem: každý řádek dostane
 * přesně to, co o té nabídce říká js/ceny.js, a hlavně že se DRŽÍ JEHO
 * OPATRNOSTI — u spoluvlastnického podílu se o slevě nemluví (cena je za
 * zlomek, výměra celá), neuvěřitelná sleva není nabídka, ale varování.
 * Bez toho by stránky mohly doporučovat právě ty nabídky, před kterými
 * mapa varuje.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { mapaSouboru } from './generate-parcel-pages.mjs';
import { pricinaChyb } from './chyby-hlaska.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const req = createRequire(import.meta.url);
req(path.join(ROOT, 'js', 'ceny.js'));
const CENY = globalThis.PK_CENY;

let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

pravda('cenový model se načetl', !!(CENY && CENY.postav), 'js/ceny.js nevydal PK_CENY.postav');

/* Model se staví ze STEJNÉ hromádky jako generátor: syrová data bez
   duplicit. Kdyby se tu vzaly jen nabídky, které dostaly vlastní
   stránku (což je podmnožina), vyšly by u hraničních nabídek jiné meze
   a kontrola by hlásila rozchod, který na stránce není.
   Vstup je tedy týž záměrně — úsudek pod tím je psaný nezávisle. */
const PKH = req(path.join(ROOT, 'js', 'hlidani-logika.js'));
const syrova = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'opportunities.json'), 'utf8')).opportunities || [];
const vsechny = PKH.bezDuplicit(syrova);
const MODEL = CENY.postav(vsechny);

/* Řádek se přiřazuje k nabídce podle ÚDAJŮ V ŘÁDKU, ne přes soubor.
   Dvě nabídky se shodnou cenou i výměrou v téže obci dostanou JEDNU
   stránku pozemku (slučuje je mapaSouboru), ale na okresní stránce jsou
   to dva řádky — v Bohumíně se takhle liší „orná půda" a „stavební
   pozemek", a ta druhá vlastní stránku vůbec nemá. Podle odkazu by se
   kontrola u jednoho z nich trefila do té druhé nabídky. */
const cislo = (x) => Number(String(x || '').replace(/[^\d]/g, '')) || 0;
const klic = (place, druh, area, price) =>
  [String(place || '').trim(), String(druh || '').trim().toLowerCase(), area, price].join('|');
const podleUdaju = new Map();
for (const o of vsechny) podleUdaju.set(klic(o.place, o.druh, o.area || 0, o.price || 0), o);

/* Co MÁ u nabídky stát — opsáno z js/main.js, ne z generátoru. Kdyby se
   to počítalo týmž kódem jako stránka, kontrola by jen opisovala sama
   sebe a prošla by i s úplně obrácenou úvahou. */
function cekano(o) {
  const od = MODEL.odhad(o);
  /* NEDŮVĚRYHODNÁ NABÍDKA JE PRVNÍ PRAVIDLO, a tady chybělo — i když
     komentář výš správně říká, že se opisuje z js/main.js. Tam stojí:
     když model nabídku považuje za nedůvěryhodnou (cena za metr pod
     padesátinou místní hladiny) a odhad sám už ji neoznačil, ukaž „cena
     k ověření"; u známého podílu ne, protože to samé říká přesněji odznak
     „spoluvlastnický podíl".
     Nedůvěryhodnost přitom znamená, že odhad vrátí null — takže řádek
     `if (!od || !od.podleVelikosti) return ''` pod tím ji spolehlivě
     spolkl a kontrola čekala u těch nabídek prázdno. Generátor to dělal
     stejně, takže se obě strany mýlily shodně a nic nepadalo. */
  /* ÚŘEDNĚ STANOVENÁ CENA JE PRVNÍ PRAVIDLO — PŘED VŠEMI VAROVÁNÍMI.
     U státní půdy podle § 12 stanoví cenu úřad, ne trh, takže je zlomkem
     tržní z podstaty věci. Varování „cena k ověření" tam tvrdí, že je
     s inzerátem něco v nepořádku; není, a web to sám jinde vysvětluje.
     Naměřeno před opravou: ze 340 řádků SPÚ jich 248 varovalo a 3
     tvrdily slevu. */
  if (MODEL.spravniCena(o)) return 'urad';
  const odhadPochybny = !!(od && od.podleVelikosti && (od.pochybna || od.nejisty));
  if (MODEL.neduveryhodna(o) && !odhadPochybny && !o.podil) return 'overit';
  if (!od || !od.podleVelikosti) return '';
  if (od.pochybna) return 'overit';
  if (od.nejisty && od.podOdhadem >= 25 && !od.podil) return 'overit';
  if (od.podOdhadem >= 25 && !od.podil) return 'sleva';
  return '';
}

const stranky = fs.readdirSync(ROOT).filter((f) =>
  /^pozemky-okres-.+\.html$/.test(f) || /^pozemky-.+-kraj\.html$/.test(f) ||
  /^pozemky-(stavebni|lesni|louka|orna-puda|zahrada|vinice-sad|od-lidi)\.html$/.test(f));
pravda('našly se regionální a druhové stránky', stranky.length > 50, `nalezeno ${stranky.length}`);

let radkuCelkem = 0, sleva = 0, overit = 0;
/* Kolik řádků má odkaz na pozemek a kolik z nich se podařilo PŘEČÍST.
   Když se vzor na cenu rozejde s tím, co generátor tiskne, řádky z téhle
   kontroly tiše vypadnou — a mez „prošly se stovky řádků" to nepozná. */
let sOdkazem = 0, sCenou = 0, urad = 0;
const spatne = [];
for (const f of stranky) {
  const html = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const radky = html.split('<div class="okr-item">').slice(1);
  for (const r of radky) {
    const m = /href="(pozemek-[^"]+\.html)"/.exec(r);
    if (!m) continue;
    const place = (/class="okr-place"[^>]*>([^<]+)/.exec(r) || [, ''])[1].trim();
    const meta = (/class="okr-meta"[^>]*>([\s\S]*?)<\/span>/.exec(r) || [, ''])[1];
    const druh = meta.split('·')[0].replace(/<[^>]*>/g, '').trim();
    const area = cislo((/<b>([\d\s\u00a0]+)\s*m²<\/b>/.exec(r) || [, ''])[1]);
    /* Vzor musí snést ATRIBUTY na `.okr-cena`. U dražby a exekuce k ní
       přibyl popisek, co to číslo vlastně je („vyvolávací cena"), a vzor
       bez `[^>]*` o ty řádky tiše přišel — 122 ze 2 111. Mlčky, protože
       mez „prošly se stovky řádků" je splněná i bez nich, a zmizely by
       přitom právě dražby, kvůli kterým ten popisek vznikl. */
    const price = cislo((/class="okr-cena"[^>]*><b>([^<]*)<\/b>/.exec(r) || [, ''])[1]);
    sOdkazem++;
    if (price > 0) sCenou++;
    const o = podleUdaju.get(klic(place, druh, area, price));
    if (!o) continue;
    radkuCelkem++;
    const je = /okr-urad/.test(r) ? 'urad'
      : /okr-sleva/.test(r) ? 'sleva' : (/okr-overit/.test(r) ? 'overit' : '');
    if (je === 'sleva') sleva++;
    if (je === 'overit') overit++;
    if (je === 'urad') urad++;
    const ma = cekano(o);
    if (je !== ma) spatne.push(`${f} → ${m[1]}: je „${je || '—'}", má být „${ma || '—'}"`);
  }
}

/* Pojistky proti měření na prázdnu: bez řádků, bez jediné slevy a bez
   jediného varování by tvrzení níž neplatilo o ničem. */
pravda('prošly se stovky řádků', radkuCelkem > 300, `řádků ${radkuCelkem}`);
pravda(`u každého řádku s odkazem se cena opravdu přečetla (${sCenou} z ${sOdkazem})`,
  sOdkazem > 1000 && sCenou === sOdkazem,
  `přečteno ${sCenou} z ${sOdkazem} — vzor na cenu nesedí s tím, co generátor tiskne`);
pravda('a aspoň někde se sleva opravdu ukazuje', sleva > 0, `slev ${sleva}`);
pravda('a aspoň někde stojí varování „cena k ověření"', overit > 0, `varování ${overit}`);
/* --- ÚŘEDNĚ STANOVENÁ CENA SE NESMÍ TVÁŘIT JAKO SLEVA ANI JAKO ZÁVADA -
 * Naměřeno před opravou: 340 řádků státní půdy (SPÚ, § 12) na okresních
 * a druhových stránkách, z nich 248 s odznakem „cena k ověření" a 3
 * s „−N % proti okolí". Ověřovat tam není co — tu cenu stanovil úřad —
 * a slevou to není, protože rozdíl proti trhu nevznikl na trhu. */
pravda(`a u státní půdy stojí „úřední cena (§ 12)" (${urad} řádků)`, urad > 100,
  `${urad} řádků — pod sto by to neplatilo o ničem`);
{
  const spu = vsechny.filter((o) => MODEL.spravniCena(o));
  pravda(`nabídek se správní cenou je dost na měření (${spu.length})`, spu.length >= 50,
    `jen ${spu.length}`);
  pravda('žádná z nich nedostane slevu ani varování',
    spu.every((o) => cekano(o) === 'urad'),
    `výjimky: ${spu.filter((o) => cekano(o) !== 'urad').length}`);
  /* A že to je opravdu PRVNÍ pravidlo: bez něj by většina z nich
     varovala. Měří se tím, co by řekla pravidla BEZ té výjimky. */
  const bezVyjimky = spu.filter((o) => {
    const od = MODEL.odhad(o);
    const poch = !!(od && od.podleVelikosti && (od.pochybna || od.nejisty));
    if (MODEL.neduveryhodna(o) && !poch && !o.podil) return true;
    if (!od || !od.podleVelikosti) return false;
    return od.pochybna || (od.nejisty && od.podOdhadem >= 25 && !od.podil)
      || (od.podOdhadem >= 25 && !od.podil);
  });
  pravda(`bez té výjimky by varovala nebo slevila většina (${bezVyjimky.length} z ${spu.length})`,
    bezVyjimky.length > spu.length / 2,
    `${bezVyjimky.length} — pak výjimka nic neřeší a tohle měření je mylné`);
}
pravda('žádný řádek se nerozchází s cenovým modelem', spatne.length === 0,
  spatne.slice(0, 4).join(' | '));

/* --- U DRAŽBY TO NENÍ SLEVA, JE TO VYVOLÁVACÍ CENA ------------------
 *
 * Hladina, proti které se „−37 % proti okolí" měří, je z běžných nabídek
 * na prodej — správná srovnávací skupina. Jenže číslo, které se s ní
 * srovnává, u dražby není cena, za kterou se pozemek prodává: je to
 * vyvolávací cena, od které se přihazuje. „−37 % proti okolí" se čte
 * jako sleva a slibuje něco, co dražba teprve rozhodne.
 *
 * Naměřeno na vygenerovaných stránkách: 2 194 řádků, z toho 205 dražeb
 * a exekucí, a 14 z nich ten odznak nese (stránka dražeb a okresy Beroun
 * a Litoměřice). Stránka pozemku je u téhož pozemku opatrná
 * („Vyvolávací cena 1 875 000 Kč"); `pozemky-okres-beroun.html` slovo
 * „vyvolávací" neobsahovala ani jednou.
 *
 * Hlídá se, že na řádku mimo prodej je u ceny napsáno, co to číslo je,
 * a že odznak slevy u takového řádku tu cenu pojmenuje. */
{
  const vsechnyStranky = stranky.concat(['drazby-pozemku-nabidky.html']
    .filter((f) => fs.existsSync(path.join(ROOT, f))));
  let mimoProdej = 0, bezPopisku = 0, slevaBezNazvu = 0;
  const ukazky = [];
  for (const f of vsechnyStranky) {
    const html = fs.readFileSync(path.join(ROOT, f), 'utf8');
    for (const r of html.split('<div class="okr-item">').slice(1)) {
      const typ = (/class="okr-badge t-([a-z]+)"/.exec(r) || [, ''])[1];
      const meta = (/class="okr-meta"[^>]*>([\s\S]*?)<\/span>/.exec(r) || [, ''])[1];
      /* Typ se v řádku neopakuje u PŘEVAŽUJÍCÍHO typu (viz itemRow), takže
         na stránce dražeb odznak chybí — tam se typ pozná z podrobností. */
      const jeMimoProdej = typ === 'drazba' || typ === 'exekuce'
        || (!typ && /dražba\s|exekuce/.test(meta));
      if (!jeMimoProdej) continue;
      mimoProdej++;
      const cenaCast = (/class="okr-cena"([^>]*)>/.exec(r) || [, ''])[1];
      if (!/vyvolávací|uváděná|bezceny/i.test(cenaCast)) {
        bezPopisku++;
        if (ukazky.length < 3) ukazky.push(`${f}: u ceny nestojí, co to číslo je`);
      }
      const odznak = (/<b class="okr-sleva"[^>]*>([\s\S]*?)<\/b>/.exec(r) || [, ''])[1];
      if (odznak && !/vyvolávací|uváděná/i.test(odznak)) {
        slevaBezNazvu++;
        if (ukazky.length < 3) ukazky.push(`${f}: „${odznak.replace(/\s+/g, ' ')}" bez názvu ceny`);
      }
    }
  }
  pravda(`našly se řádky dražeb a exekucí (${mimoProdej})`, mimoProdej >= 50,
    `jen ${mimoProdej} — kontroly níž by neměly co měřit`);
  pravda('u každého stojí, co to číslo je (vyvolávací / uváděná cena)',
    bezPopisku === 0, `${bezPopisku} řádků bez popisku: ${ukazky.join(' | ')}`);
  pravda('a odznak „−N % proti okolí" tu cenu pojmenuje',
    slevaBezNazvu === 0,
    `${slevaBezNazvu} řádků tvrdí slevu z vyvolávací ceny: ${ukazky.join(' | ')}`);
}

/* A ta nejdůležitější opatrnost zvlášť, ať je vidět i v názvu kontroly. */
const podilySeSlevou = vsechny.filter((o) => o.podil && cekano(o) === 'sleva');
pravda('u spoluvlastnického podílu se o slevě nemluví nikdy',
  podilySeSlevou.length === 0, `podílů se slevou ${podilySeSlevou.length}`);

console.log('\nOdhad ceny na regionálních stránkách');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Odhad na regionálních stránkách: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
process.exit(0);
