/* Rádce u konkrétního pozemku — „Co byste měli vědět".
 *
 * Jedno místo pro mapu (js/main.js) i stránku pozemku (js/pozemek.js).
 * Do téhle chvíle měl každý soubor vlastní kopii a stačila by jedna změna,
 * aby si obě půlky webu u téhož pozemku protiřečily. Přesně to se stalo
 * u cenového srovnání (viz js/ceny.js) a nechci to zopakovat.
 *
 * Co rádce dělá: z údajů, které o pozemku VÍME — druh, výměra, cena za m²,
 * kategorie, termín dražby — poskládá konkrétní rady. Nic se nevymýšlí
 * a nic se neodhaduje mimo to, co je v datech.
 *
 * Co rádce NENÍ: právní rada ke konkrétní parcele. Pravidla jsou obecná
 * a u každé parcely můžou platit výjimky, proto pod tím vždycky stojí
 * výzva ověřit si to na úřadě a v katastru.
 *
 * Používá se přes globální PK_RADCE (žádné moduly — web je prosté skripty).
 */
(function (root) {
  'use strict';

  function maVymeru(d) { return typeof d.area === 'number' && d.area > 0; }

  /* --- Dá se tu stavět? Podle druhu pozemku ------------------------- */
  function stavba(g) {
    switch (g) {
      case 'Stavební / zastavěná':
        return { lvl: 'ok', txt: 'Územním plánem <b>určeno k zástavbě</b>. Ověřte si na stavebním úřadě, co a jak velké se tu smí postavit — a jestli jsou v dosahu <b>sítě a příjezd</b>. Samotný zápis v katastru o tom nic neříká.' };
      case 'Orná půda':
        return { lvl: 'warn', txt: '<b>Zemědělská půda.</b> Pro stavbu je nutná změna územního plánu a <b>vynětí ze zemědělského půdního fondu</b>, za které se platí odvod. Bývá to zdlouhavé a není na to nárok.' };
      case 'Louka / travní porost':
        return { lvl: 'warn', txt: '<b>Zemědělská půda</b> (travní porost). Ke stavbě je potřeba změna územního plánu a vynětí ze ZPF. Bývá na ni <b>pacht</b> — zjistěte si, jestli je pozemek pronajatý a na jak dlouho.' };
      case 'Zahrada':
        return { lvl: 'mid', txt: 'Zahrada bývá v zastavěném území, ale <b>ne vždy je stavební</b>. Ověřte si územní plán obce. U zahrad se taky častěji stává, že <b>nemají vlastní přístup z veřejné cesty</b>.' };
      case 'Lesní pozemek':
        return { lvl: 'warn', txt: '<b>Lesní pozemek</b> pod ochranou lesního zákona — výstavba je prakticky vyloučená a s lesem je spojená <b>povinnost hospodařit</b>. Rozdělení lesního pozemku pod jeden hektar navíc vyžaduje souhlas úřadu.' };
      case 'Vinice / sad':
        return { lvl: 'warn', txt: 'Zemědělská kultura (vinice nebo sad). Ke stavbě je potřeba změna využití a vynětí ze ZPF.' };
      default:
        return { lvl: 'mid', txt: 'Ověřte v <b>územním plánu</b> obce, jak se pozemek smí využívat a zda se na něm dá stavět.' };
    }
  }

  /* --- Na co pozor podle kategorie --------------------------------- */
  function pozor(d) {
    switch (d.type) {
      case 'drazba':
        return 'Řiďte se <b>dražební vyhláškou</b>: je v ní termín, vyvolávací cena i <b>dražební jistota</b>, kterou je nutné složit předem. Financování a prohlídku si zajistěte dřív — u dražby se <b>neuplatňují práva z vadného plnění</b> jako u běžného prodeje.';
      case 'exekuce':
        return 'Pozemek je v exekuci nebo insolvenci, <b>zatím tedy není na prodej</b>. Je to signál, že se do dražby dostat může — aktuální stav ověřte v insolvenčním rejstříku nebo u exekutora.';
      case 'obec':
        return 'Obec zveřejňuje záměr na <b>úřední desce</b> a nabídku je potřeba podat <b>ve stanovené lhůtě</b>. O prodeji rozhoduje zastupitelstvo, takže to nebývá hned.';
      case 'majitel':
        return 'Jednáte <b>přímo s vlastníkem</b>. Ověřte si vlastnictví a případná omezení (zástavy, věcná břemena) na listu vlastnictví.';
      default:
        return 'Před koupí ověřte <b>přístup k pozemku</b>, dostupnost sítí a zápis v katastru. U nabídek státního pozemkového úřadu mívají přednost dosavadní pachtýři — podmínky vždy uvádí konkrétní nabídka.';
    }
  }

  /* --- Co znamená výměra ------------------------------------------- */
  function vymera(d) {
    if (!maVymeru(d)) return null;
    var a = d.area;
    if (a < 300) {
      return { lvl: 'mid', txt: 'Necelých <b>' + a + ' m²</b> je na samostatné využití málo. Takhle malé parcely se nejčastěji hodí k <b>rozšíření sousedního pozemku</b> — nebo jde o podíl či zbytkový díl po dělení.' };
    }
    if (a > 50000) {
      return { lvl: 'mid', txt: 'Přes <b>pět hektarů</b>. Počítejte s <b>daní z nemovitých věcí</b> každý rok a s tím, že taková plocha sama neleží ladem — obvykle se <b>propachtuje</b> zemědělci. Zjistěte si, jestli na ní pacht už neběží a do kdy.' };
    }
    if (a > 10000) {
      return { lvl: 'mid', txt: 'Přes <b>hektar</b> půdy. U takové výměry se vyplatí zjistit, jestli na pozemku <b>neběží pacht</b> — nájem zemědělské půdy se ukončuje s výpovědní dobou, ne ze dne na den.' };
    }
    return null;
  }

  /* --- Co znamená cena. Bere se ze společného cenového modelu, aby
         rádce a cenový verdikt nikdy neříkaly každý něco jiného. ------ */
  function cena(d, model) {
    if (!model || !maVymeru(d) || !d.price) return null;
    if (model.neduveryhodna(d)) {
      return { lvl: 'warn', txt: 'Cena za m² je <b>hluboko pod</b> obvyklou u tohoto druhu pozemku v okolí. To bývá nejčastěji <b>spoluvlastnický podíl</b> (kupujete jen část, ne celou parcelu), pozemek <b>bez přístupu z veřejné cesty</b>, zatížený <b>věcným břemenem</b> — nebo je to chyba v inzerátu. Ověřte si to dřív, než cokoli podepíšete.' };
    }
    var o = model.odhad(d);
    if (o && o.podleVelikosti) {
      var kde = window.PK_CENY.kdeText(o.uroven, o.kde);
      /* Sleva přes hranici uvěřitelnosti není příležitost. Rádce to musí
         říct dřív, než si to člověk přečte jako trhák — a hlavně musí říct
         totéž, co odznak na kartě. */
      if (o.pochybna) {
        return { lvl: 'warn', txt: 'Cena je <b>o ' + o.podOdhadem + ' % pod</b> obvyklou cenou podobně velkých pozemků téhož druhu ' + kde +
          '. Takový rozdíl už nebývá sleva: nejčastěji je v inzerátu výměra <b>celé parcely</b>, ale prodává se jen <b>spoluvlastnický podíl</b>, ' +
          'nebo jde o dražbu s jinou výměrou, případně o chybu v ceně. <b>Ověřte si to na listu vlastnictví</b>, než něco podepíšete.' };
      }
      if (o.podOdhadem >= 25) {
        return { lvl: 'ok', txt: 'Cena je <b>o ' + o.podOdhadem + ' % pod</b> obvyklou cenou podobně velkých pozemků téhož druhu ' + kde + '. Může to být příležitost — ale stejně tak důvod ptát se <b>proč</b>: přístup, břemena, tvar parcely.' };
      }
    }
    return null;
  }

  /* --- Kolik zbývá do dražby --------------------------------------- */
  function dnyDo(text) {
    var m = /(\d{4})-(\d{2})-(\d{2})/.exec(text || '');
    if (!m) return null;
    var cil = new Date(+m[1], +m[2] - 1, +m[3]); cil.setHours(0, 0, 0, 0);
    var dnes = new Date(); dnes.setHours(0, 0, 0, 0);
    return Math.round((cil - dnes) / 86400000);
  }
  function termin(d) {
    if (d.type !== 'drazba' && d.type !== 'exekuce') return null;
    var n = dnyDo(d.extra);
    if (n == null) return null;
    if (n < 0) {
      // Prošlý termín se nesmí vydávat za budoucí („zbývá −40 dní"), ale
      // ani zamlčet: kdo na takovou dražbu narazí, potřebuje vědět, že už
      // je po ní, ne aby si myslel, že stihne přihodit.
      return { lvl: 'warn', txt: '<b>Termín dražby už minul</b> (' + (-n) + ' dní zpátky). Záznam tu zůstává kvůli historii — u dražebníka si ověřte, jestli se vydražilo, nebo bude další kolo.' };
    }
    if (n <= 7) {
      var kdy = n === 0 ? 'Dražba je dnes' : (n === 1 ? 'Dražba je zítra' : 'Do dražby zbývá ' + n + ' dní');
      return { lvl: 'warn', txt: '<b>' + kdy + '.</b> Na prohlídku, ověření v katastru a složení dražební jistoty už je <b>málo času</b> — jistota musí být připsaná před zahájením, ne v den dražby.' };
    }
    if (n <= 30) {
      return { lvl: 'mid', txt: 'Do dražby zbývá <b>' + n + ' dní</b>. To akorát stačí na prohlídku, výpis z katastru a zajištění peněz — začněte tím, ne až týden předem.' };
    }
    return null;
  }

  /* --- Tři otázky, které stojí za to položit -------------------------
     Konkrétní věta, se kterou se dá zvednout telefon, je užitečnější než
     odstavec teorie. Otázky se skládají podle druhu, kategorie a toho,
     co na pozemku vyšlo divně. */
  function otazky(d, model) {
    var g = (root.PK_CENY && root.PK_CENY.druhGroup) ? root.PK_CENY.druhGroup(d.druh) : '';
    var out = [];
    if (model && maVymeru(d) && d.price && model.neduveryhodna(d)) {
      out.push('Prodáváte celou parcelu, nebo jen spoluvlastnický podíl? Jak velký?');
    }
    out.push('Má pozemek přístup z veřejné komunikace, nebo jen přes cizí pozemek?');
    if (g === 'Orná půda' || g === 'Louka / travní porost' || g === 'Vinice / sad') {
      out.push('Je půda propachtovaná? Komu a do kdy nájem běží?');
    } else if (g === 'Stavební / zastavěná') {
      out.push('Jak daleko jsou přípojky — elektřina, voda, kanalizace — a je na ně kapacita?');
    } else if (g === 'Lesní pozemek') {
      out.push('Je na les zpracovaný lesní hospodářský plán a jaké povinnosti z něj plynou?');
    } else {
      out.push('Je pozemek v územním plánu vedený jako zastavitelný?');
    }
    if (d.type === 'drazba') {
      out.push('Kolik činí dražební jistota, do kdy musí být připsaná a je možná prohlídka?');
    } else if (d.type === 'exekuce') {
      out.push('V jaké fázi řízení pozemek je a kdy se dá čekat dražební vyhláška?');
    } else if (d.type === 'obec') {
      out.push('Dokdy se podávají nabídky a podle čeho bude zastupitelstvo vybírat?');
    } else {
      out.push('Váznou na pozemku věcná břemena, zástavy nebo jiná omezení?');
    }
    return out.slice(0, 3);
  }

  /* --- Poskládání ---------------------------------------------------- */
  function rady(d, model) {
    var g = (root.PK_CENY && root.PK_CENY.druhGroup) ? root.PK_CENY.druhGroup(d.druh) : '';
    var radky = [];
    radky.push(Object.assign({ klic: 'Dá se tu stavět?' }, stavba(g)));
    var t = termin(d); if (t) radky.push(Object.assign({ klic: 'Kolik zbývá času' }, t));
    var c = cena(d, model); if (c) radky.push(Object.assign({ klic: 'Co říká cena' }, c));
    var v = vymera(d); if (v) radky.push(Object.assign({ klic: 'Co znamená výměra' }, v));
    radky.push({ klic: 'Na co si dát pozor', lvl: 'warn', txt: pozor(d) });
    return { radky: radky, otazky: otazky(d, model) };
  }

  var IKONA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16"/><line x1="12" y1="7.6" x2="12" y2="8"/></svg>';

  /** Celý blok jako HTML. Text se nikde nebere od uživatele, takže se
   *  záměrně neescapuje — rady jsou napsané tady v souboru. */
  function html(d, model) {
    var r = rady(d, model);
    var radky = r.radky.map(function (x) {
      return '<div class="gtk-row gtk-' + x.lvl + '"><span class="gtk-k">' + x.klic + '</span><span class="gtk-v">' + x.txt + '</span></div>';
    }).join('');
    var otaz = r.otazky.map(function (o) { return '<li>' + o + '</li>'; }).join('');
    return '<details class="md-gtk" open>' +
      '<summary>' + IKONA + '<span>Co byste měli vědět</span><span class="gtk-hint">' + r.radky.length + ' věcí k tomuhle pozemku</span></summary>' +
      '<div class="gtk-body">' +
        radky +
        '<div class="gtk-otazky"><span class="gtk-k">Na co se zeptat</span>' +
          '<ol class="gtk-ol">' + otaz + '</ol></div>' +
        '<p class="gtk-foot">Obecné informace, ne právní rada ke konkrétní parcele. Vždy ověřte na úřadě a v katastru.</p>' +
      '</div>' +
    '</details>';
  }

  /** Světlá varianta pro stránku pozemku. Tentýž obsah, jiné třídy —
   *  stránka pozemku je na bílém papíře, ne v tmavém panelu. Obsah se
   *  počítá jedním voláním rady(), takže se obě verze nemůžou rozejít. */
  function htmlSvetla(d, model) {
    var r = rady(d, model);
    var radky = r.radky.map(function (x) {
      return '<div class="g-row g-' + x.lvl + '"><span class="g-k">' + x.klic + '</span><span class="g-v">' + x.txt + '</span></div>';
    }).join('');
    var otaz = r.otazky.map(function (o) { return '<li>' + o + '</li>'; }).join('');
    return '<div class="pz-gtk">' + radky +
      '<div class="g-otazky"><span class="g-k">Na co se zeptat</span>' +
        '<ol class="g-ol">' + otaz + '</ol></div>' +
      '<p class="g-foot">Obecné informace, ne právní rada ke konkrétní parcele. Vždy ověřte na úřadě a v katastru.</p>' +
      '</div>';
  }

  root.PK_RADCE = { rady: rady, html: html, htmlSvetla: htmlSvetla };
}(typeof window !== 'undefined' ? window : globalThis));
