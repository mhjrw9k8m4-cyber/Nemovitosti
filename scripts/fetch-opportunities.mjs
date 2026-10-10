#!/usr/bin/env node
/**
 * Parcelka — sběr příležitostí z veřejných zdrojů.
 *
 * Robot stáhne data z jednotlivých zdrojů, sjednotí je do jednoho formátu
 * a zapíše do data/opportunities.json. Web si ten soubor pak jen načte.
 *
 * Zdroje: evidence dražeb (CEVD), OK dražby, Státní pozemkový úřad (§ 12),
 * Bezrealitky, Farmy.cz a volitelně Sreality přes Apify (jen s tokenem).
 * Když žádný zdroj nevrátí data, ponecháme stávající soubor beze změny,
 * aby web nezůstal prázdný.
 *
 * Formát jedné příležitosti:
 *   { place, okres, type, parcel, druh, area, price, extra, lat, lng }
 *   type ∈ 'sale' | 'drazba' | 'exekuce' | 'obec'
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { okresPodleGPS, okresPodleHranice, maHranice, kmVenZOkresu } from './okres-podle-gps.mjs';
/* Klíč nabídky počítá generátor stránek pozemků — a počítá ho jen on,
   aby se popis a stránka nemohly rozejít. */
import { klicNabidky } from './generate-parcel-pages.mjs';
import { vymeraJePodilova } from './parcely-z-textu.mjs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { createRequire } from 'node:module';
import { bezEmodzi } from './text-inzeratu.mjs';
const __dirname = dirname(fileURLToPath(import.meta.url));
/* Co je u pozemku zavedené a jestli nejde jen o podíl — vytahuje se z
   POPISU, který se u většiny zdrojů stahoval už dávno a jen se zahazoval
   (používal se pouze k určení druhu). Pravidla jsou ve sdíleném modulu,
   ať je web i robot čtou stejně a ať se dají testovat bez sítě. */
const PKVybaveni = createRequire(import.meta.url)(join(dirname(fileURLToPath(import.meta.url)), '..', 'js', 'vybaveni.js'));
/* Zapisuje se jen to, co se opravdu našlo. Prázdné pole u dvou tisíc
   záznamů by soubor jen nafouklo a na mobilu zdržovalo. */
function pridejVybaveni(o, text) {
  if (!text) return o;
  const v = PKVybaveni.najdi(text);
  if (v.site.length) o.site = v.site;
  if (v.podil) o.podil = true;
  /* Velikost podílu je jen údaj k přečtení — nic se jí nepřepočítává
     (viz js/vybaveni.js). Půlka pozemku a jedna šestnáctina jsou ale
     úplně jiná nabídka, takže se vyplatí ji ukázat. */
  if (v.zlomek) o.zlomek = v.zlomek;
  /* JE ULOŽENÁ VÝMĚRA UŽ PODÍLOVÁ? U jednoho zdroje ano a cenový model
     ji pak dělil zlomkem podruhé (viz vymeraVCene v js/ceny.js).
     Rozhoduje se to z textu a jen když to inzerát dokazuje — pravidla
     i měření jsou v scripts/parcely-z-textu.mjs. Musí to být TEĎ,
     protože `zlomek` se nasadil o řádek výš. */
  if (o.podil && vymeraJePodilova(text, o)) o.vymera_podilu = true;
  return o;
}
/* ====================================================================
   KDY BYLA NABÍDKA VIDĚT POPRVÉ
   --------------------------------------------------------------------
   Datum se přenáší z minulého souboru podle otisku; co se nenajde,
   dostane dnešek. Otisk musí odpovídat keyOf() v js/hlidani-logika.js,
   jinak by se pozemky „obnovovaly" při každém běhu.

   ZMĚNA CENY NESMÍ NABÍDCE SEBRAT VĚK. Otisk nese i cenu, takže jakmile
   prodejce zlevnil, nabídka se v minulém souboru nenašla a dostala
   dnešek. Naměřeno na ostrých datech: všech 25 nabídek se zaznamenanou
   změnou ceny mělo first_seen přesně ten den, kdy se cena změnila —
   25 z 25. Na stránce „Co je nového" z toho bylo vidět 14 pozemků
   zároveň v „Nově přidané" i v „Zlevněné", což je protimluv: nově
   přidaná nabídka nemá co zlevnit.

   Druhé kolo proto páruje otiskem BEZ ceny — ale jen tam, kde je ta
   shoda JEDNOZNAČNÁ na obou stranách. Jinak by si dvě různé nabídky
   téže výměry ve stejném katastru vyměnily datum. Změřeno: vypuštění
   ceny přidá v dnešních datech tři kolize z 1 988 nabídek, a právě ty
   tohle pravidlo přeskočí.
   ==================================================================== */
const bezDiakritiky = (x) => String(x == null ? '' : x)
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
export function otiskNabidky(o) {
  return [o.type || '', bezDiakritiky(o.okres), bezDiakritiky(o.place),
    o.parcel || '', o.price || '', o.area || ''].join('|').slice(0, 240);
}
/** Týž otisk bez ceny — nabídka je táž, i když prodejce zlevnil. */
export function otiskNabidkyBezCeny(o) {
  return [o.type || '', bezDiakritiky(o.okres), bezDiakritiky(o.place),
    o.parcel || '', o.area || ''].join('|').slice(0, 240);
}
/** Doplní `first_seen` do `fresh` podle `drive`. Mění předaná data. */
export function prirazPrvniVideni(fresh, drive, dnesISO) {
  const podleOtisku = new Map();
  for (const o of (drive || [])) if (o && o.first_seen) podleOtisku.set(otiskNabidky(o), o.first_seen);
  const bezData = [];
  for (const o of fresh) {
    const d = podleOtisku.get(otiskNabidky(o));
    if (d) o.first_seen = d; else { delete o.first_seen; bezData.push(o); }
  }
  let poZmeneCeny = 0;
  if (bezData.length && (drive || []).length) {
    const pouzite = new Set(fresh.filter((o) => o.first_seen).map((o) => otiskNabidky(o)));
    const stareVolne = new Map();
    for (const o of drive) {
      if (!o || !o.first_seen || pouzite.has(otiskNabidky(o))) continue;
      const k = otiskNabidkyBezCeny(o);
      if (!stareVolne.has(k)) stareVolne.set(k, []);
      stareVolne.get(k).push(o);
    }
    const novePocty = new Map();
    for (const o of bezData) {
      const k = otiskNabidkyBezCeny(o);
      novePocty.set(k, (novePocty.get(k) || 0) + 1);
    }
    for (const o of bezData) {
      const k = otiskNabidkyBezCeny(o);
      const st = stareVolne.get(k);
      if (novePocty.get(k) === 1 && st && st.length === 1) { o.first_seen = st[0].first_seen; poZmeneCeny++; }
    }
  }
  let novych = 0;
  for (const o of bezData) if (!o.first_seen) { o.first_seen = dnesISO; novych++; }
  return { novych, poZmeneCeny };
}

const OUT = join(__dirname, '..', 'data', 'opportunities.json');
/* Denní počty podle zdroje — paměť pro to pomalejší síto (viz
   porovnejSHistorii). Vedle dat, ne v gitové historii: robot v CI má
   plochý klon a do historie se podívat nemůže. */
const HIST_ZDROJU = join(__dirname, '..', 'data', 'zdroje-historie.json');
const OKRESY = join(__dirname, '..', 'data', 'okresy.json');
const GEOCACHE = join(__dirname, '..', 'data', 'geocode-cache.json');
/* Popisy od inzerentů. Zvlášť, aby je nemusela stahovat úvodní stránka.
 *
 * TENHLE SOUBOR SE ZVEŘEJŇUJE, A JE TO V POŘÁDKU — jednou změřeno, ať se
 * to nerozhoduje potřetí. Čte ho jen build (generátor stránek a tenhle
 * skript) a zkoušky; žádný kód v prohlížeči po něm nejde a data.html ho
 * nenabízí. Vypadá to tedy jako hromada cizího inzertního textu ležící
 * veřejně pro nikoho.
 *
 * Jenže: uložené texty jsou ÚRYVKY (medián 415 znaků, nejdelší 461)
 * a dohromady mají 663 777 znaků — zatímco v 1 635 stránkách pozemků je
 * týž text už vysázený v rozsahu 665 949 znaků. Je to tedy tentýž obsah,
 * který web stejně musí ukázat u pozemku, jen posbíraný do jednoho
 * souboru. Odebráním by nikdo nepřišel o nic, co by nenašel po stránkách.
 *
 * Nezveřejnit ho by znamenalo zapnout Jekyll a jeho exclude (dnes tu
 * .nojekyll ani _config.yml nejsou), tedy sáhnout na nasazení celého
 * webu kvůli ničemu. A do robots.txt se nepíše schválně: ta adresa
 * odnikud nevede, takže zákaz v robots.txt by ji jako jediný prozradil. */
const POPISY = join(__dirname, '..', 'data', 'popisy.json');

// Geokódování: okres → přibližné souřadnice (s malým rozptylem, ať se body nekryjí)
let OKRESY_MAP = {};
try { OKRESY_MAP = JSON.parse(readFileSync(OKRESY, 'utf8')).okresy || {}; } catch { /* ok */ }

// Cache geokódování podle názvu katastrálního území (ať Nominatim neptáme opakovaně)
let GEO_CACHE = {};
try { GEO_CACHE = JSON.parse(readFileSync(GEOCACHE, 'utf8')); } catch { /* ok */ }
let geoCacheDirty = false;

// Vzdušná vzdálenost v km (na kontrolu, jestli výsledek geokódování vůbec
// může patřit do uvedeného okresu).
function kmMezi(lat1, lng1, lat2, lng2) {
  const r = Math.PI / 180, dLat = (lat2 - lat1) * r, dLng = (lng2 - lng1) * r;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}
/* Nejdál, kam to od středu okresu ještě může být. Změřeno na datech:
   u nabídek, jejichž poloha sedí s okresem, je nejvzdálenější 47 km
   (medián 12, devětadevadesátý percentil 30). Padesát pět km je tedy
   pohodlně nad vším, co je v pořádku, a přitom pod zjevnými omyly —
   ty byly 84 až 180 km daleko. */
const OKRES_DOSAH_KM = 55;

/* Kolik smí být poloha VEN z okresu, který se u ní tvrdí, než ji budeme
   mít za omyl. Změřeno na uložených odpovědích geokódování — vzdálenosti
   od hranice uvedeného okresu, vzestupně:

     0,08 km   Koberovy | Jablonec nad Nisou
     3,08 km   Přibice | Břeclav
    36,93 km   Slatina | Brno-město
   138,74 km   Dubenec | Trutnov
   165,78 km   Přibyslavice | Liberec
   176,81 km   Pěnčín | Liberec
   208,12 km   Cvrčovice | Kladno
   216,11 km   Bohdalovice | Jablonec nad Nisou
   261,43 km   Březová | Opava

   Ty dvě první jsou v pořádku: obec leží u hranice okresu (Koberovy) nebo
   v okrese vedlejším (Přibice v Brně-venkově, dražební vyhláška uvádí
   Břeclav) — poloha je správná, jen ji od okresu dělí kousek. Od 37 km
   výš už jde o jinou obec téhož jména na druhém konci republiky. Deset
   kilometrů je tedy s přehledem nad oběma správnými případy a čtyřikrát
   pod tím nejmenším omylem; kdyby se to rozpětí jednou zúžilo, je potřeba
   tohle číslo přeměřit, ne posunout od oka. */
const OKRES_VEN_KM = 10;

/* Jedna odpověď na otázku „sedí ta poloha k tomu okresu?" pro všechna
   místa, která se ji ptají — dohledání podle jména, souřadnice od zdroje
   i odpověď vytažená z mezipaměti. Dřív si ji každé z těch tří míst
   odpovídalo samo kruhem kolem středu okresu; tři opisy téhož pravidla se
   rozcházely a ten kruh navíc sahá i do vedlejších okresů. Hranice je
   přesná odpověď, kruh zůstává jen tam, kde hranici nemáme. */
export function polohaSediSOkresem(lat, lng, okres) {
  if (typeof lat !== 'number' || typeof lng !== 'number') return false;
  const ven = kmVenZOkresu(lat, lng, okres);
  if (ven != null) return ven <= OKRES_VEN_KM;
  const stred = OKRESY_MAP[okres];
  if (!stred) return true;   // o takovém okrese nic nevíme — není co porovnat
  return kmMezi(stred[0], stred[1], lat, lng) <= OKRES_DOSAH_KM;
}

/* PROŘEZÁNÍ MEZIPAMĚTI
 *
 * Strop na vzdálenost od středu okresu (OKRES_DOSAH_KM) přišel až potom,
 * co se do mezipaměti uložily špatné odpovědi — a ta se nikdy
 * nepřepočítala, takže osm obcí dostávalo dál polohu z jiného okresu:
 * Bohdalovice „u Jablonce nad Nisou" v Českém Krumlově, Dubenec
 * „u Trutnova" v Příbrami, Slatina „v Brně" u Znojma. Oprava, která se
 * na uloženou odpověď nepodívá, je tedy k ničemu.
 *
 * Kontroluje se to hranicí okresu, ne vzdáleností od jeho středu: středem
 * se dá projít i do vedlejšího okresu (Slatina u Znojma je od středu Brna
 * 47 km, tedy pod tehdejším stropem 55 km), hranicí ne. Klíče začínající
 * „cast|" jsou názvy čtvrtí, ne souřadnice — těch se to netýká. */
export function prorezMezipamet(cache = GEO_CACHE, hlasit = true) {
  if (!maHranice()) return 0;
  const NAZVY = Object.keys(OKRESY_MAP);
  let vyhozeno = 0;
  for (const klic of Object.keys(cache)) {
    if (klic.startsWith('cast|')) continue;
    const v = cache[klic];
    if (!Array.isArray(v) || v.length !== 2) continue;
    const psanyOkres = klic.split('|')[1] || '';
    const okres = NAZVY.find((n) => n.toLowerCase() === psanyOkres);
    if (!okres) continue;
    const ven = kmVenZOkresu(v[0], v[1], okres);
    if (ven != null && !polohaSediSOkresem(v[0], v[1], okres)) {
      delete cache[klic];
      if (cache === GEO_CACHE) geoCacheDirty = true;
      vyhozeno++;
      if (hlasit) console.warn(`Mezipaměť: „${klic}" mířila ${ven.toFixed(0)} km ven z okresu — zahozeno, dohledá se znovu.`);
    }
  }
  if (vyhozeno && hlasit) console.log(`Z mezipaměti poloh zahozeno ${vyhozeno} odpovědí mimo uvedený okres.`);
  return vyhozeno;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// deterministický malý rozptyl (ať se parcely ve stejné obci nekryjí)
export function jitterAround(lat, lng, seedStr, amp) {
  let h = 0;
  const s = String(seedStr || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const j = (n) => (((h >> n) & 255) / 255 - 0.5) * amp;
  return { lat: +(lat + j(0)).toFixed(5), lng: +(lng + j(8)).toFixed(5) };
}

// Přesnější poloha podle názvu katastrálního území (Nominatim / OpenStreetMap).
const GEO_UA = { 'user-agent': 'ParcelkaBot/1.0 (+https://www.parcelaka.cz)' };
/* Okres se dosud předával jen do klíče mezipaměti, ale do DOTAZU ne — ptali
   jsme se prostě na „Police, Česko" a brali první výsledek. Jenže Polic je
   v Česku víc: nabídka z okresu Vsetín tak skončila u Jemnice, 177 km jinde.
   Stejně dopadly Rataje (180 km), Lukavec (125), Karlovice (90), Křakov (84).
   Okres teď jde do dotazu a z výsledků se bere první, který od středu toho
   okresu není dál, než okres vůbec může sahat. Když nesedí ani jeden,
   vrátíme null a poloha zůstane na středu okresu — nepřesná, ale ve
   správném kraji. To je pořád lepší než špendlík na druhém konci republiky. */
async function geocodeName(place, okres) {
  const key = (place + '|' + okres).toLowerCase();
  if (key in GEO_CACHE) return GEO_CACHE[key];
  const stred = OKRESY_MAP[okres] || null;
  let coord = null;
  try {
    const q = encodeURIComponent(place + (okres ? ', okres ' + okres : '') + ', Česko');
    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=cz&q=${q}`, { headers: GEO_UA });
    if (r.ok) {
      const j = await r.json();
      if (Array.isArray(j)) {
        for (const v of j) {
          const la = +parseFloat(v.lat).toFixed(5), ln = +parseFloat(v.lon).toFixed(5);
          if (!isFinite(la) || !isFinite(ln)) continue;
          if (!polohaSediSOkresem(la, ln, okres)) continue;
          coord = [la, ln];
          break;
        }
      }
    }
  } catch { /* síť selhala – necháme null */ }
  GEO_CACHE[key] = coord;
  geoCacheDirty = true;
  await sleep(1100); // Nominatim: max ~1 dotaz/s
  return coord;
}

/* ---------- ČTVRŤ U VELKÝCH MĚST ------------------------------------
 *
 * U 142 nabídek je místo jen „Praha", „Brno" nebo „Ostrava" — tedy celá
 * obec. V Praze to znamená 496 km²: podle takového údaje se nedá
 * rozhodnout vůbec nic, a přitom je to první věc, na kterou se člověk
 * u pozemku dívá. Zdroj nic bližšího neuvádí, jenže SOUŘADNICE MÁME —
 * u těchhle nabídek pravé, od zdroje. Stačí je přeložit zpátky na jméno.
 *
 * Bere se z Nominatimu (tentýž, který už používáme na dohledání obcí),
 * jen opačným směrem. Zoom 14 je úroveň čtvrti: níž vrací ulici (ta
 * u pozemku často neexistuje), výš zase zpátky celé město.
 *
 * Nová hodnota jde do vlastního pole `cast`, ne do `place`. Kdyby se
 * přepsalo `place`, změní se klíč pozemku (place|parcel|okres) — a s ním
 * uložené oblíbené i adresy sdílených stránek. Za lepší popisek to
 * nestojí.
 */
function jenObec(place, okres) {
  const p = String(place || '').trim().toLowerCase();
  const k = String(okres || '').trim().toLowerCase();
  if (!p || !k) return false;
  // „Praha" v okrese „Praha", ale i „Brno" v okrese „Brno-město".
  return p === k || k.startsWith(p + '-');
}
/* Z odpovědi vybírá od nejužšího k nejširšímu. `suburb` je v Česku
   katastrální území nebo čtvrť (Řepy, Žabovřesky), `city_district`
   správní obvod (Praha 17). Ulici (`road`) ne: u pozemku bez adresy
   ukazuje na nejbližší cestu, což je něco jiného než místo. */
function castZOdpovedi(j) {
  const a = (j && j.address) || {};
  const jmeno = a.suburb || a.quarter || a.neighbourhood || a.city_district || a.borough || null;
  if (!jmeno) return null;
  const t = String(jmeno).trim();
  if (!t || t.length > 60) return null;
  return t;
}
const OBEC_UA = GEO_UA;
async function castPodleGPS(lat, lng) {
  if (!isFinite(lat) || !isFinite(lng)) return null;
  /* Klíč zaokrouhlený na tři desetiny vteřiny (~100 m): sousední parcely
     v téže čtvrti sdílejí odpověď a Nominatim se neptá zbytečně. */
  const key = 'cast|' + (+lat).toFixed(3) + ',' + (+lng).toFixed(3);
  if (key in GEO_CACHE) return GEO_CACHE[key];
  let cast = null;
  try {
    const u = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=14&addressdetails=1&accept-language=cs&lat=${lat}&lon=${lng}`;
    const r = await fetch(u, { headers: OBEC_UA });
    if (r.ok) cast = castZOdpovedi(await r.json());
  } catch { /* síť selhala – zůstane bez čtvrti, nic se nerozbije */ }
  GEO_CACHE[key] = cast;
  geoCacheDirty = true;
  await sleep(1100); // Nominatim: max ~1 dotaz/s
  return cast;
}

// Okres podle GPS (nejbližší okresní středisko) – pro zdroje bez názvu okresu.
/* Okres podle souřadnic. Dřív se tu hledalo NEJBLIŽŠÍ OKRESNÍ MĚSTO —
   dvakrát špatně: nejbližší město není okres, ve kterém obec leží, a
   vzdálenost se počítala ve stupních, jako by stupeň zeměpisné délky byl
   stejně dlouhý jako stupeň šířky (u nás je o třetinu kratší). Holedeč
   v okrese Louny tak vycházela jako okres Most. Teď se bod porovnává se
   skutečnou hranicí okresu — viz scripts/okres-podle-gps.mjs. */
function nearestOkres(lat, lng) {
  return okresPodleGPS(lat, lng);
}

// Okresní fallback (méně přesné) – když název KÚ nedohledáme.
/* JEDEN BOD PRO VÍC RŮZNÝCH OBCÍ = ZÁSTUPNÁ SOUŘADNICE.
   Sousední pravidlo o kus výš (polohaSediSOkresem) chytá GPS, která si
   odporuje s okresem z vyhlášky. Tohle je táž chyba z druhé strany:
   okres sedí a souřadnice je přesto zástupná. Naměřeno: tři dražby od
   jednoho dražebníka (okdrazby 28329, 28330, 28331) dostaly tentýž bod
   pro Mrsklesy, Kololeč i Medvědice — tři různé vesnice na jednom
   špendlíku. Totéž u Srdova s Horními Nezly a u Dolního Týnce s Horním.
   Jsou to části jedné větší obce, takže zdroj uvedl souřadnice té obce,
   ne pozemku.
   Špendlík na mapě slibuje, že pozemek je TAM. Tři vesnice na jednom
   bodu ten slib porušují u všech tří naráz a nedá se z nich vybrat,
   která by ho měla dostat — proto se zahodí všem a poloha se dohledá
   podle názvu obce jako u ostatních.
   Tentýž pozemek podruhé (táž obec) je něco jiného a bodu se nedotkne:
   rozhoduje počet RŮZNÝCH jmen obcí. */
export function zahodZastupneGps(nabidky) {
  const podleBodu = new Map();
  for (const o of nabidky) {
    if (!o._gps) continue;
    if (typeof o.lat !== 'number' || typeof o.lng !== 'number') continue;
    const k = o.lat.toFixed(6) + ',' + o.lng.toFixed(6);
    if (!podleBodu.has(k)) podleBodu.set(k, []);
    podleBodu.get(k).push(o);
  }
  let kolik = 0;
  for (const skupina of podleBodu.values()) {
    if (skupina.length < 2) continue;
    const obce = new Set(skupina.map((o) => String(o.place || '').trim().toLowerCase()));
    if (obce.size < 2) continue;
    for (const o of skupina) { o.lat = undefined; o.lng = undefined; o._gps = false; kolik++; }
  }
  return kolik;
}

/* TÝŽ POZEMEK DVAKRÁT, POD DVĚMA ČÍSLY INZERÁTU.
   Duplicity se dosud odstraňovaly podle ČÍSLA INZERÁTU (`_key`), a to
   je záměr — jeden inzerát se nemá počítat dvakrát. Jenže prodejci
   týž pozemek vyvěšují znovu, takže dva různé inzeráty popisují jednu
   parcelu: shodná obec, okres, parcelní číslo, souřadnice, výměra
   i cena, jen jiné číslo v odkazu.

   Naměřeno na 2 001 nabídkách: 12 takových dvojic, všechny
   z Bezrealitky, všechny se shodným dnem prvního vidění. Tři z nich
   jsou podíly — a i zlomek mají shodný (1/10, 1/2, 1/4), takže to
   nejsou dva různé podíly na jedné parcele.

   Čím to vadí: pozemek je ve výpisu dvakrát, započítá se dvakrát do
   součtů i do mediánů, a vlastní stránku dostane jen jeden z dvojice
   (jméno souboru se počítá z klíče, výměry a ceny — a ty jsou shodné),
   takže řádek toho druhého vede na stránku prvního. V Bohumíně se ty
   dva inzeráty lišily druhem: řádek na stránce stavebních pozemků
   slíbil „stavební pozemek · 1 370 m²" a stránka za odkazem říkala
   „Orná půda 1 370 m²". Inzerát sám přitom píše „veden jako orná
   půda, avšak s možností změny územního plánu".

   PŘI ROZPORU SE BERE MÉNĚ TVRDÍCÍ VARIANTA. Pozemek se nemá tvářit
   jako stavební, dokud o tom nemáme doklad — stejné pravidlo jako
   u ceny za metr, která se u neznámého podílu neuvádí vůbec.

   Klíč schválně NESE parcelní číslo: dvě různé parcely v jedné obci
   se stejnou výměrou i cenou jsou nepravděpodobné, ale sloučit dvě
   skutečné nabídky by bylo horší než nechat projít jednu duplicitu.
   Na dnešních datech vyjde oběma způsoby týchž 12 dvojic. */
export function klicDvojnika(o) {
  const la = typeof o.lat === 'number' ? o.lat.toFixed(3) : '';
  const ln = typeof o.lng === 'number' ? o.lng.toFixed(3) : '';
  return [o.type || '', o.okres || '', o.place || '', o.parcel || '',
    la, ln, o.area || 0, o.price || 0].join('|');
}
export function bezDvojnic(nabidky) {
  const skupiny = new Map();
  for (const o of nabidky || []) {
    const k = klicDvojnika(o);
    if (!skupiny.has(k)) skupiny.set(k, []);
    skupiny.get(k).push(o);
  }
  const vyhozeno = [];
  const vybrane = new Set();
  for (const skupina of skupiny.values()) {
    let drzi = skupina[0];
    if (skupina.length > 1) {
      /* Méně tvrdící varianta: cokoli před „stavební". */
      const skromna = skupina.find((o) => !/stav/i.test(String(o.druh || '')));
      if (skromna && /stav/i.test(String(drzi.druh || ''))) drzi = skromna;
      for (const o of skupina) if (o !== drzi) vyhozeno.push(o);
    }
    vybrane.add(drzi);
  }
  /* Pořadí zůstává takové, v jakém nabídky přišly — řadí se až dál. */
  return { cisto: (nabidky || []).filter((o) => vybrane.has(o)), vyhozeno };
}

/* SEMÍNKO MUSÍ BÝT U KAŽDÉ NABÍDKY JINÉ, jinak z rozptylu kolem středu
   okresu nezbude rozptyl, ale jeden bod. Bralo se `o.parcel` — jenže
   parcelní číslo je u 1 723 z 2 020 nabídek „—", takže semínko vycházelo
   „—" + okres, tedy TOTÉŽ pro všechny bez parcely v jednom okrese.
   Většinou se to nepozná: náhradní poloha se vzápětí přepíše
   geokódováním podle jména obce. Projeví se to až tam, kde geokodér
   mlčí — a pak leží celý okres na jednom špendlíku.
   Odkaz na zdroj je u každé nabídky vlastní, tak se bere jako první.
   Zástupné „—" se nepočítá jako hodnota. */
export function geocode(o, seedStr) {
  if (typeof o.lat === 'number' && typeof o.lng === 'number') return o;
  const base = OKRESY_MAP[o.okres];
  if (!base) return o;
  const hodnota = (x) => { const v = String(x || '').trim(); return (!v || v === '—' || v === '-') ? '' : v; };
  const semeno = hodnota(seedStr) || hodnota(o.url) || hodnota(o.parcel) || hodnota(o.place);
  const j = jitterAround(base[0], base[1], semeno + o.okres, 0.06);
  return { ...o, lat: j.lat, lng: j.lng };
}

/* ---------- Zdroje (doplnit reálné stahování) ---------- */

// Centrální evidence veřejných dražeb (cevd.gov.cz) — oficiální otevřená data.
// Vybíráme jen aktivní dražby (stav "Uveřejněno"), kde je předmětem pozemek.
const UA = { 'user-agent': 'ParcelkaBot/1.0 (+https://www.parcelaka.cz)' };

function parseArea(text) {
  const m = String(text).match(/(\d[\d\s.]*)\s*m(?:2|²)/i);
  if (!m) return null;
  const n = parseInt(m[1].replace(/[\s.]/g, ''), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}
/* VÝMĚRA Z DLOUHÉHO POPISU — a tady se první číslo brát NESMÍ.
 *
 * parseArea() výš bere první „N m²" v textu. U NÁZVU inzerátu je to
 * v pořádku: název je krátký a jiná výměra v něm nebývá. U POPISU je to
 * nebezpečné, protože popis je volný text, kde výměr bývá víc —
 * sousední parcela, zastavěná plocha domu, rozloha obce, podlahová
 * plocha. Změřeno na 1 585 stažených popisech: 1 029 z nich (64,9 %)
 * obsahuje VÍC NEŽ JEDNU různou výměru. Vzít první znamená u dvou
 * třetin textů hádat — a chybná výměra se nepozná: tiše z ní vyjde
 * nesmyslná cena za metr, podle které web počítá odhady a staví
 * statistiky okresů.
 *
 * Proto se bere jen výměra, která je NA POZEMKU NAPSANÁ: musí jí
 * předcházet slovo, které o pozemku mluví (výměra, rozloha, plocha,
 * pozemek, parcela, pole, zahrada…) v rozsahu pár slov. A když takových
 * čísel vyjde víc RŮZNÝCH, nevrací se nic: záznam zůstane bez výměry.
 * Je to táž zásada, kterou se tenhle soubor řídí u dražební jistoty —
 * radši údaj neuvést než uvést cizí číslo.
 */
/* Dvě síly důkazu, ne jedna.
   VÝSLOVNÁ vazba je „pozemek/parcela … o výměře 2 500 m²" — tedy číslo
   navázané přímo na POZEMEK. Slabá vazba je pouhé sousedství se slovem
   o pozemku; tam může jít i o sousední parcelu nebo o stavbu na ní.
   Hledá se nejdřív výslovná, a jen když žádná není, zkouší se slabá.
   Obojí platí jen tehdy, když vyjde JEDNO číslo — dvě různé výslovné
   výměry znamenají, že se v textu prodává víc věcí, a tam se hádat
   nesmí.

   Pozor na skloňování: „rozloha" dělá „o ROZLOZE", takže kmen musí být
   rozlo[hz], ne rozloh. Napoprvé tam stálo jen rozloh\w* a měření to
   odhalilo: u inzerátu „pozemek o rozloze 1007 m²… sousední parcela
   o výměře 431 m²" vyhrála sousední parcela. */
const AREA_POZEMEK = '(?:pozem|parcel|zahrad|pole|poli|louk|les|orn|vinic|sad)\\w*';
const AREA_VYSLOVNE = new RegExp(AREA_POZEMEK + '[^.;!?]{0,16}?(?:o\\s+)?(?:vymer|rozlo[hz]|velikosti)\\w*\\s*(?:cca\\s*|asi\\s*|priblizne\\s*)?$');
const AREA_SLABE = new RegExp(AREA_POZEMEK + '|vymer\\w*|rozlo[hz]\\w*|plo(?:ch|s)\\w*|velikosti');
/* „zastavěná / podlahová / užitná / obytná plocha" patří STAVBĚ, ne
   pozemku — a právě tudy přišla do dat chata o 25 m² zapsaná jako
   výměra pozemku. Nesmí to být přilepené na konec: v textech stojí
   i „celková užitná plocha pak 105 m²“. */
/* Kmen je plo(ch|s), ne ploch: „plocha" dělá „o PLOŠE", a po odstranění
   diakritiky z toho je „plose". Je to táž past jako u „rozloha → o
   rozloze" o kus výš a chytla se stejně — zkouškou, ne úvahou: text
   „na pozemku stojí chata o zastavěné ploše cca 25 m²" vracel jako
   výměru pozemku 25. */
const AREA_CIZI = /(?:zastaven|podlahov|uzitn|obytn)\w*\s+plo(?:ch|s)\w*/;
/* HEKTARY. U polí, lesů a louk se výměra píše v hektarech („o výměře
   2,5 ha") a tohle čtení ji dosud celou přeskočilo: hledaly se jen m².
   Nabídka pak měla area: null, čímž vypadla z filtru podle výměry,
   z ceny za m² i ze statistik okresu — a na stránce stálo „výměra
   neuvedena", i když ji inzerát říkal rovnou v první větě.

   DESETINNÁ ČÁST SE NESMÍ ZAHODIT. U m² se mezery i tečky škrtají jako
   oddělovače tisíců („18 966" a „18.966" je totéž číslo), ale u hektarů
   je tečka i čárka ODDĚLOVAČ DESETIN: „1.5 ha" je 15 000 m², ne 150 000.
   Proto se hektary čtou vlastním vzorkem a vlastním přepočtem.

   `ha` musí končit slovo, jinak by „halda" nebo „hangár" za číslem
   platily za hektary. Čísla s mezerou v tisících („10 000 ha") se
   schválně nečtou: vzorek by z nich vzal jen „000". Je to ztráta
   jednoho vzácného tvaru, zato se nemůže splést řádově.

   A VÝŠKA STROPU. Pozemek nad 5 000 ha (50 km²) je v inzerátu
   překlep nebo něco jiného než parcela, ne nález. */
const AREA_HA = /(\d+(?:[.,]\d+)?)\s*(?:ha|hektar\w*)(?![a-z])/g;
const AREA_HA_STROP = 5000 * 10000;
function parseAreaHektary(bez) {
  const celkem = new Set(), vyslovne = new Set(), slabe = new Set();
  const re = new RegExp(AREA_HA.source, 'gi');
  let m;
  while ((m = re.exec(bez))) {
    const x = parseFloat(m[1].replace(',', '.'));
    if (!Number.isFinite(x) || x <= 0) continue;
    const n = Math.round(x * 10000);
    if (n <= 0 || n > AREA_HA_STROP) continue;
    const pred = bez.slice(Math.max(0, m.index - 48), m.index).replace(/\s+$/, ' ');
    if (AREA_CIZI.test(pred)) continue;
    if (/celkov\w*\s+(?:vymer|rozlo[hz])\w*\s*$/.test(pred)) celkem.add(n);
    else if (AREA_VYSLOVNE.test(pred)) vyslovne.add(n);
    else if (AREA_SLABE.test(pred)) slabe.add(n);
  }
  if (celkem.size === 1) return [...celkem][0];
  if (celkem.size === 0 && vyslovne.size === 1) return [...vyslovne][0];
  if (celkem.size === 0 && vyslovne.size === 0 && slabe.size === 1) return [...slabe][0];
  return null;
}
function parseAreaPopis(text) {
  const t = String(text == null ? '' : text);
  // bez diakritiky, ať „výměra" i „vymera" platí stejně
  const bez = t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  /* Nejsilnější důkaz: „o CELKOVÉ výměře 18 966 m²". Takhle psaný údaj
     stojí nad výčtem jednotlivých parcel a je to přesně to, co se
     prodává — naměřeno na inzerátu, kde se po sobě jmenovaly parcely
     8 579, 8 582 a 1 805 m² a teprve pak jejich součet. */
  const celkem = new Set();
  const vyslovne = new Set(), slabe = new Set();
  const re = /(\d[\d\s.]*)\s*m(?:2|²)/gi;
  let m;
  while ((m = re.exec(bez))) {
    const n = parseInt(m[1].replace(/[\s.]/g, ''), 10);
    if (!Number.isFinite(n) || n <= 0) continue;
    const pred = bez.slice(Math.max(0, m.index - 48), m.index).replace(/\s+$/, ' ');
    if (AREA_CIZI.test(pred)) continue;
    if (/celkov\w*\s+(?:vymer|rozlo[hz])\w*\s*$/.test(pred)) celkem.add(n);
    else if (AREA_VYSLOVNE.test(pred)) vyslovne.add(n);
    else if (AREA_SLABE.test(pred)) slabe.add(n);
  }
  if (celkem.size === 1) return [...celkem][0];
  if (celkem.size === 0 && vyslovne.size === 1) return [...vyslovne][0];
  if (celkem.size === 0 && vyslovne.size === 0 && slabe.size === 1) return [...slabe][0];
  /* Hektary se čtou TEPRVE TEHDY, když se v textu nenašel ani jeden
     údaj v m². Je to schválně přístavba, ne přepis: kdyby se obě čtení
     míchala, nabídka, která dnes vrací správných 11 950 m², by při
     formulaci „1,2 ha (11 950 m²)" skončila na dvou různých číslech
     v jedné hromádce — a tedy na null. Přidávat se smí jen to, co
     dosavadní výsledky nechá být. */
  if (!celkem.size && !vyslovne.size && !slabe.size) {
    const h = parseAreaHektary(bez);
    if (h !== null) return h;
  }
  return null;
}
/* Druh pozemku z volného textu. Pravidla jsou ve sdíleném modulu
   js/druh.js — stejně jako u sítí a příjezdu (js/vybaveni.js), ať je web
   i robot čtou stejně a ať se dají zkoušet bez sítě.

   Dřív to byl seznam kousků slov a první výskyt kdekoli v textu vyhrál.
   Na volném textu inzerátu to dělalo tři různé chyby naráz: „nestavební
   pozemek" se zapsal jako stavební (kus slova), „louka u lesa" jako
   lesní pozemek (okolí místo pozemku) a pozemek v Kostelci nad Černými
   lesy taky jako lesní (název obce). Modul hlídá hranice slov, zápor
   i předložku okolí — a jména míst se mu předávají, aby je vyškrtl.

   Co se bezpečně nepozná, vrací null; volající doplní obecné „pozemek".
   Špatný druh je horší než žádný: filtruje se podle něj, počítá se z něj
   obvyklá cena a staví se na něm statistiky okresů. */
const PKDruh = createRequire(import.meta.url)(join(dirname(fileURLToPath(import.meta.url)), '..', 'js', 'druh.js'));
function parseDruh(text, jmenaMist) {
  return normDruh(PKDruh.zTextu(text, jmenaMist) || 'pozemek');
}

/* Druh pozemku píšeme jednotně malým počátečním písmenem.
   Evidence dražeb ho ve svém poli druhPozemku posílá s velkým, kdežto
   z popisů i z ostatních zdrojů vychází malé — a v datech pak leží dvě
   hodnoty pro tutéž věc: „Zastavěná plocha a nádvoří" (1×) a
   „zastavěná plocha a nádvoří" (8×). Filtr to naštěstí nerozhodí
   (druhGroup si text nejdřív převede na malá), ale na stránce pozemku
   se to opíše tak, jak to přišlo, takže jeden pozemek z devíti měl
   druh napsaný jinak než ostatní.

   Mění se JEN první písmeno. České názvy druhů pozemku velká písmena
   uvnitř nemají, ale celé to snižovat by znamenalo sahat i na něco, co
   sem teprve přijde. Hlídá to scripts/test-data.mjs. */
function normDruh(d) {
  const s = String(d == null ? '' : d).trim();
  return s ? s.charAt(0).toLowerCase() + s.slice(1) : s;
}

/* ZLEVNILO SE? TO JE FAKT, NE ODHAD.
 *
 * Web uměl říct, jak je nabídka drahá proti okolí — to je ale model,
 * který se může mýlit. „Majitel šel sám dolů o 25 %" je naproti tomu
 * fakt a pro kupujícího je to silnější signál: nabídka leží a prodávající
 * už jednou ustoupil. V datech jsme na to dosud neměli nic — u nabídky
 * byla jen dnešní cena.
 *
 * Robot běží každých 6 hodin a předchozí data má po ruce, takže stačí
 * při každém běhu porovnat cenu se starou a zapsat tu minulou.
 *
 * PÁROVÁNÍ MUSÍ BÝT KONZERVATIVNÍ. Tvrdit „zlevněno" u nabídky, která
 * je ve skutečnosti jiná, je horší než netvrdit nic:
 *   · odkaz na zdroj je nejsilnější vodítko — párujeme hlavně podle něj;
 *   · bez odkazu musí sedět obec, okres, parcela I VÝMĚRA. Když se změní
 *     výměra, je to jiný pozemek, ne sleva;
 *   · když minulý záznam cenu neměl, není z čeho počítat změnu.
 * Co se nespáruje, zůstane bez historie — a to je v pořádku.
 */
export function klicCeny(o) {
  const u = String(o && o.url || '').trim().toLowerCase()
    .replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[?#].*$/, '').replace(/\/+$/, '');
  /* Generická adresa bez identifikátoru (farmy.cz/nabidka_detail) sedí
     na sedm různých nabídek — jako klíč je k ničemu. */
  return (u && /\d/.test(u.split('/').pop() || '')) ? 'u:' + u : null;
}
export function klicMista(o) {
  if (!o || !o.place || !o.okres) return null;
  const parc = String(o.parcel == null ? '' : o.parcel).trim();
  if (!parc || parc === '—' || parc === '-') return null;
  return 'm:' + [o.place, o.okres, parc, o.area || 0].join('|');
}

export function spojCeny(minule, nove, dnes) {
  const den = (dnes instanceof Date ? dnes : new Date(dnes || Date.now())).toISOString().slice(0, 10);
  const podle = new Map();
  for (const o of (minule || [])) {
    for (const k of [klicCeny(o), klicMista(o)]) if (k && !podle.has(k)) podle.set(k, o);
  }
  let zmen = 0;
  for (const o of (nove || [])) {
    const stary = podle.get(klicCeny(o)) || podle.get(klicMista(o));
    if (!stary) continue;
    if (!(stary.price > 0) || !(o.price > 0)) continue;
    /* Jiná výměra = jiný pozemek, i když sedí odkaz (portál adresu
       přepoužije). O slevě se pak nemluví. */
    if ((stary.area || 0) !== (o.area || 0)) continue;
    if (stary.price === o.price) {
      /* Cena se nezměnila — minulou změnu si nese dál, jinak by historie
         zmizela při prvním běhu beze změny. */
      if (stary.cena_drive > 0) { o.cena_drive = stary.cena_drive; o.cena_zmena = stary.cena_zmena; }
      continue;
    }
    o.cena_drive = stary.price;
    o.cena_zmena = den;
    zmen++;
  }
  return zmen;
}

/* JEDEN ROZBITÝ INZERÁT NESMÍ SHODIT CELÝ ZDROJ.
 *
 * Síťová volání ošetřená byla, ale cykly přes jednotlivé nabídky ne:
 * stačilo, aby jeden inzerát měl nečekaný tvar, výjimka vyletěla z celé
 * funkce a zdroj skončil jako „chyba" — u Bezrealitek je to 1 785
 * nabídek pryč kvůli jedné. Každá nabídka se proto zpracovává zvlášť
 * a co spadne, se PŘESKOČÍ A SPOČÍTÁ.
 *
 * Počítá se schválně, ne jen loguje: v GitHub Actions log po běhu zmizí
 * i se strojem, kdežto číslo se zapíše do dat vedle stavu zdroje — je
 * tedy vidět i na webu a hlídač níž se podle něj umí ozvat. Zdroj, který
 * vrátí deset nabídek a dvanáct set jich zahodí, totiž vypadá jako
 * „ok, 10" a to je ten nejtišší možný způsob, jak se rozbít. */
const PRESKOCENO = new Map();
function preskoc(zdroj, e) {
  const z = PRESKOCENO.get(zdroj) || { pocet: 0, prvni: null };
  z.pocet++;
  if (!z.prvni) z.prvni = String((e && e.message) || e).slice(0, 140);
  PRESKOCENO.set(zdroj, z);
}
export function ztratyZdroje(nazev) {
  return PRESKOCENO.get(nazev) || { pocet: 0, prvni: null };
}

/* HLÍDAČ JEDNOTLIVÝCH ZDROJŮ.
 *
 * Pojistka proti „utržení" dat níž hlídá SOUČET: když se stáhne míň než
 * 60 % minula, běh skončí chybou a stará data zůstanou. To ale nechytí
 * ten tišší případ: jeden zdroj změní podobu stránky, parser přestane
 * cokoli najít — a protože odpověděl, zapíše se jako „ok, 0 záznamů".
 * Součet přitom klesne třeba jen o 4 %, takže pojistka mlčí a web prostě
 * přestane ukazovat nové dražby z toho portálu. Nikde se to nedozvíme.
 *
 * Proto se každý zdroj porovnává i SÁM SE SEBOU z minulého běhu:
 *   · spadl na nulu, ačkoli minule nosil aspoň PRAH_SLEDOVANI → „prázdno"
 *   · spadl pod polovinu → „propad"
 * Prázdno běh zastaví (stejně jako u součtu), propad hlasitě ohlásí
 * a zapíše se do dat, aby šel ukázat i na webu.
 */
export const PRAH_SLEDOVANI = 20;     // menší zdroj kolísá sám od sebe
export const PRAH_PROPADU = 0.5;

/* ===== A JEŠTĚ TIŠŠÍ PŘÍPAD: POMALÉ VYKRVÁCENÍ =====================
   Porovnání s MINULÝM během chytí skok. Nechytí ale zdroj, který
   ubývá po kouscích: při 10 % za běh a čtyřech bězích denně se
   zdroj za necelé dva dny zmenší na polovinu a ani jeden krok
   nepřekročí PRAH_PROPADU. Web by beze slova přestal nosit nové
   nabídky z jednoho portálu.

   Proti tomu stojí druhé, pomalejší síto: dnešní počet se porovnává
   s MEDIÁNEM posledních dnů. Zapisuje se do data/zdroje-historie.json,
   protože robot v CI má plochý klon (actions/checkout bere jen
   poslední commit) a do historie gitu se podívat nemůže.

   PRÁH JE ZMĚŘENÝ, NE ODHADNUTÝ. Z 19 zapsaných dnů vyšlo, jak moc
   zdroje kolísají samy od sebe: Bezrealitky 1 768–1 795, SPÚ 436
   neměnně, Farmy 7–9, Dražby 65–92 (ale plynulým nárůstem), OK dražby
   34–100. Největší denní pokles u kteréhokoli zdroje byl 6 %. Při
   prahu 0,7 × medián sedmi dnů nevyhlásil plané poplachy ani jeden
   zdroj v žádném ze 14 porovnatelných dnů — včetně skoku OK dražeb
   z 34 na 100 a jejich pozdějšího poklesu z 95 na 84, což je
   normální: dražba proběhne a z nabídky zmizí.

   Pokles běh NEZASTAVUJE. Třicetiprocentní úbytek může být pravda
   (vydražilo se), takže se hlasitě ohlásí a zapíše do dat; zastavuje
   jen prázdno, které pravda být nemůže. */
/* OKNO JE DLOUHÉ SCHVÁLNĚ. Zkusil jsem nejdřív sedm dnů a zkouška
   to zamítla: u plynulého úbytku (100 → 95 → 90 → 86 → 81 → 77 → 73)
   klesá i ten medián, takže zdroj na 59 % původního stavu neprošel
   pod 0,7 × medián a hlídač mlčel. Krátké okno tedy chytá skok, ne
   vykrvácení — a skok už hlídá porovnání s minulým během. Okno proto
   sahá tak daleko, jak paměť dovolí (HISTORIE_MAX dnů): medián se za
   den skoro nepohne, takže chytá obojí. */
export const DNU_HISTORIE = 30;
export const PRAH_POKLESU = 0.7;
export const HISTORIE_MAX = 30;       // delší paměť nemá komu posloužit

/** Medián. Prázdný vstup → null, ať se nepočítá z ničeho. */
function median(cisla) {
  const d = (cisla || []).filter((x) => typeof x === 'number' && isFinite(x)).sort((a, b) => a - b);
  return d.length ? d[Math.floor(d.length / 2)] : null;
}

/**
 * Dnešní počty proti mediánu posledních dnů.
 *   historie — { dny: { 'YYYY-MM-DD': { zdroj: pocet } } }
 *   ted      — pole zdrojů z tohohle běhu
 *   dnes     — 'YYYY-MM-DD' (dnešek se do mediánu NEPOČÍTÁ)
 */
export function porovnejSHistorii(historie, ted, dnes) {
  const dny = (historie && historie.dny) || {};
  const klice = Object.keys(dny).filter((d) => d < dnes).sort().slice(-DNU_HISTORIE);
  const nalezy = [];
  /* Z JEDNOHO NEBO DVOU DNŮ SE MEDIÁN NEPOČÍTÁ. Na začátku, po přidání
     zdroje nebo po výpadku by to byl náhodný jeden den proti dnešku.
     Rozhoduje se to až u KAŽDÉHO ZDROJE (rada.length < 5), ne tady nad
     celou historií: zdroj se mohl přidat nedávno nebo pár dnů nedojet,
     takže počet dnů v souboru o něm nic neříká. Dřív tu stála i vnější
     podmínka `klice.length < 5` — zahodil jsem ji, protože se nedala
     prokázat sabotáží: po jejím vypnutí se nic nezměnilo, tu práci
     zastávala ta vnitřní. Pravidlo, které nejde porušit tak, aby to
     bylo vidět, je jen šum v kódu. */
  for (const z of (ted || [])) {
    if (!z || z.stav !== 'ok') continue;
    const rada = klice.map((d) => dny[d][z.nazev]).filter((x) => typeof x === 'number');
    if (rada.length < 5) continue;
    const med = median(rada);
    if (!(med >= PRAH_SLEDOVANI)) continue;
    if (z.pocet < med * PRAH_POKLESU) {
      nalezy.push({ nazev: z.nazev, druh: 'pokles', median: med, ted: z.pocet, dnu: rada.length });
    }
  }
  return nalezy;
}

/** Dnešní počty do historie; starší než HISTORIE_MAX dnů se zahodí. */
export function zapisDoHistorie(historie, ted, dnes) {
  const dny = Object.assign({}, (historie && historie.dny) || {});
  const dnesni = {};
  for (const z of (ted || [])) if (z && z.nazev && z.stav === 'ok') dnesni[z.nazev] = +z.pocet || 0;
  dny[dnes] = dnesni;
  const klice = Object.keys(dny).sort();
  for (const k of klice.slice(0, Math.max(0, klice.length - HISTORIE_MAX))) delete dny[k];
  return { verze: 1, dny };
}

export function porovnejZdroje(minule, ted) {
  const predchozi = {};
  for (const z of (minule || [])) if (z && z.nazev) predchozi[z.nazev] = +z.pocet || 0;
  const nalezy = [];
  for (const z of (ted || [])) {
    if (!z || z.stav !== 'ok') continue;            // chybu a vypnuto hlásí stav sám
    const drive = predchozi[z.nazev];
    if (!(drive >= PRAH_SLEDOVANI)) continue;       // nový nebo malý zdroj neporovnáváme
    if (z.pocet === 0) nalezy.push({ nazev: z.nazev, druh: 'prazdno', drive, ted: z.pocet });
    else if (z.pocet < drive * PRAH_PROPADU) nalezy.push({ nazev: z.nazev, druh: 'propad', drive, ted: z.pocet });
    /* Zdroj, který víc nabídek zahodí než přinese, je rozbitý, i když
       něco vrátil — a sám o sobě by se tvářil jako „ok". */
    else if ((z.preskoceno || 0) > z.pocet) nalezy.push({ nazev: z.nazev, druh: 'zahazuje', drive, ted: z.pocet, preskoceno: z.preskoceno });
  }
  return nalezy;
}

async function fetchDrazby() {
  const year = new Date().getFullYear();
  const out = [];
  for (const y of [year, year - 1]) {
    let data;
    try {
      const r = await fetch(`https://cevd.gov.cz/opendata/drazby/drazby_${y}.json`, { headers: UA });
      if (!r.ok) continue;
      data = await r.json();
    } catch { continue; }
    const arr = Array.isArray(data) ? data : (Object.values(data).find(Array.isArray) || []);
    for (const rec of arr) out.push(...nabidkyZDrazby(rec));
  }
  return out;
}

/* Jeden záznam dražby z otevřených dat CEVD na nabídky pro web.
 *
 * Oddělené od stahování schválně: parsování je to, co se dá splést
 * tiše, a bez sítě se dá vyzkoušet jedině tak, že se mu dá záznam
 * přímo. Právě tudy prošla chyba, kvůli které měly dražby z tohohle
 * zdroje nesmyslnou cenu za metr (viz komentář u součtu výměr níž). */
export function nabidkyZDrazby(rec) {
  const out = [];
  {
    {
      const zi = (rec && rec.zakladniInformace) || {};
      const konani = zi.konaniDrazby || {};
      const zah = konani.zacatek || konani.zahajeni || konani.konec;
      // Odkaz na dražbu: jen KONKRÉTNÍ odkaz na dražbu (musí mít cestu za doménou) —
      // generická domovská stránka portálu (např. http://www.drazebni-portal.cz) je
      // pro uživatele k ničemu, tak ji zahodíme. http upgradujeme na https.
      const rawKon = (typeof konani.url === 'string' ? konani.url.trim() : '');
      const drazbaUrl = /^https?:\/\/[^/]+\/[^\s]+/.test(rawKon) ? rawKon.replace(/^http:\/\//i, 'https://') : undefined;
      // Nucená (nedobrovolná) dražba = nucený prodej → kategorie "exekuce"
      const nucena = zi.typDrazby === 'Nucená';
      const type = nucena ? 'exekuce' : 'drazba';
      const datum = zah ? String(zah).slice(0, 10) : null;
      // Jeden záznam na dražbu — pozemek v aktivní dražbě.
      // Dobrovolná dražba (drazba): jen čistý pozemek bez budovy.
      // Nucená dražba (exekuce): i pozemek se stavbou/jednotkou — u exekucí
      //   jde skoro vždy o nemovitost, kde je pozemek součástí.
      // Jeden záznam na PŘEDMĚT dražby (= jeden dražební celek s vlastní vyvolávací
      // cenou). Dřív jsme z každé dražby brali jen první předmět — teď bereme
      // všechny, ať se ukážou i dražby s víc pozemkovými celky. Cena je vždy za
      // daný celek, takže je to poctivé (neopakujeme jednu cenu u víc parcel).
      /* Vadný záznam nesmí shodit stahování: kdyby v otevřených datech
         přistál prázdný prvek, přišel by web o VŠECHNY dražby, ne jen
         o tu jednu. */
      for (const p of ((rec && rec.predmetyDrazby) || [])) {
        if (!p) continue;
        if (p.stavPredmetu !== 'Uveřejněno') continue; // jen aktivní/nadcházející
        /* VÝMĚRA JE SOUČET VŠECH PARCEL V TÉHLE POLOŽCE, ne jedné z nich.
         *
         * Dřív se vybrala jedna „nejvhodnější" parcela a její výměra se
         * spárovala s vyvolávací cenou CELÉ položky. Když položka obsahuje
         * víc parcel, vyjde cena za metr tolikrát vyšší, kolikrát je celek
         * větší než ta jedna parcela.
         *
         * Nahlášeno z webu a změřeno na ostrých datech: dražby, které web
         * znal jen z tohohle zdroje, měly medián 2 276 Kč/m², kdežto
         * dražby ze stahování okdrazby.cz 82 Kč/m² — osmadvacetkrát míň.
         * Nahoře seznamu stála „orná půda v Brně, 721 m² za 15 300 000 Kč",
         * tedy 21 221 Kč/m². Taková orná půda není; ta cena patřila celé
         * dražbě, ne těm 721 metrům.
         *
         * Parcelní číslo se uvádí jen tehdy, když je položka JEDNOPARCELNÍ.
         * U víc parcel by jedno číslo u součtu výměr tvrdilo, že ta parcela
         * má výměru všech dohromady. */
        let cand = null, candBudova = false, soucetVymer = 0, pozemku = 0;
        for (const v of (p.veci || [])) {
          const vn = v.vecNemovita;
          if (!vn || !vn.pozemek) continue;
          const budova = !!(vn.jednotka || vn.stavba);
          if (budova && !nucena) continue; // dobrovolná: budovy vynecháváme
          const vym = Number(vn.pozemek.vymera) || 0;
          if (vym > 0) { soucetVymer += vym; pozemku++; }
          /* Zástupce pro obec, okres, druh a souřadnice: čistý pozemek má
             přednost před tím se stavbou, jinak první v pořadí. */
          if (!cand || (candBudova && !budova)) { cand = { vn, v }; candBudova = budova; }
        }
        if (!cand) continue;
        const { vn, v } = cand;
        const ku = vn.katastralniUzemi || {};
        const okres = ku.okres, place = ku.obec || ku.nazev;
        if (!okres || !place) continue;
        const area = soucetVymer || parseArea(v.nazev) || parseArea(p.nazevPredmetu);
        const price = (p.vyvolavaciCena && p.vyvolavaciCena.castka && p.vyvolavaciCena.castka.vyse)
          || (p.obvyklaCena && p.obvyklaCena.vyse) || 0;
        if (!price) continue;
        if (!area && !nucena) continue; // dobrovolná bez výměry vynecháme; u exekucí výměra často chybí
        const druhBase = vn.pozemek.druhPozemku || parseDruh(v.nazev, [place, okres]);
        out.push({
          place, okres, type,
          parcel: pozemku > 1 ? '—' : String(vn.pozemek.parcelniCislo || '—').slice(0, 40),
          druh: normDruh(candBudova ? (druhBase + ' se stavbou') : druhBase),
          area: area ? Math.round(area) : null, price: Math.round(price),
          extra: (nucena ? 'nucená dražba' : 'dražba') + (datum ? ' ' + datum : ''),
          lat: typeof vn.gpsLat === 'number' ? vn.gpsLat : undefined,
          lng: typeof vn.gpsLng === 'number' ? vn.gpsLng : undefined,
          _gps: typeof vn.gpsLat === 'number' && typeof vn.gpsLng === 'number',
          url: drazbaUrl,
        });
      }
    }
  }
  return out;
}

// OK dražby (okdrazby.cz) — veřejné i exekuční dražby nemovitostí. robots.txt
// povoluje /drazby/. Data bereme z jejich veřejného JSON API (portal/auctions).
// Seznamový endpoint není, ale ID jdou po sobě → projdeme okno posledních ID
// a přes detailní API vybereme jen aktivní POZEMKY.
const OKD_API = 'https://d1ws838f4e5d65.cloudfront.net/api/v1/portal';
const OKD_DRUH = {
  'Meadows': 'trvalý travní porost', 'Arable land': 'orná půda', 'Fields': 'orná půda',
  'Forests': 'lesní pozemek', 'Forest land': 'lesní pozemek', 'Gardens': 'zahrada',
  'Lands for housing': 'stavební pozemek', 'Building land': 'stavební pozemek',
  'Other areas': 'ostatní plocha', 'Vineyards': 'vinice', 'Orchards': 'sad',
};
async function fetchOkdrazby() {
  // 1) nejvyšší ID z homepage (okno pro sken)
  let maxId = 27100;
  try {
    const h = await (await fetch('https://www.okdrazby.cz/', { headers: UA })).text();
    const ids = [...h.matchAll(/\/drazba\/(\d+)-/g)].map((m) => +m[1]);
    if (ids.length) maxId = Math.max(maxId, ...ids);
  } catch { /* necháme výchozí odhad */ }
  const HI = maxId + 20, LO = maxId - 3000;
  const ids = [];
  for (let id = HI; id >= LO; id--) ids.push(id);

  const out = [];
  let idx = 0;
  async function worker() {
    while (idx < ids.length) {
      const id = ids[idx++];
      try {
        const r = await fetch(`${OKD_API}/auctions/${id}`, { headers: { ...UA, accept: 'application/json' }, signal: AbortSignal.timeout(20000) });
        if (r.status !== 200) continue;
        const j = await r.json();
        const cats = j.categoriesLocalized || [];
        if (!cats.includes('Land')) continue;                 // jen pozemky
        if (!/Prepared|Ongoing|Running|Published/i.test(j.statusLocalized || '')) continue; // jen aktivní/nadcházející
        const bma = j.biddingMethodAttributes || {};
        /* `auctionSecurity` je DRAŽEBNÍ JISTOTA, ne vyvolávací cena —
           bývá to zlomek ceny. Web ji přitom zobrazoval jako
           „Vyvolávací cena", takže taková dražba vypadala mnohonásobně
           levněji, než je, a ještě to křivilo cenový model. Radši
           záznam bez ceny vynechat (řádek níž) než uvést cizí číslo. */
        const price = Math.round(+(bma.lowestSubmission || bma.estimatedPrice || 0)) || 0;
        if (!price) continue;
        const txt = (j.name || '') + ' ' + (j.description || '');
        // Název je krátký a jednoznačný; popis se čte opatrně (viz parseAreaPopis).
        const area = parseArea(j.name) || parseAreaPopis(j.description);
        // okres: z GPS (spolehlivé), jinak z textu „okres X"
        const maBod = typeof j.lat === 'number' && typeof j.lon === 'number';
        let okres = maBod ? nearestOkres(j.lat, j.lon) : null;
        /* Komentář výš říká „z GPS (spolehlivé), jinak z textu" — ale kód
           dělal opak: text okres z GPS PŘEBÍJEL vždycky. A ten text je
           volná řeč z popisu dražby, kde se vedlejší okres klidně zmíní.
           Souřadnice uvnitř hranice okresu jsou tvrdší údaj, takže vyhrají;
           text rozhoduje jen tam, kde bod v žádném okrese neleží (u hranice
           státu) nebo kde souřadnice vůbec nejsou. */
        const zHranice = maBod ? okresPodleHranice(j.lat, j.lon) : null;
        const om = txt.match(/okres\s+([A-Za-zÁ-Žá-ž.\-]+(?:\s[A-Za-zÁ-Žá-ž.\-]+){0,2})/);
        if (om && !zHranice) { const cand = normOkres(om[1].trim().replace(/[.,;].*$/, '')); if (OKRESY_MAP[cand]) okres = cand; }
        if (!okres) continue;
        const km = j.name && j.name.match(/k\.?\s*ú\.?\s*([A-Za-zÁ-Žá-ž0-9 .\-]+?)(?:\s*,|\s+okres|\s*$)/i);
        // místo = katastrální území (obec); když v názvu není, použijeme okresní město
        const place = (km ? km[1].trim().slice(0, 60) : okres);
        const pm = (j.description || '').match(/p\.?\s*č\.?\s*([\d/]+)/);
        // Typ dražby z API: „Foreclosure auction (nonvoluntary)" / typeId 2 = nucený
        // prodej (exekuce/insolvence). Ostatní (veřejná / dobrovolná) = běžná dražba.
        const nucena = j.typeId === 2 || /nonvoluntary/i.test(j.typeLocalized || '') || /exekuc|nedobrovoln|nucen|insolven/i.test(txt);
        const druhCat = cats[cats.length - 1];
        const druh = OKD_DRUH[druhCat] || parseDruh(txt, [place, okres]);
        const datum = j.start ? String(j.start).slice(0, 10) : (j.finish ? String(j.finish).slice(0, 10) : null);
        out.push({
          place, okres, type: nucena ? 'exekuce' : 'drazba',
          parcel: (pm ? pm[1] : '—').slice(0, 40), _key: 'okd-' + id,
          druh, area: area || null, price,
          extra: (nucena ? 'nucená dražba' : 'dražba') + (datum ? ' ' + datum : '') + ' · OK dražby',
          lat: typeof j.lat === 'number' ? j.lat : undefined,
          lng: typeof j.lon === 'number' ? j.lon : undefined,
          _gps: typeof j.lat === 'number' && typeof j.lon === 'number',
          url: 'https://www.okdrazby.cz/drazba/' + id,
        });
        pridejVybaveni(out[out.length - 1], txt);
      } catch { /* přeskoč rozbité ID */ }
    }
  }
  await Promise.all(Array.from({ length: 8 }, worker));
  return out;
}


// Státní pozemkový úřad — nabídky pozemků k prodeji podle § 12 zákona č. 503/2012.
// SPÚ zveřejňuje kompletní seznam jako CSV (kódování Windows-1250, oddělovač ;).
function normOkres(name) {
  if (OKRESY_MAP[name]) return name;
  const hy = name.replace(/\s+/g, '-'); // "Brno město" → "Brno-město"
  if (OKRESY_MAP[hy]) return hy;
  return name;
}
function splitCsvLine(line) {
  return line.split(';').map((s) => s.replace(/^="?|"?$/g, '').trim());
}
async function fetchProdejSPU() {
  // 1) na přehledové stránce najdeme odkaz na aktuální CSV pozemků
  let page;
  try { page = await (await fetch('https://spu.gov.cz/nabidky/prehled-cela-cr', { headers: UA })).text(); }
  catch { return []; }
  const m = page.match(/href="([^"]*pozemky\d[^"]*\.csv)"/i);
  if (!m) return [];
  let url = m[1];
  if (!url.startsWith('http')) url = 'https://spu.gov.cz' + (url.startsWith('/') ? url : '/' + url);
  // 2) stáhneme a dekódujeme (Windows-1250)
  let buf;
  try { const r = await fetch(url, { headers: UA }); if (!r.ok) return []; buf = Buffer.from(await r.arrayBuffer()); }
  catch { return []; }
  let txt;
  try { txt = new TextDecoder('windows-1250').decode(buf); } catch { txt = buf.toString('latin1'); }
  const lines = txt.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const out = [];
  /* Stejný důvod jako u Farmy: v logu stálo jen kolik zůstalo. CSV Státního
     pozemkového úřadu má přes tisíc řádků a zůstává z nich zhruba dvě stě —
     to může být v pořádku (většina je nájem, ne prodej), ale poznat to
     z jednoho čísla nejde. Když zdroj změní pořadí sloupců, projeví se to
     tady jako „málo řádků" a jinak nijak. */
  const ztraty = { radku: lines.length - 1, kratky: 0, stazeno: 0, bezCeny: 0, podil: 0, najem: 0 };
  for (let i = 1; i < lines.length; i++) {
   try {
    const c = splitCsvLine(lines[i]);
    if (c.length < 8) { ztraty.kratky++; continue; }
    // Zadní sloupce (…;Cena;Nájem/pacht;Číslo OP;Staženo) čteme zprava — poznámka
    // uprostřed může mít středník; konec řádku je vždy stejný. Cena = 4. odzadu.
    if (/^ano$/i.test((c[c.length - 1] || '').trim())) { ztraty.stazeno++; continue; } // Staženo = ano
    const okres = (c[0] || '').trim();
    const place = (c[1] || '').trim();
    const money = (c[c.length - 4] || '').match(/(\d[\d\s\u00a0]*),\d{2}/); // sloupec Cena
    const price = money ? parseInt(money[1].replace(/[^\d]/g, ''), 10) : null;
    if (!okres || !place || !price || price < 100) { ztraty.bezCeny++; continue; } // jen prodejní cena, ne nájem
    // Jen celé parcely (podíl SPÚ 1/1). Zlomkové spoluvlastnické podíly mají
    // cenu za malý podíl, což by zkreslovalo cenu za m². Podíl = 5. sloupec odzadu.
    const pod = (c[c.length - 5] || '').match(/(\d+)\s*\/\s*(\d+)/);
    if (pod && pod[1] !== pod[2]) { ztraty.podil++; continue; }
    const area = parseInt(String(c[3] || '').replace(/[^\d]/g, ''), 10) || null;
    const druh = (c[4] || '').trim() || parseDruh(c[5] || '', [place, okres]);
    // Cena za m² pod 5 Kč = spíš roční nájem/pacht než prodej → vynecháme.
    if (area && price / area < 5) { ztraty.najem++; continue; }
    out.push({
      place, okres: normOkres(okres), type: 'sale',
      parcel: String(c[2] || '—').trim().slice(0, 40) || '—',
      druh: normDruh(druh || 'pozemek'),
      area, price,
      extra: 'prodej státní půdy (SPÚ, § 12)',
    });
   } catch (e) { preskoc('SPÚ', e); }
  }
  console.log(`SPÚ: z ${ztraty.radku} řádků zůstalo ${out.length}`
    + ` (krátký řádek ${ztraty.kratky}, staženo ${ztraty.stazeno}, bez prodejní ceny ${ztraty.bezCeny},`
    + ` spoluvlastnický podíl ${ztraty.podil}, vypadá na nájem ${ztraty.najem}).`);
  return out;
}

/* Místo u nabídky z Bezrealitky: OBEC, ne ulice.
 *
 * Adresa z API mívá tvar „Obec - katastrální území" a brala se z ní první
 * část. U inzerátů z města je ale první část ULICE — a na webu pak stálo
 * jako místo „Františka Macháčka", „Ruská" nebo „Za Krétou".
 *
 * Naměřeno na ostrých datech: z 1 637 nabídek z Bezrealitky je takových
 * devět, a jsou mezi nimi tři z nejdražších nabídek na celém webu:
 *   „Františka Macháčka" místo Český Brod   (okres Kolín)
 *   „Čs. armády"         místo Žamberk      (Ústí nad Orlicí)
 *   „Ruská"              místo Teplice      (Teplice)
 *   „V Drahách"          místo Luhačovice   (Zlín)
 *   „Saská"              místo Děčín        (Děčín)
 *   „Višňovka II"        místo Kamenice     (Praha-východ)
 *   „Za Krétou"          místo Tišnov       (Brno-venkov)
 *   „Ke Kocandě"         místo Roztoky      (Praha-západ)
 *   „Třezalková"         místo Říčany       (Praha-východ)
 *
 * Poznat se to dá z adresy inzerátu: u těchto devíti nese tvar
 * „<ulice>-so-pou-<obec>" (so pou = správní obvod POÚ). Když se jméno
 * z první části adresy rovná tomu, co v adrese stojí jako ulice, je to
 * ulice a obec se vezme z další části adresy.
 *
 * ČEHO SE TO NETÝKÁ, a proto se porovnává: týž tvar „-so-pou-" má
 * dalších devětadvacet nabídek, u kterých je místo správně — obec je
 * vesnice uvnitř toho obvodu, třeba Křenice ve správním obvodu Říčan.
 * Kdyby se brala obec z adresy vždycky, Křenice by se změnila na Říčany.
 *
 * KDYŽ ADRESA DALŠÍ ČÁST NEMÁ, zůstane to, co bylo. Přeložit „cesky-brod"
 * na „Český Brod" by znamenalo seznam obcí, a ten tu není; napsat to bez
 * diakritiky by na českém webu bylo vidět. Lepší neúplná oprava než
 * vymyšlené jméno.
 *
 * Odděleno od stahování schválně: API Bezrealitky je z prostředí, kde se
 * tahle oprava psala, nedostupné (proxy), takže jedině takhle se dá
 * ověřit — dát funkci adresu přímo. Zkouší scripts/test-misto-inzeratu.mjs. */
export function mistoZBezrealitky(adresa, uri) {
  const casti = String(adresa || '').split(',').map((x) => x.trim()).filter(Boolean);
  const jmeno = (c) => String(c || '').split(/\s*-\s*/)[0].trim();
  const prvni = jmeno(casti[0]);
  if (!prvni) return { place: null, ulice: null };
  const bezDiakritiky = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const m = /^(.*)-so-pou-[a-z0-9-]+$/.exec(String(uri || ''));
  /* Je první část adresy ulice? Jen když to tak říká i adresa inzerátu. */
  const jeUlice = !!m && m[1].endsWith('-' + bezDiakritiky(prvni));
  if (jeUlice) {
    for (let i = 1; i < casti.length; i++) {
      const dalsi = jmeno(casti[i]);
      /* Kraj není obec — adresa ho na konci občas nese a jako místo by
         to bylo horší než ulice. */
      if (dalsi && !/kraj$/i.test(dalsi)) return { place: dalsi.slice(0, 60), ulice: prvni };
    }
  }
  return { place: prvni.slice(0, 60), ulice: jeUlice ? prvni : null };
}

// Bezrealitky.cz — inzeráty pozemků na prodej od majitelů.
// Veřejné GraphQL API (robots.txt dovoluje). Vrací i GPS a odkaz na inzerát.
/* Popis z inzerátu se musí uklidit, než se někam uloží.
   CELÉ VĚTY, NE JEN SLOVA. Napoprvé jsem z textu vyškrtal telefony,
   e-maily a odkazy — a zůstalo „Volejte   nebo pište na   Více na", tedy
   věta bez toho, kvůli čemu stála. Vyhazuje se proto celá věta, ve které
   kontakt byl. Co zbude, je popis pozemku; shánět se dá přes odkaz na
   inzerát, který je na stránce vedle. */
const KONTAKT = /(\+?\d[\d\s]{7,}\d)|([\w.+-]+@[\w-]+\.[\w.]+)|(https?:\/\/)|(\bwww\.)/i;
export function cistyPopis(t) {
  if (!t) return '';
  const holy = String(t)
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/[.·•_]{3,}/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const vety = holy.split(/(?<=[.!?])\s+/).filter((v) => v && !KONTAKT.test(v));
  let x = vety.join(' ').replace(/\s+/g, ' ').trim();
  if (x.length > 460) {
    const rez = x.lastIndexOf('. ', 460);
    x = (rez > 200 ? x.slice(0, rez + 1) : x.slice(0, 460).replace(/\s+\S*$/, '') + '…');
  }
  /* Dvě slova nejsou popis a prázdná slupka („Pozemek na prodej.") taky ne. */
  return x.length >= 60 ? x : '';
}

async function fetchBezrealitky() {
  const query = `query($limit:Int,$offset:Int,$order:ResultOrder,$offerType:[OfferType],$estateType:[EstateType]){
    listAdverts(limit:$limit,offset:$offset,order:$order,offerType:$offerType,estateType:$estateType){
      totalCount
      list{ id uri title description address(locale: CS) price surface surfaceLand gps{ lat lng } }
    }
  }`;
  const out = [];
  const PER = 60, PAGES = 120; // až ~7200 inzerátů — projdeme celou nabídku pozemků (smyčka se sama zastaví)
  for (let p = 0; p < PAGES; p++) {
    let list;
    try {
      const r = await fetch('https://api.bezrealitky.cz/graphql/', {
        method: 'POST',
        headers: { ...UA, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ query, variables: { limit: PER, offset: p * PER, order: 'TIMEORDER_DESC', offerType: ['PRODEJ'], estateType: ['POZEMEK'] } }),
      });
      if (!r.ok) break;
      const j = await r.json();
      list = j && j.data && j.data.listAdverts && j.data.listAdverts.list;
    } catch { break; }
    if (!Array.isArray(list) || !list.length) break;
    for (const a of list) {
     try {
      const price = a.price || 0;
      if (!price) continue;
      const area = a.surfaceLand || a.surface || null;
      const gps = a.gps || {};
      const hasGps = typeof gps.lat === 'number' && typeof gps.lng === 'number';
      // místo z adresy; okres podle GPS (ať ladí se zbytkem webu)
      const parts = String(a.address || '').split(',').map((s) => s.trim()).filter(Boolean);
      // Adresa mívá tvar „Obec - katastrální území" — pro přehlednost bereme
      // jen obec (první část), ať se nezobrazuje dlouhý zdvojený název.
      const misto = mistoZBezrealitky(a.address, a.uri);
      const place = misto.place || String(a.title || 'Pozemek').split(/\s*-\s*/)[0].trim().slice(0, 60) || 'Pozemek';
      let okres = hasGps ? nearestOkres(gps.lat, gps.lng) : null;
      if (!okres) okres = (parts[parts.length - 1] || place).replace(/\s*kraj$/i, '').slice(0, 40);
      // Druh vytáhneme z popisu + názvu (API druh pozemku neuvádí) —
      // takhle se zviditelní stavební pozemky i lesy.
      const druh = parseDruh((a.description || '') + ' ' + (a.title || ''), [place, okres]);
      out.push({
        place, okres, type: 'sale',
        parcel: '—', _key: 'br-' + a.id, // dedup podle inzerátu, ne parcely
        druh, area, price,
        extra: 'inzerát – Bezrealitky',
        lat: typeof gps.lat === 'number' ? gps.lat : undefined,
        lng: typeof gps.lng === 'number' ? gps.lng : undefined,
        _gps: typeof gps.lat === 'number' && typeof gps.lng === 'number',
        url: a.uri ? 'https://www.bezrealitky.cz/nemovitosti-byty-domy/' + a.uri : undefined,
        /* POPIS OD INZERENTA. Dotaz ho stahoval odjakživa, ale používal se
           jen k uhodnutí druhu a vybavení a pak se zahodil — na webu tedy
           o pozemku nestálo ani slovo, které o něm napsal ten, kdo ho zná.
           Podtržítko znamená „do opportunities.json nepatří": ten soubor
           čte úvodní stránka a každý kilobajt v něm stojí čas na telefonu.
           Popisy jdou do zvláštního souboru, který potřebují jen stránky
           jednotlivých pozemků. */
        _popis: cistyPopis(a.description),
      });
      pridejVybaveni(out[out.length - 1], (a.description || '') + ' ' + (a.title || ''));
     } catch (e) { preskoc('Bezrealitky', e); }
    }
    if (list.length < PER) break;
  }
  return out;
}

// Farmy.cz — inzeráty zemědělské půdy a pozemků. Server-rendered HTML,
// robots.txt povoluje. Detail nabídky má výměru, okres, cenu i GPS.
async function fetchFarmy() {
  const BASE = 'https://farmy.cz';
  let listHtml;
  try { const r = await fetch(BASE + '/inzerce_aktualni_nabidky', { headers: UA }); if (!r.ok) return []; listHtml = await r.text(); }
  catch { return []; }
  const ids = [...new Set([
    ...[...listHtml.matchAll(/nabidka_detail\?nab=(\d+)/g)].map((m) => m[1]),
    ...[...listHtml.matchAll(/nabidka_detail\/(\d+)/g)].map((m) => m[1]),
  ])].slice(0, 450);
  const out = [];
  /* ROBOT MUSÍ ŘÍCT, CO ZAHODIL. V logu stálo jen „Zdroj Farmy: 7 záznamů"
     — a sedm je na portál se zemědělskou půdou podezřele málo. Jestli je
     to tím, že stránka s výpisem má jen první stranu, nebo tím, že se
     detaily nedaří přečíst, z toho čísla poznat nejde. Teď se počítá,
     kolik nabídek se našlo a na čem ostatní vypadly; v logu Actions je
     to pak vidět bez hádání. */
  const ztraty = { nalezeno: ids.length, detailNedojel: 0, bezCeny: 0, bezOkresu: 0 };
  for (const id of ids) {
    let html;
    try { const r = await fetch(BASE + '/nabidka_detail?nab=' + id, { headers: UA }); if (!r.ok) { ztraty.detailNedojel++; await sleep(200); continue; } html = await r.text(); }
    catch { ztraty.detailNedojel++; continue; }
    await sleep(200); // slušnost k serveru
    const text = html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
    const g = text.match(/Poloha GPS\s+([\d.]+)N,?\s*([\d.]+)E/i);
    const lat = g ? parseFloat(g[1]) : undefined;
    const lng = g ? parseFloat(g[2]) : undefined;
    const am = text.match(/Výměra\s+([\d\s]+?)\s*m2/i);
    const area = am ? parseInt(am[1].replace(/\s/g, ''), 10) || null : null;
    const pm = text.match(/Cena\s+([\d\s.]+),\d{2}\s*Kč\s*\/\s*m2/i);
    const tm = text.match(/Cena\s+([\d\s.]+),\d{2}\s*Kč(?!\s*\/\s*m2)/i);
    let price = null;
    if (pm && area) price = Math.round(parseInt(pm[1].replace(/[\s.]/g, ''), 10) * area);
    else if (tm) price = parseInt(tm[1].replace(/[\s.]/g, ''), 10) || null;
    let okres = (text.match(/v okrese\s+(.+?)\s+v\s+\S+\s+kraji/i) || [])[1];
    if (!okres && typeof lat === 'number') okres = nearestOkres(lat, lng);
    if (!price) { ztraty.bezCeny++; continue; }
    if (!okres) { ztraty.bezOkresu++; continue; }
    const obec = (text.match(/Obec\s+(.+?)\s+Okres/i) || [])[1];
    const ku = (text.match(/Katastrální území\s+([^\d]+?)\s+(?:Výměra|Poloha|Cena|Číslo)/i) || [])[1];
    const place = (obec || ku || 'Pozemek').trim().slice(0, 60);
    const druh = parseDruh(text.slice(0, 900), [place, okres]);
    out.push({
      place, okres: okres.trim().slice(0, 40), type: 'sale',
      parcel: '—', _key: 'fa-' + id,
      druh: normDruh(druh || 'pozemek'), area, price,
      extra: 'inzerát – Farmy.cz',
      lat, lng, _gps: typeof lat === 'number' && typeof lng === 'number',
      url: 'https://www.farmy.cz/nabidka_detail?nab=' + id,
    });
    pridejVybaveni(out[out.length - 1], text.slice(0, 4000));
  }
  console.log(`Farmy: z ${ztraty.nalezeno} nabídek na výpisu zůstalo ${out.length}`
    + ` (nedojel detail ${ztraty.detailNedojel}, bez ceny ${ztraty.bezCeny}, bez okresu ${ztraty.bezOkresu}).`);
  return out;
}

// Sreality.cz — přes Apify (placené API). Ověřeno v běhu Action (srpen 2026):
// runner na Sreality dosáhne (homepage/sitemap 200), ale staré API v2 je zrušené
// (404) a nové v1 vyžaduje přihlašovací token (401) — zdarma a spolehlivě to
// nejde a obcházet přihlášení nechceme. Řešení: hotový Apify actor, který se
// postará o přihlášení i proxy a vrátí čistý JSON.
//
// AKTIVUJE SE JEN když je nastaven tajný klíč APIFY_TOKEN
// (GitHub → Settings → Secrets and variables → Actions → New repository secret).
// Bez klíče je to no-op — na běžný bezplatný provoz nemá žádný vliv. Volitelně
// APIFY_SREALITY_ACTOR přepíše použitý actor. Po prvním reálném běhu se mapování
// polí doladí podle skutečného výstupu (viz log „Sreality/Apify vzorek").
async function fetchSreality() {
  const token = process.env.APIFY_TOKEN;
  if (!token) {
    /* ZDROJ VYPNUTÝ NENÍ ZDROJ V POŘÁDKU. Bez klíče se vracelo prázdno
       a běh to zapsal jako „Sreality (Apify): 0 záznamů" — tedy stejně,
       jako kdyby zdroj odpověděl a žádné pozemky neměl. V logu i v datech
       to pak vypadá na dočasný výpadek, ačkoli je to trvalý stav, který
       spraví jediná věc: nastavit APIFY_TOKEN. */
    console.log('Sreality (Apify): vypnuto — není nastavený APIFY_TOKEN.');
    const e = new Error('není nastavený APIFY_TOKEN');
    e.vypnuto = true;
    throw e;
  }
  const actor = process.env.APIFY_SREALITY_ACTOR || 'logiover~sreality-cz-scraper-czech-real-estate-data';
  let items;
  try {
    const input = { category_main_cb: 3, category_type_cb: 1, maxItems: 4000 }; // pozemky na prodej
    const r = await fetch(`https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(290000),
    });
    if (!r.ok) { console.error(`Sreality/Apify: HTTP ${r.status} — zkontroluj token/actor.`); return []; }
    items = await r.json();
  } catch (e) { console.error('Sreality/Apify selhal:', e && e.message); return []; }
  if (!Array.isArray(items) || !items.length) { console.log('Sreality/Apify: 0 položek.'); return []; }
  console.log(`Sreality/Apify vzorek: ${JSON.stringify(items[0]).slice(0, 500)}`);
  const num = (v) => { const n = +String(v).replace(/[^\d.]/g, ''); return isFinite(n) ? n : NaN; };
  const out = [];
  for (const e of items) {
   try {
    const price = Math.round(num(e.price ?? e.priceValue ?? e.price_czk ?? e.priceCzk)) || 0;
    if (!price || price < 5000) continue;
    const gps = e.gps || e.location || {};
    const lat = num(e.lat ?? e.latitude ?? gps.lat ?? gps.latitude);
    const lng = num(e.lng ?? e.lon ?? e.longitude ?? gps.lon ?? gps.lng ?? gps.longitude);
    const name = String(e.name || e.title || '');
    const loc = String(e.locality || e.address || (typeof e.location === 'string' ? e.location : '') || '');
    const area = parseArea(name + ' ' + loc) || (num(e.area ?? e.surface ?? e.surfaceLand) || null);
    let okres = (isFinite(lat) && isFinite(lng)) ? nearestOkres(lat, lng) : null;
    if (!okres) { const om = loc.match(/okres\s+([A-Za-zÁ-Žá-ž.\- ]+)/i); if (om) { const c = normOkres(om[1].trim().replace(/[.,;].*$/, '')); if (OKRESY_MAP[c]) okres = c; } }
    if (!okres) continue;
    const parts = loc.split(',').map((s) => s.trim()).filter(Boolean);
    const place = (parts[0] || name || 'Pozemek').split(/\s*-\s*/)[0].trim().slice(0, 60) || 'Pozemek';
    const url = e.url || e.link || e.detailUrl || undefined;
    /* Adresa (loc) se sem schválně neposílá: je to popis MÍSTA, ne
       pozemku, a je v ní obec i okres. */
    const druh = parseDruh(name, [place, okres]);
    out.push({
      place, okres, type: 'sale', parcel: '—',
      _key: 'sr-' + (e.hash_id || e.id || url || (place + '-' + price)),
      druh: normDruh(druh || 'pozemek'), area, price, extra: 'inzerát – Sreality',
      lat: isFinite(lat) ? lat : undefined, lng: isFinite(lng) ? lng : undefined,
      _gps: isFinite(lat) && isFinite(lng),
      url,
    });
   } catch (ch) { preskoc('Sreality (Apify)', ch); }
  }
  console.log(`Sreality/Apify: ${out.length} pozemků.`);
  return out;
}

/* ---------- Sjednocení a zápis ---------- */

// 'area' není povinná (u exekucí výměra v evidenci často chybí)
const REQUIRED = ['place', 'okres', 'type', 'parcel', 'druh', 'price', 'lat', 'lng'];
const TYPES = new Set(['sale', 'drazba', 'exekuce', 'obec']);

function valid(o) {
  if (!o || typeof o !== 'object') return false;
  if (!TYPES.has(o.type)) return false;
  if (!REQUIRED.every((k) => o[k] !== undefined && o[k] !== null && o[k] !== '')) return false;
  // Cena musí být důvěryhodná. Pod 5 000 Kč jde skoro vždy o chybu stahování
  // (např. cena za m² spletená s celkovou cenou) — takové raději nezobrazujeme.
  const price = Number(o.price);
  if (!isFinite(price) || price < 5000 || price > 2e9) return false;
  // Cena za m² nesmí být absurdně vysoká. Přes 25 000 Kč/m² jde skoro vždy
  // o chybu (přehozené číslo, spoluvlastnický podíl…) — nejdražší reálné
  // stavební pozemky se drží hluboko pod tím.
  const area = Number(o.area);
  if (isFinite(area) && area > 0 && price / area > 25000) return false;
  // Jen pozemky v ČR — souřadnice musí padnout do hranic republiky.
  const lat = Number(o.lat), lng = Number(o.lng);
  if (!isFinite(lat) || !isFinite(lng) || lat < 48.4 || lat > 51.2 || lng < 12.0 || lng > 18.95) return false;
  // Obdélník ale zahrnuje i kus Německa/Rakouska/Polska u hranic. Přesnější test:
  // bod MUSÍ ležet blízko některého okresního střediska (ČR je hustě pokrytá 76 okresy,
  // každé místo v ČR je od nějakého do ~30 km). Když je nejbližší okres přes 42 km
  // daleko, bod leží za hranicemi (např. inzerát se zahraniční GPS) → zahodíme.
  let nearestSq = Infinity;
  for (const k in OKRESY_MAP) {
    const c = OKRESY_MAP[k];
    const dLat = (c[0] - lat) * 111, dLng = (c[1] - lng) * 71;
    const sq = dLat * dLat + dLng * dLng;
    if (sq < nearestSq) nearestSq = sq;
  }
  if (nearestSq > 40 * 40) return false;
  /* Vzdálenost od okresního města je jen hrubé síto — u hranic pustí
     i kus Německa. Máme ale skutečné hranice okresů, tak se rovnou
     zeptáme, jestli bod leží v některém z nich. Bez tohoto testu visely
     na webu dva zahraniční pozemky („Sasko" a „Reiserdorf 173") s okresem
     dopočítaným podle nejbližšího českého města. */
  if (maHranice() && !okresPodleHranice(lat, lng)) return false;
  // Druhá pojistka pro příhraničí: zjevně NĚMECKÝ název místa (ß, Straße, -weg,
  // Mühle, Pfarr…) — takové znaky se v českých názvech obcí prakticky nevyskytují,
  // takže jde o zahraniční inzerát se souřadnicemi za hranicí. Nezobrazujeme.
  if (/ß|stra(ss|ß)e|m[üu]hle|pfarr|hausen|kirchen|\bweg\b|weg\s*\d|holz\b|\bdorf\b/i.test(String(o.place || ''))) return false;
  return true;
}

async function main() {
  prorezMezipamet();
  // Pojmenované zdroje → v logu Actions je hned vidět, který přestal vracet data.
  const SOURCES = [
    ['Dražby', fetchDrazby],
    ['OK dražby', fetchOkdrazby],
    ['SPÚ', fetchProdejSPU],
    ['Bezrealitky', fetchBezrealitky],
    ['Sreality (Apify)', fetchSreality], // aktivní jen s APIFY_TOKEN, jinak []
    ['Farmy', fetchFarmy],
  ];
  const results = await Promise.allSettled(SOURCES.map(([, fn]) => fn()));
  // Stav každého zdroje se ZAPISUJE do dat, nejen loguje. Na webu totiž
  // stálo jen „aktualizováno 20. 9." — jedno datum za všechno dohromady.
  // Když pak jeden zdroj tiše přestane vracet data, web dál tvrdí, že je
  // čerstvý. Takhle je u každého zdroje vidět, kdy naposledy odpověděl
  // a kolik toho přinesl.
  const zdroje = results.map((r, i) => ({
    nazev: SOURCES[i][0],
    /* Tři stavy, ne dva: „ok", „chyba" (zdroj neodpověděl) a „vypnuto"
       (chybí klíč, takže se ani nezkoušel). Dřív bylo vypnuto totéž co
       prázdná odpověď a web i log tvrdily, že je zdroj v pořádku. */
    stav: r.status === 'fulfilled' ? 'ok' : (r.reason && r.reason.vypnuto ? 'vypnuto' : 'chyba'),
    pocet: r.status === 'fulfilled' ? (r.value || []).length : 0,
    cas: new Date().toISOString(),
    chyba: r.status === 'rejected' ? String((r.reason && r.reason.message) || r.reason).slice(0, 140) : null,
    /* Kolik nabídek se u toho zdroje muselo přeskočit a proč ta první. */
    preskoceno: ztratyZdroje(SOURCES[i][0]).pocet,
    prvniPreskocena: ztratyZdroje(SOURCES[i][0]).prvni,
  }));
  /* Porovnání s minulým během. Čte se ze souboru, který se teprve bude
     přepisovat — tedy ještě ze starých dat. */
  let minuleZdroje = [];
  try { minuleZdroje = JSON.parse(readFileSync(OUT, 'utf8')).zdroje || []; } catch { /* první běh */ }
  const nalezy = porovnejZdroje(minuleZdroje, zdroje);
  for (const n of nalezy) {
    const z = zdroje.find((x) => x.nazev === n.nazev);
    if (z) z.stav = n.druh;                  // „prazdno" / „propad" se zapíše do dat
  }
  /* A druhé, pomalejší síto: dnešek proti mediánu posledních dnů.
     Historie se čte a zapisuje vedle dat, protože robot v CI historii
     gitu nemá (plochý klon). */
  const DNES = new Date().toISOString().slice(0, 10);
  let historie = { verze: 1, dny: {} };
  try { historie = JSON.parse(readFileSync(HIST_ZDROJU, 'utf8')); } catch { /* první běh */ }
  for (const n of porovnejSHistorii(historie, zdroje, DNES)) {
    const z = zdroje.find((x) => x.nazev === n.nazev);
    /* Skok z minulého běhu je silnější nález — ten se nepřepisuje. */
    if (z && z.stav === 'ok') z.stav = 'pokles';
    console.error(`POZOR: zdroj ${n.nazev} přinesl ${n.ted} záznamů, medián posledních`
      + ` ${n.dnu} dnů je ${n.median}. Není to skok, je to pomalý úbytek — podívejte se,`
      + ' jestli parser nepřestal část stránky čist.');
  }
  try {
    writeFileSync(HIST_ZDROJU, JSON.stringify(zapisDoHistorie(historie, zdroje, DNES)));
  } catch (e) { console.error('Historii zdrojů nešlo zapsat: ' + e.message); }

  const prazdne = nalezy.filter((n) => n.druh === 'prazdno');
  if (prazdne.length) {
    console.error('CHYBA: ' + prazdne.map((n) => `zdroj ${n.nazev} nevrátil nic (minule ${n.drive})`).join('; ')
      + '. Nejspíš se změnila podoba stránky a parser přestal cokoli najít.'
      + ' Ponechávám stará data a končím s chybou, ať přijde upozornění.');
    process.exit(1);
  }
  for (const n of nalezy) {
    if (n.druh === 'zahazuje') {
      console.error(`POZOR: zdroj ${n.nazev} přinesl ${n.ted} záznamů a ${n.preskoceno} jich zahodil`
        + ` — nejspíš se změnil tvar dat. První chyba: ${ztratyZdroje(n.nazev).prvni}`);
    } else {
      console.error(`POZOR: zdroj ${n.nazev} přinesl ${n.ted} záznamů, minule ${n.drive}.`);
    }
  }

  zdroje.forEach((z) => {
    if (z.stav === 'ok') console.log(`Zdroj ${z.nazev}: ${z.pocet} záznamů.`);
    else if (z.stav === 'vypnuto') console.log(`Zdroj ${z.nazev}: vypnutý (${z.chyba}).`);
    else console.error(`Zdroj ${z.nazev} SELHAL: ${z.chyba}`);
  });

  const raw = results
    .filter((r) => r.status === 'fulfilled')
    .flatMap((r) => r.value || [])
    .map((o) => geocode(o));

  // odstranění duplicit (okres + parcela) a seřazení podle výhodnosti
  const seen = new Set();
  const byDeal = (a, b) => (a.area ? a.price / a.area : Infinity) - (b.area ? b.price / b.area : Infinity);
  const podleInzeratu = raw
    .filter(valid)
    .filter((o) => {
      const k = (o.type + '|' + o.okres + '|' + (o._key || o.parcel)).toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  /* A ještě týž pozemek pod dvěma čísly inzerátu — viz bezDvojnic(). */
  const { cisto, vyhozeno: dvojnici } = bezDvojnic(podleInzeratu);
  if (dvojnici.length) {
    console.log(`Dvojníci (týž pozemek pod jiným číslem inzerátu): ${dvojnici.length} vynecháno`);
    for (const o of dvojnici.slice(0, 5)) console.log(`  · ${o.place}, okres ${o.okres} — ${o.area} m², ${o.price} Kč (${o.druh})`);
  }
  const clean = cisto.sort(byDeal);

  // Vyvážený výběr — ať žádná kategorie nepřeváží (jinak by stovky prodejů
  // zaplavily mapu). Dražby/exekuce bereme podle výhodnosti; u prodeje vybíráme
  // pestrý vzorek napříč cenami (ne jen nejlevnější slivery), ať je mapa zajímavá.
  const CAP = { sale: 160, drazba: 1300, exekuce: 1000, obec: 250 };
  const byType = {};
  for (const o of clean) (byType[o.type] || (byType[o.type] = [])).push(o);
  function spread(arr, n) {
    if (arr.length <= n) return arr;
    const step = arr.length / n, out = [];
    for (let i = 0; i < n; i++) out.push(arr[Math.floor(i * step)]);
    return out;
  }
  // Prodej má tři zdroje – každý dostane svůj díl, ať je mapa vyvážená:
  // inzeráty od lidí (Bezrealitky), zemědělská půda (Farmy) i státní půda (SPÚ).
  const sale = byType.sale || [];
  const byPrice = (a, b) => a.price - b.price;
  // Portály s přímým odkazem na inzerát (Bezrealitky, Farmy) dostanou nejvíc
  // prostoru — na ně se dá kliknout a rovnou volat prodejci. Státní půda (SPÚ)
  // nemá odkaz na konkrétní parcelu, tak jí dáme míň. Přes spread() bereme
  // pestrý vzorek napříč cenami (ne jen nejlevnější slivery), ať je mapa zajímavá.
  const bez = sale.filter((o) => /Bezrealitky/i.test(o.extra || ''));
  const srealit = sale.filter((o) => /Sreality/i.test(o.extra || '')); // prázdné bez APIFY_TOKEN
  const farmy = sale.filter((o) => /Farmy/i.test(o.extra || ''));
  const spuSale = sale.filter((o) => /státní/i.test(o.extra || '')).sort(byPrice);
  const saleSel = [
    ...bez,                     // celá nabídka Bezrealitky (přímý odkaz na inzerát)
    ...spread(srealit, 2500),   // Sreality přes Apify (jen s klíčem, jinak prázdné)
    ...farmy,                   // celá nabídka Farmy
    ...spread(spuSale, 900),    // státní půda doplní zbytek
  ];
  // Dražba, která už proběhla, není příležitost. Zdroje je z výpisu neodstraní
  // hned (u některých tam visí měsíce), takže je vyhazujeme sami — jinak se
  // počítají do „44 dražeb" a zabírají místo na mapě. Den konání ještě platí,
  // proto porovnáváme k dnešnímu půlnočnímu času.
  const dnes = new Date(); dnes.setHours(0, 0, 0, 0);
  const jesteBezi = (o) => {
    if (o.type !== 'drazba' && o.type !== 'exekuce') return true;
    const m = /(\d{4})-(\d{2})-(\d{2})/.exec(o.extra || '');
    if (!m) return true;                        // bez termínu nevíme — necháme
    return new Date(+m[1], +m[2] - 1, +m[3]) >= dnes;
  };
  const drazby = (byType.drazba || []).filter(jesteBezi);
  const exekuce = (byType.exekuce || []).filter(jesteBezi);
  const vyprsele = ((byType.drazba || []).length - drazby.length) + ((byType.exekuce || []).length - exekuce.length);
  if (vyprsele) console.log(`Vynecháno ${vyprsele} dražeb/exekucí s termínem v minulosti.`);

  const fresh = [
    ...saleSel,
    ...drazby.slice(0, CAP.drazba),
    ...exekuce.slice(0, CAP.exekuce),
    ...(byType.obec || []).slice(0, CAP.obec),
  ];

  if (fresh.length === 0) {
    console.log('Žádný zdroj zatím nevrací data — ponechávám stávající soubor beze změny.');
    return;
  }

  // Pojistka proti „utržení" dat: když je nově staženo výrazně míň než minule
  // (nejspíš se rozbil některý zdroj), NEPŘEPISUJEME — necháme stará data a
  // skončíme s chybou, aby úloha spadla a GitHub poslal majiteli upozornění.
  let prevCount = 0;
  try { prevCount = (JSON.parse(readFileSync(OUT, 'utf8')).opportunities || []).length; } catch { /* první běh */ }
  if (prevCount >= 30 && fresh.length < prevCount * 0.6) {
    console.error(
      `CHYBA: staženo jen ${fresh.length} příležitostí (minule ${prevCount}). ` +
      'Nejspíš se rozbil některý zdroj — ponechávám stará data a končím s chybou, ať přijde upozornění.'
    );
    process.exit(1);
  }

  // Zpřesnění polohy: až u vybraných příležitostí dohledáme souřadnice podle
  // názvu katastrálního území (Nominatim). Body pak sedí na správné obci, ne
  // jen ve středu okresu. Přeskakujeme záznamy s reálnou GPS z evidence dražeb.
  /* NEJDŘÍV PROVĚŘIT SOUŘADNICE OD ZDROJE. Doteď se braly jako svaté —
     „přeskakujeme záznamy s reálnou GPS z evidence dražeb". Jenže i
     oficiální registr se mýlí: dvě různé dražby (Komorní Lhotka na
     Frýdecko-Místecku a Rychvald na Karvinsku) dostaly TYTÉŽ souřadnice,
     a to 350 km jinde, v severních Čechách.
     Okres přitom známe z dražební vyhlášky, a ta je spolehlivá. Když si
     souřadnice s okresem odporují, vyhrává vyhláška: GPS se zahodí a
     poloha se dohledá podle názvu obce jako u ostatních. Je to táž mez
     (55 km) a táž úvaha jako u Holedče — jen z druhé strany. */
  let zdrojSpatne = 0;
  for (const o of fresh) {
    if (!o._gps) continue;
    if (typeof o.lat !== 'number' || typeof o.lng !== 'number') continue;
    if (polohaSediSOkresem(o.lat, o.lng, o.okres)) continue;
    o.lat = undefined; o.lng = undefined; o._gps = false;
    zdrojSpatne++;
  }
  if (zdrojSpatne) console.log(`Zahozeny souřadnice od zdroje, které si odporovaly s okresem: ${zdrojSpatne}.`);

  const zdrojZastupne = zahodZastupneGps(fresh);
  if (zdrojZastupne) console.log(`Zahozeny zástupné souřadnice od zdroje (jeden bod pro víc obcí): ${zdrojZastupne}.`);

  let refined = 0, zamitnuto = 0;
  for (const o of fresh) {
    if (o._gps) continue;
    let nm = await geocodeName(o.place, o.okres);
    /* Pojistka i na cestě z mezipaměti: ta si pamatuje i výsledky uložené
       dřív, než se okres začal ověřovat. Špatný bod se nesmí vrátit zpátky
       jen proto, že už jednou uložený byl. */
    if (nm && !polohaSediSOkresem(nm[0], nm[1], o.okres)) {
      const klic = (o.place + '|' + o.okres).toLowerCase();
      delete GEO_CACHE[klic]; geoCacheDirty = true;
      nm = null; zamitnuto++;
    }
    if (nm) {
      const j = jitterAround(nm[0], nm[1], (o.parcel || '') + o.place, 0.012);
      o.lat = j.lat; o.lng = j.lng; refined++;
    }
  }
  /* Čtvrť u nabídek, kde je místo jen celá obec. Jen tam, kde jsou
     souřadnice OD ZDROJE (o._gps): u dopočítaných by se jméno čtvrti
     vzalo z bodu, který jsme si sami vymysleli. */
  let sCasti = 0;
  for (const o of fresh) {
    if (!o._gps || !jenObec(o.place, o.okres)) continue;
    const c = await castPodleGPS(o.lat, o.lng);
    if (c && c.toLowerCase() !== String(o.place || '').toLowerCase()) { o.cast = c; sCasti++; }
  }
  const hrubych = fresh.filter((o) => jenObec(o.place, o.okres)).length;
  console.log(`Čtvrť doplněna u ${sCasti} z ${hrubych} nabídek, kde bylo místo jen celá obec.`);

  /* POPISY DO ZVLÁŠTNÍHO SOUBORU. Kdyby se vepsaly do opportunities.json,
     narostl by o zhruba megabajt — a ten soubor čte úvodní stránka, kde se
     každý kilobajt platí časem na telefonu. Stránky jednotlivých pozemků
     si popis vezmou odtud; klíč počítá táž funkce, která pojmenovává jejich
     soubory, takže se nemohou rozejít. */
  const popisy = {};
  /* Ozdoby z cizího textu ven — jedno místo pro celý web, viz
     scripts/text-inzeratu.mjs. Prázdný popis se nezapisuje: po úklidu
     ze samých emodži nezbude nic. */
  for (const o of fresh) {
    if (!o._popis) continue;
    const t = bezEmodzi(o._popis);
    if (t) popisy[klicNabidky(o)] = t;
  }
  writeFileSync(POPISY, JSON.stringify(popisy) + '\n', 'utf8');
  console.log(`Popisů od inzerentů: ${Object.keys(popisy).length} z ${fresh.length}.`);

  fresh.forEach((o) => { delete o._gps; delete o._key; delete o._popis; });
  if (geoCacheDirty) writeFileSync(GEOCACHE, JSON.stringify(GEO_CACHE, null, 0) + '\n', 'utf8');
  console.log(`Zpřesněno podle názvu KÚ: ${refined}/${fresh.length}.` +
    (zamitnuto ? ` Zamítnuto jako jiná obec téhož jména: ${zamitnuto} (zůstávají na středu okresu).` : ''));

  // Kdy se pozemek objevil poprvé. Data to dosud nenesla, takže se nedalo
  // říct „přibylo dnes" — šlo jen spočítat, co uživatel ještě neviděl, a to
  // je něco jiného: po smazání historie by byl najednou nový úplně všechno.
  // Datum se přenáší ze starého souboru podle otisku; co tam nebylo, dostane
  // dnešek. Otisk musí být shodný s keyOf() v js/hlidani-logika.js a
  // js/hlidani-logika.js, jinak by se pozemky „obnovovaly" při každém běhu.
  const dnesISO = new Date().toISOString().slice(0, 10);
  let driveVse = [];
  try { driveVse = (JSON.parse(readFileSync(OUT, 'utf8')).opportunities || []).filter((o) => o.first_seen); }
  catch { /* první běh — všechno je nové */ }
  const vysledek = prirazPrvniVideni(fresh, driveVse, dnesISO);
  if (vysledek.poZmeneCeny) console.log(`Věk zachován i po změně ceny: ${vysledek.poZmeneCeny} nabídek.`);
  console.log(`Poprvé viděno dnes: ${vysledek.novych} z ${fresh.length}` +
    (driveVse.length ? '' : ' (první běh se značkováním — všechno dostalo dnešek)'));

  /* Zlevnil majitel? Porovná se s cenami z minulého běhu — ještě než se
     soubor přepíše. „Majitel sám šel dolů o 25 %" je fakt, kdežto odhad
     proti okolí je model; pro kupujícího je to silnější informace. */
  {
    let minuleNabidky = [];
    try { minuleNabidky = JSON.parse(readFileSync(OUT, 'utf8')).opportunities || []; } catch { /* první běh */ }
    const zmen = spojCeny(minuleNabidky, fresh, new Date());
    if (zmen) console.log(`Změna ceny u ${zmen} nabídek proti minulému běhu.`);
  }

  const payload = {
    updated: new Date().toISOString().slice(0, 10),
    // Přesný čas, ne jen datum: „zkontrolováno dnes v 7:00" říká o čerstvosti
    // mnohem víc než „aktualizováno 20. 9.", zvlášť když robot běží 4× denně.
    updated_at: new Date().toISOString(),
    source: 'Veřejné dražby (CEVD, OK dražby) + Státní pozemkový úřad + inzeráty (Bezrealitky, Farmy, příp. Sreality přes Apify)',
    sources: zdroje,
    opportunities: fresh,
  };
  // Minifikovaně (bez odsazení) — menší soubor = rychlejší načtení na mobilu.
  writeFileSync(OUT, JSON.stringify(payload) + '\n', 'utf8');
  const counts = fresh.reduce((a, o) => ((a[o.type] = (a[o.type] || 0) + 1), a), {});
  console.log(`Zapsáno ${fresh.length} příležitostí do ${OUT}. Dle typu:`, JSON.stringify(counts));
}

/* Sbírat se začne jen při přímém spuštění (`node scripts/fetch-opportunities.mjs`,
   což dělá i .github/workflows/update-data.yml). Dřív se main() volalo i při
   pouhém importu, takže si tenhle soubor nešlo načíst a zkontrolovat jedinou
   funkci, aniž by se rozjelo stahování ze všech zdrojů — pravidla se proto
   daly hlídat jen čtením zdroje. Stejná pojistka je v generate-parcel-pages.mjs. */
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('Chyba při sběru dat:', err);
    process.exitCode = 1;
  });
}
