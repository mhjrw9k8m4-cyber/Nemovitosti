// Stránka pro KAŽDÝ pozemek zvlášť — kvůli sdílení a vyhledávačům.
//
// Spuštění: node scripts/generate-parcel-pages.mjs
//   (jen Node, žádné závislosti — musí to zvládnout i robot, který běží
//    čtyřikrát denně na holém Node bez prohlížeče.)
//
// PROČ TO VZNIKLO: pozemek.html byla JEDNA stránka pro všech 1 900+
// nabídek a sdílená adresa se lišila jen v „?p=…". Facebook ani Google
// ale JavaScript nespustí, takže každý sdílený pozemek měl naprosto
// stejný nadpis, popis i obrázek: „Pozemek — Parcelka". Odkaz na
// konkrétní parcelu tím neřekl nic o tom, co za ním je.
//
// PROČ DO KOŘENE, A NE DO PODSLOŽKY: stránka se skládá z pozemek.html,
// která odkazuje na js/…, css/… relativně. V podsložce by se všechny ty
// cesty musely přepisovat — celá třída chyb zadarmo. Web už má sto
// kořenových stránek (pozemky-okres-*.html), tahle konvence sedí.
//
// PROČ OBRÁZEK OKRESU, A NE VLASTNÍ: náhledy se kreslí prohlížečem,
// kdežto tenhle generátor běží v robotovi bez něj. Vlastní obrázek pro
// každou nabídku by navíc znamenal desítky megabajtů, které zastarají
// dřív, než je někdo stihne nasdílet — data se mění každých šest hodin.
// Okresních náhledů je 91, jsou stálé a hotové.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as SROV from './srovnatelne.mjs';
import { createRequire } from 'node:module';
import { jsonVeStrance } from './json-do-stranky.mjs';
/* Historie ceny jedné nabídky — z archivu, ne z posledního běhu robota.
   `cena_drive` v datech má 21 nabídek z 2 004 (přepíše se při každém
   běhu), archiv ví o 129. Stránka pozemku je přitom jediné místo, kde
   má věta „cena šla dolů z 450 000 na 399 000" smysl: je to argument
   při smlouvání a nikde jinde se nedočte.
   Čte se LÍNĚ, až když se stránky opravdu staví: scripts/archiv.mjs
   běží před generátorem (viz .github/workflows/update-data.yml), takže
   při prvním dotazu je archiv už dnešní. */
/* Parcelní číslo z textu inzerátu — a hlavně PRAVIDLA, kdy se o něm
   mlčí. V datech ho má 273 nabídek z 1 948; z popisů se bezpečně doplní
   221. Nevkládá se do pole `parcel` (je v klíči pozemku, viz
   PKKlic.pkey), jde to vedle jako údaj „podle inzerátu". */
import { najdi as najdiParcelu, klicPopisu } from './parcely-z-textu.mjs';
import { historiePodleKlice } from './cenova-historie.mjs';
import { nactiArchiv } from './archiv-statistiky.mjs';
/* Jména krajů, druhové a rozpočtové stránky — jedna tabulka pro tenhle
   generátor i pro generátor regionálních stránek. */
import * as META from './regiony-meta.mjs';
import * as BLOKY from './bloky.mjs';
/* Čistič stylopisu — týž, jakým prochází css/styles.css. */
import { ocisti as ocistiCss } from './minifikace.mjs';
let _historie = null;
let _popisy = null;
/* Líně, až když se stránky staví: popisy mají 827 kB a při pouhém
   importu modulu by se načetly nadarmo. */
function parcelaZTextu(d) {
  if (d.parcel && d.parcel !== '—') return null;     // vlastní je lepší
  if (_popisy === null) {
    try { _popisy = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'popisy.json'), 'utf8')); }
    catch (e) { _popisy = {}; }
  }
  const v = najdiParcelu(_popisy[klicPopisu(d, pkey)], d);
  return v.cislo || null;
}
function historieCeny(d) {
  if (_historie === null) {
    try { const a = nactiArchiv(); _historie = historiePodleKlice(a.uzavrene, a.stav); }
    catch (e) { _historie = new Map(); }
  }
  const h = _historie.get(_KLIC.klicArchivu(d));
  /* Jeden bod není historie — to je dnešní cena, a ta na stránce stojí
     velkým písmem o dva řádky výš. */
  if (!h || h.body.length < 2) return null;
  return h.body.map((b) => [b.d, b.c]);
}


const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/* Klíč archivu — tentýž výpočet jako v prohlížeči (js/klic.js). Hrubý
   pkey by tu nestačil: sedí na dva různé pozemky naráz a stránka by
   ukázala cizí historii ceny. */
const _KLIC = createRequire(import.meta.url)(path.join(ROOT, 'js', 'klic.js')).PKKlic;
/* Popisy od inzerentů. Soubor vzniká při sběru dat; než robot poprvé
   doběhne, prostě není — a generátor tím nesmí spadnout, jinak by se
   kvůli chybějícímu popisu nevygenerovaly stránky vůbec. */
const POPISY = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'popisy.json'), 'utf8')) || {}; }
  catch { return {}; }
})();
const WEB = 'https://www.parcelaka.cz';

const MAPA = { 'á':'a','č':'c','ď':'d','é':'e','ě':'e','í':'i','ň':'n','ó':'o','ř':'r','š':'s','ť':'t','ú':'u','ů':'u','ý':'y','ž':'z' };
export function slug(s) {
  return String(s || '').toLowerCase().replace(/[áčďéěíňóřšťúůýž]/g, (c) => MAPA[c] || c)
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
const esc = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmt = (n) => new Intl.NumberFormat('cs-CZ').format(Math.round(n));

/** Týž klíč, jakým se pozemek hledá v datech na webu (js/main.js: pkey). */
export function pkey(d) {
  const la = typeof d.lat === 'number' ? d.lat.toFixed(3) : '';
  const ln = typeof d.lng === 'number' ? d.lng.toFixed(3) : '';
  return [d.place || '', d.parcel || '', d.okres || '', la, ln].join('|');
}
/* Otisk klíče. ZÁMĚRNĚ obyčejný djb2, ne sha1: tentýž výpočet musí zvládnout
   i prohlížeč, aby web uměl na vlastní stránky odkazovat. Kryptografie tu
   není k ničemu — jde jen o to rozlišit dva pozemky se stejným názvem.
   Samotné souřadnice nestačí: u pěti dvojic z 1 927 vyjdou po zaokrouhlení
   stejné a stránky by se přepsaly. */
export function otisk(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
/** Název souboru: čitelný, a na konci otisk klíče kvůli jednoznačnosti. */
export function souborPro(d) {
  return `pozemek-${slug(d.okres)}-${slug(d.place)}-${otisk(pkey(d))}.html`;
}
/* DRUHÝ A DALŠÍ POZEMEK NA TÉMŽE KLÍČI.
   Klíč nese obec, parcelní číslo, okres a souřadnice na tři desetinná
   místa. Když parcelní číslo chybí (v datech je ho spousta jako „—“)
   a dvě nabídky v téže obci padnou po zaokrouhlení na stejných zhruba
   sto metrů, mají klíč shodný — a přitom to jsou různé pozemky.
   Naměřeno na 1 966 nabídkách: 32 takových skupin, v 21 z nich se
   nabídky liší cenou nebo výměrou. Nejkřiklavěji Lhota pod Libčany,
   7 527 800 Kč / 1 981 m² proti 5 723 300 Kč / 1 331 m².
   Do klíče se proto přidá výměra a cena — ale jen těm DALŠÍM v pořadí.
   První si drží dosavadní název souboru, takže žádná dnes existující
   adresa se nemění a nic z vyhledávačů nespadne na 404. */
export function souborProDalsi(d) {
  const rozliseni = pkey(d) + '|' + (d.area || 0) + '|' + (d.price || 0);
  return `pozemek-${slug(d.okres)}-${slug(d.place)}-${otisk(rozliseni)}.html`;
}

const TYP = { sale: 'Na prodej', drazba: 'Dražba', exekuce: 'Exekuce', obec: 'Od obce', majitel: 'Od majitele' };

/* Datum ve tvaru pro stroje („2026-10-13") mezi českými větami vypadá jako
   nedodělek a nikdo ho na první pohled nepřečte. Web to řeší v js/terminy.js
   (zdrojText); tady musí platit totéž, jinak by si stránka pozemku
   odporovala se sebou samou podle toho, jestli běží skript. */
export function lidskeDatum(t) {
  return String(t == null ? '' : t)
    .replace(/(\d{4})-(\d{2})-(\d{2})/g, (_, r, m, den) => `${+den}. ${+m}. ${r}`);
}

/* Titulek se musí vejít do výpisu vyhledávače — nad 65 znaků ho Google
   usekne uprostřed slova. Skládá se proto odstupňovaně: vezme se nejdelší
   podoba, která se vejde i se jménem webu. Ořezávat natvrdo by rozbilo
   slova; tohle vždycky utne na celém údaji. */
const MEZ_TITULKU = 65;
/* Datum dražby jsem sem zkusil přidat taky — a ZHORŠILO to věc, kterou
   mělo spravit. Shodných titulků bylo pět, po přidání deset: varianta
   s datem je delší, takže se pod mezí 65 znaků vybrala kratší podoba
   BEZ výměry, a tři dražby, které se lišily jen výměrou, dostaly tentýž
   titulek („Ostatní plocha — Libochovice, dražba 20. 10. 2026" ×3).
   Datum tedy zůstává jen v popisku, kde je místa 165 znaků a kde
   shodné popisky spadly ze dvou na jeden. */
/* PODÍL PATŘÍ DO NÁZVU, NE JEN DO TĚLA STRÁNKY.
 *
 * U 537 z 2 072 stránek (26 %) se neprodává pozemek, ale spoluvlastnický
 * podíl: cena je za zlomek, výměra je celé parcely. Tělo stránky to říká
 * jasně a strukturovaná data to mají ve výhradě u ceny — ale titulek,
 * nadpis a popisek mlčely. Ani jedna z těch 537 stránek neměla slovo
 * „podíl" v názvu.
 *
 * A je to zrovna ten nejhůř znějící případ: „Lesní pozemek 547 418 m²"
 * za 42 000 Kč. Půl milionu metrů za čtyřicet tisíc. Ve výsledcích
 * vyhledávače a ve sdíleném odkazu je vidět jen tohle — tedy přesně to
 * tvrzení, kterému se celý web jinde vyhýbá. V generátoru u toho navíc
 * stálo, že se „nabídka popíše jako podíl rovnou v názvu"; nepopisovala.
 *
 * Zlomek známe u 515 z 525 nabídek, takže se píše konkrétně. U zbylých
 * deseti aspoň to, že jde o podíl.
 */
function textPodilu(d) {
  if (!d || !d.podil) return '';
  return d.zlomek ? `podíl ${d.zlomek}` : 'spoluvlastnický podíl';
}
/* Tvar na začátek titulku. Když se druh i podíl nevejdou, ustupuje
   DRUH, ne podíl: „Podíl 1/2 — Mikulášovice, 120 000 Kč" říká o tom,
   co se prodává, víc než „Trvalý travní porost — Mikulášovice". */
function podilVelkym(d) {
  const t = textPodilu(d);
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : '';
}

function slozTitulek(druh, vym, place, okres, podil) {
  const konec = ' | Parcelka';
  /* Podíl ustupuje až jako předposlední — dřív se vzdá okres i výměra.
     Je to nejdůležitější údaj o tom, CO se prodává. */
  const p = podil ? ', ' + podil : '';
  /* Když se zlomek i výměra nevejdou, ustupuje ZLOMEK, ne výměra:
     „Orná půda 1 026 m², podíl — Strunkovice" pořád říká, že jde
     o podíl, a zároveň odliší dvě sousední nabídky, které se liší
     jenom tou výměrou (1 026 vs 1 017 m² ve Strunkovicích). Kdyby
     ustoupila výměra, měly by obě tentýž titulek. */
  const pk = podil ? ', podíl' : '';
  const varianty = [
    `${druh}${vym ? ' ' + vym : ''}${p} — ${place}, okres ${okres}`,
    `${druh}${vym ? ' ' + vym : ''}${p} — ${place}`,
    ...(vym && pk ? [`${druh} ${vym}${pk} — ${place}, okres ${okres}`,
      `${druh} ${vym}${pk} — ${place}`] : []),
    `${druh}${p} — ${place}, okres ${okres}`,
    `${druh}${p} — ${place}`,
    ...(podil ? [`${podil.charAt(0).toUpperCase() + podil.slice(1)} — ${place}, okres ${okres}`,
      `${podil.charAt(0).toUpperCase() + podil.slice(1)} — ${place}`] : []),
    `${druh} — ${place}`,
    `${druh} — okres ${okres}`,
    `${place}, okres ${okres}`,
  ];
  for (const v of varianty) if ((v + konec).length <= MEZ_TITULKU) return v;
  return varianty[varianty.length - 1].slice(0, MEZ_TITULKU - konec.length - 1) + '…';
}

/* Popisek má stejný problém jako titulek, jen o sto znaků dál: Google
   ho nad 165 znaků usekne. Dokud se skládal natvrdo, stačila dlouhá obec
   a dlouhý okres — „Rychnov u Jablonce nad Nisou, okres Jablonec nad
   Nisou" — a popisek měl 166 znaků. Jedna stránka z 1 995; napsat to
   odstupňovaně stojí pět řádků a platí to i pro obce, které v datech
   ještě nejsou.
   Zkracuje se ZÁVĚREČNÁ VĚTA, ne údaje: číslo a místo jsou to, kvůli
   čemu člověk z výsledků klikne. */
const MEZ_POPISU = 165;
function slozPopis(d, cena, zaM2, vym, navic) {
  /* TERMÍN DRAŽBY PATŘÍ DO POPISKU. Dva důvody, oba naměřené:
     · Je to jediná věc na téhle stránce s lhůtou — kdo ji přehlédne,
       přijde o pozemek. Ve výpisu vyhledávače dosud nebyla vůbec.
     · Tři stránky měly titulek i popisek SLOVO OD SLOVA stejný
       („Dražba · 1 078 500 Kč (1 500 Kč/m²) · 719 m² · Police nad
       Metují, okres Náchod."). Nebyla to chyba v datech: jsou to tři
       různé dražby na tomtéž místě, se stejnou výměrou i cenou, jen
       v jiný den (8. 10., 22. 10., 5. 11.). Pro vyhledávač to byly tři
       shodné stránky a dvě z nich mohl zahodit. Datum je rozliší
       a zároveň je to ta nejužitečnější věc, co tam může stát. */
  const termin = (/(\d{4})-(\d{2})-(\d{2})/.test(d.extra || '') && (d.type === 'drazba' || d.type === 'exekuce'))
    ? ' Termín ' + lidskeDatum((/(\d{4}-\d{2}-\d{2})/.exec(d.extra) || [])[1]) + '.'
    : '';
  /* Podíl i do popisku: bez něj zní „42 000 Kč · 547 418 m²" jako
     nabídka půl milionu metrů za čtyřicet tisíc. */
  const pod = textPodilu(d) ? ', ' + textPodilu(d) : '';
  const zaklad = `${TYP[d.type] || 'Nabídka'} · ${cena}${zaM2}${vym ? ' · ' + vym : ''}${pod}`
    + ` · ${d.place}, okres ${d.okres}.${termin}${navic || ''}`;
  const varianty = [
    ' Poloha na mapě, srovnání s obvyklou cenou a odkaz do katastru.',
    ' Poloha na mapě a srovnání s obvyklou cenou.',
    ' Poloha na mapě a odkaz do katastru.',
    ' Poloha na mapě.',
    '',
  ];
  for (const v of varianty) if ((zaklad + v).length <= MEZ_POPISU) return zaklad + v;
  /* I samotné údaje přes mez: utne se na celém slově, ne uprostřed. */
  return zaklad.slice(0, MEZ_POPISU - 1).replace(/\s+\S*$/, '') + '…';
}

/* ROZLIŠENÍ SE DĚLÁ AŽ TAM, KDE SE TITULKY OPRAVDU SEJDOU.
 *
 * Pokus výš — přidat datum dražby do titulku VŠEM — věc zhoršil: shod
 * bylo pět, po přidání deset, protože delší varianta přelezla mez
 * 65 znaků, vybrala se kratší podoba bez výměry a tři dražby, které se
 * lišily právě výměrou, dostaly tentýž titulek.
 *
 * Plošně to tedy nejde. Jde to cíleně: nejdřív se složí titulky všem,
 * pak se najdou ty shodné a rozliší se JEN TY. Ostatní stránky zůstanou
 * beze změny, takže ta past nemá kde sklapnout. U rozlišovaných se smí
 * ustoupit i okresem — ten je ve stránce i v popisku, zatímco datum
 * dražby je jediná věc na téhle stránce se lhůtou.
 */
const ROZLISENI = new Map();

function datumDrazby(d) {
  const m = /(\d{4}-\d{2}-\d{2})/.exec(d.extra || '');
  return (m && (d.type === 'drazba' || d.type === 'exekuce')) ? lidskeDatum(m[1]) : '';
}
function cisloParcely(d) {
  const x = (d.parcel == null) ? '' : String(d.parcel).trim();
  return (x && x !== '—' && x !== '-') ? x : '';
}

/* Popisek má týž problém a řeší se stejně cíleně. Druh ani parcelní
   číslo v něm nejsou — dvě nabídky, které se liší jen jimi, tedy dostanou
   popisek slovo od slova stejný. Naměřeno: jedna dvojice z 1 995, a jsou
   to dvě podoby TÉŽE dražby (okdrazby.cz/drazba/27754), kterou pravidlo
   pro duplicity nesloučí, protože se liší druhem.
   Sloučit je podle shodné URL jsem zkoušel a NEJDE to: jedno „URL"
   (farmy.cz/nabidka_detail bez identifikátoru) sdílí sedm nabídek ze
   sedmi různých obcí a jedna dražba kryje parcely ve dvou obcích —
   slučovat podle toho by pozemky ztrácelo. Zbývá je tedy rozlišit. */
const ROZLISENI_POPIS = new Map();

export function pripravRozliseniPopisu(polozky) {
  ROZLISENI_POPIS.clear();
  const podle = new Map();
  for (const d of polozky) {
    const t = textyPro(d).popis;
    if (!podle.has(t)) podle.set(t, []);
    podle.get(t).push(d);
  }
  for (const skupina of podle.values()) {
    if (skupina.length < 2) continue;
    for (const d of skupina) {
      const par = cisloParcely(d);
      const navic = par ? ` Parcela ${par}.` : (d.druh ? ` Druh: ${d.druh}.` : '');
      if (navic) ROZLISENI_POPIS.set(klicNabidky(d), navic);
    }
  }
  return ROZLISENI_POPIS;
}

export function pripravRozliseni(polozky) {
  ROZLISENI.clear();
  const podleTitulku = new Map();
  for (const d of polozky) {
    const druh = d.druh ? d.druh.charAt(0).toUpperCase() + d.druh.slice(1) : 'Pozemek';
    const vym = d.area ? `${fmt(d.area)} m²` : '';
    const t = slozTitulek(druh, vym, d.place, d.okres, textPodilu(d));
    if (!podleTitulku.has(t)) podleTitulku.set(t, []);
    podleTitulku.get(t).push({ d, druh, vym });
  }
  const konec = ' | Parcelka';
  for (const skupina of podleTitulku.values()) {
    if (skupina.length < 2) continue;
    for (const { d, druh, vym } of skupina) {
      const pod = textPodilu(d) ? ', ' + textPodilu(d) : '';
      const dat = datumDrazby(d), par = cisloParcely(d);
      const cena = d.price ? `${fmt(d.price)} Kč` : '';
      /* Pořadí podle užitečnosti pro člověka ve výsledcích hledání:
         termín dražby > číslo parcely > cena. Uvnitř každého se ustupuje
         nejdřív okresem, pak výměrou. */
      const varianty = [];
      const pv = podilVelkym(d);
      if (dat) varianty.push(`${druh}${vym ? ' ' + vym : ''}${pod} — ${d.place}, dražba ${dat}`,
        `${druh}${pod} — ${d.place}, dražba ${dat}`,
        ...(pv ? [`${pv} — ${d.place}, dražba ${dat}`] : []),
        `${druh} — ${d.place}, dražba ${dat}`, `${d.place}, dražba ${dat}`);
      if (par) varianty.push(`${druh}${vym ? ' ' + vym : ''}${pod} — ${d.place}, parc. ${par}`,
        `${druh}${pod} — ${d.place}, parc. ${par}`,
        ...(pv ? [`${pv} — ${d.place}, parc. ${par}`] : []),
        `${druh} — ${d.place}, parc. ${par}`, `${d.place}, parc. ${par}`);
      if (cena) varianty.push(`${druh}${vym ? ' ' + vym : ''}${pod} — ${d.place}, ${cena}`,
        `${druh}${pod} — ${d.place}, ${cena}`,
        ...(pv ? [`${pv} — ${d.place}, ${cena}`] : []),
        `${druh} — ${d.place}, ${cena}`, `${d.place}, ${cena}`);
      for (const v of varianty) {
        if ((v + konec).length <= MEZ_TITULKU) { ROZLISENI.set(klicNabidky(d), v); break; }
      }
      /* Když se nevejde nic, zůstane původní titulek. Dvě stránky se
         shodným titulkem jsou menší zlo než titulek useknutý uprostřed
         data — a kontrola v testu to nahlásí. */
    }
  }
  return ROZLISENI;
}

export function textyPro(d) {
  const druh = d.druh ? d.druh.charAt(0).toUpperCase() + d.druh.slice(1) : 'Pozemek';
  const vym = d.area ? `${fmt(d.area)} m²` : '';
  const titul = ROZLISENI.get(klicNabidky(d)) || slozTitulek(druh, vym, d.place, d.okres, textPodilu(d));
  const cena = d.price ? `${fmt(d.price)} Kč` : 'cena neuvedena';
  /* CENA ZA METR Z VÝMĚRY, KTERÁ KUPUJÍCÍMU PŘIPADNE. Titulek, popis pro
     vyhledávač i náhled v chatu se skládaly dělením celé výměry —
     zatímco tělo téže stránky (js/pozemek.js přes js/ceny.js) počítalo
     s podílem. U podílu 1/6 v Benešově stálo v popisu „28 000 Kč
     (6 Kč/m²)" a ve stránce 33 Kč/m²: jedna stránka, dvě různá čísla,
     a to menší z nich šlo do vyhledávače. U podílu s neznámým zlomkem
     se číslo neuvádí vůbec — stejně jako ho neuvádí stránka. */
  const zaM2Hodnota = (d.price && d.area) ? CENY.zaMetr(d) : null;
  const zaM2 = (zaM2Hodnota == null || !isFinite(zaM2Hodnota)) ? '' : ` (${fmt(zaM2Hodnota)} Kč/m²)`;
  const popis = slozPopis(d, cena, zaM2, vym, ROZLISENI_POPIS.get(klicNabidky(d)));
  return { titul, popis, cena, zaM2, vym, druh };
}

/* SOUBOR se předává, nepočítá. Pozemky se shodným klíčem dostávají
   vlastní stránky (souborProDalsi), ale kanonická adresa se tu počítala
   vždycky ze souborPro — tedy z té první z dvojice. Těch 26 stránek pak
   o sobě tvrdilo „správná adresa je ta druhá", ačkoli je to jiný pozemek
   s jinou cenou a výměrou. Vyhledávač je podle toho zahodí a ukáže
   místo nich dvojče: pozemky, kterým jsem včera vlastní stránku
   udělal, by v hledání nebyly vidět. */
/* Z ŽIVÉ STRÁNKY UDĚLÁ UKONČENOU.
   Nepřepisuje se celá — bere se to, co na ní už je, a jen se k tomu
   přidá pruh, značka pro vyhledávače a datum. Tím zůstane zachované
   všechno, co o pozemku víme, včetně popisu od inzerenta a odkazu do
   katastru: ty po skončení dražby neztrácejí smysl, naopak. */
/* MAPOVÁ KNIHOVNA AŽ NA DOHLED — PŘEPIS ZAMRZLÝCH STRÁNEK.
   Stránka ukončené nabídky se nepřepisuje ze šablony: nabídka už
   v datech není, takže se k ní žádná pozdější úprava šablony sama
   nedostane. Když stránka pozemku přešla z <script src="…leaflet.js"
   defer> na dotahování teprve ve chvíli, kdy je mapa na dohled, šest
   zamrzlých stránek u toho zůstalo — a dál by každému, kdo na ně přijde
   z vyhledávače, poslalo 144 kB (36 kB přes drát) knihovny, kterou
   možná vůbec neuvidí.

   Jiné cesty k nim vedou: odkazy na skripty a styly přepisuje přes
   všechny stránky scripts/minifikace.mjs, takže js/min/ dostaly. Tahle
   změna ale není přepis cesty, je to změna způsobu načítání, a ta patří
   sem — k jedinému místu, které na zamrzlé stránky pozemků sahá.

   Idempotentní: stránka bez té značky se nemění, takže se dá pustit
   při každém běhu. */
const LEAFLET_ZNACKA = /<script src="vendor\/leaflet\/leaflet\.js[^"]*"[^>]*><\/script>\n?/;

/* ŘEZ DAT A PŘEDNAČÍTÁNÍ — PŘEPIS ZAMRZLÝCH STRÁNEK.
   Totéž co u mapové knihovny a ze stejného důvodu: stránka ukončené
   nabídky se nepřepisuje ze šablony, takže by jí přechod na malé soubory
   minul a dál by stahovala celých 639 kB (56,5 kB přes drát) místo
   13 kB. Okres se bere z klíče, který už ve stránce je
   (window.PK_POZEMEK.k = obec|parcela|okres|šířka|délka), takže se
   nemusí nikde dohledávat. Idempotentní: co už řez má, se nemění. */
export function migrujRezDat(h) {
  let out = h;
  const m = /<script>window\.PK_POZEMEK=(\{[^<]*?\});<\/script>/.exec(out);
  if (m && m[1].indexOf('"r"') < 0) {
    let ostrov = null;
    try { ostrov = JSON.parse(m[1]); } catch (e) { ostrov = null; }
    const okres = ostrov && typeof ostrov.k === 'string' ? String(ostrov.k).split('|')[2] : '';
    if (ostrov && okres) {
      ostrov.r = `data/okres/${slug(okres)}.json`;
      out = out.replace(m[0], `<script>window.PK_POZEMEK=${jsonVeStrance(ostrov)};</scr` + 'ipt>');
    }
  }
  /* Přednačítání velkého souboru: stahoval by se dál, jen by ho nikdo
     nečetl. Nahradí se tím, co stránka opravdu čte. */
  out = out.replace(/<link rel="preload" as="fetch" href="data\/opportunities\.json"[^>]*>/,
    '<link rel="preload" as="fetch" href="data/model.json" crossorigin>');
  return out;
}

export function migrujLeaflet(h) {
  if (!LEAFLET_ZNACKA.test(h)) return h;
  const adresa = (/<script src="(vendor\/leaflet\/leaflet\.js[^"]*)"/.exec(h) || [])[1]
    || 'vendor/leaflet/leaflet.js';
  let out = h.replace(LEAFLET_ZNACKA, '');
  if (!/<meta name="pk-leaflet"/.test(out)) {
    out = out.replace(/(<link rel="stylesheet" href="vendor\/leaflet\/leaflet\.css)/,
      `<meta name="pk-leaflet" data-src="${adresa}">\n  $1`);
  }
  return out;
}

/* SKRIPTY NA UKONČENÝCH STRÁNKÁCH ZAOSTÁVALY ZA PŘEDLOHOU.
 *
 * Ukončená stránka se obsahově nepřepisuje (viz generuj()), takže se na
 * ni nedostal žádný skript, který se do pozemek.html přidal POZDĚJI —
 * ani přesun už vloženého skriptu na jiné místo.
 *
 * Naměřeno na čtyřech stránkách ukončených nabídek z 2 001:
 *   · chyběl js/min/videno.js (značení viděného),
 *   · chyběl js/min/poznamky.js (poznámky k pozemku),
 *   · chyběl js/min/rezim.js, tedy PŘEPÍNAČ TMAVÉHO REŽIMU. Skript
 *     v hlavičce režim z localStorage nastaví, takže stránka tmavá je,
 *     ale přepnout ji na ní nelze.
 *   · a js/min/hlidani-logika.js na nich stál ZA js/min/pozemek.js.
 *     Všechny mají defer, takže se spouštějí v pořadí dokumentu —
 *     pozemek.js tedy běžel dřív, než vzniklo window.PKHlidani, a
 *     odstranění duplicitních nabídek na těch stránkách nefungovalo.
 *
 * Proto se nedoplňuje, co chybí, ale rovná se celý seznam podle předlohy:
 * pořadí je součást správnosti. Na čtyřech stránkách z 2 001 by si toho
 * nikdo nestěžoval a každý, kdo na ně přijde, na to narazí.
 *
 * Verze v adrese se nehlídá, tu stejně přepíše scripts/orazitkuj-verze.mjs.
 * Idempotentní: druhý průchod vloží tentýž blok na totéž místo. */
/* ÚKLID PO TMAVÉM REŽIMU.
 * V hlavičce každé stránky stával vložený synchronní skript, který ještě
 * před vykreslením přečetl z localStorage uložený režim a nastavil
 * data-theme (a od jisté doby i barvu lišty prohlížeče). Tmavý režim je
 * pryč celý, takže ten úryvek nemá co dělat, a tahle funkce ho ze
 * stránek VYNDÁVÁ místo aby ho vkládala.
 *
 * Proč to tu zůstává a nezmizelo to taky: archivované stránky ukončených
 * nabídek se znovu negenerují, jen se jimi projde. Bez tohohle kroku by
 * jim ten mrtvý skript zůstal v hlavičce — nastavoval by atribut, na
 * který se už žádný styl neptá, a četl by klíč, který Moje data už
 * nevypisují. */
export function migrujPredvykresleni(sablona, h) {
  const ve = /<script>\/\* Vzhled se musí nastavit[\s\S]*?<\/script>\n?/.exec(h);
  return ve ? h.replace(ve[0], '') : h;
}

export function migrujSkripty(sablona, h) {
  const VZOR = /<script src="(js\/(?:min\/)?([A-Za-z0-9_-]+)\.js)(?:\?v=[A-Za-z0-9]+)?"([^>]*)><\/script>\n?/g;
  const zPredlohy = [...sablona.matchAll(VZOR)].map((m) => ({ cela: m[0].replace(/\n$/, ''), jmeno: m[2] }));
  if (!zPredlohy.length) throw new Error('migrujSkripty: v předloze nejsou žádné skripty js/ — změnil se zápis?');
  const znam = new Set(zPredlohy.map((x) => x.jmeno));

  /* Nejdřív se ze stránky vyjmou VŠECHNY skripty, které předloha zná;
     cizí (kdyby někdy nějaký byl) zůstanou na místě. Pak se na místo
     prvního vyjmutého vloží celá sekvence z předlohy. Tím se opraví
     i pořadí, ne jen chybějící kusy. */
  /* KAM se blok vloží, se nesmí počítat jako odstup ve VSTUPU. Ten odstup
     platí ve `h`, ale krájí se jím `out`, tedy text UŽ bez vyjmutých
     skriptů — a jakmile něco padne před prvním skriptem předlohy, vloží
     se blok o ten kus dál. Naměřeno na pozemek-beroun-beroun-cpw8uy.html,
     kde mrtvý skript stál před menu.js: blok se usadil o 55 znaků dál,
     doprostřed komentáře („MUSÍ <script src=…"), takže `<!--` spolklo
     všech devatenáct skriptů stránky. Místo odstupu tu proto stojí
     značka, kterou si text odnese sám, ať se před ní vyjme cokoli. */
  const ZNACKA = '<!--PK-SEM-SKRIPTY-->';
  if (h.indexOf(ZNACKA) >= 0) throw new Error('migrujSkripty: ve stránce už je značka ' + ZNACKA);
  let prvni = -1;
  let out = h.replace(VZOR, (cela, adr, jmeno, _zbytek, odkud) => {
    if (!znam.has(jmeno)) {
      /* CIZÍ SKRIPT ZŮSTÁVÁ — ALE JEN KDYŽ OPRAVDU EXISTUJE.
         „Cizí" tu znamenalo „plátno nezná předloha", a to sedělo, dokud
         šlo o skript přidaný ručně. Jenže týž popis sedí i na skript,
         který z předlohy ZMIZEL — ten už předloha také nezná, takže tu
         zůstával navěky. Naměřeno po odebrání kalkulačky návratnosti:
         94 ukončených stránek si dál říkalo o js/min/navratnost.js, který
         na disku není — tedy 94 stránek s jedním požadavkem, který skončí
         chybou 404. Rozhoduje tedy disk, ne předloha: co existuje,
         zůstává; co ne, jde pryč. */
      try { if (!fs.existsSync(path.join(ROOT, adr))) return ''; } catch (e) {}
      return cela;
    }
    if (prvni < 0) { prvni = odkud; return ZNACKA; }
    return '';
  });
  if (prvni < 0) throw new Error('migrujSkripty: ve stránce není ani jeden skript předlohy — nemám kam vložit');
  const blok = zPredlohy.map((x) => x.cela).join('\n') + '\n';
  return out.replace(ZNACKA, blok);
}

const VETA_UKONCENO = 'Nabídka už není aktuální.';
/* STROJOVÁ DATA UKONČENÉ STRÁNKY MUSÍ ŘÍKAT TOTÉŽ JAKO PRUH V NÍ.
   Pruh nahoře říká „Tato nabídka už není aktuální", ale ve
   strukturovaných datech zůstávalo `availability: InStock`, tedy
   strojové tvrzení, že nabídka platí — a `description` začínala
   „Na prodej · 210 000 Kč". Naměřeno na 127 ukončených stránkách:
   u 7 to InStock tvrdilo, u jedné dražby nestálo nic, a zbylých 119
   nabídku v datech vůbec nemá (cena 0). Těch sedm je dnešní stav;
   roste to s každou skončenou nabídkou.
   OutOfStock, ne SoldOut: nabídka zmizela ze zdroje, což neznamená,
   že se prodala. `priceValidUntil` je ten den, kdy zmizela — po něm
   už o té ceně nic netvrdíme. */
export function migrujUkoncenaData(h, den) {
  return h.replace(/(<script type="application\/ld\+json">)([\s\S]*?)(<\/script>)/g,
    (cele, zacatek, telo, konec) => {
      let data;
      try { data = JSON.parse(telo); } catch (e) { return cele; }
      let zmena = false;
      const projdi = (x) => {
        if (Array.isArray(x)) { x.forEach(projdi); return; }
        if (!x || typeof x !== 'object') return;
        if (x['@type'] === 'Offer') {
          if (x.availability !== 'https://schema.org/OutOfStock') {
            x.availability = 'https://schema.org/OutOfStock'; zmena = true;
          }
          if (den && x.priceValidUntil !== den) { x.priceValidUntil = den; zmena = true; }
        }
        if (x['@type'] === 'Place' && typeof x.description === 'string'
          && x.description.indexOf(VETA_UKONCENO) !== 0) {
          x.description = VETA_UKONCENO + ' ' + x.description; zmena = true;
        }
        for (const k of Object.keys(x)) projdi(x[k]);
      };
      projdi(data);
      return zmena ? zacatek + JSON.stringify(data) + konec : cele;
    });
}

export function ukoncenaStranka(obsah, den, podobne) {
  let h = obsah;

  // 1) Vyhledávačům: neindexovat, ale odkazy sledovat.
  if (/<meta name="robots"/.test(h)) {
    h = h.replace(/(<meta name="robots" content=")[^"]*(">)/, '$1noindex,follow$2');
  } else {
    h = h.replace(/(<\/title>)/, '$1\n  <meta name="robots" content="noindex,follow">');
  }

  h = migrujRezDat(migrujLeaflet(h));

  // 2) Datum do stránky, ať se podle něj dá po čase smazat bez evidence.
  if (!/window\.PK_UKONCENO=/.test(h)) {
    h = h.replace(/(<script>window\.PK_POZEMEK=)/,
      `<script>window.PK_UKONCENO=${JSON.stringify(den)};</scr` + `ipt>\n$1`);
  }

  // 3) Pruh na začátek obsahu + podobné pozemky v témže okrese.
  const odkazy = podobne.map(({ soubor, d }) =>
    `<li><a href="${esc(soubor)}">${esc(d.place)}${d.area ? ' — ' + fmt(d.area) + '\u00a0m²' : ''}</a></li>`).join('');
  /* DATUM PRO LIDI, ne pro stroje. „2026-10-04" je zápis pro ukládání;
     na stránce má stát „4. 10. 2026". Web to pravidlo drží i jinde
     (zdrojText v js/pozemek.js), tak ať se tady nerozchází. */
  const cesky = (() => {
    const [r, m, d] = String(den).split('-');
    return `${Number(d)}. ${Number(m)}. ${r}`;
  })();
  const pruh = `<div class="pz-konec" role="status">`
    + `<b>Tato nabídka už není aktuální.</b> `
    + `<span>Zmizela ze zdroje ${esc(cesky)}. Stránku necháváme dostupnou, `
    + `aby uložené odkazy vedly někam, ale pozemek už takhle koupit nejde.</span>`
    + (odkazy ? `<p>Podobné pozemky ve stejném okrese:</p><ul>${odkazy}</ul>` : '')
    + `<p><a href="index.html#mapa">Zpět na mapu všech pozemků</a></p>`
    + `</div>`;
  if (!/class="pz-konec"/.test(h)) {
    h = h.replace(/(<div id="pz-detail">)/, `$1${pruh}`);
  }

  return migrujUkoncenaData(h, den);
}

/* KAM DÁL ZE STRÁNKY POZEMKU.
 *
 * Naměřeno na hotové stránce v prohlížeči: z vykresleného detailu
 * nevedl ANI JEDEN odkaz na okres, kraj ani druh pozemku. Okresní odkaz
 * ve stránce byl — ale jen ve statické části, kterou js/pozemek.js při
 * načtení přepíše celou, takže ho viděl pouze vyhledávač. Kdo přišel
 * z vyhledávače na jednu parcelu (a to je u 1 941 stránek ta hlavní
 * cesta dovnitř), měl na výběr mapu, obec v mapě a čtyři srovnatelné
 * pozemky. „Všechny pozemky v okrese" si musel najít sám.
 *
 * Odkazuje se JEN NA STRÁNKY, KTERÉ OPRAVDU EXISTUJÍ: okresní vzniká od
 * tří nabídek, krajská od patnácti, druhová od čtyřiceti a rozpočtová
 * taky od čtyřiceti — a všechny se každé sestavení smažou a vyrobí
 * znovu. Proto se tu nespoléhá na tabulku, ale na fs.existsSync:
 * generátor regionů běží před tímhle krokem (scripts/oprav.mjs).
 *
 * POČTY NABÍDEK TU SCHVÁLNĚ NEJSOU. Spočítat „35 nabídek v okrese" by
 * znamenalo druhé místo, které tohle číslo počítá — a okresní stránka
 * si ho počítá po svém (bez proběhlých dražeb). Dvě čísla o téže věci
 * se jednou rozejdou; podtitulek proto říká, co tam je, ne kolik.
 */
function jeSoubor(f) { return !!f && fs.existsSync(path.join(ROOT, f)); }
function velkePrvni(s) { return String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1); }

export function kamDal(d) {
  const ven = [];
  const ok = d.okres ? META.okresFile(d.okres) : '';
  if (jeSoubor(ok)) ven.push({ t: `Okres ${d.okres}`, u: ok, p: 'všechny pozemky v okrese' });

  const kraj = (CENY && CENY.OKRES_KRAJ) ? CENY.OKRES_KRAJ[d.okres] : null;
  const kf = kraj ? META.krajFile(kraj) : '';
  if (kraj && jeSoubor(kf)) {
    ven.push({ t: (META.KRAJ_META[kraj] || {}).disp || `${kraj} kraj`, u: kf, p: 'přehled celého kraje' });
  }

  const skupina = (CENY && CENY.druhGroup) ? CENY.druhGroup(d.druh) : '';
  const df = META.druhFile(skupina);
  const dm = META.DRUH_STRANKY.find((x) => x.soubor === df);
  if (dm && jeSoubor(df)) ven.push({ t: velkePrvni(dm.nom), u: df, p: 'týž druh pozemku po celé ČR' });

  /* Rozpočet jen u prodeje. U dražby je cena vyvolávací, takže „pozemky
     do 500 tisíc" by slibovalo cenovou hladinu, kterou tahle nabídka
     nemá — vydražit se může za trojnásobek. */
  if (d.type === 'sale' && d.price > 0) {
    const r = META.ROZPOCTY.find((x) => d.price <= x.strop);
    if (r && jeSoubor(r.soubor)) {
      ven.push({ t: `Pozemky do ${r.kratce}`, u: r.soubor, p: 'podobná cenová hladina' });
    }
  }
  return ven;
}

/* VLOŽENÝ STYL BEZ KOMENTÁŘŮ.
 *
 * Stránka pozemku si nese vlastní <style> přímo v HTML, protože se
 * otevírá z výsledků hledání a nemá se čekat na druhý soubor. Předloha
 * pozemek.html je ale ZDROJ: komentáře v ní jsou to, podle čeho se styl
 * upravuje, a do stránek nepatří. Naměřeno 37,9 kB na stránku, z toho
 * 16,5 kB komentářů — napříč 2 071 stránkami 33 MB, a 7,2 kB přes drát
 * při každém otevření inzerátu.
 *
 * Čistí se TADY, při zápisu stránky, ne až v minifikaci: stránky
 * pozemků pouští i zkoušky (scripts/test-ukonceno.mjs staví zkušební
 * osiřelou stránku a generátor spustí), a kdyby úklid visel na pozdějším
 * kroku, nechaly by po sobě strom, který se neshoduje se sestavením.
 * Takhle platí, že co generátor zapíše, je hotové.
 *
 * Mění to jen komentáře, mezery a středník před závorkou — nic z toho
 * v CSS nic neznamená. Hlídá scripts/test-vlozeny-styl.mjs porovnáním
 * s předlohou znak po znaku.
 */
function bezKomentaruVeStylu(html) {
  return html.replace(/(<style[^>]*>)([\s\S]*?)(<\/style>)/g,
    (cele, zacatek, telo, konec) => zacatek + ocistiCss(telo) + konec);
}

export function stranka(sablona, d, soubor = souborPro(d)) {
  const { titul, popis, cena, zaM2, vym, druh } = textyPro(d);
  const url = `${WEB}/${soubor}`;
  const og = `${WEB}/assets/og/okres-${slug(d.okres)}.png`;
  let h = sablona;

  // Hlava: každý pozemek má vlastní titulek, popis, adresu i náhled.
  h = h.replace(/<title>[^<]*<\/title>/, `<title>${esc(titul)} | Parcelka</title>`);
  h = h.replace(/(<meta name="description" content=")[^"]*(">)/, `$1${esc(popis)}$2`);
  h = h.replace(/(<link rel="canonical" href=")[^"]*(">)/, `$1${esc(url)}$2`);
  /* VZOR POZEMEK.HTML SE NEINDEXUJE, TAHLE STRÁNKA ANO.
     Vzor je prázdná skořápka: bez `?p=` v adrese je na ní jediná věta
     „Načítám pozemek…". Přitom měl `robots: index,follow`, takže web
     vyhledávačům nabízel k zaindexování stránku bez obsahu — a zároveň
     na ni z každé z 1 943 stránek pozemků míří odkaz „Otevřít na mapě".
     Vzor je proto nově `noindex,follow` (odkazy ven se sledovat mají)
     a tady se to pro hotovou stránku otočí zpátky: ty obsah mají a jsou
     to právě ony, co má vyhledávač v indexu mít.
     Hlídá to scripts/test-vyhledavac.mjs — a to z obou stran,
     protože obrátit tuhle dvojici naruby by potichu odindexovalo
     celý web. */
  if (/<meta name="robots"/.test(h)) {
    h = h.replace(/(<meta name="robots" content=")[^"]*(">)/, '$1index,follow$2');
  } else {
    h = h.replace(/(<\/title>)/, '$1\n  <meta name="robots" content="index,follow">');
  }
  h = h.replace(/(<meta property="og:type" content=")[^"]*(">)/, '$1article$2');
  h = h.replace(/(<meta property="og:title" content=")[^"]*(">)/, `$1${esc(titul)}$2`);
  h = h.replace(/(<meta property="og:description" content=")[^"]*(">)/, `$1${esc(popis)}$2`);
  h = h.replace(/(<meta property="og:image" content=")[^"]*(">)/, `$1${esc(og)}$2`);
  h = h.replace(/(<meta name="twitter:title" content=")[^"]*(">)/, `$1${esc(titul)}$2`);
  h = h.replace(/(<meta name="twitter:description" content=")[^"]*(">)/, `$1${esc(popis)}$2`);
  h = h.replace(/(<meta name="twitter:image" content=")[^"]*(">)/, `$1${esc(og)}$2`);
  if (!/<meta property="og:url"/.test(h)) {
    h = h.replace(/(<meta property="og:type"[^>]*>)/, `$1\n  <meta property="og:url" content="${esc(url)}">`);
  } else {
    h = h.replace(/(<meta property="og:url" content=")[^"]*(">)/, `$1${esc(url)}$2`);
  }

  // Strojově čitelný popis místa — kvůli vyhledávačům.
  /* jsonVeStrance, ne JSON.stringify: obsah <script> je surový text a končí
     prvním koncem skriptu, i kdyby stál uvnitř řetězce v JSONu. Názvy obcí
     sem přitom přicházejí z cizích webů. Viz scripts/json-do-stranky.mjs. */
  /* DROBEČKY. Stránky krajů a okresů je mají, stránky pozemků ne — a to je
     1 993 z 2 113 stránek webu, navíc ty nejhlubší. Vyhledávač pak
     ve výsledku ukáže holou adresu místo cesty „Pozemky › Okres Benešov ›
     …", takže z výsledku není poznat, kam vlastně vede.
     Cesta musí být SKUTEČNÁ, ne vymyšlená: okresní stránka vzniká jen tam,
     kde je dost nabídek, takže se ověřuje, že soubor opravdu existuje —
     generátor regionů běží před tímhle krokem (viz scripts/oprav.mjs).
     Když okresní stránka není, drobečky končí u rozcestníku. */
  const okresSoubor = `pozemky-okres-${slug(d.okres)}.html`;
  const maOkres = !!d.okres && fs.existsSync(path.join(ROOT, okresSoubor));
  const drobecky = [
    { '@type': 'ListItem', position: 1, name: 'Pozemky', item: `${WEB}/` },
    { '@type': 'ListItem', position: 2, name: 'Pozemky podle okresů', item: `${WEB}/pozemky-podle-okresu.html` },
  ];
  /* KRAJ DO CESTY. Hierarchie webu je Pozemky › kraj › okres › pozemek,
     ale drobečky krajský stupeň přeskakovaly — ve výsledku vyhledávače
     tedy z cesty nebylo poznat, ve které části země pozemek leží.
     Přidá se jen tam, kde krajská stránka opravdu vznikla (mez patnácti
     nabídek), aby cesta nevedla na nic. */
  const krajNazev = (CENY && CENY.OKRES_KRAJ) ? CENY.OKRES_KRAJ[d.okres] : null;
  const krajSoubor = krajNazev ? META.krajFile(krajNazev) : '';
  if (krajNazev && krajSoubor && fs.existsSync(path.join(ROOT, krajSoubor))) {
    drobecky.push({ '@type': 'ListItem', position: drobecky.length + 1,
      name: (META.KRAJ_META[krajNazev] || {}).disp || `${krajNazev} kraj`,
      item: `${WEB}/${krajSoubor}` });
  }
  if (maOkres) {
    drobecky.push({ '@type': 'ListItem', position: drobecky.length + 1, name: `Okres ${d.okres}`, item: `${WEB}/${okresSoubor}` });
  }
  drobecky.push({ '@type': 'ListItem', position: drobecky.length + 1, name: titul, item: url });

  /* CENA I PRO STROJE. Stránka cenu vypisuje, ale ve strukturovaných
     datech nebyla ani na jedné z 1 941 živých stránek — byl tam jen
     Place a drobečky. Vyhledávač tedy o ceně, měně ani o tom, jestli
     nabídka ještě platí, nevěděl nic.

     POCTIVÁ VÝHRADA: pro pozemky nemá Google vyhrazený bohatý výsledek,
     takže se nedá slíbit, že se cena ve výsledcích ukáže. Značkování je
     ale správné a stojí ~200 bajtů na stránku.

     PROČ Offer A NE Product: Product je zboží s názvem a výrobcem,
     pozemek není. Offer visí přímo na místě (Place.makesOffer), což je
     přesně to, co se tu tvrdí: tohle místo se nabízí za tolik.

     DRAŽBA SE NEVYDÁVÁ ZA PRODEJ. U dražby a exekuce je cena vyvolávací,
     ne požadovaná — kdyby se označila jako běžná nabídka, byl by web
     ve výsledcích nejlevnější na trhu a lhal by. Dostane proto jen
     odhad ceny (PriceSpecification) bez příslibu, že se za to prodá.

     CENA ZA PODÍL NENÍ CENA ZA POZEMEK. U spoluvlastnického podílu se
     platí za zlomek, ale výměra je celé parcely; nabídka se proto
     popíše jako podíl rovnou v názvu, ne jen číslem. */
  /* VÝHRADY SE SČÍTAJÍ, NEPŘEPISUJÍ SE. První verze je skládala přes
     Object.assign, každou jako vlastní „description" — takže u dražby,
     která je ZÁROVEŇ spoluvlastnický podíl, druhá poznámka tu první
     přepsala a ze stránky zmizelo, že jde o vyvolávací cenu. Takových
     je v datech většina dražeb. Našla to zkouška teprve ve chvíli, kdy
     přestala být slepá. */
  const jeProdej = d.type === 'sale';
  const vyhrady = [];
  if (!jeProdej) vyhrady.push('Vyvolávací cena ve veřejné dražbě, ne cena požadovaná prodávajícím.');
  if (d.podil) vyhrady.push('Cena je za spoluvlastnický podíl; uvedená výměra patří celé parcele.');
  const nabidka = d.price > 0 ? Object.assign(
    {
      '@type': 'Offer', price: d.price, priceCurrency: 'CZK', url,
      itemOffered: { '@type': 'Place', name: titul },
    },
    jeProdej ? { availability: 'https://schema.org/InStock' } : {},
    vyhrady.length ? { description: vyhrady.join(' ') } : {}
  ) : null;

  const misto = {
    '@context': 'https://schema.org', '@type': 'Place', name: titul, description: popis, url,
    address: { '@type': 'PostalAddress', addressLocality: d.place, addressRegion: d.okres, addressCountry: 'CZ' },
    geo: { '@type': 'GeoCoordinates', latitude: d.lat, longitude: d.lng },
  };
  /* Výměra strojově čitelně. Na stránce stojí „6 336 m²", ale jako text;
     QuantitativeValue z ní dělá číslo s jednotkou (MTK = metr čtvereční
     podle UN/CEFACT, což schema.org používá). */
  if (d.area > 0) {
    misto.additionalProperty = { '@type': 'QuantitativeValue', name: 'Výměra',
      value: d.area, unitCode: 'MTK' };
  }
  if (nabidka) misto.makesOffer = nabidka;

  const ld = jsonVeStrance([
    misto,
    { '@context': 'https://schema.org', '@type': 'BreadcrumbList', itemListElement: drobecky },
  ]);

  /* Obsah pro toho, kdo JavaScript nespustí (roboti vyhledávačů, náhledy
     v chatech). Skript ho po načtení nahradí plným detailem — proto to
     nesmí být prázdná skořápka ani přesměrování: za doorway stránky bez
     obsahu Google trestá, a po právu. */
  /* Text se skládá JEDNOU, v js/okruh.js: vepisuje se staticky do
     stránky (i pro vyhledávače a pro toho, kdo nemá JavaScript) a tentýž
     ho pak vypisuje js/pozemek.js z přiloženého kousku JSONu. Dvě
     skládání téhož textu by se rozešla. */
  const vzdalenosti = OKRUH.popisVzdalenosti(d);
  const vObec = vObciOdkaz(d);
  const blok = blokPro(d);
  const srov = srovnaniPro(d);
  const kamDalSem = kamDal(d);
  const staticky =
    `<article class="pz-staticky">`
    + `<h1>${esc(titul)}</h1>`
    + `<p><b>${esc(cena)}</b>${esc(zaM2)}${vym ? ' · ' + esc(vym) : ''} · ${esc(TYP[d.type] || d.type)}</p>`
    + `<dl>`
    + `<dt>Druh pozemku</dt><dd>${esc(druh)}</dd>`
    + (vym ? `<dt>Výměra</dt><dd>${esc(vym)}</dd>` : '')
    + `<dt>Obec</dt><dd>${esc(d.place)}</dd>`
    + `<dt>Okres</dt><dd><a href="pozemky-okres-${slug(d.okres)}.html">${esc(d.okres)}</a></dd>`
    + (d.parcel && d.parcel !== '—' ? `<dt>Parcela</dt><dd>č. ${esc(d.parcel)}</dd>` : '')
    /* PODÍL PATŘÍ I DO STATICKÉHO VÝPISU. Tělo stránky ho hlásí
       (js/pozemek.js: „inzerát mluví o spoluvlastnickém podílu"), ale
       v tom, co vidí vyhledávač a kdo nemá JavaScript, nestálo nic —
       a zrovna u podílu je to ta nejdůležitější věta: cena je za zlomek,
       výměra za celou parcelu. */
    + (d.podil ? `<dt>Vlastnictví</dt><dd>spoluvlastnický podíl${d.zlomek ? ' ' + esc(d.zlomek) : ''} — cena je za podíl, výměra za celou parcelu</dd>` : '')
    + (d.extra ? `<dt>Stav / zdroj</dt><dd>${esc(lidskeDatum(d.extra))}</dd>` : '')
    /* JAK DALEKO JE TO DO MĚSTA. U pozemku na vsi je to první otázka
       a z názvu obce se nepozná — „Lovečkovice" samy o sobě neřeknou
       nic. Je to vzdušná čára, tak se to i píše. */
    + (vzdalenosti ? `<dt>Vzdušnou čarou</dt><dd>${esc(vzdalenosti)}</dd>` : '')
    + `</dl>`
    + `<p><a href="pozemek.html?p=${encodeURIComponent(pkey(d))}&amp;ll=${d.lat},${d.lng}&amp;v=${d.area || 0}&amp;c=${d.price || 0}">Otevřít na mapě</a></p>`
    + (vObec ? `<p><a href="${esc(vObec.url)}">${esc(vObec.text)}</a></p>` : '')
    + (blok ? `<p>${esc(blok.text)}</p>` : '')
    /* SROVNÁNÍ I DO STATICKÉ ČÁSTI. Je to jediná část stránky, kterou
       nejde opsat odjinud, a zároveň proveže 2 053 stránek pozemků
       navzájem — dosud vedl z každé z nich jediný odkaz jinam (do
       okresu). Pro vyhledávač je to cesta dovnitř webu, pro člověka
       bez JavaScriptu plnohodnotný obsah. */
    + (srov ? `<h2>${srov.p ? 'Srovnatelné spoluvlastnické podíly v okolí'
      : 'Srovnatelné pozemky v okolí'}</h2><p>${esc(srov.v)}`
      + (srov.p ? ' Ceny jsou za metr, který kupujícímu připadne — výměra je celá parcela.' : '')
      + `</p><ul>`
      + srov.r.map((x) => `<li>${fmt(x.m)} Kč/m² — `
        + (x.ja ? `<b>tenhle pozemek</b>` : `<a href="${esc(x.s)}">${esc(x.o)}</a>`)
        + `, ${fmt(x.vym)} m²${x.km ? ', ' + x.km + ' km' : ''}</li>`).join('')
      + `</ul>` : '')
    /* Rozcestník i do statické části: pro vyhledávač je to cesta výš
       (okres, kraj, druh, rozpočet), pro člověka bez JavaScriptu táž
       čtyři místa jako v plném detailu. Skládá se z TÉŽE tabulky, kterou
       dostane prohlížeč v ostrůvku — dvě různé nabídky odkazů na jedné
       stránce by si odporovaly. */
    + (kamDalSem.length
      ? `<h2>Kam dál</h2><ul>`
        + kamDalSem.map((x) => `<li><a href="${esc(x.u)}">${esc(x.t)}</a>`
          + (x.p ? ` — ${esc(x.p)}` : '') + `</li>`).join('')
        + `</ul>`
      : '')
    + `</article>`;
  h = h.replace(/<div id="pz-detail">[\s\S]*?<\/div>/,
    `<div id="pz-detail">${staticky}</div>`);

  /* Předání skriptu: která nabídka to je, bez tahání z adresy.

     KOTVA SE HLEDÁ V OBOU PODOBÁCH CESTY. Stránky odkazují na očištěné
     kopie v js/min/, ale dřív než se očištění zavedlo tu stálo jen
     js/pozemek.js — a replace(), který nic nenajde, MLČÍ. Výsledek:
     ostrůvek s window.PK_POZEMEK i strukturovaná data zmizely ze všech
     1 988 stránek pozemků a generátor hlásil úspěch. Chytily to až
     test-ukonceno a test-stranky-pozemku; proto se tu teď navíc
     ověřuje, že se kotva opravdu našla. */
  const kotvaPozemek = /(<script src="js\/(?:min\/)?pozemek\.js)/;
  if (!kotvaPozemek.test(h)) {
    throw new Error(`${soubor}: nenašla se kotva <script src="js/pozemek.js"> `
      + '— ostrůvek s daty pozemku a strukturovaná data by ve stránce chyběly');
  }
  h = h.replace(kotvaPozemek,
    `<script type="application/ld+json">${ld}</scr` + `ipt>\n`
    /* „v" a „c" (výměra a cena) jsou tu kvůli pozemkům, které sdílejí
       klíč: bez nich by stránka toho druhého z dvojice nedokázala ve
       stažených datech najít sám sebe a vzala by prostě první nález. */
    /* „r" je ŘEZ DAT, ze kterého si stránka vezme sebe. Celá data mají
       638 kB (56,5 kB přes drát) a stránka z nich potřebuje dvě věci:
       sebe — a ta je v řezu svého okresu (8,6 kB průměrně, 1,6 kB přes
       drát) — a celostátní cenový model, který leží zvlášť
       v data/model.json (38,7 kB, 11,5 kB přes drát). Dohromady tedy
       místo 56,5 kB asi 13 kB, a surově 42 kB místo 638 kB, což je
       hlavně míň práce pro parser v telefonu.
       Cesta stojí tady, protože okres zná generátor; stránka by si ho
       z vlastního HTML musela luštit. */
    + `<script>window.PK_POZEMEK=${jsonVeStrance(Object.assign({ k: pkey(d), ll: [d.lat, d.lng], v: d.area || 0, c: d.price || 0, r: `data/okres/${slug(d.okres)}.json` }, historieCeny(d) ? { h: historieCeny(d) } : {}, parcelaZTextu(d) ? { pc: parcelaZTextu(d) } : {}))};</scr` + `ipt>\n$1`);
  /* POPIS OD INZERENTA, vepsaný rovnou do stránky. Leží v samostatném
     souboru (data/popisy.json), protože do opportunities.json, který čte
     úvodní stránka, nepatří — přidal by k němu zhruba megabajt. Sem se
     dostane jen ten jediný, který k téhle stránce patří: pár set bajtů.
     Text přichází z cizího inzerátu, takže jde do stránky přes
     jsonVeStrance a vykresluje ho js/pozemek.js přes textContent — do
     HTML se nikdy nevkládá jako značky. */
  if (vzdalenosti) {
    h = h.replace(/(<\/body>)/,
      `<script type="application/json" id="pz-okoli-data">${jsonVeStrance(vzdalenosti)}</scr` + `ipt>\n$1`);
  }
  if (vObec) {
    h = h.replace(/(<\/body>)/,
      `<script type="application/json" id="pz-obec-data">${jsonVeStrance(vObec)}</scr` + `ipt>\n$1`);
  }
  if (blok) {
    h = h.replace(/(<\/body>)/,
      `<script type="application/json" id="pz-blok-data">${jsonVeStrance(blok)}</scr` + `ipt>\n$1`);
  }
  /* Hotový seznam, ne data k dopočítání: pořadí skládá jedno místo
     (scripts/srovnatelne.mjs) a prohlížeč ho jen vypisuje. Názvy obcí
     chodí z cizích inzerátů, proto přes jsonVeStrance a v prohlížeči
     přes esc(). */
  if (srov) {
    h = h.replace(/(<\/body>)/,
      `<script type="application/json" id="pz-srovnani-data">${jsonVeStrance(srov)}</scr` + `ipt>\n$1`);
  }
  /* Hotový seznam odkazů, ne data k dopočítání: které regionální stránky
     dnes existují, ví jen generátor (soubory se každé sestavení mažou
     a vyrábějí znovu). Prohlížeč by to z vlastního HTML nezjistil
     a odkazoval by do prázdna. */
  /* NADPIS SE SKLÁDÁ JEDNOU.
     Stránka existuje ve dvou podobách: servírované (statická, pro
     vyhledávače a pro toho, kdo nemá JavaScript) a vykreslené, kterou
     js/pozemek.js postaví na její místo. Nadpisy se rozcházely —
     servírovaný nesl „Trvalý travní porost 4 889 m² — Bystřice",
     vykreslený jen „Bystřice". To druhé je jméno obce a sdílí ho víc
     nabídek: 1 269 z 1 941 stránek (65 %) mělo po vykreslení nadpis
     shodný s nějakou jinou, osmnáct se jich jmenovalo „Slatina".
     A protože vyhledávač stránku vykresluje, počítá se ten horší.
     Titul sem jde hotový, i s rozlišením shodných titulků
     (ROZLISENI) — prohlížeč by si ho z vlastního HTML neposkládal. */
  h = h.replace(/(<\/body>)/,
    `<script type="application/json" id="pz-titul-data">${jsonVeStrance(titul)}</scr` + `ipt>\n$1`);
  if (kamDalSem.length) {
    h = h.replace(/(<\/body>)/,
      `<script type="application/json" id="pz-kamdal-data">${jsonVeStrance(kamDalSem)}</scr` + `ipt>\n$1`);
  }
  const popisInzerenta = POPISY[klicNabidky(d)];
  if (popisInzerenta) {
    h = h.replace(/(<\/body>)/,
      `<script type="application/json" id="pz-popis-data">${jsonVeStrance(popisInzerenta)}</scr` + `ipt>\n$1`);
  }
  return bezKomentaruVeStylu(h);
}

/* Pravidlo pro duplicity je jedno pro celý web (js/hlidani-logika.js).
   Ten soubor je obyčejný skript pro prohlížeč, ne modul — načte se
   stejně jako v scripts/generate-region-pages.mjs. */
const PKH = createRequire(import.meta.url)(path.join(ROOT, 'js', 'hlidani-logika.js'));
/* Vzdálenosti do měst počítá tentýž modul, jaký je v prohlížeči
   (js/okruh.js) — a tabulku okresních měst v něm hlídá proti
   data/okresy.json scripts/test-okruh.mjs. */
const OKRUH = createRequire(import.meta.url)(path.join(ROOT, 'js', 'okruh.js'));
/* Cenový model — tentýž, jaký počítá mapa i samotná stránka pozemku.
   Bez něj by titulek a popis stránky tvrdily jinou cenu za metr než její
   vlastní tělo; viz textyPro(). js/ceny.js je skript pro prohlížeč, ne
   modul, takže se spustí a zapíše se do globálu. */
new Function(fs.readFileSync(path.join(ROOT, 'js', 'ceny.js'), 'utf8'))();
const CENY = globalThis.PK_CENY;
if (!CENY || !CENY.zaMetr) {
  console.error('js/ceny.js se nenačetl — cena za metr by se počítala jinak než na stránce.');
  process.exit(1);
}

/* Termíny — tentýž modul jako mapa i stránka pozemku. Po termínu se
   dražba ve výpisu neukazuje, takže se nesmí počítat ani do slibu
   „v obci je ještě pět pozemků". */
createRequire(import.meta.url)(path.join(ROOT, 'js', 'terminy.js'));
const TERM = globalThis.PK_TERMINY;
function poTerminu(o) {
  const n = TERM && TERM.daysUntil ? TERM.daysUntil(o && o.extra) : null;
  return n != null && n < 0;
}

/* KOLIK DALŠÍCH POZEMKŮ JE V TÉŽE OBCI. Stránka pozemku byla slepá
   ulička: kdo na ni přijde z vyhledávače, neměl odkud se dozvědět, že ve
   stejné obci je v nabídce ještě pět dalších — a to je zrovna to, co
   kupující hledá (nekupuje se konkrétní parcela, kupuje se místo).
   Počítá se z TOHO, co mapa ukazuje: bez duplicit a bez nabídek po
   termínu, protože na to číslo se odkazuje a mapa po klepnutí musí
   ukázat totéž. Adresa je PŘESNÉ místo (?obec=&okres=), ne hledání
   textem — viz scripts/generate-region-pages.mjs, kde je to rozepsané. */
let V_OBCI = null;
export function vObci(d) {
  if (!V_OBCI) {
    V_OBCI = {};
    for (const o of nabidky()) {
      if (!o || !o.place || !o.okres || poTerminu(o)) continue;
      const k = o.place + '|' + o.okres;
      V_OBCI[k] = (V_OBCI[k] || 0) + 1;
    }
  }
  if (!d || !d.place || !d.okres) return 0;
  const n = V_OBCI[d.place + '|' + d.okres] || 0;
  /* Sám sebe do „dalších" nepočítá. Nabídka po termínu v indexu není,
     takže by se odečtením dostala na minus jednu. */
  return poTerminu(d) ? n : Math.max(0, n - 1);
}
/* Věta a adresa zvlášť, bez HTML: tentýž text vypisuje staticky
   generátor i js/pozemek.js, a do stránky nesmí přes ostrůvek s JSONem
   putovat značky — viz scripts/json-do-stranky.mjs. */
export function vObciOdkaz(d) {
  const n = vObci(d);
  if (!n) return null;
  const kde = (d.place === d.okres ? 'okrese ' : 'obci ') + d.place;
  const text = n === 1 ? `V ${kde} je v nabídce ještě jeden pozemek`
    : (n < 5 ? `V ${kde} jsou v nabídce ještě ${n} pozemky`
             : `V ${kde} je v nabídce ještě ${fmt(n)} pozemků`);
  return { text: text, url: 'index.html?obec=' + encodeURIComponent(d.place)
    + '&okres=' + encodeURIComponent(d.okres) };
}

/* ===== VÍC POZEMKŮ NA JEDNOM MÍSTĚ =================================
   Kdo kupuje půdu, nekupuje tvar parcely, ale výměru na jednom místě.
   Pět hektarů v jednom kuse je něco jiného než pět hektarů po okrese —
   a z výpisu se to nepozná, protože každá parcela je samostatná řádka.
   Pravidla shluku (do 300 m, tranzitivně, od tří nabídek) i to, co se
   schválně netvrdí, leží v scripts/bloky.mjs. Tady se z čísel skládá
   věta — a ta musí vzniknout JEN JEDNOU, proto se počítá pro všechny
   nabídky naráz a ne pro každou stránku zvlášť. */
let SOUSEDI = null;
export function blokPro(d) {
  if (!SOUSEDI) SOUSEDI = BLOKY.sousedi(nabidky().filter((o) => !poTerminu(o)));
  const ost = SOUSEDI.get(BLOKY.klic(d));
  const s = BLOKY.souhrn(d, ost);
  if (!s) return null;
  const dalsich = s.pocet - 1;
  const ha = s.vymera / 10000;
  const vymeraText = ha >= 1 ? `${ha.toFixed(ha >= 10 ? 1 : 2).replace('.', ',')} ha` : `${fmt(Math.round(s.vymera))} m²`;
  /* ČESKY: „prodávají se ještě 2 další pozemky", ale „prodává se ještě
     7 dalších pozemků" — od pěti výš jde podstatné jméno do 2. pádu
     množného čísla a sloveso zpátky do jednotného. Dvojka s jednotným
     slovesem („se prodává ještě 2 další pozemky") je ta chyba, které si
     čtenář všimne dřív než čehokoli jiného na stránce. */
  const kolik = dalsich < 5
    ? `prodávají ještě ${dalsich} další pozemky`
    : `prodává ještě ${fmt(dalsich)} dalších pozemků`;
  let text = `V okruhu ${s.mez} m se ${kolik} — dohromady ${vymeraText}`;
  if (s.cena !== null) text += ` za ${fmt(s.cena)} Kč`;
  text += '.';
  /* PODÍL SOUČET NAFUKUJE: v inzerátu je výměra celé parcely, ale kupuje
     se zlomek. Když je ve shluku, musí to u součtu stát. */
  if (s.podilu) {
    text += s.podilu === 1
      ? ' Jeden z nich je spoluvlastnický podíl, takže jeho výměra je za celou parcelu, ne za to, co se prodává.'
      : ` ${fmt(s.podilu)} z nich jsou spoluvlastnické podíly, takže jejich výměra je za celé parcely, ne za to, co se prodává.`;
  }
  /* Netvrdí se, že parcely spolu SOUSEDÍ (na to by byly potřeba hranice
     z katastru) ani že se dají koupit najednou — prodejců může být víc. */
  return { text, pocet: s.pocet, vymera: s.vymera, cena: s.cena, podilu: s.podilu, mez: s.mez };
}

/* ===== SROVNATELNÉ POZEMKY =========================================
   Stránka uměla vynést verdikt („dražší než 98 % pozemků téhož druhu
   v kraji") a neukázala k němu jediný důkaz. Kdo si ho chtěl ověřit,
   musel odejít na mapu a hledat sám — a většina lidí si prostě vybere,
   jestli webu věřit, nebo ne. Tohle to otáčí: pod verdiktem stojí čtyři
   konkrétní nabídky, se kterými se tenhle pozemek porovnával, i s cenami
   a s odkazy. Pořadí ve větě si každý může v tom seznamu přepočítat.

   Pravidla výběru (týž druh, výměra ±3×, do 25 km) a hlavně jejich
   zdůvodnění leží v scripts/srovnatelne.mjs; hlídá je
   scripts/test-srovnatelne.mjs. Tenhle soubor jen dohledá, která
   nabídka má kterou stránku, a složí z toho text.

   MODEL SE STAVÍ Z TÝCHŽ DAT jako verdikt o kus výš, takže se nemůže
   stát, aby stránka tvrdila „dražší než 98 %" a pod tím vypsala čtyři
   dražší. A z porovnávaných nabídek vypadne všechno, čemu model sám
   nevěří: spoluvlastnické podíly (cena je za zlomek, výměra za celou
   parcelu) a ceny, u kterých stránka jinde hlásí „cena k ověření".
   Srovnávat se špatně načtenou cenou je horší než nesrovnávat. */
let SROVNANI = null;
let SROVNANI_MODEL = null;
export function pripravSrovnani(mapa) {
  const polozky = [];
  const MODEL = SROVNANI_MODEL || (SROVNANI_MODEL = CENY.postav(nabidky()));
  for (const { d, soubor } of mapa.values()) {
    if (!d || d.type !== 'sale' || poTerminu(d)) continue;
    if (!(d.price > 0 && d.area >= 100 && d.area <= 500000)) continue;
    if (!isFinite(d.lat) || !isFinite(d.lng)) continue;
    if (MODEL.neduveryhodna && MODEL.neduveryhodna(d)) continue;
    /* ÚŘEDNÍ CENA NENÍ DŮKAZ O TRHU — ani vedle sebe, ani o sobě.
       Státní pozemkový úřad prodává podle § 12 oprávněné osobě za cenu,
       kterou nestanovil trh. Z VŠECH srovnávacích přihrádek v js/ceny.js
       taková nabídka vypadává (viz spravniCena tam) a od 10. 10. nedostane
       ani percentil, ani odznak „výhodná cena". Seznam srovnatelných
       pozemků je ale taky přihrádka, jen vypsaná — a tam zůstávala.
       Změřeno na ostrých datech: ze 204 nabídek s úřední cenou jich 51
       projde sítem výš, 83 řádků ve 37 seznamech pak ukazovalo úřední cenu
       jako stav trhu a 20 stránek § 12 dostalo vlastní pořadí proti trhu.
       Nejhorší případ: pozemek za 36 Kč/m² byl „z čtyř nabídek nejdražší"
       proti ceně 31 Kč/m², kterou stanovil úřad. Za tolik se louka
       neprodává, to je cena pro oprávněnou osobu.
       Stojí to 31 stránek z 913, které o sekci přijdou (z nich 20 jsou
       ty § 12 samy), a okruh se neprotáhne ani o kilometr: medián
       zůstává 16 km, devadesátý percentil 24 km. */
    if (MODEL.spravniCena && MODEL.spravniCena(d)) continue;
    /* A TAKY TO, PŘED ČÍM WEB JINDE SÁM VARUJE. `neduveryhodna` je
       hrubé síto (cena pod padesátinou hladiny) a chytilo 3 nabídky
       z 1 817. Model má ale ještě druhé, přísnější: `pochybna` —
       „takový rozdíl bývá spoluvlastnický podíl nebo jiná výměra,
       ověřte si to". Tou je označených 140 nabídek, a ty se objevovaly
       v seznamu srovnatelných jako obyčejný důkaz o trhu.
       Vznikaly z toho stránky, které si odporovaly samy: odznak „−68 %
       proti okolí" a hned pod ním pět nabídek po 5–6 Kč/m² za ornou
       půdu, mezi nimiž byl ten pozemek nejdražší. Za tolik se pole
       neprodává; jsou to podíly a chyby ve výměře.
       Stojí to 99 stránek ze 1 125, které o srovnání přijdou (medián
       okruhu 14 → 15 km). To je poctivá cena: tvrdit něco cenou, které
       sám nevěřím, je horší než o tom mlčet. */
    const odh = MODEL.odhad && MODEL.odhad(d);
    if (odh && odh.pochybna) continue;
    const m2 = CENY.zaMetr(d);
    if (!(m2 > 0)) continue;
    /* PODÍL SE SROVNÁVÁ JEN S PODÍLEM, a dělá to tahle jediná hvězdička
       v klíči skupiny — tedy ne pravidlem, na které se dá zapomenout,
       ale tím, že do sebe ty dvě hromádky prostě nezapadnou.
       Nejdřív byly podíly z porovnávání vyhozené úplně. Jenže je jich
       497 z 1 814 nabídek k prodeji, tedy víc než čtvrtina webu, a byly
       to zrovna ty stránky, kde je člověk nejvíc ztracený: cena za metr
       vypadá sedmkrát levněji, než je trh.
       Porovnávat podíl s celou parcelou nejde (podíl se nedá oplotit
       ani samostatně prodat, a trh to ocení), porovnat ho s jiným
       podílem jde dobře. js/ceny.js u obou přepočítává cenu na metr,
       KTERÝ KUPUJÍCÍMU PŘIPADNE, takže se srovnává totéž. Pokrytí
       stránek tím vyskočilo z 855 na 1 131. */
    polozky.push({ id: soubor, soubor, d, pk: pkey(d),
      skupina: MODEL.druhGroup(d.druh) + (d.podil ? '|podíl' : ''),
      podil: !!d.podil, area: d.area, m2: Math.round(m2), lat: d.lat, lng: d.lng });
  }
  SROVNANI = new Map();
  for (const ja of polozky) {
    const s = SROV.srovnatelne(ja, polozky);
    if (!s) continue;
    /* Do stránky jde hotový seznam VČETNĚ tohohle pozemku na svém místě.
       Kdyby se vkládal až v prohlížeči, počítala by si pořadí dvě místa
       a to druhé by se jednou spletlo. */
    const radky = s.polozky.map((p) => ({ s: p.x.soubor, o: p.x.d.place,
      vym: p.x.area, m: p.x.m2, km: Math.max(1, Math.round(p.km)) }));
    radky.splice(s.poradi - 1, 0, { ja: 1, o: ja.d.place, vym: ja.area, m: ja.m2 });
    SROVNANI.set(klicNabidky(ja.d),
      Object.assign({ v: SROV.veta(s), r: radky }, ja.podil ? { p: 1 } : {}));
  }
  return SROVNANI;
}
export function srovnaniPro(d) {
  return (SROVNANI && SROVNANI.get(klicNabidky(d))) || null;
}

/* KTERÉ NABÍDCE PATŘÍ KTERÁ STRÁNKA — a proč to bydlí tady.
   Regionální stránky na tyhle stránky odkazují, takže potřebují tentýž
   výpočet. Kdyby si ho spočítaly podruhé, rozešel by se s tím, co se
   opravdu vygenerovalo, a odkazy by mířily na neexistující soubory —
   tedy na 404. Je to tentýž důvod, pro který skládání řádku od majitele
   skončilo v jedné funkci (js/cisteni.js). Rozhoduje o tom seskupení
   níž, ne jen název souboru, a proto to nejde vyjádřit čistou funkcí
   nad jednou nabídkou. */
export function klicNabidky(d) {
  return pkey(d) + '#' + (d.price || 0) + '|' + (d.area || 0);
}
export function mapaSouboru(D) {
  /* NEJDŘÍV SESKUPIT, POTOM ROZHODNOUT. Dřív se tu na druhý pozemek se
     stejným klíčem prostě zapomnělo („tentýž pozemek ze dvou zdrojů =
     jedna stránka“). Jenže skutečné duplicity zahodil už PKH.bezDuplicit
     o řádek výš — co projde až sem se shodným klíčem, jsou nabídky, které
     pravidlo pro duplicity za tentýž pozemek NEPOVAŽUJE. Naměřeno: 37
     nabídek tím přišlo o vlastní stránku a u 26 z nich se cena nebo
     výměra lišila od té, která stránku dostala. Odkaz na ně ukázal cizí
     pozemek: cizí cenu, cizí výměru. */
  const skupiny = new Map();
  for (const d of D) {
    if (!isFinite(d.lat) || !isFinite(d.lng) || !d.place || !d.okres) continue;
    const k = pkey(d);
    if (!skupiny.has(k)) skupiny.set(k, []);
    skupiny.get(k).push(d);
  }
  const ven = new Map();
  for (const cleny of skupiny.values()) {
    /* Shodná cena I výměra na jednom místě = pořád tentýž pozemek, jen
       podruhé. Takovým se dělá jedna stránka dál: dvě adresy pro jednu
       nabídku si ve vyhledávači konkurují (kvůli tomu tu to slučování
       vzniklo). Rozhoduje se tedy podle TOHO, ČÍM SE LIŠÍ, ne podle
       toho, že klíč je shodný. */
    const podleObsahu = new Map();
    for (const d of cleny) {
      const podpis = (d.price || 0) + '|' + (d.area || 0);
      if (!podleObsahu.has(podpis)) podleObsahu.set(podpis, d);
    }
    /* Pořadí musí být dané daty, ne pořadím v souboru — jinak by se
       dnešní adresa přestěhovala na jinou nabídku, jakmile robot data
       přeskládá. */
    const ruzne = [...podleObsahu.values()].sort((a, b) =>
      (a.area || 0) - (b.area || 0) || (a.price || 0) - (b.price || 0)
      || String(a.url || '').localeCompare(String(b.url || '')));
    ruzne.forEach((d, i) => {
      ven.set(klicNabidky(d), { d: d, soubor: i === 0 ? souborPro(d) : souborProDalsi(d) });
    });
  }
  return ven;
}

/* Nabídky, ze kterých se stránky dělají — tentýž vstup jako má generátor
   regionálních stránek, ať se mapování odkazů a skutečně vyrobené soubory
   nemůžou rozejít. */
export function nabidky() {
  const syrova = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'opportunities.json'), 'utf8')).opportunities || [];
  /* Duplicity odstraňuje TATÁŽ funkce jako mapa (js/main.js) i generátor
     regionálních stránek — js/hlidani-logika.js. Dřív si tenhle generátor
     vystačil s vlastním klíčem (pkey: obec, parcela, okres, souřadnice)
     a to nestačilo: tentýž pozemek ze dvou zdrojů mívá parcelní číslo
     jen u jednoho z nich a souřadnice o pár set metrů jinde. Dražba
     v Trubíně (okdrazby.cz/drazba/27823) tak dostala dvě vlastní
     stránky — dvě adresy pro jednu dražbu, obě v sitemap, obě si ve
     vyhledávači konkurovaly. Vlastní pravidlo je tu pořád, ale až jako
     druhé síto: rozlišuje stránky, nerozhoduje o duplicitách. */
  return PKH.bezDuplicit(syrova);
}

export function generuj() {
  const sablona = fs.readFileSync(path.join(ROOT, 'pozemek.html'), 'utf8');
  const hotove = [];
  const mapa = mapaSouboru(nabidky());
  /* Rozlišení shodných titulků potřebuje vidět všechny stránky naráz,
     takže se spočítá dřív, než se začne psát. */
  const vsechny = [...mapa.values()].map((x) => x.d);
  pripravRozliseni(vsechny);
  pripravRozliseniPopisu(vsechny);
  /* Srovnání potřebuje vidět všechny stránky naráz (hledá se podle
     vzdálenosti, ne podle okresu), takže taky dřív, než se začne psát. */
  pripravSrovnani(mapa);
  for (const { d, soubor } of mapa.values()) {
    fs.writeFileSync(path.join(ROOT, soubor), stranka(sablona, d, soubor));
    hotove.push(soubor);
  }
  /* KONEC NABÍDKY NENÍ KONEC ADRESY.
     Tohle místo stránky zmizelých nabídek MAZALO. Znělo to rozumně —
     web nemá slibovat pozemky, které už nikde nejsou — jenže smazaná
     stránka neřekne nic: vrátí 404. A protože se data obnovují čtyřikrát
     denně a stránek je přes 1 990, znamenalo to nepřetržitý proud
     mrtvých adres. Každý výsledek ve vyhledávači a každý uložený odkaz
     na dražbu, která mezitím skončila, končil na chybové stránce.
     U webu, jehož hlavní aktivum je 2 109 zaindexovaných adres, je to
     ztráta, kterou nikdo neuvidí a každý na ni narazí.

     Stránka proto nezmizí, jen se přepíše na UKONČENOU: zůstane titulek,
     adresa i to, co o pozemku víme, přibude pruh s datem a odkazy na
     podobné pozemky v témže okrese.

     NEINDEXUJE SE. Dražba, která skončila, nemá hledajícímu co nabídnout
     a vyhledávač ji vyhodnotí jako zastaralý obsah. Dostane proto
     noindex a vypadne ze sitemap.xml — ale ZŮSTANE DOSTUPNÁ, takže kdo
     přijde s uloženým odkazem, dostane užitečnou stránku místo 404.
     „follow" zůstává, aby odkazy na živé pozemky dál měly váhu.

     A po DNI_ARCHIV dnech se teprve smaže doopravdy, aby web nerostl
     donekonečna. Datum si stránka nese v sobě, takže na to není potřeba
     žádná další evidence. */
  const DNI_ARCHIV = 90;
  const zive = new Set(hotove);
  const dnes = new Date().toISOString().slice(0, 10);
  /* Podobné pozemky se berou z toho, co právě teď žije, podle okresu
     v názvu souboru — ten ho nese jako první úsek za „pozemek-". */
  const podleOkresu = new Map();
  for (const { d, soubor } of mapa.values()) {
    const o = slug(d.okres);
    if (!podleOkresu.has(o)) podleOkresu.set(o, []);
    podleOkresu.get(o).push({ soubor, d });
  }
  let smazano = 0, ukonceno = 0, prepsano = 0;
  for (const f of fs.readdirSync(ROOT)) {
    if (!/^pozemek-.+-[0-9a-z]{5,8}\.html$/.test(f) || zive.has(f)) continue;
    /* Na název se nespoléhat. Ručně psané stránky se jmenují podobně
       (pozemek-od-obce.html) a sáhnout na cizí soubor kvůli shodě vzorku
       je chyba, která se pozná až tím, že ze stránky zbude 404. Mění se
       jen to, co tenhle generátor sám vyrobil — pozná se podle značky. */
    const cesta = path.join(ROOT, f);
    let obsah = '';
    try { obsah = fs.readFileSync(cesta, 'utf8'); } catch (e) { continue; }
    if (obsah.indexOf('window.PK_POZEMEK=') < 0) continue;

    const uz = /window\.PK_UKONCENO="(\d{4}-\d{2}-\d{2})"/.exec(obsah);
    if (uz) {
      const stari = (Date.parse(dnes) - Date.parse(uz[1])) / 86400000;
      if (stari >= DNI_ARCHIV) { fs.unlinkSync(cesta); smazano++; continue; }
      /* Už ukončená a ještě ne stará: obsah se nepřepisuje. Jen přepisy,
         které se musí dostat na KAŽDOU stránku webu, projdou i tudy.
         migrujUkoncenaData patří mezi ně: stránky, které skončily DŘÍV,
         než se to pravidlo zavedlo, sem chodí jedinou cestou — kdyby se
         opravilo jen v ukoncenaStranka(), zůstalo by sedm stránek, které
         strojově tvrdí InStock, navždy. Datum se bere to zapsané, ne
         dnešek: cena přestala platit tehdy. */
      const migrovano = migrujUkoncenaData(
        migrujPredvykresleni(sablona, migrujSkripty(sablona, migrujRezDat(migrujLeaflet(obsah)))), uz[1]);
      if (migrovano !== obsah) { fs.writeFileSync(cesta, migrovano); prepsano++; }
      continue;
    }

    const okres = (f.match(/^pozemek-([a-z0-9-]+?)-[a-z0-9-]+-[0-9a-z]{5,8}\.html$/) || [])[1] || '';
    const podobne = (podleOkresu.get(okres) || []).slice(0, 3);
    /* PŘEPISY, KTERÉ PATŘÍ NA KAŽDOU STRÁNKU, MUSÍ PROJÍT I TUDY.
       Větev výš (už ukončená stránka) pouští migrujSkripty
       i migrujPredvykresleni, tahle je nepouštěla — a tím se strom
       po každém ukončení nabídky na jeden běh rozešel s tím, co
       generátory spočítají. Naměřeno 10. 10.: robot ukončil dvě
       nabídky (Domousnice, Žalany), poslal je s blokem skriptů
       v jiném pořadí a `scripts/test-oprav.mjs` to ohlásil až při
       příštím lidském commitu — úloha s daty zkoušky nepouští.
       Žádný skript nechyběl, jen byly přeskládané; na druhý běh si to
       větev výš srovnala sama. Je to tedy tiché, opakované rozcházení,
       ne rozbitá stránka. */
    fs.writeFileSync(cesta, ukoncenaStranka(
      migrujPredvykresleni(sablona, migrujSkripty(sablona, obsah)), dnes, podobne));
    ukonceno++;
  }
  return { hotove, smazano, ukonceno, prepsano };
}

/* Mapa webu. Sitemap staví generátor regionálních stránek a přepisuje ji
   celou, takže se sem jen dopíše — tenhle krok běží po něm. Staré záznamy
   se přesto odstraňují: kdyby někdo pustil jen tenhle generátor dvakrát,
   nesmí se odkazy zdvojit. */
export function doMapyWebu(soubory) {
  const cesta = path.join(ROOT, 'sitemap.xml');
  if (!fs.existsSync(cesta)) return 0;
  let sm = fs.readFileSync(cesta, 'utf8');
  /* JEN STRÁNKY POZEMKŮ, ne všechno, co začíná na „pozemek-".
     Vzor „pozemek-cokoli" bral i rádce pozemek-od-obce.html („Jak koupit
     pozemek od obce"), který do mapy webu zapsal generátor krajů o krok
     dřív — a tenhle krok ho zase vyhodil. Stránka je přitom odkazovaná
     z pěti dalších a ve vyhledávači o ní nikdo neví. Vzor je teď týž,
     podle kterého se výš poznávají soubory ke smazání: jméno stránky
     pozemku končí otiskem klíče. */
  sm = sm.replace(/  <url>\s*<loc>https:\/\/www\.parcelaka\.cz\/pozemek-[^<]*-[0-9a-z]{5,8}\.html<\/loc>[\s\S]*?<\/url>\n/g, '');
  const bloky = soubory.map((f) =>
    `  <url>\n    <loc>${WEB}/${f}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.5</priority>\n  </url>\n`).join('');
  sm = sm.replace('</urlset>', bloky + '</urlset>');
  fs.writeFileSync(cesta, sm);
  return soubory.length;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { hotove, smazano, prepsano } = generuj();
  const vMape = doMapyWebu(hotove);
  console.log(`Stránek pozemků: ${hotove.length}${smazano ? `, smazáno zrušených: ${smazano}` : ''}`
    + `, v mapě webu: ${vMape}`
    + (prepsano ? `, přepsáno ukončených: ${prepsano}` : ''));
}
