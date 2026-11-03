#!/usr/bin/env node
/* NABÍDKY NEPOTŘEBNÉHO MAJETKU STÁTU — čtení otevřených dat
   ==================================================================
   Zdroj: https://portal.gov.cz/nepotrebny-nemovity-majetek/?export=csv
   Robots: Allow: /  (změřeno 3. 11. 2026 sondou i ohledáním)

   PROČ PRÁVĚ TENHLE. Změřeno 3. 11.: aby Bezrealitky klesly z 81 %
   na 40 %, musely by ostatní zdroje dát 2 441 nabídek místo 376.
   Ze slibných kandidátů byl prodejní jediný a zbytek dražby. Tohle je
   CENTRÁLNÍ EVIDENCE: jedním souborem nabídky Lesů ČR, Povodí,
   Vojenských lesů, Správy železnic i ministerstev — tedy jedním
   čtením to, co by jinak byly čtyři zvlášť psané stahovače, každý
   s vlastní rozbitelností.

   A je to OTEVŘENÉ DATO STÁTU: zveřejnění je povinnost, ne laskavost,
   takže tu nehrozí to, co u Bezrealitek — že nás jednoho dne odstřihnou.

   TVAR (změřen, ne odhadnut): 94 záznamů, 69 sloupců, oddělovač čárka,
   hlavička bez diakritiky. Jeden záznam může nést až PĚT položek
   (sloupce s příponou _2 … _5), protože úřad nabízí víc parcel naráz.

   CO SE BERE A CO NE. Jen položky s `TYP_POZEMEK = ano` — budovy,
   jednotky a „jiné" na tenhle web nepatří. A jen ty, u kterých se dá
   poznat OBEC, CENA i VÝMĚRA: nabídka bez výměry se nedá srovnat
   s ničím, nedá se u ní spočítat Kč/m² a na mapě by jen překážela.
   Radši míň nabídek než nabídky, o kterých web nic neumí říct.  */

export const ZDROJ_JMENO = 'Nabídky státu';
export const CSV_URL = 'https://portal.gov.cz/nepotrebny-nemovity-majetek/?export=csv';
export const STROP_POLOZEK = 5;      // tolik položek smí nést jeden záznam
export const DETAIL_URL = 'https://portal.gov.cz/nepotrebny-nemovity-majetek/';

/* ---------- CSV, které umí uvozovky ------------------------------
   Vlastní rozdělovač je tu proto, že pole běžně OBSAHUJÍ ČÁRKU:
   „Dlouhá Lomnice, Bochov, okres Karlovy Vary" je jedna buňka.
   Dělit řádek na čárkách by z devětašedesáti sloupců udělalo
   nesmysl — a byla by to tichá chyba, protože počet sloupců by
   seděl jen u řádků bez čárky v textu. */
export function rozdelRadek(radek, odd = ',') {
  const ven = [];
  let bunka = '';
  let vUvozovkach = false;
  for (let i = 0; i < radek.length; i++) {
    const z = radek[i];
    if (vUvozovkach) {
      if (z === '"') {
        if (radek[i + 1] === '"') { bunka += '"'; i++; }   // zdvojená = doslovná
        else vUvozovkach = false;
      } else bunka += z;
    } else if (z === '"') vUvozovkach = true;
    else if (z === odd) { ven.push(bunka); bunka = ''; }
    else bunka += z;
  }
  ven.push(bunka);
  return ven.map((x) => x.trim());
}

/* Řádky se dělí až MIMO uvozovky — popis položky bývá víceřádkový. */
export function naRadky(text) {
  const ven = [];
  let r = '';
  let vUvozovkach = false;
  const t = String(text || '').replace(/^﻿/, '');
  for (let i = 0; i < t.length; i++) {
    const z = t[i];
    if (z === '"') { vUvozovkach = !vUvozovkach; r += z; continue; }
    if (!vUvozovkach && (z === '\n' || z === '\r')) {
      if (z === '\r' && t[i + 1] === '\n') i++;
      if (r.trim()) ven.push(r);
      r = '';
      continue;
    }
    r += z;
  }
  if (r.trim()) ven.push(r);
  return ven;
}

export function rozdelCsv(text) {
  const radky = naRadky(text);
  if (radky.length < 2) return [];
  const hlavicka = rozdelRadek(radky[0]);
  const ven = [];
  for (const r of radky.slice(1)) {
    const b = rozdelRadek(r);
    const z = {};
    hlavicka.forEach((jm, i) => { z[jm] = b[i] != null ? b[i] : ''; });
    ven.push(z);
  }
  return ven;
}

/* ---------- MÍSTO -------------------------------------------------
   „Dlouhá Lomnice, Bochov, okres Karlovy Vary" = katastr, obec, okres.
   Někdy se katastr a obec shodují („Lysá nad Labem, Lysá nad Labem,
   okres Nymburk"). Okres se pozná slovem, ne pořadím: kdyby úřad
   jednou vynechal katastr, posunulo by se všechno o jedno a obec by
   se tiše změnila v okres. */
export function mistoZKatastru(s) {
  const casti = String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
  if (!casti.length) return { place: '', okres: '', katastr: '' };
  const iOkres = casti.findIndex((x) => /^okres\s+/i.test(x));
  const okres = iOkres >= 0 ? casti[iOkres].replace(/^okres\s+/i, '').trim() : '';
  const bezOkresu = casti.filter((_, i) => i !== iOkres);
  const katastr = bezOkresu[0] || '';
  /* Obec je ta POSLEDNÍ před okresem — u dvou částí je to ta druhá,
     u jedné je obec totožná s katastrem. */
  const place = bezOkresu.length > 1 ? bezOkresu[bezOkresu.length - 1] : katastr;
  return { place, okres, katastr };
}

/* ---------- VÝMĚRA ------------------------------------------------
   V popisu stojí „o výměře 463 m2" nebo „o výměře 1 234,5 m²".
   Bere se POSLEDNÍ výskyt: popis někdy nejdřív cituje výměru celé
   parcely a teprve pak oddělovanou část, která se opravdu prodává. */
export function vymeraZPopisu(s) {
  const t = String(s || '');
  const re = /o\s*v[yý]m[eě][rř]e\s*([\d\s ]+(?:[.,]\d+)?)\s*m\s*(?:2|²)/gi;
  let m, posledni = null;
  while ((m = re.exec(t))) posledni = m[1];
  if (posledni == null) return null;
  const n = Number(String(posledni).replace(/[\s ]/g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

/* ---------- DRUH --------------------------------------------------
   Slovník je schválně krátký a doslovný. Hádat druh z náznaků by
   znamenalo psát na kartu tvrzení, které v listině není. */
export const DRUHY = [
  [/lesn[íi]\s+pozemek|pozemek\s+ur[čc]en[yý]\s+k\s+pln[eě]n[íi]\s+funkc[íi]\s+lesa|\bPUPFL\b/i, 'les'],
  [/orn[áa]\s+p[ůu]da/i, 'orná půda'],
  [/trval[ýy]\s+travn[íi]\s+porost/i, 'trvalý travní porost'],
  [/zahrada/i, 'zahrada'],
  [/ovocn[ýy]\s+sad/i, 'sad'],
  [/vinice/i, 'vinice'],
  [/chmelnice/i, 'chmelnice'],
  [/vodn[íi]\s+plocha/i, 'vodní plocha'],
  [/zastav[ěe]n[áa]\s+plocha/i, 'zastavěná plocha'],
  [/ostatn[íi]\s+plocha/i, 'ostatní plocha'],
];
export function druhZPopisu(s) {
  const t = String(s || '');
  for (const [re, jm] of DRUHY) if (re.test(t)) return jm;
  return 'pozemek';
}

export function cena(s) {
  const n = Number(String(s == null ? '' : s).replace(/[\s ]/g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

/* ---------- POLOŽKY JEDNOHO ZÁZNAMU -------------------------------
   Sloupce bez přípony jsou první položka, s _2 … _5 další. Prázdné
   sady se přeskakují — většina záznamů nese jedinou položku. */
export function polozkyZaznamu(z, strop = STROP_POLOZEK) {
  const ven = [];
  for (let i = 1; i <= strop; i++) {
    const p = i === 1 ? '' : '_' + i;
    const katastr = (z['KATASTRALNI_UZEMI' + p] || '').trim();
    const jePozemek = /^ano$/i.test((z['TYP_POZEMEK' + p] || '').trim());
    if (!katastr && !jePozemek) continue;
    ven.push({
      poradi: i, katastr, jePozemek,
      parcela: (z['PARCELNI_CISLO' + p] || '').trim(),
      popis: (z['POPIS_POLOZKY' + p] || '').trim(),
      cena: z['POZADOVANA_CENA' + p],
      jeBudova: /^ano$/i.test((z['TYP_BUDOVA' + p] || '').trim()),
      jeJednotka: /^ano$/i.test((z['TYP_JEDNOTKA' + p] || '').trim()),
    });
  }
  return ven;
}

/* ---------- CELÝ PŘEVOD -------------------------------------------
   Vrací { nabidky, zahozeno }, protože „kolik se zahodilo a proč" je
   údaj, který musí být vidět: bez něj se tiše rozpadne zdroj a nikdo
   si toho nevšimne (§356 je přesně o tom). */
export function nabidkyZCsv(text, dnesISO) {
  const zaznamy = rozdelCsv(text);
  const nabidky = [];
  const zahozeno = { nenipozemek: 0, bezMista: 0, bezCeny: 0, bezVymery: 0, prosle: 0, sBudovou: 0 };
  for (const z of zaznamy) {
    const platnostDo = (z.PLATNOST_DO || '').trim();
    if (dnesISO && /^\d{4}-\d{2}-\d{2}$/.test(platnostDo) && platnostDo < dnesISO) {
      zahozeno.prosle++; continue;
    }
    for (const p of polozkyZaznamu(z)) {
      if (!p.jePozemek) { zahozeno.nenipozemek++; continue; }
      /* POZEMEK S BUDOVOU NENÍ POZEMEK. Cena je pak za obojí a Kč/m²
         by z toho vyšlo jako nesmysl — a právě podle Kč/m² se tu
         řadí, počítá verdikt i kreslí mapa. */
      if (p.jeBudova || p.jeJednotka) { zahozeno.sBudovou++; continue; }
      const m = mistoZKatastru(p.katastr);
      if (!m.place || !m.okres) { zahozeno.bezMista++; continue; }
      const c = cena(p.cena);
      if (!c) { zahozeno.bezCeny++; continue; }
      const v = vymeraZPopisu(p.popis) || vymeraZPopisu(z.POPIS);
      if (!v) { zahozeno.bezVymery++; continue; }
      nabidky.push({
        type: 'sale',
        place: m.place,
        okres: m.okres,
        parcel: p.parcela || undefined,
        druh: druhZPopisu(p.popis + ' ' + (z.POPIS || '')),
        area: v,
        price: c,
        url: DETAIL_URL + '?id=' + encodeURIComponent((z.ID_ZAZNAMU || '').trim()),
        extra: [(z.NABIZEJICI_NAZEV || z.PUBLIKUJCI || '').trim(), 'nabídka státu']
          .filter(Boolean).join(' · '),
        zdroj: ZDROJ_JMENO,
      });
    }
  }
  return { nabidky, zahozeno };
}
