/* Srovnatelné pozemky — které nabídky se smí postavit vedle sebe.
   ==================================================================
   PROČ TENHLE SOUBOR EXISTUJE. Stránka pozemku uměla vynést verdikt
   („dražší než 98 % pozemků téhož druhu v kraji"), ale neukázala
   jediný důkaz. Kdo si chce ověřit, jestli je 314 Kč/m² hodně, musel
   odejít na mapu a hledat sám. Přitom přesně tohle dělá odhadce:
   vezme pár srovnatelných pozemků v okolí a podívá se, kde mezi nimi
   ten náš leží.

   ČÍSLO, KTERÉ SE DÁ UNÉST PĚTI VZORKY. Z pěti nabídek se medián
   počítat nemá — byl by to údaj, který se změní, jakmile jedna zmizí.
   Co se z pěti vzorků tvrdit DÁ, je POŘADÍ: „z šesti nabídek v okolí
   dvanácti kilometrů je tenhle druhý nejdražší". To si čtenář navíc
   může hned přepočítat, protože všech šest je pod tím vypsaných
   i s cenami. Verdikt bez důkazu se musí věřit; pořadí v seznamu ne.

   CO SE POROVNÁVAT SMÍ. Týž druh (les s lesem, ne les se stavební
   parcelou), výměra v rozumném poměru (hektarové pole a dvousetmetrová
   zahrada nemají společnou cenu za metr) a dost blízko, aby to byl
   týž trh. Když se tolik srovnatelných nenajde, sekce se celá
   vynechá — pět nabídek z druhého konce republiky není srovnání,
   je to výplň.

   Meze nejsou od stolu. Naměřeno na datech z 8. 10. 2026 (1 825
   nabídek k prodeji se souřadnicemi i cenou):
     do 25 km, výměra ±3×, aspoň 3 a nejvýš 4 srovnatelné:
     sekce vznikne u 65 % nabídek, medián okruhu 13 km,
     devadesátý percentil 23 km.
   Povolit 35 km by pokrytí zvedlo na 77 %, jenže medián okruhu
   by vyskočil na 19 km a každé desáté srovnání by sahalo přes
   33 km — to už je jiný okres a jiný trh. Radši u třetiny nabídek
   neříct nic než u všech říct něco, co neplatí.
   ================================================================== */

/** Okruh, ve kterém ještě jde o týž trh. */
export const OKRUH_KM = 25;
/** Kolikrát se smí lišit výměra (oběma směry). */
export const POMER_PLOCHY = 3;
/** Pod tolik srovnatelných se sekce neukáže vůbec. */
export const MIN_SROVNATELNYCH = 3;
/* ČTYŘI, NE PĚT — a je to měření, ne odhad. Pátá srovnatelná nabídka
   nepřidá ani jednu stránku navíc (pokrytí je v obou případech 65,0 %,
   protože o tom rozhoduje spodní mez), ale protáhne okruh: medián
   16 km místo 13 a devadesátý percentil 24 místo 23. Pátý řádek tedy
   stojí tři kilometry na každém srovnání a nedá za ně nic. */
export const MAX_SROVNATELNYCH = 4;

/** Vzdušná čára v kilometrech (haversine). */
export function kmMezi(a, b) {
  if (!a || !b) return Infinity;
  const R = 6371;
  const rad = (x) => (x * Math.PI) / 180;
  const dla = rad(b.lat - a.lat), dlo = rad(b.lng - a.lng);
  const h = Math.sin(dla / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dlo / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Je `x` srovnatelný s `ja`? (bez vzdálenosti — tu řeší volající) */
export function patriKSobe(ja, x, pomer = POMER_PLOCHY) {
  if (!ja || !x || x === ja) return false;
  if (!(ja.area > 0) || !(x.area > 0)) return false;
  /* TÝŽ POZEMEK SE SEBOU SROVNÁVAT NEJDE, ani když to jsou dvě nabídky.
     Na jednom klíči (obec, parcela, okres, souřadnice) stojí dvojice,
     které se liší cenou a výměrou, takže je pravidlo pro duplicity
     nespojí a každá má vlastní stránku. Jenže jsou nula kilometrů od
     sebe a nejspíš je to tatáž půda inzerovaná dvakrát jinak —
     postavit je vedle sebe jako „srovnatelné pozemky v okolí" by
     neporovnávalo trh, jen ozvěnu. Našla to zkouška
     scripts/test-mapa-pozemku.mjs, která hlídá, že stránka neuvádí
     údaje svého dvojčete. */
  if (ja.pk && x.pk && ja.pk === x.pk) return false;
  if (ja.skupina !== x.skupina) return false;
  return x.area <= ja.area * pomer && x.area >= ja.area / pomer;
}

/**
 * Vybere srovnatelné nabídky a spočítá, kolikátý je mezi nimi `ja`.
 *
 * @param ja       {skupina, area, m2, lat, lng}
 * @param vsechny  tytéž tvary; `ja` v nich být může i nemusí
 * @returns null, nebo { m2, okruh, poradi, zCelkem, polozky }
 *          polozky jsou seřazené od nejdražší, `ja` mezi nimi NENÍ
 */
export function srovnatelne(ja, vsechny, opts = {}) {
  const okruhKm = opts.okruhKm || OKRUH_KM;
  const pomer = opts.pomer || POMER_PLOCHY;
  const min = opts.min || MIN_SROVNATELNYCH;
  const max = opts.max || MAX_SROVNATELNYCH;
  if (!ja || !(ja.m2 > 0)) return null;

  const blizke = [];
  for (const x of vsechny) {
    if (!patriKSobe(ja, x, pomer) || !(x.m2 > 0)) continue;
    const km = kmMezi(ja, x);
    if (!(km <= okruhKm)) continue;
    blizke.push({ x, km });
  }
  if (blizke.length < min) return null;

  /* Nejbližší, ne nejpodobnější cenou: výběr podle ceny by si pořadí
     vyrobil sám. Při shodné vzdálenosti rozhoduje něco stálého, aby
     se seznam nepřeskupoval mezi dvěma sestaveními nad týmiž daty. */
  blizke.sort((a, b) => a.km - b.km
    || (a.x.m2 - b.x.m2)
    || String(a.x.id || '').localeCompare(String(b.x.id || '')));
  const vybrane = blizke.slice(0, max);

  /* POŘADÍ SE POČÍTÁ PŘESNĚ Z TOHO, CO JE VIDĚT. Kdyby se počítalo ze
     všech nalezených a ukázalo se jen pět, tvrdila by věta nad
     seznamem něco, co se v seznamu nedá přepočítat — a první, kdo si
     to zkusí ověřit, přistihne web při lži. */
  const poradi = 1 + vybrane.filter((y) => y.x.m2 > ja.m2).length;
  const okruh = Math.max(1, Math.ceil(vybrane[vybrane.length - 1].km));
  const polozky = vybrane.slice()
    .sort((a, b) => b.x.m2 - a.x.m2 || a.km - b.km)
    .map((y) => ({ x: y.x, km: y.km }));
  return { m2: ja.m2, okruh, poradi, zCelkem: vybrane.length + 1, polozky };
}

/** Věta nad seznamem. Jedno místo pro generátor i pro prohlížeč. */
export function veta(s) {
  if (!s) return '';
  const kolikaty = s.poradi === 1 ? 'nejdražší'
    : s.poradi === s.zCelkem ? 'nejlevnější'
      : `${s.poradi}. nejdražší`;
  return `Z ${slovy(s.zCelkem)} nabídek do ${s.okruh} km je tenhle ${kolikaty}.`;
}

function slovy(n) {
  return ({ 4: 'čtyř', 5: 'pěti', 6: 'šesti' })[n] || String(n);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('Modul se nespouští sám — používá ho scripts/generate-parcel-pages.mjs.');
}
