/* Klíč pozemku — jeden výpočet pro celý web.
 *
 * PROČ ZVLÁŠŤ. Tentýž řetězec se počítal na třech místech: js/main.js
 * (pkey), js/pozemek.js (pkeyPlny) a scripts/generate-parcel-pages.mjs
 * (pkey). Tři kopie téhož výpočtu se dřív nebo později rozejdou — na
 * tomhle webu se to u cen a u rádce už stalo a stojí to v komentářích
 * na obou místech. Čtvrtá kopie měla přibýt se stránkou porovnání;
 * místo toho jsou teď v prohlížeči kopie nula.
 *
 * Generátor v Node si svou kopii nechává (modul pro prohlížeč by si
 * nenaimportoval) — že se obě shodují, hlídá scripts/test-stranky-pozemku.mjs:
 * kdyby se rozešly, vedly by odkazy na neexistující soubory.
 *
 * CO TEN KLÍČ JE. Místo, parcela, okres a souřadnice na tři desetinná
 * místa. Souřadnice tam musí být: parcelní číslo zná jen menšina záznamů
 * (u zbytku je „—"), takže bez nich sedl jeden klíč na víc pozemků naráz
 * — pod „Brno|—|Brno-město" jich bylo patnáct a uložení jednoho označilo
 * všechny sourozence. Tři desetinná místa jsou zhruba sto metrů, což
 * snese i drobné zpřesnění geokódování mezi běhy robota.
 */
(function (root) {
  'use strict';
  function pkey(d) {
    if (!d) return '';
    /* Spočítá se jednou za záznam a schová se k němu. Naměřeno na úvodní
       stránce: 63 258 volání při jediném načtení (31 na jednu nabídku),
       z toho 257 ms procesoru — nejdražší funkce stránky. Záznam je
       neměnný, takže druhé volání už jen čte. Vlastnost je neviditelná
       pro Object.keys i JSON.stringify, aby se nepřimíchala do dat. */
    if (d.__pk) return d.__pk;
    var la = (typeof d.lat === 'number') ? d.lat.toFixed(3) : '';
    var ln = (typeof d.lng === 'number') ? d.lng.toFixed(3) : '';
    var k = [d.place || '', d.parcel || '', d.okres || '', la, ln].join('|');
    if (typeof d === 'object') {
      try { Object.defineProperty(d, '__pk', { value: k, enumerable: false, configurable: true }); }
      catch (e) {}
    }
    return k;
  }
  /* Starý tvar klíče — jen pro odkazy rozeslané dřív, ať neskončí naprázdno. */
  function pkeyLegacy(d) {
    return [(d && d.place) || '', (d && d.parcel) || '', (d && d.okres) || ''].join('|');
  }

  /* ===== KLÍČ PRO ARCHIV ==============================================
     pkey je ZÁMĚRNĚ hrubý: souřadnice na tři desetinná místa (asi sto
     metrů), parcelní číslo u většiny záznamů chybí. Pro uložené pozemky,
     poznámky a skryté je to tak správně — klíč musí přežít drobné
     zpřesnění geokódování mezi běhy robota, jinak si člověk přijde
     o uložený pozemek.

     Jenže v archivu ta hrubost LŽE. Naměřeno na 2 004 nabídkách:
     38 klíčů sedí na 94 nabídek a u 25 z nich se liší cena. V Lázních
     Bohdanči jsou pod jedním klíčem dva různé pozemky (824 m² za 23 100
     a 1 391 m² za 39 000 Kč, dvě různé adresy na bezrealitky.cz).
     Archiv z nich dělal jednu nabídku, a jak se v souboru střídalo
     pořadí, zapisoval si „zlevnila o 41 %" a zpátky. Osm z 138 změn
     ceny v archivu takhle vzniklo — nikdy se nestaly.

     ROZLIŠUJE SE PODLE ADRESY INZERÁTU. Měřeno na 25 dnech historie je
     to stabilnější údaj než pkey: z 1 707 adres přežilo 24 dní 1 360,
     kdežto z 1 885 klíčů jen 1 185. A v dnešním souboru je každá adresa
     jedinečná (1 785 z 1 785). Kde adresa chybí (219 nabídek), rozliší
     se výměra — ta je u jednoho pozemku stálá, kdežto cena se mění
     a do klíče patřit nesmí.

     Z ADRESY SE BERE ČÍSLO INZERÁTU, NE CELÁ ADRESA. Portály si mění
     „slug" za číslem: týž inzerát 1008268 byl 15. 9. na adrese
     …/1008268-nabidka-prodej-pozemku a 16. 9. na
     …/1008268-nabidka-prodej-pozemku-horni-nemci. Podle celé adresy to
     vypadá jako zmizení a nová nabídka. Měřeno na všech 25 dnech
     historie: podle celé adresy se 969× „zmizelo", podle čísla inzerátu
     909× — a identita vydržela 45 730 přechodů mezi dny místo 45 670.
     (Podle pkey to bylo jen 45 144: hrubý klíč nepřežije zpřesnění
     geokódování.) Nejdelší skupina aspoň čtyř číslic v cestě je to
     číslo; kde žádná není, platí celá adresa.

     Adresa se nevpisuje celá, jen její otisk: klíč se v archivu opakuje
     na každém řádku a šedesát znaků navíc by soubor zbytečně nafouklo. */
  function otisk(s) {
    var h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }
  /* Totožnost inzerátu u zdroje. Vrací null, když adresa chybí. */
  function totoznostZdroje(url) {
    if (!url) return null;
    var s = String(url).replace(/^https?:\/\//i, '').replace(/^www\./i, '')
      .replace(/[?#].*$/, '').replace(/\/+$/, '').toLowerCase();
    if (!s) return null;
    var i = s.indexOf('/');
    var host = i < 0 ? s : s.slice(0, i);
    var cesta = i < 0 ? '' : s.slice(i);
    var cisla = cesta.match(/\d{4,}/g);
    if (cisla && cisla.length) {
      var nej = cisla[0];
      for (var j = 1; j < cisla.length; j++) if (cisla[j].length > nej.length) nej = cisla[j];
      return host + '/' + nej;
    }
    return s;
  }
  /* ===== KLÍČ PRO TO, CO SI ČLOVĚK ULOŽIL =============================
     Uložené pozemky, poznámky, skryté a „už otevřené" se dosud klíčovaly
     hrubým pkey. Prokázáno v prohlížeči: jeden uložený klíč v Jirnech
     označil PĚT různých pozemků (616, 715, 897, 492 a 514 m² za 6,6 až
     11,2 milionu). Člověk si uloží jeden a ve „Uložených" jich má pět,
     každý za jinou cenu. Dotčeno je 59 nabídek z 1 948 ve 26 skupinách.

     PŘIDÁVÁ SE VÝMĚRA, NE ČÍSLO INZERÁTU. U archivu rozlišuje číslo
     inzerátu, tady ne — uložený pozemek musí zůstat uložený i tehdy,
     když portál inzerát přepíše. Měřeno na 25 dnech historie, kolik
     přechodů mezi dny identita vydrží:
         pkey            45 144 vydrželo · 824 ztraceno
         pkey + výměra   45 722 vydrželo · 851 ztraceno
         číslo inzerátu  45 730 vydrželo · 909 ztraceno
     Výměra tedy drží skoro tolik jako číslo inzerátu a ztrácí méně.
     Kolizí z 26 zbydou 4 (osm nabídek): dvojice, které se liší JEN
     cenou — ty se rozlišit nedají, protože cena do klíče patřit nesmí
     (jinak by se po zlevnění uložený pozemek „odložil").

     STARÝ TVAR SE POŘÁD ČTE. Co si člověk uložil dřív, je v prohlížeči
     i na serveru zapsané pod pkey; kdyby se přestalo číst, přišel by
     o to. Zapisuje se nový tvar, čte se oboje — viz kliceProCteni. */
  function klicPozemku(d) {
    if (!d) return '';
    var v = (typeof d.area === 'number' && isFinite(d.area)) ? Math.round(d.area) : 0;
    return pkey(d) + '#v' + v;
  }
  /* Klíče, pod kterými se pozemek může mít uložený: nový tvar a starý.
     Jedno místo, aby se všechny části webu ptaly stejně. */
  function kliceProCteni(d) {
    if (!d) return [];
    return [klicPozemku(d), pkey(d)];
  }
  /* Je pozemek v tom seznamu klíčů? Snese pole i objekt (poznámky). */
  function jeMezi(sbirka, d) {
    if (!sbirka) return false;
    var kl = kliceProCteni(d);
    for (var i = 0; i < kl.length; i++) {
      if (!kl[i]) continue;
      if (Array.isArray(sbirka)) { if (sbirka.indexOf(kl[i]) !== -1) return true; }
      else if (Object.prototype.hasOwnProperty.call(sbirka, kl[i])) return true;
    }
    return false;
  }
  /* Pod kterým klíčem to v té sbírce doopravdy je (nový má přednost). */
  function klicVe(sbirka, d) {
    var kl = kliceProCteni(d);
    for (var i = 0; i < kl.length; i++) {
      if (!kl[i]) continue;
      if (Array.isArray(sbirka)) { if (sbirka.indexOf(kl[i]) !== -1) return kl[i]; }
      else if (sbirka && Object.prototype.hasOwnProperty.call(sbirka, kl[i])) return kl[i];
    }
    return null;
  }

  function klicArchivu(d) {
    if (!d) return '';
    var t = totoznostZdroje(typeof d.url === 'string' ? d.url.trim() : '');
    if (t) return pkey(d) + '#' + otisk(t);
    var v = (typeof d.area === 'number' && isFinite(d.area)) ? Math.round(d.area) : 0;
    return pkey(d) + '#v' + v;
  }
  root.PKKlic = { pkey: pkey, pkeyLegacy: pkeyLegacy, klicArchivu: klicArchivu,
    klicPozemku: klicPozemku, kliceProCteni: kliceProCteni, jeMezi: jeMezi, klicVe: klicVe,
    totoznostZdroje: totoznostZdroje, otisk: otisk };
}(typeof window !== 'undefined' ? window : this));
