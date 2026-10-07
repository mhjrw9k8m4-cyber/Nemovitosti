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
  hlidani: razitko('js/hlidani-logika.js'),
  feed: razitko('js/upozorneni-feed.js'),
  upoz: razitko('js/upozorneni.js'),
  hlavicka: razitko('js/hlavicka.js'),
  grafCen: razitko('js/graf-cen.js'),
  offline: razitko('js/offline.js'),
  cenovaMapa: razitko('js/cenova-mapa.js'),
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
const KRAJ_ORDER = ['Praha','Středočeský','Jihočeský','Plzeňský','Karlovarský','Ústecký','Liberecký','Královéhradecký','Pardubický','Vysočina','Jihomoravský','Olomoucký','Zlínský','Moravskoslezský'];
const KRAJ_META = {
 'Praha':            { disp:'Praha',              loc:'v Praze',                 mapName:'Praha' },
 'Středočeský':      { disp:'Středočeský kraj',   loc:'ve Středočeském kraji',   mapName:'Středočeský' },
 'Jihočeský':        { disp:'Jihočeský kraj',     loc:'v Jihočeském kraji',      mapName:'Jihočeský' },
 'Plzeňský':         { disp:'Plzeňský kraj',      loc:'v Plzeňském kraji',       mapName:'Plzeňský' },
 'Karlovarský':      { disp:'Karlovarský kraj',   loc:'v Karlovarském kraji',    mapName:'Karlovarský' },
 'Ústecký':          { disp:'Ústecký kraj',       loc:'v Ústeckém kraji',        mapName:'Ústecký' },
 'Liberecký':        { disp:'Liberecký kraj',     loc:'v Libereckém kraji',      mapName:'Liberecký' },
 'Královéhradecký':  { disp:'Královéhradecký kraj', loc:'v Královéhradeckém kraji', mapName:'Královéhradecký' },
 'Pardubický':       { disp:'Pardubický kraj',    loc:'v Pardubickém kraji',     mapName:'Pardubický' },
 'Vysočina':         { disp:'Kraj Vysočina',      loc:'na Vysočině',             mapName:'Vysočina' },
 'Jihomoravský':     { disp:'Jihomoravský kraj',  loc:'v Jihomoravském kraji',   mapName:'Jihomoravský' },
 'Olomoucký':        { disp:'Olomoucký kraj',     loc:'v Olomouckém kraji',      mapName:'Olomoucký' },
 'Zlínský':          { disp:'Zlínský kraj',       loc:'ve Zlínském kraji',       mapName:'Zlínský' },
 'Moravskoslezský':  { disp:'Moravskoslezský kraj', loc:'v Moravskoslezském kraji', mapName:'Moravskoslezský' }
};
const TYPE_LABEL = { sale:'Na prodej', drazba:'Dražba', exekuce:'Exekuce', obec:'Záměr obce', majitel:'Od majitele' };

function slug(s){
  const map={'á':'a','č':'c','ď':'d','é':'e','ě':'e','í':'i','ň':'n','ó':'o','ř':'r','š':'s','ť':'t','ú':'u','ů':'u','ý':'y','ž':'z'};
  return String(s).toLowerCase().replace(/[áčďéěíňóřšťúůýž]/g,c=>map[c]||c).replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'');
}
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
function krajFile(kraj){ return `pozemky-${slug(kraj)}-kraj.html`; }
function okresFile(okres){ return `pozemky-okres-${slug(okres)}.html`; }
function write(file, html){ fs.writeFileSync(path.join(ROOT, file), html); }

const data = JSON.parse(fs.readFileSync(path.join(ROOT,'data','opportunities.json'),'utf8'));
/* Kdy robot naposledy zdroje procházel. Časté dotazy slibují „u každé
   lokality vidíte, kdy proběhla poslední aktualizace" — a na krajských
   ani okresních stránkách to nikde nestálo, takže ten slib nebyl čím
   podepřít. Píše se česky, ne 2026-09-22. */
const zkontrolovano = (() => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(data.updated || '');
  return m ? `${+m[3]}. ${+m[2]}. ${m[1]}` : '';
})();
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
const DRUH_GROUPS = ['Zemědělská půda','Lesní pozemek','Zahrada','Stavební'];
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
 * do výpočtu nepatřilo. Spodní mez uvěřitelnosti zůstává: i po přepočtu
 * najde v datech tutéž mezeru (16,2 místo 16,8 Kč/m²) a odřízne 137
 * nabídek místo 140, takže ty nejlevnější shluky nejsou jen podíly. */
function zaMetrPoctive(o){
  const v = CENY.zaMetr(o);
  return (v == null || !isFinite(v)) ? null : v;
}
function dolniMez(v){
  const n=v.length;
  if(n<60) return 0;                       // z hrstky se tvar rozdělení poznat nedá
  const m=median(v); if(!(m>0)) return 0;
  const krok=m/20, konec=m*0.7;
  const bin=[]; for(let a=0;a<konec;a+=krok) bin.push(v.filter(x=>x>=a&&x<a+krok).length);
  let maxDosud=0, podNim=0;
  for(let i=0;i<bin.length;i++){
    if(bin[i]>maxDosud) maxDosud=bin[i];
    podNim+=bin[i];
    // Shluk musí být znát (2 % vzorku), pod mezerou musí něco ležet (3 %)
    // a mezera musí být aspoň dva koše skoro prázdné.
    if(maxDosud>=n*0.02 && podNim>=n*0.03 && bin[i]<=maxDosud*0.12 && (bin[i+1]??99)<=maxDosud*0.12){
      return (i+2)*krok;
    }
  }
  return 0;
}
/* Meze se počítají JEDNOU z celostátních dat a pak platí i pro kraje a okresy.
 * V okrese s devatenácti nabídkami by se tvar rozdělení hledat nedal — a přitom
 * právě tam ty podíly nejvíc škodí. */
const MEZE_DRUHU = {};
let ODFILTROVANO = 0;
function spoctiMeze(list){
  const b={};
  for(const o of list){
    if(!jeBeznaNabidka(o)) continue;   // stejný vzorek jako priceStats
    if(!(o.price>0 && o.area>=100 && o.area<=500000)) continue;
    const g=druhGroup(o.druh); if(g==='Ostatní') continue;
    const perm2=zaMetrPoctive(o);
    if(perm2==null) continue;
    if((g==='Zemědělská půda' || g==='Lesní pozemek') && perm2>500) continue;
    (b[g]=b[g]||[]).push(perm2);
  }
  /* Ořez se hledá JEN u zemědělské půdy a lesa. Tam je shluk za pár korun
     za metr spolehlivě spoluvlastnický podíl, ne levné pole — a právě kvůli
     tomu celý mechanismus vznikl.
     U zahrad a stavebních pozemků je levná cena normální cena, a hledat
     v nich „mezeru" je nebezpečné: v datech z 22. 9. 2026 by heuristika
     u zahrad uřízla 37 z 86 nabídek (všechno pod ~45 Kč/m²) a vyhlášený
     medián zahrady by tím vyskočil o polovinu. Číslo, které web vydává za
     obvyklou cenu, se nesmí opírat o dvě třetiny trhu. */
  const SE_ZKOUMA = ['Zemědělská půda', 'Lesní pozemek'];
  for(const g of Object.keys(b)){
    MEZE_DRUHU[g] = SE_ZKOUMA.indexOf(g) === -1 ? 0 : dolniMez(b[g]);
    ODFILTROVANO += b[g].filter(x=>x<MEZE_DRUHU[g]).length;
  }
}
/* Do ceny se počítají JEN běžné nabídky k prodeji.
   Vyvolávací cena dražby ani odhad u exekuce není nabídková cena: první je
   z podstaty věci pod trhem, druhá bývá u zastavěných pozemků naopak vysoko.
   Když se počítaly dohromady, tvrdil web o téže věci dvě různá čísla —
   stránka cen hlásila u zahrady 140 Kč/m², kdežto odhad u pozemku počítal
   se 110 Kč/m² (ten dražby vynechával odjakživa, viz js/ceny.js). U ostatní
   plochy dělal ten rozpor 41 %. Obě strany teď počítají z téhož. */
function jeBeznaNabidka(o){ return o.type === 'sale'; }
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
    if(perm2 < (MEZE_DRUHU[g]||0)) continue;   // pod mezerou v rozdělení = nejspíš podíl
    (buckets[g]=buckets[g]||[]).push(perm2);
  }
  const out={};
  for(const g of Object.keys(buckets)){
    const v=buckets[g];
    if(v.length>=MIN_PRICE) out[g]={ n:v.length, med:Math.round(median(v)), lo:Math.round(pctl(v,0.25)), hi:Math.round(pctl(v,0.75)) };
  }
  return out;
}
spoctiMeze(all);                 // meze napřed, ať platí všude stejné

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
/* Mez „ceny se liší násobky" se bere z js/ceny.js, ne z vlastního čísla.
   Web už tenhle pojem má: u odhadu konkrétního pozemku hlásí „nejistý",
   když (p75 − p25) / medián přeleze MEZ_ROZPTYL. Kdyby si stránka s cenami
   držela vlastní hranici, mohla by u téhož druhu tvrdit něco jiného než
   odhad o dva kliky dál. */
const MEZ_ROZPTYL = CENY.MEZ_ROZPTYL || 2;

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
   kterou nemají. Skript se navíc nestahuje ani tady hned: js/cenova-mapa.js
   si ho vyžádá z <meta name="pk-leaflet"> teprve, až se mapa dostane na
   dohled (stejně jako stránka pozemku). */
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
    <button class="nav-toggle" aria-label="Otevřít menu" aria-expanded="false" aria-controls="nav"><span></span><span></span><span></span></button>
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
      <details class="nav-moje"><summary id="nav-moje-sum">Moje</summary><div class="nav-moje-panel"><a href="upozorneni.html" id="nav-upozorneni">Upozornění</a><a href="zpravy.html" id="nav-zpravy">Zprávy</a><a href="hlidani.html" id="nav-hlidani">Hlídání</a></div></details>
      <a href="kontakt.html">Kontakt</a>
      <a href="pridat.html" class="btn-primary nav-add">Přidat pozemek</a>
      <span class="nav-cta-note">Prodáváte pozemek? Přidejte ho zdarma a bez provize.</span>
    </nav>
  </div>
</header>
${crumbNav(crumbs)}`;
}
function footer(){
  return `
<footer>
  <div class="wrap foot-grid">
    <div class="foot-brand-col">
      <div class="foot-brand"><span class="logo-mark small" aria-hidden="true"></span><span>Parcelka</span></div>
      <p class="foot-tag">Mapa příležitostí u pozemků — srozumitelně a pro každého.</p>
    </div>
    <nav class="foot-col" aria-label="Produkt"><h5>Produkt</h5><a href="index.html#mapa">Pozemky</a><a href="pozemky-podle-okresu.html">Pozemky podle okresů</a><a href="porovnani.html">Porovnání uložených</a><a href="cena-pozemku.html">Ceny pozemků</a><a href="pridat.html">Přidat pozemek</a><a href="novinky.xml">Kanál nových pozemků</a><a href="data.html">Data ke stažení</a></nav>
    <nav class="foot-col" aria-label="Rádce"><h5>Rádce</h5><a href="drazby-pozemku.html">Koupě v dražbě</a><a href="kolik-stoji-koupe-pozemku.html">Náklady při koupi</a><a href="list-vlastnictvi-katastr.html">List vlastnictví</a><a href="pozemek-od-obce.html">Pozemek od obce</a><a href="kupni-smlouva-pozemek.html">Podklad pro smlouvu</a><a href="stavebni-vs-zemedelsky-pozemek.html">Stavební vs. zemědělský</a></nav>
    <nav class="foot-col" aria-label="Právní"><h5>Právní</h5><a href="moje-data.html">Moje data</a><a href="ochrana-udaju.html">Ochrana osobních údajů</a><a href="podminky.html">Podmínky použití</a><a href="pravidla-inzerce.html">Pravidla inzerce</a><a href="kontakt.html">Kontakt</a></nav>
  </div>
  <div class="wrap foot-bottom"><span class="mono">Tvořeno s péčí v Česku · data z veřejných zdrojů</span><span class="mono">© 2026 Parcelka</span></div>
</footer>

<div class="toast" id="toast" role="status" aria-live="polite" hidden></div>
<!-- MENU, NE FORMULÁŘ. Tady býval js/pridat.js, tedy 73,4 kB logiky
     k přidání pozemku — a to jen proto, že v něm byla obsluha mobilního
     menu. Na téhle stránce žádný takový formulář není. Modul js/menu.js
     má pod 2 kB a dělá to samé (a lépe: zavírá i Escapem a klepnutím
     mimo). Stránky okresů a krajů jsou nejčastější vstup z vyhledávače,
     takže těch 73 kB platil skoro každý návštěvník. -->
<script src="js/menu.js?${V.menu}" defer></script>
<!-- Upozornění v menu: nepřečtené zprávy a nové pozemky z hlídání. Musí
     být i tady: tyhle stránky se generují znovu při každém běhu datového
     robota, takže co není v šabloně, to příští běh smaže — a lidé
     z vyhledávání chodí nejčastěji právě na stránky okresů. -->
<script src="js/config.js?${V.config}" defer></script>
<script src="js/auth.js?${V.auth}" defer></script>
<script src="js/hlidani-logika.js?${V.hlidani}" defer></script>
<script src="js/upozorneni-feed.js?${V.feed}" defer></script>
<script src="js/upozorneni.js?${V.upoz}" defer></script>
<script src="js/graf-cen.js?${V.grafCen}" defer></script>
<script src="js/offline.js?${V.offline}" defer></script>
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
function itemRow(o, skryjOkres){
  const badge = `<span class="okr-badge t-${esc(o.type)}">${esc(TYPE_LABEL[o.type]||o.type)}</span>`;
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
  if(o.extra && o.extra!=='—' && !portal) bits.push(esc(T.zdrojText(o.extra)));
  /* Formulace musí zůstat opatrná: v popisech stojí „na hranici" stejně
     často jako „zavedeno", takže se tvrdí jen to, co inzerát uvádí. */
  if(o.site && o.site.length) bits.push('inzerát uvádí <b>'+esc(o.site.map(k=>VYB.nazev(k).toLowerCase()).join(', '))+'</b>');
  /* Podíl mění, CO se kupuje — bez něj vypadá cena za metr jako trhák. */
  if(o.podil) bits.push('<b>spoluvlastnický podíl'+(o.zlomek?' '+esc(o.zlomek):'')+'</b>');
  const oc = odznakCeny(o);
  if (oc) bits.push(oc);
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
  if (!o.url && o.type === 'sale' && /SPÚ|státní půd/i.test(o.extra || '')) {
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
  const items = list.slice(0,20).map((o,i)=>({"@type":"ListItem","position":i+1,"name":`${o.place} — ${TYPE_LABEL[o.type]||o.type}${o.area?', '+o.area+' m²':''}`}));
  const jsonld = {"@context":"https://schema.org","@type":"CollectionPage","name":`Pozemky v okrese ${okres}`,"inLanguage":"cs","description":`Nabídky pozemků v okrese ${okres} — prodeje, dražby a exekuce z veřejných zdrojů.`,"mainEntityOfPage":`https://www.parcelaka.cz/${file}`,"publisher":{"@type":"Organization","name":"Parcelka"},"mainEntity":{"@type":"ItemList","numberOfItems":count,"itemListElement":items}};
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
  const rows = list.map((o)=>itemRow(o, true)).join('\n');
  const mapName = (KRAJ_META[kraj]||{}).mapName || kraj;
  const krajLink = mapName ? `index.html?kraj=${encodeURIComponent(mapName)}#mapa` : 'index.html#mapa';
  const siblings = eligibleOkres.filter(x=>x!==okres && OKRES_KRAJ[x]===kraj).sort((a,b)=>byOkres[b].length-byOkres[a].length).slice(0,6);
  const sibLinks = siblings.map(x=>`<a href="${okresFile(x)}">Pozemky ${esc(x)} <span>${byOkres[x].length}</span></a>`).join('');
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
          <p class="rules-note" style="margin-top:0;">Seřazeno od nejnižší ceny. Data pocházejí z veřejných zdrojů (inzertní portály, evidence dražeb, státní pozemkový úřad) a mohou se v čase měnit — aktuální stav vždy ověřte u zdroje a v katastru nemovitostí.</p>
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
        — bez účtu a bez e-mailu.</p>

      <p class="okr-more" style="margin-top:22px;">Než koupíte, projděte si <a href="kolik-stoji-koupe-pozemku.html">náklady při koupi</a> a <a href="list-vlastnictvi-katastr.html">jak číst list vlastnictví</a>.</p>

    </div>
  </section>

</main>
` + footer();
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
  const rows = list.slice(0,12).map(itemRow).join('\n');

  const title = `Pozemky ${meta.disp} — prodej a dražby | Parcelka`;
  const desc = `Pozemky ${meta.loc} na jedné mapě — ${count} ${pluralPozemek(count)} z veřejných zdrojů: prodeje, dražby i exekuce.${minP?(' Ceny od '+fmt(minP)+' Kč.'):''}`;
  const jsonld = {"@context":"https://schema.org","@type":"CollectionPage","name":`Pozemky ${meta.disp}`,"inLanguage":"cs","description":`Nabídky pozemků ${meta.loc} — prodeje, dražby a exekuce z veřejných zdrojů.`,"mainEntityOfPage":`https://www.parcelaka.cz/${file}`,"publisher":{"@type":"Organization","name":"Parcelka"}};
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
          <p class="rules-note" style="margin-top:0;">Ukázka nejnižších cen napříč krajem. Data z veřejných zdrojů se mohou měnit — aktuální stav ověřte u zdroje a v katastru.</p>
${razitkoCerstvosti}
          <div class="okr-list">
${rows}
          </div>
        </div>
      </div>

      <p class="okr-more" style="margin-top:22px;">Nechcete se sem vracet a koukat?
        <a href="${kanalKraje(kraj)}">Nové pozemky ${CENY.kdeText('kraj', kraj)} odebírejte kanálem</a>
        — bez účtu a bez e-mailu.</p>

      <p class="okr-more" style="margin-top:22px;">Než koupíte, projděte si <a href="kolik-stoji-koupe-pozemku.html">náklady při koupi</a> nebo <a href="pozemky-podle-okresu.html">všechny kraje a okresy</a>.</p>

    </div>
  </section>

</main>
` + footer();
  write(file, html);
  krajPages.push({kraj,file,count});
}

// ---------- DRAŽBY (národní přehled) ----------
/* Celostátní přehled dražeb počítá z téže hromádky jako okresy — tedy
   bez těch, kterým termín už prošel. */
const drazby = aktualni.filter(o=>o.type==='drazba').sort((a,b)=>(a.price||1e15)-(b.price||1e15));
{
  const count = drazby.length;
  const priced = drazby.filter(o=>o.price>0).map(o=>o.price).sort((a,b)=>a-b);
  const minP=priced[0];
  const file='drazby-pozemku-nabidky.html';
  const rows = drazby.map(itemRow).join('\n');
  const title = `Dražby pozemků — aktuální nabídky v ČR | Parcelka`;
  const desc = `${count} ${sklon(count,'dražba pozemku','dražby pozemků','dražeb pozemků')} z celé ČR na jedné mapě, z veřejné evidence dražeb.${minP?(' Vyvolávací ceny od '+fmt(minP)+' Kč.'):''}`;
  const items = drazby.slice(0,20).map((o,i)=>({"@type":"ListItem","position":i+1,"name":`${o.place} — dražba${o.area?', '+o.area+' m²':''}`}));
  const jsonld = {"@context":"https://schema.org","@type":"CollectionPage","name":"Dražby pozemků v ČR","inLanguage":"cs","description":`Aktuální nabídky pozemků v dražbě z veřejné evidence dražeb.`,"mainEntityOfPage":`https://www.parcelaka.cz/${file}`,"publisher":{"@type":"Organization","name":"Parcelka"},"mainEntity":{"@type":"ItemList","numberOfItems":count,"itemListElement":items}};
  const crumbs = [
    {name:'Pozemky', href:'index.html', abs:SITE},
    {name:'Koupě v dražbě', href:'drazby-pozemku.html', abs:SITE+'drazby-pozemku.html'},
    {name:'Aktuální dražby', abs:SITE+file},
  ];
  const html = head(title,desc,file,jsonld,crumbs) + `
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
          <p class="rules-note" style="margin-top:0;">Seřazeno od nejnižší ceny. Údaje pocházejí z veřejné evidence dražeb a mohou se v čase měnit — konání, podmínky a aktuální stav vždy ověřte přímo v dražební vyhlášce a v katastru nemovitostí.</p>
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
const DRUH_STRANKY = [
  { skupina: 'Orná půda', soubor: 'pozemky-orna-puda.html',
    jm: ['pozemek s ornou půdou','pozemky s ornou půdou','pozemků s ornou půdou'], nom: 'orná půda',
    h1: 'Orná půda na prodej', mn: 'orné půdy', oznaceni: 'Orná půda',
    rada: 'Orná půda je <b>zemědělský půdní fond</b>. Postavit na ní něco znamená změnu územního plánu a <b>vynětí ze ZPF</b>, za které se platí odvod — bývá to zdlouhavé a není na to nárok. Bez toho je to pořád investice nebo pacht, ne stavební parcela.' },
  { skupina: 'Louka / travní porost', soubor: 'pozemky-louka.html',
    jm: ['louka','louky a travní porosty','louk a travních porostů'], nom: 'louky a travní porosty',
    h1: 'Louky a travní porosty na prodej', mn: 'louk', oznaceni: 'Louka / travní porost',
    rada: 'Trvalý travní porost je taky <b>zemědělský půdní fond</b> — ke stavbě je potřeba změna územního plánu a vynětí ze ZPF. U louk se navíc častěji stává, že na nich běží <b>pacht</b>; zjistěte si, jestli je pozemek pronajatý a na jak dlouho.' },
  { skupina: 'Stavební / zastavěná', soubor: 'pozemky-stavebni.html',
    jm: ['stavební pozemek','stavební pozemky','stavebních pozemků'], nom: 'stavební pozemky',
    h1: 'Stavební pozemky na prodej', mn: 'stavebních pozemků', oznaceni: 'Stavební / zastavěná',
    rada: 'Zápis v katastru není totéž co <b>územní plán</b>: ten teprve rozhoduje, co a jak velké se tu smí postavit. Ověřte si ho na stavebním úřadě obce — a k tomu, jestli jsou v dosahu <b>sítě a příjezd</b>. Ze zápisu se ani jedno nepozná.' },
  { skupina: 'Lesní pozemek', soubor: 'pozemky-lesni.html',
    jm: ['lesní pozemek','lesní pozemky','lesních pozemků'], nom: 'lesní pozemky',
    h1: 'Lesní pozemky na prodej', mn: 'lesních pozemků', oznaceni: 'Lesní pozemek',
    rada: 'Les je pod ochranou <b>lesního zákona</b>: výstavba je prakticky vyloučená a s lesem je spojená <b>povinnost hospodařit</b>. Rozdělení lesního pozemku pod jeden hektar navíc vyžaduje souhlas úřadu.' },
  { skupina: 'Zahrada', soubor: 'pozemky-zahrada.html',
    jm: ['zahrada','zahrady','zahrad'], nom: 'zahrady',
    h1: 'Zahrady na prodej', mn: 'zahrad', oznaceni: 'Zahrada',
    rada: 'Zahrada bývá v zastavěném území, ale <b>ne vždy je stavební</b> — ověřte si územní plán obce. U zahrad se taky častěji stává, že <b>nemají vlastní přístup z veřejné cesty</b>.' },
  { skupina: 'Vinice / sad', soubor: 'pozemky-vinice-sady.html',
    jm: ['vinice nebo sad','vinice a sady','vinic a sadů'], nom: 'vinice a sady',
    h1: 'Vinice a sady na prodej', mn: 'vinic a sadů', oznaceni: 'Vinice / sad',
    rada: 'Vinice i sad jsou <b>zemědělská kultura</b>: ke stavbě je potřeba změna využití a vynětí ze ZPF. U vinice se ptejte i na <b>stav výsadby a práva na produkci</b> — hodnota je ve keřích, ne jen v půdě.' },
];
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
  const rows = list.slice(0, STROP_RADKU).map((o) => itemRow(o, false)).join('\n');
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
  const items = list.slice(0, 20).map((o, i) => ({ "@type": "ListItem", position: i + 1,
    name: `${o.place} — ${TYPE_LABEL[o.type] || o.type}${o.area ? ', ' + o.area + ' m²' : ''}` }));
  const jsonld = { "@context": "https://schema.org", "@type": "CollectionPage", name: d.h1,
    inLanguage: "cs", description: desc, mainEntityOfPage: SITE + d.soubor,
    publisher: { "@type": "Organization", name: "Parcelka" },
    mainEntity: { "@type": "ItemList", numberOfItems: count, itemListElement: items } };
  const crumbs = [
    { name: 'Pozemky', href: 'index.html', abs: SITE },
    { name: 'Ceny pozemků', href: 'cena-pozemku.html', abs: SITE + 'cena-pozemku.html' },
    { name: d.h1, abs: SITE + d.soubor },
  ];
  const html = head(title, desc, d.soubor, jsonld, crumbs) + `
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
          <p class="rules-note" style="margin-top:0;">Seřazeno od nejnižší ceny${zbyva ? `, vypsáno prvních ${STROP_RADKU}` : ''}. Data pocházejí z veřejných zdrojů (inzertní portály, evidence dražeb, státní pozemkový úřad) a mohou se v čase měnit — aktuální stav vždy ověřte u zdroje a v katastru nemovitostí.</p>
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

      <p class="okr-more" style="margin-top:22px;">Než koupíte, projděte si <a href="kolik-stoji-koupe-pozemku.html">náklady při koupi</a> a <a href="list-vlastnictvi-katastr.html">jak číst list vlastnictví</a>.</p>

    </div>
  </section>

</main>
` + footer();
  write(d.soubor, html);
  druhStranky.push({ skupina: d.skupina, soubor: d.soubor, count, nazev: d.h1 });
}

// ---------- CENOVÝ PŘEHLED (unikátní: kolik stojí m² podle druhu a kraje) ----------
{
  const file='cena-pozemku.html';
  // Národní karty podle druhu (jen skupiny s dost vzorky).
  /* Seřazeno od nejlevnějšího druhu k nejdražšímu. Dřív to šlo v pořadí,
     v jakém jsou druhy vyjmenované v kódu (45, 35, 119, 2 771), takže se
     čísla nedala porovnat pohledem — oko musí jít po stupnici.

     A vlastní značkování místo .okr-stat: ty dlaždice jsou dělané na dvě
     krátká čísla vedle sebe (22 pozemků | 22 na prodej) a oddělují se
     svislou čárkou vlevo. Tady jsou popisky dlouhé, na telefonu se
     dlaždice zalomí pod sebe — a z té čárky se stane odsazení, takže to
     vypadalo, jako by lesy, zahrady a stavební parcely byly podpoložky
     zemědělské půdy. Tohle je seznam sourozenců, ať se tak i čte. */
  const NAZEV_DRUHU = { 'Stavební': 'Stavební pozemek' };
  const natGroups = DRUH_GROUPS.filter(g=>priceNational[g])
    .sort((a,b)=>priceNational[a].med - priceNational[b].med);
  /* ===== SPOLEČNÁ OSA PRO VŠECHNY DRUHY ================================
     Doteď to byl výpis čtyř čísel pod sebou, všechna stejně velká. Jenže
     les stojí 48 Kč/m² a stavební pozemek 2 904 — šedesátinásobek — a na
     stránce, která se jmenuje „Kolik stojí pozemek?", to byla ta úplně
     nejdůležitější informace, kterou nebylo vidět. Kdo čte čísla pod
     sebou, musí je v hlavě dělit; obrázek to řekne naráz.
     Každý druh proto dostane svůj pruh „obvykle od–do" na JEDNÉ ose, se
     značkou mediánu. Tím se zadarmo ukáže i druhá věc, kterou dřív musela
     říkat věta: u zahrad je pruh přes půl osy, u pole úzký — tedy že
     u zahrad medián skoro nic neznamená.
     OSA JE LOGARITMICKÁ, a je to u ní napsané. Na lineární by se první tři
     druhy slily do jedné čárky u levého okraje a obrázek by lhal o tom,
     co je vidět. Meze se berou na celé řády kolem skutečných dat, ne od
     stolu. */
  const vsechnyLo = natGroups.map((g) => priceNational[g].lo).filter((x) => x > 0);
  const vsechnyHi = natGroups.map((g) => priceNational[g].hi).filter((x) => x > 0);
  const osaMin = vsechnyLo.length ? Math.pow(10, Math.floor(Math.log10(Math.min(...vsechnyLo)))) : 10;
  const osaMax = vsechnyHi.length ? Math.pow(10, Math.ceil(Math.log10(Math.max(...vsechnyHi)))) : 10000;
  const osaRozsah = Math.log10(osaMax) - Math.log10(osaMin);
  const naOse = (v) => {
    if (!(v > 0) || !(osaRozsah > 0)) return 0;
    const t = (Math.log10(v) - Math.log10(osaMin)) / osaRozsah;
    return Math.max(0, Math.min(100, t * 100));
  };
  const osaZnacky = [];
  for (let d = Math.log10(osaMin); d <= Math.log10(osaMax) + 0.001; d++) {
    const v = Math.pow(10, Math.round(d));
    osaZnacky.push(`<span class="cen-osa-znacka" style="left:${naOse(v).toFixed(2)}%">${fmt(v)}</span>`);
  }

  const natCards = natGroups.map(g=>{
    const s=priceNational[g];
    /* Když se čtvrtiny rozestoupí o víc než násobek meze, není to „typická
       cena", ale průměr dvou různých trhů. U zahrad to dělá 45–825 Kč/m²,
       tedy osmnáctinásobek: zahrada na vsi a zahrada na kraji města nemají
       společného skoro nic. Číslo se nezahazuje — jen se u něj řekne, že
       je to hrubé vodítko, přesně jako u odhadu konkrétního pozemku. */
    const rozptyl = s.med ? (s.hi - s.lo) / s.med : 0;
    const siroke = rozptyl > MEZ_ROZPTYL;
    /* Z ceny na nabídky. Karta říká „zemědělská půda 62 Kč/m²" a do teď
       se z ní nedalo nikam kliknout — teď vede na přehled toho druhu,
       pokud takovou stránku máme. Zemědělská půda je souhrn (orná +
       louky), proto se u ní odkazuje na ornou půdu: je jí v ní víc. */
    const DRUH_NA_STRANKU = { 'Zemědělská půda': 'Orná půda', 'Lesní pozemek': 'Lesní pozemek',
      Zahrada: 'Zahrada', 'Stavební': 'Stavební / zastavěná' };
    const cil = druhStranky.filter((x) => x.skupina === DRUH_NA_STRANKU[g])[0];
    const nazevHtml = cil
      ? `<span class="cen-nazev"><a href="${cil.soubor}">${esc(NAZEV_DRUHU[g] || g)}</a></span>`
      : `<span class="cen-nazev">${esc(NAZEV_DRUHU[g] || g)}</span>`;
    /* Pruh je OZDOBA, ne informace navíc: tatáž čísla stojí slovy hned
       pod ním, takže se čtečce neříká dvakrát totéž. */
    const l = naOse(s.lo), r = naOse(s.hi), m = naOse(s.med);
    const pruh = (s.lo > 0 && s.hi > 0)
      ? `<span class="cen-pas" aria-hidden="true">`
        + `<i class="cen-rozsah" style="left:${l.toFixed(2)}%;width:${Math.max(0.8, r - l).toFixed(2)}%"></i>`
        + `<i class="cen-med" style="left:${m.toFixed(2)}%"></i></span>`
      : '';
    /* Název a cena na JEDNOM řádku, cena vpravo. Čtyři obří čísla pod
       sebou, každé na vlastním řádku, dělala z přehledu dlouhý seznam —
       a sloupec čísel zarovnaný vpravo se dá přejet okem shora dolů. */
    return `<li class="cen-druh${siroke ? ' cen-siroke' : ''}">`
      + nazevHtml
      + `<b>${fmt(s.med)} Kč/m²</b>`
      + pruh
      + `<span class="cen-detail">obvykle ${fmt(s.lo)}–${fmt(s.hi)} Kč/m² · z ${fmt(s.n)} nabídek`
      + (siroke ? ` · <span class="cen-varovani">liší se násobky, berte jako hrubé vodítko</span>` : '')
      + `</span></li>`;
  }).join('\n        ');

  // Kraje seřazené podle mediánu zemědělské půdy (nejvíc dat) – barevná „teplota".
  const key='Zemědělská půda';
  const rowsData = eligibleKraj
    .map(k=>({k, s:priceByKraj[k] && priceByKraj[k][key]}))
    .filter(x=>x.s)
    .sort((a,b)=>b.s.med-a.s.med);
  const meds = rowsData.map(x=>x.s.med);
  const minM=Math.min.apply(null,meds), maxM=Math.max.apply(null,meds);
  /* PODBARVENÍ ŘÁDKŮ: ZELENÁ ZE ZNAČKY, NE MODŘ.
     Bylo tu rgba(91,184,214), tedy tyrkys o odstínu 196° — jediná
     modrá plocha na zeleno-bílém webu, a ještě přes celý seznam krajů.
     Teď je to značková zelená, takže seznam patří ke stránce.

     JE TO KRYTÍ, NE JINÁ BARVA, a to schválně: v tmavém režimu
     prosvítá pozadí, takže jedna barva s měnícím se krytím funguje
     v obou režimech a nevznikne odstín, který by v jednom z nich
     zmizel. */
  function heat(v){
    const t = maxM>minM ? (v-minM)/(maxM-minM) : 0.5;
    return `background:rgba(44,113,80,${(0.06+t*0.20).toFixed(3)});`;
  }
  const krajRows = rowsData.map(x=>{
    const les = priceByKraj[x.k] && priceByKraj[x.k]['Lesní pozemek'];
    const disp = (KRAJ_META[x.k]||{}).disp || (x.k+' kraj');
    const link = hasKrajPage.has(x.k) ? krajFile(x.k) : ('index.html?kraj='+encodeURIComponent((KRAJ_META[x.k]||{}).mapName||x.k)+'#mapa');
    return `      <div class="okr-item" style="${heat(x.s.med)}">
        <a class="okr-place" href="${link}" style="text-decoration:none;">${esc(disp)}</a>
        <span class="okr-meta">Zemědělská půda <b>${fmt(x.s.med)} Kč/m²</b> · rozpětí ${fmt(x.s.lo)}–${fmt(x.s.hi)} · ${fmt(x.s.n)} nab.${les?` &nbsp;·&nbsp; les <b>${fmt(les.med)} Kč/m²</b> (${les.n})`:''}</span>
      </div>`;
  }).join('\n');

  // Tabulka po okresech (zemědělská půda, jen kde dost vzorků), seřazeno od nejdražšího.
  const okrData = Object.keys(priceByOkres)
    .map(ok=>({ok, s:priceByOkres[ok] && priceByOkres[ok][key]}))
    .filter(x=>x.s)
    .sort((a,b)=>b.s.med-a.s.med);
  const okrMeds = okrData.map(x=>x.s.med);
  const okMin = okrMeds.length?Math.min.apply(null,okrMeds):0, okMax = okrMeds.length?Math.max.apply(null,okrMeds):1;
  function heatOk(v){ const t = okMax>okMin ? (v-okMin)/(okMax-okMin) : 0.5; return `background:rgba(44,113,80,${(0.06+t*0.20).toFixed(3)});`; }
  /* CENOVÁ MAPA: stejná čísla jako tabulka, protože ze stejného okrData.
     Kdyby si mapa počítala vlastní medián, mohla by u téhož okresu
     ukázat jinou cenu než řádek o kus níž — a to už se na tomhle webu
     jednou stalo (mapa proti stránce pozemku, viz js/ceny.js). */
  const cenMapaData = {};
  for (const x of okrData) {
    cenMapaData[x.ok] = { med: x.s.med, lo: x.s.lo, hi: x.s.hi, n: x.s.n,
      odkaz: hasOkresPage.has(x.ok) ? okresFile(x.ok) : null };
  }
  const okresRows = okrData.map(x=>{
    const link = hasOkresPage.has(x.ok) ? okresFile(x.ok) : ('index.html?kraj='+encodeURIComponent((KRAJ_META[OKRES_KRAJ[x.ok]]||{}).mapName||'')+'#mapa');
    return `      <div class="okr-item" style="${heatOk(x.s.med)}">
        <a class="okr-place" href="${link}" style="text-decoration:none;">${esc(x.ok)}</a>
        <span class="okr-meta">Zemědělská půda <b>${fmt(x.s.med)} Kč/m²</b> · rozpětí ${fmt(x.s.lo)}–${fmt(x.s.hi)} · ${fmt(x.s.n)} nab.</span>
      </div>`;
  }).join('\n');

  // Výrazný souhrn: nejlevnější a nejdražší okresy (zemědělská půda).
  const cheapest = okrData.slice(-3).reverse();
  const dearest  = okrData.slice(0,3);
  const okrLink = ok => hasOkresPage.has(ok) ? okresFile(ok) : ('index.html?kraj='+encodeURIComponent((KRAJ_META[OKRES_KRAJ[ok]]||{}).mapName||'')+'#mapa');
  /* Oddělovač NESMÍ být samostatný prvek: kontejner zalamuje a tečka pak
     doputuje sama na konec řádku a visí tam bez ničeho. Přilepí se proto
     pevnou mezerou k položce před sebou (viz .okr-place::after v CSS). */
  const chips = list => list.map(x=>`<a class="okr-place" href="${okrLink(x.ok)}" style="text-decoration:none;">${esc(x.ok)} <b>${fmt(x.s.med)} Kč/m²</b></a>`).join('');
  const highlight = (cheapest.length && dearest.length) ? `
      <div class="okr-stats" style="gap:14px;">
        <!-- POPISKY NEJSOU KATEGORIE. Stály tu modře a červeně, jenže modrá
             na tomhle webu znamená „na prodej" a červená „exekuce" — ne
             „levné" a „drahé". Kdo ty barvy zná z mapy a z odznaků, čte
             tady něco jiného, než co je napsáno. Rozdíl mezi levným
             a drahým nesou čísla pod popiskem; popisek je návěští. -->
        <div class="okr-stat" style="min-width:0;flex:1 1 240px;"><span>Nejlevnější zemědělská půda</span><div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px 10px;font-size:14px;">${chips(cheapest)}</div></div>
        <div class="okr-stat" style="min-width:0;flex:1 1 240px;"><span>Nejdražší zemědělská půda</span><div style="margin-top:8px;display:flex;flex-wrap:wrap;gap:6px 10px;font-size:14px;">${chips(dearest)}</div></div>
      </div>` : '';

  const natZ = priceNational[key];
  const title = 'Ceny pozemků v ČR — kolik stojí m² půdy | Parcelka';
  const desc = `Kolik stojí metr čtvereční pozemku v Česku? Orientační medián cen z aktuálních nabídek podle druhu a kraje.${natZ?' Zemědělská půda medián '+fmt(natZ.med)+' Kč/m².':''}`;
  const jsonld = {"@context":"https://schema.org","@type":"CollectionPage","name":"Ceny pozemků v ČR","inLanguage":"cs","description":"Orientační medián cen pozemků (Kč/m²) podle druhu a kraje z aktuálních nabídek.","mainEntityOfPage":`https://www.parcelaka.cz/${file}`,"publisher":{"@type":"Organization","name":"Parcelka"}};
  const crumbs=[{name:'Pozemky',href:'index.html',abs:SITE},{name:'Ceny pozemků',abs:SITE+file}];

  const html = head(title,desc,file,jsonld,crumbs,undefined,undefined,undefined,true) + `
<main id="obsah">

  <section class="okr-hero">
    <div class="okr-band">
    <div class="wrap okr-wrap">
      <div class="eyebrow"><span class="live-dot"></span>Cenový přehled · celá ČR</div>
      <h1>Kolik stojí pozemek?</h1>
      <p class="sub">Jednoduchá odpověď na otázku, kterou si klade každý kupující: <b>kolik je metr čtvereční pozemku?</b> Spočítáme <b>orientační medián</b> z aktuálních nabídek na Parcelce — zvlášť pro pole, les i zahradu, protože cena za m² se u nich zásadně liší. Takový přehled zdarma nikde jinde nenajdete.</p>
    </div>
    </div>
  </section>

  <section class="section">
    <div class="wrap okr-wrap">

      <div class="add-card">
        <div class="rules-sect">
          <h2>Medián ceny podle druhu (celá ČR)</h2>
          ${natCards ? `<ul class="cen-druhy" style="--cen-kroku:${Math.max(1, Math.round(osaRozsah))}">
        ${natCards}
          </ul>
          <div class="cen-osa" aria-hidden="true">${osaZnacky.join('')}</div>
          <p class="cen-osa-pozn">Pruh je rozpětí obvyklých cen, čárka medián. Osa je <b>logaritmická</b> — každý krok desetinásobek.</p>` : '<p class="rules-note" style="margin:0;">Zatím není dost dat pro spolehlivý výpočet.</p>'}
          <!-- VYSVĚTLIVKY SE SBALILY. Byly to tři odstavce drobného textu
               hned pod přehledem, delší než samotná čísla — stránka pak
               působila jako poznámkový aparát s grafem nahoře. Nic z toho
               se nemaže: kdo se ptá „jak to počítáte", to rozbalí; kdo se
               ptá „kolik stojí pozemek", dostane odpověď a nemusí ji
               hledat nad hromadou podmínek. -->
          <details class="cen-metodika">
            <summary>Jak to počítáme</summary>
            <p class="rules-note">Jde o <b>medián nabídkových cen</b> (ne realizovaných prodejů) z pozemků, u kterých známe cenu i výměru. Počítáme <b>jen běžné nabídky k prodeji</b> — vyvolávací cena dražby je pod trhem z podstaty věci a do ceny „kolik stojí pozemek" nepatří; stejně to počítá i odhad u konkrétního pozemku, aby web neříkal na dvou místech dvě čísla. Rozpětí ukazuje typické ceny (25.–75. percentil, tj. bez krajních výkyvů). Skutečná cena závisí na kvalitě půdy (BPEJ), přístupu, sítích i lokalitě — berte to jako orientaci, ne odhad konkrétního pozemku.</p>
            <p class="rules-note">${ODFILTROVANO ? `Do výpočtu <b>nezapočítáváme ${ODFILTROVANO} ${ODFILTROVANO===1?'nabídku':(ODFILTROVANO<5?'nabídky':'nabídek')}</b>, u kterých cena za metr vychází hluboko pod trhem — bývají to <b>spoluvlastnické podíly</b> (v inzerátu je výměra celé parcely, ale prodává se jen zlomek) nebo špatně načtené ceny. Bez toho vycházel medián pole v některých okresech na 8 Kč/m², což není cena, za kterou se u nás pole prodává. Hranici nestanovujeme od stolu: hledá se mezera v samotném rozdělení cen, a kde žádná není (zahrady, stavební pozemky), nevyřazuje se nic.` : ''}</p>
          </details>
        </div>
      </div>
${highlight ? `
      <div class="add-card" style="margin-top:22px;">
        <div class="rules-sect">
          <h2>Kde je půda nejlevnější a nejdražší</h2>
${highlight}
        </div>
      </div>` : ''}

      <div class="add-card" style="margin-top:22px;">
        <div class="rules-sect">
          <h2>Zemědělská půda podle kraje</h2>
          <p class="rules-note" style="margin-top:0;">Seřazeno od nejdražšího kraje. Klepnutím otevřete nabídky v kraji. Sytější podbarvení = dražší.</p>
${razitkoCerstvosti}
          <div class="okr-list">
${krajRows || '      <p class="rules-note" style="margin:0;">Zatím není dost dat po krajích.</p>'}
          </div>
        </div>
      </div>
${okresRows ? `
      <div class="add-card" style="margin-top:22px;">
        <div class="rules-sect">
          <h2>Cenová mapa okresů</h2>
          <p class="rules-note" style="margin-top:0;">Zemědělská půda, tmavší = dražší. Okresy bez dostatku nabídek jsou šedé. Klepnutím otevřete okres. <b>Tytéž ceny jsou v seznamu pod mapou</b> — ten je čitelný i bez barev.</p>
          <div class="cen-mapa-obal">
            <div id="cen-mapa" role="img" aria-label="Mapa České republiky s okresy podbarvenými podle mediánu ceny zemědělské půdy. Tytéž údaje jsou v seznamu pod mapou."></div>
            <p class="rules-note cen-mapa-stav" id="cen-mapa-stav">Mapa se načte, až se k ní dorolujete.</p>
          </div>
          <ul class="cen-mapa-legenda" aria-hidden="true">
            <li><i style="background:rgba(44,113,80,0.12);"></i>nejlevnější</li>
            <li><i style="background:rgba(44,113,80,0.33);"></i></li>
            <li><i style="background:rgba(44,113,80,0.51);"></i></li>
            <li><i style="background:rgba(44,113,80,0.70);"></i></li>
            <li><i style="background:rgba(44,113,80,0.90);"></i>nejdražší</li>
            <li><i style="background:rgba(128,128,128,0.18);"></i>málo dat</li>
          </ul>
          <script type="application/json" id="cen-mapa-data">${JSON.stringify(cenMapaData).replace(/</g, '\\u003c')}</script>
        </div>
      </div>

      <div class="add-card" style="margin-top:22px;">
        <div class="rules-sect">
          <h2>Zemědělská půda podle okresu</h2>
          <p class="rules-note" style="margin-top:0;">Okresy s dostatkem nabídek, seřazeno od nejdražšího. Klepnutím otevřete okres.</p>
${razitkoCerstvosti}
          <div class="okr-list">
${okresRows}
          </div>
        </div>
      </div>` : ''}

      <div class="add-cross" style="margin-top:22px;">
        <div class="acx-copy">
          <h3>Najděte konkrétní pozemek</h3>
          <p>Otevřete mapu a porovnejte ceny přímo v místě, které vás zajímá — s prokliky do katastru.</p>
        </div>
        <a href="index.html#mapa" class="btn-primary btn-glow">Otevřít mapu →</a>
      </div>

      <p class="okr-more" style="margin-top:22px;">Souvisí: <a href="kolik-stoji-koupe-pozemku.html">náklady při koupi</a> · <a href="stavebni-vs-zemedelsky-pozemek.html">stavební vs. zemědělský pozemek</a> · <a href="pozemky-podle-okresu.html">pozemky podle regionu</a>.</p>

    </div>
  </section>

</main>
` + footer() + `<script src="js/cenova-mapa.js?${V.cenovaMapa}" defer></scr` + `ipt>
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
sm+='</urlset>\n';
write('sitemap.xml', sm);

console.log(`Vygenerováno: ${okresPages.length} okresních + ${krajPages.length} krajských + ${druhStranky.length} podle druhu + dražby (${drazby.length}) + rozcestník. Sitemap: ${staticUrls.length+krajPages.length+okresPages.length+druhStranky.length} URL.`);

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

  h = h.replace(/(<b id="hero-n-count">)[^<]*(<\/b>)/, `$1${fmt(celkem)}$2`);
  h = h.replace(/(<b id="hero-n-okres">)[^<]*(<\/b>)/, `$1${okresu}$2`);
  h = h.replace(/(<span class="kj-c mono" data-kraj=")([^"]+)(">)[^<]*(<\/span>)/g,
    (_, a, kraj, b, c) => {
      const n = pocetKraj[kraj] || 0;
      return a + kraj + b + (n ? `${fmt(n)} ${pluralPozemek(n)}` : 'zatím žádné') + c;
    });
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
