// Test: co se dá vyčíst z popisu nabídky — sítě a spoluvlastnický podíl.
//
// Spuštění: node scripts/test-vybaveni.mjs   (nepotřebuje prohlížeč ani síť)
//
// Ve filtrech chybělo to, na co se lidé ptají nejdřív: je tam elektřina?
// voda? a prodává se celý pozemek, nebo jen podíl? V datech to nebylo —
// ale POPIS inzerátu se u většiny zdrojů stahoval už dávno a jen se
// zahazoval (používal se pouze k určení druhu pozemku).
//
// Číst z volného textu je ale zrádné a celá cena téhle věci je v tom,
// aby web netvrdil něco, co v inzerátu nestojí:
//
//   · ZÁPOR JE DŮLEŽITĚJŠÍ NEŽ SLOVO. „Pozemek bez elektřiny" obsahuje
//     slovo „elektřina". Naivní hledání ho označí za pozemek s elektřinou,
//     a to je horší lež než mlčet.
//   · ZÁPOR SE MUSÍ ZASTAVIT. „Elektřina je, voda není" nesmí shodit
//     i tu elektřinu.
//   · HRANICE SLOVA (\b) V JAVASCRIPTU NEZNÁ ČEŠTINU. Za „í" žádná
//     hranice není, takže „není" se nechytí. Právě na tom modul napoprvé
//     spadl a proto se všechno srovnává bez diakritiky.
//
// Testuje se na větách, jaké lidé do inzerátů opravdu píšou.
import { createRequire } from 'node:module';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
const ROOT = new URL('..', import.meta.url).pathname;
const V = createRequire(import.meta.url)(path.join(ROOT, 'js', 'vybaveni.js'));

let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
const site = (t) => V.najdi(t).site.slice().sort().join(',');
function sedi(text, ceka) {
  const c = ceka.slice().sort().join(',');
  pravda(`„${text.length > 62 ? text.slice(0, 60) + '…' : text}"`, site(text) === c,
    `vyšlo [${site(text)}], čekáno [${c}]`);
}

/* --- 1) Co tam je ------------------------------------------------------ */
sedi('Elektřina a voda na hranici pozemku.', ['elektrina', 'voda']);
sedi('Přípojky: elektro, vodovod i kanalizace.', ['elektrina', 'voda', 'kanalizace']);
sedi('Veškeré inženýrské sítě jsou na hranici: elektřina, voda, plyn i kanalizace.',
  ['elektrina', 'voda', 'plyn', 'kanalizace']);
sedi('K pozemku vede zpevněná příjezdová cesta.', ['cesta']);
sedi('Na pozemku je vlastní studna.', ['voda']);
sedi('V obci je plynofikace.', ['plyn']);
sedi('Odpady řeší septik.', ['kanalizace']);

/* --- 2) Co tam NENÍ (a modul to nesmí tvrdit) -------------------------- */
sedi('Pozemek bez elektřiny a vody.', []);
sedi('Na pozemku není zavedena elektřina.', []);
sedi('Pozemek je bez přípojek.', []);
sedi('Inženýrské sítě nejsou zavedeny.', []);
sedi('Vodovod ani kanalizace k pozemku nevedou, elektřina chybí.', []);
sedi('Bez vody, bez elektřiny, bez plynu.', []);
sedi('Vodovod k pozemku nevede.', []);
sedi('Pozemek nemá žádné přípojky.', []);
sedi('Elektřina zatím není připojena.', []);

/* --- 3) Zápor se musí zastavit ---------------------------------------- */
sedi('Elektřina je, voda není.', ['elektrina']);
sedi('Studna na pozemku, elektřina zavedena není.', ['voda']);
sedi('V obci je vodovod, elektřina zavedena, plyn chybí.', ['elektrina', 'voda']);
sedi('Bez kanalizace. Elektřina i voda na hranici.', ['elektrina', 'voda']);
sedi('Pozemek nemá plyn, ale elektřina i voda jsou zavedené.', ['elektrina', 'voda']);

/* --- 3b) Voda, která není voda k pozemku ------------------------------
   Slovo „voda" v inzerátu často mluví o vodě, která je STAROST, ne
   přípojka: odpadní, dešťová, spodní, nebo rovnou záplavové území.
   Modul u nich hlásil vodu — a u záplavového území tím dokonce dělal
   z varování výhodu. Přípojka se z takové věty vyčíst nedá. */
sedi('Odpadní vody jsou řešeny jímkou.', ['kanalizace']);
sedi('Dešťová voda je svedena do vsakovací jímky.', ['kanalizace']);
sedi('V území se vyskytuje spodní voda.', []);
sedi('Záplavové území — velká voda tudy šla v roce 2002.', []);
sedi('Retenční nádrž na dešťovou vodu.', []);
sedi('Pozemek s výhledem na vodní plochu, elektřina na hranici.', ['elektrina']);
/* Opačný směr: skutečná přípojka se tím nesmí ztratit. */
sedi('Vodovodní řad vede podél pozemku.', ['voda']);
sedi('Na pozemku je vlastní studna a odpadní vody jdou do septiku.', ['kanalizace', 'voda']);

/* --- 3c) Příjezd po komunikaci ----------------------------------------
   „Zpevněná komunikace" a „místní komunikace" jsou v inzerátech stejně
   běžné jako „cesta" — modul je přitom nečetl vůbec. */
sedi('Přístup po zpevněné komunikaci.', ['cesta']);
sedi('Příjezd po místní komunikaci.', ['cesta']);
sedi('K pozemku nevede zpevněná komunikace.', []);

/* --- 4) Podíl --------------------------------------------------------- */
{
  const podil = (t) => V.najdi(t).podil;
  pravda('„spoluvlastnický podíl" se pozná', podil('Prodej spoluvlastnického podílu o velikosti 1/2.'));
  pravda('„id. podíl" taky', podil('Nabízíme id. podíl 1/4 na pozemku.'));
  pravda('a podíl zapsaný zlomkem', podil('Podíl 3/8 na parcele č. 254/1.'));
  pravda('celý pozemek se za podíl nepovažuje', !podil('Prodáváme celý pozemek, 1/1.'));
  pravda('ani obyčejný inzerát bez zmínky', !podil('Krásný stavební pozemek v klidné části obce.'));
  pravda('a výslovné popření podílu se respektuje',
    !podil('Nejedná se o podíl, prodává se celá parcela.'));
  /* Tohle vyšlo najevo až ze skutečných inzerátů: podíl na PŘÍSTUPOVÉ
     cestě není podíl na pozemku. Parcela se prodává celá a k ní patří
     osmina společné cesty — označit to za podíl by bylo zavádějící. */
  pravda('podíl na přístupové cestě není podíl na pozemku',
    !podil('Prodej parcely • spoluvlastnickým podílem 1/8 na společném přístupovém pozemku • jednotné oplocení.'));
  pravda('ale podíl na pozemku se pozná i vedle podílu na cestě',
    podil('Podíl 1/3 na pozemku i podíl 1/8 na přístupové cestě.'));
  pravda('a velký zlomek taky', podil('LV č. 165 o výměře 3012 m², podíl 945/15288'));

  /* Právnické tvary, kterými se podíl píše v dražbách a na listech
     vlastnictví. Slovo „podíl" v nich vůbec nemusí být — a modul je
     proto přehlížel, přestože jde o tutéž věc. */
  pravda('„podílové spoluvlastnictví" je podíl',
    podil('Pozemek je v podílovém spoluvlastnictví.'));
  pravda('„ideální polovina" je podíl', podil('Prodej ideální poloviny pozemku.'));
  pravda('„ideální 1/2" je podíl', podil('Dražba ideální 1/2 pozemku p. č. 84.'));
  pravda('„id. 1/2" bez slova podíl je podíl', podil('Prodej id. 1/2 orné půdy.'));
  pravda('„podíl ve výši" je podíl', podil('Podíl ve výši jedné poloviny.'));
  /* A co se přitom nesmí chytit. „Ideální" je v inzerátech nejčastěji
     chvála, ne zlomek. */
  pravda('„ideální poloha" podíl není', !podil('Ideální poloha pro stavbu rodinného domu.'));
  pravda('„ideální pozemek" podíl není', !podil('Ideální pozemek pro zahrádkáře.'));
  pravda('a popření i u nových tvarů platí',
    !podil('Pozemek není v podílovém spoluvlastnictví, prodává se celý.'));
  /* Stejná výjimka jako u slova podíl: ideální zlomek CESTY není podíl
     na pozemku. */
  pravda('ideální zlomek přístupové cesty není podíl na pozemku',
    !podil('Prodej parcely, k ní ideální 1/8 na společné přístupové cestě.'));
}

/* --- 5) Co se nesmí stát ----------------------------------------------- */
{
  pravda('prázdný text nic netvrdí',
    V.najdi('').site.length === 0 && V.najdi(null).site.length === 0 && V.najdi(undefined).site.length === 0);
  pravda('krátký text se označí jako „nevíme"', V.najdi('Pozemek.').znamo === false);
  pravda('delší text jako „víme"', V.najdi('Pěkný rovinatý pozemek na okraji obce, vhodný k rekreaci.').znamo === true);
  // Diakritika nesmí rozhodovat — lidé píšou obojí.
  pravda('funguje i bez háčků', site('Elektrina a voda na hranici.') === 'elektrina,voda',
    site('Elektrina a voda na hranici.'));
  pravda('a zápor bez háčků taky', site('Pozemek bez elektriny.') === '', site('Pozemek bez elektriny.'));
  // Tisíc průchodů nesmí zpomalit sběr dat ani se zacyklit.
  const t0 = Date.now();
  for (let i = 0; i < 2000; i++) V.najdi('Elektřina, voda, plyn i kanalizace jsou na hranici pozemku, příjezd zpevněný.');
  pravda('dva tisíce popisů se zvládne pod vteřinu', Date.now() - t0 < 1000, `${Date.now() - t0} ms`);
}

/* --- 6) Je to zapojené? ------------------------------------------------ */
{
  const robot = readFileSync(path.join(ROOT, 'scripts', 'fetch-opportunities.mjs'), 'utf8');
  const main = readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8');
  const idx = readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  pravda('robot modul používá', /PKVybaveni\.najdi/.test(robot));
  const zdroje = (robot.match(/pridejVybaveni\(out\[out\.length - 1\]/g) || []).length;
  pravda('a bere popis ze všech tří zdrojů, které ho mají', zdroje === 3, `zapojeno ${zdroje}`);
  pravda('prázdné vybavení se do dat nezapisuje (soubor by jen nabobtnal)',
    /if \(v\.site\.length\) o\.site = v\.site;/.test(robot));
  pravda('web filtruje podle vybavení', /okVybaveni && okCelek/.test(main));
  pravda('a pilulku bez nabídek vůbec neukáže', /p\.el\.hidden = !maSmysl/.test(main));
  pravda('index.html načítá js/vybaveni.js', /<script src="js\/vybaveni\.js/.test(idx));
  pravda('a stojí u toho, odkud se to bere',
    /Podle toho, co stojí v popisu nabídky/.test(idx),
    'bez téhle věty by to vypadalo, že nabídky bez popisu elektřinu nemají');
  /* Ze skutečných inzerátů vyšlo, že většina zmínek zní „možnost napojení"
     nebo „sítě na hranici pozemku" — ne „zavedeno na pozemku". Nadpis i
     poznámka to musí říct, jinak by web sliboval víc, než v inzerátu je. */
  pravda('nadpis neslibuje víc, než v inzerátu stojí',
    /Co uvádí inzerát/.test(idx) && !/Co je u pozemku<\/span>/.test(idx),
    'nadpis „Co je u pozemku" tvrdí, že tam ta síť je — inzeráty přitom často píšou jen „v dosahu"');
  pravda('a poznámka rozlišuje zavedeno od „v dosahu"',
    /zavedená, nebo zatím jen v dosahu/.test(idx));
}

/* --- 7) A je to taky VIDĚT? --------------------------------------------
   Dlouho platilo, že se podle sítí a podílu dalo filtrovat, ale nikde
   se nedaly přečíst. Kdo si zaškrtl „elektřina", neměl si to na čem
   ověřit — a u podílu to bylo ještě horší: cena za metr pak vypadá jako
   trhák, přestože se kupuje zlomek pozemku.
   Hlídají se všechna čtyři místa, kam se člověk podívá. */
{
  const main = readFileSync(path.join(ROOT, 'js', 'main.js'), 'utf8');
  const poz = readFileSync(path.join(ROOT, 'js', 'pozemek.js'), 'utf8');
  const pozHtml = readFileSync(path.join(ROOT, 'pozemek.html'), 'utf8');
  const gen = readFileSync(path.join(ROOT, 'scripts', 'generate-region-pages.mjs'), 'utf8');
  pravda('karta v seznamu podíl přizná', /opp-podil/.test(main));
  pravda('detail na mapě vypíše, co inzerát uvádí', /Inzerát uvádí/.test(main) && /uvadiHtml\(d\)/.test(main));
  pravda('stránka pozemku taky', /Inzerát uvádí/.test(poz));
  pravda('a stránka pozemku si modul vůbec načítá', /<script src="js\/vybaveni\.js/.test(pozHtml),
    'bez načtení by se řádek tiše nevypsal a nikde by to nezakřičelo');
  /* Schválně se hledá ten VÝPIS, ne jen slovo: „inzerát uvádí" stojí
     i v komentáři nad ním, takže volnější vzorek by přežil i vypnutí
     celé té věci. (Přišlo se na to sabotáží — kontrola neprošla, když
     měla.) */
  pravda('okresní a krajské stránky taky',
    /bits\.push\('inzerát uvádí <b>'/.test(gen) && /bits\.push\('<b>spoluvlastnický podíl<\/b>'\)/.test(gen));

  /* A hlavně: opravdu to v hotových stránkách STOJÍ. Generátor se dá
     změnit a zapomenout spustit — tohle projde jen tehdy, když jsou
     vygenerované stránky skutečně aktuální. */
  const data = JSON.parse(readFileSync(path.join(ROOT, 'data', 'opportunities.json'), 'utf8')).opportunities || [];
  const okresSeSitemi = {};
  for (const d of data) if (d.okres && d.site && d.site.length) okresSeSitemi[d.okres] = (okresSeSitemi[d.okres] || 0) + 1;
  const nej = Object.keys(okresSeSitemi).sort((a, b) => okresSeSitemi[b] - okresSeSitemi[a])[0];
  if (!nej) {
    pravda('v datech je aspoň jeden okres se sítěmi', false, 'nenašel se žádný — nebo robot sítě přestal číst');
  } else {
    const soubor = 'pozemky-okres-' + nej.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') + '.html';
    const cesta = path.join(ROOT, soubor);
    if (!existsSync(cesta)) {
      pravda('okresní stránka existuje', false, soubor + ' chybí');
    } else {
      const html = readFileSync(cesta, 'utf8');
      pravda(`hotová stránka okresu ${nej} to opravdu vypisuje`,
        /inzerát uvádí <b>/.test(html),
        `v ${soubor} není ani jedno „inzerát uvádí" — spusťte node scripts/generate-region-pages.mjs`);
    }
  }
}

console.log('\nCo je u pozemku — čtení z popisu nabídky');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Vybavení: ' + chyb + ' kontrol neprošlo.'); process.exit(1); }
process.exit(0);
