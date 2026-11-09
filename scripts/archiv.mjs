/* ARCHIV NABÍDEK — co se nabízelo, za kolik a jak dlouho.
   ====================================================================
   Spuštění:  node scripts/archiv.mjs              (jeden krok za dnešek)
              node scripts/archiv.mjs --zpetne     (dopočítá z historie gitu)

   PROČ VŮBEC. Web zná jen dnešek: data/opportunities.json se při každém
   běhu robota přepíše celé. Když nabídka zmizí, zůstane po ní náhrobek,
   který se po 90 dnech smaže (DNI_ARCHIV v generate-parcel-pages.mjs) —
   a pak už nikde není, že ten pozemek byl za tolik nabízený od–do.
   Přitom je to jediný údaj o trhu, který tenhle web získává sám a nikdo
   jiný ho takhle nemá: NABÍDKOVÁ CENA A DOBA NA TRHU.

   Ceny v katastru jsou kupní, ale veřejně se k nim takhle nedostaneš.
   Doba, po kterou nabídka visela, než zmizela, je nejbližší veřejný
   odhad toho, jestli byla cena reálná.

   JAK TO UKLÁDÁ. Jeden řádek JSON na jeden řádek souboru (JSONL),
   jeden soubor na měsíc, a NIKDY SE NIC NEPŘEPISUJE. Je to schválně:
     · velké pole v jednom JSON by se při každém přírůstku přepsalo celé
       a git by si pamatoval celou kopii — takhle vidí ten jeden nový
       řádek a repozitář neroste;
     · SQLite ani Parquet do gitu nepatří. Jsou binární, nejdou
       porovnat a každá verze se uloží znovu. Když bude potřeba se
       v archivu dotazovat, vyrobí se z těchhle řádků kdykoli.

   CO JE ŘÁDEK. Uzavřené období, kdy jedna nabídka visela za jednu cenu:
     k  klíč pozemku (místo|parcela|okres|šířka|délka — bez ceny!)
     m  obec, o okres, d druh, t typ nabídky (prodej/dražba/exekuce)
     v  výměra m², c cena Kč
     od, do  první a naposled viděna (YYYY-MM-DD)
     proc  'zmizela' (ze zdroje) nebo 'cena' (změnila se, běží dál)

   Klíč NESMÍ obsahovat cenu — jinak by každá sleva vypadala jako nový
   pozemek a doba na trhu by se počítala od nuly. Proto pkey(), ne
   klicNabidky().
   ==================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { pkey } from './generate-parcel-pages.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ADR = path.join(KOREN, 'data', 'archiv');
const STAV = path.join(ADR, 'stav.json');

/* KLÍČ I ODSTRANĚNÍ DUPLICIT BERE ARCHIV Z TÝCHŽE MODULŮ JAKO WEB.
   Kdyby si to tu počítal po svém, archiv by si pamatoval něco jiného,
   než co web ukazuje — a to je právě ten druh rozdílu, který se pozná
   až za rok, kdy už se s tím nedá nic dělat. */
const _req = createRequire(import.meta.url);
const KLIC = _req(path.join(KOREN, 'js', 'klic.js')).PKKlic;
const PKH = _req(path.join(KOREN, 'js', 'hlidani-logika.js'));
const PKC = _req(path.join(KOREN, 'js', 'cisteni.js'));

/* VERZE STAVU. Při změně klíče se stará podoba MUSÍ zahodit, jinak by
   se v jednom souboru potkaly dvě soustavy klíčů: všechno staré by
   vypadalo jako zmizelé a všechno nové jako právě přidané. */
export const VERZE = 2;

/* VERDIKT O ULOŽENÉM STAVU — ODDĚLENĚ OD ČTENÍ SOUBORU.
   „Tenhle stav se smí použít" je nejdražší rozhodnutí celého archivu.
   Přijmout stav s cizí soustavou klíčů znamená, že všechno staré
   vypadá jako zmizelé a všechno nové jako právě přidané — a pozná se
   to až za rok, kdy už se s tím nedá nic dělat.
   Dřív to rozhodnutí stálo uprostřed nactiStav(), která čte soubor
   a končí `process.exit(1)`, takže se nedalo prokázat zkouškou:
   sabotážní stroj v něm obrátil `===` na `!==` i `&&` na `||` a žádný
   hlídač se neozval (slepé místo, nález z 4. 11.). Teď je to čistá
   funkce o třech odpovědích a zkouška ji drží na všech třech. */
export function verdiktStavu(s) {
  const je = !!s && typeof s === 'object' && typeof s.nabidky === 'object';
  if (je && s.verze === VERZE) return 'ok';
  if (je) return 'stará';
  return 'nic';
}

export function nactiStav(cesta = STAV) {
  let s = null;
  try { s = JSON.parse(fs.readFileSync(cesta, 'utf8')); }
  catch (e) { /* není, začíná se od nuly */ }
  const v = verdiktStavu(s);
  if (v === 'ok') return s;
  /* Starou verzi nejde dopočítat, jen přepočítat z historie gitu
     (node scripts/archiv.mjs --prepocitat). Tiše ji přijmout je
     to nejhorší, co se dá udělat. */
  if (v === 'stará') {
    console.error(`::error::data/archiv/stav.json je verze ${s.verze}, čekám ${VERZE}.`
      + ' Spusťte: node scripts/archiv.mjs --prepocitat');
    process.exit(1);
  }
  return { verze: VERZE, den: '', nabidky: {} };
}

/* Z jedné nabídky udělá to, co si o ní archiv pamatuje. Víc ne: popisy
   ani odkazy do archivu nepatří, jsou cizí a stárnou. */
function zaznam(d) {
  return { c: Math.round(d.price || 0), v: Math.round(d.area || 0),
    m: d.place || '', o: d.okres || '', dr: d.druh || '', t: d.type || '' };
}

/* JEDEN KROK: stav + dnešní nabídky → nový stav a uzavřené řádky.
   Čistá funkce, aby se dala zkoušet bez souborů i bez gitu. */
/**
 * Dny, kdy některý zdroj změnil TVAR dat (značka `prezn`).
 *
 * PROČ TO ARCHIV MUSÍ VĚDĚT. Klíč archivu vychází z adresy inzerátu,
 * takže zdroj, který přes noc přeznačí identitu, by se tu zapsal jako
 * ~1 600 ZMIZELÝCH nabídek a 1 600 nových — a archiv je přírůstkový,
 * takže by ten den v historii zůstal navždy. Statistika „jak rychle
 * nabídky mizí" by z toho dostala 1 600 vymyšlených životností.
 * Takový den se proto nezapočítá vůbec; je to totéž, co už archiv umí
 * u dne, který je započítaný (viz krokDneska).
 */
export function dnyPrezneceni(nabidky) {
  const dny = new Set();
  for (const o of (nabidky || [])) {
    if (o && typeof o.prezn === 'string') dny.add(o.prezn);
  }
  return dny;
}

/* PŘEJMENOVÁNÍ KLÍČŮ BEZ ZAPOČÍTÁNÍ DNE.
 * ======================================================================
 * `krok()` dělá dvě věci naráz: počítá den (zavírá zmizelé, zapisuje
 * změny ceny) a PŘEJMENOVÁVÁ klíče nabídkám, kterým se změnila poloha.
 * To druhé ale nesmí záviset na tom prvním — a dosud záviselo:
 * `krokDneska()` se při druhém běhu téhož dne otočí ve dveřích
 * („dnešek už je započítaný"), takže se klíče nepřejmenovaly.
 *
 * Naměřeno 8. 11. 2026: robot běžel ten den podruhé s opraveným
 * semenem rozptylu, všechny nabídky z Bezrealitek dostaly nový bod
 * a tím nový klíč — a archiv o nich přestal vědět. Zkouška
 * test-sliby-data to ohlásila jako „archiv se od dnešního souboru
 * rozešel: živých 3 415, dnes 3 419, navíc 3 247" a test-data-rezy
 * jako „historie cen na řez dosedla jen u 1 z 10".
 *
 * Tahle funkce proto umí jen to přejmenování: žádné zavírání, žádné
 * počítání dne, žádná změna `od` ani `videno`. Páruje se podle otisku
 * adresy inzerátu za mřížkou, úplně stejně jako v krok(). */
export function premapujKlice(stav, nabidky) {
  const cista = PKH.bezDuplicit(PKC.pozemky((nabidky || []).filter((d) => d && d.place && d.okres)));
  const zive = new Map();
  for (const d of cista) {
    const k = KLIC.klicArchivu(d);
    if (!zive.has(k)) zive.set(k, d);
  }
  const podleInzeratu = new Map();
  for (const k of Object.keys(stav.nabidky || {})) {
    const h = k.slice(k.lastIndexOf('#') + 1);
    if (!h || /^v\d*$/.test(h)) continue;
    podleInzeratu.set(h, podleInzeratu.has(h) ? null : k);
  }
  /* DRUHÁ CESTA PRO NABÍDKY BEZ ADRESY INZERÁTU. Dražby z registrů
     adresu nemají, takže jim klíč končí záchytným `#v<výměra>` a podle
     otisku se spárovat nedají. Páruje se u nich OBSAH záznamu — obec,
     okres, druh, typ, výměra i cena musí sedět do posledního znaku —
     a jen tehdy, když takový záznam je v archivu právě jeden a v dnešním
     souboru taky právě jeden. Dva stejné záznamy se nepárují: hádat,
     který je který, je horší než nepárovat. Naměřeno 8. 11. 2026:
     bez téhle cesty zůstalo po přesunu 432 nabídek, které archiv
     přestal poznávat. */
  const otisk = (z) => [z.m, z.o, z.dr, z.t, z.v, z.c].join('|');
  const podleObsahu = new Map();
  for (const k of Object.keys(stav.nabidky || {})) {
    const h = k.slice(k.lastIndexOf('#') + 1);
    if (!/^v\d*$/.test(h)) continue;           // tahle cesta je jen pro bezadresné
    const o = otisk(stav.nabidky[k]);
    podleObsahu.set(o, podleObsahu.has(o) ? null : k);
  }
  const dnesniObsah = new Map();
  for (const [k, d] of zive) {
    const h = k.slice(k.lastIndexOf('#') + 1);
    if (!/^v\d*$/.test(h)) continue;
    const o = otisk(zaznam(d));
    dnesniObsah.set(o, dnesniObsah.has(o) ? null : k);
  }

  const novy = Object.assign({}, stav.nabidky);
  const pouzite = new Set();
  const prejmenovani = new Map();
  let premapovano = 0;
  for (const [k, d] of zive) {
    if (novy[k]) continue;
    const h = k.slice(k.lastIndexOf('#') + 1);
    let stary = (h && !/^v\d*$/.test(h)) ? podleInzeratu.get(h) : null;
    if (!stary && /^v\d*$/.test(h)) {
      const o = otisk(zaznam(d));
      stary = (dnesniObsah.get(o) === k) ? podleObsahu.get(o) : null;
    }
    if (!stary || zive.has(stary) || pouzite.has(stary) || !novy[stary]) continue;
    novy[k] = novy[stary];
    delete novy[stary];
    pouzite.add(stary);
    prejmenovani.set(stary, k);
    premapovano++;
  }
  return { nabidky: novy, premapovano, prejmenovani };
}

export function krok(stav, nabidky, den) {
  /* NEJDŘÍV DUPLICITY, PAK KLÍČ — a obojí tak, jak to dělá web.
     Dřív tu stálo `if (!zive.has(pkey(d))) zive.set(...)` s poznámkou
     „duplicity řeší web jinde; tady platí první". To odstranění duplicit
     opravdu zastávalo, jenže pkey je hrubý: 38 klíčů sedí na 94 nabídek
     a u 25 z nich se liší cena. Dva různé pozemky v jedné vsi tím
     splynuly v jednu nabídku a archiv si podle pořadí v souboru
     zapisoval, že „zlevnila" a zdražila zpátky. Osm ze 138 změn ceny
     takhle vzniklo a nikdy se nestalo.
     Teď duplicity odstraňuje PKHlidani.bezDuplicit (tentýž modul jako
     mapa) a klíč rozlišuje podle adresy inzerátu (PKKlic.klicArchivu). */
  /* POŘADÍ MUSÍ BÝT TOTÉŽ JAKO V APLIKACI: nejdřív PKCisteni.pozemky
     (js/main.js ho volá na načtená data), až potom PKHlidani.bezDuplicit
     (volá ho boot()). Když jsem to zkusil jen přes bezDuplicit nad
     surovými daty, vybralo z dvojice duplicit JINÉHO zástupce než web —
     a protože klíč archivu vychází z adresy inzerátu, sedlo z 131
     historií na nabídky jen 73. Dedup musí být tatáž cesta, ne jen
     tatáž funkce. */
  const cista = PKH.bezDuplicit(PKC.pozemky((nabidky || []).filter((d) => d && d.place && d.okres)));
  const zive = new Map();
  for (const d of cista) {
    const k = KLIC.klicArchivu(d);
    if (!zive.has(k)) zive.set(k, d);
  }
  const novy = { verze: VERZE, den, nabidky: {} };
  const uzavrene = [];

  /* TÁŽ NABÍDKA POD NOVÝM KLÍČEM SE NESMÍ ZAPSAT JAKO ZMIZELÁ.
     =================================================================
     Klíč archivu je `pkey(d) + '#' + otisk(adresy inzerátu)`, a pkey
     nese SOUŘADNICE na tři desetinná místa. Když se tedy u nabídky
     změní poloha — a to se stává, aniž by se cokoli stalo s pozemkem —
     klíč je jiný a archiv to vidí jako „stará zmizela, nová přišla".
     Naměřeno 8. 11. 2026: Bezrealitky se přečetly novou, povolenou
     cestou, na které poloha vychází z obce, a 3 151 nabídek tím
     dostalo nový klíč. Nic z toho nezmizelo — inzeráty visí dál.
     Archiv je přírůstkový, takže těch 3 151 vymyšlených životností by
     v historii zůstalo navždy a statistika „jak rychle nabídky mizí"
     by o ně byla pokřivená.
     Páruje se podle TOHO OTISKU ZA MŘÍŽKOU: je to otisk adresy
     inzerátu, tedy jediná věc v klíči, která nabídku opravdu
     identifikuje. Záchytný tvar `#v<výměra>` (nabídka bez adresy) se
     nepáruje — ten dvě různé nabídky nerozliší.
     Tím se zároveň nemusí vymýšlet nová VERZE klíče: změnila se data,
     ne soustava klíčů. */
  const podleInzeratu = new Map();
  for (const k of Object.keys(stav.nabidky)) {
    const h = k.slice(k.lastIndexOf('#') + 1);
    if (!h || /^v\d*$/.test(h)) continue;
    /* Dvojznačný otisk (dvě uložené nabídky pod týmž inzerátem) se
       nepáruje vůbec — hádat, která je která, je horší než nepárovat. */
    podleInzeratu.set(h, podleInzeratu.has(h) ? null : k);
  }
  /* MAPA, NE MNOŽINA: potřebuje se i to, NA CO se přejmenovalo, aby
     se podle ní daly srovnat i už uzavřená období (viz
     prejmenujVUzavrenych). Dokud to byla množina, přejmenoval se
     jenom živý stav a historie nabídky zůstala viset pod starým
     klíčem — graf ceny i filtr „Zlevněné" ji pak nenašly. */
  const prestehovane = new Map();

  for (const [k, d] of zive) {
    const z = zaznam(d);
    let byl = stav.nabidky[k];
    if (!byl) {
      const h = k.slice(k.lastIndexOf('#') + 1);
      const stary = (h && !/^v\d*$/.test(h)) ? podleInzeratu.get(h) : null;
      if (stary && !zive.has(stary) && !prestehovane.has(stary)) {
        byl = stav.nabidky[stary];
        prestehovane.set(stary, k);
      }
    }
    if (!byl) {
      /* first_seen ze zdroje je lepší než dnešek — nabídka mohla viset
         dřív, než ji tenhle archiv poprvé uviděl. Dopředu se ale věřit
         nedá: datum v budoucnosti se zahodí. */
      /* ROVNOCENNÁ SABOTÁŽ: obrácené porovnání (<= na <) — pro first_seen rovné dnešku dají obě varianty tentýž den, takže ta mutace nemůže změnit ani jeden výsledek; není to slepé místo zkoušky, ale mutace bez následku. */
      const od = (typeof d.first_seen === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.first_seen)
        && d.first_seen <= den) ? d.first_seen : den;
      novy.nabidky[k] = Object.assign({ od, videno: den }, z);
      continue;
    }
    if (byl.c !== z.c) {
      uzavrene.push({ k, m: byl.m, o: byl.o, dr: byl.dr, t: byl.t,
        v: byl.v, c: byl.c, od: byl.od, do: byl.videno, proc: 'cena' });
      novy.nabidky[k] = Object.assign({ od: den, videno: den }, z);
      continue;
    }
    novy.nabidky[k] = Object.assign({ od: byl.od, videno: den }, z);
  }

  for (const k of Object.keys(stav.nabidky)) {
    if (zive.has(k) || prestehovane.has(k)) continue;
    const byl = stav.nabidky[k];
    uzavrene.push({ k, m: byl.m, o: byl.o, dr: byl.dr, t: byl.t,
      v: byl.v, c: byl.c, od: byl.od, do: byl.videno, proc: 'zmizela' });
  }
  return { stav: novy, uzavrene, prestehovano: prestehovane.size, prejmenovani: prestehovane };
}

/**
 * PŘEJMENOVÁNÍ MUSÍ DOJÍT I DO UZAVŘENÝCH OBDOBÍ.
 * ====================================================================
 * Když nabídka dostane nový klíč (změní se jí poloha nebo okres),
 * přejmenuje se v živém stavu — ale její už uzavřená období leží
 * v data/archiv/*.jsonl pod klíčem STARÝM. Historie ceny se tím
 * rozpadne na dvě půlky, které k sobě nikdo nepřiřadí: graf na stránce
 * pozemku se přestane kreslit a filtr „Zlevněné" nabídku nenajde.
 *
 * Změřeno 9. 11. 2026: po opravě okresu u Bezrealitek sedělo na živou
 * nabídku 6 uzavřených klíčů z 1 049, zatímco den předtím 581. Filtr
 * „Zlevněné" spadl ze 129 nabídek na jednu.
 *
 * Soubory se přepisují na místě. Je to jediné místo v archivu, které
 * to dělá — jinak se jen připojuje (viz pripoj). Přejmenování ale
 * nemění ani jeden ÚDAJ o trhu: záznam zůstane celý, jen se mu opraví
 * jméno nabídky, ke které patří.
 * @returns {number} kolik řádků se přepsalo
 */
export function prejmenujVUzavrenych(prejmenovani, adresar = ADR) {
  if (!prejmenovani || !prejmenovani.size || !fs.existsSync(adresar)) return 0;
  let zasazeno = 0;
  for (const f of fs.readdirSync(adresar).filter((x) => x.endsWith('.jsonl')).sort()) {
    const cesta = path.join(adresar, f);
    let zmena = false;
    const radky = fs.readFileSync(cesta, 'utf8').split('\n').map((r) => {
      if (!r.trim()) return r;
      let z; try { z = JSON.parse(r); } catch (e) { return r; }
      const novy = prejmenovani.get(z.k);
      if (!novy || novy === z.k) return r;
      z.k = novy; zmena = true; zasazeno++;
      return JSON.stringify(z);
    });
    if (zmena) fs.writeFileSync(cesta, radky.join('\n'));
  }
  return zasazeno;
}

export function pripoj(uzavrene) {
  if (!uzavrene.length) return 0;
  fs.mkdirSync(ADR, { recursive: true });
  const podle = new Map();
  for (const r of uzavrene) {
    const mes = r.do.slice(0, 7);
    if (!podle.has(mes)) podle.set(mes, []);
    podle.get(mes).push(JSON.stringify(r));
  }
  for (const [mes, radky] of podle) {
    fs.appendFileSync(path.join(ADR, mes + '.jsonl'), radky.join('\n') + '\n');
  }
  return uzavrene.length;
}

function nabidkyZe(text) {
  try {
    const j = JSON.parse(text);
    return Array.isArray(j) ? j : (j.opportunities || []);
  } catch (e) { return null; }
}

function dnes() { return new Date().toISOString().slice(0, 10); }

/* POSLEDNÍ OTISK DNE, NE PRVNÍ. Z výpisu gitu („<hash> <datum>", jeden
   na řádek, nejstarší první) nechá z každého dne ten POSLEDNÍ zápis.
   Komentář u zpětného dopočtu to slibuje („stačí poslední stav dne"),
   kód ale kdysi bral první: podmínka `den === posledniDen` přeskočila
   všechny další commity téhož dne. Robot běží čtyřikrát denně a zdroje
   blikají — podle prvního běhu dne vypadala nabídka, která se do večera
   vrátila, jako zmizelá.

   PROČ TO STOJÍ ZVLÁŠŤ: uvnitř `zpetne()` to bylo nezkoušené. Sabotážní
   stroj tam zrušil `filter(Boolean)` a nikdo se neozval, přitom na
   prázdné historii z toho vyjde jeden řádek bez hashe i data, se kterým
   se pak zachází jako s commitem. Teď je to čistá funkce a zkouška ji
   drží i na té prázdné historii. */
export function posledniZaDen(log) {
  const posledni = new Map();
  for (const r of String(log || '').trim().split('\n').filter(Boolean)) {
    const i = r.indexOf(' ');
    posledni.set(r.slice(i + 1), r);          // --reverse: poslední zápis dne vyhraje
  }
  return [...posledni.values()];
}

/* ZPĚTNÝ DOPOČET. Robot commituje data/opportunities.json při každém
   běhu, takže historie trhu v repozitáři JE — jen se v ní nedá hledat.
   Tohle ji projde odzadu dopředu a udělá z ní archiv. Běží jen tehdy,
   když archiv ještě neexistuje; jinak by řádky přibyly podruhé. */
function zpetne({ prepocitat = false } = {}) {
  if (prepocitat && fs.existsSync(ADR)) {
    /* Maže se jen to, co tenhle skript sám vyrábí. */
    for (const f of fs.readdirSync(ADR)) {
      if (f.endsWith('.jsonl') || f === 'stav.json') fs.unlinkSync(path.join(ADR, f));
    }
    console.log('Archiv smazán, počítá se znovu z historie gitu.');
  }
  const log = execFileSync('git', ['log', '--reverse', '--format=%H %ad', '--date=short',
    '--', 'data/opportunities.json'], { cwd: KOREN, encoding: 'utf8', maxBuffer: 1 << 28 });
  const radky = posledniZaDen(log);
  let stav = { verze: VERZE, den: '', nabidky: {} };
  let celkem = 0, pouzito = 0, posledniDen = '';
  for (const r of radky) {
    const [sha, den] = r.split(' ');
    if (den === posledniDen) continue;      // víc běhů za den: stačí poslední stav dne
    let text;
    try { text = execFileSync('git', ['show', sha + ':data/opportunities.json'],
      { cwd: KOREN, encoding: 'utf8', maxBuffer: 1 << 28 }); } catch (e) { continue; }
    const n = nabidkyZe(text);
    if (!n || !n.length) continue;
    const v = krok(stav, n, den);
    stav = v.stav;
    celkem += pripoj(v.uzavrene);
    pouzito++; posledniDen = den;
  }
  fs.writeFileSync(STAV, JSON.stringify(stav, null, 1));
  console.log(`Zpětný dopočet: ${pouzito} dnů z ${radky.length} otisků, uzavřeno ${celkem} období, `
    + `sledovaných nabídek ${Object.keys(stav.nabidky).length}.`);
}

function krokDneska() {
  const n = nabidkyZe(fs.readFileSync(path.join(KOREN, 'data', 'opportunities.json'), 'utf8'));
  if (!n || !n.length) { console.log('Archiv: data/opportunities.json je prázdný, nic se nedělá.'); return; }
  const stav = nactiStav();
  const den = dnes();
  if (stav.den === den) {
    /* Den se nepočítá znovu, ale klíče se srovnat MUSÍ — jinak archiv
       o přesunutých nabídkách přestane vědět (viz premapujKlice). */
    const m = premapujKlice(stav, n);
    if (m.premapovano) {
      stav.nabidky = m.nabidky;
      fs.mkdirSync(ADR, { recursive: true });
      fs.writeFileSync(STAV, JSON.stringify(stav, null, 1));
      /* A TOTÉŽ DO UZAVŘENÝCH OBDOBÍ, jinak zůstane historie nabídky
         pod starým klíčem a graf ceny ji nenajde. */
      const radku = prejmenujVUzavrenych(m.prejmenovani);
      console.log(`Archiv: dnešek už je započítaný, ale ${m.premapovano} nabídkám`
        + ' se změnila poloha a dostaly nový klíč — ten se srovnal, nic se nezavřelo'
        + (radku ? `, a ${radku} uzavřených období se přejmenovalo s nimi` : '') + '.');
    } else {
      console.log('Archiv: dnešek už je započítaný, nic se nedělá.');
    }
    return;
  }
  /* DEN, KDY ZDROJ PŘEZNAČIL IDENTITU, SE NEZAPOČÍTÁVÁ. Viz
     dnyPrezneceni: jinak by do trvalé historie spadlo tisíc
     vymyšlených životností. */
  if (dnyPrezneceni(n).has(den)) {
    console.error('Archiv: dnes některý zdroj změnil tvar dat (značka prezn), takže se'
      + ' tenhle den NEZAPOČÍTÁVÁ — jinak by se do trvalé historie zapsalo, že stovky'
      + ' nabídek zmizely a stovky nových přišly. Archiv zůstává, jaký byl.');
    return;
  }
  const v = krok(stav, n, den);
  /* Přejmenovat uzavřená období MUSÍ jít dřív, než se připojí dnešní:
     ta už se zapisují pod novým klíčem, takže by je druhé přejmenování
     nenašlo — a hlavně se tím nedotkne toho, co právě vzniklo. */
  const prejmenovanychRadku = prejmenujVUzavrenych(v.prejmenovani);
  const pocet = pripoj(v.uzavrene);
  fs.mkdirSync(ADR, { recursive: true });
  fs.writeFileSync(STAV, JSON.stringify(v.stav, null, 1));
  console.log(`Archiv: ${Object.keys(v.stav.nabidky).length} živých nabídek, `
    + `uzavřeno ${pocet} období (${v.uzavrene.filter((x) => x.proc === 'zmizela').length} zmizelo, `
    + `${v.uzavrene.filter((x) => x.proc === 'cena').length} změnilo cenu)`
    + (v.prestehovano ? `, a ${v.prestehovano} nabídek dostalo nový klíč, aniž by zmizely`
      + ' (změnila se jim poloha — viz krok())'
      + (prejmenovanychRadku ? `; ${prejmenovanychRadku} uzavřených období se přejmenovalo s nimi` : '')
      : '') + '.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const prepocitat = process.argv.includes('--prepocitat');
  if (prepocitat || process.argv.includes('--zpetne')) zpetne({ prepocitat }); else krokDneska();
}
