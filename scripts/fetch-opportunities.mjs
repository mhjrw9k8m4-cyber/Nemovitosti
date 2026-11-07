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
import { bezEmodzi, otiskInzerenta } from './text-inzeratu.mjs';
import { BOT_UA } from './bot-ua.mjs';
import { prectiJakkoli, copakTamJe, mistoZTextu, slovnikMist, zZaznamu, obecZNazvuAukce } from './cteni-zdroje.mjs';
import { PREDPISY, ZAPOJENE_PREDPISY, jeNemovitost } from './predpisy-zdroju.mjs';
import { smimeCist } from './robots.mjs';
import { ZAPOJENE, OBECNE_ZDROJE } from './zdroje-kandidati.mjs';
import * as STAT from './cti-nabidky-statu.mjs';
import * as UZ from './cti-uzsvm.mjs';
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
/* JMÉNO OBCE, NEBO VĚTA Z INZERÁTU?
   ====================================================================
   Nahlášeno z průchodu webem: ve výpisu stála „nabídka" jménem

     „Vráž je známá pro svoje lázeňské sanatorium zaměřené na léčb"

   a web z toho udělal i adresu stránky
   (`pozemek-pisek-vraz-je-znama-pro-svoje-lazenske-sanatorium-zamerene-na-lecb-…`),
   nadpis, titulek a řádek v sitemapě. Příčina: u Farmy.cz se obec bere
   vzorkem „Obec … Okres" z textu stránky, a když mezi těmi dvěma slovy
   leží věta, vezme se celá věta. Slice na 60 znaků ji jen zkrátil.

   Změřeno na všech 1 041 různých jménech v datech: takhle pokažená jsou
   dvě — ta věta z Farmy.cz a „Žeravice u Kyjova a k.ú. Syrovín"
   z OK dražeb (dvě katastrální území slepená do jednoho jména).
   U obou se správné jméno z toho řetězce dá přečíst.

   Co se tu NEOPRAVUJE: čtyři jména ulic z Bezrealitky („Dr. E. Beneše",
   „Padlých hrdinů", „Černá cesta", „Hořanská cesta"). Ulice je sice taky
   špatně v poli pro obec, ale je to skutečné místo, ne věta — a
   rozpoznat, která část adresy je obec, se dá jen z adresy samotné
   (viz mistoZBezrealitky výš, opraveno 5. 10. pro případy, které se
   dokázat dají). Vymyslet si k ulici obec by bylo horší.

   Pravidlo je proto úzké a dokazatelné: řetězec se ukrojí tam, kde
   začíná PROZA (slovo, které v názvu obce nikdy nestojí) nebo slepenec
   („a k.ú."), a co zbude, musí vypadat jako jméno obce — jinak se
   vrátí null a volající si doplní, co má po ruce. */
const PROZA = /\s(?:je|jsou|byl|byla|bylo|bude|pro|svoje|svůj|svoji|své|která|který|které|kde|co|nachází|nabízíme|nabízí|prodáme|leží|patří|známá|známý)\s/i;
const SLEPENEC = /\s(?:a\s+)?k\.ú\.|\s+a\s+katastrální/i;
/** Jméno obce z řetězce, nebo null, když se nic rozumného nedá přečíst. */
export function jmenoObce(s) {
  let t = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  if (!t) return null;
  const slep = SLEPENEC.exec(t);
  if (slep) t = t.slice(0, slep.index).trim();
  const proza = PROZA.exec(' ' + t + ' ');
  if (proza) t = (' ' + t + ' ').slice(1, proza.index).trim();
  t = t.replace(/[,;:.\-\s]+$/, '').trim();
  /* Co zbylo, musí vypadat jako jméno místa: ne moc dlouhé, ne moc slov
     a bez věty uprostřed. Pět slov kvůli „Rychnov u Jablonce nad Nisou". */
  if (t.length < 2 || t.length > 45) return null;
  if (t.split(' ').length > 5) return null;
  return t;
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
/* PRACOVNÍ PŘÍZNAK SE DO DAT NEPOSÍLÁ — a smete se obecně.
   Pole, jejichž jméno začíná podtržítkem, jsou vzkazy mezi čtečkou
   zdroje a robotem: `_neniPozemek`, `_gps`, `_key`, `_popis`. Smlouva
   o datech (data/pole.json) o nich nic neříká, takže kdo si data
   vezme, musel by hádat. Jmenovitý výmaz jednoho z nich byl slepý:
   sabotáž `delete o._neniPozemek;` neshodila nikoho, protože hlídač
   čte vyčištěný soubor na disku, ne chování robota. Proto je to
   funkce — dá se jí dát nabídka a změřit, co z ní vyjde — a proto je
   obecná: příznak, který někdo zavede zítra, odejde taky. */
/* POČTY DO HLÁŠKY — A JE TO FUNKCE, PROTOŽE SE TO DÁ SPLÉST.
   Stálo tu `o.kat || 'pozemek'` přímo v těle, takže nabídka, u které
   zdroj VÝSLOVNĚ řekl „tohle pozemek není" (`_neniPozemek`) a
   kategorii neurčil, se v logu objevila jako pozemek. Naměřeno
   5. 11. v ostrém běhu: log napsal `{"pozemek":149}`, přičemž u 30
   z nich zdroj řekl opak — a mě to při hledání příčiny poslalo na
   dvacet minut špatným směrem. Hláška, která lže, je horší než
   žádná: podle žádné se člověk podívá do dat, podle lživé uvěří.

   „neurčeno" není totéž co „jine": `jine` je rozhodnutí robota
   o kus dál, tohle je stav, v jakém nabídka odešla ze čtečky. */
export const KAT_NEURCENO = 'neurčeno (není pozemek)';
export function pocetPodleKategorie(nabidky) {
  const ven = {};
  for (const o of (Array.isArray(nabidky) ? nabidky : [])) {
    if (!o || typeof o !== 'object') continue;
    const k = o.kat || (o._neniPozemek ? KAT_NEURCENO : 'pozemek');
    ven[k] = (ven[k] || 0) + 1;
  }
  return ven;
}

export function bezPracovnich(o) {
  if (!o || typeof o !== 'object') return o;
  for (const k of Object.keys(o)) if (k.startsWith('_')) delete o[k];
  return o;
}

export function otiskNabidky(o) {
  return [o.type || '', bezDiakritiky(o.okres), bezDiakritiky(o.place),
    o.parcel || '', o.price || '', o.area || ''].join('|').slice(0, 240);
}
/** Týž otisk bez ceny — nabídka je táž, i když prodejce zlevnil. */
export function otiskNabidkyBezCeny(o) {
  return [o.type || '', bezDiakritiky(o.okres), bezDiakritiky(o.place),
    o.parcel || '', o.area || ''].join('|').slice(0, 240);
}
/** Identita inzerátu, kterou si web NEMŮŽE sám přepočítat: jeho odkaz.

    Otisky výš stojí na okresu, obci a výměře — a to jsou přesně ta pole,
    která si web sám občas přepočítá. Když se zpřesní geokódování, změní
    se okres; když se opraví čtení adresy, změní se obec. Otisk se tím
    rozejde se vším, co o té nabídce víme z minula, a stará nabídka
    dostane dnešek: web pak tvrdí, že přišla dnes, a pozná se to až na
    stránce „Co je nového".

    Naměřeno na ostrých datech průchodem celé gitové historie (112 verzí
    souboru): podle odkazu by dřívější datum dostalo 455 z 1 765 nabídek
    s odkazem, tedy 26 %. Z toho 405 nabídek bylo v datech od prvního
    dne (14. 9.), ale nesly 19. 9. — den, kdy se zpřesňoval okres podle
    skutečné hranice a obec podle adresy inzerátu.

    Odkaz je naproti tomu identita inzerátu u jeho zdroje a žádný náš
    přepočet s ním nehne. Nemá ho ale každá nabídka: 219 z 1 984 (SPÚ
    a část dražeb) je bez odkazu, a pro ty zůstávají otisky jediná
    cesta. */
export function otiskOdkazu(o) {
  const u = o && typeof o.url === 'string' ? o.url : '';
  if (!u) return '';
  /* CELÁ ADRESA BY NESTAČILA. Bezrealitky mění u běžícího inzerátu
     konec adresy (slug): „985306-nabidka-prodej-pozemku" se jednoho dne
     stane „985306-nabidka-prodej-pozemku-luhacovice". Změřeno na celé
     gitové historii: u 63 z 1 918 inzerátů se adresa takhle změnila,
     zatímco číslo inzerátu zůstalo. Na celou adresu by tedy právě těch
     63 o věk přišlo — tedy znovu táž chyba, jen o řád menší.
     Číslo inzerátu je identita u zdroje; adresa je jen cesta k němu. */
  let m = /bezrealitky\.cz\/[^?#]*?\/(\d{4,})-/.exec(u);   if (m) return 'br|' + m[1];
  m = /farmy\.cz[^?#]*[?&]nab=(\d+)/.exec(u);                if (m) return 'fa|' + m[1];
  m = /sreality\.cz\/detail\/[^?#]*?\/(\d{5,})/.exec(u);  if (m) return 'sr|' + m[1];
  /* Neznámý zdroj: adresa je pořád lepší identita než otisk z okresu
     a výměry, jen se na ni nedá spolehnout tak jako na číslo.
     SROVNÁ SE DO JEDNOHO TVARU. Táž dražba chodí ze dvou stahovačů
     pod dvěma zápisy adresy: „okdrazby.cz/drazba/28315" a
     „www.okdrazby.cz/drazba/28315" — naměřeno na deseti dvojicích
     v dnešních datech. Pro prohlížeč je to jedna nabídka (klicZdroje
     v js/hlidani-logika.js srovnává adresu stejně), ale otisk pro
     stáří je bral jako dvě různé, takže se po změně zápisu adresy
     u zdroje nabídka tvářila jako nová. Protokol, „www." a lomítko
     na konci nejsou identita, jsou to jen tvar zápisu. */
  return 'url|' + u.replace(/^https?:\/\//i, '').replace(/^www\./i, '')
    .replace(/\/+$/, '').toLowerCase();
}

/** Doplní `first_seen` do `fresh` podle `drive`. Mění předaná data.
 *
 *  Tři kola, od nejspolehlivějšího k nejslabšímu:
 *    0) podle ODKAZU — identita u zdroje, náš přepočet s ní nehne,
 *    1) podle otisku S CENOU — nabídka beze změny,
 *    2) podle otisku BEZ CENY — nabídka, u které prodejce zlevnil.
 *
 *  Každé kolo bere jen JEDNOZNAČNÉ shody a každou starou nabídku smí
 *  použít jen jednou; co se nespáruje, dostane dnešek. */
/* ZNAČKA „VĚK NEZNÁMÝ" SE DĚDÍ SPOLU S `first_seen`.
   Nabídka ze dne, kdy zdroj změnil tvar dat, nemá poctivé datum
   prvního vidění — a nesmí ho získat tím, že se zítra spáruje sama
   se sebou. Proto se `prezn` přenáší týmiž třemi koly jako datum. */
function prenesZnacku(novy, stary) {
  if (stary && stary.prezn) novy.prezn = 1;
}

export function prirazPrvniVideni(fresh, drive, dnesISO, znama) {
  /* Ve vstupu ze stahovačů first_seen nikdy není; kdyby se tam přes
     zkoušku nebo cizí volání dostalo, nesmí se s ním počítat. */
  for (const o of fresh) delete o.first_seen;
  const stare = (drive || []).filter((o) => o && o.first_seen);
  /* Starou nabídku smí „darovat" datum jen jedno kolo a jen jednou. */
  const spotrebovane = new Set();

  /* ---- 0) podle odkazu ---- */
  let podleOdkazu = 0;
  {
    const pocetStarych = new Map(), pocetNovych = new Map();
    for (const o of stare) { const u = otiskOdkazu(o); if (u) pocetStarych.set(u, (pocetStarych.get(u) || 0) + 1); }
    for (const o of fresh) { const u = otiskOdkazu(o); if (u) pocetNovych.set(u, (pocetNovych.get(u) || 0) + 1); }
    /* Dvě nabídky pod jedním odkazem se rozlišit nedají (jeden inzerát
       rozepsaný na víc parcel), a tam se datum přenášet nesmí. */
    const darci = new Map();
    for (const o of stare) { const u = otiskOdkazu(o); if (u && pocetStarych.get(u) === 1) darci.set(u, o); }
    for (const o of fresh) {
      const u = otiskOdkazu(o);
      if (!u || pocetNovych.get(u) !== 1) continue;
      const star = darci.get(u);
      if (!star) continue;
      o.first_seen = star.first_seen; prenesZnacku(o, star); spotrebovane.add(star); podleOdkazu++;
    }
  }

  /* ---- 1) podle otisku s cenou ---- */
  const podleOtisku = new Map();
  for (const o of stare) if (!spotrebovane.has(o)) podleOtisku.set(otiskNabidky(o), o);
  const bezData = [];
  for (const o of fresh) {
    if (o.first_seen) continue;
    const star = podleOtisku.get(otiskNabidky(o));
    if (star && !spotrebovane.has(star)) { o.first_seen = star.first_seen; prenesZnacku(o, star); spotrebovane.add(star); }
    else bezData.push(o);
  }

  /* ---- 2) podle otisku bez ceny (prodejce zlevnil) ---- */
  let poZmeneCeny = 0;
  if (bezData.length && stare.length) {
    const stareVolne = new Map();
    for (const o of stare) {
      if (spotrebovane.has(o)) continue;
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
      if (novePocty.get(k) === 1 && st && st.length === 1) {
        o.first_seen = st[0].first_seen; prenesZnacku(o, st[0]); spotrebovane.add(st[0]); poZmeneCeny++;
      }
    }
  }

  let novych = 0;
  for (const o of bezData) if (!o.first_seen) { o.first_seen = dnesISO; novych++; }
  /* POČTY PODLE ZDROJE. Samo celkové `novych` nestačí: zdroj, který
     přes noc změnil tvar dat, se v součtu za celý web schová (viz
     porovnejTotoznost). */
  const podleZdroje = {};
  for (const o of fresh) {
    const z = zdrojNabidky(o, znama);
    if (!z) continue;
    const u = podleZdroje[z] || (podleZdroje[z] = { celkem: 0, novych: 0 });
    u.celkem++;
    if (o.first_seen === dnesISO) u.novych++;
  }
  return { novych, poZmeneCeny, podleOdkazu, podleZdroje };
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

/* ---------- JEDNO MÍSTO, KUDY VEDE KAŽDÉ STAŽENÍ ----------
 *
 * Dřív si každý zdroj volal fetch() sám a každý jinak: osm volání
 * nemělo ČASOVÝ LIMIT (zaseknuté spojení by drželo celou úlohu až do
 * limitu GitHubu) a ŽÁDNÉ volání se neopakovalo. Jedno 503 nebo jeden
 * zavřený socket tím shodil celý zdroj na ten den — a protože robot
 * běží jednou za šest hodin, byla z chvilkového výpadku šestihodinová
 * díra v datech. Hlídač zdrojů to pozná (skenNeuplny), ale poznat
 * není totéž co přežít.
 *
 * Co helper dělá:
 *   · časový limit na KAŽDÝ pokus (výchozí 20 s),
 *   · opakuje jen to, co má smysl opakovat: síťovou chybu a stavy
 *     408, 425, 429, 500, 502, 503, 504. Na 403 ani 404 se neopakuje —
 *     tam by druhý pokus jen přitížil cizímu serveru,
 *   · čeká mezi pokusy exponenciálně (1 s, 2 s) a k tomu náhodný
 *     přídavek, aby tři zdroje nezaklepaly ve stejnou milisekundu,
 *   · RESPEKTUJE Retry-After, když ho server pošle. To je ta hlavička,
 *     kterou server říká „přijď za tolik vteřin"; ignorovat ji a tlačit
 *     dál je přesně to chování, kvůli kterému roboty blokují.
 *
 * CO TENHLE HELPER SCHVÁLNĚ NEDĚLÁ: nestřídá hlavičku user-agent ani
 * adresy a nepokouší se vypadat jako prohlížeč. Robot se představuje
 * pravdivě a jmenovitě, a když ho někdo nechce, nechodí tam. Obcházení
 * ochran proti robotům není „odolnost", je to cizí rozhodnutí, které
 * nám nepatří měnit.
 */
export { BOT_UA } from './bot-ua.mjs';
export const STAHNI_POKUSY = 3;        // celkem, tedy dva opravné
export const STAHNI_CAS = 20000;       // ms na jeden pokus
export const STAHNI_CEKANI_STROP = 30000;
const OPAKOVATELNE = new Set([408, 425, 429, 500, 502, 503, 504]);

export function jeOpakovatelny(stav) { return OPAKOVATELNE.has(Number(stav)); }

/* Kolik čekat před dalším pokusem. Oddělené od sítě, aby se to dalo
   změřit bez ní — a aby šlo dokázat, že Retry-After opravdu vyhrává
   nad vlastním odpočtem. Vrací milisekundy. */
export function cekaniPoPokusu(pokus, retryAfter) {
  const zaklad = 1000 * Math.pow(2, Math.max(0, pokus - 1));
  const nahoda = Math.floor(Math.random() * 250);
  let ms = zaklad + nahoda;
  const od = retryAfter == null ? null : String(retryAfter).trim();
  if (od) {
    const vterin = Number(od);
    if (Number.isFinite(vterin) && vterin >= 0) ms = Math.max(ms, vterin * 1000);
    else {
      const kdy = Date.parse(od);
      if (Number.isFinite(kdy)) ms = Math.max(ms, kdy - Date.now());
    }
  }
  return Math.max(0, Math.min(ms, STAHNI_CEKANI_STROP));
}

/* Vrací odpověď fetch(), takže volající pracuje dál jako dřív
   (r.ok, r.text(), r.json()). Když se nepovede ani poslední pokus,
   chyba vyletí — stejně jako dřív u holého fetch(). */
export async function stahni(url, volby = {}) {
  /* `cekaniNasobek` je tu kvůli zkoušce: ta si ověřuje, že se opakuje
     správně, a nemá u toho tři vteřiny čekat. V běhu robota se nikde
     nenastavuje, takže platí 1. */
  const { pokusy = STAHNI_POKUSY, casLimit = STAHNI_CAS, cekaniNasobek = 1, headers, ...zbytek } = volby;
  let posledni = null;
  for (let pokus = 1; pokus <= Math.max(1, pokusy); pokus++) {
    try {
      const r = await fetch(url, {
        ...zbytek,
        headers: { 'user-agent': BOT_UA, ...(headers || {}) },
        signal: zbytek.signal || AbortSignal.timeout(casLimit),
      });
      if (pokus < pokusy && jeOpakovatelny(r.status)) {
        /* Tělo odpovědi, které se nepřečte, drží spojení otevřené —
           undici ho vrátí do zásoby až po dočtení. Při osmi souběžných
           dělnících a opakování by se tím zásoba vyčerpala a robot by
           se zasekl na něčem, co vypadá jako pomalá síť. */
        try { if (r.body && typeof r.body.cancel === 'function') await r.body.cancel(); } catch (e) {}
        await sleep(cekaniPoPokusu(pokus, r.headers && r.headers.get('retry-after')) * cekaniNasobek);
        posledni = new Error(`${r.status} ${r.statusText || ''}`.trim());
        continue;
      }
      return r;
    } catch (e) {
      posledni = e;
      if (pokus >= pokusy) break;
      await sleep(cekaniPoPokusu(pokus, null) * cekaniNasobek);
    }
  }
  throw posledni || new Error('stahni: nepovedlo se');
}

// deterministický malý rozptyl (ať se parcely ve stejné obci nekryjí)
export function jitterAround(lat, lng, seedStr, amp) {
  let h = 0;
  const s = String(seedStr || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const j = (n) => (((h >> n) & 255) / 255 - 0.5) * amp;
  return { lat: +(lat + j(0)).toFixed(5), lng: +(lng + j(8)).toFixed(5) };
}

// Přesnější poloha podle názvu katastrálního území (Nominatim / OpenStreetMap).
const GEO_UA = { 'user-agent': BOT_UA };
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
    const r = await stahni(`https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=cz&q=${q}`, { headers: GEO_UA });
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

/* ---------- OBEC, KTEROU SLOVNÍK NEZNÁ ---------------------------
 *
 * Když se místo nepozná ze slovníku dosavadních nabídek, zbývá jméno
 * z názvu (viz obecZNazvuAukce) — jenže jméno samo o sobě není místo:
 * Hranic i Police je v Česku víc. Proto se kandidát OVĚŘÍ: zeptáme se
 * geokodéru, a okres vezmeme ze SKUTEČNÝCH HRANIC okresů, ne z jména.
 * Co se neověří, se nedoplní: nabídka zůstane bez místa a spočítá se.
 *
 * Dotazů je málo a jsou v mezipaměti (data/geocode-cache.json), takže
 * běžný běh se geokodéru ptá jen na jména, která ještě neviděl.
 */
async function geocodeObec(place) {
  const key = (place + '|*').toLowerCase();
  if (key in GEO_CACHE) return GEO_CACHE[key];
  let coord = null;
  try {
    const q = encodeURIComponent(place + ', Česko');
    const r = await stahni(`https://nominatim.openstreetmap.org/search?format=json&limit=5&countrycodes=cz&q=${q}`, { headers: GEO_UA });
    if (r.ok) {
      const j = await r.json();
      if (Array.isArray(j)) {
        for (const v of j) {
          const la = +parseFloat(v.lat).toFixed(5), ln = +parseFloat(v.lon).toFixed(5);
          if (!isFinite(la) || !isFinite(ln)) continue;
          /* Hranice okresů rozhodují: bod musí ležet v některém z nich.
             Bez toho by se sem dostal i bod za hranicemi republiky. */
          if (maHranice() && !okresPodleHranice(la, ln)) continue;
          coord = [la, ln];
          break;
        }
      }
    }
  } catch { /* síť selhala — necháme null */ }
  GEO_CACHE[key] = coord;
  geoCacheDirty = true;
  await sleep(1100); // Nominatim: max ~1 dotaz/s
  return coord;
}

/** Místo z názvu aukce: jméno → geokodér → okres z hranic. Nebo null. */
export async function mistoZeJmenaAukce(nazev, geo = geocodeObec) {
  for (const kandidat of obecZNazvuAukce(nazev)) {
    const coord = await geo(kandidat);
    if (!Array.isArray(coord)) continue;
    const okres = maHranice() ? okresPodleHranice(coord[0], coord[1]) : null;
    if (!okres) continue;
    return { place: kandidat, okres, lat: coord[0], lng: coord[1], jak: 'jméno z názvu ověřené geokodérem' };
  }
  return null;
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
    const r = await stahni(u, { headers: OBEC_UA });
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
/* ULICE V POLI PRO OBEC — DOKÁZANÁ Z ADRESY INZERÁTU A Z NAŠICH DAT.
   ====================================================================
   mistoZBezrealitky() výš umí opravit ty případy, kde adresa inzerátu
   nese obec jako další část. Kde ji nenese, zůstala v poli pro obec
   ULICE — a komentář u té funkce říkal rovnou, proč se s tím dál nic
   nedělá: „Přeložit `cesky-brod` na `Český Brod` by znamenalo seznam
   obcí, a ten tu není; napsat to bez diakritiky by na českém webu bylo
   vidět."

   Ten seznam ale po částech MÁME: jsou to jména obcí z našich vlastních
   dat. Adresa inzerátu `…-nabidka-prodej-pozemku-muskatova-brno` nese
   za jménem místa ještě `brno`, a „Brno" v datech stojí u čtrnácti
   jiných nabídek — tedy i s diakritikou a velkým písmenem. Nic se
   nevymýšlí; jméno se opisuje odtud.

   DVĚ NEZÁVISLÉ OPORY, A OBĚ MUSÍ DRŽET:
     1) zbytek adresy za jménem místa se CELÝ rovná jménu, které v datech
        u nějaké nabídky stojí jako obec,
     2) to, co dnes stojí v poli pro obec, vypadá na ulici — začíná
        předložkou (Ke Korunce, V Dymáku), je to přídavné jméno
        (Sadovská, Muškátová, Císařova) nebo v něm stojí slovo, které
        v názvu obce nebývá (cesta, náměstí).

   PROČ CELÝ ZBYTEK, A NE JEN POSLEDNÍ ÚSEK. Zkusil jsem brát poslední
   úsek, když se celý zbytek nenajde, a hned to vyrobilo dvě chyby:
   z adresy `…-ve-visnovce-vysoky-ujezd` vyšel „Újezd", což je JINÁ
   obec než Vysoký Újezd, a z `…-v-dymaku-nove-jirny` vyšly „Jirny".
   Zkracovat jméno obce je horší než ho neopravit, takže se zbytek bere
   celý, nebo vůbec.

   PROČ OBĚ OPORY. Bez první by se vymýšlela diakritika. Bez druhé by se
   ořezávala složená jména obcí: adresa `…-pozemku-jesenice-rakovnik`
   má za „Jesenice" ještě „rakovnik" a „Rakovník" v datech je — jenže
   Jesenice je obec, ne ulice, a opravovat by se nemělo nic.

   NAMĚŘENO na 1 953 nabídkách: opraví se 16 (Muškátová → Brno,
   Ke Korunce → Praha, Jasanová → Ústí nad Labem, Okružní a Krátká →
   Křenice, …). Dalších asi 25 je taky ulice, ale jméno jejich obce
   v datech nestojí (Pardubická + chotec, Topolová + stenovice) —
   a vymýšlet ho z adresy bez diakritiky je právě to, co se tu nedělá.
   Teprve seznam obcí od ČSÚ by je dořešil; je to v docs/pro-majitele.md.

   Zkouší to scripts/test-misto-inzeratu.mjs. */
const ULICE_PREDLOZKA = /^(?:ke?|na|ve?|u|pod|za|nad|do|pri|před|pred|mezi)\s/i;
const ULICE_PRIDAVNE = /(?:ská|cká|ová|ova|ní|rá|tá|lá|á|é)$/;
/* Koncová hranice je tu `(?![\p{L}])`, ne `\b`: `\b` se v JavaScriptu
   řídí `\w`, kam písmeno s diakritikou nepatří, takže za „náměstí"
   ani za „nábřeží" žádná hranice slova není a obě alternativy byly
   mrtvé — `vypadaJakoUlice('Náměstí Svobody')` vracelo false a web
   vedl náměstí jako obec. Měřeno 6. 11., §454. */
const ULICE_SLOVO = /\b(?:cesta|ulice|náměstí|nábřeží|alej|sady|stezka)(?![\p{L}])/iu;
/** Vypadá tenhle řetězec na jméno ulice, ne obce? */
export function vypadaJakoUlice(s) {
  const t = String(s || '').trim();
  if (!t) return false;
  return ULICE_PREDLOZKA.test(t) || ULICE_PRIDAVNE.test(t) || ULICE_SLOVO.test(t);
}
/** Vrací počet opravených. Mění `place` na místě. */
export function opravUliceVObci(nabidky) {
  const bezD = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  /* Jména obcí, jak je známe z dat — VŠECHNA, i ta, která vypadají na
     ulici. Napoprvé jsem z tohohle seznamu jména podle téhož testu
     vyhazoval, aby ulice jméno nepropůjčila — a seznam tím ztratil
     Orlovou: končí na „-á", takže ji test na ulici označil za ulici.
     Oprava „Bučinská → Orlová" pak nebyla z čeho udělat. Test na ulici
     rozhoduje jen o tom, CO se opravuje; jméno, kterým se opravuje,
     musí být k dispozici celé. */
  const zname = new Map();
  for (const o of nabidky || []) {
    if (!o || !o.place) continue;
    zname.set(bezD(o.place), String(o.place));
  }
  let kolik = 0;
  for (const o of nabidky || []) {
    if (!o || !o.place || !vypadaJakoUlice(o.place)) continue;
    const m = /nabidka-prodej-pozemku-(.+?)$/.exec(String(o.url || ''));
    if (!m) continue;
    const ps = bezD(o.place);
    if (!ps || !m[1].includes(ps)) continue;
    const zbytek = m[1].slice(m[1].indexOf(ps) + ps.length).replace(/^-/, '');
    if (!zbytek) continue;
    const jmeno = zname.get(zbytek);
    if (!jmeno || bezD(jmeno) === ps) continue;
    /* Ulice se nikam neukládá. Stejně ji zahazuje i mistoZBezrealitky()
       výš (volající bere jen `place`), web ji nikde neukazuje a nové
       pole v datech hlídá data/pole.json — zavést ho jen proto, aby
       leželo nepřečtené, by byl jen další sloupec k udržování. Z adresy
       inzerátu, která u nabídky zůstává, se dá přečíst kdykoli. */
    o.place = jmeno;
    kolik++;
  }
  return kolik;
}

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
  /* ZNÁME-LI PARCELNÍ ČÍSLO, CENA DO TOTOŽNOSTI NEPATŘÍ.
   *
   * Nalezeno zkouškou archivu 4. 11., hned po zapojení otevřených dat
   * státu: dva různé záznamy evidence (109140 a 109121) na TÉŽ parcele
   * 3366/4 v Českých Budějovicích, táž výměra 415 m², ceny 149 436
   * a 193 022 Kč. Dvojníka to neutvořilo, protože v klíči byla cena —
   * a následky byly tři: dvě nabídky se slily do JEDNÉ stránky (týž
   * podpis), klíče archivu se srazily a historie ceny z toho udělala
   * zlevnění o 44 tisíc, které se nestalo.
   *
   * Parcelní číslo v katastrálním území je jednoznačné, takže obec +
   * parcela + výměra je totožnost pozemku. Změřeno na celých datech:
   * takhle se slije JEDNA skupina ze 2 017 nabídek, tedy o nabídku na
   * webu méně a o tři vady taky.
   *
   * Bez parcelního čísla (u 1 723 z 2 020 nabídek je „—") zůstává cena
   * v klíči: tam je to jediné, čím se dvě nabídky od sebe liší. */
  const parcela = String(o.parcel || '').trim();
  const znamaParcela = parcela && parcela !== '—' && parcela !== '-';
  if (znamaParcela) {
    return [o.type || '', o.okres || '', o.place || '', parcela, o.area || 0].join('|');
  }
  return [o.type || '', o.okres || '', o.place || '', '',
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
const UA = { 'user-agent': BOT_UA };

function parseArea(text) {
  /* ČISLO VÝMĚRY SE NESMÍ SLEPIT S ČÍSLEM PŘED NÍM (§462).
   * Nalezeno měřením 6. 11. na prvním skutečném běhu Sreality: na webu
   * viselo 44 PRAŽSKÝCH BYTŮ jako pozemky s výměrou 1 111 m². Četlo se to
   * z názvu „Prodej bytu 2+1 111 m²": vzorek začal u jedničky z „2+1",
   * třída [\d\s.]* spolkla mezeru a ze dvou čísel vyrobila jedno. Z 51 m²
   * tak bylo 151, ze 105 m² 1 105 — a cena za metr, podle které web
   * počítá odhady a odznaky, vyšla desetkrát nižší.
   * Dvě závorky to zavírají: (?<![\d+]) — před číslem nesmí stát čislice
   * ani plus (počet pokojů), a mezera se uzná jen jako oddělovač tisíců,
   * tedy po ní musí následovat přesně tři čislice. */
  const m = String(text).match(/(?<![\d+])(\d{1,3}(?:[\s.]\d{3})*|\d+)\s*m(?:2|²)/i);
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
  const re = /(?<![\d+])(\d{1,3}(?:[\s.]\d{3})*|\d+)\s*m(?:2|²)/gi; // týž vzorek jako v parseArea (§462)
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

/* KATEGORIE NEMOVITOSTI — co se vlastně prodává.
   ------------------------------------------------------------------
   Majitel 5. 11. rozhodl, že na webu budou všechny nemovitosti, ne jen
   pozemky. Zdroje ale kategorii nehlásí: dražební rejstříky i ÚZSVM
   dávají jen název a popis, takže ji musí poznat kód. Pravidla jsou ve
   sdíleném js/kategorie.js, aby je web i robot čtly stejně.

   `kat` je zvlášť od `druh` schválně: `druh` odpovídá na „jaký je to
   POZEMEK" (orná půda, les, stavební), `kat` na „co se prodává"
   (pozemek, dům, byt, areál). U bytu nemá druh pozemku smysl vůbec.

   CO SE NEPOZNÁ, JE POZEMEK — tím zůstanou dnešní data nezměněná.
   Změřeno na všech 2 303 dnešních nabídkách: u každé vyjde pozemek,
   takže zapojení kategorií dnešní web nepřeklopí (hlídá
   scripts/test-kategorie.mjs). */
const PKKategorie = createRequire(import.meta.url)(join(dirname(fileURLToPath(import.meta.url)), '..', 'js', 'kategorie.js'));
function parseKategorie(text, jmenaMist) {
  return PKKategorie.zTextu(text, jmenaMist) || PKKategorie.VYCHOZI;
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

/* ROZPAD, KTERÝ SI ČTEČKA VEDE SAMA — A MUSÍ SKONČIT V DATECH.
   Čtečka dražeb počítá, co zahodila schválně (nezveřejněná dražba, bez
   pozemku, bez výměry) a vypisuje to do logu. Jenže log po běhu zmizí,
   takže na otázku „ubývá u nich, nebo u nás?" nešlo odpovědět: naměřeno
   4. 11., že zdroj Dražby klesl z 81 na 45 za tři týdny plynule, a
   rozhodnout, jestli jde o méně zveřejněných dražeb nebo o naši čtečku,
   se nedalo — chyběla historie těch mezičísel. Teď jde rozpad do
   `sources[]`, takže se příští takový svah dá rozsoudit odečtením dvou
   dnů, ne hádáním. */
const ROZPAD_ZDROJE = new Map();
export function zapisRozpad(zdroj, rozpad) {
  if (!zdroj || !rozpad) return;
  ROZPAD_ZDROJE.set(zdroj, rozpad);
}
export function rozpadZdroje(nazev) { return ROZPAD_ZDROJE.get(nazev) || null; }

/* A JEŠTĚ JEDNO ÚČTOVÁNÍ: KOLIK DOTAZŮ VŮBEC DOŠLO.
 *
 * „OK dražby" se nestahují seznamem — projíždí se tři tisíce ID po sobě
 * a ptá se na každé zvlášť. Každá síťová chyba u jednoho ID přitom
 * padala do prázdného `catch`, takže běh, ve kterém se tři sta dotazů
 * neptalo vůbec, vypadal naprosto stejně jako běh, ve kterém portál
 * opravdu měl míň dražeb. Číslo z takového běhu pak šlo do historie
 * jako měření a hlídač podle něj počítal medián.
 *
 * Změřeno na ostrých datech: ze 3 021 ID je dražba pozemku asi 1,5 %,
 * takže deset procent nedoručených dotazů znamená asi desetinu
 * chybějících nabídek. Právě proto je práh desetina: když se nedoptám
 * na desetinu ID, může být výsledek o desetinu nižší — a to už se
 * nesmí vydávat za měření. */
const SKEN = new Map();
function skenDotaz(zdroj, selhalo, e) {
  const z = SKEN.get(zdroj) || { dotazu: 0, selhalo: 0, prvni: null };
  z.dotazu++;
  if (selhalo) { z.selhalo++; if (!z.prvni) z.prvni = String((e && e.message) || e).slice(0, 140); }
  SKEN.set(zdroj, z);
}
/* A DRUHÝ ZPŮSOB, JAK POZNAT NEÚPLNÝ BĚH: zdroj sám řekne, kolik jich má.
 *
 * Bezrealitky vracejí v každé odpovědi `totalCount` — tedy počet inzerátů,
 * které na dotaz mají. Stahuje se po stránkách po šedesáti a smyčka se
 * při chybě jedné stránky prostě ZASTAVÍ (`break`). Zbytek stránek se
 * pak ani nezkusí, takže se ani nemá co počítat jako selhání: běh vypadá
 * jako úplný, jen přinesl míň. U největšího zdroje (92 % všech nabídek)
 * je to ten nejtišší možný způsob, jak přijít o část trhu.
 *
 * `totalCount` je proti tomu tvrdý údaj od zdroje samého — a porovnání
 * s ním nic nestojí, protože ho dostáváme v každé odpovědi. */
function skenOcekavej(zdroj, kolik) {
  if (!(kolik > 0)) return;
  const z = SKEN.get(zdroj) || { dotazu: 0, selhalo: 0, prvni: null };
  /* Bere se NEJVYŠŠÍ hlášený počet. Mezi stránkami se číslo může hnout
     (inzerát přibude nebo zmizí) a brát poslední by znamenalo měřit se
     podle toho, co zdroj řekl naposled — tedy případně až po výpadku. */
  z.ocekavano = Math.max(z.ocekavano || 0, kolik);
  SKEN.set(zdroj, z);
}
function skenPrijato(zdroj, kolik) {
  const z = SKEN.get(zdroj) || { dotazu: 0, selhalo: 0, prvni: null };
  z.prijato = (z.prijato || 0) + (kolik || 0);
  SKEN.set(zdroj, z);
}
/* Smyčka skončila CHYBOU, ne tím, že došly stránky. Bez tohohle rozlišení
   by se `totalCount` muselo brát jako svaté — a co přesně počítá, se
   odsud ověřit nedá (hostitel je ze schránky blokovaný). Kdyby počítal
   byť jen o kousek víc než kolik vrací `list` (třeba i stažené inzeráty),
   hlásil by se největší zdroj jako neúplný při KAŽDÉM běhu a přestal by
   se zapisovat do historie. To by bylo horší než vada, kterou to má
   hlídat. Číslo se proto používá jen k tomu, aby se u běhu, o kterém
   UŽ VÍME, že se utrhl, dalo říct kolik toho chybí. */
function skenUtrzeno(zdroj, e) {
  const z = SKEN.get(zdroj) || { dotazu: 0, selhalo: 0, prvni: null };
  z.utrzeno = true;
  if (!z.prvni && e) z.prvni = String((e && e.message) || e).slice(0, 140);
  SKEN.set(zdroj, z);
}
export function skenZdroje(nazev) {
  return SKEN.get(nazev) || { dotazu: 0, selhalo: 0, prvni: null };
}
/* Desetina nedoručených dotazů = výsledek může být o desetinu nižší.
   Dolní mez je proti šumu: u krátkého skenu by jediná chyba dala
   procenta, která nic neznamenají. */
export const PODIL_SELHANI = 0.1;
export const MIN_SELHANI = 10;
export function skenNeuplny(s) {
  if (!s) return false;
  /* Dva nezávislé způsoby, jak poznat neúplný běh. Stačí jeden: oba
     měří totéž („nevidíme všechno"), jen z jiné strany. */
  if (s.dotazu && s.selhalo >= MIN_SELHANI && s.selhalo > s.dotazu * PODIL_SELHANI) return true;
  /* Chybí desetina toho, co zdroj sám hlásí. Dolní mez je tatáž a ze
     stejného důvodu: u malého zdroje by jeden inzerát navíc nebo míň
     dělal procenta, která nic neznamenají. */
  if (s.utrzeno && s.ocekavano > 0) {
    const chybi = s.ocekavano - (s.prijato || 0);
    if (chybi >= MIN_SELHANI && chybi > s.ocekavano * PODIL_SELHANI) return true;
  }
  return false;
}

/* NEÚPLNÝ SKEN NENÍ MĚŘENÍ — a musí to být poznat na stavu zdroje.
 * Když se nedoptáme na desetinu ID, může být výsledek o desetinu
 * nižší; takové číslo nesmí jít do historie jako měření ani spustit
 * poplach o úbytku. Dostane proto vlastní stav: `porovnejSHistorii`
 * si všímá jen stavu „ok" a `zapisDoHistorie` zapisuje jen stavy ze
 * seznamu ODPOVEDEL, takže „neuplne" projde obojím bez následků
 * a přitom zůstane vidět v datech i na webu.
 *
 * Stojí to stranou main() schválně: tohle je jediný kus rozhodování
 * v celém řetězci, který jde zkusit bez sítě — a tím pádem jediný,
 * který jde hlídat zkouškou. */
export function oznacNeuplne(zdroje, sken) {
  const hlasky = [];
  for (const z of (zdroje || [])) {
    const sk = sken(z.nazev) || { dotazu: 0, selhalo: 0 };
    if (z.stav !== 'ok' || !skenNeuplny(sk)) continue;
    z.stav = 'neuplne';
    /* Důvod se musí říct ten, který opravdu nastal. Dělit `dotazu`
       u zdroje, kde se ID neprojíždějí, by dalo „NaN %" — a hláška,
       která nedává smysl, se čte jako chyba hlášky, ne jako nález. */
    const proc = (sk.dotazu && sk.selhalo)
      ? `neptal se na ${sk.selhalo} z ${sk.dotazu} ID (${Math.round(sk.selhalo / sk.dotazu * 100)} %)`
      : `přinesl ${sk.prijato || 0} z ${sk.ocekavano || 0} záznamů, které sám hlásí`;
    hlasky.push(`POZOR: zdroj ${z.nazev} ${proc}. ${z.pocet} záznamů z takového běhu`
      + ' není měření — do historie se nezapisuje.'
      + (sk.prvni ? ' První potíž: ' + sk.prvni : ''));
  }
  return hlasky;
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
/* ---------- DRUHÁ CESTA, KDYŽ SE ZDROJ ZMĚNÍ ---------------------- */
/* Každý stahovač výš zná jednu cestu: adresu a tvar odpovědi. Když
   zdroj přestaví web nebo přejmenuje pole v API, ta cesta se zavře
   a zdroj vypadne, dokud ji někdo ručně nepřepíše. §332 zařídil, že to
   nezmrazí celá data; tohle je o tom, aby se zdroj zkusil přečíst
   JINAK, než jak ho zná stahovač.
   Druhá cesta nestojí na vzhledu: scripts/cteni-zdroje.mjs čte JSON-LD
   (schema.org), mikrodata a nakonec pouhé signály — odkaz, u kterého
   stojí cena a výměra. Pořadí a mezí je popsané tam.

   PLATÍ JEN PRO PRODEJE. U dražeb by z druhé cesty vyšla nabídka bez
   termínu a bez rozlišení nucené dražby, tedy nabídka, kterou web neumí
   správně popsat — a špatný popis je horší než chybějící nabídka. U nich
   se proto jen zapíše DIAGNÓZA: co na té stránce bylo (kolik cen, kolik
   výměr, jestli je tam JSON-LD, jestli to není přihlašovací zeď). Bez
   ní přijde do úkolu jen „zdroj nic nevrací", což se nedá vyšetřit.

   ROBOTS.TXT SE ČTE PRVNÍ. Když zdroj čtení zakazuje nebo se jeho
   robots.txt nedá přečíst, druhá cesta se nezkouší vůbec. */
export const ZALOZNI_STROP = 400;        // nabídek z jednoho zdroje za běh

/* KDY SE DRUHÁ CESTA ZKOUŠÍ.
 *
 * Do 3. 11. jen u stavu „chyba" — a to byla díra přesně tam, kde měla
 * §334 pomoct nejvíc. Když cizi web změní podobu stránky nebo přejmenuje
 * pole v API, dotaz NESPADNE: vrátí 200 a stahovač z něj prostě
 * nepřečte nic. Stav pak není „chyba", ale „prazdno" (nic) nebo
 * „propad" (zlomek) — a druhá cesta se nezkusila. Tedy: nejčastější
 * podoba změny cizi ho webu byla právě ta, na kterou náhradní čtení
 * nedosáhlo.
 *
 * „zahazuje" je tu taky: zdroj, který víc nabídek zahodí než přinese,
 * je rozbitý, i když něco vrátil.
 * „pokles" tu NENÍ: třicetiprocentní úbytek může být pravda (vydražilo
 * se) a stáhnout kvůli tomu celý výpis znovu by znamenalo zatěžovat
 * cizi web kvůli normální změně nabídky. */
export const ZKUSIT_DRUHOU = new Set(['chyba', 'prazdno', 'propad', 'zahazuje']);

/**
 * Přečte JEDEN cíl obecnou cestou: robots.txt → stránka → nabídky.
 *
 * Vytaženo ze `zalozniCestou`, protože ta práce není vlastní jen
 * výpadkům. Když §334 slibuje, že „změna cizího webu nezavře spojení",
 * platí to i naopak: **přidání zdroje má být řádek v registru, ne nový
 * stahovač.** Tatáž cesta se proto používá dvakrát:
 *   · `zalozniCestou` — zdroj, který dnes neodpověděl svou cestou;
 *   · `obecneZdroje`  — zdroj, který jinou cestu než tuhle nikdy neměl.
 *
 * Vrací vždy OBOJÍ: nabídky a `zalozni` (diagnózu). Ani prázdný výsledek
 * není mlčení — bez diagnózy přijde do úkolu jen „zdroj nic nevrací",
 * což se nedá vyšetřit.
 */
async function prectiCil(cil, nastroje) {
  const { stahni: stahniF, smimeCist: smimeF, prectiJakkoli, copakTamJe,
    mistoZTextu, slovnik, okresy, ua, robotsMezipamet, jmeno } = nastroje || {};
  const nazev = jmeno || cil.jmeno || cil.host;
  let smime = null;
  try { smime = await smimeF(cil.url, { stahni: stahniF, ua, mezipamet: robotsMezipamet }); }
  catch (e) { smime = { dovoleno: false, duvod: String(e && e.message || e) }; }
  if (!smime.dovoleno) {
    /* „Nesmíme" a „nevíme" se nesmí plést ani tady — viz §337. */
    return { nabidky: [], zalozni: { verdikt: smime.nejdePrecist ? 'robots neznámý' : 'nesmíme', duvod: smime.duvod } };
  }
  let html = '';
  try {
    const odp = await stahniF(cil.url, { pokusy: 1 });
    html = await odp.text();
  } catch (e) {
    return { nabidky: [], zalozni: { verdikt: 'neodpovídá', duvod: String(e && e.message || e).slice(0, 140) } };
  }
  const v = prectiJakkoli(html, cil.url);
  const zalozni = { verdikt: v.nabidky.length ? 'přečteno' : 'nepřečteno', zapis: v.zapis, cesta: v.cesta };
  if (!v.nabidky.length) {
    zalozni.diagnoza = copakTamJe(html);
    return { nabidky: [], zalozni };
  }
  if (cil.typ !== 'sale') {
    /* U dražeb by z obecné cesty vyšla nabídka bez termínu a bez
       rozlišení nucené dražby — nabídka, kterou web neumí správně
       popsat. Špatný popis je horší než chybějící nabídka. */
    zalozni.verdikt = 'jen diagnóza (dražby obecnou cestou nebereme)';
    zalozni.diagnoza = copakTamJe(html);
    return { nabidky: [], zalozni };
  }
  let bezMista = 0;
  const prevedene = [];
  for (const n of v.nabidky.slice(0, ZALOZNI_STROP)) {
    if (!n.cena || !n.vymera) continue;
    const text = [n.nazev, n.misto].filter(Boolean).join(' ');
    const misto = mistoZTextu(text, slovnik, okresy);
    if (!misto) { bezMista++; continue; }
    const okres = normOkres(misto.okres);
    if (!okres) { bezMista++; continue; }
    prevedene.push({
      place: String(misto.place).slice(0, 60), okres, type: 'sale', parcel: '—',
      druh: normDruh(parseDruh(text, [misto.place, okres]) || 'pozemek'),
      area: n.vymera, price: n.cena,
      extra: `inzerát – ${nazev}`, zdroj: nazev,
      url: n.url || cil.url,
    });
  }
  zalozni.pocet = prevedene.length;
  zalozni.bezMista = bezMista;
  return { nabidky: prevedene, zalozni };
}

export async function zalozniCestou(zdroje, cile, nastroje) {
  const ven = [];
  /* VLASTNÍ MEZIPAMĚŤ NA robots.txt, ne ta uvnitř smimeCist. Ta je
     společná pro celý proces, takže by si dva běhy (a dvě zkoušky)
     předávaly cizí odpověď — a zdroj, který mezitím čtení zakázal, by
     se čten dál podle starého. Jeden běh = jedno čtení robots.txt na
     web; mezi běhy se čte znovu. */
  const robotsMezipamet = new Map();
  for (const z of (zdroje || [])) {
    if (!z || !ZKUSIT_DRUHOU.has(z.stav)) continue;
    const cil = (cile || []).find((c) => c.jmeno === z.nazev);
    if (!cil || !cil.url) continue;
    const { nabidky, zalozni } = await prectiCil(cil, { ...nastroje, robotsMezipamet, jmeno: z.nazev });
    z.zalozni = zalozni;
    if (zalozni.verdikt === 'nesmíme' || zalozni.verdikt === 'robots neznámý') {
      console.error(`Druhá cesta ke ${z.nazev} se nezkouší: ${zalozni.duvod}`);
      continue;
    }
    if (zalozni.verdikt === 'nepřečteno') {
      console.error(`Druhá cesta ke ${z.nazev} nic nenašla. Co na stránce je:`
        + ` ${JSON.stringify(zalozni.diagnoza)}`);
      continue;
    }
    if (!nabidky.length) {
      if (zalozni.verdikt === 'přečteno') {
        console.error(`Druhá cesta ke ${z.nazev} našla nabídky, ale ani u jedné se`
          + ' nedalo poznat místo — nebereme nic.');
      }
      continue;
    }
    z.stav = 'druhá cesta';
    z.pocet = nabidky.length;
    console.error(`Zdroj ${z.nazev} se přečetl DRUHOU CESTOU (${zalozni.cesta}):`
      + ` ${nabidky.length} nabídek, ${zalozni.bezMista} bez poznaného místa.`);
    ven.push(...nabidky);
  }
  return ven;
}

/* ---------- ZDROJ, KTERÝ JE JEN ŘÁDKEM V REGISTRU ----------------- */
/* Tohle je to, co majitel chtěl: „aby náš výběr nezáležel na páru
   webů". Dokud se každý zdroj psal jako vlastní stahovač (znalost
   adresy A tvaru odpovědi), stálo přidání zdroje den práce a při
   změně toho webu se rozbilo. Obecná cesta z §334 ale žádný tvar
   nezná — čte JSON-LD, mikrodata nebo pouhé signály. Není tedy důvod
   ji držet jen pro výpadky.
   `OBECNE_ZDROJE` v scripts/zdroje-kandidati.mjs je proto seznam, do
   kterého se zdroj PŘIDÁ ŘÁDKEM. robots.txt se čte první, stav se
   zapisuje do dat jako u každého jiného zdroje (takže ho vidí
   diagnostika i držení nabídek z §332) a u dražeb se nebere nic, jen
   diagnóza — ze stejného důvodu jako u druhé cesty.
   SEZNAM ZŮSTÁVÁ PRÁZDNÝ, DOKUD HO SONDA NEZAPLNÍ. Zapsat tam web
   naslepo by znamenalo tvrdit o cizím webu něco, co jsme neměřili;
   z tohohle stroje se navíc na cizí weby nedostaneme vůbec. Nález
   sondy (data/zdroje-sonda.json) řekne, který kandidát čtení dovoluje
   a má na adrese pozemky — teprve to je důvod k řádku. */
/* ---------- ZDROJ ČTENÝ PODLE PŘEDPISU ---------------------------
 * Obecná cesta (JSON-LD → mikrodata → signály) umí jen `typ: 'sale'`:
 * u dražby by z ní vyšla nabídka bez rozlišení, a špatný popis je
 * horší než chybějící nabídka. Dražební výpis proto čte PŘEDPIS
 * (scripts/predpisy-zdroju.mjs) — recept na jeden konkrétní výpis,
 * naměřený ostrými pokusy, ne odhadnutý.
 *
 * Zapojení takového zdroje je pak taky jen řádek v registru
 * (`ZAPOJENE_PREDPISY`), ne nový stahovač. Pravidla zůstávají:
 *   · robots.txt se čte PRVNÍ a výjimka není žádná;
 *   · mezi stránkami se čeká a stránek se vezme nejvýš `stropStranek`;
 *   · SKONČENÁ AUKCE NENÍ NABÍDKA — bere se jen stav z `zivyStav`
 *     (§455). Kdo si na webu otevře „Prodáno", je obelhaný;
 *   · co není nemovitost (traktor, pohledávky), se nebere vůbec;
 *   · nabídka bez ceny, výměry, odkazu nebo bez poznaného místa se
 *     NEDOPLŇUJE dohadem, jen spočítá — a důvod se napíše do logu.
 */
export async function zdrojePodlePredpisu(hosty, nastroje) {
  const { stahni: stahniF, smimeCist: smimeF, zZaznamu, predpisy, mistoZTextu,
    slovnik, okresy, ua, pauza = 2000, zJmena } = nastroje || {};
  const spi = (ms) => new Promise((r) => setTimeout(r, ms));
  const robotsMezipamet = new Map();
  const nabidkyVen = [];
  const zdrojeVen = [];
  for (const host of (hosty || [])) {
    const predpis = (predpisy || {})[host];
    const nazev = (predpis && predpis.jmeno) || host;
    const cas = new Date().toISOString();
    if (!predpis || !predpis.vypis) {
      zdrojeVen.push({ nazev, stav: 'chyba', pocet: 0, cas, chyba: `pro ${host} není předpis` });
      console.error(`Zdroj ${nazev}: předpis chybí — nečte se nic.`);
      continue;
    }
    let smime = null;
    try { smime = await smimeF(predpis.vypis, { stahni: stahniF, ua, mezipamet: robotsMezipamet }); }
    catch (e) { smime = { dovoleno: false, duvod: String((e && e.message) || e) }; }
    if (!smime.dovoleno) {
      /* „Nesmíme" a „nevíme" se neplete ani tady (§337). Ani jedno
         není důvod to obejít. */
      zdrojeVen.push({ nazev, stav: smime.nejdePrecist ? 'robots neznámý' : 'nesmíme', pocet: 0, cas,
        chyba: smime.duvod });
      console.error(`Zdroj ${nazev} se nečte: ${smime.duvod}`);
      continue;
    }
    const d = predpis.dalsiStranky;
    const stropStranek = (d && d.stropStranek) || 1;
    const adresa = (i) => ((!i || !d) ? predpis.vypis : predpis.vypis + d.parametr + (i * d.krok));
    const vse = [];
    let stranek = 0, selhalo = 0;
    for (let i = 0; i < stropStranek; i++) {
      let html = '';
      try {
        const odp = await stahniF(adresa(i), { casLimit: 20000, pokusy: 1 });
        html = await odp.text();
      } catch (e) { selhalo++; if (i + 1 < stropStranek) await spi(pauza); continue; }
      stranek++;
      try { vse.push(...zZaznamu(html, adresa(i), predpis)); } catch (e) { preskoc(nazev, e); }
      if (i + 1 < stropStranek) await spi(pauza);
    }
    /* Stránkování se umí překrývat; páruje se evidenčním číslem. */
    const podleCisla = new Map();
    for (const n of vse) if (n.cislo && !podleCisla.has(n.cislo)) podleCisla.set(n.cislo, n);
    const jedinecne = [...podleCisla.values()];
    const zivy = predpis.zivyStav || null;
    const zahozeno = { skoncilo: 0, neniNemovitost: 0, bezCeny: 0, bezVymery: 0, bezOdkazu: 0, bezTerminu: 0, bezMista: 0 };
    const prevedene = [];
    for (const n of jedinecne) {
      if (zivy && !zivy.includes(String(n.stav || ''))) { zahozeno.skoncilo++; continue; }
      /* `kategorieZNazvu` vrací u traktoru i u pohledávky
         `{ druh: 'není nemovitost', kategorie: 'jiné' }`, což je
         PRAVDIVÁ, ale KLADNÁ odpověď — pouhé `!n.kategorie` ji
         propustí dál a záznam pak spadne až o řádek níž jako
         „bez výměry". Naměřeno na fixtuře: kolový traktor se
         zahodil se špatným důvodem, a důvod, který lže, pošle člověka
         hledat vadu jinam (§366). */
      if (!n.kategorie || !jeNemovitost(String(n.nazev || ''))) { zahozeno.neniNemovitost++; continue; }
      if (!(n.cena > 0)) { zahozeno.bezCeny++; continue; }
      if (!(n.vymera > 0)) { zahozeno.bezVymery++; continue; }
      if (!n.odkaz) { zahozeno.bezOdkazu++; continue; }
      /* DRAŽBA BEZ TERMÍNU NA WEB NEPATŘÍ. Dvě dražby téhož pozemku
         se bez data nedají rozlišit — v kanálu novinek vyjdou znak za
         znak stejně (hlídá test-rss) — a člověk neví, do kdy má čas.
         Nedoplňuje se dohadem; záznam se spočítá a jde se dál. */
      if ((predpis.typ || 'drazba') === 'drazba' && !n.termin) { zahozeno.bezTerminu++; continue; }
      /* MÍSTO: nejdřív slovník dosavadních nabídek, a když nepomůže,
         jméno z názvu ověřené geokodérem (§465). Bez ověření se
         nedoplňuje nic — nabídka pak zůstane bez místa a spočítá se. */
      let misto = mistoZTextu(String(n.nazev || ''), slovnik, okresy);
      let okres = misto && normOkres(misto.okres);
      if (!okres && typeof zJmena === 'function') {
        const zn = await zJmena(String(n.nazev || ''));
        if (zn && normOkres(zn.okres)) { misto = zn; okres = normOkres(zn.okres); }
      }
      if (!misto || !okres) { zahozeno.bezMista++; continue; }
      const o = {
        place: String(misto.place).slice(0, 60), okres,
        type: predpis.typ || 'drazba', parcel: '—',
        _key: `pr-${host}-${n.cislo}`,
        druh: normDruh(n.druh || parseDruh(String(n.nazev || ''), [misto.place, okres]) || 'pozemek'),
        area: n.vymera, price: n.cena,
        /* Tvar popisu je týž jako u ostatních dražeb v datech
           („dražba 2026-11-26 · OK dražby"), ať kanál novinek
           i stránka nabídky nemají dvě řeči pro tutéž věc. */
        extra: `${predpis.typ === 'drazba' ? `dražba ${n.termin}` : 'nabídka'}`
          + ` · ev. č. ${n.cislo} · ${nazev}`,
        zdroj: nazev,
        url: n.odkaz,
      };
      /* Souřadnice z geokodéru jsou lepší než střed okresu s rozptylem:
         obec sedí na metry, ne na kilometry. Když je nemáme, doplní je
         geocode() jako u každé jiné nabídky. */
      if (isFinite(misto.lat) && isFinite(misto.lng)) { o.lat = misto.lat; o.lng = misto.lng; o._gps = true; }
      /* Kategorie jde do dat jen tehdy, když to POZEMEK NENÍ: web
         pozemek bere jako výchozí stav a `kat` je výjimka (§412).
         A MUSÍ TO BÝT KLÍČ, KTERÝ WEB ZNÁ. Předpis rozlišuje jen
         hrubě (`pozemek` / `stavba` / `jiné`), kdežto data mají
         jmenovité klíče (dum, byt, areal, garaz, jine). Psát do dat
         `stavba` znamená psát tam neznámé slovo — chytil to hlídač
         kategorií hned v prvním ostrém běhu. Převádí se proto DRUH,
         který je jmenovitý, a co se nedá přeložit, je `jine`. */
      const KAT_PODLE_DRUHU = { 'dům': 'dum', byt: 'byt', 'areál': 'areal', 'garáž': 'garaz' };
      if (n.kategorie && n.kategorie !== 'pozemek') o.kat = KAT_PODLE_DRUHU[n.druh] || 'jine';
      prevedene.push(o);
    }
    const duvody = Object.entries(zahozeno).filter(([, v]) => v > 0).map(([k, v]) => `${k} ${v}`);
    console.error(`Zdroj ${nazev}: ${prevedene.length} nabídek z ${jedinecne.length} záznamů`
      + ` (${stranek} stránek${selhalo ? `, ${selhalo} nedojelo` : ''})`
      + (duvody.length ? `, zahozeno — ${duvody.join(', ')}` : ', nic se nezahodilo'));
    zdrojeVen.push({
      nazev, stav: stranek ? 'ok' : 'chyba', pocet: prevedene.length, cas,
      chyba: stranek ? null : 'ani jedna stránka výpisu nedojela',
      rozpadCtecky: { zaznamu: jedinecne.length, stranek, ...zahozeno },
    });
    nabidkyVen.push(...prevedene);
  }
  return { nabidky: nabidkyVen, zdroje: zdrojeVen };
}

export async function obecneZdroje(cile, nastroje) {
  const robotsMezipamet = new Map();
  const nabidkyVen = [];
  const zdrojeVen = [];
  for (const cil of (cile || [])) {
    if (!cil || !cil.url) continue;
    const zacatek = Date.now();
    const { nabidky, zalozni } = await prectiCil(cil, { ...nastroje, robotsMezipamet });
    /* Stav má týž slovník jako u ostatních zdrojů, ať se s nimi dá
       srovnávat: „ok" když něco přišlo, jinak „chyba". Diagnóza je
       vedle v `zalozni`, takže se nemusí hádat, co se stalo. */
    const z = {
      nazev: cil.jmeno, stav: nabidky.length ? 'ok' : 'chyba',
      pocet: nabidky.length, cas: new Date().toISOString(),
      chyba: nabidky.length ? null : String(zalozni.duvod || zalozni.verdikt).slice(0, 140),
      preskoceno: 0, prvniPreskocena: null, dotazu: 0, selhalo: 0,
      obecny: true, zalozni,
      ms: Date.now() - zacatek,
    };
    zdrojeVen.push(z);
    if (nabidky.length) {
      console.error(`Obecný zdroj ${cil.jmeno} přinesl ${nabidky.length} nabídek`
        + ` (${zalozni.cesta}), ${zalozni.bezMista} bez poznaného místa.`);
      nabidkyVen.push(...nabidky);
    } else {
      console.error(`Obecný zdroj ${cil.jmeno} nic nepřinesl: ${z.chyba}`);
    }
  }
  return { nabidky: nabidkyVen, zdroje: zdrojeVen };
}

/* ---------- PODRŽENÍ NABÍDEK ZDROJE, KTERÝ VYPADL ----------------- */
/* Jména zdrojů. Musí se krýt se SOURCES v main() — podle nich se hledá,
   který zdroj dnes selhal, a kdyby se rozešla, držení by mlčky přestalo
   fungovat. Hlídač scripts/test-vypadek-zdroje.mjs tu shodu měří. */
export const ZDROJ_JMENA = ['Dražby', 'OK dražby', 'SPÚ', 'Bezrealitky', 'Sreality (Apify)', 'Farmy',
  'Nabídky státu', 'ÚZSVM'];

/* A jména VŠECH zdrojů, tedy i těch, co jsou jen řádkem v registru
   (OBECNE_ZDROJE). Podle tohohle seznamu se poznává, čí nabídka je —
   a kdyby v něm obecné zdroje nebyly, vypádal by jim štítek `zdroj`
   z rozpoznání: při výpadku by se nedaly podržet (§332) a na kartě by
   neměly odznak. Nalezeno měřením, ne úvahou: po zavedení obecných
   zdrojů drželo `podrzNabidkyVypadlych` nula jejich nabídek.
   ZDROJ_JMENA zůstává šesti stahovačům, protože hlídač měří shodu
   PRÁVĚ s SOURCES — kdyby se do něj přilila i data, ta shoda by
   přestala něco tvrdit. */
export const ZDROJ_JMENA_VSE = [...new Set([...ZDROJ_JMENA,
  ...OBECNE_ZDROJE.map((z) => z.jmeno).filter(Boolean),
  /* Zdroj čtený podle předpisu je zdroj z REGISTRU, ne stahovač
     v SOURCES — patří tedy sem, stejně jako obecné zdroje. Do
     ZDROJ_JMENA ne: ten je přesně seznam stahovačů a hlídá se to. */
  ...ZAPOJENE_PREDPISY.map((h) => (PREDPISY[h] || {}).jmeno).filter(Boolean)])];

/* Štítek v popisu nabídky. Platí pro data z běhů PŘED zavedením pole
   `zdroj` — po týdnu držení už se o ně nikdo neopře, ale ten týden je
   potřebovat bude. Pořadí je pořadí rozhodování: „· OK dražby" se musí
   poznat dřív než holé „dražba". */
export const ZDROJ_PODLE_EXTRA = [
  [/·\s*OK dražby/i, 'OK dražby'],
  [/SPÚ/i, 'SPÚ'],
  [/Bezrealitky/i, 'Bezrealitky'],
  [/Farmy/i, 'Farmy'],
  [/Sreality/i, 'Sreality (Apify)'],
];

/* Hostitel v adrese nabídky. Hvězdička se nepíše: porovnává se koncovka,
   takže „www.bezrealitky.cz" i „bezrealitky.cz" padnou na totéž. Seznam
   NEMŮŽE být úplný — centrální evidence dražeb odkazuje na dražebníky
   (změřeno 2. 11.: policenm, immodrazby, naxos, elektronickedrazby,
   verejnedrazby, …), a těch je libovolně mnoho. Proto je to až třetí
   krok a za ním stojí ještě čtvrtý. */
export const ZDROJ_PODLE_HOSTU = [
  ['bezrealitky.cz', 'Bezrealitky'],
  ['okdrazby.cz', 'OK dražby'],
  ['exdrazby.cz', 'Dražby'],
  ['centralniadresa.cz', 'Dražby'],
  ['farmy.cz', 'Farmy'],
  ['spucr.cz', 'SPÚ'],
  ['nabidkamajetku.gov.cz', 'ÚZSVM'],
  ['sreality.cz', 'Sreality (Apify)'],
];

/* Kolik dnů se smí držet nabídka zdroje, který neodpovídá. Sedm dnů je
   horní mez výpadku, který se ještě dá nazvat výpadkem: delší mlčení
   znamená, že se zdroj změnil nebo skončil, a držet po něm nabídky by
   znamenalo tvrdit o nich, že existují, aniž to kdokoli ověřil. */
export const DRZENI_DNU = 7;

/**
 * Ze které služby nabídka je. Čtyři kroky, od nejspolehlivějšího:
 *   1) pole `zdroj` — stahovač si ho napsal sám (od 2. 11. 2026),
 *   2) štítek v `extra` — data z dřívějších běhů,
 *   3) hostitel v adrese,
 *   4) dražba bez jiného štítku je z centrální evidence („Dražby").
 * Čtvrtý krok je nutný: 287 nabídek SPÚ nemá adresu vůbec a dražby
 * z centrální evidence odkazují na desítky různých dražebníků, takže
 * ani seznam hostitelů je nepokryje. Vrací null, když se zdroj poznat
 * nedá — taková nabídka se nedrží, protože se neví, čí by byla.
 */
export function zdrojNabidky(o, znama) {
  if (!o) return null;
  /* `znama` jsou jména zdrojů, které v TOMHLE BĚHU existují. Bez
     něj se bere seznam zapojených plus registr obecných zdrojů.
     Proč vůbec nějaký seznam: `o.zdroj` přichází z dat, která může
     přepsat i starý běh, a štítek „nevím odkud" nesmí projít jako
     zdroj. Proč z běhu: zdroj přidaný řádkem v registru by jinak
     v zadrátovaném seznamu nebyl — a při výpadku by přišel o držení
     nabídek (§332) i o odznak na kartě. Nalezeno měřením: po zavedení
     obecných zdrojů drželo `podrzNabidkyVypadlych` nula jejich nabídek. */
  const seznam = znama || ZDROJ_JMENA_VSE;
  const jeZname = typeof seznam.has === 'function'
    ? (x) => seznam.has(x) : (x) => seznam.includes(x);
  if (o.zdroj && jeZname(o.zdroj)) return o.zdroj;
  const e = String(o.extra || '');
  for (const [vzor, jmeno] of ZDROJ_PODLE_EXTRA) if (vzor.test(e)) return jmeno;
  let host = '';
  try { host = new URL(String(o.url || '')).hostname.toLowerCase(); } catch { host = ''; }
  if (host) {
    for (const [konec, jmeno] of ZDROJ_PODLE_HOSTU) {
      if (host === konec || host.endsWith('.' + konec)) return jmeno;
    }
  }
  if ((o.type === 'drazba' || o.type === 'exekuce') && /dražba/i.test(e)) return 'Dražby';
  return null;
}

/* ------------------------------------------------------------------
   KOLIK MÍSTA DOSTANE KTERÝ ZDROJ PRODEJŮ — A ŽE SE ŽÁDNÝ NEZTRATÍ.

   Co tu bylo do 4. 11. a co to stálo. Výběr prodejů byl ruční seznam
   čtyř zdrojů, a poznával je PODLE PRÓZY V POLI `extra`:
   `/Bezrealitky/`, `/Sreality/`, `/Farmy/`, `/státní/`. Co na žádný
   z těch čtyř vzorů nesedlo, TICHE vypadlo — bez počtu, bez jména,
   bez jediného řádku v logu.

   Změřeno na běhu 41806195447: ÚZSVM mělo stav „ok", 91 nabídek, síto
   nepustilo 2 — a na webu z něj byla NULA. Jeho `extra` končí slovy
   „nabídka ÚZSVM", žádné ze čtyř slov v něm není. Týž krok sebral
   i 18 nabídek státu, jejichž `extra` nese jméno podniku bez slova
   „státní" (Lesy ČR, Správa železnic). Dohromady 107 pozemků, které se
   stáhly, prošly sítem a nikdo je neviděl.

   Proto se teď dělí podle JMÉNA ZDROJE (`zdrojNabidky`, tedy téhož
   údaje, kterým se zdroj poznává všude jinde), kdo v rozpisu není,
   bere se CELÝ, a každý zdroj má v logu řádek „vzato X z Y". Zdroj
   přidaný řádkem v registru se tím nedá ztratit — a §225 („přidání
   zdroje je řádek v registru, ne nový stahovač") platí i tady.

   Stropy zůstávají jen tam, kde byly a kde mají smysl: u zdrojů, které
   by samy zaplavily mapu. Pestrý vzorek napříč cenami (ne nejlevnější
   slivery) se dělá jen tam, kde se strop opravdu použije.
   ------------------------------------------------------------------ */
export const NEZNAMY_ZDROJ = 'neznámý zdroj';
export const PODIL_PRODEJE = new Map([
  ['Sreality (Apify)', 2500],
  ['SPÚ', 900],
]);
export const PODIL_VYCHOZI = Infinity;

export function pestryVzorek(pole, n) {
  if (!Array.isArray(pole) || !isFinite(n) || pole.length <= n) return pole || [];
  const krok = pole.length / n, ven = [];
  for (let i = 0; i < n; i++) ven.push(pole[Math.floor(i * krok)]);
  return ven;
}

export function vyberProdeje(prodeje, komu, podily = PODIL_PRODEJE, vychozi = PODIL_VYCHOZI) {
  const skupiny = new Map();
  for (const o of (prodeje || [])) {
    if (!o) continue;
    const jmeno = (komu ? komu(o) : null) || NEZNAMY_ZDROJ;
    if (!skupiny.has(jmeno)) skupiny.set(jmeno, []);
    skupiny.get(jmeno).push(o);
  }
  const vybrane = [];
  const podle = [];
  const varovani = [];
  for (const [jmeno, pole] of skupiny) {
    const strop = podily && podily.has(jmeno) ? podily.get(jmeno) : vychozi;
    let vzato = pole;
    if (pole.length > strop) {
      vzato = pestryVzorek([...pole].sort((a, b) => (a.price || 0) - (b.price || 0)), strop);
    }
    vybrane.push(...vzato);
    podle.push({ zdroj: jmeno, melo: pole.length, vzato: vzato.length, strop });
    if (jmeno === NEZNAMY_ZDROJ) {
      varovani.push(`${pole.length} prodejů nemá rozpoznaný zdroj — berou se všechny,`
        + ' ale jméno patří do registru, jinak o nich na webu nikdo nic neřekne.');
    }
  }
  podle.sort((a, b) => b.vzato - a.vzato);
  return { vybrane, podle, varovani };
}

export function hlaskyVyberu(vyber) {
  const podle = (vyber && vyber.podle) || [];
  if (!podle.length) return ['Výběr prodejů: žádný prodej k výběru.'];
  const radky = [];
  for (const p of podle) {
    radky.push(`Výběr prodejů — ${p.zdroj}: vzato ${p.vzato} z ${p.melo}`
      + (p.vzato < p.melo ? ` (strop ${p.strop}, pestrý vzorek napříč cenami)` : ''));
  }
  return radky;
}

/** O kolik dnů je `den` (YYYY-MM-DD) před `dnes`. Nečitelné → Infinity,
 *  ať se takové nabídky radši pustí, než aby se držely navždy. */
export function stariVeDnech(den, dnes) {
  const a = Date.parse(String(den || '') + 'T00:00:00Z');
  const b = Date.parse(String(dnes || '') + 'T00:00:00Z');
  if (!isFinite(a) || !isFinite(b)) return Infinity;
  return Math.round((b - a) / 86400000);
}

/**
 * Nabídky zdrojů, které dnes neodpověděly, z minulého běhu.
 *   zdroje — pole stavů z tohohle běhu (nazev, stav)
 *   cerstve — co se dnes stáhlo (kvůli dvojitému vložení)
 *   dnes   — 'YYYY-MM-DD'
 *   drive  — minulý obsah dat (volitelně; jinak se načte ze souboru)
 * Vrací { nabidky, podleZdroje: Map, pustene }.
 */
export function podrzNabidkyVypadlych(zdroje, cerstve, dnes, drive) {
  const vysledek = { nabidky: [], podleZdroje: new Map(), pustene: 0 };
  /* DRŽÍ SE JEN „chyba", a to je rozhodnutí, ne opomenutí. Je to týž
     rozdíl, který výš popisuje ODPOVEDEL: u „chyba" (a „vypnuto") se
     nedozvídáme nic, u ostatních stavů zdroj ODPOVĚDĚL a řekl nám, co
     dnes nabízí — jen toho bylo málo. Podržet nabídky zdroji, který
     odpověděl, by znamenalo postavit se proti jeho vlastní odpovědi
     a týden ukazovat nabídky, které on sám už nevede. „vypnuto" se
     nedrží z druhé strany: chybějící klíč není výpadek, ale rozhodnutí. */
  /* DRŽÍ SE „chyba" I „prazdno". „prazdno" znamená, že zdroj
     odpověděl, ale nedalo se z něj přečíst NIC — a to pravda být
     nemůže (proto na to je pojistka). Je to tedy týž případ jako
     výpadek: nabídky na cizim webu nejspíš pořád jsou, jen je neumíme
     přečíst. Ostatní stavy ze seznamu ODPOVEDEL se nedrží: tam zdroj
     řekl, co má. */
  const padle = new Set((zdroje || []).filter((z) => z
    && (z.stav === 'chyba' || z.stav === 'prazdno')).map((z) => z.nazev));
  if (!padle.size) return vysledek;
  /* Jména, která v tomhle běhu existují — včetně zdrojů přidaných
     řádkem v registru, které v zadrátovaném seznamu nejsou. */
  const znama = new Set([...ZDROJ_JMENA_VSE, ...(zdroje || []).map((z) => z && z.nazev).filter(Boolean)]);
  let stare = drive;
  if (!stare) {
    try { stare = (JSON.parse(readFileSync(OUT, 'utf8')).opportunities || []); }
    catch { stare = []; }
  }
  /* Co se dnes stáhlo, se nedoplňuje podruhé. Totožnost se bere
     z odkazu, a KDYŽ ODKAZ NENÍ, z otisku nabídky.
     Napsané to bylo jen na adresu — a to by znamenalo, že SPÚ, tedy
     549 nabídek bez jediné adresy (změřeno 2. 11.), se nedá podržet
     vůbec: ten zdroj by při výpadku zmizel celý, zatímco ostatní by
     se podržely. Otisk (druh, okres, obec, parcela, cena, výměra) je
     u takových nabídek jediné, co je napříč běhy ztotožní. */
  const klic = (o) => otiskOdkazu(o) || otiskNabidky(o);
  const uz = new Set();
  for (const o of (cerstve || [])) { const k = klic(o); if (k) uz.add(k); }
  for (const o of stare) {
    const k = o ? klic(o) : '';
    if (!k || uz.has(k)) continue;
    const z = zdrojNabidky(o, znama);
    if (!z || !padle.has(z)) continue;
    const od = o.drzeno_od || dnes;
    if (stariVeDnech(od, dnes) >= DRZENI_DNU) { vysledek.pustene++; continue; }
    vysledek.nabidky.push(Object.assign({}, o, { drzeno_od: od }));
    vysledek.podleZdroje.set(z, (vysledek.podleZdroje.get(z) || 0) + 1);
  }
  return vysledek;
}

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
/* STAVY, PŘI KTERÝCH ZDROJ ODPOVĚDĚL. „chyba" a „vypnuto" znamenají, že
   se nedozvídáme nic — nula z nich by budoucí medián jen pokazila.
   Ostatní stavy jsou skutečná měření: zdroj odpověděl a něco přinesl,
   jen toho bylo málo. */
/* „druhá cesta" PATŘÍ MEZI ODPOVĚDĚLA. Zdroj se sice nepřečetl svým
   obvyklým způsobem, ale data přinesl (§334) — a kdyby tu nestál,
   udělala by se v historii počtů děra přesně v době, kdy je nejvíc
   potřeba vidět, co se dělo. */
const ODPOVEDEL = new Set(['ok', 'pokles', 'propad', 'zahazuje', 'druhá cesta', 'jineCeny', 'jinaIdentita']);
/* Den v historii je buď číslo (zdroj byl ten den v pořádku), nebo
   `{p: počet, v: 1}` — počet ze dne, kdy byl zdroj označený za oslabený.
   Starší soubory mají jen čísla a čtou se dál. */
function denPocet(x) {
  if (typeof x === 'number') return x;
  return (x && typeof x.p === 'number') ? x.p : null;
}
function denZdravy(x) { return typeof x === 'number'; }

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
    const zapisy = klice.map((d) => dny[d][z.nazev]).filter((x) => denPocet(x) !== null);
    const zdrave = zapisy.filter(denZdravy).map(denPocet);
    if (zdrave.length >= 5) {
      const med = median(zdrave);
      if (!(med >= PRAH_SLEDOVANI)) continue;
      if (z.pocet < med * PRAH_POKLESU) {
        nalezy.push({ nazev: z.nazev, druh: 'pokles', median: med, ted: z.pocet, dnu: zdrave.length });
      }
      continue;
    }
    /* ŽÁDNÝ ZDRAVÝ DEN V OKNĚ — a to není důvod mlčet.
       Tohle je past, do které hlídač spadl na vlastních datech: označený
       zdroj se přestával zapisovat do historie, takže mu okno postupně
       vyschlo, medián se nedal spočítat a zdroj se po třiceti dnech sám
       od sebe vrátil mezi zdravé. Úbytek se stal novou normou a v souboru
       po něm nezbylo nic. („OK dražby" takhle vypadly z historie
       12. 10., pět dnů po sobě — proto se to tady opravuje.)
       Teď se označené dny zapisují taky, jen zvlášť — a když v celém okně
       není ani jeden zdravý den, hlásí se to dál jako TRVAJÍCÍ pokles. */
    const vadne = zapisy.filter((x) => !denZdravy(x)).map(denPocet);
    /* Pozor na „aspoň jeden zdravý den" jako podmínku: s jedním zdravým
       dnem a devíti označenými by medián spočítat nešlo (pět je minimum)
       a tahle větev by taky nespustila — zdroj by vyšuměl do ticha. Platí
       to tedy vždycky, když zdravých dnů není dost a označených je. */
    if (vadne.length >= 5) {
      nalezy.push({ nazev: z.nazev, druh: 'pokles', median: median(vadne), ted: z.pocet,
        dnu: vadne.length, trva: true });
    }
  }
  return nalezy;
}

/** Dnešní počty do historie; starší než HISTORIE_MAX dnů se zahodí. */
/* ---------- ZDROJ, KTERÝ JE TIŠE ROZBITÝ -------------------------
 * NALEZENO 3. 11. ČTENÍM KÓDU, ne pádem. Robot skončí chybou jen
 * tehdy, když spadne `main()`. Zdroj, který je rozbitý a ani druhá
 * cesta ho nezachrání, se obslouží „hezky": nabídky se podrží (§220),
 * do logu jde `::error::` — a běh je ZELENÝ. Takže `if: failure()`
 * nevystřelí, žádný úkol se nezaloží, a protože nabídky na webu dál
 * jsou, nevypadá nic špatně. Zdroj může být tiše rozbitý týdny.
 *
 * Počítá se, KOLIKÁTÝ BĚH V ŘADĚ je zdroj mimo pořádek. Jeden výpadek
 * je normální provoz cizího webu; tři po sobě (robot jede 4× denně,
 * tedy necelý den) už ne.
 *
 * `vypnuto` se NEPOČÍTÁ: zdroj bez klíče se ani nezkoušel, a hlásit
 * to denně by byl planý poplach, který se naučí přehlížet.
 * „druhá cesta" se taky nepočítá — to je stav, kdy zdroj FUNGUJE,
 * jen se čte jinak; právě proto ta cesta vznikla. */
export const BEHU_NEZ_SE_OZVEME = 3;
export const MIMO_SE_NEPOCITA = new Set(['ok', 'druhá cesta', 'vypnuto']);

export function zapisMimoProvoz(predchozi, ted, kdy) {
  const ven = {};
  const bylo = (predchozi && predchozi.mimoProvoz) || {};
  for (const z of (ted || [])) {
    if (!z || !z.nazev) continue;
    if (MIMO_SE_NEPOCITA.has(z.stav)) continue;      // v pořádku → počítadlo se maže
    const d = bylo[z.nazev];
    ven[z.nazev] = {
      behu: ((d && +d.behu) || 0) + 1,
      od: (d && d.od) || kdy,
      stav: z.stav,
      duvod: String((z.chyba || z.stav || '')).slice(0, 160),
    };
  }
  return ven;
}

export function dlouhoMimo(mimoProvoz, mez = BEHU_NEZ_SE_OZVEME) {
  return Object.entries(mimoProvoz || {})
    .filter(([, d]) => d && +d.behu >= mez)
    .map(([nazev, d]) => ({ nazev, behu: +d.behu, od: d.od, stav: d.stav, duvod: d.duvod }))
    .sort((a, b) => b.behu - a.behu);
}

/* OZVAT SE, ALE NE KAŽDÝCH ŠEST HODIN TOTÉŽ.
 *
 * NALEZENO NAOSTRO 4. 11.: hlídka se u Dražeb ozvala poprvé při třetím
 * běhu v řadě — správně — a pak při čtvrtém, pátém a šestém znovu,
 * protože počítadlo roste a mez je pořád překročená. Úkol v repozitáři
 * se přitom zakládá jeden (ohlas-selhani umí doplňovat), takže ten
 * šestý červený běh už nikomu nic neřekl. A červená, která svítí každý
 * den ze stejného důvodu, je horší než žádná: PŘESTANE SE ČÍST, a pak
 * v ní zapadne i poplach, který je nový.
 *
 * Hlásí se proto na MEZNÍCÍCH: při 3. běhu, pak 6., 12., 24. — tedy
 * jednou, a potom se to připomene vždy, až když je ten úbytek dvakrát
 * tak dlouhý. Mezi mezníky hlídka nemlčí, jen nekončí červeně: vypíše,
 * kdo je mimo pořádek a odkdy. Tichý zdroj je pořád vidět. */
export function jeMeznik(behu, mez = BEHU_NEZ_SE_OZVEME) {
  const n = Number(behu) || 0;
  if (!(n >= mez) || !(mez > 0)) return false;
  let m = mez;
  while (m < n) m *= 2;
  return m === n;
}

export function kOhlaseni(mimoProvoz, mez = BEHU_NEZ_SE_OZVEME) {
  return dlouhoMimo(mimoProvoz, mez).filter((z) => jeMeznik(z.behu, mez));
}

export function dalsiMeznik(behu, mez = BEHU_NEZ_SE_OZVEME) {
  const n = Number(behu) || 0;
  let m = Math.max(mez, 1);
  while (m <= n) m *= 2;
  return m;
}

export function zapisDoHistorie(historie, ted, dnes, mediany) {
  const dny = Object.assign({}, (historie && historie.dny) || {});
  const ceny = Object.assign({}, (historie && historie.ceny) || {});
  const dnesni = {};
  /* ZAPISUJE SE KAŽDÁ SKUTEČNÁ ODPOVĚĎ, ne jen ta bezvadná. Dřív tu
     stála podmínka `z.stav === 'ok'` — a protože hlídače běží PŘED
     tímhle zápisem a stav si přepíšou, zdroj označený za oslabený
     z historie vypadl. Tedy přesně ten, o kterém je záznam potřeba.
     Naměřeno na ostrých datech: „OK dražby" dostaly 12. 10. stav
     „pokles" a od toho dne v historii nejsou — pět dnů ztracených
     měření. Den s označeným zdrojem se zapíše s příznakem, aby se do
     mediánu nepočítal a úbytek se nestal novou normou. */
  for (const z of (ted || [])) {
    if (!z || !z.nazev || !ODPOVEDEL.has(z.stav)) continue;
    const pocet = +z.pocet || 0;
    if (!pocet) continue;
    dnesni[z.nazev] = z.stav === 'ok' ? pocet : { p: pocet, v: 1 };
  }
  dny[dnes] = dnesni;
  const mimoProvoz = zapisMimoProvoz(historie, ted, dnes);
  /* CENY SE ZAPISUJÍ JEN ZA ZDROJ V POŘÁDKU. Den s označenou cenou by
     se jinak za pár dnů stal novou normou a hlídač by sám sebe
     odzbrojil — táž lekce jako u počtů výš. */
  const cenyDnes = {};
  const vPoradku = new Set((ted || []).filter((z) => z && z.stav === 'ok').map((z) => z.nazev));
  for (const nazev of Object.keys(mediany || {})) {
    if (vPoradku.has(nazev) && mediany[nazev] > 0) cenyDnes[nazev] = mediany[nazev];
  }
  if (Object.keys(cenyDnes).length) ceny[dnes] = cenyDnes;
  for (const mapa of [dny, ceny]) {
    const k = Object.keys(mapa).sort();
    for (const stary of k.slice(0, Math.max(0, k.length - HISTORIE_MAX))) delete mapa[stary];
  }
  return { verze: 4, dny, ceny, mimoProvoz };
}

/* ZÁSTUPNÁ CENA. Inzerent, který cenu nechce psát, ji nenechá prázdnou —
 * napíše číslo, které nic neznamená: 1 Kč, 1 000, 5 000. Dolní mez 5 000 Kč
 * v valid() takový inzerát pustí dál (je přesně na ní) a web pak tvrdí věci,
 * které nejsou pravda. Naměřeno na ostrých datech: zasíťovaný stavební
 * pozemek 751 m² v Jizerním Vtelnu stál „5 000 Kč", tedy 6,7 Kč/m², zatímco
 * pátý percentil stavebních pozemků je 239 Kč/m² a medián 2 844. Jeden
 * inzerát, ale ten nejvíc vidět: řadíme podle výhodnosti, takže sedí první
 * na mapě, dostane verdikt „výhodná cena" a táhne dolů medián svého místa.
 *
 * Práh se nehádá, počítá se z vlastních dat: pod pětinu pátého percentilu
 * svého druhu. Pevné číslo by stárlo a u orné půdy (medián 45 Kč/m²) by
 * znamenalo něco úplně jiného než u stavebních parcel.
 *
 * Dvě pojistky proti tomu, aby síto začalo žrát pravdu:
 *   · druh s málo kusy se nepočítá (percentil z dvaceti čísel je náhoda),
 *   · a kdyby mělo padnout víc než 1 % druhu, je špatně rozdělení, ne
 *     inzeráty — tehdy se nic nevyhodí a jen se to nahlásí.
 */
export const MIN_VZORKU_DRUHU = 60;
export const PODIL_P5 = 0.2;
export const STROP_VYHOZENI = 0.01;

export function bezZastupnychCen(nabidky) {
  const skupiny = {};
  for (const o of (nabidky || [])) {
    if (!o || !(o.area > 0) || !(o.price > 0)) continue;
    (skupiny[o.druh || '?'] || (skupiny[o.druh || '?'] = [])).push(o.price / o.area);
  }
  const prahy = {};
  for (const druh in skupiny) {
    const v = skupiny[druh].slice().sort((a, b) => a - b);
    if (v.length < MIN_VZORKU_DRUHU) continue;
    const p5 = v[Math.floor(0.05 * (v.length - 1))];
    if (!(p5 > 0)) continue;
    prahy[druh] = p5 * PODIL_P5;
  }
  const podezrele = [];
  for (const o of (nabidky || [])) {
    if (!o || !(o.area > 0) || !(o.price > 0)) continue;
    const prah = prahy[o.druh || '?'];
    if (prah && o.price / o.area < prah) podezrele.push(o);
  }
  /* Pojistka: moc nálezů v jednom druhu = chyba v prahu, ne v inzerátech. */
  const prilis = new Set();
  for (const druh in prahy) {
    const kolik = podezrele.filter((o) => (o.druh || '?') === druh).length;
    if (kolik > Math.max(1, Math.floor(skupiny[druh].length * STROP_VYHOZENI))) prilis.add(druh);
  }
  const vyhozeno = podezrele.filter((o) => !prilis.has(o.druh || '?'));
  const ven = new Set(vyhozeno);
  return {
    cisto: (nabidky || []).filter((o) => !ven.has(o)),
    vyhozeno,
    neduveryhodnyDruh: [...prilis],
    prahy,
  };
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

/* TICHÁ ZMĚNA CENY U ZDROJE
 * =================================================================
 * Všechna dosavadní síta hlídají POČET: nula, propad na polovinu, víc
 * zahozeného než přineseného. Je tu ale změna, kterou žádné z nich
 * nevidí: zdroj vrátí stejně nabídek, stejně jich projde — ale CENY
 * budou jiné. Stačí, aby se na cizím webu posunul selektor z celkové
 * ceny na cenu za metr (nebo obráceně), aby se výměra začala udávat
 * v hektarech, nebo aby se do ceny připletlo číslo vedle.
 *
 * Pro TENHLE web je to ta nejdražší možná vada: řadí se podle
 * výhodnosti, verdikty („výhodná cena") a mapa se počítají z Kč/m²,
 * takže špatná cena nepokazí jeden řádek — pokazí celé doporučení.
 *
 * MĚŘENO na ostrých datech 3. 11. (1 996 nabídek): medián Kč/m² je
 * u každého zdroje charakteristický a navzájem velmi různý —
 * SPÚ 9, Farmy 42, Bezrealitky 50, OK dražby 75, Dražby 1 659.
 * Posun jednotky by u Bezrealitek znamenal skok z 50 na tisíce;
 * záměna celkové ceny za cenu na metr je faktor ~1 000 (medián
 * výměry), hektary 10 000. Takové skoky jsou nepřehlédnutelné —
 * jen se na ně do dneška nikdo nekoukal.
 *
 * PROČ AŽ OD STA NABÍDEK. Medián malého vzorku kolísá sám od sebe,
 * a to u tohohle webu silně: rozpětí Bezrealitek je p10 28 až
 * p90 2 373 Kč/m², tedy 85×. Při dvaceti kusech by se medián mohl
 * houpat v řádu jednotek, při stovce je v pásu p40–p60, což je
 * u těchto dat asi 1,5×. Mez PRAH_CEN_KUSU = 100 je tedy
 * ZMĚŘENÁ, ne odhadnutá — a pokrývá to, na čem záleží: Bezrealitky
 * a SPÚ nesou 1 910 z 1 966 nabídek s cenou, tedy 97 %.
 *
 * PROČ FAKTOR 4. Nad stem kusů se vzorkováním přes 1,5× nedostaneš,
 * skutečné vady začínají u 1 000×. Čtyřka je mezi tím s velkou
 * rezervou na obě strany: trh ani změna skladby nabídky se za den
 * nečtyřnásobí.
 *
 * SROVNÁVÁ SE PROTI MEDIÁNU MEDIÁNŮ, ne proti včerejšku: jeden divný
 * den se tak nestane referencí. A zapisuje se jen den, kdy byl zdroj
 * v pořádku — stejná lekce jako u počtů (§?): kdyby se zapisoval i
 * den s označenou cenou, vada by si za pár dnů udělala novou normu.
 * ================================================================= */
/* PŘEZNAČENÁ IDENTITA: zdroj změnil TVAR dat, ne jejich množství
 * ===================================================================
 * CO TENHLE HLÍDAČ VIDÍ, A OSTATNÍ NE. Dnešní hlídače měří POČTY
 * (`prazdno`, `propad`, `pokles`, `zahazuje`) a CENY (`jineCeny`).
 * Zdroj ale může poslat stejně nabídek za stejné ceny — a přitom
 * přejmenovat obce, poslat výměru v jiné jednotce nebo jinak označit
 * parcely. Pak se s včerejškem nespáruje ani jedna nabídka: ani
 * odkazem, ani otiskem s cenou, ani bez ceny (viz prirazPrvniVideni).
 * Všechny dosavadní hlídače zůstanou zelené a celý zdroj naskočí jako
 * „nové" — v řezu novinek, v RSS i v řazení podle data.
 *
 * TOHLE REPOZITÁŘ UŽ ZNÁ, ale jen pro jeden den: scripts/novinky-rez.mjs
 * vylučuje z novinek celý PRVNÍ DEN EVIDENCE, protože tehdy `first_seen`
 * naskočilo 1 600 nabídkám, které na trhu byly dávno. Přeznačení
 * identity je týž jev kterýkoli pozdější den a u jednoho zdroje.
 *
 * MEZE JSOU Z MĚŘENÍ, ne z odhadu. Na ostrých datech 3. 11. 2026 byl
 * denní podíl nespárovaných: Bezrealitky 0,8 % (13 z 1 627), SPÚ 0 %
 * (0 z 282), OK dražby 1,5 % (1 z 65), Dražby 5 % (1 z 20), Farmy 0 %
 * (0 z 9). Mez 70 % je tedy čtrnáctinásobek nejvyššího naměřeného
 * kolísání — a dosáhnout jí jinak než změnou tvaru dat prakticky nelze.
 *
 * Malé zdroje se nepočítají: z devíti nabídek mohou být klidně všechny
 * nové, a nic to neznamená. Mez 50 kusů pokrývá 1 974 z 2 003 nabídek,
 * tedy 98,6 % (změřeno 3. 11.).
 *
 * A POZOR NA PRVNÍ BĚH. Zdroj, který včera neexistoval, má 100 %
 * nespárovaných vždycky — to není závada, to je první den. Proto se
 * vyžaduje, aby zdroj měl dost nabídek i VČERA.
 */
export const PRAH_TOTOZNOSTI = 0.7;
export const PRAH_TOTOZNOSTI_KUSU = 50;

/**
 * Zdroje, u kterých se dnes nespárovalo skoro nic.
 * `podleZdroje` je z prirazPrvniVideni, `drive` jsou včerejší nabídky.
 */
export function porovnejTotoznost(podleZdroje, drive, znama) {
  const vcera = new Map();
  for (const o of (drive || [])) {
    const z = zdrojNabidky(o, znama);
    if (!z) continue;
    vcera.set(z, (vcera.get(z) || 0) + 1);
  }
  const nalezy = [];
  for (const nazev of Object.keys(podleZdroje || {})) {
    const u = podleZdroje[nazev] || {};
    const celkem = +u.celkem || 0;
    const novych = +u.novych || 0;
    if (celkem < PRAH_TOTOZNOSTI_KUSU) continue;
    if ((vcera.get(nazev) || 0) < PRAH_TOTOZNOSTI_KUSU) continue;
    const podil = novych / celkem;
    if (podil >= PRAH_TOTOZNOSTI) {
      nalezy.push({ nazev, druh: 'jinaIdentita', celkem, novych,
        podil: Math.round(podil * 100) / 100, vcera: vcera.get(nazev) || 0 });
    }
  }
  return nalezy;
}

export const PRAH_CEN_KUSU = 100;
export const PRAH_CEN = 4;
export const DNU_CEN = 3;

/** Medián Kč/m² na zdroj; zdroje s málo kusy se nepočítají vůbec.
 *
 * POČÍTÁ SE JEN Z POZEMKŮ, A TO JE TA PODSTATNÁ ČÁST.
 * Hlídač porovnává dnešní medián zdroje s mediánem jeho vlastní
 * historie. Ta historie je POZEMKOVÁ — vznikla ve dnech, kdy žádný
 * zdroj nic jiného nevozil. Jakmile 7. 11. začaly z Bezrealitek
 * chodit i domy a byty, vyskočil medián z 60 na 2 685 Kč/m² a hlídač
 * zdroj zavřel jako „přemalovaný" (44,9×). Měl pravdu v tom, co
 * měřil, ale měřil jablka proti hruškám: byt za 80 000 Kč/m² není
 * pokažené pole, je to byt.
 *
 * Vzorek se proto omezuje na pozemky — tedy na totéž, z čeho je
 * historie. Nepozemky tím o ochranu nepřijdou: každá nabídka zvlášť
 * dál prochází sítem (`cenaZaMetrPrilisVysoka` a spol.), jen už se
 * s nimi nepočítá souhrnné číslo, které by pro ně nic neznamenalo. */
export function medianyCenZdroju(nabidky, znama) {
  const podle = new Map();
  for (const o of (nabidky || [])) {
    if (!o || !(o.price > 0) || !(o.area > 0)) continue;
    if (o.kat && o.kat !== 'pozemek') continue;
    const z = zdrojNabidky(o, znama);
    if (!z) continue;
    if (!podle.has(z)) podle.set(z, []);
    podle.get(z).push(o.price / o.area);
  }
  const ven = {};
  for (const [z, v] of podle) {
    if (v.length < PRAH_CEN_KUSU) continue;
    v.sort((a, b) => a - b);
    ven[z] = v[Math.floor(v.length / 2)];
  }
  return ven;
}

/** Dnešní medián ceny proti mediánu mediánů z historie. */
export function porovnejCeny(historie, dnesni, dnes) {
  const ceny = (historie && historie.ceny) || {};
  const klice = Object.keys(ceny).filter((d) => d < dnes).sort().slice(-DNU_HISTORIE);
  const nalezy = [];
  for (const nazev of Object.keys(dnesni || {})) {
    const rada = klice.map((d) => (ceny[d] || {})[nazev])
      .filter((x) => typeof x === 'number' && x > 0).sort((a, b) => a - b);
    /* Z jednoho nebo dvou dnů se medián nepočítá — u nového zdroje
       by to byl náhodný den proti dnešku. */
    if (rada.length < DNU_CEN) continue;
    const drive = rada[Math.floor(rada.length / 2)];
    const ted = dnesni[nazev];
    if (!(drive > 0) || !(ted > 0)) continue;
    const pomer = ted > drive ? ted / drive : drive / ted;
    if (pomer >= PRAH_CEN) nalezy.push({ nazev, druh: 'jineCeny', drive, ted, pomer });
  }
  return nalezy;
}

/* ÚZSVM — největší státní prodejce nemovitostí.
 *
 * Čte se POST na `/api/Property/List` s filtrem na kategorii
 * „Pozemky" (13). Jak se k té adrese i k tělu dotazu přišlo, stojí
 * v scripts/cti-uzsvm.mjs; krátce: web je aplikace, v HTML nabídky
 * nejsou, takže se vykreslil prohlížečem a odposlechlo se, odkud si
 * obsah bere. Robots.txt web nemá, čtení tedy nezakazuje.
 *
 * Strany se berou po stovce a konec pozná `PageCount`. Strop stran je
 * v čtečce — smyčka, kterou zastaví jen cizí server, je past. */
async function fetchUzsvm() {
  const zahozeno = {};
  const out = [];
  let celkem = null;

  /* JEDNA KATEGORIE, PO STRANÁCH. Vrací první odpověď — v ní přijde
     číselník `Categories`, ze kterého se pozná, co dál. */
  async function projdiKategorii(kategorie, jmeno) {
    let prvni = null;
    for (let strana = 1; strana <= UZ.STROP_STRAN; strana++) {
      let data;
      try {
        const r = await stahni(UZ.API, {
          method: 'POST',
          body: UZ.dotaz(strana, UZ.NA_STRANU, kategorie),
          headers: { ...UA, 'content-type': 'application/json', accept: 'application/json' },
        });
        if (!r.ok) {
          console.error(`ÚZSVM ${jmeno} strana ${strana}: server odpověděl HTTP ${r.status},`
            + ' dál se nejde.');
          break;
        }
        data = await r.json();
      } catch (e) {
        console.error(`ÚZSVM ${jmeno} strana ${strana}: nešlo přečíst`
          + ` — ${String((e && e.message) || e).slice(0, 140)}`);
        break;
      }
      if (prvni === null) prvni = data;
      const { nabidky } = UZ.nabidkyZOdpovedi(data, STAT.vymeraZPopisu, STAT.druhZPopisu,
        zahozeno, STAT.zminujeMetry, parseKategorie);
      for (const o of nabidky) {
        out.push({
          ...o,
          zdroj: 'ÚZSVM',
        });
      }
      const stran = Number(data.PageCount) || 1;
      if (strana >= stran || !(Array.isArray(data.Properties) && data.Properties.length)) break;
    }
    return prvni;
  }

  /* POZEMKY NAPŘED, a ne kvůli abecedě: je jich nejvíc (276 z 367) a
     v jejich odpovědi přijde číselník, podle kterého se teprve pozná,
     které DALŠÍ kategorie jsou nemovitosti. Rodičovské id filtrovat
     neumí (změřeno 5. 11.: `CategoryId: 10` vrátí všech 729 věcí včetně
     automobilů), takže se listy berou po jednom. */
  const prvni = await projdiKategorii(UZ.KATEGORIE_POZEMKY, 'Pozemky');
  celkem = UZ.pocetVKategorii(prvni);
  const dalsi = UZ.kategorieNemovitosti(prvni)
    .filter((k) => Number(k.id) !== Number(UZ.KATEGORIE_POZEMKY));
  if (!dalsi.length) {
    console.error('ÚZSVM: číselník nedal žádnou další kategorii nemovitostí —'
      + ' berou se jen pozemky. Když to vydrží, změnil zdroj tvar číselníku'
      + ' (čeká se `Categories[].p02IsRealty`).');
  }
  for (const k of dalsi) {
    await projdiKategorii(k.id, k.nazev || ('id ' + k.id));
  }
  const z = Object.entries(zahozeno)
    .filter(([k, n]) => k !== 'zaznamu' && k !== 'ukazky' && typeof n === 'number' && n > 0)
    .map(([k, n]) => k + ' ' + n);
  /* HLÁŠKA NESMÍ POČÍTAT NEPOZEMEK JAKO POZEMEK. Stálo tu
     `o.kat || 'pozemek'`, takže nabídka, u které zdroj VÝSLOVNĚ řekl
     „tohle pozemek není" (`_neniPozemek`) a kategorii neurčil, se
     v logu objevila jako pozemek. Naměřeno 5. 11. v ostrém běhu:
     log napsal `{"pozemek":149}`, přičemž u 30 z nich zdroj řekl
     opak — a mě to při hledání příčiny poslalo na dvacet minut
     špatným směrem. Hláška, která lže, je horší než žádná: podle
     žádné se člověk podívá do dat, podle lživé uvěří.

     „neurčeno" není totéž co „jine": `jine` je rozhodnutí robota
     o kus dál, tohle je stav, v jakém nabídka odešla ze čtečky. */
  const podleKat = pocetPodleKategorie(out);
  console.error(`Zdroj ÚZSVM: ${out.length} nemovitostí z ${zahozeno.zaznamu || 0} záznamů`
    + (celkem ? ` (číselník hlásí ${celkem} v kategorii Pozemky` : '')
    + (dalsi.length ? `, dalších kategorií nemovitostí ${dalsi.length}: `
      + dalsi.map((k) => `${k.nazev} ${k.pocet}`).join(', ') + ')' : (celkem ? ')' : ''))
    + `, podle kategorie: ${JSON.stringify(podleKat)}`
    + (z.length ? `, zahozeno — ${z.join(', ')}` : ', nic se nezahodilo'));
  /* A ukázka ke každému důvodu: bez ní se nedá rozhodnout, jestli je
     vada v datech, nebo v našem čtení (§366). */
  for (const [k, u] of Object.entries((zahozeno.ukazky || {}))) console.error(`  · ${k}: ${u}`);
  return out;
}

/* HLÁŠKA O STAVU ZDROJE. Jedna věta na zdroj do logu běhu — a musí
 * odpovídat tomu, co se stalo.
 *
 * NALEZENO MĚŘENÍM 4. 11. v ostrém běhu: v logu stálo „Zdroj Dražby
 * SELHAL: null". Nic nezselhalo — zdroj odpověděl a přinesl 45 nabídek,
 * jen je to proti mediánu 81 úbytek, tedy stav „pokles". A „null" jako
 * příčina je přesně to, co u jiných hlášek zakazuje
 * test-chybova-hlaska.mjs: hlášení bez příčiny nikam nevede. Rozlišení
 * „odpověděl / neodpověděl" bylo v kódu už od §332 (ODPOVEDEL), jen se
 * na něj tahle jedna věta neptala.
 *
 * Vytažené z main() do funkce schválně: věta, která o sobě tvrdí, že
 * nelže, se musí dát změřit bez sítě. */
export function hlaskaZdroje(z) {
  const nazev = (z && z.nazev) || '?';
  const stav = (z && z.stav) || 'chyba';
  if (stav === 'ok') return { kam: 'log', text: `Zdroj ${nazev}: ${z.pocet} záznamů.` };
  /* I u vypnutého musí stát ČÍM. Hlídač to chytil hned: zdroj
     vypnutý bez uvedené příčiny vypsal „vypnutý (undefined)". */
  if (stav === 'vypnuto') {
    return { kam: 'log', text: `Zdroj ${nazev}: vypnutý (${z.chyba || 'bez uvedené příčiny'}).` };
  }
  if (ODPOVEDEL.has(stav)) {
    return { kam: 'chyba', text: `Zdroj ${nazev} ODPOVĚDĚL, ale není v pořádku: stav „${stav}",`
      + ` ${z.pocet} záznamů, zahozeno ${z.preskoceno || 0}.`
      + ' Příčina stojí v hlášce POZOR výš; pád to není.' };
  }
  if (stav === 'neuplne') {
    return { kam: 'chyba', text: `Zdroj ${nazev}: SKEN NEBYL ÚPLNÝ, ${z.pocet} záznamů se`
      + ' proto nebere za měření. Kolik dotazů chybělo, stojí v hlášce POZOR výš.' };
  }
  if (stav === 'prazdno') {
    return { kam: 'chyba', text: `Zdroj ${nazev} NEVRÁTIL NIC: odpověď přišla, ale nebyla v ní`
      + ' ani jedna nabídka — nejčastěji se tomu zdroji změnil tvar dat.' };
  }
  return { kam: 'chyba', text: `Zdroj ${nazev} SELHAL: ${(z && z.chyba) || `bez udané příčiny (stav „${stav}")`}` };
}

async function fetchDrazby() {
  const year = new Date().getFullYear();
  const out = [];
  /* POČÍTADLO ZAHOZENÝCH. Nalezeno měřením 4. 11.: zdroj přinesl 45
     nabídek proti mediánu 81 za 22 dnů a hlídač se ozval „pomalý
     úbytek — podívejte se, jestli parser nepřestal část stránky čist".
     Podívat se ale nebylo kam: `preskoceno` bylo 0, protože to počítá
     jen nabídky, na kterých čtení SPADLO. Položky, které čtečka zahodí
     schválně (nezveřejněná dražba, bez obce, bez ceny, bez výměry), se
     nepočítaly nikde — takže na otázku „je úbytek u nich, nebo u nás"
     nešlo odpovědět vůbec. Tím samým číslem už se jednou měřil nový
     zdroj z otevřených dat (§363) a ten rozdíl je pokaždé ten, který
     rozhoduje: na datech nemám co opravovat, na sobě ano. */
  const zahozeno = { drazeb: 0, polozek: 0, neuverejneno: 0, bezPozemku: 0,
    jenBudovaVDobrovolne: 0, bezMista: 0, bezCeny: 0, bezVymery: 0 };
  for (const y of [year, year - 1]) {
    let data;
    try {
      const r = await stahni(`https://cevd.gov.cz/opendata/drazby/drazby_${y}.json`, { headers: UA });
      /* I TOHLE SE MUSÍ OZVAT. Když oba roky vrátí chybu, funkce vrátí
         prázdno a běh ho označí za „prazdno" — ale v logu nestálo ani
         slovo o tom, že se vůbec něco nepodařilo stáhnout. */
      if (!r.ok) { console.error(`Dražby ${y}: server odpověděl HTTP ${r.status}, rok se vynechává.`); continue; }
      data = await r.json();
    } catch (e) {
      console.error(`Dražby ${y}: nešlo přečíst — ${String((e && e.message) || e).slice(0, 140)}`);
      continue;
    }
    const arr = Array.isArray(data) ? data : (Object.values(data).find(Array.isArray) || []);
    for (const rec of arr) out.push(...nabidkyZDrazby(rec, zahozeno));
  }
  const z = Object.entries(zahozeno)
    .filter(([k, n]) => n > 0 && k !== 'drazeb' && k !== 'polozek')
    .map(([k, n]) => k + ' ' + n);
  console.error(`Zdroj Dražby: ${out.length} pozemků z ${zahozeno.drazeb} dražeb`
    + ` (${zahozeno.polozek} předmětů)`
    + (z.length ? `, zahozeno — ${z.join(', ')}` : ', nic se nezahodilo'));
  zapisRozpad('Dražby', zahozeno);
  return out;
}

/* Jeden záznam dražby z otevřených dat CEVD na nabídky pro web.
 *
 * Oddělené od stahování schválně: parsování je to, co se dá splést
 * tiše, a bez sítě se dá vyzkoušet jedině tak, že se mu dá záznam
 * přímo. Právě tudy prošla chyba, kvůli které měly dražby z tohohle
 * zdroje nesmyslnou cenu za metr (viz komentář u součtu výměr níž). */
export function nabidkyZDrazby(rec, zahozeno) {
  const out = [];
  /* Počítadlo je nepovinné: čtečka se dá pozvat i bez něj (tak ji volají
     zkoušky) a pak se jen nic nezapisuje. */
  const pocti = (k) => { if (zahozeno) zahozeno[k] = (zahozeno[k] || 0) + 1; };
  pocti('drazeb');
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
        pocti('polozek');
        if (p.stavPredmetu !== 'Uveřejněno') { pocti('neuverejneno'); continue; } // jen aktivní/nadcházející
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
        /* BYT A STAVBA SE UŽ NEZAHAZUJÍ — od 5. 11. nese web všechny
           nemovitosti. Dřív tu stály dvě podmínky, obě správné pro web
           jen o pozemcích, a obě teď pryč:

             if (!vn.pozemek) continue;                  ← bez pozemku nic
             if (budova && !nucena) { budovaPryc++; … }  ← budovy jen z exekucí

           ZMĚŘENO 5. 11. z Actions na `drazby_2026.json`, jak byt a
           stavba v těch datech vypadají:

             "jednotka": { cisloJednotky, typJednotky,
                           zpusobVyuzitiJednotky: "byt",
                           podilNaSpolecnychCastech,
                           stavba: { castObce, cisloPopisneEvidencni,
                                     typStavby: "rodinný dům" } }
             "stavba":   { castObce, cisloPopisneEvidencni,
                           typStavby: "budova s číslem popisným" }

           Dvě věci z toho měření jsou důležité:
           · `katastralniUzemi` sedí na `vecNemovita`, NE uvnitř
             `pozemek` — takže obec i okres u bytu bez pozemku máme
             (čte se `vn.katastralniUzemi` o kus níž);
           · VÝMĚRU jednotka nenese vůbec. Zůstává tedy jen ta
             z názvu položky, a když ani ta není, platí dosavadní
             pravidlo (dobrovolná dražba bez výměry se nebere). */
        let cand = null, candBudova = false, soucetVymer = 0, pozemku = 0;
        for (const v of (p.veci || [])) {
          const vn = v.vecNemovita;
          if (!vn || !(vn.pozemek || vn.jednotka || vn.stavba)) continue;
          const budova = !!(vn.jednotka || vn.stavba);
          const vym = Number((vn.pozemek && vn.pozemek.vymera)) || 0;
          if (vym > 0) { soucetVymer += vym; pozemku++; }
          /* Zástupce pro obec, okres, druh a souřadnice: čistý pozemek má
             přednost před tím se stavbou, jinak první v pořadí. */
          if (!cand || (candBudova && !budova)) { cand = { vn, v }; candBudova = budova; }
        }
        if (!cand) { pocti('bezNemovitosti'); continue; }
        const { vn, v } = cand;
        const ku = vn.katastralniUzemi || {};
        const okres = ku.okres, place = ku.obec || ku.nazev;
        if (!okres || !place) { pocti('bezMista'); continue; }
        const area = soucetVymer || parseArea(v.nazev) || parseArea(p.nazevPredmetu);
        const price = (p.vyvolavaciCena && p.vyvolavaciCena.castka && p.vyvolavaciCena.castka.vyse)
          || (p.obvyklaCena && p.obvyklaCena.vyse) || 0;
        if (!price) { pocti('bezCeny'); continue; }
        if (!area && !nucena) { pocti('bezVymery'); continue; } // dobrovolná bez výměry vynecháme; u exekucí výměra často chybí
        /* `vn.pozemek` UŽ NEMUSÍ BÝT. Byt v exekuci ho nemá vůbec, takže
           každé jeho použití je od teď podmíněné — jinak by na prvním
           bytě spadlo celé stahování dražeb. */
        const pz = vn.pozemek || null;
        /* KATEGORIE ZE STRUKTURY DAT, NE Z HÁDÁNÍ. Zdroj ji říká
           přesněji než jakýkoli text: jednotka je byt, u samostatné
           stavby se zkusí `typStavby` („rodinný dům", „budova s číslem
           popisným") a až pak volný text. Když ani to nic neřekne, je
           to „jiná nemovitost" — budova se nesmí stát pozemkem, protože
           by se u ní počítala obvyklá cena za m² pozemku.
           Věc, která má jen pozemek, kategorii nenese: pozemek je
           výchozí a v datech by to byly jen kilobajty navíc. */
        let kat = '';
        if (vn.jednotka) kat = 'byt';
        else if (vn.stavba) {
          const txtStavby = [vn.stavba.typStavby, vn.stavba.zpusobVyuzitiStavby,
            v.nazev, p.nazevPredmetu].filter(Boolean).join(' ');
          const z = parseKategorie(txtStavby, [place, okres]);
          kat = (z && z !== PKKategorie.VYCHOZI) ? z : 'jine';
        }
        /* DRUH U NEPOZEMKU JE DRUH STAVBY, A ŘÍKÁ HO ZDROJ. Dřív se sem
           dosazovalo rozpoznávání druhu z textu, které při neúspěchu
           vrací „pozemek" — u bytu by tedy v druhu stálo „pozemek".
           (Jméno té funkce se tu schválně nepíše se závorkou: hlídač
           v test-druh.mjs prochází kód a u KAŽDÉHO jejího volání
           vyžaduje předaná jména míst, takže by ho zmínka v komentáři
           shodila. Stalo se to při psaní téhle změny.) */
        const druhBase = pz
          ? (pz.druhPozemku || parseDruh(v.nazev, [place, okres]))
          : ((vn.jednotka && (vn.jednotka.zpusobVyuzitiJednotky || vn.jednotka.typJednotky))
            || (vn.stavba && (vn.stavba.typStavby || vn.stavba.zpusobVyuzitiStavby))
            || 'nemovitost');
        out.push({
          place, okres, type,
          ...(kat ? { kat } : {}),
          parcel: (pz && pozemku <= 1) ? String(pz.parcelniCislo || '—').slice(0, 40) : '—',
          druh: normDruh(pz && candBudova ? (druhBase + ' se stavbou') : druhBase),
          area: area ? Math.round(area) : null, price: Math.round(price),
          extra: (nucena ? 'nucená dražba' : 'dražba') + (datum ? ' ' + datum : ''),
          zdroj: 'Dražby',
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
/* NEJVYŠŠÍ ID, KTERÉ UŽ MÁME V DATECH.
   Okno skenu začíná u nejvyššího ID z homepage. Když se homepage
   nenačte nebo se jí změní podoba odkazů, spadne to na pevné číslo
   v kódu — a to stárne: dnes jsou dražby u 29 255, zatímco v kódu
   stálo 27 100. Sken by se tím posunul o dva tisíce ID vedle a nenašel
   skoro nic. Dolní hranici proto drží i to, co už v datech leží: ta se
   stárnout nemůže, protože se každý běh posouvá s nimi. */
export function nejvyssiOkdZDat(data) {
  let max = 0;
  for (const o of ((data && data.opportunities) || [])) {
    const m = /okdrazby\.cz\/drazba\/(\d+)/.exec(o && o.url || '');
    if (m && +m[1] > max) max = +m[1];
  }
  return max;
}
/* A DOLNÍ KONEC OKNA. Sken jde od nejvyššího ID o tři tisíce dolů — jenže
   to okno se posouvá s tím, jak dražeb přibývá, takže dražba, která je
   aktivní dlouho, z něj jednou vypadne. Zmizela by beze slova: nebyla by
   v odpovědi, nic by se nepokazilo, jen by jí ubylo. Naměřeno na ostrých
   datech: nejstarší aktivní dražba má ID 27 070 při nejvyšším 29 255,
   tedy 2 185 — pod stropem, ale ne o moc.
   Okno proto sahá i pod to, co už v datech máme. */
export function nejnizsiOkdZDat(data) {
  let min = 0;
  for (const o of ((data && data.opportunities) || [])) {
    const m = /okdrazby\.cz\/drazba\/(\d+)/.exec(o && o.url || '');
    if (m && (!min || +m[1] < min)) min = +m[1];
  }
  return min;
}
/* Kam až sken sahá. Strop je pojistka proti jedinému starému záznamu,
   který by jinak okno natahoval donekonečna — a s ním i dobu běhu. */
export const OKD_OKNO = 3000;
export const OKD_OKNO_STROP = 6000;
export function oknoOkd(maxId, nejnizsiVDatech) {
  const zaklad = maxId - OKD_OKNO;
  const podleDat = nejnizsiVDatech > 0 ? nejnizsiVDatech - 50 : zaklad;
  return Math.max(maxId - OKD_OKNO_STROP, Math.min(zaklad, podleDat));
}
async function fetchOkdrazby() {
  // 1) nejvyšší ID z homepage (okno pro sken)
  let maxId = 27100;
  try { maxId = Math.max(maxId, nejvyssiOkdZDat(JSON.parse(readFileSync(OUT, 'utf8')))); } catch { /* první běh */ }
  try {
    const h = await (await stahni('https://www.okdrazby.cz/', { headers: UA })).text();
    const ids = [...h.matchAll(/\/drazba\/(\d+)-/g)].map((m) => +m[1]);
    if (ids.length) maxId = Math.max(maxId, ...ids);
  } catch { /* necháme výchozí odhad */ }
  let nejnizsi = 0;
  try { nejnizsi = nejnizsiOkdZDat(JSON.parse(readFileSync(OUT, 'utf8'))); } catch { /* první běh */ }
  const HI = maxId + 20, LO = oknoOkd(maxId, nejnizsi);
  const ids = [];
  for (let id = HI; id >= LO; id--) ids.push(id);

  const out = [];
  let idx = 0;
  async function worker() {
    while (idx < ids.length) {
      const id = ids[idx++];
      /* Každé ID se do účtu zapíše právě jednou, a to AŽ NAKONEC
         (`finally` proběhne i po `continue`). Kdyby se zapisovalo hned
         po odpovědi, rozbité JSON u jednoho ID by se počítalo dvakrát:
         jednou jako doručený dotaz a podruhé jako selhání. */
      let doslo = false, potiz = null;
      try {
        const r = await stahni(`${OKD_API}/auctions/${id}`, { headers: { ...UA, accept: 'application/json' } });
        /* Odpověď přišla — ať už 200, nebo 404 u neobsazeného ID.
           Obojí je informace; nedoručený dotaz informace NENÍ. */
        doslo = true;
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
          zdroj: 'OK dražby',
          lat: typeof j.lat === 'number' ? j.lat : undefined,
          lng: typeof j.lon === 'number' ? j.lon : undefined,
          _gps: typeof j.lat === 'number' && typeof j.lon === 'number',
          url: 'https://www.okdrazby.cz/drazba/' + id,
        });
        pridejVybaveni(out[out.length - 1], txt);
      } catch (e) {
        /* Tady se dřív mlčelo. Rozbité JSON u jednoho ID je drobnost,
           tři sta nedoručených dotazů je jiný běh — a poznat se to dá
           jen tím, že se to počítá. */
        potiz = e;
      } finally {
        skenDotaz('OK dražby', !doslo, potiz);
      }
    }
  }
  await Promise.all(Array.from({ length: 8 }, worker));
  return out;
}


// Státní pozemkový úřad — nabídky pozemků k prodeji podle § 12 zákona č. 503/2012.
// SPÚ zveřejňuje kompletní seznam jako CSV (kódování Windows-1250, oddělovač ;).
/* JMÉNO OKRESU NA PODOBU, V JAKÉ HO ZNÁME.
 *
 * NALEZENO MĚŘENÍM 4. 11. Nové účtování v sítu vypsalo u SPÚ
 * „chybi:lat 49" a ukázku: „Horšice, Plzeň - jih". Okres se tam píše
 * s mezerami okolo spojovníku, kdežto my známe „Plzeň-jih" — a stará
 * náprava (`\s+` → `-`) z toho udělala „Plzeň---jih", tedy pořád
 * neznámý okres. Bez okresu nemá geokodér kde hledat, nabídka zůstane
 * bez souřadnic a síto ji zahodí. Devětačtyřicet pozemků kvůli dvěma
 * mezerám.
 *
 * `Praha 4` a podobná jména, která v seznamu okresů nejsou, zůstávají
 * nedotčená: funkce vrací vstup, ne dohad. */
export function normOkres(name) {
  const vstup = String(name == null ? '' : name);
  if (OKRESY_MAP[vstup]) return vstup;
  /* Nejdřív jen uklidit mezery po krajích: „Ústí nad Orlicí" je okres
     s mezerami uvnitř a spojovníkování by z něj udělalo nesmysl. */
  const trim = vstup.trim().replace(/\s+/g, ' ');
  if (OKRESY_MAP[trim]) return trim;
  const hy = trim.replace(/\s*-\s*/g, '-').replace(/\s+/g, '-');
  if (OKRESY_MAP[hy]) return hy;
  return vstup;
}
function splitCsvLine(line) {
  return line.split(';').map((s) => s.replace(/^="?|"?$/g, '').trim());
}
async function fetchProdejSPU() {
  // 1) na přehledové stránce najdeme odkaz na aktuální CSV pozemků
  let page;
  try { page = await (await stahni('https://spu.gov.cz/nabidky/prehled-cela-cr', { headers: UA })).text(); }
  catch { return []; }
  const m = page.match(/href="([^"]*pozemky\d[^"]*\.csv)"/i);
  if (!m) return [];
  let url = m[1];
  if (!url.startsWith('http')) url = 'https://spu.gov.cz' + (url.startsWith('/') ? url : '/' + url);
  // 2) stáhneme a dekódujeme (Windows-1250)
  let buf;
  try { const r = await stahni(url, { headers: UA }); if (!r.ok) return []; buf = Buffer.from(await r.arrayBuffer()); }
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
      zdroj: 'SPÚ',
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
/* ZKRÁCENÍ POPISU NA MÍSTĚ, KDE VĚTA OPRAVDU KONČÍ.
 *
 * Dřív se řezalo podle `lastIndexOf('. ', 460)` — tedy podle tečky
 * s mezerou. V inzerátech na spoluvlastnické podíly ale tečka s mezerou
 * NENÍ konec věty, nýbrž zkratka: „• Parcela č. 1002/2 - o výměře
 * 32 m²". Řez proto padl hned za „Parcela č." a stránka končila
 * viselcem:
 *
 *   „… • Parcela č. 1018/20 - o výměře 111 m² (Vodní plocha) • Parcela č."
 *
 * Naměřeno na 1 623 uložených popisech: takhle uříznutých je 292, tedy
 * 18 %. Nepoznalo se to podle chybějící tečky — ten viselec tečkou
 * končí, takže každá kontrola „končí text tečkou?" ho pustila.
 *
 * Nové pravidlo má dvě cesty a bere tu, která uřízne co nejmíň:
 *   · konec odrážky (text je výpis parcel, tak se řeže mezi položkami),
 *   · konec VĚTY — tečka, před kterou nestojí známá zkratka.
 * Když ani jedna nedosáhne rozumné délky, zbude ořez na mezeře
 * s výpustkou, jako dřív.
 */
const ZKRATKY = new Set(['c', 'cp', 'parc', 'tj', 'napr', 'atd', 'apod', 'cca', 'resp',
  'mj', 'ks', 'st', 'ul', 'nam', 'sv', 'zn', 'popr', 'tzv', 'odst', 'pism', 'zak', 'sb',
  'ku', 'k', 'u', 'm', 'km', 'ha', 'max', 'min', 'pr', 'n', 'kat', 'lv', 'tel', 'ev',
  'pozn', 'vc', 'hod', 'kc', 'tis', 'mil', 'cm', 'mm', 'll', 'a', 'o', 'z', 's']);

function jeKonecVety(x, i) {
  /* i = index tečky. Slovo před ní bez diakritiky a malými písmeny. */
  const pred = x.slice(Math.max(0, i - 12), i).match(/([\p{L}]+)$/u);
  if (!pred) return false;                     // „12." je číslo v seznamu
  const slovo = pred[1].normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (ZKRATKY.has(slovo)) return false;
  /* Jednoznaková „slova" jsou skoro vždycky zkratka nebo iniciála. */
  if (slovo.length < 2) return false;
  return true;
}

export function zkratPopis(x, mez) {
  if (x.length <= mez) return x;
  let veta = -1;
  for (let i = x.indexOf('. '); i !== -1 && i < mez; i = x.indexOf('. ', i + 1)) {
    if (jeKonecVety(x, i)) veta = i;
  }
  /* Odrážky: řeže se PŘED odrážkou, aby nezůstala rozpůlená položka. */
  const odrazka = x.lastIndexOf(' • ', mez);
  const rez = Math.max(veta >= 0 ? veta + 1 : -1, odrazka > 0 ? odrazka : -1);
  if (rez > 200) {
    const konec = x.slice(0, rez).trimEnd();
    /* Řez na odrážce nekončí tečkou — výpustka řekne, že to pokračuje. */
    return /[.!?]$/.test(konec) ? konec : konec + '…';
  }
  return x.slice(0, mez).replace(/\s+\S*$/, '') + '…';
}

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
  /* DROBNÁ TYPOGRAFIE CIZÍHO TEXTU. Inzeráty chodí tak, jak je kdo
     napsal, a na stránce pozemku je ten text to jediné od člověka,
     který pozemek zná — stojí tedy za to, aby se dal číst. Naměřeno
     na vygenerovaných stránkách: patnáct z nich mělo mezeru PŘED
     čárkou nebo tečkou („v obci Boseň , v atraktivní lokalitě").
     Opravuje se jen to, co je bez výjimky chyba: mezera před
     interpunkcí a mezera zdvojená. Nic se nepřepisuje ani nedoplňuje
     — mezera ZA čárkou se schválně nedoplňuje, protože „1,5 ha" by
     se tím rozpadlo na „1, 5 ha". */
  x = x.replace(/\s+([,.;:!?])/g, '$1').replace(/ {2,}/g, ' ');
  if (x.length > 460) x = zkratPopis(x, 460);
  /* Dvě slova nejsou popis a prázdná slupka („Pozemek na prodej.") taky ne. */
  return x.length >= 60 ? x : '';
}

/* Prázdné = všechny typy nemovitostí. Čárkou oddělený seznam
   (např. „POZEMEK") se pošle beze změny jako estateType. */
const TYPY_BEZREALITKY = (process.env.PK_BEZREALITKY_TYPY || '')
  .split(',').map((x) => x.trim()).filter(Boolean);

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
      const r = await stahni('https://api.bezrealitky.cz/graphql/', {
        method: 'POST',
        headers: { ...UA, 'content-type': 'application/json', accept: 'application/json' },
        /* DOTAZ SE UŽ NEPTÁ JEN NA POZEMKY.
           Do 7. 11. tu stálo `estateType: ['POZEMEK']` — a bylo to
           jediné místo, kvůli kterému na webu nebyl ani jeden dům
           ani byt z největšího zdroje (1 613 nabídek, 0 nepozemků).
           Stroj na kategorie byl přitom hotový: okresní i krajské
           statistiky nepozemky odfiltrují (generate-region-pages.mjs),
           stránka umí „Typ nemovitosti" a dražby domy i byty poznají.
           Chybělo jen se zeptat.
           Omezení se nenahrazuje seznamem typů, ale VYNECHÁVÁ se:
           vyjmenovat je znamená hádat jména z cizího číselníku a při
           překlepu by GraphQL vrátil chybu, tedy nulu nabídek. Kdo by
           chtěl zpátky jen pozemky, nastaví PK_BEZREALITKY_TYPY. */
        body: JSON.stringify({ query, variables: Object.assign(
          { limit: PER, offset: p * PER, order: 'TIMEORDER_DESC', offerType: ['PRODEJ'] },
          TYPY_BEZREALITKY ? { estateType: TYPY_BEZREALITKY } : {}) }),
      });
      if (!r.ok) { skenUtrzeno('Bezrealitky', 'HTTP ' + r.status); break; }
      const j = await r.json();
      const la = j && j.data && j.data.listAdverts;
      /* Zdroj sám hlásí, kolik jich na dotaz má. Doteď se to pole jen
         vyžádalo a zahodilo; teď je z něj pojistka proti tomu, aby se
         smyčka zastavila uprostřed a nikdo si toho nevšiml. */
      if (la && typeof la.totalCount === 'number') skenOcekavej('Bezrealitky', la.totalCount);
      list = la && la.list;
    } catch (e) { skenUtrzeno('Bezrealitky', e); break; }
    if (!Array.isArray(list) || !list.length) break;
    skenPrijato('Bezrealitky', list.length);
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
      const place = misto.place || String(a.title || 'Nabídka').split(/\s*-\s*/)[0].trim().slice(0, 60) || 'Nabídka';
      let okres = hasGps ? nearestOkres(gps.lat, gps.lng) : null;
      if (!okres) okres = (parts[parts.length - 1] || place).replace(/\s*kraj$/i, '').slice(0, 40);
      /* KATEGORIE SE URČÍ TADY, NE AŽ ZE JMÉNA OBCE.
         Ústřední průchod níž umí kategorii uhodnout z textu, ale
         z inzerátu Bezrealitek se k němu dostane jen `place` (obec)
         a `druh` — název inzerátu se do nabídky nepředává a do dat
         se předávat nemá (úvodní stránka ho nečte a každý kilobajt
         v opportunities.json stojí čas na telefonu). Z „Praha 6"
         se dům nepozná. Klasifikuje se proto rovnou tady, z názvu
         i popisu, týmž sdíleným modulem (js/kategorie.js), jaký
         používají dražby — a ústřední průchod to pak nepřepíše,
         protože se ptá `if (!o.kat)`. */
      const textInzeratu = (a.title || '') + ' ' + (a.description || '');
      const kat = parseKategorie(textInzeratu, [place, okres]);
      const jePozemek = !kat || kat === PKKategorie.VYCHOZI;
      /* DRUH POZEMKU JEN U POZEMKU — ALE PRÁZDNÝ ZŮSTAT NESMÍ.
         `parseDruh` hledá ornou půdu, les nebo zahradu; u domu se
         zahradou by vrátil „zahrada" a z domu by se na webu stal
         pozemek. Jenže první pokus (7. 11.) nechal u nepozemků `null`
         — a síto, které druh vyžaduje u KAŽDÉ nabídky, jich zahodilo
         5 465 z 7 152 s důvodem „chybi:druh". Domy a byty tedy došly
         až sem a spadly o krok dál, na pole, které jsem sám vyprázdnil.
         U nepozemku se proto vyplní jméno typu („Dům", „Byt"), což je
         přesně to, co stránka pod popiskem „Typ nemovitosti" ukazuje;
         bere se z téhož sdíleného modulu jako všude jinde. */
      const druh = jePozemek
        ? parseDruh(textInzeratu, [place, okres])
        : (PKKategorie.jmeno(kat) || 'Jiná nemovitost');
      out.push({
        place, okres, type: 'sale',
        parcel: '—', _key: 'br-' + a.id, // dedup podle inzerátu, ne parcely
        ...(jePozemek ? {} : { kat }),
        druh, area, price,
        extra: 'inzerát – Bezrealitky',
        zdroj: 'Bezrealitky',
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
  try { const r = await stahni(BASE + '/inzerce_aktualni_nabidky', { headers: UA }); if (!r.ok) return []; listHtml = await r.text(); }
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
    /* NEDOJETÝ DETAIL SE POČÍTÁ I DO DAT, NEJEN DO LOGU. Komentář výš
       říká proč se to počítá; jenže se to pak jen vypsalo do konzole,
       a log v GitHub Actions zmizí se strojem. Platí tu totéž co o
       přeskočených nabídkách o kus výš: číslo musí skončit vedle stavu
       zdroje, aby ho bylo vidět na webu a aby podle něj šlo poznat, že
       běh nebyl úplný.
       Pozor na rozdíl proti OK dražbám: tam se projíždějí ID naslepo
       a 404 je běžná odpověď („tohle ID není dražba"), takže se počítá
       jako doručený dotaz. Tady je každé ID z VÝPISU nabídek, takže
       chybějící detail znamená ztracenou nabídku, ne prázdné místo. */
    try {
      const r = await stahni(BASE + '/nabidka_detail?nab=' + id, { headers: UA });
      skenDotaz('Farmy', !r.ok, 'HTTP ' + r.status);
      if (!r.ok) { ztraty.detailNedojel++; await sleep(200); continue; }
      html = await r.text();
    }
    catch (e) { skenDotaz('Farmy', true, e); ztraty.detailNedojel++; continue; }
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
      zdroj: 'Farmy',
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
/* OBJEDNÁVKA, KTEROU ZDROJ NEVYSLYŠEL, NENÍ ODPOVĚĎ.
 *
 * Objednávají se pozemky. Když přijde něco jiného, nesmí to projít
 * dál: právě takhle viselo na webu 44 pražských bytů jako pozemky
 * (§462). Actor u každého záznamu píše, co to je (`category`,
 * `categoryCode`, kde 3 = pozemek) — dá se to tedy ověřit, ne věřit.
 *
 * Stojí to mimo fetchSreality schválně: takhle se to dá zkoušet bez
 * sítě a hlavně bez placeného běhu.
 */
export function pozemkyZApify(items) {
  const seznam = Array.isArray(items) ? items : [];
  const jePozemek = (e) => String((e && e.category) || '').toLowerCase() === 'land'
    || Number(e && e.categoryCode) === 3;
  const poKategorii = {};
  for (const e of seznam) {
    const k = String((e && (e.category ?? e.categoryCode)) ?? '?');
    poKategorii[k] = (poKategorii[k] || 0) + 1;
  }
  const pozemky = seznam.filter(jePozemek);
  if (seznam.length && !pozemky.length) {
    /* Nula pozemků z odpovědi, která záznamy MÁ, znamená, že actor
       objednávku zahodil — a to je selhání zdroje, ne jeho klidný den.
       Kdyby se tiše vrátilo prázdno, vypadalo by to na výpadek a za
       38 dní by se na to zapomnělo (§231). Proto výjimka, ne [] : */
    const e = new Error(`actor vrátil ${seznam.length} záznamů, ale žádný pozemek`
      + ` (podle actoru: ${JSON.stringify(poKategorii)})`);
    e.objednavkaNevyslysena = true;
    throw e;
  }
  return { pozemky, poKategorii };
}

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
    /* VSTUP PODLE SCHÉMATU ACTORU, NE PODLE PARAMETRŮ SREALITY.
     *
     * Tady stálo `{ category_main_cb: 3, category_type_cb: 1 }` — tak se
     * ty parametry jmenují ve vyhledávání Sreality samotných. Actor je
     * ale NEZNÁ: mlčky je zahodil a pustil svůj výchozí vstup, tedy
     * `region: '10'` a `category: 'apartment'`. Změřeno 6. 11. na jeho
     * vstupním schématu a na vstupu prvního ostrého běhu: ze 1 666
     * záznamů bylo 1 666 BYTŮ V PRAZE a pozemků nula. Jména, která
     * actor čeká, jsou `category`, `transaction` a `region`/`regionIds`
     * (scripts/zkus-sreality.mjs je přečte zdarma, bez běhu).
     *
     * CENA JE ZA VÝSLEDEK, NE ZA BĚH: první běh dal 1 666 záznamů
     * a stál $4,998 — tedy $3 za tisíc. `maxListings` je proto STROP
     * ÚČTU, ne jen technická mez: 2 000 záznamů = nejvýš $6 za běh.
     * Kdo ho zvedne, zvedá útratu, a to je rozhodnutí majitele.
     */
    const KRAJE = ['10', '11', '13', '5', '2', '9', '3', '14', '1', '12', '15', '7', '4', '6'];
    const strop = Math.max(1, Number(process.env.APIFY_SREALITY_STROP || 2000));
    const input = {
      category: 'land',
      transaction: 'sale',
      region: KRAJE[0],
      regionIds: KRAJE,
      sort: 'newest',
      perPage: 100,
      maxListings: strop,
      requestDelay: 600,
    };
    /* JEDINÝ POKUS SCHVÁLNĚ. Tenhle běh trvá až pět minut a stojí
       kredit; opakovat ho po neúspěchu znamená platit dvakrát za
       totéž. Zdroj je navíc volitelný — bez tokenu se vynechá celý. */
    const r = await stahni(`https://api.apify.com/v2/acts/${actor}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
      pokusy: 1,
      casLimit: 290000,
    });
    if (!r.ok) { console.error(`Sreality/Apify: HTTP ${r.status} — zkontroluj token/actor.`); return []; }
    items = await r.json();
  } catch (e) { console.error('Sreality/Apify selhal:', e && e.message); return []; }
  if (!Array.isArray(items) || !items.length) { console.log('Sreality/Apify: 0 položek.'); return []; }
  console.log(`Sreality/Apify vzorek: ${JSON.stringify(items[0]).slice(0, 500)}`);
  const { pozemky: pozemkoveZaznamy, poKategorii } = pozemkyZApify(items);
  console.log(`Sreality/Apify: ${items.length} záznamů, podle actoru: ${JSON.stringify(poKategorii)}`
    + ` — pozemků ${pozemkoveZaznamy.length}.`);
  const num = (v) => { const n = +String(v).replace(/[^\d.]/g, ''); return isFinite(n) ? n : NaN; };
  const out = [];
  for (const e of pozemkoveZaznamy) {
   try {
    const price = Math.round(num(e.price ?? e.priceValue ?? e.price_czk ?? e.priceCzk)) || 0;
    if (!price || price < 5000) continue;
    const gps = e.gps || e.location || {};
    const lat = num(e.lat ?? e.latitude ?? gps.lat ?? gps.latitude);
    const lng = num(e.lng ?? e.lon ?? e.longitude ?? gps.lon ?? gps.lng ?? gps.longitude);
    const name = String(e.name || e.title || '');
    const loc = String(e.locality || e.address || (typeof e.location === 'string' ? e.location : '') || '');
    /* VÝMĚRA NEJDŘÍV Z POLE ZDROJE, teprve pak z názvu. Obráceně to
       vedlo na „1 111 m²" z „Prodej bytu 2+1 111 m²" (§462): čtení
       z textu je poslední záchrana, ne první volba. Jména polí jsou
       změřená na skutečné datové sadě actoru. */
    const area = (num(e.estateArea ?? e.landArea ?? e.usableArea ?? e.area ?? e.surface ?? e.surfaceLand) || null)
      || parseArea(name) || null;
    let okres = (isFinite(lat) && isFinite(lng)) ? nearestOkres(lat, lng) : null;
    if (!okres) { const om = loc.match(/okres\s+([A-Za-zÁ-Žá-ž.\- ]+)/i); if (om) { const c = normOkres(om[1].trim().replace(/[.,;].*$/, '')); if (OKRESY_MAP[c]) okres = c; } }
    if (!okres) continue;
    /* MÍSTO JE OBEC, NE ULICE. Actor posílá obec (`city`) i část obce
       (`cityPart`) zvlášť, a dokud se místo skládalo z prvního kusu
       adresy, stálo v poli pro obec „Tusarova" — ulice. Chytil to
       hlídač test-misto-prahy, ne já. Ulice patří do popisu, ne sem. */
    const parts = loc.split(',').map((s) => s.trim()).filter(Boolean);
    const place = String(e.city || e.cityPart || parts[0] || name || 'Pozemek')
      .split(/\s*-\s*/)[0].trim().slice(0, 60) || 'Pozemek';
    const url = e.url || e.link || e.detailUrl || undefined;
    /* Adresa (loc) se sem schválně neposílá: je to popis MÍSTA, ne
       pozemku, a je v ní obec i okres. */
    const druh = parseDruh(name, [place, okres]);
    out.push({
      place, okres, type: 'sale', parcel: '—',
      /* `adId` je číslo inzerátu u Sreality a actor ho posílá u každého
         záznamu (změřeno: 1 666/1 666). Klíč z něj drží i tehdy, když
         inzerent změní cenu nebo název. */
      _key: 'sr-' + (e.adId || e.hash_id || e.id || url || (place + '-' + price)),
      druh: normDruh(druh || 'pozemek'), area, price, extra: 'inzerát – Sreality',
      zdroj: 'Sreality (Apify)',
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

/* PROČ SE NABÍDKA NEPOUŽIJE — a ne jen „nepoužije se".
 *
 * NALEZENO MĚŘENÍM 4. 11. Zdroj otevřených dat státu vrátil 33 pozemků
 * a na web se jich dostalo 11. Nikde se o těch 22 nedočtete ani slovo:
 * `valid()` vracelo `true`/`false` a `.filter(valid)` zahozené mlčky
 * spolkl. Přitom to nebyla vada dat — `parcel` je v REQUIRED a tenhle
 * jediný zdroj psal u neznámého parcelního čísla `undefined` místo
 * pomlčky, kterou píšou ostatní. Dvě třetiny nového zdroje tak zmizely
 * kvůli údaji, který je na přečtení, ne na rozhodování.
 *
 * Síto zůstává stejné. Mění se jen tolik, že každé zahození má JMÉNO
 * a sečte se po zdrojích — stejně jako u čtení vstupu (§363, §364).
 * Zahození, které nemá jméno, se nedá ani spravit, ani obhájit. */
/* HRUBÉ OBALY SOUSEDNÍCH STÁTŮ — jen aby nález řekl, co to je.
 *
 * Na nic se podle nich NEROZHODUJE: o zahození už rozhodla podmínka
 * nad tím (bod neleží v ČR). Tohle jen pojmenuje, kam ten bod padl,
 * aby se z výpisu dalo poznat, jestli zdroj posílá nabídky ze zahraničí
 * (pak je zahození v pořádku), nebo jestli nám někde přeskakují
 * souřadnice (pak je to naše vada). Obaly se překrývají, takže se bere
 * první, který sedne — proto SK před AT a PL před DE: Bezrealitky mají
 * slovenskou sestru a právě ta je nejpravděpodobnější vysvětlení.
 *
 * MĚŘENO 6. 11.: Bezrealitky mělo 263 takových nabídek z 1 898,
 * tedy 14 %. Rozdělení na „nejsou číslo / jsou nula / jsou za hranicí"
 * (§471) ukázalo, že VŠECH 263 má souřadnice v pořádku a leží opravdu
 * za hranicí. Tahle jména mají dopovědět, za kterou. */
const SOUSEDI = [
  ['SK', 47.7, 49.7, 16.8, 22.6],
  ['PL', 49.0, 54.9, 14.1, 24.2],
  ['AT', 46.3, 49.1, 9.5, 17.2],
  ['DE', 47.2, 55.1, 5.8, 15.1],
];
export function sousedniStat(lat, lng) {
  for (const [zn, laMin, laMax, lnMin, lnMax] of SOUSEDI) {
    if (lat >= laMin && lat <= laMax && lng >= lnMin && lng <= lnMax) return zn;
  }
  return 'jinde';
}

export function procNeplatna(o) {
  if (!o || typeof o !== 'object') return 'neniZaznam';
  if (!TYPES.has(o.type)) return 'cizíTyp';
  for (const k of REQUIRED) {
    if (o[k] === undefined || o[k] === null || o[k] === '') return 'chybi:' + k;
  }
  // Cena musí být důvěryhodná. Pod 5 000 Kč jde skoro vždy o chybu stahování
  // (např. cena za m² spletená s celkovou cenou) — takové raději nezobrazujeme.
  const price = Number(o.price);
  if (!isFinite(price) || price <= 0 || price > 2e9) return 'cenaMimoRozsah';
  /* POD 5 000 Kč: NE HNED DO KOŠE, ALE DVĚ OTÁZKY.
   *
   * Práh vznikl proti chybě stahování — cena za metr spletená s cenou
   * celkovou. NALEZENO MĚŘENÍM 4. 11.: u SPÚ takhle padlo 217 nabídek
   * a ukázka byla „Jundrov, Brno-město — 1 m², 126 Kč, zahrada". To
   * žádná chyba stahování není, to je skutečná nabídka státu: metr
   * zahrady za 126 Kč, tedy narovnání plotu u souseda. A naopak
   * „Libavské Údolí, Sokolov — 151 m², 3 020 Kč" je docela obyčejný
   * malý pozemek za 20 Kč/m², o který by na webu nikdo stát nemusel
   * přestat.
   *
   * Rozděluje se to proto na dvě věci, každou s vlastním jménem:
   *   · cena za metr pod 1 Kč → tomu se nedá věřit, to je ta chyba,
   *     pro kterou práh vznikl (500 m² za 300 Kč = 0,6 Kč/m²);
   *   · pozemek pod 100 m² za pár stovek → věřit se tomu dá, ale pro
   *     kupujícího to pozemek není. Zůstává zahozený, jen už se to
   *     nevydává za nedůvěryhodnou cenu.
   * Zástupné ceny („cena na dotaz" napsaná jako 5 000 Kč) chytá dál
   * síto podle druhu, které má vlastní prahy a strop 1 %. */
  const CENA_DROBNA = 5000;
  const PLOCHA_NEJMENSI = 100;
  if (price < CENA_DROBNA) {
    const vymera = Number(o.area);
    if (!isFinite(vymera) || vymera <= 0) return 'cenaMimoRozsah';
    if (price / vymera < 1) return 'cenaMimoRozsah';
    if (vymera < PLOCHA_NEJMENSI) return 'drobnyPozemekZaParStovek';
  }
  /* Cena za m² nesmí být absurdně vysoká. U POZEMKU je mez 25 000 Kč/m²:
     přes ni jde skoro vždy o chybu (přehozené číslo, spoluvlastnický
     podíl…) a nejdražší reálné stavební pozemky se drží hluboko pod tím.

     U DOMU NEBO BYTU TA MEZ NEPLATÍ. Byt se počítá na podlahovou
     plochu, ne na parcelu, a 80 000 Kč/m² je v Praze běžná cena, ne
     překlep — s pozemkovou mezí by ze zdroje nepropadl ani jeden byt.
     Mez tu proto zůstává (absurdní číslo se má poznat dál), jen je
     posazená tam, kam u bydlení patří: 500 000 Kč/m² je dvojnásobek
     nejdražšího, co v Česku kdy padlo. */
  const area = Number(o.area);
  const jePozemkova = !o.kat || o.kat === 'pozemek';
  const strop = jePozemkova ? 25000 : 500000;
  if (isFinite(area) && area > 0 && price / area > strop) return 'cenaZaMetrPrilisVysoka';
  /* Jen pozemky v ČR — souřadnice musí padnout do hranic republiky.
     TŘI RŮZNÉ DŮVODY, TŘI RŮZNÁ JMÉNA (§471). Stála tu jedna podmínka
     a vracela `souradniceMimoCR` pro všechny tři případy naráz:
       · souřadnice nejsou číslo (to je naše vada, neumíme nabídku umístit);
       · jsou nula (to zdroj poslal místo polohy prázdno, taky vada);
       · a doopravdy leží za hranicí (to je nabídka, co na web nepatří).
     Jen ten třetí je oprávněné zahození. Mít na ně jedno jméno znamená,
     že z výpisu nejde poznat, kolik nabídek se ztrácí naší neschopností.

     PROČ TO MĚŘÍM A NEOPRAVUJI ROVNOU. 6. 11. mělo Bezrealitky
     263 nabídek s tímhle důvodem, tedy 11 % dnešního webu. Posudek
     tvrdil, že je to tím, že souřadnice vůbec nemají. To ale neplatí:
     `lat` a `lng` jsou v REQUIRED, takže nabídka bez nich padne už
     o dvacet řádků výš na `chybi:lat` — a toho důvodu bylo naměřeno
     jen 2. Těch 263 tedy nějaké souřadnice NESE a jsou buď nulové,
     nebo skutečně za hranicí; z dat v repozitáři se to rozhodnout
     nedá, protože zahozená nabídka se neukládá. Tohle rozdělení je ta
     nejmenší změna, po které to příští běh robota řekne sám. */
  const lat = Number(o.lat), lng = Number(o.lng);
  if (!isFinite(lat) || !isFinite(lng)) return 'bezSouradnic';
  if (lat === 0 && lng === 0) return 'souradniceNula';
  if (lat < 48.4 || lat > 51.2 || lng < 12.0 || lng > 18.95) return 'mimoCR:' + sousedniStat(lat, lng);
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
  if (nearestSq > 40 * 40) return 'dalekoOdKazdehoOkresu';
  /* Vzdálenost od okresního města je jen hrubé síto — u hranic pustí
     i kus Německa. Máme ale skutečné hranice okresů, tak se rovnou
     zeptáme, jestli bod leží v některém z nich. Bez tohoto testu visely
     na webu dva zahraniční pozemky („Sasko" a „Reiserdorf 173") s okresem
     dopočítaným podle nejbližšího českého města. */
  if (maHranice() && !okresPodleHranice(lat, lng)) return 'mimoHraniceOkresu';
  // Druhá pojistka pro příhraničí: zjevně NĚMECKÝ název místa (ß, Straße, -weg,
  // Mühle, Pfarr…) — takové znaky se v českých názvech obcí prakticky nevyskytují,
  // takže jde o zahraniční inzerát se souřadnicemi za hranicí. Nezobrazujeme.
  if (/ß|stra(ss|ß)e|m[üu]hle|pfarr|hausen|kirchen|\bweg\b|weg\s*\d|holz\b|\bdorf\b/i.test(String(o.place || ''))) return 'nemeckyNazevMista';
  return null;
}

function valid(o) { return procNeplatna(o) === null; }

/* Kolik nabídek každého zdroje síto zahodilo a proč. Po zdrojích,
   protože „22 nabídek se zahodilo" neřekne nic — kdežto „zdroj Nabídky
   státu: 22, všechny chybi:parcel" řekne všechno. */
export function sectiNeplatne(nabidky, zdrojProNabidku) {
  const ven = new Map();
  for (const o of (nabidky || [])) {
    const d = procNeplatna(o);
    if (!d) continue;
    const zdroj = (zdrojProNabidku && zdrojProNabidku(o)) || 'neznámý zdroj';
    const z = ven.get(zdroj) || { pocet: 0, duvody: {}, ukazky: {} };
    z.pocet++;
    z.duvody[d] = (z.duvody[d] || 0) + 1;
    /* A JEDNA UKÁZKA KE KAŽDÉMU DŮVODU. Samo číslo nestačí na
       rozhodnutí: „SPÚ: cenaMimoRozsah 217" může znamenat jak chybu
       stahování, tak docela obyčejné pozemky za tři tisíce, které náš
       práh vyhazuje zbytečně. Rozdíl je vidět teprve na té nabídce. */
    if (!z.ukazky[d]) {
      z.ukazky[d] = `${o.place || '?'}, ${o.okres || '?'} — ${o.area || '?'} m²,`
        + ` ${o.price || '?'} Kč, ${o.druh || '?'}`;
    }
    ven.set(zdroj, z);
  }
  return ven;
}

/* ZDROJ, KTERÉMU SÍTO SEBERE VÍC NEŽ POLOVINU. Práh je změřený, ne
   vymyšlený: nový zdroj otevřených dat ztrácel 22 z 33 (67 %), SPÚ
   ztrácí 266 z 549 (48 %) a Bezrealitky 268 z 1 911 (14 %). Polovina
   tedy odděluje „tohle je naše pravidlo" od „taková ta data jsou".
   Hlásí se, nezastavuje: síto má svoje důvody a rozhodnout patří
   člověku. */
export const PRAH_ZTRATY_V_SITU = 0.5;

export function zdrojeZtraceneVSitu(zdroje, prah = PRAH_ZTRATY_V_SITU) {
  const ven = [];
  for (const z of (zdroje || [])) {
    const pocet = Number(z && z.pocet) || 0;
    const nepustilo = Number(z && z.nepustilo) || 0;
    if (!nepustilo || pocet <= 0) continue;
    /* Podíl se počítá ze VŠEHO, co zdroj přinesl, tedy z propuštěných
       i zahozených: `pocet` je počet stažených. */
    const podil = nepustilo / pocet;
    if (podil <= prah) continue;
    ven.push({ nazev: z.nazev, pocet, nepustilo, podil: Math.round(podil * 100),
      duvod: z.nepustiloDuvod || 'bez udaného důvodu' });
  }
  return ven.sort((a, b) => b.podil - a.podil);
}

export function hlaskyNeplatnych(soucty) {
  const ven = [];
  for (const [zdroj, z] of (soucty || new Map())) {
    const serazene = Object.entries(z.duvody).sort((a, b) => b[1] - a[1]);
    const duvody = serazene.map(([k, n]) => k + ' ' + n).join(', ');
    ven.push(`Zdroj ${zdroj}: ${z.pocet} nabídek síto nepustilo na web — ${duvody}.`);
    for (const [k] of serazene.slice(0, 3)) {
      if (z.ukazky && z.ukazky[k]) ven.push(`  · ${k}: ${z.ukazky[k]}`);
    }
  }
  return ven;
}

async function main() {
  prorezMezipamet();
  /* DNEŠNÍ DATUM PATŘÍ NA ZAČÁTEK. Stávalo o 280 řádků níž, u přiřazení
     „poprvé viděno", a když se nad něj dostalo držení nabídek vypadlých
     zdrojů, celý robot padl na ReferenceError (mrtvá zóna const). Hlídá
     to test-mrtva-zona. */
  const dnesISO = new Date().toISOString().slice(0, 10);
  // Pojmenované zdroje → v logu Actions je hned vidět, který přestal vracet data.
/* ---------- NABÍDKY NEPOTŘEBNÉHO MAJETKU STÁTU -------------------
   Otevřená data z portal.gov.cz (robots: Allow: /, změřeno 3. 11.).
   Jedním souborem Lesy ČR, Povodí, Vojenské lesy, Správa železnic
   i ministerstva — viz scripts/cti-nabidky-statu.mjs, kde je i to,
   co se nebere a proč. Zahozené se VYPISUJÍ: zdroj, který se tiše
   rozpadne, je horší než zdroj, který chybí (§356). */
async function fetchNabidkyStatu() {
  let text;
  try {
    const r = await stahni(STAT.CSV_URL, { headers: UA });
    if (!r.ok) return [];
    text = await r.text();
  } catch { return []; }
  const dnes = new Date().toISOString().slice(0, 10);
  const { nabidky, zahozeno } = STAT.nabidkyZCsv(text, dnes);
  /* Razítko zdroje se píše TADY, i když ho čtečka nastavuje taky.
     Hlídač test-vypadek-zdroje.mjs čte tenhle soubor a chce u každého
     stahovače vidět, že své jméno do nabídky zapisuje — a má pravdu:
     bez toho pole by se při výpadku nedalo poznat, čí nabídka je, a
     držení z §332 by ji nepodrželo. */
  const orazitkovane = nabidky.map((o) => ({
    ...o,
    zdroj: 'Nabídky státu',
  }));
  const z = Object.entries(zahozeno).filter(([, n]) => n > 0).map(([k, n]) => k + ' ' + n);
  console.error(`Zdroj Nabídky státu: ${orazitkovane.length} pozemků`
    + (z.length ? `, zahozeno — ${z.join(', ')}` : ', nic se nezahodilo'));
  return orazitkovane;
}

  const SOURCES = [
    ['Dražby', fetchDrazby],
    ['OK dražby', fetchOkdrazby],
    ['SPÚ', fetchProdejSPU],
    ['Bezrealitky', fetchBezrealitky],
    ['Sreality (Apify)', fetchSreality], // aktivní jen s APIFY_TOKEN, jinak []
    ['Farmy', fetchFarmy],
    ['Nabídky státu', fetchNabidkyStatu],
    ['ÚZSVM', fetchUzsvm],
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
    /* A u zdrojů, které se ptají po jednom ID: kolik dotazů vůbec došlo.
       Nula znamená „tenhle zdroj se takhle nestahuje", ne „nic nedošlo". */
    dotazu: skenZdroje(SOURCES[i][0]).dotazu,
    selhalo: skenZdroje(SOURCES[i][0]).selhalo,
  }));
  for (const hlaska of oznacNeuplne(zdroje, skenZdroje)) console.error(hlaska);
  /* Porovnání s minulým během. Čte se ze souboru, který se teprve bude
     přepisovat — tedy ještě ze starých dat. */
  let minuleZdroje = [];
  try { minuleZdroje = JSON.parse(readFileSync(OUT, 'utf8')).zdroje || []; } catch { /* první běh */ }
  const nalezy = porovnejZdroje(minuleZdroje, zdroje);
  for (const n of nalezy) {
    const z = zdroje.find((x) => x.nazev === n.nazev);
    if (!z) continue;
    /* Neúplný sken přebije jen „prazdno" — to běh zastavuje a zastavit
       se má tak jako tak. „Propad" by naopak neúplné číslo prohlásil za
       měření a zapsal do historie, a přesně tomu se tu předchází. */
    if (z.stav === 'neuplne' && n.druh !== 'prazdno') continue;
    z.stav = n.druh;                         // „prazdno" / „propad" se zapíše do dat
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
    console.error(n.trva
      ? `POZOR: zdroj ${n.nazev} přinesl ${n.ted} záznamů a v celém okně historie nemá`
        + ` ani jeden den v pořádku (${n.dnu} označených dnů, medián ${n.median}). Úbytek`
        + ' TRVÁ — nespraví se sám a nesmí se stát novou normou.'
      : `POZOR: zdroj ${n.nazev} přinesl ${n.ted} záznamů, medián posledních`
        + ` ${n.dnu} dnů je ${n.median}. Není to skok, je to pomalý úbytek — podívejte se,`
        + ' jestli parser nepřestal část stránky čist.');
  }
  /* A třetí síto: nejde o POČET, ale o CENU. Zdroj může vrátit stejně
     nabídek a mít přitom ceny posunuté o řád — viz komentář
     u medianyCenZdroju. Co se nabídek toho zdroje stane, stojí níž
     u sestavení `raw`. */
  const znamaJmena = new Set(zdroje.map((z) => z.nazev));
  const medianyCen = medianyCenZdroju(
    results.filter((r) => r.status === 'fulfilled').flatMap((r) => r.value || []), znamaJmena);
  const jineCeny = new Set();
  for (const n of porovnejCeny(historie, medianyCen, DNES)) {
    const z = zdroje.find((x) => x.nazev === n.nazev);
    jineCeny.add(n.nazev);
    if (z) z.stav = 'jineCeny';
    console.error(`POZOR: zdroj ${n.nazev} má dnes medián ${Math.round(n.ted)} Kč/m²,`
      + ` historický medián je ${Math.round(n.drive)} Kč/m² — ${n.pomer.toFixed(1)}× jinde.`
      + ' Tolik se trh za den nepohne; vypadá to na změnu toho, CO se na cizí stránce čte'
      + ' (celková cena místo ceny za metr, hektary místo metrů). Dnešní nabídky tohoto'
      + ' zdroje se NEBEROU a drží se ty z minulého běhu.');
  }
  try {
    writeFileSync(HIST_ZDROJU, JSON.stringify(zapisDoHistorie(historie, zdroje, DNES, medianyCen)));
  } catch (e) { console.error('Historii zdrojů nešlo zapsat: ' + e.message); }

  /* POJISTKA NA PRÁZDNÝ ZDROJ STOJÍ DÁL — až za druhou cestou
     a držením, viz níž. Do 3. 11. stála TADY, tedy před nimi: zdroj,
     který změnil podobu stránky a přestal se číst, běh zabil ještě
     předtím, než se vůbec zkusilo náhradní čtení. §334 tak neměla
     šanci pomoct právě v tom případě, pro který vznikla. */
  for (const n of nalezy) {
    if (n.druh === 'zahazuje') {
      console.error(`POZOR: zdroj ${n.nazev} přinesl ${n.ted} záznamů a ${n.preskoceno} jich zahodil`
        + ` — nejspíš se změnil tvar dat. První chyba: ${ztratyZdroje(n.nazev).prvni}`);
    } else {
      console.error(`POZOR: zdroj ${n.nazev} přinesl ${n.ted} záznamů, minule ${n.drive}.`);
    }
  }

  for (const z of zdroje) {
    const h = hlaskaZdroje(z);
    if (h.kam === 'log') console.log(h.text); else console.error(h.text);
  }

  /* ZDROJ S PODEZŘELÝMI CENAMI SE DNES NEBERE. Lepší je den stará
     cena než cena o řád jinde: podle Kč/m² se řadí, počítá verdikt
     i kreslí mapa. Zdroj zůstane se stavem „jineCeny", takže mu
     držení nabídek (§220) vrátí ty z minulého běhu. */
  const raw = results
    .filter((r) => r.status === 'fulfilled')
    .flatMap((r) => r.value || [])
    .filter((o) => !jineCeny.size || !jineCeny.has(zdrojNabidky(o, znamaJmena)))
    .map((o) => geocode(o));

  /* VÝPADEK JEDNOHO ZDROJE NESMÍ SMAZAT JEHO NABÍDKY.
     ==================================================================
     Změřeno 2. 11.: z 2 004 nabídek na webu jich 1 628 pochází
     z jediného zdroje (Bezrealitky, 81 %); ze 2 578 stažených jich
     tenhle zdroj dodal 1 909, tedy 74 %. Pojistka níž hlídá CELEK —
     když se stáhne míň než 60 % minulého počtu, běh se zastaví a data
     zmrznou. U rozložení 95 : 5 to znamená, že výpadek jednoho webu
     zastaví všechno: nejen jeho nabídky, ale i nové nabídky zdrojů,
     které zrovna fungují.

     Proto se nabídky zdroje, který DNES NEODPOVĚDĚL, podrží z minulého
     běhu a přimíchají k čerstvým. Zdroj se pozná podle hostitele
     v adrese; jiné spolehlivé označení nabídky nenesou (pole `site`
     jsou sítě, ne zdroj).

     DRŽENÍ MÁ STROP. Po DRZENI_DNU dnech se nabídky pustí — zdroj,
     který týden mlčí, není výpadek, ale konec, a držet po něm data
     donekonečna by znamenalo tvrdit o nabídkách, že existují, aniž to
     kdokoli ověřil. Datum, od kdy se drží, se zapisuje do `drzeno_od`,
     takže je ten strop měřitelný zvenčí a hlídač ho umí prokázat.

     VYPNUTÝ ZDROJ SE NEDRŽÍ. „vypnuto" (chybí klíč) není výpadek, ale
     rozhodnutí — držet po něm data by předstíralo zdroj, který nikdo
     nezapnul. */
  /* DRUHÁ CESTA JE PŘED DRŽENÍM. Zdroj, který se podařilo přečíst
     jinak, totiž není výpadek — a držet po něm staré nabídky by
     znamenalo míchat dnešní a včerejší obraz téhož webu. */
  {
    let driveNabidky = [];
    try { driveNabidky = (JSON.parse(readFileSync(OUT, 'utf8')).opportunities || []); }
    catch { driveNabidky = []; }
    const slovnik = slovnikMist(driveNabidky);
    const okresy = new Set(driveNabidky.map((o) => o.okres).filter(Boolean));
    /* OBECNÉ ZDROJE — ty, které nikdy neměly vlastní stahovač. Běží
       tady, a ne mezi SOURCES, protože obecná cesta potřebuje slovník
       míst z dřívějších dat (ten se staví až v tomhle bloku) a protože
       se stejně jako druhá cesta řídí robots.txt. Jejich stav se
       PŘIDÁ do `zdroje`, takže je vidí diagnostika i držení z §332. */
    if (OBECNE_ZDROJE.length) {
      console.error(`Obecných zdrojů k přečtení: ${OBECNE_ZDROJE.length}.`);
      const ob = await obecneZdroje(OBECNE_ZDROJE, {
        stahni, smimeCist, prectiJakkoli, copakTamJe, mistoZTextu,
        slovnik, okresy, ua: BOT_UA,
      });
      zdroje.push(...ob.zdroje);
      if (ob.nabidky.length) raw.push(...ob.nabidky.map((o) => geocode(o)));
    }
    /* ZDROJE ČTENÉ PODLE PŘEDPISU. Také tady, a ne mezi SOURCES:
       místo se u nich poznává z názvu nabídky, a k tomu je potřeba
       slovník míst z dřívějších dat (ten se staví v tomhle bloku).
       Stav se přidá do `zdroje`, takže zdroj vidí diagnostika,
       hlídka výpadků i držení nabídek z §332. */
    if (ZAPOJENE_PREDPISY.length) {
      console.error(`Zdrojů čtených podle předpisu: ${ZAPOJENE_PREDPISY.length}`
        + ` (${ZAPOJENE_PREDPISY.join(', ')}).`);
      const pr = await zdrojePodlePredpisu(ZAPOJENE_PREDPISY, {
        stahni, smimeCist, zZaznamu, predpisy: PREDPISY, mistoZTextu,
        slovnik, okresy, ua: BOT_UA, zJmena: mistoZeJmenaAukce,
      });
      zdroje.push(...pr.zdroje);
      if (pr.nabidky.length) raw.push(...pr.nabidky.map((o) => geocode(o)));
    }
    /* Zdroje, u kterých má smysl zkusit druhou cestu: nejen ty, co
       spadly, ale i ty, co odpověděly a nepřinesly nic nebo zlomek —
       to je totiž ta častější podoba změny cizi ho webu (viz
       ZKUSIT_DRUHOU výš). */
    const kandidatiNaDruhou = zdroje.filter((z) => ZKUSIT_DRUHOU.has(z.stav));
    if (kandidatiNaDruhou.length) {
      console.error(`Zdrojů k druhé cestě: ${kandidatiNaDruhou.length}`
        + ` (${kandidatiNaDruhou.map((z) => `${z.nazev}: ${z.stav}`).join(', ')}).`
        + ` Zkouším JSON-LD, mikrodata a signály — robots.txt se čte první.`);
      const jinak = await zalozniCestou(zdroje, ZAPOJENE, {
        stahni, smimeCist, prectiJakkoli, copakTamJe, mistoZTextu,
        slovnik, okresy, ua: BOT_UA,
      });
      if (jinak.length) {
        console.error(`Druhou cestou přišlo ${jinak.length} nabídek.`);
        raw.push(...jinak.map((o) => geocode(o)));
      }
    }
  }
  const podrzeno = podrzNabidkyVypadlych(zdroje, raw, dnesISO);
  for (const z of zdroje) {
    const p = podrzeno.podleZdroje.get(z.nazev) || 0;
    if (p) {
      z.podrzeno = p;
      console.error(`Zdroj ${z.nazev} neodpověděl — držím jeho ${p} nabídek z minulého běhu`
        + ` (strop ${DRZENI_DNU} dnů).`);
    }
  }
  if (podrzeno.pustene) {
    console.error(`POZOR: ${podrzeno.pustene} nabídek se pustilo — jejich zdroj mlčí`
      + ` déle než ${DRZENI_DNU} dnů. To už není výpadek.`);
  }

  /* ---------- POJISTKA NA PRÁZDNÝ ZDROJ ---------------------------- */
  /* Zdroj, který minule něco měl a dnes nevrátil NIC, není pravda —
     je to rozbité čtení. Dokud se nezšiklo, běh se tu zastavil a data
     zůstala stará.
     TEĎ STOJÍ AŽ TADY, tedy po druhé cestě a po držení, a dívá se na
     STAV PO NICH — ne na nález z porovnání. Důvod: zdroj zachráněný
     druhou cestou už prázdný není (má stav „druhá cesta") a zdroj,
     jehož nabídky držíme z minulého běhu, nedrží web prázdný ani on.
     Zastavit běh v obou případech by znamenalo zahodit i čerstvá data
     všech zdravych zdrojů — tedy právě to, čemu §332 předchází. */
  const poradDoluPrazdne = zdroje.filter((z) => z.stav === 'prazdno' && !z.podrzeno);
  if (poradDoluPrazdne.length) {
    const drive = (nazev) => {
      const n = nalezy.find((x) => x.nazev === nazev);
      return n ? n.drive : '?';
    };
    console.error('CHYBA: ' + poradDoluPrazdne.map((z) => `zdroj ${z.nazev} nevrátil nic`
      + ` (minule ${drive(z.nazev)}) a nedalo se po něm nic podržet`).join('; ')
      + '. Nejspíš se změnila podoba stránky, parser přestal cokoli najít'
      + ' a ani náhradní čtení nepomohlo. Ponechávám stará data a končím'
      + ' s chybou, ať přijde upozornění.');
    process.exit(1);
  }
  /* A zdroj, který je prázdný, ale držíme po něm nabídky: běh
     pokračuje, ale nahlas. Ticho by znamenalo, že se na rozbitý parser
     přijde až za týden, když držení vyprší. */
  for (const z of zdroje.filter((x) => x.stav === 'prazdno' && x.podrzeno)) {
    console.error(`POZOR: zdroj ${z.nazev} nevrátil nic a náhradní čtení nepomohlo;`
      + ` držím jeho ${z.podrzeno} nabídek z minulého běhu (strop ${DRZENI_DNU} dnů).`
      + ' Parser patří opravit, než ten strop vyprší.');
  }
  raw.push(...podrzeno.nabidky);

  // odstranění duplicit (okres + parcela) a seřazení podle výhodnosti
  const seen = new Set();
  const byDeal = (a, b) => (a.area ? a.price / a.area : Infinity) - (b.area ? b.price / b.area : Infinity);
  /* NEJDŘÍV SE ZAHOZENÉ SEČTOU A VYPÍŠOU. Do 4. 11. tady stálo jen
     `.filter(valid)` a co propadlo, zmizelo beze slova — u nového
     zdroje to byly dvě třetiny jeho nabídek (33 stažených, 11 na
     webu) a nikde to nešlo vyčíst. */
  const neplatne = sectiNeplatne(raw, (o) => zdrojNabidky(o, znamaJmena));
  for (const h of hlaskyNeplatnych(neplatne)) console.error(h);
  /* A ČÍSLO JDE DO DAT, ne jen do logu. Log po běhu zmizí se strojem,
     kdežto podle tohohle čísla se dá příště poznat, že zdroj zahazuje
     víc než posledně — a je vidět i na diagnostice webu. */
  for (const z of zdroje) {
    /* Rozpad, který si čtečka vede sama (co zahodila ještě PŘED sítem
       webu) — ať se příští pomalý svah dá rozsoudit z dat. */
    const rz = rozpadZdroje(z.nazev);
    if (rz) z.rozpadCtecky = rz;
    const s = neplatne.get(z.nazev);
    z.nepustilo = s ? s.pocet : 0;
    z.nepustiloDuvod = s
      ? Object.entries(s.duvody).sort((a, b) => b[1] - a[1]).map(([k, n]) => k + ' ' + n).join(', ')
      : null;
  }
  for (const n of zdrojeZtraceneVSitu(zdroje)) {
    console.error(`POZOR: zdroj ${n.nazev} stáhl ${n.pocet} nabídek a ${n.nepustilo} z nich`
      + ` síto nepustilo na web (${n.podil} %) — ${n.duvod}. Při takovém podílu to nebývá`
      + ' jakost dat, ale naše pravidlo: právě takhle zmizely dvě třetiny nového zdroje'
      + ' kvůli parcelnímu číslu, které je jen na přečtení (§365).');
  }
  /* ÚČTOVÁNÍ POKRAČUJE I ZA SÍTEM. Nalezeno měřením 4. 11.: síto
     nepustilo jen 3 z 33 nabídek nového zdroje, a na webu jich přesto
     bylo 13. Sedmnáct nabídek tedy zmizelo v krocích ZA sítem —
     v odstranění duplicit, dvojníků a zástupných cen — a ani u jednoho
     z nich se nevědělo, čí nabídky to byly. Odhadovat se to nemá:
     každý krok teď řekne, kolik komu vzal. */
  const ubytky = new Map();
  const ubralo = (krok, o) => {
    const zdroj = zdrojNabidky(o, znamaJmena) || 'neznámý zdroj';
    const z = ubytky.get(zdroj) || {};
    z[krok] = (z[krok] || 0) + 1;
    ubytky.set(zdroj, z);
  };
  const podleInzeratu = raw
    .filter(valid)
    .filter((o) => {
      const k = (o.type + '|' + o.okres + '|' + (o._key || o.parcel)).toLowerCase();
      if (seen.has(k)) { ubralo('duplicita', o); return false; }
      seen.add(k);
      return true;
    });
  /* A ještě týž pozemek pod dvěma čísly inzerátu — viz bezDvojnic(). */
  const { cisto, vyhozeno: dvojnici } = bezDvojnic(podleInzeratu);
  if (dvojnici.length) {
    console.log(`Dvojníci (týž pozemek pod jiným číslem inzerátu): ${dvojnici.length} vynecháno`);
    for (const o of dvojnici.slice(0, 5)) console.log(`  · ${o.place}, okres ${o.okres} — ${o.area} m², ${o.price} Kč (${o.druh})`);
  }
  /* A inzeráty se zástupnou cenou („cena na dotaz" napsaná jako 5 000 Kč). */
  const zast = bezZastupnychCen(cisto);
  if (zast.vyhozeno.length) {
    console.log(`Zástupná cena (nesmyslně nízká proti svému druhu): ${zast.vyhozeno.length} vynecháno`);
    for (const o of zast.vyhozeno.slice(0, 5)) {
      console.log(`  · ${o.place}, okres ${o.okres} — ${o.area} m², ${o.price} Kč`
        + ` = ${Math.round(o.price / o.area)} Kč/m² (${o.druh}, práh ${Math.round(zast.prahy[o.druh || '?'])})`);
    }
  }
  for (const druh of zast.neduveryhodnyDruh) {
    console.error(`POZOR: u druhu „${druh}" by síto zástupných cen vyhodilo víc než`
      + ` ${STROP_VYHOZENI * 100} % nabídek, takže nevyhodilo nic. Podívejte se, jestli`
      + ' se u toho druhu nestahují ceny za jinou jednotku.');
  }
  for (const o of dvojnici) ubralo('dvojnik', o);
  for (const o of zast.vyhozeno) ubralo('zastupnaCena', o);
  const clean = zast.cisto.sort(byDeal);

  // Vyvážený výběr — ať žádná kategorie nepřeváží (jinak by stovky prodejů
  // zaplavily mapu). Dražby/exekuce bereme podle výhodnosti; u prodeje vybíráme
  // pestrý vzorek napříč cenami (ne jen nejlevnější slivery), ať je mapa zajímavá.
  const CAP = { drazba: 1300, exekuce: 1000, obec: 250 };
  const byType = {};
  for (const o of clean) (byType[o.type] || (byType[o.type] = [])).push(o);
  const sale = byType.sale || [];
  const vyber = vyberProdeje(sale, (o) => zdrojNabidky(o, znamaJmena));
  for (const r of hlaskyVyberu(vyber)) console.log(r);
  for (const r of vyber.varovani) console.error('POZOR: ' + r);
  const saleSel = vyber.vybrane;
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

  /* A TEĎ TY POSLEDNÍ TŘI KROKY DO ÚČTU. Nalezeno smyčkou sebevývoje
     4. 11.: zdroj Dražby stáhl 45 nabídek, síto nepustilo 6 a na webu
     jich bylo 20 — tedy 19 zmizelo beze jména. Účet končil u duplicit,
     dvojníků a zástupných cen, ale tři kroky za nimi se nepočítaly
     vůbec: proběhlá dražba, strop na druh a vyvážený výběr prodejů.
     První z nich těch devatenáct vysvětlil celý.
     Je to §366 doslova: každý krok, který nabídku zahodí, se má
     jmenovat a počítat — a počítat KOMU, jinak se u zdroje nepozná,
     jestli ubývá právem. */
  for (const o of (byType.drazba || [])) if (!jesteBezi(o)) ubralo('drazbaProbehla', o);
  for (const o of (byType.exekuce || [])) if (!jesteBezi(o)) ubralo('drazbaProbehla', o);
  for (const o of drazby.slice(CAP.drazba)) ubralo('stropDruhu', o);
  for (const o of exekuce.slice(CAP.exekuce)) ubralo('stropDruhu', o);
  for (const o of (byType.obec || []).slice(CAP.obec)) ubralo('stropDruhu', o);
  const vybraneProdeje = new Set(saleSel);
  for (const o of sale) if (!vybraneProdeje.has(o)) ubralo('vyvazenyVyber', o);
  for (const [zdroj, kroky] of ubytky) {
    const souhrn = Object.entries(kroky).sort((a, b) => b[1] - a[1])
      .map(([k, n]) => k + ' ' + n).join(', ');
    console.error(`Zdroj ${zdroj}: za sítem ubylo`
      + ` ${Object.values(kroky).reduce((a, b) => a + b, 0)} nabídek — ${souhrn}.`);
  }
  /* A DO DAT, ne jen do logu — ze stejného důvodu jako u sítě výš:
     log po běhu zmizí, kdežto podle tohohle čísla pozná nálezce
     (scripts/nalezce.mjs), jestli je úbytek vysvětlený. */
  for (const z of zdroje) {
    const kroky = ubytky.get(z.nazev);
    z.zaSitem = kroky ? Object.values(kroky).reduce((a, b) => a + b, 0) : 0;
    z.zaSitemDuvod = kroky
      ? Object.entries(kroky).sort((a, b) => b[1] - a[1]).map(([k, n]) => k + ' ' + n).join(', ')
      : null;
  }

  const fresh = [
    ...saleSel,
    ...drazby.slice(0, CAP.drazba),
    ...exekuce.slice(0, CAP.exekuce),
    ...(byType.obec || []).slice(0, CAP.obec),
  ];

  /* JMÉNO OBCE SE OČISTÍ NA JEDNOM MÍSTĚ, ne v každém stahovači zvlášť.
     Pokazit ho umí tři různé zdroje třemi různými způsoby (viz jmenoObce
     výš), a kdyby si to každý řešil sám, rozejdou se. */
  let ocistenoMist = 0;
  for (const o of fresh) {
    const lepsi = jmenoObce(o.place);
    if (lepsi && lepsi !== o.place) {
      console.log(`Jméno obce očištěno: ${JSON.stringify(o.place)} → ${JSON.stringify(lepsi)}`);
      o.place = lepsi; ocistenoMist++;
    } else if (!lepsi) {
      /* Dnes se to nestane ani jednou z 1 041 jmen; kdyby se to stalo,
         je lepší okres než věta z inzerátu — a hlavně se to ohlásí. */
      console.error(`POZOR: z ${JSON.stringify(o.place)} se nedalo přečíst jméno obce,`
        + ` beru okres (${o.okres}).`);
      o.place = String(o.okres || 'Pozemek');
    }
  }
  if (ocistenoMist) console.log(`Očištěných jmen obcí: ${ocistenoMist}.`);

  if (fresh.length === 0) {
    console.log('Žádný zdroj zatím nevrací data — ponechávám stávající soubor beze změny.');
    return;
  }

  /* Pojistka proti „utržení" dat: když je nově staženo výrazně míň než
     minule, NEPŘEPISUJEME — necháme stará data a skončíme s chybou, ať
     úloha spadne a GitHub pošle majiteli upozornění.

     DRŽENÉ NABÍDKY SE DO POJISTKY NEPOČÍTAJÍ. Kdyby se počítaly, stačilo
     by, aby mlčely všechny zdroje: jejich nabídky by se podržely, počet
     by zůstal, pojistka by neřekla nic a běh by vypadal zdravě. Měří se
     proto jen to, co se dnes opravdu stáhlo, a proti té části minulých
     dat, která držením nevznikla. Jeden vypadlý zdroj tím pojistku
     nespustí (jeho nabídky zmizí z obou stran poměru), celkový propad
     ano. */
  let prevCount = 0;
  try { prevCount = (JSON.parse(readFileSync(OUT, 'utf8')).opportunities || []).length; } catch { /* první běh */ }
  const drzenych = fresh.filter((o) => o && o.drzeno_od).length;
  const stazeno = fresh.length - drzenych;
  const minuleBezDrzeni = Math.max(0, prevCount - drzenych);
  if (minuleBezDrzeni >= 30 && stazeno < minuleBezDrzeni * 0.6) {
    console.error(
      `CHYBA: dnes staženo jen ${stazeno} příležitostí (minule ${minuleBezDrzeni}` +
      `${drzenych ? `, mimo ${drzenych} držených` : ''}). ` +
      'Nejspíš se rozbil některý zdroj — ponechávám stará data a končím s chybou, ať přijde upozornění.'
    );
    process.exit(1);
  }

  /* ULICE V POLI PRO OBEC — TEĎ, PŘED DOHLEDÁVÁNÍM POLOHY. Pořadí tu
     není libovolné: podle `place` se o pár desítek řádků níž geokóduje
     (`geocodeName(o.place, o.okres)`), takže dokud tam stojí ulice,
     hledá se v mapě ulice. Oprava proto patří před to. */
  const uliceVObci = opravUliceVObci(fresh);
  if (uliceVObci) console.log(`Opraveno míst, kde v poli pro obec stála ulice: ${uliceVObci}.`);

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
  /* A OTISK INZERENTA ROVNOU DO DAT. Verdikt „Výhodná cena" znamená
     „levnější než X % srovnatelných nabídek" — a ten výpočet musí vědět,
     kdo nabídku napsal, jinak se jeden velkoobchodník s devíti sty
     nabídkami počítá jako devět set nezávislých pozorování trhu
     (naměřeno, viz otiskInzerenta v scripts/text-inzeratu.mjs).
     Jméno v datech není, pozná se podle jeho vlastního textu — a protože
     popis je právě tady po ruce, počítá se to tady. Do opportunities.json
     jde jen šest znaků otisku, ne celý popis. */
  for (const o of fresh) {
    if (!o._popis) continue;
    const t = bezEmodzi(o._popis);
    if (t) popisy[klicNabidky(o)] = t;
    const otisk = otiskInzerenta(t);
    if (otisk) o.inz = otisk;
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
  let driveVse = [];
  try { driveVse = (JSON.parse(readFileSync(OUT, 'utf8')).opportunities || []).filter((o) => o.first_seen); }
  catch { /* první běh — všechno je nové */ }
  const vysledek = prirazPrvniVideni(fresh, driveVse, dnesISO, znamaJmena);
  if (vysledek.podleOdkazu) console.log(`Věk podle odkazu na inzerát: ${vysledek.podleOdkazu} nabídek.`);
  if (vysledek.poZmeneCeny) console.log(`Věk zachován i po změně ceny: ${vysledek.poZmeneCeny} nabídek.`);
  console.log(`Poprvé viděno dnes: ${vysledek.novych} z ${fresh.length}` +
    (driveVse.length ? '' : ' (první běh se značkováním — všechno dostalo dnešek)'));

  /* ČTVRTÉ SÍTO: nejde o počet ani o cenu, ale o TOTOŽNOST. Zdroj může
     poslat stejně nabídek za stejné ceny a přitom změnit tvar dat tak,
     že se nespáruje nic (viz porovnejTotoznost). Nabídky se NEZAHAZUJÍ
     — jsou to pravděpodobně tytéž pozemky. Jen se jim nesmí věřit
     datum prvního vidění, takže se označí a z novinek vypadnou.
     Totéž, co novinky-rez.mjs dělá s prvním dnem evidence.

     DO HISTORIE ZDROJŮ SE TENHLE STAV NEDOSTANE, a je to tak správně:
     historie se zapisuje výš a slouží hlídačům POČTŮ. Příznak v ní
     znamená „tomuhle dni nevěř jako normě počtu" — a počet tady
     v normě je, nesedí jen totožnost. Stav jde do `payload.sources`,
     tedy do dat, ze kterých čte diagnostika. */
  for (const n of porovnejTotoznost(vysledek.podleZdroje, driveVse, znamaJmena)) {
    const z = zdroje.find((x) => x.nazev === n.nazev);
    if (z) z.stav = 'jinaIdentita';
    let oznaceno = 0;
    for (const o of fresh) {
      if (zdrojNabidky(o, znamaJmena) !== n.nazev || o.first_seen !== dnesISO) continue;
      /* ZNAČKA NESE DEN, ne jen „ano". Dědí se dál (prenesZnacku),
         takže samo „ano" by nešlo odlišit od přeznačení před měsícem —
         a archiv, který se podle ní má na jeden den zdržet, by zamrzl
         natrvalo. Pro novinky a RSS je to pořád jen pravdivostní
         hodnota: věk neznámý zůstává neznámý. */
      o.prezn = dnesISO; oznaceno++;
    }
    console.error(`POZOR: u zdroje ${n.nazev} se dnes nespárovalo ${n.novych}`
      + ` z ${n.celkem} nabídek (${Math.round(n.podil * 100)} %), včera jich bylo ${n.vcera}.`
      + ' Tolik nabídek za den nevymění ani velký portál; vypadá to, že zdroj změnil TVAR'
      + ' dat — jiná jména obcí, jiná jednotka výměry nebo jiné označení parcel.'
      + ` Nabídky se berou dál, ale ${oznaceno} z nich má věk označený za neznámý`
      + ' a mezi novinky nejdou.');
  }

  /* Zlevnil majitel? Porovná se s cenami z minulého běhu — ještě než se
     soubor přepíše. „Majitel sám šel dolů o 25 %" je fakt, kdežto odhad
     proti okolí je model; pro kupujícího je to silnější informace. */
  {
    let minuleNabidky = [];
    try { minuleNabidky = JSON.parse(readFileSync(OUT, 'utf8')).opportunities || []; } catch { /* první běh */ }
    const zmen = spojCeny(minuleNabidky, fresh, new Date());
    if (zmen) console.log(`Změna ceny u ${zmen} nabídek proti minulému běhu.`);
  }

  /* ---- KATEGORIE NEMOVITOSTI, NA JEDNOM MÍSTĚ PRO VŠECHNY ZDROJE ----
     Zdroj, který kategorii zná (ÚZSVM ji má v číslu své kategorie), si
     ji nastaví sám a tady se nepřepisuje — proto `if (!o.kat)`. Zbytku
     se pozná z textu: dražební rejstříky ani inzeráty nic takového
     nehlásí a dávají jen název a popis.

     POZEMEK SE DO DAT NEZAPISUJE, A TO JE ÚMYSL. `data/opportunities.json`
     čte úvodní stránka a každý kilobajt v něm stojí čas na telefonu;
     `,"kat":"pozemek"` u 2 303 nabídek je ~37 kB navíc za informaci,
     která je výchozí. Čtenáři si ji doplní přes PKKategorie.klic(),
     takže dnešní soubor zůstane bajt za bajtem stejný a pole se objeví
     teprve u toho, co pozemek není. */
  {
    const pocty = {};
    for (const o of fresh) {
      if (!o.kat) {
        const txt = [o.place, o.druh, o.extra, o.nazev, o.titulek].filter(Boolean).join(' ');
        const k = parseKategorie(txt, [o.place, o.okres]);
        /* ZDROJ MŮŽE VĚDĚT MÍŇ, ALE PŘESTO DOST. ÚZSVM u kategorií
           „Stavby" a „Jiné objekty" neřekne, co to je, ale ŘEKNE, že to
           není pozemek (`_neniPozemek`). Když z textu nic nevyjde,
           nesmí z budovy být pozemek: výměra by se brala jako plocha
           pozemku a obvyklá cena za m² by byla číslo bez významu.
           Taková nabídka je proto „jiná nemovitost" — poctivé „nevím
           co, ale pozemek to není". */
        if (k !== PKKategorie.VYCHOZI) o.kat = k;
        else if (o._neniPozemek) o.kat = 'jine';
      }
      const k = o.kat || PKKategorie.VYCHOZI;
      pocty[k] = (pocty[k] || 0) + 1;
      /* A PRACOVNÍ PŘÍZNAK SE DO DAT NEPOSÍLÁ. `_neniPozemek` je
         vzkaz mezi čtečkou zdroje a tímhle místem; jakmile se z něj
         stala `kat`, dosloužil. Naměřeno naostro 5. 11.: první běh
         s nepozemkovými nabídkami ho vyvezl do data/opportunities.json
         u všech 30 — a tím ke každému, kdo si ta data vezme. Chytil to
         hlídač popisu dat („_neniPozemek — kdo si data vezme, musel by
         hádat"), protože smlouva o datech o takovém poli nic neříká.
         Vyhazuje se tady, ne u `_gps` a `_key` o pár set řádků výš:
         tam ještě potřebný je. */
      bezPracovnich(o);
    }
    console.log('Podle kategorie:', JSON.stringify(pocty));
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
