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
export function prectiJakkoli(html, zaklad) {
  const cesty = [
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
