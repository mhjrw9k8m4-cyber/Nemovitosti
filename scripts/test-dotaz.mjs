// Test: jedno políčko, které rozumí celé větě.
//
// Spuštění: node scripts/test-dotaz.mjs   (nepotřebuje prohlížeč ani síť)
//
// Hledání umělo jen místo, okres, parcelu a druh — a to jen jako text.
// Kdo chtěl „stavební pozemek na Berounsku do milionu, kde je elektřina",
// musel projít čtyři ovládátka na třech místech stránky. Přitom je to
// jedna věta, kterou si člověk v hlavě stejně řekne najednou.
//
// js/dotaz.js tu větu rozebere. Tři pravidla, na kterých to stojí, a
// všechna tři se dají porušit tiše, takže je hlídá test:
//
//  1. JEDNOTKA ROZHODUJE, NE POŘADÍ. „do 2 ha" je výměra, „do 2 mil" cena.
//     Holé číslo („769/2") musí zůstat textem — je to nejspíš parcela,
//     a kdyby se z něj stal filtr ceny, zmizely by všechny výsledky.
//  2. DELŠÍ VAZBA MÁ PŘEDNOST. „trvalý travní porost" se musí poznat dřív
//     než samotné „travní", jinak zbytek věty osiří a hledá se podle něj
//     obec, která neexistuje.
//  3. CO SE NEPOZNÁ, SE NEZAHODÍ. Zbytek jde na hledání místa. Kdyby se
//     ztratil, „Beroun" vedle „stavební" by přestal fungovat.
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import path from 'node:path';
const ROOT = new URL('..', import.meta.url).pathname;
const req = createRequire(import.meta.url);
const P = req(path.join(ROOT, 'js', 'dotaz.js'));
const DATA = JSON.parse(readFileSync(path.join(ROOT, 'data', 'opportunities.json'), 'utf8')).opportunities;
const okno = { window: {} };
new Function('window', readFileSync(path.join(ROOT, 'js', 'ceny.js'), 'utf8'))(okno.window);
const druhGroup = okno.window.PK_CENY.druhGroup;

let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* --- 1) Celé věty ------------------------------------------------------ */
{
  const r = P.rozeber('stavební beroun do 1 mil elektřina');
  pravda('věta „stavební beroun do 1 mil elektřina" se rozebere celá',
    r.druh === 'Stavební / zastavěná' && r.cenaDo === 1000000
    && r.site.join() === 'elektrina' && r.text === 'beroun',
    JSON.stringify(r));
  pravda('a zbytek zůstane na hledání obce', r.text === 'beroun', `„${r.text}"`);
  pravda('každá pochopená část má svůj odznak', r.casti.length === 3,
    r.casti.map((c) => c.popis).join(' | '));
}
{
  const r = P.rozeber('trvalý travní porost od 5000 m2');
  pravda('delší vazba má přednost („trvalý travní porost", ne „travní")',
    r.druh === 'Louka / travní porost' && r.text === '', JSON.stringify(r));
  pravda('a výměra se pozná podle jednotky', r.plochaOd === 5000 && r.cenaOd === null);
}
{
  const r = P.rozeber('orná nad 2 ha');
  pravda('„nad 2 ha" je dolní mez výměry', r.plochaOd === 20000 && r.plochaDo === null, JSON.stringify(r));
  pravda('a v odznaku stojí, co člověk napsal', r.casti.some((c) => c.popis === 'nad 2 ha'),
    r.casti.map((c) => c.popis).join(' | '));
}

/* --- 2) Jednotka rozhoduje --------------------------------------------- */
{
  pravda('„do 2 mil" je cena', P.rozeber('do 2 mil').cenaDo === 2000000);
  pravda('„do 2 ha" je výměra', P.rozeber('do 2 ha').plochaDo === 20000);
  pravda('„do 500 tis" je cena', P.rozeber('do 500 tis').cenaDo === 500000);
  pravda('„do 1000 m2" je výměra', P.rozeber('do 1000 m2').plochaDo === 1000);
  pravda('desetinné číslo s čárkou', P.rozeber('do 1,5 mil').cenaDo === 1500000);
  /* A hlavně: malé číslo bez jednotky se nehádá. „Do 500" může být
     pět set tisíc i pět set metrů — tipovat se nebude. (Statisícová
     čísla ano, ta jsou jednoznačná; viz oddíl 4c.) Samotné „do" už je
     ve výplňových slovech, takže v textu zbude jen to číslo — na
     pravidle se tím nic nemění: žádný filtr z toho nevznikl. */
  const r = P.rozeber('do 500');
  pravda('malé číslo bez jednotky se na filtr nepřevádí',
    r.cenaDo === null && r.plochaDo === null && !r.casti.length, JSON.stringify(r));
  const p2 = P.rozeber('769/2');
  pravda('parcelní číslo zůstane textem', p2.text === '769/2' && !p2.casti.length, JSON.stringify(p2));
}

/* --- 3) Co se nesmí ztratit -------------------------------------------- */
{
  pravda('samotná obec projde beze změny', P.rozeber('Říčany').text === 'ricany');
  pravda('dvě slova obce taky', P.rozeber('Police nad Metují').text.indexOf('police') === 0,
    P.rozeber('Police nad Metují').text);
  pravda('prázdný dotaz nic nefiltruje',
    P.rozeber('').casti.length === 0 && P.rozeber('  ').text === '');
  pravda('nesmysl zůstane textem', P.rozeber('xqzwkj').text === 'xqzwkj');
}

/* --- 4) Na skutečných datech musí každé slovo něco najít --------------- */
{
  /* Zrcadlí druhSedi() z js/main.js: „Zemědělská půda" je souhrn nad ornou
     půdou a loukami, ne konkrétní druh v katastru. Že ten souhrn v main.js
     opravdu je a že se používá v obou filtrech, hlídá kontrola v oddílu 6 —
     tady jde jen o to, aby se slovník dal ověřit na ostrých datech. */
  const NADRAZENE = { 'Zemědělská půda': ['Orná půda', 'Louka / travní porost'] };
  const druhSedi = (druhPozemku, vybrano) => {
    if (!vybrano) return true;
    const g = druhGroup(druhPozemku);
    return g === vybrano || (NADRAZENE[vybrano] || []).indexOf(g) >= 0;
  };
  const sedi = (r, d) => {
    if (r.druh && !druhSedi(d.druh, r.druh)) return false;
    if (r.typ && d.type !== r.typ) return false;
    if (r.jenCelek && d.podil) return false;
    for (const s of r.site) if (!d.site || d.site.indexOf(s) < 0) return false;
    if (r.cenaDo && !(d.price > 0 && d.price <= r.cenaDo)) return false;
    if (r.cenaOd && !(d.price >= r.cenaOd)) return false;
    if (r.plochaDo && !(d.area > 0 && d.area <= r.plochaDo)) return false;
    if (r.plochaOd && !(d.area >= r.plochaOd)) return false;
    return true;
  };
  const kolik = (q) => { const r = P.rozeber(q); return DATA.filter((d) => sedi(r, d)).length; };
  // Každý druh ve slovníku musí na ostrých datech něco vracet — jinak je to
  // slovo, které nabízíme a po kterém zůstane prázdno.
  const prazdne = [];
  for (const d of P.DRUHY) if (!kolik(d[1])) prazdne.push(d[1]);
  pravda('každý druh ze slovníku něco najde', prazdne.length === 0, 'prázdné: ' + prazdne.join(', '));
  /* U typů nabídky to platit NEMŮŽE: „od obce" a „od majitele" jsou
     platné pojmy (web je má i v legendě), ale vlastní inzeráty zatím
     žádné nejsou, takže by vracely prázdno. Hlídá se proto to podstatné —
     že se prázdné slovo NENABÍZÍ. O tom rozhoduje jedna podmínka v
     js/main.js a ta tu musí zůstat. */
  const main0 = readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8');
  pravda('našeptávač nenabídne slovo, pod kterým nic není',
    /if \(pocet\) ven\.push/.test(main0),
    'bez téhle podmínky by web nabídl „od obce" a po klepnutí ukázal prázdno');
  const zive = P.TYPY.filter((t) => kolik(t[2]) > 0).map((t) => t[2]);
  pravda(`a typy, které v datech jsou, fungují (${zive.join(', ')})`, zive.length >= 3,
    'z pěti typů má nabídky jen ' + zive.length);
  pravda('a kombinace zužuje, ne rozšiřuje',
    kolik('stavební do 1 mil') <= kolik('stavební') && kolik('stavební') <= DATA.length,
    `${kolik('stavební do 1 mil')} ≤ ${kolik('stavební')}`);
  pravda('„dražba les" najde jen lesní dražby', (() => {
    const r = P.rozeber('dražba les');
    return DATA.filter((d) => sedi(r, d)).every((d) => d.type === 'drazba' && druhGroup(d.druh) === 'Lesní pozemek');
  })());
}

/* --- 4b) Jak to lidé opravdu píšou ------------------------------------
   Celá cena jednoho políčka je v tom, že se do něj dá psát česky. Jenže
   co parser nepozná, spadne do „textu" — a text se hledá jen v názvu
   obce, okresu, parcele a druhu. Jedno jediné přebytečné slovo tím
   celý výpis vynuluje. Změřeno na ostrých datech: ze tří přirozených
   vět („s elektřinou", „pozemek s vodou", „jen celé pozemky") vracely
   dvě nula nabídek a třetí dvě.

   Proto tu jsou dvě pravidla:
     · pády. „S elektřinou" a „s vodou" jsou sedmý pád, a ten ve
       slovníku nebyl — byl tam jen první a druhý.
     · slova, která nejsou místo. Předložky, „jen", „pozemek", „prodej"
       — ta se do hledání místa nesmí dostat vůbec. Vyhodit slovo výpis
       jen rozšíří, nikdy nezúží; nechat ho tam znamená prázdno. */
{
  const t = (q) => P.rozeber(q);
  pravda('„s elektřinou" je filtr, ne text',
    t('s elektřinou').site.join() === 'elektrina' && t('s elektřinou').text === '',
    'vyšlo site=[' + t('s elektřinou').site + '], text=' + JSON.stringify(t('s elektřinou').text));
  pravda('„pozemek s vodou" taky',
    t('pozemek s vodou').site.join() === 'voda' && t('pozemek s vodou').text === '',
    'text zbyl: ' + JSON.stringify(t('pozemek s vodou').text));
  pravda('„se studnou" je voda', t('se studnou').site.join() === 'voda');
  pravda('„s kanalizací" je kanalizace', t('s kanalizací').site.join() === 'kanalizace');
  pravda('„s plynem" je plyn', t('s plynem').site.join() === 'plyn');
  pravda('„s příjezdovou cestou" je příjezd', t('s příjezdovou cestou').site.join() === 'cesta');
  pravda('dvě sítě naráz',
    t('zahrada s vodou a elektřinou').site.slice().sort().join() === 'elektrina,voda'
    && t('zahrada s vodou a elektřinou').text === '',
    'text zbyl: ' + JSON.stringify(t('zahrada s vodou a elektřinou').text));
  pravda('„jen celé pozemky" nenechá viset „jen"',
    t('jen celé pozemky').jenCelek === true && t('jen celé pozemky').text === '',
    'text zbyl: ' + JSON.stringify(t('jen celé pozemky').text));
  pravda('„prodej pozemku Benešov" hledá Benešov',
    t('prodej pozemku Benešov').text === 'benesov',
    'vyšlo ' + JSON.stringify(t('prodej pozemku Benešov').text));
  pravda('„hledám parcelu v Brně" hledá Brno',
    t('hledám parcelu v Brně').text === 'brne',
    'vyšlo ' + JSON.stringify(t('hledám parcelu v Brně').text));
  /* Vyhazování slov nesmí sežrat název místa. „Ústí nad Labem" i
     „Nové Město pod Smrkem" musejí zůstat dohledatelné. */
  pravda('název místa se vyhazováním slov neztratí',
    t('Ústí nad Labem').text.indexOf('usti') >= 0 && t('Ústí nad Labem').text.indexOf('labem') >= 0,
    'vyšlo ' + JSON.stringify(t('Ústí nad Labem').text));
  pravda('a ani víceslovný', t('Nové Město pod Smrkem').text.indexOf('smrkem') >= 0);
  pravda('samotné „pozemek" není místo', t('pozemek').text === '');
}

/* --- 4d) Kraje ---------------------------------------------------------
   Kraj je po obci nejpřirozenější způsob, jak si člověk vyhledávání
   zúží — a web pro něj má vlastní filtr i mapu. Ve větě ho ale parser
   neznal, takže „Jihočeský kraj" i „orná půda Vysočina" padaly do
   hledání OBCE a vracely nulu. Počítají se i tvary, kterými se kraje
   opravdu říkají: „jižní Čechy", „Vysočina" bez slova kraj, „Moravsko-
   slezsko". */
{
  const t = (q) => P.rozeber(q);
  pravda('„Jihočeský kraj" je kraj', t('Jihočeský kraj').kraj === 'Jihočeský' && t('Jihočeský kraj').text === '',
    JSON.stringify(t('Jihočeský kraj')));
  pravda('„jižní Čechy" taky', t('jižní Čechy').kraj === 'Jihočeský');
  pravda('„Vysočina" bez slova kraj', t('Vysočina').kraj === 'Vysočina');
  pravda('„orná půda Vysočina" umí obojí naráz',
    t('orná půda Vysočina').kraj === 'Vysočina' && t('orná půda Vysočina').druh === 'Orná půda'
    && t('orná půda Vysočina').text === '', JSON.stringify(t('orná půda Vysočina')));
  /* Praha je zároveň kraj, obec i tři okresy. Holé „Praha" proto kraj
     NENÍ: kdyby byl, „Praha-východ" by se rozpadlo na kraj Praha
     + slovo „východ" a nenašlo by nic — okres Praha-východ je
     středočeský. Jako hledání místa najde Praha obec i oba okolní
     okresy, tedy víc než filtr kraje. */
  pravda('holé „Praha" zůstává hledáním místa', t('Praha').kraj === null && t('Praha').text === 'praha');
  pravda('a „Praha-východ" se nerozpadne',
    t('Praha-východ').kraj === null && t('Praha-východ').text === 'praha vychod',
    JSON.stringify(t('Praha-východ')));
  pravda('plným názvem se kraj Praha zadat dá', t('hlavní město Praha').kraj === 'Praha');
  pravda('„Moravskoslezský kraj" je kraj', t('Moravskoslezský kraj').kraj === 'Moravskoslezský');
  pravda('kraj se ukáže jako odznak',
    (t('Jihočeský kraj').casti.find((c) => c.druh === 'kraj') || {}).hodnota === 'Jihočeský');
  /* A co se přitom nesmí stát: obec, která se jmenuje jako kraj, se
     nesmí ztratit. Okres „Plzeň-sever" ani obec „Plzeň" nejsou kraj
     „Plzeňský" — slova se liší, takže se nepotkají. */
  pravda('obec Plzeň krajem není', t('Plzeň').kraj === null && t('Plzeň').text === 'plzen',
    JSON.stringify(t('Plzeň')));
  pravda('okres Brno-venkov krajem není', t('Brno-venkov').kraj === null);
  /* Každý název, který se nabízí, musí jít zase přečíst — stejné
     pravidlo jako u druhů a sítí. */
  {
    const spatne = P.KRAJE.filter((k) => P.rozeber(k[1]).kraj !== k[0]).map((k) => k[1]);
    pravda('každé nabízené jméno kraje parser zase přečte', spatne.length === 0, 'nepřečte: ' + spatne.join(', '));
  }
}

/* --- 4c) Cena bez jednotky --------------------------------------------
   „Les do 100000" je jasná věta, ale bez jednotky se celé „do 100000"
   propadlo do textu — a výpis byl prázdný. Statisícová čísla se čtou
   jako koruny; malá zůstávají textem, protože „do 5" může být cokoli. */
{
  const t = (q) => P.rozeber(q);
  pravda('„les do 100000" je cena', t('les do 100000').cenaDo === 100000 && t('les do 100000').text === '');
  pravda('„nad 250000" je spodní cena', t('nad 250000').cenaOd === 250000);
  pravda('a v odznaku stojí, jak se to přečetlo',
    (t('do 100000').casti[0] || {}).popis === 'do 100000 Kč',
    'vyšlo ' + JSON.stringify((t('do 100000').casti[0] || {}).popis));
  pravda('malé číslo se za cenu nevydává', t('do 5').cenaDo === null);
  pravda('jednotka má přednost', t('do 2 ha').plochaDo === 20000 && t('do 2 ha').cenaDo === null);
}

/* --- 4f) Co web umí, ale věta to neuměla pojmenovat -------------------
   Změřeno na padesáti běžných dotazech: dvacet šest z nich vracelo
   prázdno. U části to bylo poctivé (takové nabídky prostě nemáme),
   u části ne — web ten filtr MÁ, jen se do políčka nedal napsat. */
{
  const t = (q) => P.rozeber(q);

  /* a) Cena za metr. Rozbalovátko „do 50 Kč/m²" existuje odjakživa. */
  pravda('„do 20 Kč/m2" je cena za metr', t('do 20 Kč/m2').zaMetrDo === 20, JSON.stringify(t('do 20 Kč/m2')));
  pravda('„do 50 kč za metr" taky', t('do 50 kč za metr').zaMetrDo === 50);
  pravda('„orná do 20 Kč/m2" umí obojí',
    t('orná do 20 Kč/m2').druh === 'Orná půda' && t('orná do 20 Kč/m2').zaMetrDo === 20
    && t('orná do 20 Kč/m2').text === '');
  pravda('a nepleteme to s celkovou cenou', t('do 20 Kč/m2').cenaDo === null);

  /* b) Holé číslo s jednotkou. „Les 5 ha" je jasná věta — dosud celé
     „5 ha" propadlo do hledání obce a výpis byl prázdný.
     Výměra se čte jako PŘIBLIŽNĚ (kdo píše 1000 m², nechce přijít
     o parcelu s 1050 m²), cena jako STROP (to je rozpočet). */
  pravda('„les 5 ha" je výměra kolem 5 ha',
    t('les 5 ha').plochaOd === 37500 && t('les 5 ha').plochaDo === 62500 && t('les 5 ha').text === '',
    JSON.stringify(t('les 5 ha')));
  pravda('„pozemek 1000 m2" taky',
    t('pozemek 1000 m2').plochaOd === 750 && t('pozemek 1000 m2').plochaDo === 1250);
  pravda('a v odznaku stojí, že je to přibližně',
    (t('1000 m2').casti[0] || {}).popis === 'kolem 1000 m2',
    JSON.stringify((t('1000 m2').casti[0] || {}).popis));
  pravda('holá cena je strop, ne rozmezí',
    t('500 tis').cenaDo === 500000 && t('500 tis').cenaOd === null);
  pravda('„do 2 ha" má pořád přednost před přibližností',
    t('do 2 ha').plochaDo === 20000 && t('do 2 ha').plochaOd === null);

  /* c) „Levné". Web to umí jako „pod obvyklou cenou" — a je to jeden
     z mála filtrů, o kterých se ve větě nedalo říct vůbec nic. */
  pravda('„levné pozemky" je filtr', t('levné pozemky').levne === true && t('levné pozemky').text === '');
  pravda('„levný" i „levná"', t('levný').levne === true && t('levná orná půda').levne === true);
  pravda('„pod cenou" taky', t('pod cenou').levne === true);
  pravda('„výhodná koupě" taky', t('výhodná koupě').levne === true);
  pravda('a odznak říká, co to znamená',
    (t('levné').casti[0] || {}).popis === 'pod obvyklou cenou');

  /* d) „Sítě" bez upřesnění. Znamená to aspoň jednu z elektřiny, vody,
     kanalizace a plynu — nic víc se z toho vyčíst nedá. */
  pravda('„se sítěmi" znamená aspoň jednu síť',
    t('se sítěmi').nejakeSite === true && t('se sítěmi').text === '');
  pravda('„inženýrské sítě" taky', t('inženýrské sítě').nejakeSite === true);
  pravda('konkrétní síť má přednost před obecnou',
    t('s elektřinou a sítěmi').nejakeSite === false
    && t('s elektřinou a sítěmi').site.join() === 'elektrina',
    JSON.stringify(t('s elektřinou a sítěmi')));
  /* …a to obecné slovo se musí POHLTIT, i když prohrálo. Kdyby zbylo
     v textu, hledala by se obec „sítěmi" a výpis by byl prázdný —
     tedy přesně opačný výsledek, než jaký ta věta chce. */
  pravda('a přebité obecné slovo nezůstane v textu',
    t('s elektřinou a sítěmi').text === '', JSON.stringify(t('s elektřinou a sítěmi').text));
  pravda('„od 20 Kč/m2" je spodní mez ceny za metr',
    t('od 20 Kč/m2').zaMetrOd === 20 && t('od 20 Kč/m2').text === '',
    JSON.stringify(t('od 20 Kč/m2')));
  pravda('„nad 20 Kč/m2" taky', t('nad 20 Kč/m2').zaMetrOd === 20);
  pravda('a obě meze se dají zadat naráz',
    t('od 20 Kč/m2 do 50 Kč/m2').zaMetrOd === 20 && t('od 20 Kč/m2 do 50 Kč/m2').zaMetrDo === 50);

  /* e) Slova, která jen uvozují místo. */
  pravda('„okres Kolín" hledá Kolín', t('okres Kolín').text === 'kolin');
  pravda('„obec Kolín" taky', t('obec Kolín').text === 'kolin');
  pravda('ale „od obce" zůstává druhem nabídky', t('od obce').typ === 'obec');
}

/* --- 4e) Odznak musí jít ZRUŠIT -----------------------------------------
   Křížek na odznaku vyškrtne z věty slova, která k němu patří. Jenže se
   škrtala slova POPISKU, ne ta, která člověk napsal — a popisek bývá
   jiný: napíšu „bez podílu" a odznak říká „jen celé pozemky", napíšu
   „s elektřinou" a odznak říká „Elektřina". Slova se nepotkala, takže
   křížek nedělal NIC. Pět z deseti vyzkoušených odznaků bylo mrtvých.
   Proto si každá pochopená část pamatuje slova, ze kterých vznikla. */
{
  /* Totéž, co dělá js/main.js při klepnutí na křížek. */
  function poZruseni(dotaz, i) {
    const f = P.rozeber(dotaz);
    const c = f.casti[i];
    if (!c) return null;
    const slova = c.slova && c.slova.length ? c.slova : P.norm(c.popis).split(' ');
    return dotaz.split(/\s+/).filter((w) => slova.indexOf(P.norm(w)) < 0).join(' ').trim();
  }
  const zk = [
    ['bez podílu', 0, ''],
    ['celek', 0, ''],
    ['nepodíl', 0, ''],
    ['s elektřinou', 0, 's'],
    ['jižní Čechy', 0, ''],
    ['orná do 500 tis', 0, 'orná'],
    ['orná do 500 tis', 1, 'do 500 tis'],
    ['dražba', 0, ''],
    /* „Stavební pozemek" je dvouslovný název druhu, takže k odznaku
       patří obě slova — zůstat má jen místo. */
    ['stavební pozemek u Kolína', 0, 'u Kolína'],
    ['Jihočeský kraj', 0, ''],
  ];
  for (const [q, i, ceka] of zk) {
    const po = poZruseni(q, i);
    pravda(`křížek u „${q}" (odznak ${i}) opravdu škrtá`, po === ceka,
      `zbylo ${JSON.stringify(po)}, čekáno ${JSON.stringify(ceka)}`);
  }
  /* A obecně: po zrušení odznaku už ta část nesmí být rozpoznaná znovu —
     jinak by se odznak hned vrátil a křížek by vypadal jako pokažený. */
  const dotazy = ['bez podílu', 's elektřinou', 'jižní Čechy', 'orná do 500 tis',
    'stavební Vysočina s vodou do 1 mil', 'nepodíl', 'dražba Brno'];
  let vracejici = [];
  for (const q of dotazy) {
    const f = P.rozeber(q);
    for (let i = 0; i < f.casti.length; i++) {
      const po = poZruseni(q, i);
      const znovu = P.rozeber(po).casti.map((c) => c.popis);
      if (znovu.indexOf(f.casti[i].popis) >= 0) vracejici.push(q + ' → ' + f.casti[i].popis);
    }
  }
  pravda('zrušený odznak se sám nevrátí', vracejici.length === 0, vracejici.join('; '));
}

/* --- 4g) Slovník nesmí spolknout NÁZEV MÍSTA --------------------------
   Slovník roste: druhy, typy, sítě, kraje, „levné", výplňová slova.
   Každé přidané slovo je risk, že se potká s názvem obce nebo okresu
   a ten se z věty ztratí — a člověk pak marně hledá místo, které
   v datech je. Tohle se proti SKUTEČNÝM názvům dá ověřit rovnou.

   Pravidlo: z každého názvu musí po rozboru něco zbýt — buď text
   k hledání, nebo filtr, který ten název zastoupí (Praha se pozná jako
   místo, „Vysočina" klidně jako kraj). Prázdno znamená, že se název
   rozpustil ve slovníku a nezbylo podle čeho hledat. */
{
  const data = JSON.parse(readFileSync(path.join(ROOT, 'data', 'opportunities.json'), 'utf8')).opportunities || [];
  const jmena = new Set();
  for (const d of data) { if (d.place) jmena.add(d.place); if (d.okres) jmena.add(d.okres); }
  const ztracene = [];
  for (const j of jmena) {
    const r = P.rozeber(j);
    if (!r.text && !r.druh && !r.typ && !r.kraj && !r.site.length) ztracene.push(j);
  }
  pravda(`žádný z ${jmena.size} názvů obcí a okresů se ve slovníku neztratí`,
    ztracene.length === 0,
    'ztratily se: ' + ztracene.slice(0, 12).join(', ') + (ztracene.length > 12 ? ` (a dalších ${ztracene.length - 12})` : ''));
}

/* --- 5) Slovo, které se vkládá z našeptávače, musí jít zase přečíst ---- */
{
  let spatne = [];
  for (const d of P.DRUHY) if (P.rozeber(d[1]).druh !== d[0]) spatne.push(d[1]);
  for (const t of P.TYPY) if (P.rozeber(t[2]).typ !== t[0]) spatne.push(t[2]);
  for (const s of P.SITE) if (P.rozeber(s[2]).site.join() !== s[0]) spatne.push(s[2]);
  /* Totéž pro „levné" a „sítě": co našeptávač vloží, musí jít přečíst. */
  for (const o of P.OSTATNI || []) {
    const r = P.rozeber(o[2]);
    if (o[0] === 'levne' ? !r.levne : !r.nejakeSite) spatne.push(o[2]);
    if (r.text !== '') spatne.push(o[2] + ' (zbyl text ' + JSON.stringify(r.text) + ')');
  }
  pravda('každé nabízené slovo parser zase přečte', spatne.length === 0,
    'nepřečte: ' + spatne.join(', ') + ' — našeptávač by vložil do věty něco, co ji rozbije');
}

/* --- 6) Je to zapojené? ------------------------------------------------ */
{
  const main = readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8');
  const idx = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  pravda('index.html načítá js/dotaz.js', /<script src="js\/dotaz\.js/.test(idx));
  pravda('web větu rozebírá', /PKDotaz\.rozeber\(syrovy\)/.test(main));
  pravda('a filtruje podle toho, co pochopil', /okDotaz;/.test(main));
  pravda('pochopené části se ukazují jako odznaky', /ms-chipy/.test(idx) && /prekresliChipy/.test(main));
  pravda('a jdou zrušit', /class="msch"/.test(main));
  pravda('křížek škrtá slova, ze kterých odznak vznikl (ne popisek)',
    /cast\.slova && cast\.slova\.length/.test(main),
    'při škrtání podle popisku byla polovina křížků mrtvá');
  pravda('našeptávač nabízí i slovník, ne jen obce', /navrhySlovnik/.test(main));

  /* Souhrn „Zemědělská půda" (orná + louky). Tak ho sčítá stránka s cenami
     i slovníček, ale mapa uměla filtrovat jen konkrétní druhy — kdo napsal
     do hledání název vlastní největší kategorie webu, dostal nulu.
     Hlídají se obě strany: že ho parser pozná, a že ho mapa umí vyfiltrovat
     v OBOU místech (seznam druhů i věta). Kdyby se použil jen na jednom,
     rozešly by se počty podle toho, kudy k filtru člověk přišel. */
  const bezKomentaru = main.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  pravda('mapa zná nadřazenou skupinu „Zemědělská půda"',
    /NADRAZENE\s*=\s*\{[^}]*Zemědělská půda/.test(bezKomentaru),
    'bez ní vrací hledání „zemědělská půda" nulu');
  pravda('a filtruje přes ni na obou místech (seznam i věta)',
    (bezKomentaru.match(/druhSedi\(/g) || []).length >= 3,
    'porovnání druhu musí jít přes druhSedi, jinak se seznam a věta rozejdou');
  for (const v of ['zemědělská půda', 'zemědělská', 'zemědělský pozemek']) {
    pravda(`„${v}" hledání pozná jako zemědělskou půdu`,
      P.rozeber(v).druh === 'Zemědělská půda',
      `vyšlo ${JSON.stringify(P.rozeber(v).druh)}`);
  }
  for (const [v, ceka] of [['orná půda', 'Orná půda'], ['louka', 'Louka / travní porost'],
                           ['lesní pozemek', 'Lesní pozemek'], ['zahrada', 'Zahrada']]) {
    pravda(`a „${v}" zůstává konkrétním druhem`, P.rozeber(v).druh === ceka,
      `vyšlo ${JSON.stringify(P.rozeber(v).druh)}`);
  }
  pravda('kraj z věty se opravdu použije jako filtr',
    /dotazFiltr\.kraj && \(d\._gkraj \|\| krajOf\(d\)\) !== dotazFiltr\.kraj/.test(main),
    'parser by kraj poznal, ale výpis by se podle něj nezúžil');
  pravda('a našeptávač kraje nabízí', /PKDotaz\.KRAJE\.forEach/.test(main));
  pravda('i „levné" a „sítě"', /PKDotaz\.OSTATNI \|\| \[\]/.test(main));
  pravda('cena za metr z věty filtruje', /dotazFiltr\.zaMetrDo \|\| dotazFiltr\.zaMetrOd/.test(main));
  pravda('obecné „sítě" z věty filtrují', /dotazFiltr\.nejakeSite/.test(main));
  pravda('„levné" z věty filtruje', /dotazFiltr\.levne && !podObvyklou\(d\)/.test(main));
  /* „Levné" napsané do věty a přepínač „Pod obvyklou cenou" musí být
     TÝŽ výpočet. Dva kusy kódu by si dřív nebo později u téhož pozemku
     protiřečily — jednou by svítil jako výhodný, jednou ne. */
  pravda('a je to tentýž výpočet jako u přepínače',
    /var okLevne = !levneOnly \|\| podObvyklou\(d\);/.test(main),
    'přepínač a věta počítají „pod obvyklou cenou" každý po svém');
  /* Záloha pro případ, že se js/dotaz.js nenačte, musí mít stejný tvar —
     jinak by `dotazFiltr.kraj` bylo undefined a filtr by se choval jinak
     než se čte. */
  pravda('záloha filtru zná kraj taky', /dotazFiltr = \{ druh: null, typ: null, kraj: null,/.test(main));

  /* Že políčko snese celou větu, se dřív hlásilo řádkem s příkladem pod
     ním. Na přání pryč — bylo to v cestě. Zůstává to poznat z popisku
     v políčku a z odznaků, které se objeví, jakmile člověk začne psát. */
  pravda('popisek políčka nemluví jen o obci',
    /placeholder="Obec, kraj, druh, cena/.test(idx),
    'kdyby tam zase stálo jen „Hledat obec", nikdo by netušil, že jde napsat víc');
}

console.log('\nJedno políčko, které rozumí celé větě');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Dotaz: ' + chyb + ' kontrol neprošlo.'); process.exit(1); }
process.exit(0);
