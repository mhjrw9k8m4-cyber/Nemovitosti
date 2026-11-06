/**
 * Čtení nabídek ze stránky, která se změnila.
 * ====================================================================
 * PROČ. Každý stahovač v scripts/fetch-opportunities.mjs má jednu
 * cestu: zná adresu a zná tvar odpovědi. Když zdroj přestaví web nebo
 * přejmenuje pole v API, ta jedna cesta se zavře a zdroj vypadne —
 * dokud ji někdo nepřepíše ručně. §332 zařídil, že to nezmrazí celá
 * data, ale zdroj sám tím běžet nezačne.
 *
 * Tenhle modul je ten druhý způsob, jak se na stránku dostat, a je
 * schválně postavený tak, aby na vzhledu nezávisel. Čte, v tomhle
 * pořadí:
 *   1) JSON-LD (schema.org) — data, která web o sobě sám zveřejňuje
 *      pro vyhledávače. Jsou standardizovaná, takže je přestavba
 *      vzhledu nerozbije; naopak se při redesignu obvykle zachovají,
 *      protože bez nich web zmizí z Googlu.
 *   2) mikrodata (itemprop) — totéž, jen starší zápis.
 *   3) PODLE SIGNÁLU — žádné selektory: najdou se odkazy a kolem nich
 *      se hledá cena a výměra. Tahle cesta nepotřebuje vědět, jak
 *      stránka vypadá, a proto přežije i úplnou přestavbu.
 * A pro případ, že se přestěhoval samotný VÝPIS:
 *   4) RSS a sitemap — odkazy na nabídky, když se výpis přesune jinam.
 *
 * CO TO NEUMÍ a nemá se to tvrdit: uhodnout význam čísla, které na
 * stránce nikdy nebylo. Když zdroj přestane zveřejňovat výměru, žádná
 * z cest ji nevymyslí — a nabídka bez výměry se dál zahodí jako dřív.
 * Tohle je o tom, aby změna VZHLEDU nebo POJMENOVÁNÍ nezavřela zdroj,
 * ne o čtení myšlenek.
 */

/* ---------- čísla z textu ----------------------------------------- */

/** „1 250 000 Kč", „1.250.000,-", „1 250 000" → 1250000. Vrací null,
 *  když to na cenu nevypadá (nesmyslně malé číslo je horší než nic). */
import { PREDPISY, POPISKY_VYMERY, POPISKY_PLOCHY_STAVBY, POPISKY_VYMERY_OBECNE, kategorieZNazvu } from './predpisy-zdroju.mjs';

/**
 * Předpis pro tu adresu, nebo null. Host se bere z adresy a „www."
 * se odřezává: naměřené adresy a klíče v registru se v tom rozcházejí
 * (www.verejnedrazby.cz vs. verejnedrazby.cz) a kvůli třem písmenům
 * by se předpis nenašel.
 */
export function predpisProAdresu(adresa) {
  try {
    const h = new URL(String(adresa || '')).hostname.replace(/^www\./i, '').toLowerCase();
    return PREDPISY[h] || null;
  } catch (e) { return null; }
}

export function cenaZTextu(t) {
  const s = String(t || '');
  /* Hledá se číslo u slova „Kč" nebo u „,-"; samotné číslo na stránce
     může být cokoli (číslo inzerátu, PSČ, rok). */
  const m = /([\d][\d\s\u00a0.,]{2,})\s*(?:Kč|CZK|,-)/i.exec(s);
  if (!m) return null;
  const n = Number(m[1].replace(/[\s\u00a0.]/g, '').replace(',', '.'));
  if (!isFinite(n) || n < 1000 || n > 5e9) return null;
  return Math.round(n);
}

/** „1 234 m²", „1 234 m2", „1,5 ha" → výměra v m². */
export function vymeraZTextu(t) {
  const s = String(t || '');
  let m = /([\d][\d\s\u00a0.,]*)\s*(?:m²|m2|m\^2)/i.exec(s);
  if (m) {
    const n = Number(m[1].replace(/[\s\u00a0.]/g, '').replace(',', '.'));
    if (isFinite(n) && n >= 10 && n <= 5e7) return Math.round(n);
  }
  m = /([\d][\d\s\u00a0.,]*)\s*ha\b/i.exec(s);
  if (m) {
    const n = Number(m[1].replace(/[\s\u00a0]/g, '').replace(',', '.'));
    if (isFinite(n) && n > 0 && n <= 5000) return Math.round(n * 10000);
  }
  return null;
}

/** Text bez značek, s jednou mezerou mezi slovy. */
export function bezZnacek(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ').trim();
}

/* ---------- 1) JSON-LD -------------------------------------------- */

/** Všechny uzly z <script type="application/ld+json"> naplocho. */
export function uzlyJsonLd(html) {
  const ven = [];
  const re = /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(String(html || '')))) {
    let data = null;
    try { data = JSON.parse(m[1].trim()); } catch { continue; }
    const front = [data];
    while (front.length) {
      const x = front.shift();
      if (Array.isArray(x)) { front.push(...x); continue; }
      if (!x || typeof x !== 'object') continue;
      ven.push(x);
      for (const k of ['@graph', 'itemListElement', 'item', 'offers', 'mainEntity', 'about']) {
        if (x[k]) front.push(x[k]);
      }
    }
  }
  return ven;
}

const CISLO = (x) => {
  if (typeof x === 'number') return isFinite(x) ? x : null;
  if (typeof x !== 'string') return null;
  const n = Number(x.replace(/[\s\u00a0]/g, '').replace(',', '.'));
  return isFinite(n) ? n : null;
};

/** Nabídky z JSON-LD. Bere jen uzly, které mají cenu. */
export function zJsonLd(html, zaklad) {
  const ven = [];
  for (const u of uzlyJsonLd(html)) {
    const typ = [].concat(u['@type'] || []).join(' ');
    if (!/Offer|Product|Residence|Apartment|House|Place|RealEstate|Listing|LandLot/i.test(typ)) continue;
    const nabidka = [].concat(u.offers || [])[0] || {};
    const cena = CISLO(u.price) || CISLO(nabidka.price)
      || CISLO((nabidka.priceSpecification || {}).price);
    if (!cena || cena < 1000) continue;
    let vymera = null;
    const plocha = u.floorSize || u.area || u.lotSize;
    if (plocha) {
      vymera = CISLO(plocha.value != null ? plocha.value : plocha);
      const jed = String((plocha.unitCode || plocha.unitText || '')).toUpperCase();
      if (vymera && /HAR|\bHA\b/.test(jed)) vymera = vymera * 10000;
    }
    if (!vymera) vymera = vymeraZTextu(String(u.name || '') + ' ' + String(u.description || ''));
    const adresa = u.address || {};
    const misto = typeof adresa === 'string' ? adresa
      : (adresa.addressLocality || adresa.addressRegion || '');
    ven.push({
      nazev: String(u.name || '').slice(0, 200),
      cena: Math.round(cena),
      vymera: vymera ? Math.round(vymera) : null,
      url: absolutni(u.url || nabidka.url || '', zaklad),
      misto: String(misto || '').slice(0, 80),
      odkud: 'json-ld',
    });
  }
  return ven;
}

/* ---------- 2) mikrodata ------------------------------------------ */

/** Nabídky z itemprop. Hledá se blok s itemprop="price" a kolem něj. */
export function zMikrodat(html, zaklad) {
  const s = String(html || '');
  const ven = [];
  /* BLOK SE BERE PODLE itemscope, NE PODLE OKNA. S oknem ±1500 znaků
     si druhá nabídka vzala odkaz té první a obě ukazovaly na týž
     inzerát (chytila zkouška). `itemscope` je hranice jednoho záznamu,
     takže se čte od něj k dalšímu. */
  const scopy = [];
  const reS = /<[^>]+itemscope[^>]*>/gi;
  let ms;
  while ((ms = reS.exec(s))) scopy.push(ms.index);
  function blokPro(i) {
    let od = 0, doo = s.length;
    for (let k = 0; k < scopy.length; k++) {
      if (scopy[k] <= i) od = scopy[k];
      else { doo = scopy[k]; break; }
    }
    return s.slice(od, doo);
  }
  const re = /<[^>]+itemprop=["']price["'][^>]*>/gi;
  let m;
  while ((m = re.exec(s))) {
    const znacka = m[0];
    const obsah = /content=["']([^"']+)["']/i.exec(znacka);
    let cena = obsah ? CISLO(obsah[1]) : null;
    const okoli = scopy.length ? blokPro(m.index) : s.slice(Math.max(0, m.index - 1500), m.index + 1500);
    if (!cena) cena = cenaZTextu(bezZnacek(okoli));
    if (!cena || cena < 1000) continue;
    const odkaz = /<a[^>]+href=["']([^"']+)["']/i.exec(okoli);
    ven.push({
      nazev: '', cena: Math.round(cena), vymera: vymeraZTextu(bezZnacek(okoli)),
      url: absolutni(odkaz ? odkaz[1] : '', zaklad), misto: '', odkud: 'mikrodata',
    });
  }
  return ven;
}

/* ---------- 3) podle signálu (bez selektorů) ---------------------- */

export const OKOLI_ZNAKU = 1400;

/**
 * Nabídky poznané podle toho, CO na stránce stojí, ne jak vypadá:
 * odkaz, u kterého je v okolí cena a výměra. Tohle je cesta, která
 * přežije přestavbu vzhledu — nehledá žádnou třídu ani značku.
 *
 * Okolí se bere od odkazu dopředu i dozadu, protože výpisy staví cenu
 * jednou nad odkaz a jednou pod něj. Nabídky se sdružují podle adresy,
 * takže z jedné karty nevzniknou tři.
 */
export function zSignalu(html, zaklad) {
  const s = String(html || '');
  const podleUrl = new Map();
  /* OKNO SE ZARÁŽÍ O SOUSEDNÍ ODKAZY. Bez toho se přelilo do vedlejší
     karty: zkouška na přestavěné stránce ukázala, že druhá nabídka
     dostala cenu i výměru té první (1 250 000 Kč / 1 480 m² dvakrát).
     Radši nabídku nenajít než jí přišít cizí cenu. */
  const odkazy = [];
  const reA = /<a[^>]+href=["']([^"'#]+)["'][^>]*>/gi;
  let ma;
  while ((ma = reA.exec(s))) odkazy.push({ index: ma.index, konec: reA.lastIndex, href: ma[1] });
  for (let i = 0; i < odkazy.length; i++) {
    const m = odkazy[i];
    const url = absolutni(m.href, zaklad);
    if (!url || /\.(?:css|js|png|jpe?g|svg|webp|pdf|ico)(?:$|\?)/i.test(url)) continue;
    const od = Math.max(i > 0 ? odkazy[i - 1].konec : 0, m.index - OKOLI_ZNAKU);
    const doo = Math.min(i + 1 < odkazy.length ? odkazy[i + 1].index : s.length, m.konec + OKOLI_ZNAKU);
    const text = bezZnacek(s.slice(od, doo));
    const cena = cenaZTextu(text);
    const vymera = vymeraZTextu(text);
    if (!cena || !vymera) continue;
    /* Jméno nabídky: text uvnitř odkazu, když je to věta, ne „Detail". */
    const uvnitr = /<a[^>]*>([\s\S]{0,300}?)<\/a>/i.exec(s.slice(m.index, m.index + 600));
    const nazev = uvnitr ? bezZnacek(uvnitr[1]).slice(0, 200) : '';
    const dosud = podleUrl.get(url);
    if (dosud) {
      /* Táž adresa podruhé: ponechá se delší jméno, ostatní se nemění. */
      if (nazev.length > (dosud.nazev || '').length) dosud.nazev = nazev;
      continue;
    }
    podleUrl.set(url, { nazev, cena, vymera, url, misto: '', odkud: 'signál' });
  }
  return [...podleUrl.values()];
}

/* ---------- 4) kde je výpis, když se přestěhoval ------------------ */

/** Odkazy z RSS/Atomu. */
export function zRss(xml) {
  const s = String(xml || '');
  const ven = [];
  const re = /<item[\s\S]*?<\/item>|<entry[\s\S]*?<\/entry>/gi;
  let m;
  while ((m = re.exec(s))) {
    const blok = m[0];
    const odkaz = /<link[^>]*>([^<]+)<\/link>/i.exec(blok)
      || /<link[^>]+href=["']([^"']+)["']/i.exec(blok);
    const titul = /<title[^>]*>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/i.exec(blok);
    if (!odkaz) continue;
    ven.push({ url: odkaz[1].trim(), nazev: titul ? bezZnacek(titul[1]).slice(0, 200) : '' });
  }
  return ven;
}

/** Adresy ze sitemapy; `vzor` nechá jen ty, které vypadají na nabídku. */
export function zeSitemapy(xml, vzor) {
  const s = String(xml || '');
  const ven = [];
  const re = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
  let m;
  while ((m = re.exec(s))) {
    const u = m[1].trim();
    if (vzor && !vzor.test(u)) continue;
    ven.push(u);
  }
  return ven;
}

/* ---------- pomocné ----------------------------------------------- */

/** Relativní adresa na absolutní podle základu stránky. */
export function absolutni(url, zaklad) {
  const u = String(url || '').trim();
  if (!u) return '';
  if (/^https?:\/\//i.test(u)) return u;
  if (!zaklad) return '';
  try { return new URL(u, zaklad).toString(); } catch { return ''; }
}

/**
 * Všechny cesty po sobě. Vrací první, která něco přinesla, a k tomu
 * zápis o všech — ten je důležitější než výsledek: podle něj se pozná,
 * KTERÁ cesta se zavřela, a ne jen „zdroj nic nevrací".
 */
/* ČTENÍ PO ZÁZNAMECH — čtvrtá cesta (§452).
 *
 * Tři cesty výš čtou buď tvar, který web sám popisuje (JSON-LD,
 * mikrodata), nebo celou stránku najednou („signál"). Ta třetí je
 * poslední záchrana a na výpisu s dvaceti nabídkami vedle sebe páruje
 * čísla ke špatným nabídkám — změřeno na verejnedrazby.cz, kde týž
 * areál vyšel jednou 3 013 m² a jednou 2 666.
 *
 * Tahle cesta to řeší jedinou myšlenkou: NEJDŘÍV ROZKROJIT, POTOM
 * ČÍST. Předpis (scripts/predpisy-zdroju.mjs) řekne, čím jeden záznam
 * končí; mezi dvěma konci je právě jedna nabídka a cena ani výměra
 * z ní nemají jak utéct k sousedovi.
 *
 * ODKAZ SE PÁRUJE ČÍSLEM, NE BLÍZKOSTÍ. Záznam nese „Evid. číslo:
 * A8070" a odkaz /aukce/…-8070/; spojí se to tím číslem. Kdyby se
 * braly odkazy po pořadí, stačila by jedna reklama mezi nabídkami
 * a celý výpis by se posunul o jedna — a nikdo by si toho nevšiml.
 */
export function zZaznamu(html, zaklad, predpis) {
  if (!predpis || !predpis.konecZaznamu) return [];
  const text = bezZnacek(html);
  const s = String(html || '');

  /* Odkazy podle čísla. Bere se href, ne text: text odkazu bývá
     zkrácený třemi tečkami, kdežto adresa je celá. */
  const podleCisla = new Map();
  for (const m of s.matchAll(/href\s*=\s*["']([^"']+)["']/gi)) {
    const c = predpis.odkazVzor && predpis.odkazVzor.exec(m[1]);
    if (c && !podleCisla.has(c[1])) podleCisla.set(c[1], absolutni(m[1], zaklad));
  }

  const re = new RegExp(predpis.konecZaznamu.source, 'g');
  const ven = [];
  let od = 0, m;
  while ((m = re.exec(text)) !== null) {
    const kus = text.slice(od, m.index);
    od = m.index + m[0].length;
    const cislo = m[1] || null;

    /* ZAČÁTEK ZÁZNAMU SE HLEDÁ JEN PŘED KONCEM NÁZVU (§455).
       Nejdřív se najde, kde název končí — u verejnedrazby.cz závorka
       s typem řízení — a značka začátku se pak hledá POUZE v tom, co
       leží před ní. Pátý ostrý pokus 6. 11. ukázal, proč to tak musí
       být: za názvem stojí „Čas do konce: Ukončeno", takže slovo
       „Ukončeno" je v záznamu dvakrát a jednou v jiné roli. Hledání
       v celém kusu by si z času udělalo začátek názvu a název by
       zmizel.
       Značka je POSLEDNÍ výskyt před koncem názvu: co je dřív, je
       hlavička stránky, filtrační panel („Aktivní Neprodáno Prodáno
       Ukončeno Zrušeno Kraj Vybrat vše…") nebo stránkování
       („Vypisuji 20 (141 - 161) z 145 aukcí") — a to všechno má
       zmizet. Dřív se hledalo v celém kusu a dva záznamy ze 145
       dostaly místo názvu celý filtrační panel. */
    const konecNazvu = predpis.nazevKonci ? predpis.nazevKonci.exec(kus) : null;
    const pred = konecNazvu ? kus.slice(0, konecNazvu.index) : kus;

    let zac = 0, stav = null;
    if (predpis.zacatekZaznamu) {
      const rz = new RegExp(predpis.zacatekZaznamu.source, 'g' + (predpis.zacatekZaznamu.flags || '').replace('g', ''));
      let z;
      while ((z = rz.exec(pred)) !== null) { zac = z.index + z[0].length; stav = (z[1] || '').trim() || null; }
    }
    const zaznam = kus.slice(zac).trim();
    if (!zaznam) continue;

    const nazev = (konecNazvu ? kus.slice(zac, konecNazvu.index) : zaznam).trim();
    if (!nazev) continue;

    const mc = predpis.cena && predpis.cena.exec(zaznam);
    const cena = mc ? cenaZTextu(mc[1] + ' Kč') : null;

    /* VÝMĚRA PODLE TOHO, CO TO JE (§453). U pozemku se bere výměra
       pozemku, u stavby plocha stavby. Ostrý pokus ukázal, proč:
       „Prodej bytové jednotky (domu), podlahová plocha 129 m2,
       pozemek 67 m2" dávalo „byt · 67 m²“ — a to je nepravda, 67 m²
       je ten pozemek pod ním.
       Výměra pozemku se u stavby čte taky, jen se vede zvlášť: u domu
       se zahradou je to užitečný údaj, není to ale velikost domu.
       Když se u stavby plocha nenajde, zůstane `vymera` prázdná. To
       je správná odpověď — radši mezera než cizí číslo. */
    const co = kategorieZNazvu(nazev);
    const vymeraPozemku = vymeraSPopiskem(nazev, POPISKY_VYMERY);
    const plochaStavby = vymeraSPopiskem(nazev, POPISKY_PLOCHY_STAVBY, true)
      || vymeraSPopiskem(nazev, POPISKY_VYMERY_OBECNE, true);
    const jeStavba = co && co.kategorie === 'stavba';

    ven.push({
      nazev,
      cislo,
      cena,
      druh: co ? co.druh : null,
      kategorie: co ? co.kategorie : null,
      vymera: jeStavba ? plochaStavby : vymeraPozemku,
      vymeraPozemku: vymeraPozemku || null,
      plochaStavby: plochaStavby || null,
      /* STAV AUKCE JDE DÁL (§455). Skončená dražba není nabídka:
         „Prodáno", „Neprodáno", „Zrušeno" ani „Ukončeno" na web
         nepatří. Čtečka ale sama nezahazuje — nese jen pravdu o tom,
         co na stránce stálo, a rozhodnutí patří tomu, kdo zdroj
         zapojuje. Když předpis značku stavu nemá, zůstane null a
         nic se tím netvrdí. */
      stav,
      odkaz: cislo && podleCisla.get(cislo) ? podleCisla.get(cislo) : null,
      typ: predpis.typ || null,
      odkud: 'záznamy',
    });
  }
  return ven;
}

/* VÝMĚRA PODLE POPISKU, ne první číslo s „m²".
 *
 * Naměřený název: „Prodej bývalé zemědělské usedlosti, 3 stavby —
 * užitná plocha 371 m2, pozemky celkem 11.770 m2". První číslo je
 * podlahová plocha BUDOVY; kdo vezme je, pošle na web usedlost
 * o 371 m² jako pozemek. Hledá se proto popisek a teprve za ním
 * číslo, a popisky mají pořadí (viz POPISKY_VYMERY).
 *
 * Okno 40 znaků za popiskem je naměřené, ne zvolené: nejdelší
 * naměřený odstup mezi popiskem a číslem je „pozemky celkem 11.770 m2"
 * (14 znaků), takže 40 dává rezervu a zároveň nedosáhne na číslo
 * dalšího údaje za čárkou.
 */
export function vymeraSPopiskem(text, popisky, jenSPopiskem) {
  const s = String(text || '');
  const sezn = popisky && popisky.length ? popisky : POPISKY_VYMERY_ZALOHA;
  for (const p of sezn) {
    const i = s.toLowerCase().indexOf(p.toLowerCase());
    if (i < 0) continue;
    const v = vymeraZTextu(s.slice(i + p.length, i + p.length + 40));
    if (v) return v;
  }
  /* JEN S POPISKEM: u stavby se na „první číslo s m²" ustoupit NESMÍ.
     Tím číslem bývá totiž výměra pozemku, a právě ta se tu vydávala
     za velikost bytu (§453). Prázdno je tu lepší odpověď. */
  return jenSPopiskem ? null : vymeraZTextu(s);
}

/* Záloha pro volání bez seznamu. Drží se stejného pořadí jako
   POPISKY_VYMERY v predpisy-zdroju.mjs; kdyby se rozešly, hlídá to
   scripts/test-predpis-zdroje.mjs. */
const POPISKY_VYMERY_ZALOHA = [
  'pozemky celkem', 'pozemek celkem', 'celková výměra', 'celkova vymera',
  'pozemky', 'pozemek', 'výměra', 'vymera',
];

export function prectiJakkoli(html, zaklad) {
  /* PŘEDPIS JDE PRVNÍ, KDYŽ PRO TEN WEB JE (§452). Čtení po záznamech
     je ze čtyř cest nejpřesnější — rozkrojí stránku na nabídky dřív,
     než začne číst čísla. Nestojí ale na ničem, co by web o sobě
     říkal, nýbrž na tvaru, který jsme u něj NAMĚŘILI; proto se použije
     jen tam, kde takové měření je, a nikde jinde.

     A proto se taky do zápisu zapisuje JEN TEHDY. Kdyby se hlásila
     i u webů bez předpisu, byl by v každém zápisu řádek „záznamy: 0",
     který nic neznamená — a čtenář by hledal vadu tam, kde žádná
     není. Že se tohle pravidlo dodržuje, měří test-cteni-zdroje. */
  const predpis = predpisProAdresu(zaklad);
  const cesty = [
    ...(predpis ? [['záznamy', () => zZaznamu(html, zaklad, predpis)]] : []),
    ['json-ld', () => zJsonLd(html, zaklad)],
    ['mikrodata', () => zMikrodat(html, zaklad)],
    ['signál', () => zSignalu(html, zaklad)],
  ];
  const zapis = [];
  let vysledek = [];
  for (const [jmeno, f] of cesty) {
    let n = [];
    try { n = f() || []; } catch (e) { zapis.push({ cesta: jmeno, pocet: 0, chyba: String(e && e.message || e).slice(0, 120) }); continue; }
    zapis.push({ cesta: jmeno, pocet: n.length });
    if (!vysledek.length && n.length) vysledek = n;
  }
  return { nabidky: vysledek, cesta: vysledek.length ? vysledek[0].odkud : null, zapis };
}

/**
 * Co na té stránce vlastně bylo, když nezabrala žádná cesta. Bez tohohle
 * přijde do úkolu jen „zdroj nic nevrací", což se nedá vyšetřit.
 */
export function copakTamJe(html) {
  const text = bezZnacek(html);
  const s = String(html || '');
  const spocti = (re) => (s.match(re) || []).length;
  return {
    bajtu: s.length,
    odkazu: spocti(/<a[^>]+href=/gi),
    jsonLd: spocti(/application\/ld\+json/gi),
    itemprop: spocti(/itemprop=/gi),
    /* Počítá se i podoba „1 250 000,-" bez jednotky: na přestavěné
       stránce ve zkoušce byly ceny napsané takhle a diagnostika hlásila
       nula cen tam, kde dvě byly. */
    cen: (text.match(/\d[\d\s\u00a0.,]*\s*(?:Kč|CZK|,-)/gi) || []).length,
    vymer: (text.match(/\d[\d\s\u00a0.,]*\s*(?:m²|m2|ha)\b/gi) || []).length,
    vypadaNaPrihlaseni: /přihlás|captcha|cloudflare|ověřte, že jste|robot/i.test(text.slice(0, 4000)),
    vypadaNaPrazdno: /nenalezeno|žádné (?:nabídky|výsledky)|nic jsme nenašli/i.test(text),
  };
}

/* ---------- 5) OBEC A OKRES Z TEXTU ------------------------------- */
/* Nabídka bez okresu se v robotovi zahodí (normOkres ji neuzná), takže
   druhá cesta musí umět pojmenovat místo z toho, co na stránce stojí.
   Dvě cesty, v tomhle pořadí:
     1) na stránce je napsáno „okres X" — pak se nehádá vůbec;
     2) ve textu stojí jméno obce, kterou už z dřívějších nabídek známe
        (slovník se staví z vlastních dat, viz slovnikMist).
   Když ani to, místo se nepojmenuje a nabídka se zahodí jako dřív.
   NIC SE NEDOPOČÍTÁVÁ: vymyšlená obec je horší než chybějící nabídka. */

/** Slovník „obec → okres" z nabídek, které už máme. U obce, která se
 *  v datech objevuje ve dvou okresech, vyhrává častější. */
export function slovnikMist(nabidky) {
  const pocty = new Map();
  for (const o of (nabidky || [])) {
    const obec = String((o && o.place) || '').trim();
    const okres = String((o && o.okres) || '').trim();
    if (obec.length < 3 || !okres) continue;
    const klic = obec.toLowerCase();
    if (!pocty.has(klic)) pocty.set(klic, new Map());
    const m = pocty.get(klic);
    m.set(okres, (m.get(okres) || 0) + 1);
  }
  const slovnik = new Map();
  for (const [klic, m] of pocty) {
    const nej = [...m.entries()].sort((a, b) => b[1] - a[1])[0];
    slovnik.set(klic, { obec: klic, okres: nej[0], kolik: nej[1] });
  }
  return slovnik;
}

/**
 * Obec a okres z textu nabídky.
 *   text    — název a popis ze stránky
 *   slovnik — z slovnikMist()
 *   okresy  — seznam platných jmen okresů (z dat), kvůli kroku 1
 * Vrací { place, okres, jak } nebo null.
 */
export function mistoZTextu(text, slovnik, okresy) {
  const t = String(text || '');
  if (!t) return null;
  /* 1) „okres Tábor" napsané přímo na stránce. */
  const m = /okres[ues]?\s+([A-ZÁ-Ž][\wÁ-Žá-ž.-]*(?:[ -][A-ZÁ-Žá-ž][\wÁ-Žá-ž.-]*){0,2})/.exec(t);
  if (m && okresy) {
    const nalezeny = [...okresy].find((o) => o.toLowerCase() === m[1].trim().toLowerCase());
    if (nalezeny) {
      /* Obec se pak hledá ve slovníku jen v rámci toho okresu. */
      let vSlovniku = slovnik ? najdiObec(t, slovnik, nalezeny) : null;
      /* A když ze slovníku vyjde jen jméno okresu, zkusí se jméno, které
         stojí hned PŘED slovem „okres" — výpisy píšou „Lhota u Vsetína,
         okres Vsetín" a vzít z toho „Vsetín" by zahodilo obec, kterou
         stránka uvádí. Bere se jen tvar, který na jméno vypadá: začíná
         velkým písmenem, nejvýš tři slova, bez čísel. */
      if (!vSlovniku || vSlovniku.toLowerCase() === nalezeny.toLowerCase()) {
        const pred = /([A-ZÁ-Ž][^,;:()\d]{2,40}?)\s*,?\s*okres/.exec(t);
        const kandidat = pred ? pred[1].trim() : '';
        if (kandidat && kandidat.split(/\s+/).length <= 3
          && kandidat.toLowerCase() !== nalezeny.toLowerCase()) vSlovniku = kandidat;
      }
      return { place: vSlovniku || nalezeny, okres: nalezeny, jak: vSlovniku ? 'okres i obec z textu' : 'okres z textu' };
    }
  }
  /* 2) jméno obce, kterou známe z dřívějších nabídek. */
  const obec = slovnik ? najdiObec(t, slovnik, null) : null;
  if (obec) {
    const z = slovnik.get(obec.toLowerCase());
    return { place: obec, okres: z.okres, jak: 'obec ze slovníku' };
  }
  return null;
}

/* Spojky, kterými pokračují jména obcí: „Benešov u Prahy", „Ústí nad
   Labem", „Rožnov pod Radhoštěm". Když za nalezeným jménem stojí jedna
   z nich a za ní velké písmeno, jméno POKRAČUJE a nalezená část je jen
   jeho začátek. */
const SPOJKY = ['u', 'nad', 'pod', 'na', 'v', 've', 'za', 'při', 'do', 'od'];

/**
 * Nejdelší jméno obce ze slovníku, které v textu stojí jako CELÉ jméno.
 * Nejdelší proto, že „Lhota" je součástí „Lhota u Vsetína".
 *
 * A hlavně: jméno se nesmí vzít z poloviny jiného jména. „Pozemek
 * v Horní Dolní" obsahuje obec „Horní", kterou v datech máme — a bez
 * téhle kontroly z toho vyšlo místo „Horní" v okrese Jablonec nad
 * Nisou, tedy vymyšlená nabídka na vymyšleném místě. Totéž u „Dolní
 * Benešov" (jiné město než Benešov). Proto se vedle hranice slova
 * hlídá, že před ani za jménem nepokračuje další velké písmeno —
 * ani přes spojku.
 */
export function najdiObec(text, slovnik, vOkrese) {
  const orig = ' ' + String(text || '') + ' ';
  const t = orig.toLowerCase();
  let nej = null;
  for (const [klic, z] of slovnik) {
    if (vOkrese && z.okres !== vOkrese) continue;
    if (klic.length < 3) continue;
    let i = -1;
    while ((i = t.indexOf(klic, i + 1)) >= 0) {
      const pred = t[i - 1], za = t[i + klic.length];
      if (/[\wá-ž]/.test(pred || ' ') || /[\wá-ž]/.test(za || ' ')) continue;
      if (pokracuje(orig, i, klic.length)) continue;
      if (!nej || klic.length > nej.length) nej = klic;
      break;
    }
  }
  if (!nej) return null;
  /* VRÁTÍ SE PRAVOPIS Z TEXTU, ne vlastní velká písmena. Přepisování
     prvního písmene u každého slova dělalo z „Veselí nad Lužnicí"
     „Veselí Nad Lužnicí“ — česká jména obcí mají spojky malé. */
  const kde = t.indexOf(nej);
  return kde >= 0 ? orig.slice(kde, kde + nej.length) : nej;
}

/** Pokračuje jméno obce před nebo za nalezeným úsekem? */
export function pokracuje(orig, i, delka) {
  const pred = orig.slice(Math.max(0, i - 40), i);
  const za = orig.slice(i + delka, i + delka + 40);
  /* Za jménem hned velké písmeno („Horní Dolní") nebo spojka a velké
     písmeno („Benešov u Prahy"). */
  if (/^[ -][A-ZÁ-Ž]/.test(za)) return true;
  const sp = /^ ([a-zá-ž]+) [A-ZÁ-Ž]/.exec(za);
  if (sp && SPOJKY.includes(sp[1])) return true;
  /* Před jménem velké písmeno („Dolní Benešov"), ale „okres Benešov"
     ani začátek věty to není. */
  const m = /([A-ZÁ-Ž][\wá-žÁ-Ž]*)[ -]$/.exec(pred);
  if (m && !/^(?:Okres|Kraj|Obec|Prodej|Pozemek|Parcela|Zahrada)$/i.test(m[1])) return true;
  return false;
}
