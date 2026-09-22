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
import { readFileSync } from 'node:fs';
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
}

console.log('\nCo je u pozemku — čtení z popisu nabídky');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Vybavení: ' + chyb + ' kontrol neprošlo.'); process.exit(1); }
process.exit(0);
