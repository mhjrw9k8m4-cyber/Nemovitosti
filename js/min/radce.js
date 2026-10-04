(function (root) {
  'use strict';

  function maVymeru(d) { return typeof d.area === 'number' && d.area > 0; }

  function m2(n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0'); }
  function ha(n) {
    var h = n / 10000;
    return (h < 10 ? h.toFixed(2) : h.toFixed(1)).replace(/0+$/, '').replace(/\.$/, '').replace('.', ',');
  }

  function stavba(g, druh, d) {
    var dr = String(druh || '').toLowerCase();

    var a = (d && maVymeru(d)) ? d.area : 0;
    var zVymery = a ? ' Odvod za vynětí se počítá z <b>výměry</b> — tady z ' + m2(a) + ' m².' : '';
    if (g === 'Stavební / zastavěná' && /zastav/.test(dr)) {
      return { lvl: 'mid', txt: 'V katastru vedeno jako <b>zastavěná plocha a nádvoří</b> — podle zápisu na pozemku <b>něco stojí</b> nebo stálo. Zjistěte, co to je, jestli je to v ceně a v jakém je stavu; u stavby se kupuje i to, co je pod ní.' };
    }
    switch (g) {
      case 'Stavební / zastavěná':
        return { lvl: 'ok', txt: 'V katastru vedeno jako <b>stavební pozemek</b>. Není to totéž co územní plán: ten teprve rozhoduje, <b>co a jak velké</b> se tu smí postavit. Ověřte si ho na stavebním úřadě obce — a k tomu, jestli jsou v dosahu <b>sítě a příjezd</b>. Ze zápisu v katastru se ani jedno nepozná.' };
      case 'Orná půda':
        return { lvl: 'warn', txt: '<b>Zemědělská půda.</b> Pro stavbu je nutná změna územního plánu a <b>vynětí ze zemědělského půdního fondu</b>, za které se platí odvod. Bývá to zdlouhavé a není na to nárok.' + zVymery };
      case 'Louka / travní porost':
        return { lvl: 'warn', txt: '<b>Zemědělská půda</b> (travní porost). Ke stavbě je potřeba změna územního plánu a vynětí ze ZPF. Bývá na ni <b>pacht</b> — zjistěte si, jestli je pozemek pronajatý a na jak dlouho.' + zVymery };
      case 'Zahrada':
        return { lvl: 'mid', txt: 'Zahrada bývá v zastavěném území, ale <b>ne vždy je stavební</b>. Ověřte si územní plán obce. U zahrad se taky častěji stává, že <b>nemají vlastní přístup z veřejné cesty</b>.' };
      case 'Lesní pozemek':
        return { lvl: 'warn', txt: '<b>Lesní pozemek</b> pod ochranou lesního zákona — výstavba je prakticky vyloučená a s lesem je spojená <b>povinnost hospodařit</b>. Rozdělení lesního pozemku pod jeden hektar navíc vyžaduje souhlas úřadu.'
          + (a ? (a < 10000
              ? ' Tenhle má <b>' + m2(a) + ' m²</b>, tedy pod hektar — na dělení by souhlas potřeba byl.'
              : ' Tenhle má <b>' + ha(a) + ' ha</b>, takže nad hranici jednoho hektaru.')
            : '') };
      case 'Vinice / sad':
        return { lvl: 'warn', txt: 'Zemědělská kultura (vinice nebo sad). Ke stavbě je potřeba změna využití a vynětí ze ZPF.' + zVymery };
      default:
        return { lvl: 'mid', txt: 'Ověřte v <b>územním plánu</b> obce, jak se pozemek smí využívat a zda se na něm dá stavět.' };
    }
  }

  var SITE_TVARY = [
    { klic: 'elektrina', co: 'elektřinu', cem: 'elektřině' },
    { klic: 'voda', co: 'vodu', cem: 'vodě' },
    { klic: 'kanalizace', co: 'kanalizaci', cem: 'kanalizaci' },
    { klic: 'plyn', co: 'plyn', cem: 'plynu' },
  ];
  function vyjmenuj(pole) {
    if (!pole.length) return '';
    if (pole.length === 1) return '<b>' + pole[0] + '</b>';
    return pole.slice(0, -1).map(function (x) { return '<b>' + x + '</b>'; }).join(', ') +
      ' a <b>' + pole[pole.length - 1] + '</b>';
  }
  function zInzeratu(d) {
    var ma = d.site || [];
    if (!ma.length) return null;
    var je = SITE_TVARY.filter(function (s) { return ma.indexOf(s.klic) >= 0; });
    var neni = SITE_TVARY.filter(function (s) { return ma.indexOf(s.klic) < 0; });
    var cesta = ma.indexOf('cesta') >= 0;
    var t = '';
    if (je.length) t += 'Inzerát uvádí ' + vyjmenuj(je.map(function (s) { return s.co; })) + '. ';
    if (cesta) t += (je.length ? 'Zmiňuje i <b>příjezdovou cestu</b>. ' : 'Inzerát zmiňuje <b>příjezdovou cestu</b>. ');
    if (neni.length) {
      t += 'O ' + vyjmenuj(neni.map(function (s) { return s.cem; })) + ' se nepíše — ' +
        '<b>neznamená to, že ' + (neni.length === 1 ? 'tam není' : 'tam nejsou') + '</b>, jen se to z nabídky nedozvíme. ';
    }
    t += 'I u toho, co inzerát uvádí, se ptejte, jestli je přípojka <b>na pozemku</b>, nebo jen v ulici.';
    return { lvl: je.length ? 'ok' : 'mid', txt: t };
  }

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

        if (/SPÚ|státní půd/i.test(d.extra || '')) {
          return 'Nabídka <b>státního pozemkového úřadu</b>. Přednost mívají <b>dosavadní pachtýři</b> a nabídka běží ve <b>lhůtě</b> — konkrétní podmínky i termín uvádí vyhlášení na úřední desce SPÚ.';
        }

        var pristup = ((d.site || []).indexOf('cesta') >= 0)
          ? 'a u <b>příjezdu</b>, který inzerát zmiňuje, si v katastrální mapě ověřte, jestli vede po <b>veřejné komunikaci</b>, nebo přes cizí pozemek — z popisu se to nepozná.'
          : 'a zjistěte si <b>přístup z veřejné cesty</b> — ten se z inzerátu pozná nejhůř a chybí nejčastěji.';
        return 'Cena v inzerátu je <b>nabídková</b>, ne odhad ani cena obvyklá. Před koupí ověřte na <b>listu vlastnictví</b>, kdo je vlastník a jestli na pozemku nevázne <b>zástava nebo věcné břemeno</b>, ' + pristup;
    }
  }

  function vymera(d) {
    if (!maVymeru(d)) return null;
    var a = d.area;
    if (a < 300) {
      return { lvl: 'mid', txt: '<b>' + m2(a) + ' m²</b> je na samostatné využití málo. Takhle malé parcely se nejčastěji hodí k <b>rozšíření sousedního pozemku</b> — nebo jde o podíl či zbytkový díl po dělení.' };
    }
    if (a > 50000) {
      return { lvl: 'mid', txt: '<b>' + ha(a) + ' ha</b> (' + m2(a) + ' m²). Počítejte s <b>daní z nemovitých věcí</b> každý rok a s tím, že taková plocha sama neleží ladem — obvykle se <b>propachtuje</b> zemědělci. Zjistěte si, jestli na ní pacht už neběží a do kdy.' };
    }
    if (a > 10000) {
      return { lvl: 'mid', txt: '<b>' + ha(a) + ' ha</b> (' + m2(a) + ' m²) půdy. U takové výměry se vyplatí zjistit, jestli na pozemku <b>neběží pacht</b> — nájem zemědělské půdy se ukončuje s výpovědní dobou, ne ze dne na den.' };
    }
    return null;
  }

  function cena(d, model) {
    if (!model || !maVymeru(d) || !d.price) return null;
    if (model.neduveryhodna(d)) {
      return { lvl: 'warn', txt: 'Cena za m² je <b>hluboko pod</b> obvyklou u tohoto druhu pozemku v okolí. To bývá nejčastěji <b>spoluvlastnický podíl</b> (kupujete jen část, ne celou parcelu), pozemek <b>bez přístupu z veřejné cesty</b>, zatížený <b>věcným břemenem</b> — nebo je to chyba v inzerátu. Ověřte si to dřív, než cokoli podepíšete.' };
    }
    var o = model.odhad(d);
    if (o && o.podleVelikosti) {
      var kde = (root.PK_CENY && root.PK_CENY.kdeText) ? root.PK_CENY.kdeText(o.uroven, o.kde) : '';

      var cis = function (n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0'); };
      var muj = (root.PK_CENY && root.PK_CENY.zaMetr) ? root.PK_CENY.zaMetr(d) : null;
      var cisla = (muj && o.zaM2)
        ? ' Vychází to na <b>' + cis(muj) + ' Kč/m²</b> proti obvyklým <b>' + cis(o.zaM2) +
          ' Kč/m²</b> (srovnáno s ' + o.vzorek + ' ' +
          (o.vzorek === 1 ? 'nabídkou' : (o.vzorek < 5 ? 'nabídkami' : 'nabídkami')) + ').'
        : '';

      if (o.podil) {
        var zl = (root.PK_CENY && root.PK_CENY.vymeraVCene) ? root.PK_CENY.vymeraVCene(d) : null;
        var zm = (root.PK_CENY && root.PK_CENY.zaMetr) ? root.PK_CENY.zaMetr(d) : null;
        var cis = function (n) { return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '\u00a0'); };
        return { lvl: 'mid', txt: 'Cena vychází <b>o ' + o.podOdhadem + ' % pod</b> obvyklou, ale ' +
          '<b>není to sleva</b>: prodává se <b>spoluvlastnický podíl</b>, zatímco výměra v inzerátu je ' +
          'celé parcely. ' +
          (zl && zm
            ? 'V ceně je zhruba <b>' + cis(zl) + ' m²</b>, tedy <b>' + cis(zm) + ' Kč/m²</b> z toho, co vám připadne. '
            : 'Kolik metrů vám připadne, se z inzerátu nedá spočítat. ') +
          'S podílem navíc nemůžete nakládat sám — potřebujete ostatní spoluvlastníky.' };
      }

      if (o.pochybna) {
        return { lvl: 'warn', txt: 'Cena je <b>o ' + o.podOdhadem + ' % pod</b> obvyklou cenou podobně velkých pozemků téhož druhu ' + kde +
          '.' + cisla + ' Takový rozdíl už nebývá sleva: nejčastěji je v inzerátu výměra <b>celé parcely</b>, ale prodává se jen <b>spoluvlastnický podíl</b>, ' +
          'nebo jde o dražbu s jinou výměrou, případně o chybu v ceně. <b>Ověřte si to na listu vlastnictví</b>, než něco podepíšete.' };
      }

      if (o.nejisty && o.podOdhadem >= 25) {
        return { lvl: 'mid', txt: 'Cena vychází <b>o ' + o.podOdhadem + ' % pod</b> obvyklou cenou podobných pozemků ' + kde +
          '.' + cisla + ' Jenže ceny takových pozemků se tu mezi sebou liší <b>násobky</b>, takže je to jen hrubé vodítko, ne spolehlivý rozdíl. ' +
          'Srovnejte si konkrétní nabídky v okolí sami.' };
      }
      if (o.podOdhadem >= 25) {
        return { lvl: 'ok', txt: 'Cena je <b>o ' + o.podOdhadem + ' % pod</b> obvyklou cenou podobně velkých pozemků téhož druhu ' + kde + '.' + cisla + ' Může to být příležitost — ale stejně tak důvod ptát se <b>proč</b>: přístup, břemena, tvar parcely.' };
      }
    }
    return null;
  }

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

      return { lvl: 'warn', txt: '<b>Termín dražby už minul</b> (' + (-n) + ' dní zpátky). Záznam tu zůstává kvůli historii — u dražebníka si ověřte, jestli se vydražilo, nebo bude další kolo.' };
    }
    if (n <= 7) {
      var kdy = n === 0 ? 'Dražba je dnes' : (n === 1 ? 'Dražba je zítra' : 'Do dražby zbývá ' + n + (n < 5 ? ' dny' : ' dní'));
      return { lvl: 'warn', txt: '<b>' + kdy + '.</b> Na prohlídku, ověření v katastru a složení dražební jistoty už je <b>málo času</b> — jistota musí být připsaná před zahájením, ne v den dražby.' };
    }
    if (n <= 30) {
      return { lvl: 'mid', txt: 'Do dražby zbývá <b>' + n + ' dní</b>. To akorát stačí na prohlídku, výpis z katastru a zajištění peněz — začněte tím, ne až týden předem.' };
    }
    return null;
  }

  function otazky(d, model) {
    var g = (root.PK_CENY && root.PK_CENY.druhGroup) ? root.PK_CENY.druhGroup(d.druh) : '';
    var out = [];
    if (model && maVymeru(d) && d.price && model.neduveryhodna(d)) {
      out.push('Prodáváte celou parcelu, nebo jen spoluvlastnický podíl? Jak velký?');
    }

    var ma = d.site || [];
    if (ma.indexOf('cesta') >= 0) {
      out.push('Inzerát zmiňuje příjezdovou cestu — je to <b>veřejná komunikace</b>, nebo se jezdí přes cizí pozemek?');
    } else {
      out.push('Má pozemek přístup z veřejné komunikace, nebo jen přes cizí pozemek?');
    }
    if (g === 'Orná půda' || g === 'Louka / travní porost' || g === 'Vinice / sad') {
      out.push('Je půda propachtovaná? Komu a do kdy nájem běží?');
    } else if (g === 'Stavební / zastavěná') {
      var uvedene = SITE_TVARY.filter(function (x) {
        return x.klic !== 'plyn' && ma.indexOf(x.klic) >= 0;
      }).map(function (x) { return x.co; });
      if (uvedene.length) {
        out.push('Inzerát uvádí ' + uvedene.join(', ') + ' — je přípojka <b>na pozemku</b>, nebo jen v ulici, a kolik by stálo ji dotáhnout?');
      } else {
        out.push('Jak daleko jsou přípojky — elektřina, voda, kanalizace — a je na ně kapacita?');
      }
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

      var pc = (d.parcel && d.parcel !== '—') ? ' u parcely č. ' + d.parcel : '';
      out.push('Váznou na pozemku' + pc + ' věcná břemena, zástavy nebo jiná omezení?');
    }
    return out.slice(0, 3);
  }

  function rady(d, model) {
    var g = (root.PK_CENY && root.PK_CENY.druhGroup) ? root.PK_CENY.druhGroup(d.druh) : '';
    var radky = [];
    radky.push(Object.assign({ klic: 'Dá se tu stavět?' }, stavba(g, d.druh, d)));
    var t = termin(d); if (t) radky.push(Object.assign({ klic: 'Kolik zbývá času' }, t));
    var c = cena(d, model); if (c) radky.push(Object.assign({ klic: 'Co říká cena' }, c));
    var v = vymera(d); if (v) radky.push(Object.assign({ klic: 'Co znamená výměra' }, v));
    var s = zInzeratu(d); if (s) radky.push(Object.assign({ klic: 'Co uvádí inzerát' }, s));
    radky.push({ klic: 'Na co si dát pozor', lvl: 'warn', txt: pozor(d) });
    return { radky: radky, otazky: otazky(d, model) };
  }

  var IKONA = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16"/><line x1="12" y1="7.6" x2="12" y2="8"/></svg>';

  function html(d, model) {
    var r = rady(d, model);
    var radky = r.radky.map(function (x) {
      return '<div class="gtk-row gtk-' + x.lvl + '"><span class="gtk-k">' + x.klic + '</span><span class="gtk-v">' + x.txt + '</span></div>';
    }).join('');
    var otaz = r.otazky.map(function (o) { return '<li>' + o + '</li>'; }).join('');

    return '<details class="md-gtk">' +
      '<summary>' + IKONA + '<span>Co byste měli vědět</span><span class="gtk-hint">' + r.radky.length + ' věcí k tomuhle pozemku</span></summary>' +
      '<div class="gtk-body">' +
        radky +
        '<div class="gtk-otazky"><span class="gtk-k">Na co se zeptat</span>' +
          '<ol class="gtk-ol">' + otaz + '</ol></div>' +
        '<p class="gtk-foot">Obecné informace, ne právní rada ke konkrétní parcele. Vždy ověřte na úřadě a v katastru.</p>' +
      '</div>' +
    '</details>';
  }

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
