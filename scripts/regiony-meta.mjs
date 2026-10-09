/* JMÉNA A ADRESY REGIONÁLNÍCH STRÁNEK NA JEDNOM MÍSTĚ.
 *
 * Tabulka krajů a tabulka druhových stránek ležely uvnitř
 * scripts/generate-region-pages.mjs, protože je zprvu potřeboval jen
 * on. Jakmile měla na kraj a na druh odkazovat i stránka jednotlivého
 * pozemku (1 941 stránek), byly by to dvě kopie téhož — a tenhle
 * repozitář už má svou historii rozejitých kopií: okres → kraj ležel
 * třikrát, cenový verdikt dvakrát, a poznalo se to vždycky teprve tím,
 * že web o téže věci tvrdil dvě různé věci.
 *
 * Proto je to modul bez vlastní práce: nic nenačítá, nic nezapisuje,
 * jen vrací jména, pády a názvy souborů. Kdo potřebuje POČTY nabídek,
 * ten si je musí spočítat sám ze svých dat — tady schválně nejsou,
 * aby se nemohly rozejít s tím, co si stránka opravdu vypsala.
 */

/* Pořadí krajů, jak se ukazují v rozcestníku: od Prahy na východ,
   ne podle abecedy — tak jsou kraje zvyklí lidé i úřední seznamy. */
export const KRAJ_ORDER = ['Praha', 'Středočeský', 'Jihočeský', 'Plzeňský', 'Karlovarský',
  'Ústecký', 'Liberecký', 'Královéhradecký', 'Pardubický', 'Vysočina',
  'Jihomoravský', 'Olomoucký', 'Zlínský', 'Moravskoslezský'];

/* `disp` je jméno do odkazu, `loc` je šestý pád do věty. Dvě výjimky
   nejdou vyrobit pravidlem: Praha není „Praha kraj" a Vysočina je
   „Kraj Vysočina", ne „Vysočina kraj". Kdyby se jméno skládalo
   programem, obě by byla špatně. */
export const KRAJ_META = {
  'Praha':            { disp: 'Praha',                 loc: 'v Praze',                   mapName: 'Praha' },
  'Středočeský':      { disp: 'Středočeský kraj',      loc: 've Středočeském kraji',     mapName: 'Středočeský' },
  'Jihočeský':        { disp: 'Jihočeský kraj',        loc: 'v Jihočeském kraji',        mapName: 'Jihočeský' },
  'Plzeňský':         { disp: 'Plzeňský kraj',         loc: 'v Plzeňském kraji',         mapName: 'Plzeňský' },
  'Karlovarský':      { disp: 'Karlovarský kraj',      loc: 'v Karlovarském kraji',      mapName: 'Karlovarský' },
  'Ústecký':          { disp: 'Ústecký kraj',          loc: 'v Ústeckém kraji',          mapName: 'Ústecký' },
  'Liberecký':        { disp: 'Liberecký kraj',        loc: 'v Libereckém kraji',        mapName: 'Liberecký' },
  'Královéhradecký':  { disp: 'Královéhradecký kraj',  loc: 'v Královéhradeckém kraji',  mapName: 'Královéhradecký' },
  'Pardubický':       { disp: 'Pardubický kraj',       loc: 'v Pardubickém kraji',       mapName: 'Pardubický' },
  'Vysočina':         { disp: 'Kraj Vysočina',         loc: 'na Vysočině',               mapName: 'Vysočina' },
  'Jihomoravský':     { disp: 'Jihomoravský kraj',     loc: 'v Jihomoravském kraji',     mapName: 'Jihomoravský' },
  'Olomoucký':        { disp: 'Olomoucký kraj',        loc: 'v Olomouckém kraji',        mapName: 'Olomoucký' },
  'Zlínský':          { disp: 'Zlínský kraj',          loc: 've Zlínském kraji',         mapName: 'Zlínský' },
  'Moravskoslezský':  { disp: 'Moravskoslezský kraj',  loc: 'v Moravskoslezském kraji',  mapName: 'Moravskoslezský' },
};

/* Druhové stránky. `skupina` je TOTÉŽ rozřazení, jaké používá mapa
   i cenový model (js/ceny.js, druhGroup) — proto tu nejsou vlastní
   vzorky na druh a proto odkaz „otevřít na mapě" ukáže přesně to, co je
   na stránce vypsané.
   `og` je náhled pro sdílení (assets/og, vyrábí scripts/build-og.mjs).
   Bez něj padaly všechny druhové stránky na společný obrázek webu,
   takže odkaz na „les na prodej" vypadal ve zprávě jako odkaz na
   úvodní stránku. */
export const DRUH_STRANKY = [
  { skupina: 'Orná půda', soubor: 'pozemky-orna-puda.html', og: 'druh-orna-puda.png',
    jm: ['pozemek s ornou půdou','pozemky s ornou půdou','pozemků s ornou půdou'], nom: 'orná půda',
    h1: 'Orná půda na prodej', mn: 'orné půdy', oznaceni: 'Orná půda',
    rada: 'Orná půda je <b>zemědělský půdní fond</b>. Postavit na ní něco znamená změnu územního plánu a <b>vynětí ze ZPF</b>, za které se platí odvod — bývá to zdlouhavé a není na to nárok. Bez toho je to pořád investice nebo pacht, ne stavební parcela.' },
  { skupina: 'Louka / travní porost', soubor: 'pozemky-louka.html', og: 'druh-louka.png',
    jm: ['louka','louky a travní porosty','louk a travních porostů'], nom: 'louky a travní porosty',
    h1: 'Louky a travní porosty na prodej', mn: 'louk', oznaceni: 'Louka / travní porost',
    rada: 'Trvalý travní porost je taky <b>zemědělský půdní fond</b> — ke stavbě je potřeba změna územního plánu a vynětí ze ZPF. U louk se navíc častěji stává, že na nich běží <b>pacht</b>; zjistěte si, jestli je pozemek pronajatý a na jak dlouho.' },
  { skupina: 'Stavební / zastavěná', soubor: 'pozemky-stavebni.html', og: 'druh-stavebni.png',
    jm: ['stavební pozemek','stavební pozemky','stavebních pozemků'], nom: 'stavební pozemky',
    h1: 'Stavební pozemky na prodej', mn: 'stavebních pozemků', oznaceni: 'Stavební / zastavěná',
    rada: 'Zápis v katastru není totéž co <b>územní plán</b>: ten teprve rozhoduje, co a jak velké se tu smí postavit. Ověřte si ho na stavebním úřadě obce — a k tomu, jestli jsou v dosahu <b>sítě a příjezd</b>. Ze zápisu se ani jedno nepozná.' },
  { skupina: 'Lesní pozemek', soubor: 'pozemky-lesni.html', og: 'druh-lesni.png',
    jm: ['lesní pozemek','lesní pozemky','lesních pozemků'], nom: 'lesní pozemky',
    h1: 'Lesní pozemky na prodej', mn: 'lesních pozemků', oznaceni: 'Lesní pozemek',
    rada: 'Les je pod ochranou <b>lesního zákona</b>: výstavba je prakticky vyloučená a s lesem je spojená <b>povinnost hospodařit</b>. Rozdělení lesního pozemku pod jeden hektar navíc vyžaduje souhlas úřadu.' },
  { skupina: 'Zahrada', soubor: 'pozemky-zahrada.html', og: 'druh-zahrada.png',
    jm: ['zahrada','zahrady','zahrad'], nom: 'zahrady',
    h1: 'Zahrady na prodej', mn: 'zahrad', oznaceni: 'Zahrada',
    rada: 'Zahrada bývá v zastavěném území, ale <b>ne vždy je stavební</b> — ověřte si územní plán obce. U zahrad se taky častěji stává, že <b>nemají vlastní přístup z veřejné cesty</b>.' },
  { skupina: 'Vinice / sad', soubor: 'pozemky-vinice-sady.html', og: 'druh-vinice-sady.png',
    jm: ['vinice nebo sad','vinice a sady','vinic a sadů'], nom: 'vinice a sady',
    h1: 'Vinice a sady na prodej', mn: 'vinic a sadů', oznaceni: 'Vinice / sad',
    rada: 'Vinice i sad jsou <b>zemědělská kultura</b>: ke stavbě je potřeba změna využití a vynětí ze ZPF. U vinice se ptejte i na <b>stav výsadby a práva na produkci</b> — hodnota je ve keřích, ne jen v půdě.' },
];

/* Rozpočtové stránky. `strop` je horní hranice ceny, `kratce` jde do
   odkazu („do 500 tisíc"), `popis` do věty („500 000 Kč"). Pořadí je od
   nejmenšího stropu — podle toho se hledá první rozpočet, do kterého se
   konkrétní pozemek vejde. */
export const ROZPOCTY = [
  { strop:  200000, og: 'rozpocet-200-tisic.png', soubor: 'pozemky-do-200-tisic.html',  popis: '200 000 Kč', kratce: '200 tisíc' },
  { strop:  500000, og: 'rozpocet-500-tisic.png', soubor: 'pozemky-do-500-tisic.html',  popis: '500 000 Kč', kratce: '500 tisíc' },
  { strop: 1000000, og: 'rozpocet-1-milion.png', soubor: 'pozemky-do-1-milionu.html',  popis: '1 000 000 Kč', kratce: 'milion' },
  { strop: 2000000, og: 'rozpocet-2-miliony.png', soubor: 'pozemky-do-2-milionu.html',  popis: '2 000 000 Kč', kratce: 'dva miliony' },
];

/* Diakritiku dolů, zbytek na spojovníky — stejné pravidlo, jakým se
   jmenují už vyrobené soubory na webu. */
export function slug(s) {
  const map = { 'á':'a','č':'c','ď':'d','é':'e','ě':'e','í':'i','ň':'n','ó':'o','ř':'r','š':'s','ť':'t','ú':'u','ů':'u','ý':'y','ž':'z' };
  return String(s).toLowerCase().replace(/[áčďéěíňóřšťúůýž]/g, (c) => map[c] || c)
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

export function krajFile(kraj) { return `pozemky-${slug(kraj)}-kraj.html`; }
export function okresFile(okres) { return `pozemky-okres-${slug(okres)}.html`; }

/* Název souboru druhové stránky pro skupinu z druhGroup. Vrací prázdno
   u skupiny, která vlastní stránku nemá (typicky „Ostatní"). */
export function druhFile(skupina) {
  const d = DRUH_STRANKY.find((x) => x.skupina === skupina);
  return d ? d.soubor : '';
}
