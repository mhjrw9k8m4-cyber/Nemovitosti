/* Samostatná stránka inzerátu pozemku (pozemek.html).
   Načte data, najde pozemek podle ?p=<klíč>&ll=<lat>,<lng> a vykreslí detail.
   Pomocné funkce jsou záměrně zrcadlené z js/main.js, aby stránka fungovala
   nezávisle na mapové aplikaci. */
(function (global) {
  'use strict';

  /* Barva kategorie má JEDEN zdroj, a tím je CSS. Dřív byla opsaná tady,
     znovu v pozemek.js a potřetí v pravidlech stylu — a když se paleta
     měnila, mapa a karty si u téhož pozemku přestaly odpovídat. Tady se
     tedy jen přečte proměnná ze stylu; hodnota v kódu je záloha pro případ,
     že by styl ještě nebyl načtený. Hlídá to scripts/test-barvy.mjs. */
  function tokenBarva(nazev, zaloha) {
    try {
      var v = getComputedStyle(document.documentElement).getPropertyValue(nazev).trim();
      return v || zaloha;
    } catch (e) { return zaloha; }
  }
  var TYPE = {
    sale:    { label: 'Na prodej',    color: tokenBarva('--c-sale', '#4361B8'), link: { label: 'Nabídka SPÚ',          url: 'https://spu.gov.cz/nabidky' } },
    drazba:  { label: 'Dražba',       color: tokenBarva('--c-drazba', '#CC6B33'), link: { label: 'Dražební portál',     url: 'https://www.portaldrazeb.cz/' } },
    exekuce: { label: 'Exekuce',      color: tokenBarva('--c-exekuce', '#8C2F1E'), link: { label: 'Ověřit v katastru', url: 'https://www.ikatastr.cz/' } },
    obec:    { label: 'Obecní záměr', color: tokenBarva('--c-obec', '#12AEBE'), link: { label: 'Úřední deska obce',    url: 'https://www.uredni-deska.cz/' } },
    majitel: { label: 'Přímo od majitele',  color: tokenBarva('--c-majitel', '#8B4FE0'), link: { label: 'Ověřit v katastru',    url: 'https://www.ikatastr.cz/' } }
  };

  function fmt(n) { return (n == null ? '' : n.toString()).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0'); }
  function hasArea(d) { return typeof d.area === 'number' && d.area > 0; }
  function areaTxt(d) { return hasArea(d) ? fmt(d.area) + '\u00a0m²' : 'neuvedena'; }
  function hasParcel(d) { return d.parcel && d.parcel !== '—' && d.parcel !== ''; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  /* Rozřazení druhů je v js/ceny.js — visí na něm cenový model, takže
     tady (ani v mapě) nesmí být vlastní kopie. Byly tři a stačilo by
     doplnit druh do jedné z nich; web by pak na stránce pozemku psal
     jiný druh, než podle kterého se počítá obvyklá cena. */
  function druhGroup(s) {
    return (window.PK_CENY && window.PK_CENY.druhGroup) ? window.PK_CENY.druhGroup(s) : 'Jiný pozemek';
  }

  /* Termíny dražeb — společné s mapou, viz js/terminy.js. Dřív tu byla
     doslovná kopie z js/main.js; dvě kopie téhož výpočtu se v tomhle
     projektu už jednou rozešly a je to chyba, kterou nikdo nevidí. */
  var T = window.PK_TERMINY;
  function daysUntil(extra) { return T.daysUntil(extra); }
  function countdownText(days) { return T.countdownText(days); }
  function countdownClass(days) { return T.countdownClass(days); }
  function zdrojText(extra) { return T.zdrojText(extra); }
  /* Text jen pro odečítač obrazovky: odkaz vede pryč z webu a otevře se
     v novém okně. Vidící to pozná podle šikmé šipky (viz CSS). */
  var VEN = '<span class="visually-hidden"> — otevře se v novém okně mimo Parcelku</span>';

  /* Krátký klíč (obec, parcela, okres) tady BÝVAL a nezůstal schválně.
     Nerozlišoval pozemky (ve 310 případech padlo víc pozemků na jeden)
     a přitom se jmenoval pkey stejně jako ten úplný v js/main.js, takže
     se jím omylem hledal pozemek podle adresy i ukládaly oblíbené.
     Identita pozemku je pkeyPlny() o pár řádků níž — jedna, a tatáž
     jako na mapě. */
  /* Název vlastní stránky pozemku. Tentýž výpočet dělá generátor v Node —
     kdyby se rozešly, odkazovalo by se na neexistující soubor. */
  var PK_DIAKR = { 'á':'a','č':'c','ď':'d','é':'e','ě':'e','í':'i','ň':'n','ó':'o','ř':'r','š':'s','ť':'t','ú':'u','ů':'u','ý':'y','ž':'z' };
  function pkSlug(s) {
    return String(s || '').toLowerCase().replace(/[áčďéěíňóřšťúůýž]/g, function (c) { return PK_DIAKR[c] || c; })
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  }
  function pkOtisk(s) {
    var h = 5381;
    for (var i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
    return h.toString(36);
  }
  /* Klíč pozemku počítá js/klic.js — jedno místo pro celý web. Byl tu
     opsaný podruhé a dvě kopie téhož výpočtu se rozejdou; tady by se to
     projevilo tím, že by stránka odkazovala na soubor, který neexistuje. */
  var pkeyPlny = window.PKKlic.pkey;
  function souborPozemku(d) {
    return 'pozemek-' + pkSlug(d.okres) + '-' + pkSlug(d.place) + '-' + pkOtisk(pkeyPlny(d)) + '.html';
  }
  /* ČTVRŤ U VELKÝCH MĚST. U velkých měst uvádí zdroj jen celou obec
     („Praha" = 496 km²), takže je ten řádek k ničemu. Robot k ní
     dopočítá čtvrť ze souřadnic (pole `cast`, viz
     scripts/fetch-opportunities.mjs). Do `place` se nesahá: je v klíči
     pozemku, a s ním v uložených oblíbených i ve sdílených adresách.
     Stejný výpočet má i mapa (js/main.js) — že se ty dva nerozejdou,
     hlídá scripts/test-ctvrt.mjs. */
  /* Titul se předává, nebere se z dokumentu: funkci vytahuje
     a pouští scripts/test-ctvrt.mjs mimo prohlížeč (porovnává ji
     s touž funkcí v js/main.js) a sáhnutí po #pz-titul-data by ji tam
     shodilo. Bez titulu se chová jako dřív — a tak se chová i kopie
     na mapě, kde žádný nadpis s okresem není. */
  function mistoRadek(d, titul) {
    /* OKRES JEN JEDNOU. Nadpis stránky nese u 1 433 z 1 944 nabídek
       i okres — rozlišení shodných titulků ho tam přidá, aby se dvě
       stejně velké parcely v „Chlumu" daly rozeznat. Řádek pod ním ho
       pak psal podruhé: „… — Luhačovice, okres Zlín" a hned pod tím
       „okres Zlín". Čtvrť (d.cast) tam ale pořád patří, ta v nadpisu
       není. */
    var vNadpisu = !!d.okres && String(titul || '').indexOf(', okres ' + d.okres) >= 0;
    var okr = (d.okres && !vNadpisu) ? 'okres ' + esc(d.okres) : '';
    if (d.cast) return esc(d.cast) + (okr ? ' · ' + okr : '');
    /* Když je „místo" totéž co okres (zdroj nic bližšího neuvedl),
       stálo na kartě „Brno-venkov" a hned pod tím „okres Brno-venkov".
       Dvakrát totéž, a to druhé navíc tvrdí, že jde o obec. Radši nic:
       název je vidět v nadpisu o řádek výš. Když ale čtvrť známe,
       řádek smysl má — proto se tahle výjimka řeší až za ní. */
    if (d.place && d.okres && String(d.place).trim() === String(d.okres).trim()) return '';
    return okr;
  }
  /* JAK DALEKO DO MĚSTA. Nepočítá se tady: hotovou větu vepsal do
     stránky generátor (js/okruh.js → #pz-okoli-data), takže ji stránka
     ukazuje i bez JavaScriptu a oba výpisy nemůžou říct nic jiného. */
  /* DALŠÍ POZEMKY V TÉŽE OBCI. Věta i adresa přicházejí hotové ze
     generátoru (ostrůvek #pz-obec-data), stejně jako vzdálenosti: číslo
     v té větě je slib a smí ho skládat jen jedno místo. Přes ostrůvek
     jde čistý text, značky se stavějí tady a přes esc(). */
  function vObciHtml() {
    var el = document.getElementById('pz-obec-data');
    if (!el) return '';
    var o = null;
    try { o = JSON.parse(el.textContent || 'null'); } catch (e) { return ''; }
    if (!o || typeof o.text !== 'string' || typeof o.url !== 'string') return '';
    return '<a href="' + esc(o.url) + '">' + esc(o.text) + '</a>';
  }
  /* VÍC POZEMKŮ NA JEDNOM MÍSTĚ. Věta i čísla přicházejí hotové ze
     generátoru (ostrůvek #pz-blok-data) — stejně jako u obce a dálek:
     číslo v té větě je slib a smí ho skládat jen jedno místo
     (scripts/bloky.mjs → scripts/generate-parcel-pages.mjs). Přes
     ostrůvek jde čistý text, značky se stavějí tady a přes esc(). */
  function blokHtml() {
    var el = document.getElementById('pz-blok-data');
    if (!el) return '';
    var o = null;
    try { o = JSON.parse(el.textContent || 'null'); } catch (e) { return ''; }
    if (!o || typeof o.text !== 'string' || !(o.pocet > 2)) return '';
    return '<div class="pz-blok">'
      + '<b>Nekupujete jen tuhle parcelu.</b> '
      + esc(o.text)
      + ' <span class="pz-blok-pozn">Jsou to vzdušné čáry mezi nabídkami, ne hranice parcel — '
      + 'a každou může prodávat někdo jiný. Na mapě je uvidíte pohromadě.</span>'
      + '</div>';
  }
  function dalkyText() {
    var el = document.getElementById('pz-okoli-data');
    if (!el) return '';
    try { var t = JSON.parse(el.textContent || '""'); return typeof t === 'string' ? t : ''; }
    catch (e) { return ''; }
  }
  function katastrUrl(d) { return 'https://ikatastr.cz/#zoom=18&lat=' + d.lat + '&lon=' + d.lng + '&info=' + d.lat + ',' + d.lng; }
  function mapyUrl(d) { return 'https://mapy.cz/zakladni?x=' + d.lng + '&y=' + d.lat + '&z=18&source=coor&id=' + d.lng + ',' + d.lat; }
  var SPU_OFFERS = 'https://spu.gov.cz/nabidky/prehled-cela-cr';
  function isSPU(d) { return d.type === 'sale' && !d.url && /SPÚ|státní půd/i.test(d.extra || ''); }
  function isDeepLink(url) {
    try { var u = new URL(url); return (u.pathname && u.pathname.replace(/\/+$/, '').length > 1) || !!u.search; }
    catch (e) { return false; }
  }
  function sourceLink(d) {
    if (d.url) {
      if (isDeepLink(d.url)) return { url: d.url, label: d.type === 'sale' ? 'Inzerát' : 'K dražbě' };
      return { url: d.url, label: d.type === 'sale' ? 'Web prodejce' : 'Dražební portál' };
    }
    if (isSPU(d)) return { url: SPU_OFFERS, label: 'Nabídka SPÚ' };
    /* Exekuce bez odkazu na zdroj mířila do insolvenčního rejstříku. To je
       ale jiné řízení: insolvence je úpadek dlužníka, exekuce vymáhání
       jednotlivého dluhu — v ISIR se exekuce na pozemku nedohledá. Vlastní
       rádce (exekuce-pozemku.html) přitom říká správně, že exekuční poznámku
       a zástavní právo ukáže list vlastnictví a katastr je „vždy zdroj
       pravdy". Posíláme tedy na katastr, přímo na tu parcelu. */
    if (d.type === 'exekuce' && typeof d.lat === 'number' && typeof d.lng === 'number') {
      return { url: katastrUrl(d), label: 'Ověřit v katastru' };
    }
    return { url: TYPE[d.type].link.url, label: TYPE[d.type].link.label };
  }

  /* Rádce „Co byste měli vědět" je společný s druhou půlkou webu —
   * js/radce.js. Mapa i stránka pozemku ho tu měly každá po svém, takže
   * stačilo změnit jednu z nich a u téhož pozemku by si protiřečily.
   * Přesně to se stalo u cenového srovnání; podruhé to dělat nebudu. */
  function goodToKnowHtml(d) {
    if (!window.PK_RADCE) return '';
    return window.PK_RADCE.html(d, MODEL);
  }

  // Cenový model je společný s mapou (js/ceny.js) — dřív tu byla vlastní
  // kopie výpočtu a rozešla se: stránka pozemku hlásila „Výhodná cena"
  // i u nabídek, které mapa už odmítala jako nevěrohodné.
  var MODEL = null;
  function buildIndex(DATA) {
    MODEL = (window.PK_CENY && window.PK_CENY.postav) ? window.PK_CENY.postav(DATA) : null;
  }
  // (Tmavá varianta verdiktu tu bývala jako priceBarHtml — na téhle stránce
  //  se nikdy nevykreslovala, používá se světlá pzVerdictHtml níž. Smazáno.)

  // Odhad obvyklé ceny v okolí. Ukazuje se jen tam, kde má co říct — tedy
  // když je cena aspoň o 15 % pod obvyklou hladinou. Kdyby se vypisoval
  // vždycky, byla by to u poloviny nabídek jen další řádka s číslem.
  function odhadHtml(d) {
    // Tentýž blok jako v okně na mapě (js/ceny.js) — jen s delším koncem,
    // na stránce pozemku je na vysvětlení místo.
    return window.PK_CENY.blokOdhadu(MODEL, d, { fmt: fmt, esc: esc, trida: ' pz-odhad', dlouhy: true });
  }


  // Přibližný tvar parcely (pro záložní plán, když se nenačte satelit)
  /* polyFor a planSvg (vymyšlený obrys parcely a záložní „plán") jsou
     pryč — nic je nevolalo a kreslit čáru, kterou si lze splést s hranicí
     pozemku, tenhle web nechce; viz js/snimek.js a js/main.js. */
  /* Velký snímek nahoře. Skládání dlaždic a obrys rozsahu dělá js/snimek.js —
     tentýž kód používá i náhled na kartě, aby se ty dva obrázky nerozešly. */
  function heroLayers(d) {
    var col = TYPE[d.type].color;
    // Majitel nahrál skutečné fotky pozemku → listovací galerie (swipe na mobilu).
    if (d.photos && d.photos.length) {
      var shots = d.photos.map(function (p, i) {
        /* esc() i na adresu: do atributu se dosud vypisovala tak, jak
           přišla. Dokud fotky chodily jen ze statických dat, kde žádné
           nejsou, nebylo to kde vyzkoušet — jenže handoff z mapy je teď
           nese, a uvozovka v adrese by z atributu utekla. Tvar adresy
           navíc hlídá PKCisteni (jen https adresa našeho úložiště);
           tohle je druhá pojistka, ne první. */
        return '<img class="pz-shot" src="' + esc(p) + '" alt="Fotka pozemku ' + (i + 1) + '" loading="' + (i === 0 ? 'eager' : 'lazy') + '" decoding="async">';
      }).join('');
      var cnt = d.photos.length > 1 ? '<span class="opp-count">' + GALLERY_SVG + d.photos.length + '</span>' : '';
      return '<div class="pz-gallery">' + shots + '</div>' +
        '<span class="opp-mgrad"></span>' +
        '<span class="opp-badge ' + d.type + '">' + esc(TYPE[d.type].label) + '</span>' + cnt;
    }
    var S = global.PK_SNIMEK;
    return S.html(d, { sirka: 384, vyska: 256, barva: col, id: 'hero' }) +
      '<span class="opp-mgrad"></span>' +
      '<span class="opp-badge ' + d.type + '">' + esc(TYPE[d.type].label) + '</span>' +
      S.popis(d);
  }

  // Oblíbené (sdílené s hlavní aplikací přes stejný localStorage klíč)
  var FAV_KEY = 'pk_fav_v1';
  function favs() { try { return JSON.parse(localStorage.getItem(FAV_KEY)) || []; } catch (e) { return []; } }
  /* ULOŽENÉ POZEMKY: klíč musí být tentýž jako na mapě (js/main.js),
     protože obojí zapisuje do TÉHOŽ úložiště (pk_fav_v1). Tady se dlouho
     bral krátký pkey (obec, parcela, okres) — ten ale nestačí ani na
     rozlišení pozemků: v datech má 1 957 pozemků jen 1 265 různých
     krátkých klíčů a ve 310 případech padne víc pozemků na jeden.
     „Úštěk|—|Litoměřice" jsou čtyři různé pozemky za 13 500, 140 000,
     385 000 a 269 000 Kč — uložením jednoho se označily všechny čtyři.
     A protože mapa ukládá klíč se souřadnicemi, pozemek uložený na mapě
     se tady netvářil jako uložený a šel do seznamu podruhé.
     pkeyPlny() přidává souřadnice a je to týž výpočet jako v main.js;
     kolizí je 21 místo 310. Že se ty dvě poloviny nerozejdou, hlídá
     scripts/test-mapa-pozemku.mjs. */
  /* A POŘÁD TO NEBYLO DOST. S pkeyPlny zbylo 26 klíčů, pod kterými leží
     59 různých nabídek — v Jirnech pět stavebních parcel za 6,6 až 11,2
     milionu. Uložení jedné označilo všech pět. Klíč je proto
     PKKlic.klicPozemku (pkey + výměra), 26 kolizí → 4; co se liší jen
     cenou, rozlišit nejde, protože cena v klíči být nesmí. Starý tvar se
     dál čte, aby o dřív uložené pozemky nikdo nepřišel. */
  function isFav(d) { return window.PKKlic.jeMezi(favs(), d); }
  function toggleFav(d) {
    var arr = favs(), stary = window.PKKlic.klicVe(arr, d);
    if (stary !== null) arr.splice(arr.indexOf(stary), 1);
    else arr.push(window.PKKlic.klicPozemku(d));
    try { localStorage.setItem(FAV_KEY, JSON.stringify(arr)); } catch (e) {}
    return stary === null;
  }

  function toast(msg) {
    var t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg; t.hidden = false; t.classList.add('show');
    setTimeout(function () { t.classList.remove('show'); t.hidden = true; }, 2200);
  }

  var GALLERY_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>';
  var PIN_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>';
  var MAP_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 3 3 6v15l6-3 6 3 6-3V3l-6 3-6-3z"/><path d="M9 3v15M15 6v15"/></svg>';
  /* DETAIL DRAŽBY BYL CHUDŠÍ NEŽ DETAIL PRODEJE. Zbyl z něj jednořádkový
     odpočet „Termín za 16 dní" a nic víc. Kdo zvažuje dražbu, potřebuje
     vědět čtyři věci: kdy to je, za kolik se začíná, kolik se skládá
     dopředu a kde jsou závazné podmínky.
     Tři z nich umíme říct přesně — datum máme u všech 104 dražeb
     i exekucí a vyvolávací cenu taky. Dražební jistotu v datech NEMÁME
     ani u jedné, tak se to řekne rovnou a pošle se pro ni tam, kde
     opravdu je. Odhadovat ji by bylo horší než ji neuvést: podle ní se
     posílají peníze. */
  var MESICE = ['ledna', 'února', 'března', 'dubna', 'května', 'června',
    'července', 'srpna', 'září', 'října', 'listopadu', 'prosince'];
  function datumText(extra) {
    var m = /(\d{4})-(\d{2})-(\d{2})/.exec(extra || '');
    if (!m) return '';
    return (+m[3]) + '. ' + MESICE[(+m[2]) - 1] + ' ' + m[1];
  }
  function pzZmenaCenyHtml(d) {
    var Z = window.PKZlevneni;
    var z = Z ? Z.zmena(d) : null;
    if (!z) return '';
    return '<div class="pz-zmena' + (z.podezrela ? ' overit' : (z.dolu ? ' dolu' : ' nahoru')) + '">'
      + esc(Z.text(z)) + ' <span>' + esc(Z.popis(z, fmt)) + '</span></div>';
  }

  /* HISTORIE CENY. Dvojice [den, cena] vepsané do stránky při sestavení
     (window.PK_POZEMEK.h, staví scripts/cenova-historie.mjs z archivu).
     Je to jediná věc na webu, kterou se o pozemku nedočtete nikde jinde:
     že prodávající už jednou ustoupil, o kolik a kdy.
     KROKY SKLÁDÁ js/zlevneni.js, tentýž modul jako kartu na mapě —
     včetně obou mezí: pod 3 % se mlčí (zaokrouhlení u zdroje) a nad
     50 % se neříká „zlevněno", protože takový skok u pozemku bývá
     chyba zdroje. Kdyby se pravidlo napsalo podruhé tady, karta
     a historie by o téže ceně tvrdily dvě různé věci. */
  function pzHistorieHtml() {
    var P = window.PK_POZEMEK, Z = window.PKZlevneni;
    var h = P && P.h;
    if (!h || !Z || h.length < 2) return '';
    var radky = [], zmen = 0;
    for (var i = 0; i < h.length; i++) {
      var den = h[i][0], c = +h[i][1];
      var k = i > 0 ? Z.krok(+h[i - 1][1], c, den) : null;
      if (k) zmen++;
      radky.push('<li class="pz-hist-radek' + (i === h.length - 1 ? ' ted' : '') + '">'
        + '<span class="pz-hist-den">' + esc(Z.lidsky(den)) + '</span>'
        + '<b class="pz-hist-cena">' + fmt(c) + ' Kč</b>'
        + (k ? '<span class="pz-hist-zmena ' + (k.podezrela ? 'overit' : (k.dolu ? 'dolu' : 'nahoru'))
          + '">' + (k.podezrela ? '' : (k.dolu ? '−' : '+')) + k.procent + ' %</span>' : '')
        + '</li>');
    }
    /* Když všechny kroky spadly pod mez (samé zaokrouhlení), není co
       ukazovat — jen by to vypadalo, že se cena měnila, a neměnila. */
    if (!zmen) return '';
    return '<div class="pz-historie">'
      + '<h3 class="pz-hist-nadpis">Historie ceny</h3>'
      + '<ul class="pz-hist">' + radky.join('') + '</ul>'
      + '<p class="pz-hist-pozn">Ceny si zapisujeme sami při každém průchodu zdrojů'
      + ' — jiný web tuhle historii nemá. První řádek je nejstarší cena, kterou o pozemku víme;'
      + ' starší mohla být a my ji nevidíme.</p>'
      + '</div>';
  }

  function pzDrazbaHtml(d, days) {
    if (d.type !== 'drazba' && d.type !== 'exekuce') return '';
    var kdy = datumText(d.extra);
    if (days == null && !kdy) return '';
    var prosle = days != null && days < 0;
    var blizko = days != null && days >= 0 && days <= 7;
    var slovo = d.type === 'exekuce' ? 'Nucená dražba' : 'Dražba';
    /* Čeština: „za 2 dny", ale „za 5 dní". Strojové „za 2 dní" si web
       hlídá testem čestiny jinde, tak ať se to nerozjede zrovna tady. */
    var hlava = prosle ? slovo + ' už proběhla'
      : (days === 0 ? slovo + ' je dnes'
        : (days === 1 ? slovo + ' je zítra'
          : slovo + ' za ' + days + ' ' + (days < 5 ? 'dny' : 'dní')));
    var cenaSlovo = d.type === 'drazba' ? 'Vyvolávací cena' : 'Odhadní cena';
    var deep = d.url && isDeepLink(d.url);
    return '<div class="pz-drazba' + (prosle ? ' prosle' : (blizko ? ' blizko' : '')) + '">' +
      '<div class="pzd-hlava">' + CLOCK_SVG + '<b>' + hlava + '</b>' +
        (kdy ? '<span class="pzd-kdy">' + kdy + '</span>' : '') + '</div>' +
      (prosle
        ? '<p class="pzd-pozn">Záznam tu zůstává kvůli historii. U dražebníka si ověřte, jestli se vydražilo, nebo bude další kolo.</p>'
        : '<p class="pzd-pozn">' +
            (d.price > 0 ? '<b>' + cenaSlovo + ' ' + fmt(d.price) + ' Kč.</b> ' : '') +
            '<b>Dražební jistotu</b> a závazné podmínky uvádí <b>dražební vyhláška</b> — tu v datech nemáme, ' +
            'přečtěte si ji u dražebníka. Jistota musí být připsaná <b>před zahájením</b>, ne v den dražby.</p>') +
      (deep ? '<a class="pzd-odkaz" href="' + esc(d.url) + '" target="_blank" rel="noopener">Podmínky u dražebníka' + VEN + '</a>' : '') +
      '</div>';
  }

  var CLOCK_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>';
  var HEART_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z"/></svg>';
  var SHARE_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5 15.4 17.5M15.4 6.5 8.6 10.5"/></svg>';

  // Cenový verdikt (světlá verze). Počítá ho společný model js/ceny.js —
  // tenhle soubor měl dřív vlastní kopii výpočtu a ta se s mapou rozešla.
  /* Popis od inzerenta z ostrůvku v HTML stránky.
     JMÉNO MUSÍ BÝT JINÉ NEŽ pzPopisHtml. Napoprvé jsem tuhle funkci
     pojmenoval stejně — a protože deklarace funkcí se v JavaScriptu
     přepisují tiše, zůstala jen jedna a stránka spadla na
     „Cannot read properties of undefined (reading 'description')".
     Jsou to dvě různé věci: majitel píše o svém pozemku ve formuláři,
     inzerent v cizím inzerátu, ze kterého si text bere robot. Text se do stránky
     vepsal při generování (scripts/generate-parcel-pages.mjs); čte se
     přes JSON.parse z <script type="application/json">, takže uvozovky
     ani lomená závorka v textu nemohou rozbít stránku. */
  function pzPopisInzerentaHtml() {
    var el = document.getElementById('pz-popis-data');
    if (!el) return '';
    var t = '';
    try { t = String(JSON.parse(el.textContent) || ''); } catch (e) { return ''; }
    t = t.trim();
    if (t.length < 60) return '';
    return '<h2 class="pz-sect-h">Co o pozemku píše inzerent</h2>'
      + '<p class="pz-popis-inzerent">' + esc(t) + '</p>';
  }

  /* SROVNATELNÉ POZEMKY — důkaz pod verdikt.
     Verdikt o kus výš říká „dražší než 98 % pozemků téhož druhu
     v kraji". Je spočítaný správně, ale ověřit se nedá: kdo mu
     nevěří, musí odejít na mapu. Tohle pod něj postaví čtyři
     konkrétní nabídky, se kterými se ten pozemek porovnával, i s
     cenami a s odkazy — pořadí ve větě si tak může každý v seznamu
     přepočítat.
     Seznam přichází HOTOVÝ z generátoru (ostrůvek #pz-srovnani-data),
     stejně jako vzdálenosti a počet pozemků v obci: pravidla výběru
     i pořadí skládá jedno místo (scripts/srovnatelne.mjs), tady se
     jen vypisuje. Dvě místa, která počítají pořadí, by se jednou
     rozešla a stránka by si ve dvou větách odporovala.
     Názvy obcí chodí z cizích inzerátů, proto všechno přes esc(). */
  function pzSrovnaniHtml() {
    var el = document.getElementById('pz-srovnani-data');
    if (!el) return '';
    var s = null;
    try { s = JSON.parse(el.textContent || 'null'); } catch (e) { return ''; }
    if (!s || typeof s.v !== 'string' || !s.r || !s.r.length) return '';
    var radky = s.r.map(function (x) {
      var cena = '<b class="srv-c">' + fmt(x.m) + ' Kč/m²</b>';
      var kde = x.ja
        ? '<span class="srv-kde">tenhle pozemek</span>'
        : '<a class="srv-kde" href="' + esc(x.s) + '">' + esc(x.o) + '</a>';
      var detail = fmt(x.vym) + ' m²' + (x.km ? ' · ' + x.km + ' km' : '');
      return '<li class="srv-radek' + (x.ja ? ' srv-ja' : '') + '">'
        + kde + cena + '<span class="srv-detail">' + detail + '</span></li>';
    }).join('');
    return '<section class="srv">'
      + '<h2 class="pz-sect-h">'
      + (s.p ? 'Srovnatelné spoluvlastnické podíly' : 'Srovnatelné pozemky v okolí') + '</h2>'
      + '<p class="srv-veta">' + esc(s.v)
      + (s.p ? ' Ceny jsou za metr, který kupujícímu připadne — výměra je celá parcela.' : '')
      + '</p>'
      + '<ul class="srv-seznam">' + radky + '</ul>'
      + '<p class="srv-pozn">Týž druh pozemku, výměra v poměru do trojnásobku, '
      + 'vzdušnou čarou do 25 km. Když se tolik srovnatelných nenajde, '
      + 'tahle část stránky není.</p>'
      + '</section>';
  }

  /* KAM DÁL. Naměřeno na hotové stránce: z vykresleného detailu nevedl
     ani jeden odkaz na okres, kraj ani druh pozemku. Okresní odkaz ve
     stránce byl, ale jen ve statické části, kterou tenhle skript při
     načtení celou přepíše — takže ho viděl pouze vyhledávač.
     Seznam přichází HOTOVÝ z generátoru (ostrůvek #pz-kamdal-data):
     jen on ví, které regionální stránky dnes opravdu vznikly (okres má
     mez tří nabídek, kraj patnácti, druh i rozpočet čtyřiceti), takže se
     tady nemůže objevit odkaz do prázdna.
     Jména obcí ani krajů sem nechodí z cizích inzerátů, ale přes esc()
     jde všechno — ostrůvek je obyčejný text ve stránce. */
  /* NADPIS STRÁNKY. Chodí hotový z generátoru (ostrůvek
     #pz-titul-data): „Trvalý travní porost 4 889 m² — Bystřice".
     Tenhle skript tu dřív psal jen jméno obce — jenže detail přepisuje
     celý #pz-detail, takže se servírovaný a vykreslený nadpis
     rozcházely a ten vykreslený sdílelo 65 % stránek s jinou
     (osmnáct se jmenovalo „Slatina"). Skládat titul i tady by byla
     druhá kopie pravidla, které navíc umí rozlišit shodné titulky.
     Když ostrůvek není (pozemek.html otevřený z mapy, inzerát od
     majitele), zůstává jméno obce — lepší to odsud nejde. */
  function titulStranky() {
    var el = document.getElementById('pz-titul-data');
    if (!el) return '';
    try { var t = JSON.parse(el.textContent || '""'); return typeof t === 'string' ? t : ''; }
    catch (e) { return ''; }
  }

  function kamDalHtml() {
    var el = document.getElementById('pz-kamdal-data');
    if (!el) return '';
    var a = null;
    try { a = JSON.parse(el.textContent || 'null'); } catch (e) { return ''; }
    if (!a || !a.length) return '';
    var dlazdice = a.filter(function (x) { return x && x.t && x.u; }).map(function (x) {
      return '<a class="kd-polozka" href="' + esc(x.u) + '">'
        + '<span class="kd-t">' + esc(x.t) + '</span>'
        + (x.p ? '<span class="kd-p">' + esc(x.p) + '</span>' : '')
        + '</a>';
    }).join('');
    if (!dlazdice) return '';
    return '<nav class="pz-kamdal" aria-labelledby="pz-kamdal-h">'
      + '<h2 class="pz-sect-h" id="pz-kamdal-h">Kam dál</h2>'
      + '<div class="kd-mriz">' + dlazdice + '</div>'
      + '</nav>';
  }

  function pzVerdictHtml(d) {
    if (!MODEL || !hasArea(d) || !d.price) return '';
    /* Známý podíl dostane VLASTNÍ verdikt, ne mlčení. Bez něj by se
       stránka o ceně nezmínila vůbec a člověk by si nízkou cenu za metr
       přebral po svém — nejspíš jako výhodnou koupi. Přesně to web dřív
       říkal nahlas: „Levnější než 96 % podobných pozemků." */
    if (d.podil) {
      return '<div class="pz-verdict warn">' +
        '<div class="pv-top"><span class="pv-badge">Prodává se podíl</span><span class="pv-cmp">Cena za m²</span></div>' +
        '<div class="pv-text">Inzerát mluví o <b>spoluvlastnickém podílu' + (d.zlomek ? ' ' + esc(d.zlomek) : '') + '</b>. V ceně je pak jen ' +
        '<b>zlomek pozemku</b>, kdežto výměra je uvedená celá — cena za metr proto vychází nízká ' +
        'sama od sebe a s celými pozemky se srovnat nedá. <b>Velikost podílu</b> si ověřte ' +
        'v katastru a u zdroje.</div>' +
        '</div>' + odhadHtml(d);
    }
    if (MODEL.neduveryhodna(d)) {
      return '<div class="pz-verdict warn">' +
        '<div class="pv-top"><span class="pv-badge">Cena k ověření</span><span class="pv-cmp">Cena za m²</span></div>' +
        '<div class="pv-text">Cena za m² se <b>výrazně liší</b> od obvyklé u tohoto druhu pozemku. ' +
        'Často jde o <b>spoluvlastnický podíl</b>, nebo je na pozemku stavba — ověřte u zdroje ' +
        'a v katastru, co se přesně prodává.</div>' +
        '</div>' + odhadHtml(d);
    }
    var pc = MODEL.percentil(d);
    if (!pc) return odhadHtml(d);
    var pct = pc.pct;
    /* Jedno místo pro všechny tři výpisy — viz skupinaText v js/ceny.js. */
    var typeWord = (window.PK_CENY && window.PK_CENY.skupinaText)
      ? window.PK_CENY.skupinaText(d.type) : 'v prodeji';
    var cls, badge, text;
    /* KDE se to srovnávalo, musí být vidět. „Dražší než 78 % podobných
       pozemků" si každý přečte jako „než pozemky v okolí" — a dokud se
       počítalo celostátně, nebyla to pravda. Teď to místo stojí ve
       větě, takže se to dá ověřit i zpochybnit. */
    var kdeTxt = (window.PK_CENY && window.PK_CENY.kdeText && pc.uroven)
      ? ' ' + window.PK_CENY.kdeText(pc.uroven, pc.kde) : '';
    /* Z KOLIKA NABÍDEK TO VYŠLO, SE MUSÍ ŘÍCT.
       „Levnější než 82 % pozemků téhož druhu v okrese Tábor" zní jako
       statistika trhu. Model přitom stačí deset srovnatelných nabídek
       (pod to verdikt nedá vůbec) — a naměřeno na ostrých datech:
       verdikt o ceně dostane 1 159 z 1 950 nabídek a u 489 z nich,
       tedy u 42 %, stojí na vzorku menším než dvacet. Medián je 21.
       „Levnější než 82 %" z dvanácti nabídek je něco jiného než z dvou
       set a člověk, který se podle toho rozhoduje o kupní ceně, má
       nárok ten rozdíl vidět. Číslo model vrací (pc.sample) a stránka
       ho dosud zahazovala.
       Je to ve stejné větě, ne na novém řádku: KDE se srovnávalo tam
       stojí z téhož důvodu a dva řádky drobného písma pod verdiktem
       už nikdo nečte. */
    var zKolika = (pc.sample > 0) ? ' (' + pc.sample + ' ' + (pc.sample < 5 ? 'nabídky' : 'nabídek') + ')' : '';
    if (pct <= 35) { cls = 'good'; badge = 'Výhodná cena'; text = 'Levnější než <b>' + pc.cheaper + ' %</b> pozemků téhož druhu ' + typeWord + kdeTxt + zKolika + '.'; }
    else if (pct >= 65) { cls = 'bad'; badge = 'Vyšší cena'; text = 'Dražší než <b>' + pct + ' %</b> pozemků téhož druhu ' + typeWord + kdeTxt + zKolika + '.'; }
    else { cls = 'mid'; badge = 'Průměrná cena'; text = 'Cena za m² je zhruba <b>uprostřed</b> pozemků téhož druhu ' + typeWord + kdeTxt + zKolika + '.'; }
    return '<div class="pz-verdict ' + cls + '">' +
      '<div class="pv-top"><span class="pv-badge">' + badge + '</span><span class="pv-cmp">Cena za m²</span></div>' +
      '<div class="pv-text">' + text + '</div>' +
      /* STUPNICE, NE VYPÍNAČ. Dřív se lišta od kraje po puntík
         vybarvovala, zbytek byl průhledný — a protože neobarvená část
         nebyla na světlém podkladu vidět, zůstal na obrazovce jen
         barevný pahýl. Četlo se to jako přepínač v poloze „zapnuto",
         ne jako místo na škále. Teď je vidět celá lišta, uprostřed má
         rysku (tam je průměr) a na ní sedí jeden puntík. */
      '<div class="pv-track"><span class="pv-stred"></span><span class="pv-dot" style="--w:' + pct + '%"></span></div>' +
      '<div class="pv-scale"><span>levné</span><span>drahé</span></div>' +
      '</div>' + odhadHtml(d);
  }
  /* Kolik rad k tomuhle pozemku je — ať je ze souhrnu poznat, že se pod ním
     něco skrývá, a kolik toho je. */
  function pzGtkKolik(d) {
    if (!window.PK_RADCE || !window.PK_RADCE.rady) return '';
    var n = 0;
    try { n = (window.PK_RADCE.rady(d, MODEL).radky || []).length; } catch (e) { n = 0; }
    if (!n) return '';
    // Krátce, ať se to vejde vedle nadpisu i na úzký telefon.
    return n + ' ' + (n === 1 ? 'věc' : (n < 5 ? 'věci' : 'věcí'));
  }

  // „Co byste měli vědět" (světlá verze). Obsah počítá společný rádce
  // js/radce.js — tenhle soubor tu měl TŘETÍ kopii těch rad.
  /* Kdy robot naposledy obešel zdroje. Po čtyřech dnech se to řekne
     důrazněji — stejná mez jako na úvodní stránce, ať si web neodporuje. */
  function ukazCasDat(updated) {
    var el = document.getElementById('pz-cas');
    if (!el) return;
    var m = /(\d{4})-(\d{2})-(\d{2})/.exec(updated || '');
    if (!m) return;
    var dnesStr = new Date().toISOString().slice(0, 10);
    var kdy = m[0] === dnesStr ? 'dnes' : (+m[3]) + '. ' + (+m[2]) + '. ' + m[1];
    var dni = Math.floor((Date.now() - new Date(+m[1], +m[2] - 1, +m[3]).getTime()) / 86400000);
    el.innerHTML = 'Údaje jsou kopie ze zdroje, zkontrolováno <b>' + kdy + '</b>'
      + (isFinite(dni) && dni >= 4 ? ' — tedy před ' + dni + ' dny' : '')
      + '. Než se rozjedete, ověřte si u zdroje, že nabídka pořád platí.';
    if (isFinite(dni) && dni >= 4) el.classList.add('je-stara');
    el.hidden = false;
  }

  function pzGtkHtml(d) {
    if (!window.PK_RADCE) return '';
    return window.PK_RADCE.htmlSvetla(d, MODEL);
  }

  // Sítě, vybavení a přístup — ukáže se jen když to majitel vyplnil (u inzerátů
  // od lidí). U dat z veřejných zdrojů tyhle údaje nemáme, tak se sekce neukáže.
  var FEAT_ICON = {
    'Elektřina': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/></svg>',
    'Voda': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3s6 6 6 11a6 6 0 0 1-12 0c0-5 6-11 6-11z"/></svg>',
    'Kanalizace': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3C9.5 5.5 9.5 18.5 12 21"/></svg>',
    'Plyn': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c3 3 5 6 5 9a5 5 0 0 1-10 0c0-1 .5-2 1-3 .5 2 2 2 2 2 0-2 1-6 2-8z"/></svg>',
    'Oplocení': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10l2-3 2 3v9H4zM10 10l2-3 2 3v9h-4zM16 10l2-3 2 3v9h-4zM2 13h20"/></svg>',
    // „Příjezd" nese klíč 'cesta' z PKVybaveni — je to nejčastější nález
    // z textu inzerátu (1 092 nabídek), takže bez ikony by vyčníval.
    'Příjezd': '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 21 9 3M20 21 15 3M12 6v2M12 11v2M12 16v2"/></svg>'
  };
  /* SMÍM TU STAVĚT? To je u pozemku ta nejdražší otázka — a Parcelka na ni
     odpovědět neumí: rozhoduje o tom územní plán obce a ten jako jedna
     vrstva pro celou republiku NEEXISTUJE. Každá obec s rozšířenou
     působností ho vydává zvlášť a ve vlastním formátu, takže se nedá ani
     stáhnout, ani přes mapu překrýt. Dělat, že to web umí, by byl další
     slib bez krytí.
     Co udělat jde: zkrátit odchod na jedno klepnutí. Tlačítko proto říká
     „NAJÍT územní plán" — hledá, neukazuje ho. Do dotazu jde obec i okres,
     protože stejných názvů obcí je v republice spousta. */
  function planHledatUrl(d) {
    // U některých záznamů je obec totožná s okresem — pak by se dotaz
    // zdvojil („Brno-venkov okres Brno-venkov").
    var obec = d.place || '';
    var okres = (d.okres && d.okres !== obec) ? ' okres ' + d.okres : '';
    var q = 'územní plán ' + obec + okres;
    return 'https://search.seznam.cz/?q=' + encodeURIComponent(q.trim());
  }
  /* U části záznamů je „místo" ve skutečnosti okres (zdroj nic bližšího
     neuvedl). Pak stálo u odkazu „najít územní plán obce Brno-venkov" —
     jenže Brno-venkov je okres a žádná taková obec není. Věta, která
     plete okres s obcí, podkopává důvěru ve všechno ostatní, co web
     o katastru tvrdí. */
  function planHledatText(d) {
    var obec = d.place || '';
    if (!obec) return 'najít územní plán';
    if (d.okres && obec === d.okres) return 'najít územní plán v okrese ' + obec;
    return 'najít územní plán obce ' + obec;
  }
  var ACCESS_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20l6-16M20 20l-6-16M9 12h6"/></svg>';
  /* ======================================================== MAPA S VRSTVAMI
     Detail pozemku měl nahoře nehybný letecký snímek a tím to končilo.
     Na otázku „smím tu stavět?" se ale obrázkem odpovědět nedá: člověk si
     musí umět položit územní plán PŘES ten pozemek, přepnout na hranice
     parcel a odjet o pár set metrů, jestli ta louka není v záplavě.
     Proto je tu skutečná mapa — a proto se zapíná až když se k ní člověk
     doroluje: nahoře na stránce je podstatná cena a termín, ne dlaždice.

     Obrys pozemku se tu nekreslí. Vlastní hranici neznáme (je v katastru)
     a vymyšlený pětiúhelník by se na letecké mapě od hranice parcely
     nedal odlišit — tutéž věc už jednou zvážil js/snimek.js a dopadlo to
     stejně. Kdo hranici chce, zapne si vrstvu „Hranice parcel", která ji
     má z katastru. */
  /* Adresy dlaždic drží js/snimek.js — tam, kde je i adresa nehybného
     snímku nad stránkou. Tady by to byla druhá kopie téhož. */
  var ZAKLADY = (global.PK_SNIMEK && global.PK_SNIMEK.podklady) || [];

  function pzMapaHtml(d) {
    if (!isFinite(d.lat) || !isFinite(d.lng)) return '';
    return '<h2 class="pz-sect-h">Pozemek na mapě</h2>' +
      '<div class="pzm" id="pzm">' +
        '<div class="pzm-mapa" id="pzm-mapa" role="application" aria-label="Mapa pozemku, kterou lze posouvat a přibližovat">' +
          /* NA CELOU OBRAZOVKU. Na telefonu je mapa vysoká 300 bodů —
             s vrstvou územního plánu přes letecký snímek se v takovém
             okénku nedá nic poznat. Zvětšení je rozdíl mezi hračkou
             a nástrojem, a stojí to jeden přepínač. */
          '<button type="button" class="pzm-cela-btn" id="pzm-cela" aria-label="Zvětšit mapu na celou obrazovku" title="Na celou obrazovku">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
            '<path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3"/></svg>' +
          '</button>' +
          /* ZPÁTKY NA POZEMEK. Mapa jde posouvat a přibližovat, ale nic
             nevedlo zpátky — kdo si odjel podívat se, kudy se k pozemku
             jede, musel stránku načíst znovu, aby ho zase našel. Velká
             mapa na úvodu na to má „Celá ČR", výběr okolí „Ukázat okruh";
             tady nebylo nic.
             Ukazuje se, až když je opravdu k čemu: dokud je značka
             v záběru a přiblížení beze změny, tlačítko by jen zabíralo
             výhled. Stojí pod zvětšením, tedy v témž sloupci vpravo —
             levý okraj displeje si bere telefon na gesto „zpět". */
          '<button type="button" class="pzm-zpet-btn" id="pzm-zpet" hidden ' +
            'aria-label="Vrátit mapu na pozemek" title="Zpátky na pozemek">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
            '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/></svg>' +
            '<span>Na pozemek</span>' +
          '</button>' +
        '</div>' +
        '<div class="pzm-panel">' +
          '<div class="pzm-zaklad" role="group" aria-label="Podklad mapy">' +
            ZAKLADY.map(function (z, i) {
              return '<button class="pzm-z' + (i === 0 ? ' on' : '') + '" type="button" data-zaklad="' + z.id +
                '" aria-pressed="' + (i === 0) + '">' + esc(z.nazev) + '</button>';
            }).join('') +
          '</div>' +
          /* Přepínače vrstev se dopisují, jak které služby odpovídají —
             proto aria-live: kdo nevidí, dozví se, že něco přibylo. */
          '<div class="pzm-vr" id="pzm-vr" aria-live="polite">' +
            '<span class="pzm-hleda"><span class="mnb-ceka" aria-hidden="true"></span>Zkouším mapové vrstvy úřadů…</span>' +
          '</div>' +
          '<label class="pzm-kryti" id="pzm-kryti" hidden>' +
            '<span>Průhlednost vrstvy</span>' +
            '<input type="range" id="pzm-kryti-r" min="20" max="100" step="5" value="65" aria-label="Průhlednost zapnuté vrstvy">' +
          '</label>' +
        '</div>' +
        '<p class="pzm-popis" id="pzm-popis" hidden></p>' +
        '<div class="pzm-leg" id="pzm-leg" hidden></div>' +
      '</div>' +
      /* Odkaz na plán obce zůstává i kdyby žádná vrstva nejela: územní plán
         vydává každá obec zvlášť a to, co je v celostátní vrstvě, nemusí být
         to, co platí na úřadě. Tohle je jediná věta na stránce, která se
         nesmí ztratit — proto stojí mimo mapu, ne v ní. */
      '<p class="pzm-pod">Vrstvy jsou náhled z veřejných služeb úřadů, ne potvrzení. Rozhoduje platný výkres na úřadě — ' +
        '<a href="' + esc(planHledatUrl(d)) + '" target="_blank" rel="noopener">' + esc(planHledatText(d)) + VEN + '</a>.</p>';
  }

  /** Zapne mapu v detailu. Bez Leafletu ukáže aspoň nehybný snímek. */
  function zapniMapu(d) {
    var obal = document.getElementById('pzm');
    if (!obal) return;
    /* Druhá pojistka k počítadlu výš: na rám, který už mapu má, se
       podruhé sahat nesmí. Leaflet si značku nechává v _leaflet_id. */
    if (obal._leaflet_id) return;
    var L = global.L;
    if (!L || !L.map) {
      /* Leaflet se nenačetl (blokovaný skript, offline). Prázdný rám by
         vypadal jako rozbitá stránka, tak tam dáme tentýž snímek jako
         nahoře — statický, ale poctivý. */
      obal.innerHTML = global.PK_SNIMEK
        ? global.PK_SNIMEK.html(d, { sirka: 640, vyska: 400, barva: TYPE[d.type].color, id: 'pzmfb' })
        : '';
      obal.classList.add('pzm-nahrada');
      return;
    }

    if (!ZAKLADY.length) { obal.hidden = true; return; }
    var z = global.PK_SNIMEK && global.PK_SNIMEK.priblizeni ? global.PK_SNIMEK.priblizeni(d, 640, 420) : 16;
    var m = L.map('pzm-mapa', {
      center: [d.lat, d.lng], zoom: Math.max(13, Math.min(18, z)),
      /* Kolečko myši se nezabírá hned: stránka je dlouhá a mapa uprostřed,
         která při rolování začne zoomovat, je past. Povolí se, až člověk
         do mapy klepne — tím dal najevo, že s ní pracuje. */
      /* Zoom si Leaflet sám dává vlevo nahoru — tedy do pruhu u levého
         okraje displeje, kde telefon poslouchá gesto „zpět", a pod
         připíchnutou hlavičku. Vpravo dole je volno (zvětšení na celou
         obrazovku sedí vpravo nahoře) a obě ostatní mapy na webu už to
         tak mají. */
      scrollWheelZoom: false, zoomControl: false
    });
    L.control.zoom({ position: 'bottomright', zoomInTitle: 'Přiblížit', zoomOutTitle: 'Oddálit' }).addTo(m);
    m.on('click', function () { m.scrollWheelZoom.enable(); });
    global.PK_PZ_MAPA = m;

    /* Tlačítko „Na pozemek" se ukáže, až se pohled od značky odlepí.
       Rozhoduje o tom VIDITELNOST ZNAČKY, ne vzdálenost v kilometrech:
       dokud je pozemek v záběru, člověk ví, kde je, a nic nepotřebuje.
       Přibližování se počítá taky — na dvacetinásobek oddálená mapa má
       značku pořád „v záběru", jenže to už je pohled na okres. */
    var domaStred = L.latLng(d.lat, d.lng);
    var domaZoom = m.getZoom();
    var zpetBtn = document.getElementById('pzm-zpet');
    function hlidejZpet() {
      if (!zpetBtn) return;
      var vidim = m.getBounds().pad(-0.12).contains(domaStred);
      zpetBtn.hidden = vidim && Math.abs(m.getZoom() - domaZoom) < 1.5;
    }
    m.on('moveend zoomend', hlidejZpet);
    hlidejZpet();
    if (zpetBtn) {
      zpetBtn.addEventListener('click', function () {
        m.setView(domaStred, domaZoom, { animate: true });
        hlidejZpet();
      });
    }

    // podklad
    var zaklad = null;
    function nastavZaklad(id) {
      var def = ZAKLADY.filter(function (x) { return x.id === id; })[0] || ZAKLADY[0];
      if (zaklad) m.removeLayer(zaklad);
      zaklad = L.tileLayer(def.url, { attribution: def.uvedeni, maxZoom: def.max }).addTo(m);
      zaklad.bringToBack();
      obal.querySelectorAll('.pzm-z').forEach(function (b) {
        var on = b.getAttribute('data-zaklad') === def.id;
        b.classList.toggle('on', on);
        b.setAttribute('aria-pressed', String(on));
      });
    }
    nastavZaklad(ZAKLADY[0].id);
    obal.querySelectorAll('.pzm-z').forEach(function (b) {
      b.addEventListener('click', function () { nastavZaklad(b.getAttribute('data-zaklad')); });
    });

    /* Měřítko není ozdoba: u pozemku je to jediné, z čeho se dá na mapě
       poznat, jestli je ta parcela jako zahrádka, nebo jako pole. */
    L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(m);

    // špendlík na bodu z dat
    L.marker([d.lat, d.lng], {
      keyboard: false,
      icon: L.divIcon({ className: 'pzm-pin', iconSize: [26, 34], iconAnchor: [13, 34],
        html: '<svg viewBox="-14 -36 28 38" width="26" height="34" aria-hidden="true" xmlns="http://www.w3.org/2000/svg">' +
          '<path d="M0 0C-7 -12 -12 -18 -12 -25 A12 12 0 1 1 12 -25 C12 -18 7 -12 0 0Z" fill="' + TYPE[d.type].color +
          '" stroke="#fff" stroke-width="2.5" stroke-linejoin="round"/><circle cx="0" cy="-25" r="4.6" fill="#fff"/></svg>' })
    }).addTo(m);

    // ——— vrstvy úřadů ———
    var vrstvy = document.getElementById('pzm-vr');
    var popis = document.getElementById('pzm-popis');
    var kryti = document.getElementById('pzm-kryti');
    var posuvnik = document.getElementById('pzm-kryti-r');
    var zive = {};          // id → Leaflet vrstva, jen ty zapnuté
    var pridano = 0;

    function prepocitejKryti() {
      var kolik = Object.keys(zive).length;
      if (kryti) kryti.hidden = kolik === 0;
      /* ZAPNUTÁ VRSTVA, KTEROU NENÍ VIDĚT. Katastr kreslí hranice parcel
         až od zoomu 16; nad tím je snímek prázdný. Přepínač přitom
         svítí, takže to vypadá, že vrstva nefunguje — a přesně tak to
         přišlo jako stížnost („a tady chybí rozdělení parcel"). Mapa se
         sama přiblíží ve chvíli zapnutí, ale kdo si pak oddálí, aby
         viděl okolí, spadne pod hranici znovu a nic mu to neřekne.
         Tak to řekneme — a dáme to na jedno klepnutí zpátky. */
      if (popis) {
        var texty = [], daleko = [];
        Object.keys(zive).forEach(function (k) {
          if (zive[k]._pkPopis) texty.push(zive[k]._pkPopis);
          var def = zive[k]._pkDef;
          if (def && def.odPriblizeni && m.getZoom() < def.odPriblizeni) daleko.push(def);
        });
        popis.textContent = texty.join(' ');
        popis.hidden = !texty.length && !daleko.length;
        if (daleko.length) {
          var jmena = daleko.map(function (x) { return x.nazev; });
          var potreba = Math.max.apply(null, daleko.map(function (x) { return x.odPriblizeni; }));
          var rada = document.createElement('span');
          rada.className = 'pzm-daleko';
          var veta = document.createElement('span');
          veta.textContent = (jmena.length === 1 ? jmena[0] + ' se' : jmena.join(' a ') + ' se')
            + ' v tomhle přiblížení nekreslí — úřady je vydávají až zblízka.';
          var tl = document.createElement('button');
          tl.type = 'button';
          tl.className = 'pzm-priblizit';
          tl.textContent = 'Přiblížit';
          tl.addEventListener('click', function () { m.setZoom(potreba); });
          rada.appendChild(veta);
          rada.appendChild(tl);
          popis.appendChild(rada);
        }
      }
      if (posuvnik) {
        var v = (+posuvnik.value || 65) / 100;
        Object.keys(zive).forEach(function (k) { zive[k].setOpacity(v); });
      }
    }
    if (posuvnik) posuvnik.addEventListener('input', prepocitejKryti);
    /* Bez tohohle by se hláška objevila jen ve chvíli zapnutí vrstvy.
       Oddálení je ale právě ten okamžik, kdy hranice zmizí. */
    m.on('zoomend', prepocitejKryti);

    /* VYSVĚTLIVKY. Zapnutý územní plán je bez klíče jen barevná skvrna.
       Obrázek vydává sama služba; když ho nevydá, nesmí zbýt prázdný
       rámeček s popiskem — zmizí celý, stejně jako mizí přepínač vrstvy,
       kterou se nepovedlo načíst. */
    var legendy = document.getElementById('pzm-leg');
    function prepocitejLegendy() {
      if (legendy) legendy.hidden = legendy.querySelectorAll('.pzm-leg-k:not([hidden])').length === 0;
    }
    function pridejLegendu(zapis) {
      if (!legendy || !global.PK_VRSTVY || !global.PK_VRSTVY.legendaAdresa) return;
      var url = global.PK_VRSTVY.legendaAdresa(zapis.sluzba);
      if (!url) return;
      var f = document.createElement('figure');
      f.className = 'pzm-leg-k';
      f.setAttribute('data-id', zapis.def.id);
      f.hidden = true;
      var pop = document.createElement('figcaption');
      pop.textContent = zapis.def.nazev;
      var img = document.createElement('img');
      img.alt = 'Vysvětlivky k vrstvě ' + zapis.def.nazev;
      img.onload = function () { f.hidden = false; prepocitejLegendy(); };
      img.onerror = function () { if (f.parentNode) f.parentNode.removeChild(f); prepocitejLegendy(); };
      f.appendChild(pop); f.appendChild(img);
      legendy.appendChild(f);
      img.src = url;
    }
    function odeberLegendu(id) {
      if (!legendy) return;
      var f = legendy.querySelector('.pzm-leg-k[data-id="' + id + '"]');
      if (f && f.parentNode) f.parentNode.removeChild(f);
      prepocitejLegendy();
    }

    /* Zeptá se služeb na bonitu v pořadí, v jakém jsou v datech — první,
       která odpoví čitelně, platí. Když neodpoví ani jedna, řekne se to;
       mlčet by znamenalo, že si člověk může myslet, že se to načítá. */
    function zjistiBonitu(zapis, vrstva) {
      var sluzby = (zapis.def && zapis.def.sluzby) || [];
      var i = 0;
      function dal() {
        if (i >= sluzby.length) { dopis('Bonitu se u tohohle bodu nepodařilo zjistit.'); return; }
        var u = global.PKBpej.dotazUrl(sluzby[i++], d.lat, d.lng);
        if (!u) { dal(); return; }
        /* NEUKLÁDAT. Odpověď je údaj o JEDNOM konkrétním bodu, který si
           návštěvník vybral — tedy záznam o tom, na který pozemek se
           díval. Nechávat ho ležet v mezipaměti prohlížeče není k ničemu
           dobré (dotaz odejde jednou za zapnutí vrstvy) a je to stopa
           navíc. „no-store" zároveň splňuje pravidlo, které hlídá
           scripts/test-cerstvost.mjs: co se stahuje, se neservíruje ze
           staré kopie. */
        fetch(u, { mode: 'cors', cache: 'no-store' }).then(function (r) { return r.ok ? r.text() : ''; })
          .then(function (t) {
            var o = global.PKBpej.precti(t);
            if (!o.kod && !o.trida) { dal(); return; }
            /* CO SE NAPÍŠE. Kód sám je pětimístné číslo, které člověku
               neřekne nic. Třída ochrany ano, a je to ta odpověď, kvůli
               které se na bonitu ptá: u I. a II. třídy stát vynětí ze
               zemědělského půdního fondu povoluje jen výjimečně, takže
               se na takovém poli nestaví, i kdyby to územní plán
               dovoloval. Proto se u nich píše i ta věta.
               Úřední cena se tu NEPOČÍTÁ — tabulka z vyhlášky 298/2014
               Sb. v repozitáři není a vymýšlet ceny půdy web nesmí. */
            var v = [];
            if (o.kod) v.push('BPEJ na tomhle místě: ' + o.kod + '.');
            if (o.trida === 'I.' || o.trida === 'II.') {
              v.push('Třída ochrany ' + o.trida + ' — nejkvalitnější půda, vynětí ze'
                + ' zemědělského půdního fondu stát povoluje jen výjimečně.');
            } else if (o.trida) {
              v.push('Třída ochrany ' + o.trida + ' z pěti (I. je nejkvalitnější).');
            }
            dopis(v.join(' '));
          })
          .catch(function () { dal(); });
      }
      function dopis(veta) {
        if (!zive[zapis.def.id]) return;          // mezitím si ji vypnul
        vrstva._pkPopis = (zapis.def.popis || '') + ' ' + veta;
        prepocitejKryti();
      }
      dal();
    }

    function pridejPrepinac(zapis) {
      var def = zapis.def;
      if (!pridano++) vrstvy.innerHTML = '';
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'pzm-v';
      b.setAttribute('data-id', def.id);
      b.setAttribute('aria-pressed', 'false');
      b.textContent = def.nazev;
      b.addEventListener('click', prepni);
      function prepni() {
        if (zive[def.id]) {
          m.removeLayer(zive[def.id]);
          delete zive[def.id];
          b.classList.remove('on');
          b.setAttribute('aria-pressed', 'false');
          odeberLegendu(def.id);
        } else {
          var v = global.PK_VRSTVY.leafletVrstva(zapis, L);
          if (!v) return;
          v._pkPopis = def.popis || '';
          v._pkDef = def;
          if (posuvnik) v.setOpacity((+posuvnik.value || 65) / 100);
          v.addTo(m);
          zive[def.id] = v;
          b.classList.add('on');
          b.setAttribute('aria-pressed', 'true');
          /* Katastrální mapa se kreslí až od určitého přiblížení. Když se
             zapne z výšky, nestane se nic a vypadá to jako rozbité —
             tak se mapa přiblíží sama, aby bylo co vidět. */
          if (def.odPriblizeni && m.getZoom() < def.odPriblizeni) m.setZoom(def.odPriblizeni);
          pridejLegendu(zapis);
          /* BONITA: KE KRESBĚ PATŘÍ I ČÍSLO.
             Vrstva BPEJ obarví půdu, ale kód nenese — dlaždice je obrázek.
             Kdo si ji zapne, ptá se „jaká je tady půda", a na to se dá
             odpovědět přesně: zeptat se téže služby na TENHLE bod
             (GetFeatureInfo) a vypsat kód, který vrátí.

             Dotaz odchází až teď, tedy po vyžádání vrstvy — žádný nový
             cizí server nad rámec toho, o co si člověk právě řekl.

             Úřední cena se z kódu NEPOČÍTÁ: tabulka je v příloze vyhlášky
             298/2014 Sb. a v repozitáři není. Vypsat se dá kód, ne cena.
             Čtení odpovědi hlídá scripts/test-bpej.mjs. */
          if (def.id === 'bpej' && global.PKBpej && typeof fetch === 'function'
              && typeof d.lat === 'number' && typeof d.lng === 'number') {
            zjistiBonitu(zapis, v);
          }
        }
        prepocitejKryti();
      }
      vrstvy.appendChild(b);
      /* HRANICE PARCEL SE ZAPNOU ROVNOU.
         Vlastní obrys pozemku v datech nemáme, takže po dojezdu na mapu
         stál uprostřed jen špendlík — a na otázku „kde přesně ten
         pozemek začíná a končí" neodpověděl. Hranice z katastru to
         řeknou, jenže dokud byly schované za přepínačem, většina lidí
         se k nim nedostala: nevědí, že je co zapnout.
         Zapíná se JEN tahle jediná vrstva. Územní plán ani záplavy
         přes snímek samy od sebe nepatří — ty si člověk vyžádá. */
      if (def.id === 'katastr' && !zive[def.id]) prepni();
    }

    if (global.PK_VRSTVY) {
      global.PK_VRSTVY.pripravene({ lat: d.lat, lng: d.lng }, pridejPrepinac).then(function (vse) {
        var mrtve = (vse && vse.mrtve) || [];
        if (!vse.length) {
          /* Nula vrstev. Mlčet by bylo horší než to říct: člověk by čekal
             přepínače, které nikdy nepřijdou. Věta říká, co se stalo, a ne
             že je něco s jeho pozemkem. */
          vrstvy.innerHTML = '<span class="pzm-nic">Vrstvy úřadů teď neodpovídají. Mapa i tak funguje; územní plán obce najdete odkazem pod mapou.</span>';
          return;
        }
        /* Něco jede, něco ne. Když se z pěti přepínačů ukáže jeden a nikde
           nestojí proč, vypadá nabídka náhodně — a člověk neví, jestli
           územní plán neumíme, nebo jestli se právě něco pokazilo. */
        if (mrtve.length) {
          var pozn = document.createElement('span');
          pozn.className = 'pzm-nic';
          /* Celá slova, ne lepení koncovky: „neodpovídá" + „jí" dalo
             „neodpovídájí". Čeština se koncovkami nedolepuje. */
          pozn.textContent = mrtve.length === 1
            ? 'Vrstva ' + mrtve[0] + ' teď neodpovídá — zkusíme to znovu, až sem přijdete příště.'
            : 'Vrstvy ' + mrtve.join(', ') + ' teď neodpovídají — zkusíme to znovu, až sem přijdete příště.';
          vrstvy.appendChild(pozn);
        }
      }).catch(function () {
        vrstvy.innerHTML = '';
      });
    } else {
      vrstvy.innerHTML = '';
    }

    /* VELIKOST MAPY. Jedno „invalidateSize" po 60 ms nestačí: na telefonu
       se výška mění ještě dlouho potom (načtou se písma, doskáče lišta
       prohlížeče, rozbalí se panel s přepínači). Leaflet si přitom
       velikost pamatuje z okamžiku, kdy vznikl — a pak kreslí dlaždice
       jen na část plochy a nahoře i dole zůstane pruh pozadí.
       Tentýž kámen úrazu jako u výběru místa na hlavní stránce, kde
       panel po otevření povyrostl a mapa o tom nevěděla. */
    function premer() { try { m.invalidateSize({ pan: false }); } catch (e) {} }

    /* Zvětšení na celou obrazovku. Velikost dotáhne premer() přes
       ResizeObserver, takže se tu o ni nikdo starat nemusí. */
    var celaBtn = document.getElementById('pzm-cela');
    function nastavCelou(zap) {
      obal.classList.toggle('pzm-cela-zap', zap);
      document.body.classList.toggle('pzm-cela-telo', zap);
      if (celaBtn) {
        celaBtn.setAttribute('aria-label', zap ? 'Zmenšit mapu zpět do stránky' : 'Zvětšit mapu na celou obrazovku');
        celaBtn.title = zap ? 'Zpět do stránky' : 'Na celou obrazovku';
      }
      setTimeout(premer, 60);
      setTimeout(premer, 320);
    }
    if (celaBtn) celaBtn.addEventListener('click', function () {
      nastavCelou(!obal.classList.contains('pzm-cela-zap'));
    });
    /* Escape zavírá. Bez toho je na počítači mapa přes celou obrazovku
       past: jediná cesta ven je trefit malé tlačítko v rohu. */
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && obal.classList.contains('pzm-cela-zap')) nastavCelou(false);
    });
    setTimeout(premer, 60);
    setTimeout(premer, 600);
    if (global.ResizeObserver) {
      try { new ResizeObserver(premer).observe(document.getElementById('pzm-mapa')); } catch (e) {}
    }
    global.addEventListener('resize', premer);
    global.addEventListener('orientationchange', function () { setTimeout(premer, 250); });
  }

  /* MAPOVÁ KNIHOVNA SE DOTAHUJE, AŽ JE MAPA NA DOHLED.
     Naměřeno: vendor/leaflet/leaflet.js má 144 kB, přes drát (brotli)
     36,1 kB — a stránka pozemku si ho dřív brala značkou <script defer>
     ve všech 2 001 případech, tedy i u každého, kdo k mapě dolů nikdy
     nesjede. Mapa je na stránce pod cenou, popisem a vybavením.

     Tahle funkce dřív Leaflet NENAČÍTALA, jen na něj čekala v cyklu po
     100 ms a po šesti sekundách to vzdala. Teď se o načtení stará sama.

     HOTOVO() SE VOLÁ I PŘI NEÚSPĚCHU, a to schválně: o tom, co se stane
     bez knihovny, rozhoduje zapniMapu() — vloží do rámu tentýž nehybný
     snímek jako nahoře, protože prázdný rám vypadá jako rozbitá stránka.
     První podoba téhle změny volala hotovo() jen při úspěchu a tím tu
     náhradu vyřadila; chytil to test-mapa-pozemku.mjs, oddíl E.

     Adresa stojí v <meta name="pk-leaflet" data-src>, ne tady, aby jí
     scripts/orazitkuj-verze.mjs dalo razítko ?v= jako každému jinému
     odkazu; bez razítka by se po výměně knihovny vracejícím návštěvníkům
     servírovala stará. */
  var leafletSlib = null;   // null = nezkoušeno; jinak Promise<boolean>
  function sLeafletem(hotovo) {
    if (global.L && global.L.map) return hotovo();
    if (!leafletSlib) {
      leafletSlib = new Promise(function (dej) {
        /* STYL SE DOTAHUJE SPOLU S KNIHOVNOU, ne značkou <link> v hlavičce.
           Naměřeno pokrytím stylů: vendor/leaflet/leaflet.css má 14 806 B
           a na stránce pozemku se z něj použije 0 B — mapa je dole pod
           cenou, popisem a vybavením a staví se teprve, až je na dohled.
           Přesto ten soubor blokoval první vykreslení na 2 055 stránkách.
           Teď jde dolů až s knihovnou, a to PŘED ní: Leaflet si po startu
           měří rozměry dlaždic, a kdyby styl dorazil až po něm, byly by
           chvíli posunuté. Proto se na dojetí stylu čeká — ale jen do
           chvíle, než se ohlásí; chyba ani tady běh nezastaví, o náhradní
           podobu se stará zapniMapu(). */
        var styl = document.querySelector('meta[name="pk-leaflet-css"]');
        var adresaStylu = styl && styl.getAttribute('data-src');
        function knihovna() {
          var zn = document.querySelector('meta[name="pk-leaflet"]');
          var adresa = (zn && zn.getAttribute('data-src')) || 'vendor/leaflet/leaflet.js';
          var s = document.createElement('script');
          s.src = adresa;
          s.onload = function () { dej(); };
          s.onerror = function () { dej(); };
          document.head.appendChild(s);
        }
        if (!adresaStylu || document.querySelector('link[href^="vendor/leaflet/leaflet.css"]')) {
          knihovna();
          return;
        }
        var l = document.createElement('link');
        l.rel = 'stylesheet';
        l.href = adresaStylu;
        l.onload = knihovna;
        l.onerror = knihovna;
        document.head.appendChild(l);
      });
    }
    leafletSlib.then(hotovo);
  }

  /** Mapa se staví, až když je na dohled — nahoře na stránce je cena, ne dlaždice. */
  /* KAŽDÉ VYKRESLENÍ ZAČÍNÁ NOVOU PŘÍPRAVU MAPY — a ta stará se musí
     zahodit. Stránka se vykresluje dvakrát: nejdřív z handoffu (aby
     nebyla chvíli prázdná) a pak znovu z plných dat. Příprava mapy je
     přitom ve dvou krocích, mezi kterými uplyne čas: počká se, až se
     rám dostane do zorného pole, a pak se dotáhne Leaflet. Když druhé
     vykreslení stihne začít dřív, než doběhne stahování Leafletu,
     počkají si na něj DVĚ přípravy — a obě pak zavolají L.map() na
     tomtéž rámu. Ten druhý dostane „Map container is already
     initialized" a stránka skončí chybou v konzoli.
     Počítadlo je proto jediná pravda o tom, které vykreslení je
     aktuální; co je starší, se tiše zahodí. Chytá to test-mapa.mjs
     („stránka neshodila žádnou chybu") — jenže až po klepnutí do mapy,
     tedy v běhu, kde na pořadí závisí. Proto navíc druhá pojistka
     v zapniMapu(). */
  var mapaVerze = 0;
  function pripravMapu(d) {
    var moje = ++mapaVerze;
    var obal = document.getElementById('pzm');
    if (!obal) return;
    function ted() {
      sLeafletem(function () {
        if (moje !== mapaVerze) return;   // mezitím se vykreslilo znovu
        zapniMapu(d);
      });
    }
    if (!global.IntersectionObserver) { ted(); return; }
    var io = new IntersectionObserver(function (zaznamy) {
      if (moje !== mapaVerze) { io.disconnect(); return; }
      if (!zaznamy.some(function (z) { return z.isIntersecting; })) return;
      io.disconnect();
      ted();
    }, { rootMargin: '300px 0px' });
    io.observe(obal);
  }

  /* POPIS OD MAJITELE SE NIKDE NEUKAZOVAL.
     Formulář u toho pole píše „nepovinné — ale hodně pomůže zájemcům",
     kontrola v prohlížeči po něm chce aspoň větu, server ho uloží (až
     2 000 znaků) a js/main.js ho i načte do d.description. A tím to
     skončilo: v celém webu nebylo ani jedno místo, které by ho vypsalo.
     Majitel tedy psal text, který nikdo nikdy neuvidí.
     U stažených nabídek je text od inzerenta, ne od majitele, a vypisuje
     ho pzPopisInzerentaHtml() z ostrůvku v HTML stránky. Tahle sekce tedy
     patří nabídkám od majitelů — a proto se ptá na obsah, ne na typ.
     Odstavce se zachovají: člověk je psal, ať je má i na stránce. */
  function pzPopisHtml(d) {
    var t = String(d.description == null ? '' : d.description).trim();
    if (!t) return '';
    var odstavce = t.split(/\n\s*\n|\n/).map(function (x) { return x.trim(); })
      .filter(function (x) { return x; });
    if (!odstavce.length) return '';
    return '<h2 class="pz-sect-h">Co o pozemku píše majitel</h2>' +
      '<div class="pz-popis">' + odstavce.map(function (x) {
        return '<p>' + esc(x) + '</p>';
      }).join('') + '</div>';
  }

  /* SÍTĚ SE ČTOU ZE DVOU MÍST A STRÁNKA ZNALA JEN JEDNO.
     Brala jen d.features, což jsou sítě zaškrtnuté majitelem ve
     formuláři. U stažených nabídek je ale robot vytáhl z textu inzerátu
     a uložil jako klíče do d.site — a těch je 1 208 z 1 971. U šedesáti
     procent pozemků tedy stránka o elektřině, vodě, plynu ani příjezdu
     nenapsala ani slovo, ačkoli karta na mapě je ukazovala. A to je
     přesně naopak, než má být: karta je přehled, stránka je místo, kde
     se člověk rozhoduje.
     Spojuje to PKVybaveni.nazvy(), aby obě poloviny webu říkaly totéž.
     U vytaženého textu se ale musí připsat, ODKUD to je: robot čte
     inzerát, nekontroluje pozemek. */
  function pzFeaturesHtml(d) {
    var jmena = (global.PKVybaveni && global.PKVybaveni.nazvy) ? global.PKVybaveni.nazvy(d)
      : (Array.isArray(d.features) ? d.features : []);
    var chips = jmena.map(function (f) {
      return '<span class="pz-feat">' + (FEAT_ICON[f] || '') + esc(f) + '</span>';
    });
    if (d.access) chips.push('<span class="pz-feat pz-feat-acc">' + ACCESS_SVG + esc(d.access) + '</span>');
    if (!chips.length) return '';
    var zTextu = Array.isArray(d.site) && d.site.length;
    return '<h2 class="pz-sect-h">Sítě a vybavení</h2>' +
      '<div class="pz-feats">' + chips.join('') + '</div>' +
      '<p class="pz-feat-zdroj">' + (zTextu
        ? 'Vyčteno z textu inzerátu, ne z úřední evidence — u zdroje si to ověřte.'
        : 'Uvádí majitel pozemku.') + '</p>';
  }

  /* UKONČENÁ STRÁNKA SE UŽ NEPŘEKRESLUJE.
     Generátor na stránku zmizelé nabídky přidá pruh „Tato nabídka už
     není aktuální" a nechá na ní všechno, co o pozemku víme. Je to
     rozhodnutí o TÉHLE adrese: je odložená, nemá se indexovat a nemá
     se tvářit jako živá nabídka. Ve třech případech přitom nabídka
     v datech pořád je — dostala jen jiný soubor (stránky se rozlišují
     otiskem klíče) — a tahle stránka ji pak vykreslila jako živou,
     i když o sobě o kus výš tvrdila opak. Dvě adresy s týmž obsahem
     a jedna z nich si odporuje. Rozhoduje pruh. */
  function strankaUkoncena() {
    return !!document.querySelector('.pz-konec');
  }

  function render(d) {
    if (strankaUkoncena()) return;
    var t = TYPE[d.type];
    /* Cena za metr, který kupující opravdu dostane. U spoluvlastnického
       podílu je v inzerátu výměra celé parcely, ale cena jen za zlomek —
       dělit celou výměrou znamená ukázat jako fakt číslo, které neplatí
       pro nikoho. Výpočet drží js/ceny.js, ať ho mapa i tahle stránka
       mají stejný; když velikost podílu neznáme, neukáže se nic. */
    var _zm = global.PK_CENY && global.PK_CENY.zaMetr ? global.PK_CENY.zaMetr(d) : null;
    var perM2 = _zm == null ? null : Math.round(_zm);
    var perM2Pozn = global.PK_CENY && global.PK_CENY.zaMetrPopis ? global.PK_CENY.zaMetrPopis(d) : '';
    var priceLabel = d.type === 'drazba' ? 'Vyvolávací cena' : (d.type === 'sale' || d.type === 'majitel' ? 'Cena' : 'Odhadní cena');
    var days = daysUntil(d.extra);
    // „Zobrazit na mapě" vede na SKUTEČNOU mapu (Mapy.cz letecká) na daném místě,
    // ne na naši tečkovanou mapu. Přesný obrys pozemku je pak přes „Katastr".
    var mapHref = 'https://mapy.cz/letecka?x=' + d.lng + '&y=' + d.lat + '&z=18&source=coor&id=' + d.lng + ',' + d.lat;
    /* PANORAMA Z ULICE. Letecký snímek ukáže tvar a okolí shora, ale ne
       to, co o pozemku rozhodne při prohlídce: jestli k němu vede
       zpevněná cesta, co stojí hned vedle a jak to tam vypadá z očí.
       Jeden odkaz navíc ušetří cestu přes půl republiky.
       Panorama ale NENÍ všude — mimo zastavěné území bývá nejbližší
       snímek stovky metrů daleko. Proto to tlačítko neslibuje pohled na
       parcelu, ale „nejbližší panorama"; když v okolí žádné není,
       Mapy.cz ukážou mapu a člověk se dozví, že snímek neexistuje —
       což je taky odpověď. */
    var panoHref = 'https://mapy.cz/zakladni?x=' + d.lng + '&y=' + d.lat + '&z=18&pano=1&source=coor&id=' + d.lng + ',' + d.lat;
    var src = sourceLink(d);
    var favOn = isFav(d);

    /* TŘI ČÍSLA NAHOŘE, ZBYTEK POD NIMI.
       Všech šest údajů stálo jako stejně vypadající řádky popisek-vlevo,
       hodnota-vpravo. Změřeno: na počítači bylo mezi popiskem a hodnotou
       435 px prázdna (na telefonu 133 px), takže oko muselo u každého
       řádku přeskočit půl obrazovky — a protože měly všechny řádky tutéž
       velikost i váhu, nic nevedlo. Výsledek vypadal jako výpis
       z databáze, ne jako nabídka pozemku.
       Výměra, cena za metr a druh jsou to, podle čeho se člověk
       rozhoduje; ty tedy stojí nahoře jako tři buňky s velkým číslem
       a popiskem pod ním. Zbytek (parcela, souřadnice, kategorie, zdroj)
       je dohledávka a zůstává řádkem — jen už s popiskem a hodnotou
       vedle sebe, ne na opačných koncích. */
    var klice = [];
    /* U podílu je v inzerátu výměra CELÉ parcely — musí to být napsané,
       jinak si ji každý vydělí cenou za podíl. */
    klice.push({ k: 'Výměra', v: areaTxt(d),
      pozn: (d.podil && hasArea(d)) ? 'celá parcela — kupuje se jen podíl' : '' });
    if (perM2) klice.push({ k: 'Cena za m²', v: fmt(perM2) + ' Kč/m²', pozn: perM2Pozn || '' });
    klice.push({ k: 'Druh pozemku', v: esc(d.druh || '—'), pozn: '' });

    var facts = [];
    if (hasParcel(d)) facts.push({ k: 'Parcela', v: 'č. ' + esc(d.parcel) });
    /* A KDYŽ V DATECH NENÍ, ZKUSÍ SE TEXT INZERÁTU. Číslo vepsal
       generátor do window.PK_POZEMEK.pc a vzal ho z popisu jen tehdy,
       když v něm bylo JEDNO a výměra hned za ním sedla na výměru
       nabídky (pravidla i naměřené počty jsou v
       scripts/parcely-z-textu.mjs). U 1 675 nabídek z 1 948 parcelní
       číslo chybí, takže je to u čtvrtiny z nich ta jediná cesta, jak
       pozemek vůbec dohledat v katastru.
       MUSÍ U TOHO STÁT, ODKUD JE. Podle parcelního čísla se podepisuje
       smlouva; tohle není z katastru, je to z inzerátu. */
    else if (!hasParcel(d) && window.PK_POZEMEK && window.PK_POZEMEK.pc) {
      facts.push({ k: 'Parcela', v: 'č. ' + esc(window.PK_POZEMEK.pc),
        pozn: 'podle textu inzerátu, neověřeno v katastru' });
    }
    /* SOUŘADNICE S SEBOU. Na prohlídku se jezdí autem a do navigace se
       zadává bod, ne „okres Benešov". Stránka přitom souřadnice zná —
       stavěla z nich mapu i odkazy do katastru — a člověku je neřekla,
       takže si je musel opisovat z adresy nebo hádat z mapy.
       Podoba je ta, kterou berou Mapy.cz, Google i Seznam navigace:
       desetinné stupně s TEČKOU a čárkou mezi nimi. S desetinnou čárkou
       by se při vložení rozpadly na čtyři čísla. */
    if (isFinite(d.lat) && isFinite(d.lng)) {
      var sour = d.lat.toFixed(5) + ', ' + d.lng.toFixed(5);
      facts.push({ k: 'Souřadnice', v:
        '<span class="pz-sour">' +
          '<code id="pz-sour-text">' + esc(sour) + '</code>' +
          '<button type="button" class="pz-sour-kop" id="pz-sour-kop" data-sour="' + esc(sour) + '">' +
            '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" ' +
              'stroke-linecap="round" stroke-linejoin="round">' +
              '<rect x="9" y="9" width="11" height="11" rx="2"/>' +
              '<path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>' +
            '<span>Kopírovat</span></button>' +
          '<a class="pz-sour-nav" id="pz-sour-nav" href="#" rel="nofollow">' +
            '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" ' +
              'stroke-linecap="round" stroke-linejoin="round">' +
              '<path d="M3 11l19-9-9 19-2-8-8-2Z"/></svg>' +
            '<span>Navigovat</span></a>' +
        '</span>' });
    }
    facts.push({ k: 'Kategorie', v: esc(t.label) });
    if (d.extra) facts.push({ k: 'Stav / zdroj', v: esc(zdrojText(d.extra)) });
    /* ŽÁDNÝ ŘÁDEK „INZERÁT UVÁDÍ" TADY UŽ NENÍ — a schválně.
       Stával tu výčet „elektřina, voda, kanalizace, plyn" jako další
       řádek téhle tabulky. Od chvíle, kdy sekce „Sítě a vybavení"
       ukazuje sítě z OBOU zdrojů (od majitele i vytažené z textu
       inzerátu, viz pzFeaturesHtml), by to byla tatáž informace dvakrát
       těsně pod sebou — jen jednou jako čárkovaný výčet v tabulce a
       podruhé jako štítky s ikonami. Zůstávají štítky: čtou se rychleji
       a je u nich napsané, odkud ta informace je, což čárkovaný výčet
       v tabulce parametrů neunesl. */
    /* Podíl je to nejdůležitější, co se o nabídce dá říct: kupuje se
       zlomek pozemku, ne pozemek. Bez toho vypadá cena za metr jako
       trhák. */
    if (d.podil) {
      facts.push({ k: 'Vlastnictví', v: d.zlomek
        ? 'inzerát mluví o spoluvlastnickém podílu <b>' + esc(d.zlomek) + '</b> — ověřte si ho v katastru'
        : 'inzerát mluví o spoluvlastnickém podílu — ověřte si velikost podílu v katastru' });
    }

    /* HLAVNÍ AKCE PATŘÍ NAHORU, NE NA ČTVRTOU OBRAZOVKU. Odkaz na
       skutečnou nabídku (nebo na majitele) byl na telefonu 360×800 až
       na y 3 078 z 3 748 px a „Uložit" dokonce na 3 386 — tedy obojí
       za mapou, kalkulačkou i poznámkou. Kvůli tomu přitom člověk na
       stránku jde: rozhodnout se a pak jít na inzerát.
       Nahoru jdou právě DVĚ tlačítka. Vedlejší odkazy (Mapy.cz,
       panorama, katastr, sdílení) zůstávají dole — nahoře by z toho
       byla zeď šesti tlačítek, tedy přesně to „přeplácané na sílu". */
    var hlavniAkce = (d.type === 'majitel'
      ? (d._lid
          ? '<a class="pz-btn primary" href="zpravy.html?l=' + encodeURIComponent(d._lid)
            + '&new=1&p=' + encodeURIComponent(d.place || '')
            + '&ok=' + encodeURIComponent(d.okres || '') + '">Napsat majiteli</a>'
          : '') +
        (function () {
          var odkaz = PKCisteni.kontaktOdkaz(d.contact);
          if (!odkaz) return '';
          var tr = PKCisteni.jeEmail(d.contact) ? 'E-mail: ' : 'Telefon: ';
          return '<a class="pz-btn' + (d._lid ? ' ghost' : ' primary') + '" href="' + odkaz + '">'
            + tr + esc(d.contact) + '</a>';
        })()
      : '<a class="pz-btn primary" href="' + esc(src.url) + '" target="_blank" rel="noopener">'
        + esc(src.label) + VEN + '</a>');

    var html =
      '<div class="pz-media">' + heroLayers(d) + '</div>' +

      '<div class="pz-head">' +
        '<h1 class="pz-place">' + esc(titulStranky() || d.place) + '</h1>' +
        (mistoRadek(d, titulStranky()) ? '<div class="pz-okres">' + PIN_SVG + mistoRadek(d, titulStranky()) + '</div>' : '') +
        (dalkyText() ? '<div class="pz-dalky">vzdušnou čarou: ' + esc(dalkyText()) + '</div>' : '') +
        (vObciHtml() ? '<div class="pz-vobci">' + vObciHtml() + '</div>' : '') +
        blokHtml() +
      '</div>' +

      '<div class="pz-priceblock">' +
        '<div class="pz-pl">' + priceLabel + '</div>' +
        '<div class="pz-price"><span class="pv">' + fmt(d.price) + ' Kč</span>' +
          (perM2 ? '<span class="pm"' + (perM2Pozn ? ' title="' + esc(perM2Pozn) + '"' : '') + '>' + fmt(perM2) + ' Kč/m²</span>' : '') + '</div>' +
        /* ZMĚNA CENY PATŘÍ POD CENU, NE MEZI ODZNAKY. Na kartě je na ni
           jeden řádek, tady je místo říct celou věc: o kolik, z čeho
           a kdy. Je to jediný údaj na stránce, který si člověk nemůže
           ověřit jinde — minulou cenu vidí jen od nás — tak ať je aspoň
           úplný. Větu skládá js/zlevneni.js, stejně jako pro kartu. */
        pzZmenaCenyHtml(d) +
      '</div>' +

      /* HISTORIE POD CENOU, NE MEZI PORADAMI. Celá sekce se vynechá,
         když o pozemku známe jedinou cenu — a to je většina. */
      pzHistorieHtml() +

      /* Po termínu se blok jen vynechával, takže stránka vypadala jako
         běžná nabídka a o tom, že dražba už proběhla, nepadlo slovo.
         Kdo sem přijde po starším odkazu, musí se to dozvědět hned. */
      pzDrazbaHtml(d, days) +

      '<div id="pz-verdict">' + pzVerdictHtml(d) + '</div>' +

      /* DŮKAZ HNED POD VERDIKT, ne na konec stránky. Tvrzení a to, z
         čeho vzniklo, patří k sobě — kdo verdikt čte, má mít seznam
         na očích, ne o tři obrazovky níž. */
      pzSrovnaniHtml() +

      /* RÁDCE JEŠTĚ PŘED TLAČÍTKEM. Vypisuje, co je u tohohle pozemku
         k ověření — a to se má člověk dozvědět DŘÍV, než odejde na
         inzerát, ne až se vrátí. Je sbalený, takže ho to stojí jeden
         řádek; hlídá to scripts/test-mapa-pozemku.mjs. */
      '<details class="pz-gtk-obal">' +
        '<summary class="pz-gtk-sum">' +
          '<h2 class="pz-sect-h">Co byste měli vědět</h2>' +
          '<span class="pz-gtk-kolik">' + pzGtkKolik(d) + '</span>' +
          '<span class="pz-gtk-akce"><span class="zav">Rozbalit</span><span class="otv">Skrýt</span></span>' +
        '</summary>' +
        pzGtkHtml(d) +
      '</details>' +

      /* ROZHODNUTÍ A AKCE HNED POD NÍM. Nahoře jsou dvě tlačítka a ne
         víc: jít na nabídku a schovat si ji. Ostatní cesty ven čekají
         dole, kde se po nich sáhne, až když pozemek zaujme. */
      '<div class="pz-akce-hlavni">' + hlavniAkce +
        '<button class="pz-btn ulozit' + (favOn ? ' on' : '') + '" type="button" id="pz-fav">'
          + HEART_SVG + '<span>' + (favOn ? 'Uloženo' : 'Uložit') + '</span></button>' +
      '</div>' +

      /* POPIS OD INZERENTA. Dosud na stránce pozemku nestálo ani slovo od
         toho, kdo ho zná — jen čísla a věty, které si web poskládal sám.
         Text přichází z inzerátu, je zbavený kontaktů (celé věty s telefonem
         nebo e-mailem se zahazují, viz scripts/fetch-opportunities.mjs)
         a leží v ostrůvku JSONu rovnou v téhle stránce, aby si kvůli němu
         nemusela nic stahovat. Když chybí, nezobrazí se nic — ne prázdný
         nadpis. */
      pzPopisInzerentaHtml() +

      '<h2 class="pz-sect-h">Parametry pozemku</h2>' +
      '<div class="pz-klice">' +
        klice.map(function (f) {
          return '<div class="pz-klic"><b>' + f.v + '</b><span>' + f.k + '</span>' +
            (f.pozn ? '<i>' + esc(f.pozn) + '</i>' : '') + '</div>';
        }).join('') +
      '</div>' +
      /* Prázdný rámeček by vypadal jako chybějící obsah: když u pozemku
         není ani parcelní číslo, ani souřadnice, ani zdroj, nevykreslí
         se tabulka vůbec. */
      (facts.length
        ? '<div class="pz-specs">' +
            /* `pozn` je vysvětlivka k hodnotě, ne další údaj: u parcelního
               čísla z inzerátu u ní MUSÍ stát, odkud je. Dřív řádek nic
               takového neumožňoval a vysvětlivka by musela být v hodnotě,
               tedy stejně velkým písmem jako samo číslo. */
            facts.map(function (f) { return '<div class="pz-spec"><span class="k">' + f.k + '</span><span class="v">' + f.v
              + (f.pozn ? '<small class="pz-spec-pozn">' + esc(f.pozn) + '</small>' : '') + '</span></div>'; }).join('') +
          '</div>'
        : '') +

      /* SOUKROMÁ POZNÁMKA. Kdo obchází deset pozemků, po týdnu si
         nepamatuje, který měl rozbitý plot. Web uměl jen „uložit",
         tedy ANO/NE bez jediného slova proč. */
      /* KDE TO JE, PATŘÍ K TOMU, CO TO JE. Mapa stála až za poznámkou,
         kalkulačkou i rádcem — na telefonu na y 2 543 z 3 748, tedy na
         čtvrté obrazovce. U pozemku je přitom poloha hned po ceně to
         první, co se člověk ptá: vede tam cesta? co je kolem? */
      pzMapaHtml(d) +

      pzFeaturesHtml(d) +

      /* RÁDCE: ZABALENÝ, ALE V INZERÁTU — NE AŽ POD PATIČKOU.
         Zabalený je proto, že je to zeď textu: změřeno na telefonu měl
         detail 3 218 px a samotný rádce z toho 1 050, tedy třetinu
         stránky. Jenže zabalit ho nestačilo — skončil úplně dole, až za
         tlačítky „Otevřít v katastru", „Uložit" a „Sdílet", tedy za
         místem, kde člověk stránku opouští. Kdo se doroloval tak daleko,
         viděl nad patičkou šedý nadpis a šel pryč; nikdo ho neotevíral.
         Teď stojí mezi parametry a mapou, tedy uvnitř toho, co si člověk
         o pozemku čte. Souhrn taky vypadá jako ovládací prvek (viz
         .pz-gtk-sum v pozemek.html): slovo „Rozbalit", počet rad a šipka.
         Nadpis zůstává nadpisem i uvnitř souhrnu, ať se nerozpadne
         osnova stránky pro odečítače a vyhledávače. */

      pzPopisHtml(d) +


      /* KOLIK TO BUDE STÁT DOHROMADY. Stránka říká cenu pozemku, ale ta
         není celá pravda: k ní se přičte vklad do katastru, smlouva,
         úschova a případně provize. Dosud se to člověk dozvěděl jen
         z článku, kde si to musel sečíst sám. Odkaz nese cenu s sebou,
         takže se kalkulačka otevře už vyplněná. */
      (d.price ? (function () {
        var c = encodeURIComponent(String(Math.round(d.price)));
        /* Dva odkazy na jednom řádku, ne dva odstavce: jsou to dvě strany
           téže otázky („kolik to stojí" a „na kolik si půjčím") a každá
           vlastní krabička by z detailu udělala rozcestník. */
        /* A třetí: až se člověk rozhodne, přijde smlouva. Odkaz nese, co
           o pozemku víme — cenu, výměru a druh, a parcelní číslo jen
           tehdy, když ho opravdu známe.
           KATASTRÁLNÍ ÚZEMÍ SE NEPOSÍLÁ, PROTOŽE HO NEMÁME. V datech
           nabídek není; je tam obec, a ta se s katastrálním územím
           často neshoduje. Poslat obec jako katastrální území by bylo
           pohodlné a byla by to nejhorší možná chyba — podklad by
           určoval jiný pozemek. Zůstane tedy prázdné a stránka si
           o ně řekne. */
        var q = ['cena=' + c];
        if (hasArea(d)) q.push('vymera=' + encodeURIComponent(String(Math.round(d.area))));
        if (d.druh) q.push('druh=' + encodeURIComponent(String(d.druh)));
        if (d.parcel && !/^[\s—-]*$/.test(String(d.parcel))) q.push('parcela=' + encodeURIComponent(String(d.parcel)));
        /* A KDYŽ ČÍSLO ZE ZDROJE NENÍ, POŠLE SE TO Z TEXTU INZERÁTU —
           ALE OZNAČENÉ. Parcelní číslo chybí u 86 % nabídek a bez něj
           podklad nejde dokončit; z popisu ho umíme přečíst u 214
           (pravidla v scripts/parcely-z-textu.mjs).
           Zvažoval jsem, že se posílat nebude: komentář o pár řádků výš
           říká „poslat obec jako katastrální území by byla nejhorší
           možná chyba" a tohle číslo taky neznáme z katastru. Jenže ten
           případ je jiný. Obec není katastrální území, zatímco tohle
           číslo v inzerátu stojí a výměra u něj sedí na nabídku. A hlavně:
           kdyby se neposlalo, člověk napíše TOTÉŽ číslo z TÉHOŽ inzerátu,
           jen bez varování. Posílá se proto s příznakem, podle kterého
           u pole stojí, odkud je a že se má ověřit. */
        else if (window.PK_POZEMEK && window.PK_POZEMEK.pc) {
          q.push('parcela=' + encodeURIComponent(String(window.PK_POZEMEK.pc)));
          q.push('parcela_z=inzerat');
        }
        return '<p class="pz-naklady">'
          + '<a href="kolik-stoji-koupe-pozemku.html?cena=' + c + '">Kolik koupě stojí dohromady</a>'
          + ' · <a href="hypoteka-na-pozemek.html?cena=' + c + '">Spočítat splátku hypotéky</a>'
          + ' · <a href="kupni-smlouva-pozemek.html?' + q.join('&') + '">Podklad pro smlouvu</a>'
          + '</p>';
      }()) : '') +


      '<div class="pz-cta">' +
        /* Vedlejší cesty ven. Hlavní tlačítko (inzerát nebo majitel)
           je nahoře u ceny; tady zůstalo, co se hodí AŽ když se člověk
           rozhodl, že ho pozemek zajímá: podívat se na něj v mapách
           a projít se kolem v panoramatu. */
        '<a class="pz-btn ghost" href="' + mapHref + '" target="_blank" rel="noopener">' + MAP_SVG + 'Otevřít v Mapy.cz' + VEN + '</a>' +
        '<a class="pz-btn ghost" href="' + panoHref + '" target="_blank" rel="noopener" title="Otevře Mapy.cz na nejbližším panoramatu z ulice. Mimo obce nemusí být nasnímané.">' + MAP_SVG + 'Nejbližší panorama' + VEN + '</a>' +      '</div>' +
      /* ZPOŽDĚNÍ DAT. Tohle na stránce chybělo úplně: člověk viděl cenu
         a termín, ale ne to, že se dívá na KOPII pořízenou někdy dřív.
         U dražby nebo exekuce je to rozdíl mezi „stihnu to" a marnou
         cestou. Datum je jediné, co se dá tvrdit poctivě — kdy robot
         naposledy obešel zdroje. Datum u JEDNOTLIVÉ nabídky se tvrdit
         nedá: pole „poprvé viděno" má sice každý záznam, jenže všech
         1 965 má tutéž hodnotu, protože se sloupec nastavil najednou.
         „V nabídce od" by tedy u všech lhalo stejně. */
      /* MOJE POZNÁMKA AŽ TADY. Stála na y 1 439 z 3 748, tedy dřív, než
         si člověk pozemek vůbec prohlédl — a psal si ji přitom až
         potom, co se rozhodl. Teď je u ostatních vlastních věcí. */
      '<section class="pz-pozn-box" aria-labelledby="pz-pozn-nadpis">' +
        '<div class="pz-pozn-hlava">' +
          '<h2 id="pz-pozn-nadpis">Moje poznámka</h2>' +
          '<span class="pz-pozn-stav" id="pz-pozn-stav" role="status" aria-live="polite"></span>' +
        '</div>' +
        '<textarea id="pz-pozn-text" class="pz-pozn-pole" rows="3" maxlength="2000" ' +
          'placeholder="Co jste tu viděli — příjezd, sousedi, co říkal majitel…" ' +
          'aria-describedby="pz-pozn-kde"></textarea>' +
        /* VĚTA SE MUSELA ZMĚNIT SPOLU S CHOVÁNÍM. Stálo tu „zůstává jen
           v tomhle prohlížeči, nikam se neodesílá, nevidíme ji ani my".
           Od chvíle, kdy se poznámky vážou na účet, by to byla lež —
           a lež zrovna v tom jediném místě, kde se člověk rozhoduje,
           co o cizích lidech napíše. Píše se proto obojí, podle toho,
           jestli je přihlášený; text dosadí skript níž. */
        '<p class="pz-pozn-kde" id="pz-pozn-kde"></p>' +
      '</section>' +

      '<p class="pz-cas" id="pz-cas" hidden></p>' +

      /* VAROVÁNÍ U INZERÁTU OD MAJITELE — stejná věta jako na mapě
         (js/main.js). Stojí těsně před tlačítky, tedy u okamžiku, kdy
         se člověk chystá majiteli volat. */
      (d.type === 'majitel' ? '<p class="pz-pozor" role="note">Nikdy neposílejte zálohu ani rezervační poplatek předem. Nabídky od majitelů neověřujeme — vlastníka i parcelu si potvrďte v katastru a peníze posílejte až přes advokátní nebo notářskou úschovu.</p>' : '') +

      '<div class="pz-actions">' +
        '<a class="pz-abtn" href="' + katastrUrl(d) + '" target="_blank" rel="noopener">' + PIN_SVG + 'Otevřít v katastru' + VEN + '</a>' +
        '<button class="pz-abtn" type="button" id="pz-share">' + SHARE_SVG + 'Sdílet</button>' +
      '</div>' +

      /* Rozcestník až nakonec: kdo odsud odchází, odchází dál do webu,
         ne zpátky na mapu. */
      kamDalHtml();

    var host = document.getElementById('pz-detail');
    host.innerHTML = html;
    try { zapisNaposledy(d); } catch (e) {}
    try { zapocitejZhlednuti(d); } catch (e) {}

    /* Mapa se staví až po vykreslení: potřebuje prvek v dokumentu a vlastní
       rozměr. Sama si pak počká, než se k ní člověk doroluje. */
    try { pripravMapu(d); } catch (e) {}

    // titulek stránky a vlastní adresa v kanonickém odkazu
    /* Titulek taky z ostrůvku, ať se servírovaná a vykreslená podoba
       neliší ani tady: stránka se jmenovala „Bystřice — 190 550 Kč ·
       Parcelka", zatímco v HTML stálo „Trvalý travní porost 4 889 m²
       — Bystřice | Parcelka". Bez ostrůvku (z mapy) zůstává to starší. */
    try {
      var _t = titulStranky();
      document.title = _t ? _t + ' | Parcelka'
        : d.place + ' — ' + fmt(d.price) + ' Kč · Parcelka';
    } catch (e) {}
    /* Kanonická adresa je VLASTNÍ stránka pozemku, ne obecná pozemek.html
       s dotazem. Sdílený odkaz tím vede tam, kde má každá nabídka svůj
       titulek, popis i náhled — přes „?p=…" viděl Facebook u všech 1 927
       nabídek totéž. Výpočet musí sedět s generátorem
       (scripts/generate-parcel-pages.mjs), proto je to týž obyčejný djb2. */
    try { nastavKanonickou('https://www.parcelaka.cz/' + vlastniAdresa(d)); } catch (e) {}

    // uložit
    var favBtn = document.getElementById('pz-fav');
    if (favBtn) favBtn.addEventListener('click', function () {
      var on = toggleFav(d);
      favBtn.classList.toggle('on', on);
      favBtn.querySelector('span').textContent = on ? 'Uloženo' : 'Uložit';
      toast(on ? 'Uloženo mezi oblíbené' : 'Odebráno z oblíbených');
    });
    // sdílet
    var shareBtn = document.getElementById('pz-share');
    if (shareBtn) shareBtn.addEventListener('click', function () {
      /* Sdílí se VLASTNÍ stránka pozemku, ne adresa, na které zrovna stojíme.
         Přes „?p=…" ukazoval náhled u všech nabídek totéž — a sdílení je
         přesně ta chvíle, kdy na náhledu záleží nejvíc. */
      var url = location.origin + '/' + vlastniAdresa(d);
      var title = 'Pozemek ' + d.place + ' — Parcelka';
      var text = t.label + ' · ' + d.place + ', okres ' + d.okres + ' · ' + areaTxt(d) + ' · ' + fmt(d.price) + '\u00a0Kč';
      if (navigator.share) { navigator.share({ title: title, text: text, url: url }).catch(function () {}); }
      else if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(url).then(function () { toast('Odkaz zkopírován'); }); }
      else { toast(url); }
    });

    /* ---- soukromá poznámka ---- */
    var poznEl = document.getElementById('pz-pozn-text');
    if (poznEl && global.PKPoznamky) {
      var stavEl = document.getElementById('pz-pozn-stav');
      /* KDE TA POZNÁMKA LEŽÍ, ZÁLEŽÍ NA PŘIHLÁŠENÍ — a člověk to musí
         vědět DŘÍV, než začne psát, ne až potom. Proto se věta dosazuje
         podle skutečného stavu, ne jako jeden text pro obě situace. */
      var kdeEl = document.getElementById('pz-pozn-kde');
      function rekniKde() {
        if (!kdeEl) return;
        if (global.PKPoznamky.prihlasen && global.PKPoznamky.prihlasen()) {
          kdeEl.innerHTML = 'Uloží se <b>k vašemu účtu</b>, takže ji uvidíte '
            + 'i na jiném telefonu a mezi uloženými pozemky. '
            + 'Čte ji jen váš účet — nikdo další, ani majitel pozemku.';
        } else {
          kdeEl.innerHTML = 'Zůstává <b>jen v tomhle prohlížeči</b>. '
            + 'Nikam se neodesílá, nevidíme ji ani my — a do jiného telefonu '
            + 'se nepřenese. Po přihlášení ji web uloží k účtu.';
        }
      }
      rekniKde();
      /* Doplnění z účtu může dorazit až po vykreslení; pak se políčko
         i věta srovnají podle toho, co doopravdy platí. */
      if (global.PKPoznamky.sync) {
        global.PKPoznamky.sync().then(function (n) {
          if (n == null) return;
          rekniKde();
          var zUctu = global.PKPoznamky.text(d);
          /* Nepřepisovat, co má člověk rozepsané pod rukou. */
          if (document.activeElement !== poznEl && zUctu && zUctu !== poznEl.value) {
            poznEl.value = zUctu;
            puvodni = zUctu;
          }
        }).catch(function () {});
      }
      poznEl.value = global.PKPoznamky.text(d);
      var puvodni = poznEl.value;
      var cas = null;
      function rekni(t, chyba) {
        if (!stavEl) return;
        stavEl.textContent = t;
        stavEl.classList.toggle('chyba', !!chyba);
      }
      if (puvodni) rekni('uloženo');
      function ulozTed() {
        var t = poznEl.value;
        if (t === puvodni) return;
        var ok = global.PKPoznamky.uloz(d, t);
        puvodni = t;
        /* Prázdná poznámka se SMAŽE, a říká se to — „uloženo" u prázdného
           pole by znamenalo, že se někam uložilo prázdno. */
        rekni(ok ? (t.trim() ? 'uloženo' : 'smazáno')
          : 'nepovedlo se uložit — plná paměť prohlížeče', !ok);
      }
      /* Ukládá se po chvíli klidu, ne po každém písmenu: zápis do
         schránky je synchronní a při psaní by se do něj šlo třicetkrát
         za větu. A pak ještě při odchodu z pole a při opuštění stránky,
         ať se neztratí poslední věta. */
      poznEl.addEventListener('input', function () {
        rekni('…');
        clearTimeout(cas);
        cas = setTimeout(ulozTed, 600);
      });
      poznEl.addEventListener('blur', function () { clearTimeout(cas); ulozTed(); });
      window.addEventListener('pagehide', function () { clearTimeout(cas); ulozTed(); });
    }

    /* ---- souřadnice: kopírování a navigace ---- */
    var sourKop = document.getElementById('pz-sour-kop');
    if (sourKop) sourKop.addEventListener('click', function () {
      var txt = sourKop.getAttribute('data-sour') || '';
      function hotovo() { toast('Souřadnice zkopírovány'); }
      /* Záložní cesta pro prohlížeče bez schránky (a pro stránku
         otevřenou bez HTTPS, kde clipboard API mlčí): text se vybere,
         ať ho jde zkopírovat ručně. Nic nedělat by bylo nejhorší. */
      function rucne() {
        try {
          var r = document.createRange();
          r.selectNodeContents(document.getElementById('pz-sour-text'));
          var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(r);
          toast('Souřadnice označeny — zkopírujte je');
        } catch (e) { toast(txt); }
      }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(txt).then(hotovo).catch(rucne);
      } else { rucne(); }
    });
    var sourNav = document.getElementById('pz-sour-nav');
    if (sourNav) {
      /* KAŽDÝ TELEFON CHCE JINOU ADRESU. „geo:" otevře navigaci na
         Androidu, ale iPhone ji neumí a odkaz by prostě nic neudělal —
         to je horší než odkaz, který vede na mapu v prohlížeči. Proto
         se podle zařízení vybere: geo: na Androidu, maps.apple.com na
         iPhonu a Mapy.cz všude jinde (na počítači navigace nedává
         smysl, ale bod na mapě ano). */
      var ua = navigator.userAgent || '';
      /* Pět desetinných míst je asi metr — víc než dost na to, aby
         navigace našla pozemek, a hlavně bez toho, aby v odkazu svítilo
         15.014667000000031, což je jen zbytek po dvojkové aritmetice. */
      var la = d.lat.toFixed(5), ln = d.lng.toFixed(5);
      var cil;
      if (/Android/i.test(ua)) {
        cil = 'geo:' + la + ',' + ln + '?q=' + la + ',' + ln +
          '(' + encodeURIComponent(d.place || 'Pozemek') + ')';
      } else if (/iPhone|iPad|iPod/i.test(ua)) {
        cil = 'https://maps.apple.com/?ll=' + la + ',' + ln + '&q=' +
          encodeURIComponent(d.place || 'Pozemek');
      } else {
        cil = mapHref;
        sourNav.target = '_blank'; sourNav.rel = 'noopener nofollow';
      }
      sourNav.href = cil;
    }

    /* Zapiš, že se tenhle pozemek OTEVŘEL — výpis podle toho označí
       karty, které už člověk viděl. Až tady, po vykreslení: dokud
       nevíme, co se vykreslilo, není co značit. */
    try { if (global.PKVideno) global.PKVideno.oznac(d); } catch (e) {}
  }

  /* LIŠTA S CENOU A HLAVNÍ AKCÍ U SPODNÍHO OKRAJE TU BYLA A JE PRYČ.
     Na mobilu se po odrolování ceny přilepila ke spodnímu okraji kopie
     ceny a tlačítka „Inzerát". Vzniklo to z měření (stránka má 3 106 px,
     tedy 3,7 obrazovky, a hlavní tlačítka jsou až ve druhé polovině),
     jenže majitel webu to opakovaně odmítl: obojí už na stránce jednou
     je, lišta byla jejich kopie a na telefonu stála přes obsah.
     Je to tedy rozhodnutí, ne opomenutí — kdyby se to mělo vracet, ať
     se to vrací s jiným řešením než s pruhem přes obsah.
     S ní odešla i její zkouška (byla to jediná, co lištu měřila)
     a pravidlo, které kvůli ní zvedalo kolečko „Nahoru". */

  /* Adresa a indexování.
     Stránka detailu je jedna šablona pro všechny pozemky, rozlišená až
     parametrem ?p=. Kanonická adresa v HTML proto ukazuje na holou
     šablonu — jenže ta bez parametru vypíše „Pozemek nenalezen", takže
     vyhledávači se jako jediná nabízela prázdná stránka. Když pozemek
     najdeme, přepíšeme kanonickou adresu na tu jeho; když nenajdeme,
     řekneme vyhledávači, ať si tuhle stránku neukládá. */
  function nastavKanonickou(url) {
    var l = document.querySelector('link[rel="canonical"]');
    if (!l) { l = document.createElement('link'); l.setAttribute('rel', 'canonical'); document.head.appendChild(l); }
    l.setAttribute('href', url);
  }
  function neindexovat() {
    var m = document.querySelector('meta[name="robots"]');
    if (!m) { m = document.createElement('meta'); m.setAttribute('name', 'robots'); document.head.appendChild(m); }
    m.setAttribute('content', 'noindex,follow');
  }

  // I když pozemek nenajdeme, stránka musí mít hlavní nadpis. Bez něj neví,
  // kde je, ani čtečka pro nevidomé, ani vyhledávač — a je to přesně stav,
  // do kterého spadne každý starý odkaz na stažený inzerát.
  function renderEmpty() {
    /* STRÁNKA, KTERÁ UŽ OBSAH MÁ, SE NEPŘEPISUJE.
       Naměřeno v prohlížeči: 128 stránek ukončených nabídek hlásilo
       „Pozemek nenalezen". Generátor je přitom schválně nemaže a
       nechává na nich všechno, co o pozemku víme — cenu, výměru,
       parcelu, zdroj, tři podobné pozemky v okrese a pruh „Tato
       nabídka už není aktuální" i s datem. Důvod je v generátoru
       napsaný: smazaná stránka vrátí 404 a neřekne nic, a hlavní
       aktivum webu jsou zaindexované adresy.
       Jenže nabídka v datech logicky NENÍ (proto je stránka ukončená),
       tenhle skript ji nenašel a celý #pz-detail přepsal hláškou. Pro
       člověka to byla prázdná stránka, pro vyhledávač měkká
       čtyřistačtyřka — tedy přesně to, čemu se mělo předejít.
       Totéž platí, když se jen nepovede stáhnout řez dat: statická
       část je pořád lepší než hláška. Proto se tu nejdřív podíváme,
       jestli stránka něco má. */
    var hotovy = document.getElementById('pz-detail');
    if (hotovy && hotovy.querySelector('.pz-staticky')) return;
    document.title = 'Pozemek nenalezen — Parcelka';
    neindexovat();
    document.getElementById('pz-detail').innerHTML =
      '<div class="pz-empty"><h1>Pozemek nenalezen</h1>' +
      '<p>Tento pozemek se nepodařilo najít — možná už byl z nabídky stažen.</p>' +
      '<p><a href="index.html#mapa">Zpět na mapu a seznam pozemků</a></p></div>';
  }

  function kmBetween(la1, ln1, la2, ln2) {
    var R = 6371, r = Math.PI / 180;
    var dLat = (la2 - la1) * r, dLng = (ln2 - ln1) * r;
    var s = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(la1 * r) * Math.cos(la2 * r) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
  }

  /* ADRESA, NA KTEROU SE DÁ ODKÁZAT. Stažené nabídky mají vlastní
     vygenerovanou stránku (pozemek-<okres>-<obec>-<otisk>.html). Inzerát
     od majitele ŽÁDNOU NEMÁ: generátor staví stránky ze statických dat
     a živý inzerát v nich není. Sdílelo se přesto jméno takového souboru
     — tlačítkem „Sdílet" i kanonickou adresou v hlavičce — takže odkaz,
     který majitel pošle zájemci, vedl na nenalezenou stránku. */
  function vlastniAdresa(d) {
    if (d && d.type === 'majitel') {
      return d._lid
        ? 'pozemek.html?l=' + encodeURIComponent(d._lid)
        : 'pozemek.html?p=' + encodeURIComponent(pkeyPlny(d)) + '&ll=' + d.lat + ',' + d.lng;
    }
    return souborPozemku(d);
  }

  function findTarget(DATA) {
    var qs = location.search;
    /* Inzerát od majitele se hledá podle SVÉHO ID, ne podle klíče
       složeného z místa a parcely: to je jediný údaj, který se nezmění,
       když majitel opraví cenu nebo název obce. Klíč „?p=" zůstává —
       odkazy rozeslané dřív ho nesou — ale ID má přednost. */
    var mid = /[?&]l=([^&]+)/.exec(qs);
    if (mid) {
      var lid = null;
      try { lid = decodeURIComponent(mid[1]); } catch (e) {}
      if (lid) {
        var podle = DATA.filter(function (d) { return d._lid === lid; });
        if (podle.length) return { d: podle[0], presne: true };
      }
    }
    var mp = /[?&]p=([^&]+)/.exec(qs);
    var ml = /[?&]ll=([^&]+)/.exec(qs);
    var key = null, ll = null;
    if (mp) { try { key = decodeURIComponent(mp[1]); } catch (e) {} }
    /* Vlastní stránka pozemku (pozemek-<okres>-<obec>-<otisk>.html) si klíč
       nenese v adrese — předá ho rovnou. Adresa má přednost, aby starší
       rozeslané odkazy „?p=…" fungovaly i tehdy, kdyby se na takové
       stránce otevřely. */
    /* Výměra (a cena) jako ROZLIŠOVAČ. Klíč sám nestačí: když parcelní
       číslo v datech chybí a dvě nabídky v téže obci padnou po
       zaokrouhlení na stejné souřadnice, mají klíč shodný, ačkoli jde
       o různé pozemky. Naměřeno na 1 966 nabídkách: 32 takových skupin,
       v 21 se liší cenou nebo výměrou. Bez rozlišovače se brala prostě
       první, takže odkaz na tu druhou ukázal cizí cenu i výměru. */
    var vym = null, cen = null;
    var mv = /[?&]v=(\d+)/.exec(qs);
    if (mv) vym = parseInt(mv[1], 10);
    var mc = /[?&]c=(\d+)/.exec(qs);
    if (mc) cen = parseInt(mc[1], 10);
    if (key == null && window.PK_POZEMEK && window.PK_POZEMEK.k) {
      key = window.PK_POZEMEK.k;
      var lp = window.PK_POZEMEK.ll;
      if (!ml && lp && isFinite(lp[0])) ll = [lp[0], lp[1]];
      if (vym == null && isFinite(window.PK_POZEMEK.v)) vym = window.PK_POZEMEK.v;
      if (cen == null && isFinite(window.PK_POZEMEK.c)) cen = window.PK_POZEMEK.c;
    }
    if (ml) { try { var parts = decodeURIComponent(ml[1]).split(','); ll = [parseFloat(parts[0]), parseFloat(parts[1])]; } catch (e) {} }

    /* Klíč z adresy (?p=) i ten, který do stránky vepsal generátor
       (PK_POZEMEK.k), jsou POLNÍ klíče SE SOUŘADNICEMI — obojí je skládá
       pkeyPlny() / stejný výpočet v js/main.js. Porovnávalo se to tu
       s krátkým pkey(), takže shoda nikdy nenastala a pozemek se hledal
       až náhradní cestou „nejbližší bod do 500 m". Fungovalo to, ale
       zbytečně: se správným klíčem sedne 1 910 z 1 931 pozemků přesně
       a jen u 21 (shodná obec, parcela, okres i souřadnice) rozhoduje
       vzdálenost — a těm generátor stejně dělá jednu společnou stránku. */
    /* Nejdřív PŘESNĚ podle úplného klíče, a jen když nic, tak podle
       zkráceného (bez souřadnic). Starší nebo ručně upravené odkazy
       mohou nést kratší podobu a nemá smysl je odmítnout: u zkrácené
       podoby padne víc pozemků na jeden klíč, ale právě pro ten případ
       je pod tím rozhodování podle souřadnic. Odkazy, které web vyrábí
       sám, obsahují úplný klíč a sednou hned první cestou. */
    var cand = key != null ? DATA.filter(function (d) { return pkeyPlny(d) === key; }) : [];
    if (key != null && !cand.length) {
      cand = DATA.filter(function (d) {
        return [d.place || '', d.parcel || '', d.okres || ''].join('|') === key;
      });
    }
    /* Vrací se i TO, JAK se pozemek našel. Nález podle klíče je jistota,
       nález „nejbližší bod do 500 m" je jen odhad pro odkaz, jehož klíč
       se mírně změnil — a u inzerátu od majitele (ten ve statických
       datech není vůbec) je to skoro vždy CIZÍ pozemek: jiná cena, jiná
       výměra, jiné místo. Volající to musí umět rozlišit. */
    if (cand.length === 1) return { d: cand[0], presne: true };
    /* Víc nálezů na jeden klíč → rozhodne výměra, a při shodě i cena.
       Vzdálenost od souřadnic (o řádek níž) tu nepomůže: souřadnice mají
       ty pozemky po zaokrouhlení stejné, právě proto se klíč shoduje. */
    if (cand.length > 1 && vym != null) {
      var podleVymery = cand.filter(function (d) { return Math.round(d.area || 0) === Math.round(vym); });
      if (podleVymery.length > 1 && cen != null) {
        var presneji = podleVymery.filter(function (d) { return Math.round(d.price || 0) === Math.round(cen); });
        if (presneji.length) podleVymery = presneji;
      }
      if (podleVymery.length) return { d: podleVymery[0], presne: true };
    }
    if (cand.length > 1 && ll && isFinite(ll[0])) {
      cand.sort(function (a, b) { return kmBetween(ll[0], ll[1], a.lat, a.lng) - kmBetween(ll[0], ll[1], b.lat, b.lng); });
      return { d: cand[0], presne: true };
    }
    if (cand.length > 1) return { d: cand[0], presne: true };
    // žádná shoda podle klíče — zkus nejbližší podle souřadnic (klíč se mohl mírně změnit)
    if (ll && isFinite(ll[0])) {
      var best = null, bestD = Infinity;
      DATA.forEach(function (d) { var dd = kmBetween(ll[0], ll[1], d.lat, d.lng); if (dd < bestD) { bestD = dd; best = d; } });
      if (best && bestD < 0.5) return { d: best, presne: false };
    }
    return null;
  }

  function loadJSON(url) {
    return fetch(url, { cache: 'no-cache' }).then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }

  /* DVĚ VĚCI, KTERÉ SE MĚLY DÍT PŘI PROHLÍŽENÍ POZEMKU — a neděly se
     ani jedna, protože obě visely na jednom místě, kam se nedalo dojít.
     Mapa měla kdysi vlastní panel s detailem (showDetail v js/main.js).
     Ten panel si zapisoval „Naposledy prohlédnuté" a u inzerátů od
     majitelů počítal zhlédnutí. Jenže klepnutí na pozemek dnes vede na
     tuhle stránku a showDetail zůstal jediný volaný odkud? Z pruhu
     „Naposledy prohlédnuté". Do toho pruhu se ale dostane jen to, co
     showDetail zapsal — kruh, do kterého se nedá vstoupit. Výsledek:
     pruh se nikdy neukázal a počítadlo zhlédnutí stálo na nule, zatímco
     profil slibuje „Zhlédnutí celkem".
     Zapisuje se to proto tam, kde se pozemek OPRAVDU prohlíží. */
  var KLIC_NAPOSLEDY = 'pk_recent_v1';
  function zapisNaposledy(d) {
    if (!d || !d.place) return;
    /* Týž klíč jako pkey() v js/main.js — pruh na úvodní stránce podle
       něj hledá pozemek v datech. Kdyby se ty dva výpočty rozešly, pruh
       by zůstal prázdný a nikde by to nekřiklo. */
    var k = pkeyPlny(d);
    var arr = [];
    try { arr = JSON.parse(localStorage.getItem(KLIC_NAPOSLEDY) || '[]') || []; } catch (e) {}
    if (!Array.isArray(arr)) arr = [];
    arr = arr.filter(function (x) { return x !== k; });
    arr.unshift(k);
    try { localStorage.setItem(KLIC_NAPOSLEDY, JSON.stringify(arr.slice(0, 8))); } catch (e) {}
  }
  /* Zhlédnutí jen u inzerátů od majitelů (u stažených nabídek nemáme co
     počítat) a jen jednou za návštěvu webu, ať se číslo nenafukuje
     obnovením stránky. Volá se anonymně — bump_view je v databázi
     povolená i nepřihlášeným, protože zhlédnutí dělají hlavně oni. */
  var KLIC_ZHLEDNUTI = 'pk_videno_v1';
  function zapocitejZhlednuti(d) {
    if (!d || d.type !== 'majitel' || !d._lid) return;
    /* POČKAT NA PKAuth. Tenhle skript je v pozemek.html obyčejný, kdežto
       js/config.js a js/auth.js mají defer — v okamžiku okamžitého
       vykreslení z handoffu tedy global.PKAuth JEŠTĚ NEEXISTUJE. První
       verze se v tu chvíli jen tiše vrátila, a protože inzerát od majitele
       ve statických datech není, druhé vykreslení už nepřišlo: zhlédnutí
       se nezapočítalo NIKDY. Skripty s defer se spustí před
       DOMContentLoaded, takže jedna ta událost stačí — žádné vyčkávání
       v cyklu. */
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { posliZhlednuti(d); }, { once: true });
    } else {
      posliZhlednuti(d);
    }
  }
  function posliZhlednuti(d) {
    if (!(global.PKAuth && global.PKAuth.ready && global.PKAuth.rpc)) return;
    var videne = {};
    try { videne = JSON.parse(sessionStorage.getItem(KLIC_ZHLEDNUTI) || '{}') || {}; } catch (e) {}
    if (videne[d._lid]) return;
    /* Zapsat AŽ TĚSNĚ PŘED odesláním. Kdyby se to značilo dřív a odeslání
       pak neproběhlo, zhlédnutí by po celou návštěvu propadalo. */
    videne[d._lid] = 1;
    try { sessionStorage.setItem(KLIC_ZHLEDNUTI, JSON.stringify(videne)); } catch (e) {}
    try { global.PKAuth.rpc('bump_view', { p_id: d._lid }, false); } catch (e) {}
  }

  function fillVerdict(d) {
    var el = document.getElementById('pz-verdict');
    if (el) el.innerHTML = pzVerdictHtml(d);
  }

  // 1) OKAMŽITĚ vykresli z předaného pozemku (sessionStorage) — bez čekání na data.
  var quick = null;
  /* I předaný pozemek projde brankou. Zapsala ho sice mapa, která čistí taky,
     ale v úložišti prohlížeče leží mezitím kdokoli mohl sáhnout — a hlavně
     tady nemá být místo, kde se na cizí čištění spoléhá. */
  try { quick = PKCisteni.pozemek(JSON.parse(sessionStorage.getItem('pk_open') || 'null')); } catch (e) {}
  // předaný pozemek použij jen když sedí na adresu (?p=), ať se neukáže špatný
  var mp = /[?&]p=([^&]+)/.exec(location.search);
  var wantKey = null; if (mp) { try { wantKey = decodeURIComponent(mp[1]); } catch (e) {} }
  var rendered = false;
  /* Tady totéž: ?p= nese klíč se souřadnicemi, takže se s krátkým pkey()
     nikdy nesrovnal a okamžité vykreslení z sessionStorage se PŘESKAKOVALO
     vždy, když se na stránku přišlo přes ?p=. Stránka pak čekala na data,
     přestože je měla po ruce. */
  function sediNaAdresu(d, chtenyKlic) {
    if (chtenyKlic == null) return true;
    return pkeyPlny(d) === chtenyKlic
      || [d.place || '', d.parcel || '', d.okres || ''].join('|') === chtenyKlic;
  }
  if (quick && quick.place && sediNaAdresu(quick, wantKey)) {
    quick._id = 0;
    render(quick);
    rendered = true;
  }

  /* ŽIVÉ INZERÁTY OD MAJITELŮ. Statická data (data/opportunities.json)
     je NEOBSAHUJÍ — leží v databázi a mapa si je tahá zvlášť
     (public_listings v js/main.js). Tahle stránka je nečetla, takže
     inzerát od majitele se otevřel JEN klepnutím na mapě, kde se pozemek
     předá přes sessionStorage. Po obnovení stránky, ze záložky nebo
     z odkazu, který majitel poslal zájemci, se místo něj ukázal nejbližší
     STAŽENÝ pozemek do 500 m (cizí cena, cizí výměra), nebo „Pozemek
     nenalezen" — a na sdílení toho odkazu je celý inzerát postavený.

     Čeká se na PKAuth: js/config.js i js/auth.js mají v pozemek.html
     defer, tenhle skript ne. */
  var pozdeji = null, cekajici = null;
  function ziveInzeraty() {
    return new Promise(function (hotovo) {
      var poslano = false;
      function dej(v) {
        if (poslano) {
          // Pozdní odpověď. Když se ještě nestihlo nastavit, co s ní, počká si.
          if (v && v.length) { if (pozdeji) pozdeji(v); else cekajici = v; }
          return;
        }
        poslano = true;
        hotovo(v);
      }
      /* LHŮTA. Bez ní by na pomalé nebo spadlé databázi čekala i stránka
         obyčejné stažené nabídky — a těch je většina, přes devatenáct set.
         Odpověď, která přijde pozdě, se ale nezahazuje: stránka se z ní
         překreslí. */
      var cas = setTimeout(function () { dej([]); }, 2500);
      function zkus() {
        var A = global.PKAuth;
        if (!(A && A.ready && A.rpc)) { clearTimeout(cas); return dej([]); }
        A.rpc('public_listings', {}, false).then(function (res) {
          clearTimeout(cas);
          dej(res && res.ok && Array.isArray(res.data) ? PKCisteni.majitele(res.data) : []);
        }, function () { clearTimeout(cas); dej([]); });
      }
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', zkus, { once: true });
      else zkus();
    });
  }

  // 2) Dotáhni celá data pro cenové srovnání (a jako záloha, když handoff chybí).
  function zpracuj(j, zive, jenPresne, radkyModelu) {
    /* Táž branka jako na mapě (js/cisteni.js). Tady chyběla, a nebylo to
       jen pro pořádek: adresa inzerátu se sice escapovala, takže atribut
       nešlo rozbít, ale „javascript:" v ní zůstalo — na podstrčených datech
       tu vznikl odkaz, který po klepnutí spustí cizí kód. Texty vycházely
       dobře díky esc() na každém místě výpisu; u href esc() nepomůže,
       protože schéma odkazu je platný obsah atributu. */
    var DATA = PKCisteni.pozemky((j && (j.opportunities || j.items || (Array.isArray(j) ? j : []))) || []);
    /* Do TÝCHŽ dat, ze kterých se počítá cenové srovnání i „podobné
       pozemky" — přesně jako na mapě (js/main.js je přidává do base před
       PKCisteni.pozemky). Kdyby je stránka pozemku držela stranou, obě
       strany by u téhož pozemku tvrdily jinou cenovou hladinu. */
    if (zive && zive.length) DATA = DATA.concat(zive);
    DATA.forEach(function (d, i) { d._id = i; });
    /* CENOVÝ MODEL SE STAVÍ Z TÉŽE HROMÁDKY JAKO NA MAPĚ — tedy BEZ
       DUPLICIT. Mapa odstraňuje duplicity hned na začátku boot()
       (js/main.js: odstranDuplicity) a model staví až z toho, co zbude;
       generátor okresních a krajských stránek taky (PKH.bezDuplicit).
       Stránka pozemku to nedělala, takže model stavěla z 2 018 nabídek
       místo 1 995 — a tentýž pozemek pak dostal na mapě a na své vlastní
       stránce JINÝ verdikt.

       Naměřeno na ostrých datech: ze 1 995 nabídek by se percentil
       rozešel u 315 (16 %) a odhad u 405 (20 %). Nejsou to zaokrouhlovací
       rozdíly: u Valašské Senice mapa říkala „3. percentil, vzorek 30,
       kraj Zlínský" a stránka „10. percentil, vzorek 10, okres Vsetín" —
       jiné číslo, jiný vzorek, jiná úroveň srovnání. Stačí, aby odebraná
       duplicita srazila okresní vzorek pod deset, a srovnání přeskočí
       o celou úroveň výš.

       Duplicitu určuje js/hlidani-logika.js, ne vlastní pravidlo: právě
       proto, že se to musí počítat stejně na všech stranách. Pro hledání
       pozemku na téhle stránce (findTarget) se používá pole PŘED
       odstraněním — kdo přijde s odkazem na tu podruhé vypsanou nabídku,
       má svou stránku dostat, ne „Pozemek nenalezen". */
    var PROMODEL = DATA;
    if (radkyModelu) {
      /* Model z malého souboru (data/model.json). Duplicity v něm už
         nejsou — odstranil je generátor řezů týmž pravidlem jako mapa —
         takže se tu nic dalšího nedělá. Že z toho vyjde znak za znakem
         totéž co z plných dat, měří scripts/test-model-vstup.mjs. */
      PROMODEL = radkyModelu;
    } else if (window.PKHlidani && window.PKHlidani.bezDuplicit) {
      PROMODEL = window.PKHlidani.bezDuplicit(DATA);
    } else {
      /* NAHLAS. Tiché ustoupení na DATA by znamenalo jiný verdikt než na
         mapě, a nikde by to nebylo vidět. V stránce pozemku stojí
         js/hlidani-logika.js jako obyčejný skript PŘED tímhle, takže se
         to stát nemá; kdyby se to pořadí rozešlo, chytí to
         scripts/test-konzole.mjs („stránka neshodila chybu"). */
      console.error('js/pozemek.js: chybí PKHlidani.bezDuplicit — cenový model by se '
        + 'rozešel s mapou (model z ' + DATA.length + ' nabídek včetně duplicit)');
    }
    buildIndex(PROMODEL);
    /* PŘEKRESLIT, i když už se něco vykreslilo — ale jen podle PŘESNÉHO
       nálezu. Vykreslení z handoffu je zkratka, aby stránka nebyla chvíli
       prázdná; plná data ze souboru jsou to pravé, a dřív se druhé
       vykreslení přeskakovalo vždy. Kdo na pozemek klepl na mapě, tím
       neviděl sekci „Sítě a vybavení" ani řádek „Vlastnictví:
       spoluvlastnický podíl" — a stačilo stránku znovu načíst, aby se
       objevily.
       Nález „nejbližší do 500 m" ale handoff přepsat NESMÍ: inzerát od
       majitele ve statických datech není, takže by se stránka převlékla
       do cizího pozemku. Tenhle cizí nález se dosud aspoň nevykresloval,
       jenže počítal se z něj cenový verdikt — na inzerátu od majitele
       tedy mohla stát věta o ceně sousedního pozemku. */
    /* HLEDÁ SE V TÉMŽE SEZNAMU, JAKÝ UKAZUJE VÝPIS — tedy BEZ DUPLICIT.
       Odstranění duplicit nejen zahazuje, ono i SKLÁDÁ: u dražby, kterou
       hlásí dva zdroje, se k té s celou výměrou přebere parcelní číslo
       z té druhé (js/hlidani-logika.js, lepsiZeDvou). Vznikne tím záznam,
       jaký v datech samostatně NENÍ — a právě ten je na kartě ve výpisu.
       Naměřeno na ostrých datech: 20 karet z 1 955 má klíč, který se
       v syrových datech nevyskytuje.
       Stránka pozemku přitom hledala v syrových datech, takže u těch
       dvaceti přesná shoda nikdy nenastala a padalo se na náhradní
       „nejbližší bod do 500 m" — a to je v obci s víc dražbami CIZÍ
       pozemek. Změřeno na kartě Rohatce: karta 1 043 887 Kč, stránka
       2 795 918 Kč. Tím se rozešel i klíč pozemku, takže poznámka
       napsaná na stránce se ukládala pod klíč, který na kartě nikdo
       nehledá — a odznak „Poznámka" se ve výpisu neukázal. Přesně na to
       si člověk, který web používá, stěžoval.
       Syrové záznamy zůstávají v seznamu ZA nimi: kdo přijde se starším
       odkazem na tu podruhé vypsanou nabídku, má svou stránku dostat,
       ne „Pozemek nenalezen". */
    var hledaci = DATA;
    if (window.PKHlidani && window.PKHlidani.bezDuplicit) {
      var bez = window.PKHlidani.bezDuplicit(DATA);
      /* Značka místo hledání v poli: porovnávat 2 012 × 1 955 záznamů
         kus po kuse by na telefonu stálo zbytečný čas. */
      bez.forEach(function (d) { try { d.__vbez = true; } catch (e) {} });
      hledaci = bez.concat(DATA.filter(function (d) { return !d.__vbez; }));
      bez.forEach(function (d) { try { delete d.__vbez; } catch (e) {} });
    }
    var nalez = findTarget(hledaci);
    /* PRVNÍ KOLO JEN NA PŘESNÝ NÁLEZ. Živé inzeráty od majitelů leží
       v databázi a čekat na její odpověď u všech stažených nabídek by
       znamenalo držet stránku na statické kostře kvůli něčemu, co se jich
       vůbec netýká. Sedí-li pozemek ve statických datech přesně, je hotovo
       hned; nesedí-li, teprve pak má smysl na databázi počkat — a to je
       právě případ inzerátu od majitele. */
    if (jenPresne && !(nalez && nalez.presne)) return false;
    var target = quick;
    if (nalez && (nalez.presne || !rendered)) target = nalez.d;
    if (target) {
      if (!rendered || target !== quick) render(target);
      fillVerdict(target);   // cenový verdikt teď máme z čeho spočítat
      // Až PO vykreslení — dřív ten odstavec na stránce ještě není.
      try { ukazCasDat(j && j.updated); } catch (e) {}
    } else if (!rendered) {
      renderEmpty();
    }
    return !!(nalez && nalez.presne);
  }
  // Obojí se pouští naráz, ať se nečeká jedno na druhé.
  var zivePrislib = ziveInzeraty();

  /* DVA MALÉ SOUBORY MÍSTO JEDNOHO VELKÉHO.
     Stránka pozemku si dřív brala celá data (638 kB, 56,5 kB přes drát),
     přestože z nich potřebuje dvě věci: SEBE a CELOSTÁTNÍ CENOVÝ MODEL.
     Sebe má v řezu svého okresu (8,6 kB průměrně, 1,6 kB přes drát),
     model v data/model.json (38,7 kB, 11,5 kB přes drát) — a ten je pro
     všechny stránky týž, takže se po první stránce bere z cache.
     Dohromady tedy asi 13 kB místo 56,5 kB a surově 42 kB místo 638 kB.

     ŽE Z TOHO VYJDE TOTÉŽ, NENÍ ÚVAHA: scripts/test-model-vstup.mjs staví
     model z plných dat i z malého souboru a porovnává všech 13 965 volání
     na všech nabídkách. Zkratka, která dá jiné číslo, by znamenala přesně
     tu vadu, kterou už jednou stálo 310 stránek — jiný verdikt na mapě
     a na stránce pozemku (scripts/test-shoda.mjs).

     Kdyby některý z těch dvou souborů nedojel, sáhne se po plných datech.
     Totéž když přijde živý inzerát od majitele: ten musí do modelu
     stejně jako na mapě, ale duplicitu mezi ním a stahovanou nabídkou
     rozhodne jen pravidlo, které zná obec — a tu malý vstup nenese.
     Přidat ji by stálo 11,4 → 19,0 kB přes drát kvůli případu, který
     dnes nenastává (v data/user-listings.json je nula inzerátů), takže
     se v tom případě radši dotáhne celek. */
  function plnaData() {
    loadJSON('data/opportunities.json').then(function (j) {
      var sedlo = zpracuj(j, [], true);
      zivePrislib.then(function (zive) {
        if (!sedlo || zive.length) zpracuj(j, zive, false);
        // Živá data po lhůtě: zpracuje se totéž ještě jednou, už s nimi.
        pozdeji = function (z) { zpracuj(j, z, false); };
        if (cekajici) { var z = cekajici; cekajici = null; pozdeji(z); }
      });
    });
  }

  var REZ = (window.PK_POZEMEK && window.PK_POZEMEK.r) || null;
  if (!REZ) {
    /* Šablona pozemek.html s ?p= (inzerát od majitele) řez nemá: neví se
       dopředu, o který pozemek jde. Tam zůstává dnešní cesta. */
    plnaData();
  } else {
    Promise.all([loadJSON(REZ), loadJSON('data/model.json')]).then(function (r) {
      var jRez = r[0];
      var radky = (r[1] && window.PK_CENY && window.PK_CENY.rozbalModel)
        ? window.PK_CENY.rozbalModel(r[1]) : null;
      if (!jRez || !radky) { plnaData(); return; }
      var sedlo = zpracuj(jRez, [], true, radky);
      zivePrislib.then(function (zive) {
        if (zive && zive.length) { plnaData(); return; }
        if (!sedlo) zpracuj(jRez, [], false, radky);
        pozdeji = function (z) {
          if (z && z.length) plnaData();
          else zpracuj(jRez, [], false, radky);
        };
        if (cekajici) { var z = cekajici; cekajici = null; pozdeji(z); }
      });
    });
  }

  // mobilní menu
  /* Mobilní menu má vlastní modul — js/menu.js. Tenhle kód tu byl
     ve své nejlepší podobě (se zavřením Escapem i klepnutím mimo), ale
     byl jen jedním ze čtrnácti výskytů v jedenácti různých podobách,
     a nejrozšířenější z nich (js/pozemek.js, 1 999 stránek) neumělo
     ani to Escape. Teď je to na jednom místě; hlídá scripts/test-menu.mjs. */
})(window);
