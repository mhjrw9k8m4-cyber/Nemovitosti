// Generátor regionálních SEO stránek z reálných dat (data/opportunities.json).
// Vytváří: okresní stránky, krajské stránky, národní přehled dražeb a rozcestník.
// Spouští se automaticky po aktualizaci dat (viz .github/workflows/update-data.yml),
// takže stránky nikdy nezestárnou. Ručně: `node scripts/generate-region-pages.mjs`.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { jsonVeStrance } from './json-do-stranky.mjs';
/* Odkaz na vlastní stránku pozemku. Které nabídce patří která stránka
   rozhoduje generátor těch stránek — proto se to mapování odsud jen
   PŮJČUJE. Spočítat si ho tu podruhé by znamenalo dvě pravdy o jednom
   názvu souboru a odkazy na 404, jakmile se rozejdou. */
import { mapaSouboru, klicNabidky } from './generate-parcel-pages.mjs';
/* Archiv: jediné místo na webu, které ví, jak se trh chová v ČASE.
   Co se z něj smí a nesmí tvrdit, řeší scripts/archiv-statistiky.mjs —
   stránka si nic nepočítá sama, aby na dvou místech nevznikla dvě
   čísla. */
import { statistiky, nactiArchiv, MIN_ZMEN } from './archiv-statistiky.mjs';
import { kmMezi } from './srovnatelne.mjs';
/* Řez „co je nového" má vlastní modul — a má ho proto, že jeho hlavní
   podmínka (vynechat první den evidence) se na dnešních datech nedá
   vyzkoušet: okno ten den vyloučí samo. Ve funkci se dá podstrčit
   vzorek, ve kterém ten den uvnitř okna leží. Viz komentář tam. */
import * as NOV from './novinky-rez.mjs';
/* Jména krajů, druhové stránky a názvy souborů: jedno místo pro tenhle
   generátor i pro generátor stránek pozemků (scripts/regiony-meta.mjs). */
import * as META from './regiony-meta.mjs';
const { slug, krajFile, okresFile } = META;

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* Termíny se píšou stejně jako v prohlížeči — tentýž js/terminy.js.
   Krajské a okresní stránky tiskly syrové „dražba 2026-10-21": zápis pro
   stroje uprostřed české věty. Česky je to 21. 10. 2026. Kdyby se tu
   převod napsal podruhé, dřív nebo později se ty dva rozejdou. */
new Function(fs.readFileSync(path.join(ROOT, 'js', 'terminy.js'), 'utf8'))();
const T = globalThis.PK_TERMINY;
/* Co inzerát uvádí (sítě, podíl) se čte stejným modulem jako v aplikaci —
   robot to do dat ukládá, ale na okresních a krajských stránkách to dosud
   nebylo VIDĚT, přestože právě sem chodí lidé z vyhledávačů. */
const require_ = createRequire(import.meta.url);
const VYB = require_(path.join(ROOT, 'js', 'vybaveni.js'));
/* Klíč archivu a pravidla pro změnu ceny — tytéž moduly, jaké čte mapa.
   Kdyby se tu pravidlo „co je zlevnění" napsalo podruhé, web by o téže
   nabídce na kartě a na stránce tvrdil dvě různé věci — a právě proto
   ta pravidla v js/zlevneni.js stojí na jednom místě. */
new Function(fs.readFileSync(path.join(ROOT, 'js', 'klic.js'), 'utf8'))();
const PKKlic = globalThis.PKKlic;
const PKZ = require_(path.join(ROOT, 'js', 'zlevneni.js'));
/* Razítko proti staré kopii v prohlížeči. Dřív to bylo ručně psané číslo
   (v=20260902f) — a při úpravě stylu se zapomnělo přepsat, takže lidem
   chodila pořád stará verze a z nových úprav nebylo vidět nic. Nikde přitom
   nic nespadlo. Teď se počítá z OBSAHU souboru, takže se změní právě tehdy,
   když se změní soubor. Hlídá to scripts/orazitkuj-verze.mjs --kontrola. */
function razitko(rel) {
  try {
    return 'v=' + createHash('sha1').update(fs.readFileSync(path.join(ROOT, rel))).digest('hex').slice(0, 8);
  } catch (e) { return 'v=0'; }
}
const V = {
  /* Očištěná kopie, ne zdroj — tu si stahuje prohlížeč
     (viz scripts/minifikace.mjs). Razítko se musí počítat z TOHO
     souboru, který se opravdu načítá, jinak se po úpravě stylu
     nezmění a lidem zůstane v mezipaměti ta stará podoba. */
  css: razitko('css/styles.min.css'),
  config: razitko('js/config.js'),
  auth: razitko('js/auth.js'),
  hlavicka: razitko('js/hlavicka.js'),
  grafCen: razitko('js/graf-cen.js'),
  offline: razitko('js/offline.js'),
  mereni: razitko('js/mereni.js'),
  hledani: razitko('js/hledani.js'),
  cenyHledani: razitko('js/ceny-hledani.js'),
  leafletJs: razitko('vendor/leaflet/leaflet.js'),
  leafletCss: razitko('vendor/leaflet/leaflet.css'),
  menu: razitko('js/menu.js'),
};
/* Práh byl 10 a bez vlastní stránky kvůli tomu zůstávalo DVANÁCT okresů,
   které data mají — mimo jiné Most. Člověk z Mostu klikl na svůj okres
   a skončil na obecné mapě. Stránka s pěti nabídkami je pořád stránka;
   prázdná by byla horší, ale prázdný okres v datech není ani jeden. */
const MIN_OKRES = 3;    // okres musí mít aspoň tolik nabídek pro vlastní stránku
const MIN_KRAJ = 15;    // kraj musí mít aspoň tolik nabídek pro vlastní stránku

/* OKRES → KRAJ SE NEOPISUJE. Tahle tabulka o 78 položkách ležela
   v repozitáři třikrát: tady, v js/ceny.js a v js/main.js. Dnes všechny
   tři souhlasí (naměřeno), ale tenhle repozitář už má svou historii
   rozejitých kopií — cenový verdikt, termíny dražeb, adresa snímku —
   a každá z nich se poznala až tím, že web o téže věci tvrdil dvě různé
   věci. Sestavení stránek si ji proto bere z js/ceny.js, který se
   stejně načítá o pár řádků níž kvůli cenám.
   js/main.js svou kopii mít MUSÍ: hlidani.html a zpravy.html ho
   načítají bez js/ceny.js. Že se ty dvě nerozejdou, hlídá
   scripts/test-okres.mjs. */
const KRAJ_ORDER = META.KRAJ_ORDER;
const KRAJ_META = META.KRAJ_META;
const TYPE_LABEL = { sale:'Na prodej', drazba:'Dražba', exekuce:'Exekuce', obec:'Záměr obce', majitel:'Od majitele' };

function esc(s){ return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
const attr = esc;
function fmt(n){ return (typeof n==='number'&&isFinite(n)) ? n.toLocaleString('cs-CZ') : ''; }
/* Čeština má u čísel tři tvary, ne dva: 1 okres, 2 okresy, 5 okresů.
   Štítky u čísel se psaly natvrdo v množném čísle, takže kraj Praha
   (má jediný okres) hlásil „1 okresů" a okres s jednou dražbou
   „1 dražby". Vypadá to jako strojový překlad — a je to jediné místo,
   kde si člověk všimne, že ta čísla nikdo nečetl. */
function sklon(n, jedna, dveAzCtyri, petAVic){
  if(n === 1) return jedna;
  if(n >= 2 && n <= 4) return dveAzCtyri;
  return petAVic;
}
function pluralPozemek(n){ return sklon(n, 'pozemek', 'pozemky', 'pozemků'); }
/* PŘÍDAVNÉ JMÉNO SE MUSÍ SKLOŇOVAT S NÍM. Podstatné jméno se tu
   skloňovalo správně, ale „Zbývajících" stálo natvrdo ve druhém pádě,
   takže na stránce vinic a sadů (zbývaly dva pozemky) svítilo
   „Zbývajících 2 pozemky". Velikost chyby je jedno slovo, ale je to
   přesně ten druh, který nikdo nehlásí a každý vidí. */
function zbyvajici(n){ return sklon(n, 'Zbývající', 'Zbývající', 'Zbývajících'); }
function write(file, html){ fs.writeFileSync(path.join(ROOT, file), html); }

const data = JSON.parse(fs.readFileSync(path.join(ROOT,'data','opportunities.json'),'utf8'));
/* Kdy robot naposledy zdroje procházel. Časté dotazy slibují „u každé
   lokality vidíte, kdy proběhla poslední aktualizace" — a na krajských
   ani okresních stránkách to nikde nestálo, takže ten slib nebyl čím
   podepřít. Píše se česky, ne 2026-09-22. */
/* Jedno místo, kde se „2026-09-14" mění na „14. 9. 2026". Psalo se to
   tu jednou pro razítko čerstvosti; se sekcí o chování trhu by to bylo
   podruhé, a dvě kopie téhož převodu se dřív nebo později rozejdou. */
function datumCesky(ymd) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ymd || ''));
  return m ? `${+m[3]}. ${+m[2]}. ${m[1]}` : '';
}
const zkontrolovano = datumCesky(data.updated);
const razitkoCerstvosti = zkontrolovano
  ? `<p class="okr-cerstvost mono">Zdroje naposledy zkontrolovány ${zkontrolovano} · robot je prochází každých 6 hodin</p>`
  : '';
/* Duplicity se odstraňují TOUTÉŽ funkcí jako v prohlížeči (js/hlidani-logika.js).
   Kdyby si generátor počítal po svém, napsal by do HTML jiné číslo, než
   pak ukáže skript — a na jedné stránce by vedle sebe stála dvě. */
const PKH = require_(path.join(ROOT, 'js', 'hlidani-logika.js'));

/* DUPLICITY SE ODSTRAŇUJÍ HNED, JEDNOU PRO VŠECHNO.
   Mapa v aplikaci je odstraňuje taky (js/main.js volá PKHlidani.bezDuplicit),
   takže cokoli, co se spočítá ze syrových dat, slibuje víc, než je vidět.
   Přesně to se dělo: rozcestník tvrdil „přes 1 971 pozemků na jedné mapě",
   zatímco mapa jich ukazovala 1 958, a úvodní stránka uváděla ještě třetí
   číslo — počítala se totiž jediná ze všech správně.
   Tři různá čísla pro tutéž věc na třech stránkách téhož webu.
   Když se odstraní hned tady, nemůže se to rozejít: všechny stránky
   i všechny součty vycházejí z téže hromádky jako aplikace. */
const vseSyrove = Array.isArray(data.opportunities) ? data.opportunities : [];
const all = PKH.bezDuplicit(vseSyrove);
/* Vstup je týž (tentýž soubor, tatáž funkce na duplicity), takže mapování
   sedí na to, co generátor stránek pozemků opravdu vyrobí. */
const STRANKY = mapaSouboru(all);
/* SEZNAM NABÍDEK PRO VYHLEDÁVAČE — jedno místo pro okresy, kraje
   i druhy. Dřív si ho dvě z těch tří stránek stavěly samy a třetí
   (krajská) ho neměla vůbec, takže o nabídkách v kraji vyhledávač
   věděl jen tolik, kolik stálo v popisu stránky.

   KAŽDÁ POLOŽKA NESE ODKAZ. Bez `url` je ListItem jen jméno v poli —
   vyhledávač z něj nepozná, že za každou položkou je vlastní stránka
   s cenou a mapou. Adresa se bere z TÉŽE mapy jmen, podle které ty
   stránky vznikly (mapaSouboru), ne z výpočtu: na holém klíči se
   nabídky srážejí a odkaz by vedl na cizí pozemek — táž vada se už
   jednou opravovala v kanálech novinek a v rozesílači pošty.

   DVACET POLOŽEK STAČÍ. Je to ukázka, ne výpis celé stránky; celkový
   počet nese numberOfItems vedle. */
function seznamNabidek(list, celkem, kolik = 20) {
  const items = [];
  for (const o of list.slice(0, kolik)) {
    const str = STRANKY.get(klicNabidky(o));
    const polozka = { '@type': 'ListItem', position: items.length + 1,
      name: `${o.place} — ${TYPE_LABEL[o.type] || o.type}${o.area ? ', ' + o.area + ' m²' : ''}` };
    if (str && str.soubor) polozka.url = SITE + str.soubor;
    items.push(polozka);
  }
  return { '@type': 'ItemList', numberOfItems: celkem, itemListElement: items };
}
if(vseSyrove.length !== all.length){
  console.log(`Duplicit odstraněno: ${vseSyrove.length - all.length} (zůstalo ${all.length}) — stejně jako v aplikaci.`);
}
if(!all.length){ console.error('Žádná data — generování přeskočeno.'); process.exit(0); }

// Úklid: smaž jen VLASTNÍ vygenerované stránky (ne rádce jako pozemky-od-obce.html
// ani rozcestník pozemky-podle-okresu.html), ať po změně dat nezůstanou sirotci.
for(const f of fs.readdirSync(ROOT)){
  if(/^pozemky-okres-.+\.html$/.test(f) || /^pozemky-.+-kraj\.html$/.test(f)) fs.rmSync(path.join(ROOT,f));
}

/* DRAŽBA PO TERMÍNU UŽ NENÍ PŘÍLEŽITOST — dražit se nedá. Aplikace ji
   z výpisu, z mapy i z počtů vyřazuje (js/main.js: „Dražba po termínu už
   není příležitost"), ale tyhle stránky ne — a jsou to právě ony, na které
   lidé chodí z vyhledávačů. Naměřeno: tři dražby s termínem včerejška
   stály na okresních stránkách jako nabídka, zatímco mapa je už
   nepočítala. Dvě odpovědi na tutéž otázku na témž webu.
   Zdroj je drží jako „Uveřejněno", dokud je nezpracuje, a mezi dvěma běhy
   robota (6 h) termín projít může — tohle tedy není chyba dat, ale okno,
   které musí zavřít obě strany stejně.
   Stránka pozemku zůstává (odkaz z e-mailu nebo ze záložek nesmí spadnout
   na 404); vypíná se jen její řádek ve výpisu a započítání do součtů. */
/* Podmínka bydlí v js/terminy.js, ať ji nemá každá strana svou. Tady
   stála doslova a strojové řezy ji neměly vůbec — viz komentář tam. */
const proslyTermin = T.poTerminu;
const prosle = all.filter(proslyTermin);
const aktualni = all.filter((o) => !proslyTermin(o));
if(prosle.length) console.log(`Po termínu vynecháno: ${prosle.length} (zůstalo ${aktualni.length}) — stejně jako v aplikaci.`);

/* CENOVÝ MODEL SE NAČÍTÁ PRVNÍ, protože z něj bere cenu za metr i hledání
   mezí. Dřív stál až za spoctiMeze() a meze se počítaly ze surové ceny
   za metr, zatímco mapa počítá jinak — viz zaMetrPoctive() výš.
   A ještě o kus výš, než býval: bere se z něj i tabulka okres → kraj,
   kterou potřebuje hned první průchod daty pár řádků pod tímhle. */
new Function(fs.readFileSync(path.join(ROOT, 'js', 'ceny.js'), 'utf8'))();
const CENY = globalThis.PK_CENY;
const OKRES_KRAJ = (CENY && CENY.OKRES_KRAJ) || {};
if (!CENY || !CENY.zaMetr || !Object.keys(OKRES_KRAJ).length) {
  /* Raději spadnout než vydat 91 stránek se špatnými čísly. */
  console.error('js/ceny.js se nenačetl — cena za metr by se počítala jinak než v mapě.');
  process.exit(1);
}

const byOkres = {}, byKraj = {};
for(const o of aktualni){
  if(o.okres){ (byOkres[o.okres]=byOkres[o.okres]||[]).push(o); }
  const k = OKRES_KRAJ[o.okres]; if(k){ (byKraj[k]=byKraj[k]||[]).push(o); }
}
const eligibleOkres = Object.keys(byOkres).filter(ok=>byOkres[ok].length>=MIN_OKRES);
const eligibleKraj  = KRAJ_ORDER.filter(k=>byKraj[k] && byKraj[k].length>=MIN_KRAJ);
const hasOkresPage = new Set(eligibleOkres);
const hasKrajPage  = new Set(eligibleKraj);

/* ---------- Cenový přehled (unikátní funkce): medián Kč/m² podle druhu a regionu ----------
   Poctivě: počítá se jen z nabídek, kde je cena i výměra; Kč/m² dává smysl jen
   v rámci jednoho druhu (stavební × pole × les), proto rozdělené podle druhu.
   Číslo se ukáže jen tam, kde je dost vzorků (MIN_PRICE), a vždy se uvádí počet. */
const MIN_PRICE = 10;
function druhGroup(s){
  s=(s||'').toLowerCase();
  if(/stav/.test(s)) return 'Stavební';
  if(/les/.test(s)) return 'Lesní pozemek';
  if(/zahrad/.test(s)) return 'Zahrada';
  if(/orná|orna|louka|travní|travni|pastvin|zeměděl|zemedel|chmel|vinice|sad|ovocn|pole/.test(s)) return 'Zemědělská půda';
  return 'Ostatní';
}
function median(a){ if(!a.length) return 0; a=a.slice().sort((x,y)=>x-y); const n=a.length; return n%2 ? a[(n-1)/2] : (a[n/2-1]+a[n/2])/2; }
function pctl(a,p){ if(!a.length) return 0; a=a.slice().sort((x,y)=>x-y); return a[Math.max(0,Math.min(a.length-1,Math.floor(a.length*p)))]; }
// Vrátí mapu skupina -> {n, med, lo, hi} pro danou sadu nabídek (jen platné Kč/m²).
/* SPODNÍ MEZ UVĚŘITELNOSTI — hledá se v datech, nenastavuje se od stolu.
 *
 * Medián zemědělské půdy vycházel v některých okresech na 8 Kč/m². Tolik
 * pole v Česku nestojí; jsou to spoluvlastnické podíly (v inzerátu je výměra
 * celé parcely, cena jen za zlomek) a špatně načtené ceny. V malém okrese
 * jich stačí pár a medián je strhnou — Znojmo 8, Česká Lípa 8. Web tím
 * tvrdil něco, co není pravda.
 *
 * Nejde to ale utnout jedním číslem pro všechno. Změřeno na datech:
 * u zemědělské půdy je rozdělení DVOUVRCHOLOVÉ — těsný shluk na 5–10 Kč/m²,
 * pak skoro prázdno na 12–17 a teprve od 20 výš vlastní trh. U lesa žádná
 * nabídka pod 12 Kč/m² není. U zahrad a stavebních pozemků je rozdělení
 * plynulé a levné kusy jsou skutečné — plošný práh by tam smazal poctivé
 * nabídky a medián vyhnal nahoru. Jinými slovy: co je u pole nesmysl, je
 * u zahrady normální cena.
 *
 * Proto se hledá MEZERA v samotném rozdělení: shluk dole, za ním pásmo
 * skoro bez nabídek, a nad ním trh. Když žádná taková mezera není,
 * neuřízne se nic. Rozhoduje tvar dat, ne můj odhad.
 */
/* CENA ZA METR SE POČÍTÁ Z VÝMĚRY, KTERÁ KUPUJÍCÍMU PŘIPADNE.
 *
 * Tyhle stránky ji dělily cenou lomeno celou výměrou. U spoluvlastnického
 * podílu je ale v inzerátu výměra CELÉ parcely a cena jen za ten zlomek,
 * takže vyšlo číslo, které neplatí pro nikoho. Mapa i stránka pozemku
 * přitom odjakživa počítají přes js/ceny.js s podílem — takže web o téže
 * nabídce tvrdil dvě různá čísla:
 *
 *     Benešov, podíl 1/6, 28 000 Kč, 5 023 m²
 *     stránka okresu:  6 Kč/m²        mapa a stránka pozemku: 33 Kč/m²
 *
 * Změřeno na ostrých datech: ze 1 980 řádků s cenou a výměrou se číslo
 * mění u 510 (26 %) a u nejmenších podílů o dva řády (1/71: ze 14 na
 * 1 008 Kč/m²) — takový podíl se na stránce tvářil jako nejlevnější
 * pozemek v republice. U deseti nabídek velikost podílu neznáme; tam se
 * číslo neukáže vůbec, stejně jako ho neukáže mapa. Vymyslet si ho nelze.
 *
 * Mediány okresů a krajů tím stoupnou (zemědělská půda 45 → 62 Kč/m²,
 * les 35 → 48). Není to zdražení, jen přestalo tlačit dolů číslo, které
 * do výpočtu nepatřilo.
 *
 * ZDE BÝVALA „SPODNÍ MEZ UVĚŘITELNOSTI" — heuristika, která v rozdělení
 * hledala mezeru a nejlevnější shluk odřízla. Odůvodnění znělo, že ten
 * shluk jsou spoluvlastnické podíly. NENÍ. Změřeno jmenovitě na
 * odříznutých nabídkách: ze 137 odříznutých má pole `podil` PRÁVĚ NULA.
 * A nemůže mít — podíly přepočítává zaMetrPoctive o pár řádků výš, takže
 * než se ořez spustí, jsou dávno srovnané (jejich medián je 150 Kč/m²,
 * tedy NAD trhem, ne pod ním).
 *
 * Co v tom shluku opravdu je: ze 135 nabídek zemědělské půdy pod mezí
 * 16,2 Kč/m² je 132 prodej státní půdy podle § 12. To není nabídková
 * cena, ale cena stanovená úředně — a vynechává se proto jmenovitě
 * (CENY.spravniCena v js/ceny.js), stejně jako se jmenovitě vynechává
 * vyvolávací cena dražby. Jmenovitá výjimka je ověřitelná; tvar
 * rozdělení je dohad, a tenhle dohad se mýlil na obě strany: tři
 * skutečné tržní nabídky uřízl, dvacet jedna nabídek SPÚ nad mezí
 * nechal, a u zahrad a ostatní plochy (42 nabídek SPÚ) nehlídal nic,
 * protože se tam záměrně nespouštěl. */
function zaMetrPoctive(o){
  const v = CENY.zaMetr(o);
  return (v == null || !isFinite(v)) ? null : v;
}
/* Do ceny se počítají JEN běžné nabídky k prodeji.
   Vyvolávací cena dražby ani odhad u exekuce není nabídková cena: první je
   z podstaty věci pod trhem, druhá bývá u zastavěných pozemků naopak vysoko.
   Když se počítaly dohromady, tvrdil web o téže věci dvě různá čísla —
   stránka cen hlásila u zahrady 140 Kč/m², kdežto odhad u pozemku počítal
   se 110 Kč/m² (ten dražby vynechával odjakživa, viz js/ceny.js). U ostatní
   plochy dělal ten rozpor 41 %. Obě strany teď počítají z téhož. */
function jeBeznaNabidka(o){ return o.type === 'sale' && !CENY.spravniCena(o); }
function priceStats(list){
  const buckets={};
  for(const o of list){
    if(!jeBeznaNabidka(o)) continue;
    if(!(o.price>0 && o.area>=100 && o.area<=500000)) continue;
    const g=druhGroup(o.druh); if(g==='Ostatní') continue;
    const perm2 = zaMetrPoctive(o);
    if(perm2==null) continue;
    // Pole/les nad 500 Kč/m² jsou fakticky stavební parcely (jen vedené jako „orná"),
    // do ceny zemědělské půdy/lesa nepatří — jinak by zkreslily medián okresu nahoru.
    if((g==='Zemědělská půda' || g==='Lesní pozemek') && perm2>500) continue;
    (buckets[g]=buckets[g]||[]).push(perm2);
  }
  const out={};
  for(const g of Object.keys(buckets)){
    const v=buckets[g];
    if(v.length>=MIN_PRICE) out[g]={ n:v.length, med:Math.round(median(v)), lo:Math.round(pctl(v,0.25)), hi:Math.round(pctl(v,0.75)) };
  }
  return out;
}
/* Ořez nejlevnějšího shluku už tu není — proč, stojí u zaMetrPoctive výš. */

/* ODHAD CENY PATŘÍ I SEM. Mapa i stránka pozemku u každé nabídky říkají,
   jak je drahá proti okolí — na okresních, krajských a druhových
   stránkách, kam lidé chodí z vyhledávačů, stál jen holý ceník. Kdo
   přišel odtud, neměl jak poznat, jestli je 1 200 Kč/m² v tom okrese
   hodně, nebo málo.
   Model je TENTÝŽ (js/ceny.js) a pravidla se opisují z js/main.js včetně
   jejich opatrnosti: u spoluvlastnického podílu se o slevě nemluví
   (cena je za zlomek, výměra celá), neuvěřitelná sleva není nabídka,
   ale varování, a u odhadu, kterému sám model nevěří, se netvrdí nic. */
const MODEL = CENY.postav ? CENY.postav(all) : null;

function odznakCeny(o) {
  const od = MODEL && MODEL.odhad ? MODEL.odhad(o) : null;
  /* NEDŮVĚRYHODNOU CENU MUSÍ OHLÁSIT I TAHLE STRÁNKA.
     js/ceny.js má vlastní pojem „nedůvěryhodná nabídka": cena za metr pod
     padesátinou místní hladiny není skvělá koupě, ale skoro jistě podíl
     nebo chyba v inzerátu. Jeho důsledkem je, že odhad vrátí null — tedy
     model MLČÍ — a tahle funkce mlčela s ním, protože se ptala jenom
     odhadu. Mapa (js/main.js) i stránka pozemku (js/pozemek.js) se přitom
     neduveryhodna() ptají a odznak ukazují; tahle kopie pravidel se s nimi
     rozešla. A je to ta kopie, na kterou lidé chodí z vyhledávačů.

     Naměřeno: z 1 922 nabídek s cenou za metr jsou takové tři (0,16 %),
     a dvě z nich byly nejlevnější nabídky na celém webu — stavební
     pozemky za 3 a 7 Kč/m², oba s přivedenou vodou a elektřinou. V řazení
     podle ceny stály první, bez jediného varování. U toho v Českém Brodě
     píše sám inzerent „dva stavební pozemky ve velmi žádané lokalitě
     města", takže 11 000 Kč prodejní cena není.

     Výjimka u podílu je opsaná z js/main.js i s důvodem: u známého podílu
     to samé říká přesněji odznak „spoluvlastnický podíl" v řádku, a dva
     odznaky o téže věci jen zabírají místo. */
  if (MODEL && MODEL.neduveryhodna && MODEL.neduveryhodna(o) && !o.podil
      && !(od && od.podleVelikosti && (od.pochybna || od.nejisty))) {
    return '<b class="okr-overit">cena k ověření</b>';
  }
  if (!od || !od.podleVelikosti) return '';
  if (od.pochybna) return '<b class="okr-overit">cena k ověření</b>';
  if (od.nejisty && od.podOdhadem >= 25 && !od.podil) return '<b class="okr-overit">cena k ověření</b>';
  if (od.podOdhadem >= 25 && !od.podil) return `<b class="okr-sleva">\u2212${od.podOdhadem} % proti okolí</b>`;
  return '';
}
const priceNational = priceStats(all);
const priceByKraj = {}; for(const k of KRAJ_ORDER){ if(byKraj[k]) priceByKraj[k]=priceStats(byKraj[k]); }
const priceByOkres = {}; for(const ok of Object.keys(byOkres)){ priceByOkres[ok]=priceStats(byOkres[ok]); }
// Kompaktní věta o ceně pro region (nejsilnější skupina = nejvíc vzorků).
/* Od kolika nabídek se medián dá brát jako číslo o okrese, a ne jako
   průměr pár náhodných inzerátů. Není to statistická hranice, je to
   úsudek: pod pětadvaceti nabídkami posune výsledek jedna drahá parcela
   o desítky procent. Číslo se ukazuje i pod ní — okresů s menším vzorkem
   je většina a mlčet by znamenalo nemít cenu skoro nikde — ale řekne se
   u něj rovnou, na čem stojí. */
/* Mez je jedna, a je v js/ceny.js — viz komentář u DOST_NABIDEK tam.
   Opsané číslo by se rozešlo s grafem, který na téže stránce kreslí
   z téhož vzorku. */
const DOST_NABIDEK = CENY.DOST_NABIDEK;
function priceLine(stats){
  const groups=Object.keys(stats).sort((a,b)=>stats[b].n-stats[a].n);
  if(!groups.length) return '';
  const g=groups[0], s=stats[g];
  /* Rozpětí je u malého vzorku poctivější než medián samotný: ukazuje,
     jak daleko od sebe ty ceny jsou. Dřív se vypisoval jen prostředek
     a vypadal jako změřená cena okresu. */
  const rozpeti = (s.lo && s.hi && s.hi > s.lo)
    ? ` · obvykle <b>${fmt(s.lo)}–${fmt(s.hi)} Kč/m²</b>` : '';
  const pozn = s.n >= DOST_NABIDEK
    ? `(z ${s.n} nabídek)`
    : `(jen z ${s.n} ${sklon(s.n,'nabídky','nabídek','nabídek')} — na cenu okresu je to málo, berte to jako hrubé vodítko)`;
  return `Medián ceny (${g.toLowerCase()}): <b>${fmt(s.med)} Kč/m²</b>${rozpeti} <span class="okr-more" style="display:inline">${pozn}</span>`;
}

const SITE = 'https://www.parcelaka.cz/';
function crumbNav(items){
  if(!items || !items.length) return '';
  const inner = items.map(it=> it.href
    ? `<a href="${attr(it.href)}">${esc(it.name)}</a>`
    : `<span aria-current="page">${esc(it.name)}</span>`
  ).join('<span class="crumb-sep" aria-hidden="true">›</span>');
  return `\n<nav class="crumbs" aria-label="Drobečková navigace">${inner}</nav>\n`;
}
function crumbLd(items){
  return {"@type":"BreadcrumbList","itemListElement":items.map((it,i)=>{
    const li={"@type":"ListItem","position":i+1,"name":it.name};
    if(it.abs) li.item = it.abs;
    return li;
  })};
}
/* Náhled pro sdílení. Všechny stránky měly tentýž obrázek, takže krajská
   stránka poslaná do zprávy vypadala jako kterákoli jiná — z náhledu
   nebylo poznat, že jde o Jihočeský kraj. Obrázky vyrábí
   scripts/build-og.mjs (jednou, do assets/og); tady se na ně jen
   odkazuje. Když soubor není, zůstane společný og.png — chybějící
   obrázek je horší než obecný. */
function ogObrazek(nazevSouboru){
  if(nazevSouboru && fs.existsSync(path.join(ROOT,'assets','og',nazevSouboru))){
    return 'https://www.parcelaka.cz/assets/og/' + nazevSouboru;
  }
  return 'https://www.parcelaka.cz/assets/og.png?v=5';
}
/* KANÁL, KTERÝ SE K TÉHLE STRÁNCE HODÍ.
   Kanálů je patnáct: celostátní a čtrnáct krajských (scripts/generate-rss.mjs).
   Všechny stránky ale v hlavičce nabízely jen ten celostátní, takže se
   čtenář na stránce kraje nedozvěděl, že existuje kanál právě pro jeho
   kraj — a odkazoval na ně jen data.html. Čtrnáct souborů, které se
   obnovují čtyřikrát denně a nikdo je nenajde.
   Stránka kraje teď nabízí svůj kanál; stránka okresu kanál svého kraje,
   protože okresní kanály nejsou (a dělat 77 dalších souborů by bylo
   spíš na obtíž). Jméno souboru se skládá stejně jako v generátoru
   kanálů — že se ty dva nerozejdou, hlídá scripts/test-rss.mjs. */
function kanalKraje(kraj){
  return kraj ? `novinky-${slug(kraj)}.xml` : 'novinky.xml';
}
/* Jméno kanálu se čtenáři ukáže ve čtečce, takže čtrnáct stejných
   „Parcelka — nové pozemky" by k ničemu nebylo. Skládá se stejnými slovy
   jako v generátoru kanálů. */
function kanalNazevKraje(kraj){
  if (!kraj) return 'Parcelka — nové pozemky';
  return `Parcelka — nové pozemky, ${kraj === 'Vysočina' ? 'Vysočina' : kraj + ' kraj'}`;
}
/* MAPA JE JEN NA JEDNÉ STRÁNCE. Leaflet (42 kB skript + 15 kB stylu) se
   proto nepřipojuje do hlavičky všech 2 092 generovaných stránek, ale jen
   tam, kde se kreslí — jinak by 2 091 stránek stahovalo styl pro mapu,
   kterou nemají. (Cenová mapa okresů tu bývala taky; nahradil ji
   vyhledávač lokality, takže na stránce cen už se Leaflet nenačítá
   vůbec.) */
function head(title, desc, canonicalPath, ld, crumbs, ogSoubor, kanal, kanalNazev, sMapou){
  // ld může být objekt nebo pole; přidáme BreadcrumbList, je-li předán.
  let ldArr = Array.isArray(ld) ? ld.slice() : (ld ? [ld] : []);
  if(crumbs && crumbs.length) ldArr.push(crumbLd(crumbs));
  /* jsonVeStrance, ne JSON.stringify: do výpisu nabídek jdou názvy obcí
     z cizích webů a obsah <script> končí prvním koncem skriptu, i kdyby
     stál uvnitř řetězce v JSONu. Viz scripts/json-do-stranky.mjs. */
  const jsonld = ldArr.length ? jsonVeStrance(ldArr.length===1 ? ldArr[0] : ldArr) : '';
  return `<!DOCTYPE html>
<html lang="cs">
<head>
  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(title)}</title>
  <meta name="description" content="${attr(desc)}">
  <meta name="theme-color" content="#F9FAF9">
  <meta name="robots" content="index,follow">
  <link rel="canonical" href="https://www.parcelaka.cz/${canonicalPath}">
<link rel="alternate" type="application/rss+xml" title="${attr(kanalNazev || 'Parcelka — nové pozemky')}" href="${kanal || 'novinky.xml'}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="${attr(title)}">
  <meta property="og:description" content="${attr(desc)}">
  <meta property="og:locale" content="cs_CZ">
  <meta property="og:site_name" content="Parcelka">
  <meta property="og:url" content="https://www.parcelaka.cz/${canonicalPath}">
  <meta property="og:image" content="${attr(ogObrazek(ogSoubor))}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${attr(title)}">
  <meta name="twitter:description" content="${attr(desc)}">
  <meta name="twitter:image" content="https://www.parcelaka.cz/assets/og.png?v=5">
  <link rel="icon" href="assets/favicon.svg" type="image/svg+xml">
  <link rel="icon" type="image/png" sizes="192x192" href="assets/icon-192.png">
  <link rel="apple-touch-icon" href="assets/apple-touch-icon.png">
  <link rel="manifest" href="manifest.webmanifest">
  <!-- Písma leží u nás (fonts/), ne na Googlu. Přednačítají se, aby dojela
       souběžně se stylopisem — jinak si je prohlížeč objedná až ve chvíli,
       kdy ve stylu narazí na @font-face, tedy o jedno kolo později. -->
  <link rel="preload" as="font" type="font/woff2" href="fonts/inter-latin.woff2" crossorigin>
  <link rel="preload" as="font" type="font/woff2" href="fonts/fraunces-latin.woff2" crossorigin>
  <link rel="stylesheet" href="css/styles.min.css?${V.css}">
${sMapou ? `  <meta name="pk-leaflet" data-src="vendor/leaflet/leaflet.js?${V.leafletJs}">
  <link rel="stylesheet" href="vendor/leaflet/leaflet.css?${V.leafletCss}">\n` : ''}${jsonld ? '  <script type="application/ld+json">\n  '+jsonld+'\n  </'+'script>\n' : ''}</head>
<body>

<a class="skip-link" href="#obsah">Přeskočit na obsah</a>


<header id="header">
  <div class="wrap">
    <a class="logo" href="index.html" aria-label="Parcelka — domů"><span class="logo-mark" aria-hidden="true"></span>Parcelka</a>
    <a href="pridat.html" class="btn-primary header-cta"><span class="cta-full">Přidat pozemek</span><span class="cta-short">Přidat</span></a>
    <nav id="nav" aria-label="Hlavní navigace">
      <!-- Pořadí: nejdřív KDO jsem, pak KAM jdu. Účet je samostatný první
           řádek a nese stav přihlášení (doplní ho js/hlavicka.js); hned pod
           ním je hlavní věc celého webu. Dřív byl účet schovaný až čtvrtý ve
           skupině „Moje", a když jsem nahoru posunul celou skupinu, spadlo
           hledání pozemků na páté místo. Obojí bylo špatně. -->
      <a href="muj-inzerat.html" id="nav-ucet"><span class="nav-ucet-t">Můj profil</span><span class="nav-stav" id="nav-stav">Nepřihlášeno</span></a>
      <!-- „Hledat pozemek", ne „Pozemky": podstatné jméno tu neřekne nic. -->
      <a href="index.html#mapa">Hledat pozemek</a>
      <a href="cena-pozemku.html">Ceny pozemků</a>
      <details class="nav-moje"><summary id="nav-moje-sum">Moje</summary><div class="nav-moje-panel"><a href="zpravy.html" id="nav-zpravy">Zprávy</a><a href="hlidani.html" id="nav-hlidani">Hlídání</a></div></details>
      <a href="kontakt.html">Kontakt</a>
      <a href="pridat.html" class="btn-primary nav-add">Přidat pozemek</a>
      <span class="nav-cta-note">Prodáváte pozemek? Přidejte ho zdarma a bez provize.</span>
    </nav>
  </div>
</header>
${crumbNav(crumbs)}`;
}
/* `volby.graf` — načítat js/graf-cen.js. Graf cenové hladiny je jen na
   stránkách okresů a krajů (nese ho prvek `data-graf-cen`), ale skript
   se posílal na všech 105 generovaných stránek: čtrnáct z nich si
   stahovalo 8,6 kB kódu, který na nich nemá co kreslit, a mezi nimi
   zrovna ty nejnavštěvovanější vstupy z vyhledávače podle druhu
   a rozpočtu. Že se ty dvě věci nerozejdou, hlídá
   scripts/test-skripty-na-strance.mjs. */
function footer(volby){
  const graf = !!(volby && volby.graf);
  return `
<footer>
  <div class="wrap foot-bottom">
    <span class="mono">© 2026 Parcelka · data z veřejných zdrojů</span>
    <span class="foot-pravni">
      <a href="ochrana-udaju.html" data-info="soukromi">Zásady soukromí</a>
      <a href="podminky.html" data-info="podminky">Podmínky použití</a>
      <a href="kontakt.html">Kontakt</a>
    </span>
  </div>
</footer>

<div class="toast" id="toast" role="status" aria-live="polite" hidden></div>
<!-- MENU, NE FORMULÁŘ. Tady býval js/pridat.js, tedy 73,4 kB logiky
     k přidání pozemku — a to jen proto, že v něm byla obsluha mobilního
     menu. Na téhle stránce žádný takový formulář není. Modul js/menu.js
     má pod 2 kB a dělá to samé (a lépe: zavírá i Escapem a klepnutím
     mimo). Stránky okresů a krajů jsou nejčastější vstup z vyhledávače,
     takže těch 73 kB platil skoro každý návštěvník. -->
<script src="js/menu.js?${V.menu}" defer></script>
<!-- Stav přihlášení v nabídce (jméno v „Můj profil"). Musí být i tady:
     tyhle stránky se generují znovu při každém běhu datového robota,
     takže co není v šabloně, to příští běh smaže — a lidé z vyhledávání
     chodí nejčastěji právě na stránky okresů.

     JS/HLIDANI-LOGIKA.JS SE ODSUD ODEBRALO. Stálo tu kvůli odznaku
     upozornění v nabídce (nepřečtené zprávy, nové pozemky z hlídání) —
     jenže ta funkce je z webu odebraná a odznak nikdo nevyplňuje:
     naměřeno, že #nav-zpravy ani #nav-hlidani neplní žádný skript
     na webu. Zůstalo tedy 11 kB kódu, který se stahoval na 126
     stránkách a nic na nich nedělal — a mezi nimi všechny vstupy
     z vyhledávačů. Že se to nevrátí, hlídá
     scripts/test-skripty-na-strance.mjs. -->
<script src="js/config.js?${V.config}" defer></script>
<script src="js/auth.js?${V.auth}" defer></script>
${graf ? `<script src="js/graf-cen.js?${V.grafCen}" defer></script>
` : ''}<script src="js/offline.js?${V.offline}" defer></script>
<script src="js/mereni.js?${V.mereni}" defer></script>
<script src="js/hlavicka.js?${V.hlavicka}" defer></script>
</body>
</html>
`;
}
/* ŘÁDEK NABÍDKY MÁ PEVNÝ TVAR, AŤ JE TEXT JAKKOLI DLOUHÝ.
   Naměřeno na okrese Benešov: 30 řádků ve DVOU různých výškách (54 px
   devatenáctkrát, 83 px jedenáctkrát) a na mobilu 131 vs. 153 — podle
   toho, jestli se popis vešel za název obce, nebo se zalomil. Oko při
   čtení seznamu hledá rytmus; tenhle žádný neměl.
   A cena, kvůli které sem člověk jde, byla ZAPLETENÁ do věty: ve všech
   30 řádcích byla až druhá tučná hodnota, mezi výměrou a názvem okresu.
   Teď má řádek mřížku s pevnými poli — odznak, místo, cena vpravo,
   podrobnosti pod tím — takže všechny řádky vypadají stejně a ceny
   stojí v jednom sloupci pod sebou.
   `skryjOkres` je pro stránku okresu: „okres Benešov" se tam opakoval
   ve všech 30 řádcích stránky, která se jmenuje Benešov. */
/* `navic` je nepovinný údaj do podrobností — používá ho stránka
   „Co je nového" pro změnu ceny („z 199 000 Kč, −46 %"). Řádek se tím
   nerozbije: je to další kus mezi ostatní, ne nový sloupec. */
function itemRow(o, skryjOkres, navic, skryjTyp){
  /* ODZNAK PATŘÍ VÝJIMCE, NE PRAVIDLU. Změřeno: na 48 stránkách bylo
     1 616 odznaků a 1 433 z nich jen opakovalo, co platí o většině
     řádků — v okrese Hodonín 114× „NA PRODEJ" a mezi tím čtyři
     exekuce, které se v tom ztratily. Odznak se proto neukazuje
     u PŘEVAŽUJÍCÍHO typu a zbydou jen ty, které něco říkají: ze 1 616
     jich zůstane 183.
     SKRÝT SE MLČKY SMÍ JEN PRODEJ. Kdyby se na stránce, kde převažují
     dražby, mlčky vynechal odznak u dražeb, znamenal by prázdný
     sloupec „dražba" — a splést si dražbu s prodejem je ta nejdražší
     chyba, kterou tu člověk může udělat. Výjimka je stránka, kde mají
     VŠECHNY řádky týž typ: tam se typ řekne celou větou nad výpisem.
     Rozhoduje o tom typStrankyVypisu() níž. */
  const badge = (skryjTyp && o.type === skryjTyp) ? ''
    : `<span class="okr-badge t-${esc(o.type)}">${esc(TYPE_LABEL[o.type]||o.type)}</span>`;
  /* Státní půda se v řádku říkala DVAKRÁT: v podrobnostech stálo
     „prodej státní půdy (SPÚ, § 12)" a hned vedle odkaz „Nabídka SPÚ ↗".
     Změřeno na 523 řádcích z 2 820, tedy v každém pátém. Zůstává odkaz
     — ten navíc říká, KAM vede. */
  const jeSPU = !o.url && o.type === 'sale' && /SPÚ|státní půd/i.test(o.extra || '');
  const bits = [];
  if(o.druh && o.druh!=='—') bits.push(esc(o.druh));
  if(o.area) bits.push('<b>'+fmt(o.area)+' m²</b>');
  if(!skryjOkres && o.okres) bits.push('okres '+esc(o.okres));
  /* „inzerát – Bezrealitky" stálo v 29 řádcích z 30 na stránce, kde má
     každý řádek i odkaz „Zdroj ↗" vedoucí na tentýž portál. Jméno
     portálu tedy patří do popisku odkazu, ne doprostřed věty — ušetří
     to jedenadvacet znaků na řádek a odkaz konečně říká, KAM vede.
     U dražeb zůstává `extra` v podrobnostech: nese datum konání, a to
     je termín, ne zdroj. */
  const portal = (o.extra && /^inzerát\s*[–—-]\s*(.+)$/.exec(o.extra.trim()) || [])[1] || '';
  if(o.extra && o.extra!=='—' && !portal && !jeSPU) bits.push(esc(T.zdrojText(o.extra)));
  /* ODPOČET DO DRAŽBY. V řádku stálo „Dražba 12. 10. 2026" a kolik to
     je do dneška, si musel čtenář spočítat sám. Přitom u dražby je
     termín to rozhodující — cena se dá zvážit potřeba, datum ne: kdo
     se dozví o dražbě den po ní, nedozvěděl se nic. Naměřeno na
     dnešních 111 aktuálních dražbách: 6 je do tří dnů, 18 do týdne,
     64 do čtrnácti dnů.
     V mapě i na stránce pozemku se odpočet ukazuje odjakživa
     (js/terminy.js, .opp-cd) — na statických výpisech, kam lidé chodí
     z vyhledávačů, chyběl. Třída je TÁŽ, takže existuje jedna sada
     barev a hlídá ji scripts/test-kontrast.mjs.
     Přesné datum zůstává vedle: statická stránka se generuje čtyřikrát
     denně, takže odpočet může být o pár hodin starý — datum platí
     vždycky a rozhoduje ono. */
  const dniDoTerminu = (o.type === 'drazba' || o.type === 'exekuce') ? T.daysUntil(o.extra) : null;
  if (dniDoTerminu != null && dniDoTerminu >= 0) {
    bits.push(`<span class="opp-cd${T.countdownClass(dniDoTerminu)}">${esc(T.countdownText(dniDoTerminu))}</span>`);
  }
  /* Formulace musí zůstat opatrná: v popisech stojí „na hranici" stejně
     často jako „zavedeno", takže se tvrdí jen to, co inzerát uvádí. */
  if(o.site && o.site.length) bits.push('inzerát uvádí <b>'+esc(o.site.map(k=>VYB.nazev(k).toLowerCase()).join(', '))+'</b>');
  /* Podíl mění, CO se kupuje — bez něj vypadá cena za metr jako trhák. */
  if(o.podil) bits.push('<b>spoluvlastnický podíl'+(o.zlomek?' '+esc(o.zlomek):'')+'</b>');
  const oc = odznakCeny(o);
  if (oc) bits.push(oc);
  if (navic) bits.push(navic);
  /* Odkaz ven se musel poznat až po klepnutí. Šipka „→" vypadá jako
     „další stránka", ne jako „odcházíš z webu" — a kdo poslouchá čtečku
     obrazovky, nepozná ani to. Proto šikmá šipka, doména v popisku
     a věta pro odečítač. */
  let src = '';
  /* Státní půda (SPÚ, § 12) nemá stránku pro jednotlivou parcelu — prodává se
     přes veřejnou nabídku, kam se podává žádost. V aplikaci na ni vede tlačítko
     „Nabídka SPÚ"; na krajských stránkách tu donedávna nebyl odkaz ŽÁDNÝ, takže
     u dvou set nabídek se nedalo dohledat, odkud jsou. Tentýž odkaz jako
     v aplikaci (js/main.js, SPU_OFFERS). */
  if (jeSPU) {
    src = `<a class="okr-src" href="https://spu.gov.cz/nabidky/prehled-cela-cr" target="_blank" rel="noopener nofollow"` +
      ` title="Otevře se v novém okně na spu.gov.cz">Nabídka SPÚ` +
      `<span class="ext-ikona" aria-hidden="true">↗</span>` +
      `<span class="visually-hidden"> — spu.gov.cz, otevře se v novém okně</span></a>`;
  } else if (o.url && /^https?:\/\//.test(o.url)) {
    let domena = '';
    try { domena = new URL(o.url).hostname.replace(/^www\./, ''); } catch { /* ok */ }
    src = `<a class="okr-src" href="${attr(o.url)}" target="_blank" rel="noopener nofollow"` +
      ` title="Otevře se v novém okně na ${attr(domena)}">${esc(portal || 'Zdroj')}` +
      `<span class="ext-ikona" aria-hidden="true">↗</span>` +
      `<span class="visually-hidden"> — ${esc(domena)}, otevře se v novém okně</span></a>`;
  }
  /* NÁZEV OBCE VEDE NA VLASTNÍ STRÁNKU POZEMKU.
     Dřív byl jediný odkaz v řádku ten na zdroj — tedy pryč z webu. Na
     okresní a krajské stránky přitom lidé chodí z vyhledávačů a je to
     první, co z webu uvidí: jediné, co se dalo udělat, bylo odejít na
     bezrealitky.cz. Naměřeno: 2 164 řádků na 91 stránkách a ani jeden
     odkaz dovnitř; z 1 995 vygenerovaných stránek pozemků na žádnou
     neodkazovalo nic než sitemap.
     Odkazuje se na vygenerovaný soubor, ne na pozemek.html?p=… — právě
     ten soubor je u pozemku kanonický, takže odkaz míří tam, kam
     posíláme i vyhledávače. Když soubor není (nabídka bez souřadnic
     nebo bez obce stránku nedostane), zbude prostý text jako dřív;
     mrtvý odkaz je horší než žádný. */
  /* Cena za metr se dopočítá jen tam, kde dává smysl: bez výměry nebo
     bez ceny by to byla vymyšlená čísla. Zaokrouhluje se na celé koruny
     — desetiny u ceny za metr nikdo nečte. */
  const zmHodnota = (o.price && o.area) ? zaMetrPoctive(o) : null;
  const zaMetr = zmHodnota == null ? 0 : Math.round(zmHodnota);
  /* U podílu se k číslu dopíše, proč je takové — tutéž větu má mapa
     i stránka pozemku (js/ceny.js). */
  const zmPopis = CENY.zaMetrPopis ? CENY.zaMetrPopis(o) : '';
  const cena = o.price
    ? `<span class="okr-cena"><b>${fmt(o.price)} Kč</b>` +
      (zaMetr ? `<span class="okr-zametr"${zmPopis ? ` title="${attr(zmPopis)}"` : ''}>${fmt(zaMetr)} Kč/m²</span>` : '') + `</span>`
    : `<span class="okr-cena okr-bezceny">cena neuvedena</span>`;
  const strankaPozemku = STRANKY.get(klicNabidky(o));
  const misto = strankaPozemku
    ? `<a class="okr-place" href="${attr(strankaPozemku.soubor)}">${esc(o.place)}` +
      `<span class="visually-hidden"> — detail pozemku</span></a>`
    : `<span class="okr-place">${esc(o.place)}</span>`;
  return `      <div class="okr-item">
        ${badge}
        ${misto}
        ${cena}
        <span class="okr-meta">${bits.join(' · ')}</span>
        ${src}
      </div>`;
}

/* Jeden typ na celou stránku? Počítá se z ŘÁDKŮ, KTERÉ JSOU VIDĚT,
   ne z celého seznamu: odznak je popisek toho, co má člověk před očima.
   Když se typ skryje, musí se říct jednou nad výpisem — jinak by
   stránka o nabídkách zamlčela, jestli jsou na prodej, nebo v dražbě. */
function jedinyTyp(list) {
  const t = new Set((list || []).map((o) => o.type));
  return t.size === 1 ? [...t][0] : '';
}
const TYP_VETOU = { sale: 'na prodej', drazba: 've veřejné dražbě',
  exekuce: 'v exekuční dražbě', obec: 'záměry obcí', majitel: 'přímo od majitelů' };
function vetaOTypu(typ) {
  if (!typ) return '';
  return `Všechny nabídky v tomhle výpisu jsou <b>${esc(TYP_VETOU[typ] || (TYPE_LABEL[typ] || typ).toLowerCase())}</b>.`;
}
/* Co se ve výpisu smí vynechat z odznaků a co se za to musí říct.
   Vrací { skryt, veta } — `skryt` je typ, u kterého se odznak
   neukazuje (prázdné = ukazují se všechny), `veta` jde nad výpis.
   Počítá se ze ŘÁDKŮ, KTERÉ JSOU VIDĚT: odznak je popisek toho, co má
   člověk před očima, ne celého okresu. */
function typStrankyVypisu(list) {
  const pocty = {};
  for (const o of list || []) pocty[o.type] = (pocty[o.type] || 0) + 1;
  const typy = Object.keys(pocty);
  if (!typy.length) return { skryt: '', veta: '' };
  if (typy.length === 1) return { skryt: typy[0], veta: vetaOTypu(typy[0]) };
  const hlavni = typy.sort((a, b) => pocty[b] - pocty[a])[0];
  /* Mlčky se smí vynechat jen „na prodej" — viz itemRow. */
  if (hlavni !== 'sale') return { skryt: '', veta: '' };
  return { skryt: 'sale',
    veta: 'Není-li u řádku uvedeno jinak, je nabídka <b>na prodej</b>.' };
}

/* STŘEDY OKRESŮ — pro odkazy „Pozemky v okolí".
   Dřív se do nich vybíraly okresy TÉHOŽ KRAJE seřazené podle počtu
   nabídek. Kraj ale není okolí: naměřeno na 372 takových odkazech, že
   95 z nich (26 %) vedlo přes šedesát kilometrů, devadesátý percentil
   byl 73 km a nejdál mířil Kutná Hora → Rakovník, 111 km. Komu
   v jeho okrese nic nesedlo, dostal nabídku z druhého konce kraje.
   A naopak: okres za hranicí kraje se nenabídl, i když ležel blíž —
   Benešovu chyběl Pelhřimov, Kutné Hoře Havlíčkův Brod.

   Teď rozhoduje vzdálenost středů okresů. Výsledek: medián 38 km
   místo 42, devadesátý percentil 52 místo 73, nejdál 76 místo 111
   a přes šedesát kilometrů vede 20 odkazů místo 95.

   POČÍTÁ SE Z HRANIC, KTERÉ UŽ WEB MÁ (data/okresy-hranice.json, tytéž,
   ze kterých se dělá mapa). Střed je plošně vážené těžiště největšího
   prstence — ne průměr vrcholů, ten by táhlo tam, kde je hranice
   členitější. Vzdálenost se u odkazu PÍŠE, takže si ji čtenář může
   ověřit; tvrdit „v okolí" bez čísla by bylo jen slovo.

   Sousedství přes společnou hranici by bylo přesnější, ale nepoužívám
   ho: v těch datech vyšlo 189 dvojic a jedna z nich (Cheb –
   Plzeň-sever, 25 společných vrcholů) mi proti mapě nesedí. Dokud to
   nemám z druhého zdroje, radši počítám vzdálenost, která je pouhá
   aritmetika. */
function stredyOkresu() {
  let g;
  try { g = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'okresy-hranice.json'), 'utf8')); }
  catch (e) { return {}; }
  const tezisteRingu = (r) => {
    let a = 0, cx = 0, cy = 0;
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const f = r[j][0] * r[i][1] - r[i][0] * r[j][1];
      a += f; cx += (r[j][0] + r[i][0]) * f; cy += (r[j][1] + r[i][1]) * f;
    }
    a *= 0.5;
    return a ? { lng: cx / (6 * a), lat: cy / (6 * a), plocha: Math.abs(a) } : null;
  };
  const ven = {};
  for (const [jmeno, geo] of Object.entries(g)) {
    if (!geo || !geo.coordinates) continue;
    const prsteny = geo.type === 'Polygon' ? [geo.coordinates[0]] : geo.coordinates.map((x) => x[0]);
    let nej = null;
    for (const r of prsteny) {
      const t = tezisteRingu(r);
      if (t && (!nej || t.plocha > nej.plocha)) nej = t;
    }
    if (nej) ven[jmeno] = { lat: nej.lat, lng: nej.lng };
  }
  return ven;
}
const STREDY = stredyOkresu();
/* Vzdušná čára se NEPÍŠE ZNOVU — půjčuje se z scripts/srovnatelne.mjs,
   kde ji počítá srovnávání pozemků. Dvě kopie haversinu by se nerozešly
   ve vzorci, ale v tom, co dělají s chybějící souřadnicí; a tahle
   funkce rozhoduje o tom, co web nazve „okolím". */
const kmMeziStredy = kmMezi;
/* Nejbližší okresy, které mají vlastní stránku. Bez středu (chybějící
   hranice) se vrátí prázdno — mrtvý odkaz je horší než žádný oddíl. */
function okresyVOkoli(okres, kolik = 6) {
  if (!STREDY[okres]) return [];
  return eligibleOkres
    .filter((x) => x !== okres && STREDY[x])
    .map((x) => ({ okres: x, km: kmMeziStredy(STREDY[okres], STREDY[x]) }))
    .sort((a, b) => a.km - b.km || a.okres.localeCompare(b.okres, 'cs'))
    .slice(0, kolik);
}

const okresPages = [];
const krajPages = [];

// ---------- OKRES ----------
for(const okres of eligibleOkres){
  const list = byOkres[okres].slice();
  const kraj = OKRES_KRAJ[okres] || '';
  const file = okresFile(okres);
  const count = list.length;
  const byType={}; for(const o of list) byType[o.type]=(byType[o.type]||0)+1;
  const typeParts = Object.keys(byType).sort((a,b)=>byType[b]-byType[a]).map(t=>`${byType[t]}× ${(TYPE_LABEL[t]||t).toLowerCase()}`);
  const priced = list.filter(o=>o.price>0).map(o=>o.price).sort((a,b)=>a-b);
  const minP=priced[0], maxP=priced[priced.length-1];
  list.sort((a,b)=>(a.price||1e15)-(b.price||1e15));
  const dispK = (KRAJ_META[kraj]||{}).disp || (kraj+' kraj');

  // Google ořízne titulek kolem 60 znaků. „Pozemky v okrese Rychnov nad
  // Kněžnou — prodej, dražby, exekuce | Parcelka" má 73 a ve výsledcích
  // z něj zbyl useknutý cár. Kratší tvar říká totéž a vejde se celý.
  const title = `Pozemky okres ${okres} — prodej a dražby | Parcelka`;
  const desc = `${count} ${pluralPozemek(count)} v okrese ${okres} na jedné mapě — prodeje, dražby i exekuce z veřejných zdrojů.${minP?(' Ceny od '+fmt(minP)+' Kč.'):''}`;
  const jsonld = {"@context":"https://schema.org","@type":"CollectionPage","name":`Pozemky v okrese ${okres}`,"inLanguage":"cs","description":`Nabídky pozemků v okrese ${okres} — prodeje, dražby a exekuce z veřejných zdrojů.`,"mainEntityOfPage":`https://www.parcelaka.cz/${file}`,"publisher":{"@type":"Organization","name":"Parcelka"},"mainEntity":seznamNabidek(list, count)};
  /* KOLIK Z TOHO JSOU SPOLUVLASTNICKÉ PODÍLY. Je to čtvrtina celé
     nabídky webu (531 z 2 019) a u podílu je v inzerátu výměra CELÉ
     parcely, ale cena jen za ten zlomek — cena za metr proto vychází
     nízko z podstaty věci, ne proto, že je nabídka výhodná. U jednotlivé
     nabídky to web říká, u okresu to nikde nestálo, přitom právě tady si
     člověk prohlíží ceny vedle sebe a ty podíly mu je sráží. */
  const podilu = list.filter((o)=>o.podil).length;
  /* PODLE OBCE. Okres má i přes třicet nabídek v jednom dlouhém sloupci.
     Kdo hledá pozemek u konkrétní vsi, musí ho projít celý — a přitom
     se nabídky kupí: v okrese Litoměřice je patnáct z nich v jedné obci.
     Obce s aspoň dvěma nabídkami proto stojí nahoře jako rozcestník do
     mapy. Jedna nabídka vlastní řádek nedostane: byl by z toho druhý
     seznam všeho. V dotazu je i okres, protože stejných názvů obcí je
     v republice spousta a bez něj by mapa ukázala Bystřici ze čtyř
     okresů — číslo u odkazu by pak neplatilo. */
  const poObci = {};
  for (const o of list) if (o.place) poObci[o.place] = (poObci[o.place] || 0) + 1;
  const obceVic = Object.keys(poObci)
    .filter((m)=>poObci[m] >= 2 && m !== okres)
    .sort((a,b)=>poObci[b]-poObci[a] || a.localeCompare(b,'cs'));
  /* ČÍSLO U ODKAZU MUSÍ SEDĚT S TÍM, CO MAPA UKÁŽE — a proto odkaz nevede
     na hledání textu (?q=), ale na PŘESNÉ místo (?obec=&okres=). Hledání
     textem jde po začátcích slov, takže „Brno" ukáže i Brno-venkov a cizí
     obce, které tím slovem začínají: u sedmi obcí z 345 by odkaz slíbil
     jedno číslo a mapa ukázala jiné, u Brna 17 proti 39. Přesné místo
     srovnává celý název obce i okresu, takže se číslo rozejít nemůže;
     hlídá to scripts/test-okres-stranka.mjs. */
  const obecLinks = obceVic.slice(0,12).map((m)=>
    `<a href="index.html?obec=${encodeURIComponent(m)}&amp;okres=${encodeURIComponent(okres)}#mapa">${esc(m)} <span>${poObci[m]}</span></a>`).join('');
  const tS = typStrankyVypisu(list);
  const rows = list.map((o)=>itemRow(o, true, null, tS.skryt)).join('\n');
  const mapName = (KRAJ_META[kraj]||{}).mapName || kraj;
  const krajLink = mapName ? `index.html?kraj=${encodeURIComponent(mapName)}#mapa` : 'index.html#mapa';
  const siblings = okresyVOkoli(okres, 6);
  const sibLinks = siblings.map(({ okres: x, km }) =>
    `<a href="${okresFile(x)}">${esc(x)} <span>${Math.round(km)} km · ${byOkres[x].length}</span></a>`).join('');
  const krajBack = hasKrajPage.has(kraj) ? `<a href="${krajFile(kraj)}">Celý ${esc(dispK)} →</a>` : `<a href="pozemky-podle-okresu.html">Všechny okresy →</a>`;
  const crumbs = [
    {name:'Pozemky', href:'index.html', abs:SITE},
    {name:'Pozemky podle okresů', href:'pozemky-podle-okresu.html', abs:SITE+'pozemky-podle-okresu.html'},
  ];
  if(hasKrajPage.has(kraj)) crumbs.push({name:dispK, href:krajFile(kraj), abs:SITE+krajFile(kraj)});
  crumbs.push({name:'Okres '+okres, abs:SITE+file});

  const html = head(title,desc,file,jsonld,crumbs,`okres-${slug(okres)}.png`,kanalKraje(kraj),kanalNazevKraje(kraj)) + `
<main id="obsah">

  <section class="okr-hero">
    <div class="okr-band">
    <div class="wrap okr-wrap">
      <div class="eyebrow"><span class="live-dot"></span>Okres ${esc(okres)}${kraj?' · '+esc(dispK):''}</div>
      <h1>Pozemky v okrese ${esc(okres)}.</h1>
      <p class="sub">Aktuálně evidujeme <b>${count} ${pluralPozemek(count)}</b> v okrese ${esc(okres)} — ${esc(typeParts.join(', '))}. Vše z <b>veřejných zdrojů</b> na jedné mapě, s prokliky na ověření v katastru. ${minP?('Ceny od <b>'+fmt(minP)+' Kč</b>'+(maxP&&maxP!==minP?' do <b>'+fmt(maxP)+' Kč</b>':'')+'.'):''}</p>
    </div>
    </div>
  </section>

  <section class="section">
    <div class="wrap okr-wrap">

      <!-- Rozpad podle druhu se vypisuje, JEN když je co rozpadat. V okrese
           Kolín je všech 28 nabídek na prodej, takže vedle sebe stály dvě
           dlaždice s týmž číslem: „28 pozemků" a „28 na prodej". Druhá
           neříkala nic, co by v té první nebylo — a v podnadpisu nad tím
           stojí „28× na prodej" ještě jednou. -->
      <div class="okr-stats">
        <div class="okr-stat"><b>${count}</b><span>${pluralPozemek(count)}</span></div>
        ${Object.keys(byType).length > 1 && byType.sale?`<div class="okr-stat"><b>${byType.sale}</b><span>na prodej</span></div>`:''}
        ${Object.keys(byType).length > 1 && byType.drazba?`<div class="okr-stat"><b>${byType.drazba}</b><span>${sklon(byType.drazba,'dražba','dražby','dražeb')}</span></div>`:''}
        ${Object.keys(byType).length > 1 && byType.exekuce?`<div class="okr-stat"><b>${byType.exekuce}</b><span>${sklon(byType.exekuce,'exekuce','exekuce','exekucí')}</span></div>`:''}
        ${Object.keys(byType).length > 1 && byType.obec?`<div class="okr-stat"><b>${byType.obec}</b><span>${sklon(byType.obec,'záměr obce','záměry obcí','záměrů obcí')}</span></div>`:''}
      </div>
${priceLine(priceStats(list)) ? `      <p class="okr-more" style="margin-top:2px;">${priceLine(priceStats(list))} — <a href="cena-pozemku.html">ceny pozemků v ČR</a></p>` : ''}
${/* Graf vývoje hladiny. Vykreslí se JEN tehdy, když pro okres existuje
      dost klidná řada (js/graf-cen.js) — jinak zůstane prázdné místo bez
      rámečku. Data si skript stáhne sám, až se k němu někdo doroluje. */''}
      <div data-graf-cen data-uroven="okres" data-nazev="${esc(okres)}" data-kde="v okrese ${esc(okres)}"></div>
${podilu ? `      <p class="okr-more" style="margin-top:2px;">Z toho ${sklon(podilu,'je','jsou','je')} <b>${podilu}</b> ${sklon(podilu,'spoluvlastnický podíl','spoluvlastnické podíly','spoluvlastnických podílů')} — v inzerátu je pak výměra celé parcely, ale cena jen za ten zlomek, takže cena za metr vychází nízko sama od sebe. <a href="list-vlastnictvi-katastr.html">Jak podíl poznat v katastru</a>.</p>` : ''}

      <div class="add-cross" style="margin-top:0;">
        <div class="acx-copy">
          <h3>Prohlédněte si okres ${esc(okres)} na mapě</h3>
          <p>Interaktivní mapa s filtrováním podle ceny, výměry i druhu pozemku — a odkazy do katastru na ověření.</p>
        </div>
        <div class="acx-akce">
          <a href="${krajLink}" class="btn-primary btn-glow">Otevřít na mapě →</a>
        <a href="index.html#mapa" class="acx-vse">nebo celá ČR</a>
        </div>
      </div>

      <div class="add-card" style="margin-top:22px;">
        <div class="rules-sect">
          <h2>Nabídky pozemků v okrese ${esc(okres)}</h2>
          <p class="rules-note" style="margin-top:0;">${tS.veta ? tS.veta + ' ' : ''}Seřazeno od nejnižší ceny. Data pocházejí z veřejných zdrojů (inzertní portály, evidence dražeb, státní pozemkový úřad) a mohou se v čase měnit — aktuální stav vždy ověřte u zdroje a v katastru nemovitostí.</p>
${razitkoCerstvosti}
          <div class="okr-list">
${rows}
          </div>
        </div>
      </div>

${obecLinks ? `
      <div class="add-card" style="margin-top:22px;">
        <div class="rules-sect">
          <h2>Kde je v okrese ${esc(okres)} nabídek nejvíc</h2>
          <p class="rules-note" style="margin-top:0;">Obce, kde evidujeme víc než jednu nabídku. Odkaz otevře mapu rovnou na té obci.</p>
          <div class="okr-index-grid">
            ${obecLinks}
          </div>
        </div>
      </div>` : ''}
${sibLinks ? `
      <div class="add-card" style="margin-top:22px;">
        <div class="rules-sect">
          <h2>Pozemky v okolí</h2>
          <p class="rules-note" style="margin-top:0;">Nejbližší okresy, které tu mají vlastní stránku — vzdušnou čarou mezi středy okresů, za ní počet nabídek. Hranice kraje v tom nerozhoduje: když je za ní blíž, patří sem.</p>
          <div class="okr-index-grid">
            ${sibLinks}
          </div>
          <p class="okr-more">${krajBack}</p>
        </div>
      </div>` : ''}

      <!-- ODBĚR KANÁLEM. Čtrnáct krajských kanálů se obnovuje čtyřikrát
           denně a odkazovala na ně jediná stránka (data.html), takže je
           nikdo nenašel. Tady stojí u výpisu, kde to má smysl: kdo si
           okres prochází, ten se sem vrací. -->
      <p class="okr-more" style="margin-top:22px;">Nechcete se sem vracet a koukat?
        <a href="${kanalKraje(kraj)}">Nové pozemky ${CENY.kdeText('kraj', kraj)} odebírejte kanálem</a>
        — bez účtu a bez e-mailu. Nebo se podívejte, <a href="nove-pozemky.html">co je na trhu nového</a>.</p>

      <p class="okr-more" style="margin-top:22px;">Nevíte, kde hledat? <a href="na-co-mam-pozemek.html">Zadejte rozpočet</a> a uvidíte, ve kterých okresech se za něj dnes dá koupit.</p>
      <p class="okr-more" style="margin-top:8px;">Než koupíte, projděte si <a href="kolik-stoji-koupe-pozemku.html">náklady při koupi</a> a <a href="list-vlastnictvi-katastr.html">jak číst list vlastnictví</a>.</p>

    </div>
  </section>

</main>
` + footer({ graf: true });   // graf cenové hladiny je jen tady
  write(file, html);
  okresPages.push({okres,kraj,file,count});
}

// ---------- KRAJ ----------
for(const kraj of eligibleKraj){
  const meta = KRAJ_META[kraj];
  const list = byKraj[kraj].slice();
  const file = krajFile(kraj);
  const count = list.length;
  const byType={}; for(const o of list) byType[o.type]=(byType[o.type]||0)+1;
  const typeParts = Object.keys(byType).sort((a,b)=>byType[b]-byType[a]).map(t=>`${byType[t]}× ${(TYPE_LABEL[t]||t).toLowerCase()}`);
  const priced=list.filter(o=>o.price>0).map(o=>o.price).sort((a,b)=>a-b);
  const minP=priced[0], maxP=priced[priced.length-1];
  const okresList = Object.keys(byOkres).filter(ok=>OKRES_KRAJ[ok]===kraj).sort((a,b)=>byOkres[b].length-byOkres[a].length);
  const okresGrid = okresList.map(ok=>{
    const c=byOkres[ok].length;
    return hasOkresPage.has(ok)
      ? `<a href="${okresFile(ok)}">${esc(ok)} <span>${c} ${pluralPozemek(c)}</span></a>`
      : `<a href="index.html?kraj=${encodeURIComponent(meta.mapName)}#mapa">${esc(ok)} <span>${c} ${pluralPozemek(c)}</span></a>`;
  }).join('\n            ');
  list.sort((a,b)=>(a.price||1e15)-(b.price||1e15));
  /* NALEZENO: tady stálo `.map(itemRow)`. map předává jako druhý
     argument POŘADÍ, a druhý argument itemRow je `skryjOkres` — takže
     u prvního řádku (0 = nepravda) se okres ukázal a u všech dalších
     se schoval. Na krajské stránce, kde je okres to hlavní rozlišení,
     ho tedy mělo 1 z 12 řádků; na celostátní stránce dražeb 1 z 84.
     Nespadlo nic, jen tam ten údaj nebyl. */
  const vypsane = list.slice(0, 12);
  const tS = typStrankyVypisu(vypsane);
  const rows = vypsane.map((o) => itemRow(o, false, null, tS.skryt)).join('\n');

  const title = `Pozemky ${meta.disp} — prodej a dražby | Parcelka`;
  const desc = `Pozemky ${meta.loc} na jedné mapě — ${count} ${pluralPozemek(count)} z veřejných zdrojů: prodeje, dražby i exekuce.${minP?(' Ceny od '+fmt(minP)+' Kč.'):''}`;
  const jsonld = {"@context":"https://schema.org","@type":"CollectionPage","name":`Pozemky ${meta.disp}`,"inLanguage":"cs","description":`Nabídky pozemků ${meta.loc} — prodeje, dražby a exekuce z veřejných zdrojů.`,"mainEntityOfPage":`https://www.parcelaka.cz/${file}`,"publisher":{"@type":"Organization","name":"Parcelka"},"mainEntity":seznamNabidek(list, list.length)};
  const crumbs = [
    {name:'Pozemky', href:'index.html', abs:SITE},
    {name:'Pozemky podle okresů', href:'pozemky-podle-okresu.html', abs:SITE+'pozemky-podle-okresu.html'},
    {name:meta.disp, abs:SITE+file},
  ];

  const html = head(title,desc,file,jsonld,crumbs,`kraj-${slug(kraj)}.png`,kanalKraje(kraj),kanalNazevKraje(kraj)) + `
<main id="obsah">

  <section class="okr-hero">
    <div class="okr-band">
    <div class="wrap okr-wrap">
      <div class="eyebrow"><span class="live-dot"></span>${esc(meta.disp)}</div>
      <h1>Pozemky ${esc(meta.loc)}.</h1>
      <p class="sub">Aktuálně evidujeme <b>${count} ${pluralPozemek(count)}</b> ${esc(meta.loc)} — ${esc(typeParts.join(', '))}. Vyberte okres, nebo si otevřete celý kraj na mapě. ${minP?('Ceny od <b>'+fmt(minP)+' Kč</b>'+(maxP&&maxP!==minP?' do <b>'+fmt(maxP)+' Kč</b>':'')+'.'):''}</p>
    </div>
    </div>
  </section>

  <section class="section">
    <div class="wrap okr-wrap">

      <div class="okr-stats">
        <div class="okr-stat"><b>${count}</b><span>${pluralPozemek(count)}</span></div>
        <div class="okr-stat"><b>${okresList.length}</b><span>${sklon(okresList.length,'okres','okresy','okresů')}</span></div>
        ${byType.drazba?`<div class="okr-stat"><b>${byType.drazba}</b><span>${sklon(byType.drazba,'dražba','dražby','dražeb')}</span></div>`:''}
        ${byType.exekuce?`<div class="okr-stat"><b>${byType.exekuce}</b><span>${sklon(byType.exekuce,'exekuce','exekuce','exekucí')}</span></div>`:''}
      </div>
${priceLine(priceByKraj[kraj]||{}) ? `      <p class="okr-more" style="margin-top:2px;">${priceLine(priceByKraj[kraj]||{})} — <a href="cena-pozemku.html">ceny pozemků v ČR</a></p>` : ''}
      <div data-graf-cen data-uroven="kraj" data-nazev="${esc(kraj)}" data-kde="${esc(meta.kde || ('v kraji ' + kraj))}"></div>

      <div class="add-cross" style="margin-top:0;">
        <div class="acx-copy">
          <h3>Otevřít ${esc(meta.disp)} na mapě</h3>
          <p>Celý kraj na interaktivní mapě — filtrujte podle ceny, výměry i druhu pozemku a proklikněte se do katastru.</p>
        </div>
        <div class="acx-akce">
          <a href="index.html?kraj=${encodeURIComponent(meta.mapName)}#mapa" class="btn-primary btn-glow">Otevřít na mapě →</a>
        <a href="index.html#mapa" class="acx-vse">nebo celá ČR</a>
        </div>
      </div>

      <div class="okr-blok">
        <div class="rules-sect">
          <h2>Vyberte okres</h2>
          <div class="okr-index-grid">
            ${okresGrid}
          </div>
        </div>
      </div>

      <div class="okr-blok">
        <div class="rules-sect">
          <h2>Nejlevnější pozemky ${esc(meta.loc)}</h2>
          <p class="rules-note" style="margin-top:0;">${tS.veta ? tS.veta + ' ' : ''}Ukázka nejnižších cen napříč krajem. Data z veřejných zdrojů se mohou měnit — aktuální stav ověřte u zdroje a v katastru.</p>
${razitkoCerstvosti}
          <div class="okr-list">
${rows}
          </div>
        </div>
      </div>

      <p class="okr-more" style="margin-top:22px;">Nechcete se sem vracet a koukat?
        <a href="${kanalKraje(kraj)}">Nové pozemky ${CENY.kdeText('kraj', kraj)} odebírejte kanálem</a>
        — bez účtu a bez e-mailu. Nebo se podívejte, <a href="nove-pozemky.html">co je na trhu nového</a>.</p>

      <p class="okr-more" style="margin-top:22px;">Nevíte, kde hledat? <a href="na-co-mam-pozemek.html">Zadejte rozpočet</a> a uvidíte, ve kterých okresech se za něj dnes dá koupit.</p>
      <p class="okr-more" style="margin-top:8px;">Než koupíte, projděte si <a href="kolik-stoji-koupe-pozemku.html">náklady při koupi</a> nebo <a href="pozemky-podle-okresu.html">všechny kraje a okresy</a>.</p>

    </div>
  </section>

</main>
` + footer({ graf: true });   // graf cenové hladiny je jen tady
  write(file, html);
  krajPages.push({kraj,file,count});
}

// ---------- DRAŽBY (národní přehled) ----------
/* Celostátní přehled dražeb počítá z téže hromádky jako okresy — tedy
   bez těch, kterým termín už prošel. */
/* ŘADÍ SE PODLE TERMÍNU, NE PODLE CENY. U běžného prodeje je nejlevnější
   nabídka nahoře správně — čas neběží. U dražby je to naopak to první, co
   člověk potřebuje vědět: dražba za tři dny a dražba za dva měsíce jsou
   dvě úplně jiné situace a cena na tom nic nemění. Dražby bez termínu jdou
   na konec (bez data se nedá nic naplánovat); v rámci jednoho dne pak
   rozhoduje nižší vyvolávací cena. */
const drazby = aktualni.filter(o=>o.type==='drazba').sort((a,b)=>{
  const da = T.daysUntil(a.extra), db = T.daysUntil(b.extra);
  if (da == null && db == null) return (a.price||1e15)-(b.price||1e15);
  if (da == null) return 1;
  if (db == null) return -1;
  return da - db || (a.price||1e15)-(b.price||1e15);
});
{
  const count = drazby.length;
  const priced = drazby.filter(o=>o.price>0).map(o=>o.price).sort((a,b)=>a-b);
  const minP=priced[0];
  const file='drazby-pozemku-nabidky.html';
  /* Totéž co u krajů: `.map(itemRow)` schovával okres všude kromě
     prvního řádku — a na celostátním přehledu dražeb je okres jediné,
     co řádky od sebe místně odliší. */
  const tS = typStrankyVypisu(drazby);
  const rows = drazby.map((o) => itemRow(o, false, null, tS.skryt)).join('\n');
  const title = `Dražby pozemků — aktuální nabídky v ČR | Parcelka`;
  const desc = `${count} ${sklon(count,'dražba pozemku','dražby pozemků','dražeb pozemků')} z celé ČR na jedné mapě, z veřejné evidence dražeb.${minP?(' Vyvolávací ceny od '+fmt(minP)+' Kč.'):''}`;
  const jsonld = {"@context":"https://schema.org","@type":"CollectionPage","name":"Dražby pozemků v ČR","inLanguage":"cs","description":`Aktuální nabídky pozemků v dražbě z veřejné evidence dražeb.`,"mainEntityOfPage":`https://www.parcelaka.cz/${file}`,"publisher":{"@type":"Organization","name":"Parcelka"},"mainEntity":seznamNabidek(drazby, count)};
  const crumbs = [
    {name:'Pozemky', href:'index.html', abs:SITE},
    {name:'Koupě v dražbě', href:'drazby-pozemku.html', abs:SITE+'drazby-pozemku.html'},
    {name:'Aktuální dražby', abs:SITE+file},
  ];
  const html = head(title,desc,file,jsonld,crumbs,'drazby.png') + `
<main id="obsah">

  <section class="okr-hero">
    <div class="okr-band">
    <div class="wrap okr-wrap">
      <div class="eyebrow"><span class="live-dot"></span>Dražby pozemků · celá ČR</div>
      <h1>Dražby pozemků — aktuální nabídky.</h1>
      <p class="sub">Evidujeme <b>${count} ${sklon(count,'dražbu','dražby','dražeb')}</b> pozemků z celé České republiky, z <b>veřejné evidence dražeb</b>. ${minP?('Vyvolávací ceny od <b>'+fmt(minP)+' Kč</b>. '):''}V dražbě jde často pořídit pozemek pod tržní cenou — ale je potřeba znát pravidla.</p>
    </div>
    </div>
  </section>

  <section class="section">
    <div class="wrap okr-wrap">

      <div class="add-cross" style="margin-top:0;">
        <div class="acx-copy">
          <h3>Nevíte, jak dražba funguje?</h3>
          <p>Dražební jistota, vyvolávací cena, příklep i lhůty — vysvětlujeme srozumitelně krok za krokem.</p>
        </div>
        <a href="drazby-pozemku.html" class="btn-primary btn-glow">Jak koupit v dražbě →</a>
      </div>

      <div class="add-card" style="margin-top:22px;">
        <div class="rules-sect">
          <h2>Pozemky v dražbě</h2>
          <p class="rules-note" style="margin-top:0;">${tS.veta ? tS.veta + ' ' : ''}Seřazeno <b>podle termínu</b> — nejdřív to, co se draží nejblíž. Údaje pocházejí z veřejné evidence dražeb a mohou se v čase měnit — konání, podmínky a aktuální stav vždy ověřte přímo v dražební vyhlášce a v katastru nemovitostí.</p>
${razitkoCerstvosti}
          <div class="okr-list">
${rows}
          </div>
        </div>
      </div>

      <p class="okr-more" style="margin-top:22px;">Návod krok za krokem: <a href="drazby-pozemku.html">Jak koupit pozemek v dražbě</a> · <a href="kolik-stoji-koupe-pozemku.html">náklady při koupi</a>.</p>

    </div>
  </section>

</main>
` + footer();
  write(file, html);
}

// ---------- PODLE DRUHU POZEMKU (národní přehledy) ----------
/* Web měl 77 stránek podle okresů a ANI JEDNU podle druhu pozemku.
 * Přitom „les na prodej" nebo „orná půda" je to, s čím člověk přichází —
 * okres Semily si vybere teprve potom, co ví, co vlastně chce. Kdo hledal
 * les, musel do mapy a tam si najít filtr druhu.
 *
 * Druh se bere TÝMŽ rozřazením, jaké používá mapa i cenový model
 * (js/ceny.js, druhGroup), aby odkaz „otevřít na mapě" ukázal přesně to,
 * co je na stránce vypsané. Proto tu nejsou vlastní vzorky na druh.
 *
 * Vypisuje se nejvýš šedesát nejlevnějších a pod nimi odkaz na mapu se
 * zbytkem: 859 řádků orné půdy na jedné stránce je 400 kB HTML a nikdo
 * je nepřečte. */
/* `og` je náhled pro sdílení (assets/og, vyrábí scripts/build-og.mjs).
   Bez něj padaly všechny druhové stránky na společný obrázek webu,
   takže odkaz na „les na prodej" vypadal ve zprávě jako odkaz na
   úvodní stránku. */
const DRUH_STRANKY = META.DRUH_STRANKY;
/* Úklid: co se letos nevygeneruje (druh spadl pod mez), nesmí na webu
   zůstat viset ze včerejška — stejně jako u okresů výš. */
for (const d of DRUH_STRANKY) {
  const c = path.join(ROOT, d.soubor);
  if (fs.existsSync(c)) fs.rmSync(c);
}
const MIN_DRUH = 40;          // pod tím to není přehled, ale pár řádků
const STROP_RADKU = 60;       // kolik nabídek se vypíše; zbytek je na mapě
const druhStranky = [];
for (const d of DRUH_STRANKY) {
  const list = aktualni.filter((o) => CENY.druhGroup(o.druh) === d.skupina)
    .sort((a, b) => (a.price || 1e15) - (b.price || 1e15));
  if (list.length < MIN_DRUH) continue;
  const count = list.length;
  const priced = list.filter((o) => o.price > 0).map((o) => o.price).sort((a, b) => a - b);
  const minP = priced[0], maxP = priced[priced.length - 1];
  const podilu = list.filter((o) => o.podil).length;
  const ceny = priceStats(list);
  const cenyRadka = priceLine(ceny);
  const vypsane = list.slice(0, STROP_RADKU);
  const tS = typStrankyVypisu(vypsane);
  const rows = vypsane.map((o) => itemRow(o, false, null, tS.skryt)).join('\n');
  const zbyva = Math.max(0, count - STROP_RADKU);
  const mapaOdkaz = `index.html?druh=${encodeURIComponent(d.oznaceni)}#mapa`;
  /* Kde je toho druhu nejvíc. Odkazuje se jen na okresy, které vlastní
     stránku opravdu mají (vzniká od tří nabídek) — jinak by to byl
     mrtvý odkaz. */
  const poOkresu = {};
  for (const o of list) if (o.okres) poOkresu[o.okres] = (poOkresu[o.okres] || 0) + 1;
  const okresyNej = Object.keys(poOkresu)
    .filter((ok) => hasOkresPage.has(ok))
    .sort((a, b) => poOkresu[b] - poOkresu[a] || a.localeCompare(b, 'cs'))
    .slice(0, 12);
  const okresLinks = okresyNej.map((ok) =>
    `<a href="${okresFile(ok)}">${esc(ok)} <span>${poOkresu[ok]}</span></a>`).join('');
  const title = `${d.h1} — nabídky z celé ČR | Parcelka`;
  const desc = `${count} ${sklon(count, d.jm[0], d.jm[1], d.jm[2])} z celé ČR na jedné mapě — z veřejných zdrojů.`
    + (minP ? ` Ceny od ${fmt(minP)} Kč.` : '');
  const jsonld = { "@context": "https://schema.org", "@type": "CollectionPage", name: d.h1,
    inLanguage: "cs", description: desc, mainEntityOfPage: SITE + d.soubor,
    publisher: { "@type": "Organization", name: "Parcelka" },
    mainEntity: seznamNabidek(list, count) };
  const crumbs = [
    { name: 'Pozemky', href: 'index.html', abs: SITE },
    { name: 'Ceny pozemků', href: 'cena-pozemku.html', abs: SITE + 'cena-pozemku.html' },
    { name: d.h1, abs: SITE + d.soubor },
  ];
  const html = head(title, desc, d.soubor, jsonld, crumbs, d.og) + `
<main id="obsah">

  <section class="okr-hero">
    <div class="okr-band">
    <div class="wrap okr-wrap">
      <div class="eyebrow"><span class="live-dot"></span>${esc(d.oznaceni)} · celá ČR</div>
      <h1>${esc(d.h1)}.</h1>
      <p class="sub">Evidujeme <b>${fmt(count)} ${sklon(count, d.jm[0], d.jm[1], d.jm[2])}</b> z celé České republiky — z <b>veřejných zdrojů</b> na jedné mapě, s prokliky na ověření v katastru.${minP ? ` Ceny od <b>${fmt(minP)} Kč</b>${maxP && maxP !== minP ? ` do <b>${fmt(maxP)} Kč</b>` : ''}.` : ''}</p>
    </div>
    </div>
  </section>

  <section class="section">
    <div class="wrap okr-wrap">

      <div class="okr-stats">
        <div class="okr-stat"><b>${fmt(count)}</b><span>${sklon(count, d.jm[0], d.jm[1], d.jm[2])}</span></div>
        <div class="okr-stat"><b>${okresyNej.length ? Object.keys(poOkresu).length : 0}</b><span>${sklon(Object.keys(poOkresu).length, 'okres', 'okresy', 'okresů')}</span></div>
      </div>
${cenyRadka ? `      <p class="okr-more" style="margin-top:2px;">${cenyRadka} — <a href="cena-pozemku.html">ceny pozemků v ČR</a></p>` : ''}
${podilu ? `      <p class="okr-more" style="margin-top:2px;">Z toho ${sklon(podilu, 'je', 'jsou', 'je')} <b>${fmt(podilu)}</b> ${sklon(podilu, 'spoluvlastnický podíl', 'spoluvlastnické podíly', 'spoluvlastnických podílů')} — v inzerátu je pak výměra celé parcely, ale cena jen za ten zlomek. <a href="list-vlastnictvi-katastr.html">Jak podíl poznat v katastru</a>.</p>` : ''}

      <div class="add-card" style="margin-top:22px;">
        <div class="rules-sect">
          <h2>Co znamená ${esc(d.oznaceni.toLowerCase())} v katastru</h2>
          <p class="rules-note" style="margin-top:0;">${d.rada}</p>
        </div>
      </div>

      <div class="add-cross" style="margin-top:22px;">
        <div class="acx-copy">
          <h3>${esc(d.h1)} na mapě</h3>
          <p>Mapa s filtrem na tenhle druh — k tomu cena, výměra, sítě a odkazy do katastru na ověření.</p>
        </div>
        <a href="${mapaOdkaz}" class="btn-primary btn-glow">Otevřít na mapě →</a>
      </div>

      <div class="add-card" style="margin-top:22px;">
        <div class="rules-sect">
          <h2>Nabídky — ${esc(d.nom)}</h2>
          <p class="rules-note" style="margin-top:0;">${tS.veta ? tS.veta + ' ' : ''}Seřazeno od nejnižší ceny${zbyva ? `, vypsáno prvních ${STROP_RADKU}` : ''}. Data pocházejí z veřejných zdrojů (inzertní portály, evidence dražeb, státní pozemkový úřad) a mohou se v čase měnit — aktuální stav vždy ověřte u zdroje a v katastru nemovitostí.</p>
${razitkoCerstvosti}
          <div class="okr-list">
${rows}
          </div>
${zbyva ? `          <p class="okr-more" style="margin-top:14px;"><a href="${mapaOdkaz}">${zbyvajici(zbyva)} ${fmt(zbyva)} ${pluralPozemek(zbyva)} najdete na mapě →</a></p>` : ''}
        </div>
      </div>

${okresLinks ? `
      <div class="add-card" style="margin-top:22px;">
        <div class="rules-sect">
          <h2>Kde je ${esc(d.mn)} nejvíc</h2>
          <p class="rules-note" style="margin-top:0;">Okresy s největším počtem nabídek tohoto druhu.</p>
          <div class="okr-index-grid">
            ${okresLinks}
          </div>
          <p class="okr-more"><a href="pozemky-podle-okresu.html">Všechny kraje a okresy →</a></p>
        </div>
      </div>` : ''}

      <p class="okr-more" style="margin-top:22px;">Nevíte, kde hledat? <a href="na-co-mam-pozemek.html">Zadejte rozpočet</a> a uvidíte, ve kterých okresech se za něj dnes dá koupit.</p>
      <p class="okr-more" style="margin-top:8px;">Než koupíte, projděte si <a href="kolik-stoji-koupe-pozemku.html">náklady při koupi</a> a <a href="list-vlastnictvi-katastr.html">jak číst list vlastnictví</a>.</p>

    </div>
  </section>

</main>
` + footer();
  write(d.soubor, html);
  druhStranky.push({ skupina: d.skupina, soubor: d.soubor, count, nazev: d.h1 });
}

// ---------- PODLE ROZPOČTU („pozemky do X Kč") ----------
/* Web umí odpovědět na „kde je les" (stránky podle druhu) a na „co je
 * v okrese Semily" (stránky okresů), ale ne na otázku, se kterou člověk
 * ve skutečnosti přichází: MÁM TOLIK A TOLIK, CO ZA TO DOSTANU. Nástroj
 * na to je (na-co-mam-pozemek.html), jenže ten žije ve skriptu — do
 * vyhledávače se z něj nedostane nic a „pozemky do 500 tisíc" se hledá
 * pořád.
 *
 * Tyhle stránky nejsou výpis okresu s jinou hlavičkou. Nesou číslo,
 * které nikde jinde na webu není a které je u rozpočtu to podstatné:
 * KOLIK Z TOHO JSOU STAVEBNÍ POZEMKY. Naměřeno na dnešních datech — do
 * milionu korun je v celé nabídce jeden jediný stavební pozemek ze 768.
 * Kdo si myslí, že si za půl milionu koupí parcelu na dům, má to vědět
 * z první obrazovky, ne po projití sta inzerátů.
 *
 * Řez je týž jako v rozpočtovém nástroji (scripts/generate-rozpocet.mjs):
 * jen prodeje, bez spoluvlastnických podílů a bez cen, kterým cenový
 * model nevěří. Dražba má vyvolávací cenu, ne cenu — do „co koupím za
 * 200 tisíc" nepatří; u podílu je výměra celé parcely, ale cena jen za
 * zlomek, takže by řez zaplavila zdánlivě levná pole. */
const ROZPOCTY = META.ROZPOCTY;

const MIN_ROZPOCET = 40;      // pod tím to není přehled trhu, ale hrst inzerátů
const STROP_ROZPOCET = 40;    // kolik nabídek se vypíše; zbytek je na mapě
/* Úklid jako u druhů: co dnes nevznikne, nesmí na webu zůstat ze včerejška. */
for (const r of ROZPOCTY) {
  const c = path.join(ROOT, r.soubor);
  if (fs.existsSync(c)) fs.rmSync(c);
}
/* Týž řez jako rozpočtový nástroj — viz komentář výš. */
const rozpocetRez = aktualni.filter((o) =>
  o.type === 'sale' && !o.podil && o.price > 0 && o.area > 0 &&
  !(MODEL && MODEL.neduveryhodna && MODEL.neduveryhodna(o)) &&
  !(MODEL && MODEL.odhad && (MODEL.odhad(o) || {}).pochybna));
/* Nejdřív se spočítá, které stránky vůbec vzniknou — teprve pak se
   generují, aby se mohly navzájem prolinkovat (kdo kouká na 200 tisíc,
   nejčastěji potřebuje vědět, co přidá půl milionu). */
const rozpocetVznikne = ROZPOCTY.map((r) => {
  const list = rozpocetRez.filter((o) => o.price <= r.strop)
    .sort((a, b) => a.price - b.price);
  return Object.assign({}, r, { list });
}).filter((r) => r.list.length >= MIN_ROZPOCET);
const SOUBOR_DRUHU = {};
for (const d of druhStranky) SOUBOR_DRUHU[d.skupina] = d.soubor;
const rozpocetStranky = [];
for (const r of rozpocetVznikne) {
  const list = r.list;
  const count = list.length;
  const minP = list[0].price, maxP = list[count - 1].price;
  const vymery = list.map((o) => o.area).sort((a, b) => a - b);
  const medVymera = Math.round(median(vymery));
  const zaM = list.map((o) => o.price / o.area).sort((a, b) => a - b);
  const medZaM = Math.round(median(zaM));
  /* Kolik čeho — a hlavně kolik stavebních. */
  const poDruhu = {};
  for (const o of list) {
    const g = CENY.druhGroup(o.druh);
    poDruhu[g] = (poDruhu[g] || 0) + 1;
  }
  const stavebnich = poDruhu['Stavební / zastavěná'] || 0;
  const druhRadky = Object.keys(poDruhu)
    .sort((a, b) => poDruhu[b] - poDruhu[a] || a.localeCompare(b, 'cs'))
    .map((g) => {
      const soubor = SOUBOR_DRUHU[g];
      const cislo = `<span>${fmt(poDruhu[g])}</span>`;
      return soubor
        ? `<a href="${soubor}">${esc(g)} ${cislo}</a>`
        : `<a href="index.html?druh=${encodeURIComponent(g)}#mapa">${esc(g)} ${cislo}</a>`;
    }).join('');
  const poOkresu = {};
  for (const o of list) if (o.okres) poOkresu[o.okres] = (poOkresu[o.okres] || 0) + 1;
  const okresuCelkem = Object.keys(poOkresu).length;
  const okresyNej = Object.keys(poOkresu)
    .filter((ok) => hasOkresPage.has(ok))
    .sort((a, b) => poOkresu[b] - poOkresu[a] || a.localeCompare(b, 'cs'))
    .slice(0, 12);
  const okresLinks = okresyNej.map((ok) =>
    `<a href="${okresFile(ok)}">${esc(ok)} <span>${poOkresu[ok]}</span></a>`).join('');
  const vypsane = list.slice(0, STROP_ROZPOCET);
  const tS = typStrankyVypisu(vypsane);
  const rows = vypsane.map((o) => itemRow(o, false, null, tS.skryt)).join('\n');
  const zbyva = Math.max(0, count - STROP_ROZPOCET);
  /* Filtr ceny na mapě se jmenuje `maxc` (js/main.js, openFromUrl) — na
     mapě je pak v téhle ceně VŠECHNO, tedy i dražby a podíly, které jsou
     z výpisu výš vynechané. Je to u odkazu napsané. */
  const mapaOdkaz = `index.html?maxc=${r.strop}#mapa`;
  /* VĚTA O STAVEBNÍCH POZEMCÍCH je důvod, proč tahle stránka existuje. */
  const stavebniVeta = stavebnich === 0
    ? `Stavební pozemek v tomhle rozpočtu <b>v nabídce není ani jeden</b> z ${fmt(count)}.`
    : `Stavebních pozemků ${sklon(stavebnich, 'je', 'jsou', 'je')} v tomhle rozpočtu <b>${fmt(stavebnich)}</b> z ${fmt(count)}` +
      (stavebnich / count < 0.1 ? ` — tedy ${(stavebnich / count * 100).toFixed(1).replace('.', ',')} %.` : '.');
  const title = `Pozemky do ${r.popis} — nabídky z celé ČR | Parcelka`;
  const desc = `${fmt(count)} ${pluralPozemek(count)} do ${r.popis} z celé ČR — z veřejných zdrojů.`
    + ` Ceny od ${fmt(minP)} Kč, mediánová výměra ${fmt(medVymera)} m².`;
  const jsonld = { "@context": "https://schema.org", "@type": "CollectionPage",
    name: `Pozemky do ${r.popis}`, inLanguage: "cs", description: desc,
    mainEntityOfPage: SITE + r.soubor,
    publisher: { "@type": "Organization", name: "Parcelka" },
    mainEntity: seznamNabidek(list, count) };
  const crumbs = [
    { name: 'Pozemky', href: 'index.html', abs: SITE },
    { name: 'Podle rozpočtu', href: 'na-co-mam-pozemek.html', abs: SITE + 'na-co-mam-pozemek.html' },
    { name: `Do ${r.popis}`, abs: SITE + r.soubor },
  ];
  const jineRozpocty = rozpocetVznikne.filter((x) => x.soubor !== r.soubor)
    .map((x) => `<a href="${x.soubor}">Do ${esc(x.popis)} <span>${fmt(x.list.length)}</span></a>`).join('');
  const html = head(title, desc, r.soubor, jsonld, crumbs, r.og) + `
<main id="obsah">

  <section class="okr-hero">
    <div class="okr-band">
    <div class="wrap okr-wrap">
      <div class="eyebrow"><span class="live-dot"></span>Rozpočet do ${esc(r.popis)} · celá ČR</div>
      <h1>Pozemky do ${esc(r.popis)}.</h1>
      <p class="sub">Evidujeme <b>${fmt(count)} ${pluralPozemek(count)}</b> v téhle ceně — ve <b>${fmt(okresuCelkem)} ${sklon(okresuCelkem, 'okrese', 'okresech', 'okresech')}</b>, z veřejných zdrojů. Ceny od <b>${fmt(minP)} Kč</b>${maxP > minP ? ` do <b>${fmt(maxP)} Kč</b>` : ''}.</p>
    </div>
    </div>
  </section>

  <section class="section">
    <div class="wrap okr-wrap">

      <div class="okr-stats">
        <div class="okr-stat"><b>${fmt(count)}</b><span>${pluralPozemek(count)}</span></div>
        <div class="okr-stat"><b>${fmt(okresuCelkem)}</b><span>${sklon(okresuCelkem, 'okres', 'okresy', 'okresů')}</span></div>
        <div class="okr-stat"><b>${fmt(medVymera)} m²</b><span>mediánová výměra</span></div>
      </div>
      <p class="okr-more" style="margin-top:2px;">Prostřední cena za metr v tomhle rozpočtu je <b>${fmt(medZaM)} Kč/m²</b> — <a href="cena-pozemku.html">ceny pozemků v ČR</a>.</p>

      <div class="add-card" style="margin-top:22px;">
        <div class="rules-sect">
          <h2>Co se za ${esc(r.kratce)} dá koupit</h2>
          <p class="rules-note" style="margin-top:0;">${stavebniVeta} Pozemky v téhle ceně jsou téměř vždy <b>zemědělská půda nebo les</b>: postavit na nich dům znamená změnu <a href="uzemni-plan-pozemek.html">územního plánu</a> a <b>vynětí ze zemědělského půdního fondu</b>, za které se platí odvod — bývá to zdlouhavé a není na to nárok. <a href="stavebni-vs-zemedelsky-pozemek.html">Čím se stavební a zemědělský pozemek liší</a>.</p>
          <div class="okr-index-grid">
            ${druhRadky}
          </div>
        </div>
      </div>

      <div class="add-card" style="margin-top:22px;">
        <div class="rules-sect">
          <h2>Nabídky do ${esc(r.popis)}</h2>
          <p class="rules-note" style="margin-top:0;">Seřazeno od nejnižší ceny${zbyva ? `, vypsáno prvních ${STROP_ROZPOCET}` : ''}. V ceně jsou <b>jen prodeje</b> — dražba má vyvolávací cenu, ne cenu, a spoluvlastnický podíl má cenu za zlomek, ale výměru celé parcely; ani jedno se s rozpočtem neporovnává. Vynechané jsou i ceny, které cenový model označí za nevěrohodné. Data pocházejí z veřejných zdrojů a mohou se v čase měnit — aktuální stav vždy ověřte u zdroje a v katastru nemovitostí.</p>
${razitkoCerstvosti}
          <div class="okr-list">
${rows}
          </div>
${zbyva ? `          <p class="okr-more" style="margin-top:14px;"><a href="${mapaOdkaz}">${zbyvajici(zbyva)} ${fmt(zbyva)} ${pluralPozemek(zbyva)} najdete na mapě →</a></p>` : ''}
        </div>
      </div>

${okresLinks ? `
      <div class="add-card" style="margin-top:22px;">
        <div class="rules-sect">
          <h2>Kde se za ${esc(r.kratce)} koupí nejčastěji</h2>
          <p class="rules-note" style="margin-top:0;">Okresy s nejvíc nabídkami v této ceně.</p>
          <div class="okr-index-grid">
            ${okresLinks}
          </div>
          <p class="okr-more"><a href="pozemky-podle-okresu.html">Všechny kraje a okresy →</a></p>
        </div>
      </div>` : ''}

${jineRozpocty ? `
      <div class="add-card" style="margin-top:22px;">
        <div class="rules-sect">
          <h2>Jiný rozpočet</h2>
          <div class="okr-index-grid">
            ${jineRozpocty}
          </div>
          <p class="okr-more"><a href="na-co-mam-pozemek.html">Zadat vlastní částku →</a></p>
        </div>
      </div>` : ''}

      <div class="add-cross" style="margin-top:22px;">
        <div class="acx-copy">
          <h3>Všechno do ${esc(r.popis)} na mapě</h3>
          <p>Mapa s filtrem na tuhle cenu — a <b>i s dražbami a podíly</b>, které výpis výš vynechává. K tomu výměra, druh, sítě a odkazy do katastru na ověření.</p>
        </div>
        <a href="${mapaOdkaz}" class="btn-primary btn-glow">Otevřít na mapě →</a>
      </div>

      <p class="okr-more" style="margin-top:22px;">Nově přidané a zlevněné pozemky jsou na stránce <a href="nove-pozemky.html">co je na trhu nového</a>.</p>
      <p class="okr-more" style="margin-top:8px;">Než koupíte, projděte si <a href="kolik-stoji-koupe-pozemku.html">náklady při koupi</a>, <a href="pristupova-cesta-pozemek.html">jak je to s přístupovou cestou</a> a <a href="list-vlastnictvi-katastr.html">jak číst list vlastnictví</a>.</p>

    </div>
  </section>

</main>
` + footer();
  write(r.soubor, html);
  rozpocetStranky.push({ soubor: r.soubor, strop: r.strop, count });
}

/* Počet novinek za týden potřebuje i úvodní stránka (dlaždice
   „Co je nového"), proto stojí mimo blok níž. Jedno číslo, dvě
   místa — spočítat ho podruhé by znamenalo riskovat, že se
   rozejdou. */
let novychZaTyden = 0;
// ---------- CO JE NOVÉHO (nově přidané a změny cen) ----------
/* Web uměl říct, CO na trhu je. Neuměl říct, co se na něm POHNULO —
 * a to je jediná věc, pro kterou se člověk na takový web vrací.
 * Odebírat se to dalo jen kanálem RSS po krajích; stránka, kam se dá
 * poslat odkaz, nebyla žádná.
 *
 * DVĚ VĚCI, KTERÉ SE TADY MUSÍ PŘIZNAT, JINAK JE TO LEŽ:
 *
 * 1. „NOVÉ" ZNAMENÁ NOVÉ V NAŠÍ EVIDENCI, ne nové na trhu. První den,
 *    kdy robot zdroje obešel, dostalo `first_seen` naráz 1 637 nabídek
 *    z 1 998 — ty na trhu byly dávno předtím a nevíme jak dlouho.
 *    Kdyby se počítaly jako nové, slíbila by stránka osmnáctkrát víc
 *    novinek, než kolik jich opravdu je. Ten první den se proto celý
 *    vynechává a je to na stránce napsané. (Tatáž past, na kterou už
 *    jednou doplatil medián doby na trhu — viz archiv-statistiky.mjs.)
 *
 * 2. ZDRAŽENÍ SE NESCHOVÁVÁ. Kdyby stránka ukazovala jen zlevnění,
 *    vypadal by trh jako jednosměrka dolů. Pravidlo je v js/zlevneni.js
 *    a platí i tady: změna pod 3 % není zpráva, změna nad 50 % se
 *    nenazývá příležitostí, ale posílá se ověřit.
 */
{
  const DNU_NOVE = NOV.DNU_NOVE;   // okno pro „nově přidané"
  const STROP_NOVYCH = 60;    // kolik řádků se vypíše
  const STROP_ZMEN = 40;
  const soubor = 'nove-pozemky.html';
  /* První den evidence se počítá z CELÝCH dat (i z nabídek po termínu),
     protože je to vlastnost evidence, ne dnešní nabídky. */
  const prvniDen = NOV.prvniDenEvidence(all);
  const dnesIso = String(data.updated || '').slice(0, 10);
  const nove = NOV.noveNabidky(aktualni, { prvniDen, dnesIso });
  const novych7 = NOV.pocetNovych(aktualni, { prvniDen, dnesIso, dnu: 7 });
  novychZaTyden = novych7;
  /* ZMĚNY CEN. Historii nese data/zlevneni.json (pole [den, cena] podle
     klíče archivu) a vyhodnocuje ji js/zlevneni.js — včetně pojistky,
     že poslední cena v historii musí sedět na tu dnešní. */
  const historie = (() => {
    try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'zlevneni.json'), 'utf8')).nabidky || {}; }
    catch (e) { return {}; }
  })();
  const zlevnene = [], zdrazene = [], kOvereni = [];
  for (const o of aktualni) {
    const h = historie[PKKlic.klicArchivu(o)];
    const s = h && h.length > 1 ? Object.assign({}, o, { h }) : o;
    const z = PKZ.zmena(s);
    if (!z) continue;
    (z.podezrela ? kOvereni : (z.dolu ? zlevnene : zdrazene)).push({ o, z });
  }
  const poDni = (a, b) => String(b.z.kdy).localeCompare(String(a.z.kdy)) || b.z.procent - a.z.procent;
  /* DRAŽBA MEZI ZLEVNĚNÝMI NENÍ SLEVA. Napsal jsem nad ten seznam
     „prodávající snížil cenu" a u jedné z devětapadesáti nabídek to
     byla nepravda: u dražby cenu nesnižuje prodávající, ale vypisuje
     se nižší VYVOLÁVACÍ cena v opakované dražbě. Číslo je pravdivé,
     věta o něm nebyla. */
  const drazebVZlevneni = zlevnene.filter((x) => x.o.type === 'drazba' || x.o.type === 'exekuce').length;
  zlevnene.sort(poDni); zdrazene.sort(poDni); kOvereni.sort(poDni);

  function radekZmeny(x) {
    const smer = x.z.dolu ? '−' : '+';
    const popis = `${x.z.dolu ? 'předtím' : 'původně'} <b>${fmt(x.z.drive)} Kč</b>`
      + ` (${smer}${x.z.procent} %${x.z.kdy ? ', ' + PKZ.lidsky(x.z.kdy) : ''})`;
    return itemRow(x.o, false, popis);
  }
  /* Nově přidané po dnech. Datum je nadpis skupiny, ne další údaj
     v každém řádku — jinak by v šedesáti řádcích stálo šedesátkrát
     totéž a den by se v nich ztratil. */
  const tNov = typStrankyVypisu(nove.slice(0, STROP_NOVYCH));
  let noveBody = '', poslDen = null, vypsano = 0;
  for (const o of nove) {
    if (vypsano >= STROP_NOVYCH) break;
    if (o.first_seen !== poslDen) {
      if (poslDen !== null) noveBody += '          </div>\n';
      noveBody += `          <h3 class="okr-kraj-h">${esc(PKZ.lidsky(o.first_seen))}</h3>\n          <div class="okr-list">\n`;
      poslDen = o.first_seen;
    }
    noveBody += itemRow(o, false, null, tNov.skryt) + '\n';
    vypsano++;
  }
  if (poslDen !== null) noveBody += '          </div>\n';
  const zbyvaNovych = Math.max(0, nove.length - vypsano);

  const title = 'Nové pozemky a změny cen — co je na trhu nového | Parcelka';
  const desc = `${fmt(novych7)} ${pluralPozemek(novych7)} přišlo za posledních 7 dní`
    + `, u ${fmt(zlevnene.length)} ${sklon(zlevnene.length, 'nabídky klesla', 'nabídek klesla', 'nabídek klesla')} cena.`
    + ' Přehled z veřejných zdrojů, aktualizovaný čtyřikrát denně.';
  const jsonld = { "@context": "https://schema.org", "@type": "CollectionPage",
    name: 'Nové pozemky a změny cen', inLanguage: 'cs', description: desc,
    mainEntityOfPage: SITE + soubor,
    publisher: { "@type": "Organization", name: 'Parcelka' },
    mainEntity: seznamNabidek(nove, nove.length) };
  const crumbs = [
    { name: 'Pozemky', href: 'index.html', abs: SITE },
    { name: 'Co je nového', abs: SITE + soubor },
  ];
  const html = head(title, desc, soubor, jsonld, crumbs, 'nove-pozemky.png') + `
<main id="obsah">

  <section class="okr-hero">
    <div class="okr-band">
    <div class="wrap okr-wrap">
      <div class="eyebrow"><span class="live-dot"></span>Pohyb na trhu · celá ČR</div>
      <h1>Co je na trhu nového.</h1>
      <p class="sub">Za posledních sedm dní přišlo <b>${fmt(novych7)} ${pluralPozemek(novych7)}</b> a u <b>${fmt(zlevnene.length)} ${sklon(zlevnene.length, 'nabídky', 'nabídek', 'nabídek')}</b> klesla cena. Zdroje obcházíme čtyřikrát denně.</p>
    </div>
    </div>
  </section>

  <section class="section">
    <div class="wrap okr-wrap">

      <div class="okr-stats">
        <div class="okr-stat"><b>${fmt(novych7)}</b><span>nových za 7 dní</span></div>
        <div class="okr-stat"><b>${fmt(nove.length)}</b><span>nových za ${DNU_NOVE} dní</span></div>
        <div class="okr-stat"><b>${fmt(zlevnene.length)}</b><span>${sklon(zlevnene.length, 'zlevnilo', 'zlevnily', 'zlevnilo')}</span></div>
      </div>
${razitkoCerstvosti}

      <!-- PŘIZNÁNÍ PATŘÍ NAD SEZNAM, NE POD NĚJ. Je to jediné místo,
           kde se dá poznat, že „nové" neznamená „nové na trhu". -->
      <div class="add-card" style="margin-top:22px;">
        <div class="rules-sect">
          <h2>Co tady „nové" znamená</h2>
          <p class="rules-note" style="margin-top:0;">Nové <b>v naší evidenci</b> — tedy nabídky, které robot u zdroje poprvé viděl v posledních ${DNU_NOVE} dnech. Evidenci jsme začali <b>${esc(PKZ.lidsky(prvniDen))}</b> a toho dne naskočilo naráz ${fmt(NOV.pocetZPrvnihoDne(all, prvniDen))} nabídek, které na trhu byly už dřív — nevíme jak dlouho, takže se mezi novinky nepočítají. Co přišlo potom, je skutečně nové.</p>
        </div>
      </div>

${noveBody ? `
      <div class="add-card" style="margin-top:22px;">
        <div class="rules-sect">
          <h2>Nově přidané</h2>
          <p class="rules-note" style="margin-top:0;">${tNov.veta ? tNov.veta + ' ' : ''}Od nejnovějšího dne${zbyvaNovych ? `, vypsáno prvních ${STROP_NOVYCH}` : ''}. Data pocházejí z veřejných zdrojů a mohou se v čase měnit — aktuální stav vždy ověřte u zdroje a v katastru nemovitostí.</p>
${noveBody}
${zbyvaNovych ? `          <p class="okr-more" style="margin-top:14px;"><a href="index.html#mapa">${zbyvajici(zbyvaNovych)} ${fmt(zbyvaNovych)} ${pluralPozemek(zbyvaNovych)} najdete na mapě →</a></p>` : ''}
        </div>
      </div>` : ''}

${zlevnene.length ? `
      <div class="add-card" style="margin-top:22px;">
        <div class="rules-sect">
          <h2>Zlevněné</h2>
          <p class="rules-note" style="margin-top:0;">Nabídky, u kterých cena od našeho prvního záznamu <b>klesla</b>. Porovnává se s cenou z archivu, ne s cenou odhadnutou — a změna pod <b>${PKZ.MEZ_PROCENT} %</b> se nehlásí, protože to bývá jen zaokrouhlení u zdroje.${drazebVZlevneni ? ` U <b>${fmt(drazebVZlevneni)}</b> z nich jde o <b>dražbu</b>: tam nikdo nic nezlevnil, jen soud nebo dražebník vypsal nižší vyvolávací cenu v opakované dražbě.` : ''}</p>
          <div class="okr-list">
${zlevnene.slice(0, STROP_ZMEN).map(radekZmeny).join('\n')}
          </div>
${zlevnene.length > STROP_ZMEN ? `          <p class="okr-more" style="margin-top:14px;"><a href="index.html?zlevnene=1#mapa">Všechny zlevněné na mapě →</a></p>` : ''}
        </div>
      </div>` : ''}

${zdrazene.length ? `
      <div class="add-card" style="margin-top:22px;">
        <div class="rules-sect">
          <h2>Zdražené</h2>
          <p class="rules-note" style="margin-top:0;">Patří sem, i když to kupujícího netěší: kdybychom ukazovali jen zlevnění, vypadal by trh jako jednosměrka dolů.</p>
          <div class="okr-list">
${zdrazene.slice(0, STROP_ZMEN).map(radekZmeny).join('\n')}
          </div>
        </div>
      </div>` : ''}

${kOvereni.length ? `
      <div class="add-card" style="margin-top:22px;">
        <div class="rules-sect">
          <h2>Cena se změnila skokem — ověřte ji</h2>
          <p class="rules-note" style="margin-top:0;">Změna o <b>${PKZ.MEZ_PODEZRELA} %</b> a víc u pozemku za pár dnů bývá chyba ve zdroji, ne výprodej. Číslo neschováváme, ale nenazýváme ho příležitostí — ověřte cenu přímo v inzerátu.</p>
          <div class="okr-list">
${kOvereni.slice(0, STROP_ZMEN).map(radekZmeny).join('\n')}
          </div>
        </div>
      </div>` : ''}

      <div class="add-cross" style="margin-top:22px;">
        <div class="acx-copy">
          <h3>Chcete to dostávat sami?</h3>
          <p>Hlídání vás upozorní na nové pozemky v okolí, které si vyberete — nebo si odeberte kanál RSS svého kraje ze stránky kraje.</p>
        </div>
        <a href="hlidani.html" class="btn-primary btn-glow">Nastavit hlídání →</a>
      </div>

      <p class="okr-more" style="margin-top:22px;">Dál: <a href="pozemky-podle-okresu.html">pozemky podle regionu</a> · <a href="na-co-mam-pozemek.html">podle rozpočtu</a> · <a href="cena-pozemku.html">ceny pozemků v ČR</a>.</p>

    </div>
  </section>

</main>
` + footer();
  write(soubor, html);
  console.log(`  Co je nového: ${nove.length} nových za ${DNU_NOVE} dní (${novych7} za 7), `
    + `${zlevnene.length} zlevnilo, ${zdrazene.length} zdražilo, ${kOvereni.length} k ověření.`);
}

// ---------- CENOVÝ PŘEHLED (unikátní: kolik stojí m² podle druhu a kraje) ----------
{
  /* ===== REJSTŘÍK LOKALIT PRO VYHLEDÁVÁNÍ ============================
     Místo dvou dlouhých seznamů (14 krajů a 36 okresů pod sebou) si
     člověk lokalitu najde. Hledá se i podle OBCE — tak lidé přemýšlejí —
     ale cena se ukazuje za OKRES, a je to u ní napsané: změřeno, že
     z 1 046 obcí v nabídce by na vlastní medián jednoho druhu mělo dost
     dat jen devět. Číslo z pěti nabídek v jedné vesnici není cena
     v té vesnici, je to náhoda; okres je nejmenší celek, za který se
     dá něco tvrdit.

     Rejstřík se NEVKLÁDÁ do stránky, ale leží vedle v data/ceny-mist.json
     a stáhne se, teprve když někdo začne psát. Je to 30 kB obcí, které
     by jinak nesl každý, kdo stránku jen proletí. */
  const cenyMist = {
    ok: Object.keys(byOkres).sort((a, b) => a.localeCompare(b, 'cs')).map((okres) => ({
      n: okres,
      kraj: OKRES_KRAJ[okres] || '',
      h: okresFile(okres),
      c: byOkres[okres].length,
      p: priceByOkres[okres] || {},
    })),
    ob: (() => {
      const m = {};
      for (const o of all) {
        if (!o.place || !o.okres) continue;
        const k = o.place + '|' + o.okres;
        m[k] = (m[k] || 0) + 1;
      }
      return Object.keys(m).sort((a, b) => a.localeCompare(b, 'cs'))
        .map((k) => { const i = k.indexOf('|'); return [k.slice(0, i), k.slice(i + 1), m[k]]; })
        /* „25935" není obec, je to šum ze zdroje (PSČ v poli místa).
           V našeptávači by to vypadalo jako chyba webu. */
        .filter(([obec]) => !/^\d+$/.test(obec.trim()));
    })(),
  };
  write('data/ceny-mist.json', JSON.stringify(cenyMist));

  const file='cena-pozemku.html';

  /* ===== CO NA TÉHLE STRÁNCE JE A CO NE ===============================
     Byly tu čtyři věci: logaritmická osa cen podle druhu, vyhledávač
     lokality, seznam krajů, tabulka všech okresů a k tomu čipy
     „nejlevnější / nejdražší okres". Na telefonu z toho byl svitek na
     šest obrazovek a odpověď na otázku z nadpisu („kolik stojí
     pozemek?") se v něm ztratila.
     Zůstávají tři věci: co se na trhu děje (nahoře, protože je to
     jediné číslo, které nikde jinde není), kolik stojí půda u vás, a
     kraje. Okresní tabulka se nemaže ze světa — totéž, podrobněji
     a s nabídkami, je na stránce každého okresu, na kterou vede
     vyhledávač lokality o kus výš. */
  const key = 'Zemědělská půda';

  /* ===== CENY PO KRAJÍCH ==============================================
     Tři čísla v řádku, od nejlevnějšího kraje k nejdražšímu — ne podle
     abecedy. Kdo hledá, kde je půda levná, čte sloupec shora.

     PROSTŘEDNÍ ČÍSLO JE MEDIÁN, NE PRŮMĚR, a je to u něj napsané.
     Průměr by v kraji s pár přepálenými inzeráty vyšel vyšší než cena,
     za kterou se tam dá vůbec něco koupit: jeden pozemek za 4 000 Kč/m²
     mezi stovkou polí po 20 Kč/m² průměr utrhne, s mediánem nepohne.
     Slovo „obvyklá" je přesně to, co medián znamená.

     KRAJNÍ ČÍSLA JSOU ČTVRTINY (25. a 75. percentil), ne skutečné
     minimum a maximum. Skutečné minimum bývá překlep ve zdroji (pole za
     necelou korunu za m²) a skutečné maximum taky — ukázat je jako
     „nejnižší cena v kraji" by znamenalo tvrdit, že se za to tam dá
     koupit. Čtvrtiny říkají, kde leží prostřední polovina nabídek, a to
     tvrdit můžeme. Je to u tabulky napsané.

     JEDEN DRUH, A NAPSANÝ. Kdyby se do mediánu kraje smíchala
     zemědělská půda se stavebními parcelami, vyšel by kraj s hodně
     parcelami dráž — a porovnávaly by se jablka s hruškami. Zemědělská
     půda je ten druh, kterého je v datech nejvíc. */
  const krajeData = eligibleKraj
    .map((k) => ({ k, s: priceByKraj[k] && priceByKraj[k][key] }))
    .filter((x) => x.s)
    .sort((a, b) => a.s.med - b.s.med);
  const krajeRadky = krajeData.map((x) => {
    const disp = (KRAJ_META[x.k] || {}).disp || (x.k + ' kraj');
    const link = hasKrajPage.has(x.k) ? krajFile(x.k)
      : 'index.html?kraj=' + encodeURIComponent((KRAJ_META[x.k] || {}).mapName || x.k) + '#mapa';
    /* JEDNO VELKÉ ČÍSLO, rozpětí drobně pod ním. Byly tu tři stejně
       velká čísla vedle sebe, každé s vlastním popiskem — třináctkrát
       pod sebou z toho byla zeď textu a nebylo poznat, které z těch tří
       je ta cena. Obvyklá cena je odpověď; rozpětí je poznámka k ní. */
    return `        <a class="cenk-radek" href="${link}">
          <span class="cenk-kraj">${esc(disp)}</span>
          <b class="cenk-med">${fmt(x.s.med)}</b>
          <span class="cenk-pasmo">${fmt(x.s.lo)}\u2013${fmt(x.s.hi)}</span>
        </a>`;
  }).join('\n');
  const krajeSekce = !krajeRadky ? '' : `
      <div class="add-card" style="margin-top:22px;">
        <div class="rules-sect">
          <h2 id="cenk-nadpis">Ceny po krajích</h2>
          <p class="rules-note cenk-uvod" style="margin-top:0;">Zemědělská půda v <b>Kč/m²</b>, od nejlevnějšího kraje. Velké číslo je obvyklá cena, pod ním rozpětí, ve kterém leží polovina nabídek.</p>
          <div class="cenk-tab" aria-labelledby="cenk-nadpis">
${krajeRadky}
          </div>
        </div>
      </div>`;

  /* ===== JAK SE TRH CHOVÁ V ČASE =================================
     Zbytek téhle stránky je fotka: kolik pozemek stojí DNES. To má
     každý portál. Co nemá nikdo, je druhá osa — jak dlouho nabídka
     vydrží a kdy prodejce sleví. Na to je potřeba historie, a ta na
     webu je: archiv si od 14. 9. 2026 zapisuje každou nabídku a každou
     změnu ceny (scripts/archiv.mjs).

     KDE JE PAST. „Zmizelým nabídkám vyšel medián 7 dnů" je spočítané
     správně a je to nepravda: většina nabídek na trhu pořád je a je
     tam déle. Proto se tady medián doby na trhu NEUKAZUJE a je u toho
     napsané proč. Místo něj stojí otázka, která z krátkého okna
     odpověď má: kolik nabídek je po N dnech pryč.

     Celý výpočet i to, co odmítá vydat, je v scripts/archiv-statistiky.mjs
     a hlídá ho scripts/test-archiv-statistiky.mjs. Stránka jen kreslí. */
  const AT = (() => { try { const a = nactiArchiv();
    return statistiky(a.uzavrene, a.stav, a.stav.den || new Date().toISOString().slice(0, 10)); }
    catch (e) { return null; } })();
  const atZl = AT && AT.zlevneni;
  /* Bez dvou kohort a bez dost změn ceny tu není co říct a sekce se
     celá vynechá. Prázdná karta s nadpisem je horší než žádná. */
  const maTrh = !!(AT && (AT.krivka.length >= 2 || (atZl && atZl.pocet >= MIN_ZMEN)));
  /* TŘI VELKÁ ČÍSLA VEDLE SEBE, ne tři husté řádky. Dřív měl každý
     řádek popis, dráhu, procento a „42 z 997" v jedné lince — čtyři
     věci vedle sebe, třikrát pod sebou. Podíl je přitom to jediné,
     co se čte; zbytek je poznámka pod ním.
     DRÁHA ZŮSTÁVÁ, zúžená na 6 px: stojí na stupnici 0–100 %, takže
     prázdná část je ta informace („za dva týdny nezmizí skoro nic").
     Na nejdelší řádek se nepřepočítává — to by lhalo opačně. */
  const trhPruhy = maTrh ? AT.krivka.map((k) => `          <li class="trh-radek">
            <b class="trh-cislo">${k.podil} %</b>
            <span class="trh-popis">do ${k.dni} dní</span>
            <span class="trh-pas" aria-hidden="true"><i style="width:${Math.max(1.5, k.podil).toFixed(1)}%"></i></span>
            <span class="trh-zkolika">${fmt(k.pryc)} z ${fmt(k.zKolika)}</span>
          </li>`).join('\n') : '';
  const sekceTrhu = !maTrh ? '' : `
      <div class="add-card" style="margin-top:22px;">
        <div class="rules-sect">
          <h2 id="trh-nadpis">Jak rychle nabídky mizí</h2>
          <p class="rules-note" style="margin-top:0;">Sledováno den po dni od <b>${esc(datumCesky(AT.okno.od))}</b>, tedy ${fmt(AT.okno.dni)} dní.</p>
${trhPruhy ? `          <ul class="trh-seznam" aria-labelledby="trh-nadpis">
${trhPruhy}
          </ul>` : ''}
${atZl && atZl.pocet >= MIN_ZMEN ? `          <p class="trh-veta">Cena šla dolů u <b>${fmt(atZl.nabidek)} ${atZl.nabidek === 1 ? 'nabídky' : 'nabídek'}</b>${atZl.medianSleva !== null ? `, obvykle o <b>${atZl.medianSleva} %</b> po <b>${atZl.medianDni} dnech</b>` : ''}. Nahoru u ${fmt(atZl.zdrazeni)}.</p>` : ''}
        </div>
      </div>`;

  /* ===== VŠECHNY VÝHRADY NA JEDNOM MÍSTĚ, SBALENÉ ======================
     Výhrady k číslům byly rozsypané po celé stránce: odstavec pod
     křivkou, odstavec pod tabulkou krajů, věta u vyhledávače a k tomu
     sbalená metodika uvnitř první karty. Dohromady víc textu než čísel,
     a čtenář, který jen chce vědět, kolik stojí pole, se jím musel
     prokousat.
     Nic z toho se nemaže — mazat výhrady a nechat čísla je přesně ta
     nepoctivost, které se celý web vyhýbá. Jen stojí na jednom místě,
     na konci a sbalené, kde si je přečte ten, koho zajímají. */
  const metodika = `
          <details class="cen-metodika cen-samostatna">
            <summary>Jak tahle čísla počítáme</summary>
            <p class="rules-note">Pracujeme s cenami <b>nabídkovými</b>, z veřejně inzerovaných pozemků. Za kolik se pozemek nakonec prodal, se z veřejných zdrojů zjistit nedá.</p>
            <p class="rules-note">„Obvyklá" cena je <b>medián</b>, ne průměr: jeden pozemek za 4 000 Kč/m² mezi stovkou polí po 20 Kč/m² průměr utrhne, s mediánem nepohne. Rozpětí pod ním jsou <b>čtvrtiny</b> (25. a 75. percentil), ne nejlevnější a nejdražší inzerát — ten bývá překlep ve zdroji a tvrdit o něm „nejnižší cena v kraji" by znamenalo tvrdit, že se za to dá koupit.</p>
            <p class="rules-note">Do mediánů <b>nezapočítáváme ceny, které nestanovil trh</b>: vyvolávací cenu dražby, odhad u exekuce ani <b>prodej státní půdy podle § 12</b> — tam prodává Státní pozemkový úřad oprávněné osobě za cenu stanovenou úředně. Je to desetina všech nabídek a cena je jinde: u orné půdy medián 8 Kč/m² proti 74 Kč/m² na trhu, u zahrady 40 proti 791. Smíchané by vyšlo číslo, které neplatí ani pro stát, ani pro trh. Ty nabídky na webu zůstávají, jen neurčují „obvyklou cenu".</p>
            <p class="rules-note"><b>Spoluvlastnické podíly se započítávají</b>, ale přepočtené: cena se dělí výměrou, která kupujícímu připadne, ne celou parcelou. U podílu 1/6 je tedy cena za metr šestkrát vyšší než při naivním dělení. Když velikost podílu inzerát neuvádí, nabídka se do mediánu nedostane vůbec — vymyslet si ji nelze. Kraje se počítají jen ze zemědělské půdy, aby se nemíchala s dražšími stavebními parcelami; vyhledávač výš ukazuje medián za celý okres, protože menší celek by byla hrstka nabídek.</p>
${maTrh ? `            <p class="rules-note">Do podílu „po N dnech pryč" jdou <b>jen nabídky, které jsme mohli sledovat celých N dní</b> — proto je u každého čísla napsané, z kolika. „Pryč" znamená, že nabídka zmizela ze zdroje; nemusí to znamenat prodáno, mohla být i stažena.</p>
            <p class="rules-note"><b>Průměrnou dobu prodeje tu nenajdete</b>, protože by to byla nepravda. Okno je ${fmt(AT.okno.dni)} dní a ${fmt(AT.sledovano.zivych)} nabídek na trhu pořád je — u většiny z nich ještě nevíme, jak dlouho tam nakonec budou. Medián jen z těch, co už zmizely, by vyšel krátký: zmizely přece ty rychlé. Statistika tomu říká <b>cenzurování zprava</b>. Až okno povyroste a většina sledovaných nabídek skončí, bude se dát spočítat i medián — do té doby ne.</p>` : ''}
          </details>`;

  const natZ = priceNational[key];
  const title = 'Ceny pozemků v ČR — kolik stojí m² půdy | Parcelka';
  const desc = `Kolik stojí metr čtvereční pozemku v Česku? Orientační medián cen z aktuálních nabídek podle druhu a kraje.${natZ?' Zemědělská půda medián '+fmt(natZ.med)+' Kč/m².':''}`;
  const jsonld = {"@context":"https://schema.org","@type":"CollectionPage","name":"Ceny pozemků v ČR","inLanguage":"cs","description":"Orientační medián cen pozemků (Kč/m²) podle druhu a kraje z aktuálních nabídek.","mainEntityOfPage":`https://www.parcelaka.cz/${file}`,"publisher":{"@type":"Organization","name":"Parcelka"}};
  const crumbs=[{name:'Pozemky',href:'index.html',abs:SITE},{name:'Ceny pozemků',abs:SITE+file}];

  /* Mapová knihovna tu NENÍ. Barevná mapa okresů ze stránky zmizela,
     když ji vystřídal vyhledávač lokality — jen `sMapou: true` tu zůstalo
     stát, takže si 100 % návštěvníků téhle stránky stahovalo 14,5 kB
     mapového stylopisu (a ten blokuje vykreslení) a značku pro knihovnu,
     kterou tu nikdo nečte: skript, který `pk-leaflet` čte, je
     js/pozemek.js a ten se sem nenačítá. */
  const html = head(title,desc,file,jsonld,crumbs,'cena-pozemku.png') + `
<main id="obsah">

  <section class="okr-hero">
    <div class="okr-band">
    <div class="wrap okr-wrap">
      <div class="eyebrow"><span class="live-dot"></span>Ceny pozemků · celá ČR</div>
      <h1>Kolik stojí pozemek?</h1>
      <!-- Podnadpis ODPOVÍDÁ na otázku z nadpisu, místo aby sliboval, co
           je níž. Celostátní medián zemědělské půdy je to jediné číslo,
           které platí všude — a kdo přišel z vyhledávače, má odpověď
           dřív, než cokoli odroluje. -->
      <p class="sub">${natZ ? `Zemědělská půda u nás stojí obvykle <b>${fmt(natZ.med)} Kč/m²</b>. Kolik ve vašem okrese, zjistíte níž.` : 'Co se dnes na trhu děje, kolik stojí půda u vás a jak se liší kraj od kraje.'}</p>
    </div>
    </div>
  </section>

  <section class="section">
    <div class="wrap okr-wrap">

      <!-- GRAF CENOVÉ HLADINY ZA CELOU ČR. Byl na 91 stránkách okresů
           a krajů, ale na stránce, která je přímo o cenách, chyběl — a to
           je ta nejpodivnější díra: data pro celostátní řadu v
           data/historie-cen.json ležela od začátku (osm řad podle druhu,
           z toho čtyři dost klidné na kreslení), jen je nikdo nežádal.
           Je to TENTÝŽ prvek i skript jako na okresech, žádný druhý
           výpočet; řadu si vybere js/graf-cen.js sám podle toho, která je
           nejlépe doložená, a když by žádná klidná nebyla, nenakreslí nic
           — ani prázdný rámeček. Stojí hned pod podnadpisem, protože ten
           říká dnešní hladinu a graf k ní dodává, kam se hýbe. -->
      <div class="add-card" style="margin-top:22px;">
        <div class="rules-sect">
          <div data-graf-cen data-uroven="cr" data-kde="v celé ČR"></div>
        </div>
      </div>

${sekceTrhu}

      <div class="add-card" style="margin-top:22px;">
        <div class="rules-sect">
          <h2 id="ceny-hledat-nadpis">Kolik stojí půda u vás</h2>
          <!-- Žádný odstavec s návodem: co se má napsat, říká samo pole
               („Třeba Benešov nebo Zdice"), a že je výsledek za celý
               okres, stojí v metodice dole. Věta navíc tady znamenala
               tři řádky textu nad jedním polem. -->
          <div class="cenh" style="margin-top:14px;">
            <div class="cenh-pole">
              <svg class="cenh-lupa" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-4.2-4.2"/></svg>
              <input type="text" id="cenh-vstup" role="combobox" autocomplete="off"
                aria-expanded="false" aria-autocomplete="list" aria-controls="cenh-navrhy"
                aria-labelledby="ceny-hledat-nadpis" placeholder="Třeba Benešov nebo Zdice">
              <!-- Nabídka patří DOVNITŘ pole, ne vedle něj: plave na
                   top:100 % a to se počítá z nejbližšího polohovaného rodiče.
                   Vedle pole by to byla celá .cenh včetně karty s výsledkem,
                   takže by návrhy skočily až pod ni. -->
              <ul class="cenh-navrhy" id="cenh-navrhy" role="listbox" hidden></ul>
            </div>
            <div class="cenh-vysledek" id="cenh-vysledek" role="status" aria-live="polite"></div>
          </div>
        </div>
      </div>

${krajeSekce}

${metodika}

      <div class="add-cross" style="margin-top:22px;">
        <div class="acx-copy">
          <h3>Najděte konkrétní pozemek</h3>
          <p>Ceny přímo v místě, které vás zajímá — s prokliky do katastru.</p>
        </div>
        <a href="index.html#mapa" class="btn-primary btn-glow">Otevřít mapu →</a>
      </div>

${razitkoCerstvosti}

      <p class="okr-more" style="margin-top:22px;">Souvisí: <a href="na-co-mam-pozemek.html">na co mám podle rozpočtu</a> · <a href="kolik-stoji-koupe-pozemku.html">náklady při koupi</a> · <a href="stavebni-vs-zemedelsky-pozemek.html">stavební vs. zemědělský pozemek</a> · <a href="pozemky-podle-okresu.html">pozemky podle regionu</a>.</p>

    </div>
  </section>

</main>
` + footer({ graf: true }) + `<script src="js/hledani.js?${V.hledani}" defer></scr` + `ipt>
<script src="js/ceny-hledani.js?${V.cenyHledani}" defer></scr` + `ipt>
`;
  write(file, html);
}

// ---------- ROZCESTNÍK ----------
const totalListed = okresPages.reduce((s,p)=>s+p.count,0);
let krajGrid = '';
for(const k of eligibleKraj){
  const m=KRAJ_META[k];
  krajGrid += `            <a href="${krajFile(k)}">${esc(m.disp)} <span>${byKraj[k].length} ${pluralPozemek(byKraj[k].length)}</span></a>\n`;
}
okresPages.sort((a,b)=>KRAJ_ORDER.indexOf(a.kraj)-KRAJ_ORDER.indexOf(b.kraj) || b.count-a.count);
let okresBody='', lastKraj=null;
for(const p of okresPages){
  if(p.kraj!==lastKraj){
    if(lastKraj!==null) okresBody += `          </div>\n`;
    const kd = (KRAJ_META[p.kraj]||{}).disp || (p.kraj+' kraj');
    const kh = hasKrajPage.has(p.kraj) ? `<a href="${krajFile(p.kraj)}" style="color:inherit;">${esc(kd)}</a>` : esc(kd);
    okresBody += `          <h3 class="okr-kraj-h">${kh}</h3>\n          <div class="okr-index-grid">\n`;
    lastKraj=p.kraj;
  }
  okresBody += `            <a href="${p.file}">${esc(p.okres)} <span>${p.count} ${pluralPozemek(p.count)}</span></a>\n`;
}
if(lastKraj!==null) okresBody += `          </div>\n`;

/* Rozcestník podle rozpočtu. Odkazuje se jen na stránky, které dnes
   opravdu vznikly (ROZPOCTY má mez MIN_ROZPOCET) — jinak by to byl
   mrtvý odkaz z nejnavštěvovanějšího rozcestníku webu. */
let rozpocetGrid = '';
for (const r of rozpocetStranky) {
  const popis = (ROZPOCTY.find((x) => x.strop === r.strop) || {}).popis || '';
  rozpocetGrid += `            <a href="${r.soubor}">Do ${esc(popis)} <span>${fmt(r.count)} ${pluralPozemek(r.count)}</span></a>\n`;
}

const idxTitle='Pozemky podle krajů a okresů — celá ČR | Parcelka';
const idxDesc=`Přehled pozemků v ${krajPages.length} krajích a ${okresPages.length} okresech Česka — prodeje, dražby a exekuce z veřejných zdrojů na jedné mapě. Vyberte region a prohlédněte si aktuální nabídky.`;
const idxJsonld={"@context":"https://schema.org","@type":"CollectionPage","name":"Pozemky podle krajů a okresů","inLanguage":"cs","description":idxDesc,"mainEntityOfPage":"https://www.parcelaka.cz/pozemky-podle-okresu.html","publisher":{"@type":"Organization","name":"Parcelka"}};
const idxCrumbs=[{name:'Pozemky', href:'index.html', abs:SITE},{name:'Pozemky podle krajů a okresů', abs:SITE+'pozemky-podle-okresu.html'}];
const idxHtml = head(idxTitle,idxDesc,'pozemky-podle-okresu.html',idxJsonld,idxCrumbs) + `
<main id="obsah">

  <section class="okr-hero">
    <div class="okr-band">
    <div class="wrap okr-wrap">
      <div class="eyebrow"><span class="live-dot"></span>Pozemky podle regionu</div>
      <h1>Pozemky podle krajů a okresů.</h1>
      <p class="sub">Vyberte kraj nebo okres a prohlédněte si aktuální nabídky pozemků — prodeje, dražby i exekuce z veřejných zdrojů. Pokryto <b>${krajPages.length} krajů</b> a <b>${okresPages.length} okresů</b>, přes <b>${fmt(totalListed)} ${pluralPozemek(totalListed)}</b> na jedné mapě.</p>
    </div>
    </div>
  </section>

  <section class="section">
    <div class="wrap okr-wrap">

      <p class="okr-more" style="margin-top:0;margin-bottom:18px;">Vracíte se? Podívejte se, <a href="nove-pozemky.html">co je na trhu nového</a> — nově přidané pozemky a nabídky, u kterých klesla cena.</p>

      <div class="add-cross" style="margin-top:0;">
        <div class="acx-copy">
          <h3>Nechcete vybírat region?</h3>
          <p>Otevřete celou mapu Česka a filtrujte podle ceny, výměry i druhu pozemku.</p>
        </div>
        <a href="index.html#mapa" class="btn-primary btn-glow">Otevřít mapu →</a>
      </div>

      <div class="add-card" style="margin-top:22px;">
        <div class="rules-sect">
          <h2>Podle kraje</h2>
          <div class="okr-index-grid">
${krajGrid}          </div>
        </div>
      </div>

      <div class="add-card" style="margin-top:22px;">
        <div class="rules-sect">
          <h2>Podle okresu</h2>
${okresBody}
        </div>
      </div>

${rozpocetGrid ? `      <div class="add-card" style="margin-top:22px;">
        <div class="rules-sect">
          <h2>Podle rozpočtu</h2>
          <p class="rules-note" style="margin-top:0;">Když víte, kolik máte, ale ne kde hledat. U každé částky je i to, kolik z nabídek v ní jsou opravdu stavební pozemky.</p>
          <div class="okr-index-grid">
${rozpocetGrid}          </div>
          <p class="okr-more"><a href="na-co-mam-pozemek.html">Zadat vlastní částku →</a></p>
        </div>
      </div>
` : ''}
    </div>
  </section>

</main>
` + footer();
write('pozemky-podle-okresu.html', idxHtml);

// ---------- SITEMAP ----------
const staticUrls=[
  {loc:'',cf:'daily',pr:'1.0'},
  {loc:'pridat.html',cf:'weekly',pr:'0.8'},
  {loc:'pozemky-podle-okresu.html',cf:'weekly',pr:'0.9'},
  {loc:'drazby-pozemku-nabidky.html',cf:'weekly',pr:'0.7'},
  {loc:'drazby-pozemku.html',cf:'monthly',pr:'0.7'},
  {loc:'exekuce-pozemku.html',cf:'monthly',pr:'0.7'},
  {loc:'kolik-stoji-koupe-pozemku.html',cf:'monthly',pr:'0.7'},
  {loc:'kupni-smlouva-pozemek.html',cf:'monthly',pr:'0.7'},
  {loc:'pozemek-od-obce.html',cf:'monthly',pr:'0.7'},
  {loc:'pristupova-cesta-pozemek.html',cf:'monthly',pr:'0.7'},
  {loc:'stavebni-vs-zemedelsky-pozemek.html',cf:'monthly',pr:'0.7'},
  {loc:'list-vlastnictvi-katastr.html',cf:'monthly',pr:'0.7'},
  {loc:'vecne-bremeno-pozemek.html',cf:'monthly',pr:'0.7'},
  {loc:'hypoteka-na-pozemek.html',cf:'monthly',pr:'0.7'},
  {loc:'na-co-mam-pozemek.html',cf:'weekly',pr:'0.8'},
  /* Mění se při každém běhu robota (čtyřikrát denně) — proto `daily`
     a vysoká priorita: je to nejčerstvější obsah na webu. */
  {loc:'nove-pozemky.html',cf:'daily',pr:'0.8'},
  {loc:'uzemni-plan-pozemek.html',cf:'monthly',pr:'0.7'},
  {loc:'cena-pozemku.html',cf:'weekly',pr:'0.8'},
  {loc:'data.html',cf:'daily',pr:'0.5'},
  {loc:'pravidla-inzerce.html',cf:'monthly',pr:'0.4'},
  {loc:'podminky.html',cf:'yearly',pr:'0.3'},
  {loc:'ochrana-udaju.html',cf:'yearly',pr:'0.3'},
  {loc:'kontakt.html',cf:'yearly',pr:'0.3'},
];
let sm='<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n';
for(const u of staticUrls) sm+=`  <url>\n    <loc>https://www.parcelaka.cz/${u.loc}</loc>\n    <changefreq>${u.cf}</changefreq>\n    <priority>${u.pr}</priority>\n  </url>\n`;
for(const p of krajPages) sm+=`  <url>\n    <loc>https://www.parcelaka.cz/${p.file}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>\n`;
for(const p of okresPages) sm+=`  <url>\n    <loc>https://www.parcelaka.cz/${p.file}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.6</priority>\n  </url>\n`;
/* Stránky podle druhu pozemku. Priorita jako u krajů: je to vstup
   z vyhledávače („les na prodej"), ne odbočka. */
for(const p of druhStranky) sm+=`  <url>\n    <loc>https://www.parcelaka.cz/${p.soubor}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>\n`;
/* Stránky podle rozpočtu („pozemky do 500 tisíc"). Taky vstup z vyhledávače,
   proto táž priorita jako kraje a druhy. */
for(const p of rozpocetStranky) sm+=`  <url>\n    <loc>https://www.parcelaka.cz/${p.soubor}</loc>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>\n`;
sm+='</urlset>\n';
write('sitemap.xml', sm);

console.log(`Vygenerováno: ${okresPages.length} okresních + ${krajPages.length} krajských + ${druhStranky.length} podle druhu + ${rozpocetStranky.length} podle rozpočtu + dražby (${drazby.length}) + rozcestník. Sitemap: ${staticUrls.length+krajPages.length+okresPages.length+druhStranky.length+rozpocetStranky.length} URL.`);

/* =====================================================================
   ČÍSLA PŘÍMO V HTML ÚVODNÍ STRÁNKY
   V index.html stálo natvrdo „1900+" a v rozcestníku krajů samé pomlčky
   („Praha —"). Skript je při načtení přepsal, jenže:
     · než se skript stihne spustit, vidí člověk „1900+" a pomlčky,
     · vyhledávač, který stránku čte bez skriptu, vidí totéž — tedy
       u každého kraje prázdno,
     · a „1900+" navíc nesedělo s živým počtem, takže na jedné obrazovce
       byla dvě různá čísla o téže věci.
   Čísla se proto zapisují do HTML při každém běhu robota. Skript je pak
   jen potvrdí, místo aby je doplňoval.
   ===================================================================== */
{
  const idx = path.join(ROOT, 'index.html');
  let h = fs.readFileSync(idx, 'utf8');
  const pred = h;
  /* `aktualni` je už bez duplicit (odstraňují se při načtení, stejně jako
     v aplikaci) a bez dražeb po termínu — a to druhé je tu podstatné:
     tohle číslo stojí v úvodu jako „1 996 pozemků na jedné mapě", kdežto
     mapa pod ním si prošlé dražby odečítá. Dvě různá čísla o téže věci
     na téže obrazovce. */
  const bezDup = aktualni;
  const celkem = bezDup.length;
  const okresu = new Set(bezDup.map((o) => o.okres).filter(Boolean)).size;
  const pocetKraj = {};
  for (const o of bezDup) { const k = OKRES_KRAJ[o.okres]; if (k) pocetKraj[k] = (pocetKraj[k] || 0) + 1; }

  /* Uvítací blok s počtem pozemků z index.html zmizel (na přání majitele
     webu: bylo to číslo, které hned pod ním rozepisovaly pilulky, a věta
     o webu nad nástrojem). Doplňování těch dvou čísel tedy taky padá —
     zbyly počty u krajů v rozcestníku, kde jsou pořád na místě. */
  h = h.replace(/(<span class="kj-c mono" data-kraj=")([^"]+)(">)[^<]*(<\/span>)/g,
    (_, a, kraj, b, c) => {
      const n = pocetKraj[kraj] || 0;
      return a + kraj + b + (n ? `${fmt(n)} ${pluralPozemek(n)}` : 'zatím žádné') + c;
    });
  /* Dlaždice „Co je nového" nese počet za posledních sedm dní — týž,
     jaký stojí na té stránce. Bere se z jedné proměnné, ne z druhého
     výpočtu. */
  h = h.replace(/(<span class="kj-c mono" data-novinky="7">)[^<]*(<\/span>)/,
    (_, a, b) => a + (novychZaTyden
      ? `${fmt(novychZaTyden)} ${pluralPozemek(novychZaTyden)} za 7 dní`
      : 'za posledních 7 dní') + b);
  if (h !== pred) { fs.writeFileSync(idx, h, 'utf8'); console.log('Čísla v index.html doplněna: ' + fmt(celkem) + ' pozemků, ' + okresu + ' okresů.'); }
}

/* =====================================================================
   SEZNAM OKRESŮ DO 404.html
   Kdo přijde na odkaz pozemku, který už není v nabídce (prodal se, inzerát
   skončil a stránka se smazala), dostane místo holého „nenašli jsme"
   odkaz na svůj okres. Z názvu souboru se ale okres pozná jen porovnáním
   se skutečným seznamem — obojí má pomlčky. Zapisuje se sem proto, aby
   se seznam nerozešel se stránkami okresů, které vznikají o pár řádků výš.
   ===================================================================== */
{
  const cesta = path.join(ROOT, '404.html');
  let h = fs.readFileSync(cesta, 'utf8');
  const pred = h;
  const mapa = {};
  /* Jen okresy, které stránku OPRAVDU mají. Seznam v OKRES_KRAJ je širší
     (je v něm i „Hlavní město Praha", kde se pozemky vedou pod okresem
     „Praha") a odkaz na neexistující stránku by z jedné 404 udělal dvě. */
  for (const okres of [...hasOkresPage].sort()) mapa[slug(okres)] = okres;
  const zapis = JSON.stringify(mapa);
  h = h.replace(/\/\*ZACATEK-OKRESY\*\/[\s\S]*?\/\*KONEC-OKRESY\*\//,
    '/*ZACATEK-OKRESY*/' + zapis + '/*KONEC-OKRESY*/');
  if (h === pred && h.indexOf('/*ZACATEK-OKRESY*/') === -1) {
    console.warn('POZOR: v 404.html chybí značky ZACATEK-OKRESY — seznam okresů se nedoplnil.');
  } else if (h !== pred) {
    fs.writeFileSync(cesta, h, 'utf8');
    console.log('Seznam okresů v 404.html doplněn: ' + Object.keys(mapa).length + ' okresů.');
  }

  /* TÝŽ SEZNAM DO FORMULÁŘE. Okres se v „Přidat pozemek" psal z hlavy
     do prázdného políčka — a překlep v okrese je drahý: podle něj se
     inzerát zařadí na krajskou i okresní stránku, najdou ho uložená
     hlídání a poměří se jeho cena s okolím. Nabídka se doplní odsud,
     ze stejného zdroje jako stránky okresů, aby se nemohla rozejít. */
  {
    const cestaP = path.join(ROOT, 'pridat.html');
    if (fs.existsSync(cestaP)) {
      let hp = fs.readFileSync(cestaP, 'utf8');
      const predP = hp;
      const volby = [...hasOkresPage].sort((a2, b2) => a2.localeCompare(b2, 'cs'))
        .map((o) => `<option value="${esc(o)}"></option>`).join('');
      hp = hp.replace(/\/\*ZACATEK-OKRESY-VOLBY\*\/[\s\S]*?\/\*KONEC-OKRESY-VOLBY\*\//,
        '/*ZACATEK-OKRESY-VOLBY*/' + volby + '/*KONEC-OKRESY-VOLBY*/');
      if (hp === predP && hp.indexOf('/*ZACATEK-OKRESY-VOLBY*/') === -1) {
        console.warn('POZOR: v pridat.html chybí značky ZACATEK-OKRESY-VOLBY — nabídka okresů se nedoplnila.');
      } else if (hp !== predP) {
        fs.writeFileSync(cestaP, hp, 'utf8');
        console.log('Nabídka okresů v pridat.html doplněna: ' + [...hasOkresPage].length + ' okresů.');
      }
    }
  }
}
