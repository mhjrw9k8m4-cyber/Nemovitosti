// Zkouška: strojový popis stránky musí mluvit O TÉ STRÁNCE.
//
// Našlo se to 11. 11. na inzerce.html — tedy na stránce, kterou majitel
// posílá realitním kancelářím. Měla ld+json s těmito údaji:
//
//   @type Article, headline „Hypotéka na pozemek: jak financovat koupi",
//   description o LTV a bankách, drobečky s touž větou
//
// zatímco <title> je „Inzerce zdarma pro realitní kanceláře". Vzniklo to
// kopií z hypoteka-na-pozemek.html, jejíž <title> je s tím headline
// ZNAK PO ZNAKU totožný. Ve výsledcích hledání by tedy stránka pro
// agentury vystupovala jako článek o hypotékách.
//
// Hlídá se přesně ta třída vad, která to způsobila: text ve strojovém
// popisu, který patří JINÉ stránce v repozitáři. To je kontrola bez
// falešných nálezů — zkrácený drobeček („Aktuální dražby" na stránce
// „Dražby pozemků — aktuální nabídky v ČR") projde, protože se s žádným
// cizím titulkem neshoduje. Posuzovat „souvisí to spolu?" by znamenalo
// hádat; tohle se dá změřit.
//
// Spuštění: node scripts/test-strojovy-popis.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hlasPad } from './zkouska-pad.mjs';
import { pricinaChyb } from './chyby-hlaska.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, chyb = 0;
const zpravy = [];
hlasPad('Strojový popis stránky', zpravy);
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push('  ✕ ' + popis + (proc ? '\n      ' + proc : '')); }
}

/* Generované stránky nabídek, okresů, krajů a druhů se sem nepočítají:
   jejich popis skládá generátor z dat, takže kopie z jiné stránky tam
   vzniknout nemůže, a bylo by to 13 000 souborů na jedno čtení. Hlídají
   je test-stranky-pozemku a test-json-ve-strance. */
const GENEROVANE = /^(pozemek-|pozemky-okres-|pozemky-kraj-|pozemky-druh-)/;
const soubory = fs.readdirSync(ROOT)
  .filter((f) => f.endsWith('.html') && !GENEROVANE.test(f))
  .sort();

/* Srovnávací tvar: nezlomitelná mezera je pro čtenáře táž mezera jako
   obyčejná (česká sazba ji sází po jednopísmenných předložkách, takže
   <title> ji má a ld+json ne), velikost písmen nerozhoduje. */
const srovnat = (s) => String(s || '').replace(/ /g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
const titulHlavni = (t) => {
  const m = t.match(/<title>([^<]*)<\/title>/);
  return m ? m[1].split('|')[0].trim() : '';
};
const popisek = (t) => {
  const m = t.match(/<meta\s+name="description"\s+content="([^"]*)"/);
  return m ? m[1] : '';
};

const stranky = [];
for (const f of soubory) {
  const text = fs.readFileSync(path.join(ROOT, f), 'utf8');
  const bloky = [...text.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map((m) => m[1]);
  stranky.push({ f, titul: titulHlavni(text), popis: popisek(text), bloky });
}
const sJsonLd = stranky.filter((s) => s.bloky.length);

// PŘEDPOKLAD: bez stránek se strojovým popisem by zkouška neměřila nic.
pravda(`v repozitáři jsou ručně psané stránky se strojovým popisem (${sJsonLd.length})`,
  sJsonLd.length >= 30, 'našlo se jich ' + sJsonLd.length + ' — buď zmizely, nebo se změnil tvar zápisu');

// A každý blok musí být čitelný JSON, jinak z něj vyhledávač nepřečte nic.
const necitelne = [];
for (const s of sJsonLd) {
  for (const b of s.bloky) { try { JSON.parse(b); } catch (e) { necitelne.push(s.f); } }
}
pravda('a každý z nich je čitelný JSON', necitelne.length === 0, 'nečitelné: ' + necitelne.join(', '));

/* Komu který titulek a popisek patří. Když dvě stránky nesou týž
   titulek, do mapy se nedá ani jedna — kopie by se v takovém případě
   nedala poznat od záměrné shody a zkouška by hádala. */
const dleTitulku = new Map();
const dlePopisku = new Map();
for (const s of stranky) {
  if (s.titul) {
    const k = srovnat(s.titul);
    dleTitulku.set(k, dleTitulku.has(k) ? null : s.f);
  }
  if (s.popis && s.popis.length > 40) {
    const k = srovnat(s.popis);
    dlePopisku.set(k, dlePopisku.has(k) ? null : s.f);
  }
}

const nalezy = [];
const cizi = (s, pole, hodnota, mapa) => {
  if (!hodnota || String(hodnota).length < 12) return;
  const kdo = mapa.get(srovnat(hodnota));
  if (kdo && kdo !== s.f) nalezy.push(`${s.f}: ${pole} je text stránky ${kdo} („${String(hodnota).slice(0, 60)}")`);
};
const mimoSebe = [];
for (const s of sJsonLd) {
  for (const b of s.bloky) {
    let data;
    try { data = JSON.parse(b); } catch (e) { continue; }
    for (const o of (Array.isArray(data) ? data : [data])) {
      if (!o || typeof o !== 'object') continue;
      cizi(s, 'headline', o.headline, dleTitulku);
      cizi(s, 'name', o['@type'] === 'BreadcrumbList' ? '' : o.name, dleTitulku);
      cizi(s, 'description', o.description, dlePopisku);
      if (o['@type'] === 'BreadcrumbList') {
        const posl = (o.itemListElement || []).slice(-1)[0];
        if (posl) {
          cizi(s, 'poslední drobeček', posl.name, dleTitulku);
          /* Poslední drobeček je sama stránka, takže musí mířit na ni.
             Kdyby mířil jinam, vyhledávač by cestu vedl na cizí adresu. */
          if (posl.item && !String(posl.item).endsWith('/' + s.f) && !String(posl.item).endsWith('/'))
            mimoSebe.push(`${s.f}: poslední drobeček míří na ${posl.item}`);
        }
      }
      if (typeof o.mainEntityOfPage === 'string' && !o.mainEntityOfPage.endsWith('/' + s.f)
        && !o.mainEntityOfPage.endsWith('/'))
        mimoSebe.push(`${s.f}: mainEntityOfPage míří na ${o.mainEntityOfPage}`);
    }
  }
}

pravda('žádná stránka nemá ve strojovém popisu text jiné stránky', nalezy.length === 0,
  nalezy.join('\n      '));
pravda('a drobečky i mainEntityOfPage míří na tu stránku, na které stojí', mimoSebe.length === 0,
  mimoSebe.join('\n      '));

/* PŘEDPOKLAD POD KONTROLOU KOPIÍ: aspoň dvacet titulků v mapě být musí,
   jinak by kontrola výš prošla o prázdnu (třeba kdyby se změnil tvar
   <title> a srovnat() vracelo prázdno). */
pravda('srovnávací mapa titulků není prázdná',
  [...dleTitulku.values()].filter(Boolean).length >= 20,
  'jmen v mapě: ' + [...dleTitulku.values()].filter(Boolean).length);

console.log('\nStrojový popis stránky');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log(`::error::Strojový popis: ${chyb} kontrol neprošlo.` + pricinaChyb(zpravy));
  process.exit(1);
}
