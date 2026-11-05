// Test: sonda zdrojů měří, co smí, a nic neobchází.
//
// Spuštění: node scripts/test-sonda-zdroju.mjs   (bez prohlížeče, bez sítě)
//
// Sonda (scripts/sonda-zdroju.mjs) existuje proto, aby web přestal
// stát na jednom zdroji: vede seznam kandidátů, pravidelně měří, co
// z nich jde číst, a nález zapisuje do data/zdroje-sonda.json. Jsou
// u toho dvě věci, které se nesmí pokazit, a obě se tu hlídají:
//
//   1) POŘADÍ. Nejdřív robots.txt, teprve pak stránka. Když robots.txt
//      zakazuje nebo se nepodaří přečíst, stránka se nestahuje VŮBEC.
//      Opačné pořadí by znamenalo, že se zákaz přečte až po tom, co
//      jsme ho porušili.
//   2) ŽÁDNÉ OBCHÁZENÍ. Jedno jméno robota (scripts/bot-ua.mjs), žádné
//      střídání hlaviček, žádné předstírání prohlížeče. Je to slib,
//      který je snadné tiše zrušit jedním řádkem — proto se měří.
//
// Síť se tu nepoužívá: stahování se podstrčí (`stahni` je parametr),
// takže zkouška je rychlá a dá se pustit i tam, kde se na internet
// nedá (odkud se tohle psalo, se na cizí weby nedostane vůbec).
import { readFileSync } from 'node:fs';

let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
const U = (p) => new URL('../' + p, import.meta.url);
const R = await import('./robots.mjs');
const S = await import('./sonda-zdroju.mjs');
const K = await import('./zdroje-kandidati.mjs');
const F = await import('./fetch-opportunities.mjs');
const UA = (await import('./bot-ua.mjs')).BOT_UA;

/* ---- 1) ROBOTS.TXT SE ČTE PODLE PRAVIDEL ------------------------- */
{
  const t = [
    '# komentář se přeskočí',
    'User-agent: *',
    'Disallow: /admin',
    'Allow: /admin/verejne',
    'Crawl-delay: 3',
    '',
    'User-agent: ParcelkaBot',
    'Disallow: /tajne/',
    '',
    'User-agent: Jinybot',
    'Disallow: /',
  ].join('\n');
  pravda('platí skupina pro naše jméno, ne ta pro `*`',
    R.jeDovoleno(t, '/admin/cokoli', UA).dovoleno === true
    && R.jeDovoleno(t, '/admin/cokoli', 'Googlebot/2.1').dovoleno === false);
  pravda('a zákaz v naší skupině platí',
    R.jeDovoleno(t, '/tajne/x', UA).dovoleno === false);
  pravda('cizí skupina nás neomezuje',
    R.jeDovoleno(t, '/cokoli', UA).dovoleno === true);
  pravda('delší Allow přebije kratší Disallow',
    R.jeDovoleno(t, '/admin/verejne/a', 'Googlebot/2.1').dovoleno === true);
  pravda('crawl-delay se přečte', R.jeDovoleno(t, '/x', 'Googlebot/2.1').delay === 3);
  pravda('„Disallow:" bez hodnoty nezakazuje nic',
    R.jeDovoleno('User-agent: *\nDisallow:', '/cokoli', UA).dovoleno === true);
  pravda('hvězdička i konec řádku se v cestě ctí',
    R.jeDovoleno('User-agent: *\nDisallow: /*.pdf$', '/a/b/c.pdf', UA).dovoleno === false
    && R.jeDovoleno('User-agent: *\nDisallow: /*.pdf$', '/a/b/c.pdf?x=1', UA).dovoleno === true);
  pravda('prázdný robots.txt dovoluje vše',
    R.jeDovoleno('', '/cokoli', UA).dovoleno === true);
  /* Shoda jména je na podřetězec, ne na celý řádek: weby píšou
     „ParcelkaBot" i „parcelkabot/1.0". */
  pravda('jméno robota se pozná bez verze', R.jmenoRobota(UA) === 'parcelkabot');
}

/* ---- 2) CO SE NEDÁ PŘEČÍST, TO SE NEBERE ------------------------- */
{
  const odp = (status, text) => ({ ok: status < 400, status, text });
  let dotazu = 0;
  const stahni = async (u) => { dotazu++; return /robots\.txt$/.test(u) ? odp(500, '') : odp(200, 'x'); };
  const v = await R.smimeCist('https://priklad.test/a', { stahni, ua: UA, mezipamet: new Map() });
  pravda('nedostupný robots.txt (5xx) znamená NEČÍST',
    v.dovoleno === false && /500/.test(v.duvod), JSON.stringify(v));
  const stahniPad = async () => { throw new Error('síť spadla'); };
  const v2 = await R.smimeCist('https://priklad.test/a', { stahni: stahniPad, ua: UA, mezipamet: new Map() });
  pravda('a chyba sítě taky', v2.dovoleno === false, JSON.stringify(v2));
  const stahni404 = async (u) => (/robots\.txt$/.test(u) ? odp(404, '') : odp(200, 'x'));
  const v3 = await R.smimeCist('https://priklad.test/a', { stahni: stahni404, ua: UA, mezipamet: new Map() });
  pravda('chybějící robots.txt (404) čtení dovoluje — web to říká výslovně',
    v3.dovoleno === true, JSON.stringify(v3));
  /* Mezipaměť: na jeden web jeden dotaz na robots.txt, i když se ptáme
     na pět adres. Bez ní by sonda zdroj zbytečně zatěžovala. */
  let kolikRobots = 0;
  const mp = new Map();
  const pocitej = async (u) => { if (/robots\.txt$/.test(u)) kolikRobots++; return odp(200, 'User-agent: *\nDisallow:'); };
  for (const c of ['/a', '/b', '/c']) await R.smimeCist('https://jeden.test' + c, { stahni: pocitej, ua: UA, mezipamet: mp });
  pravda('robots.txt se na jeden web stahuje jen jednou', kolikRobots === 1, `stažení: ${kolikRobots}`);
}

/* ---- 2b) A TEĎ NAOSTRO: OPRAVDOVÉ `stahni`, MÍSTNÍ SERVER --------- */
/* TOHLE JE ZKOUŠKA, KTERÁ MĚLA EXISTOVAT OD ZAČÁTKU. Všechno nad tímhle
   řádkem měří `smimeCist` s PODSTRČENÝM stahováním — a právě proto se
   nenašla vada, kterou pak ohlásil první běh sondy v Actions: robot
   předává opravdové `stahni`, které vrací odpověď `fetch` s tělem jako
   FUNKCÍ `text()`, zatímco podstrčení vracelo tělo jako hodnotu. Podmínka
   `typeof r.text === 'string'` tedy neplatila nikdy a každý web, který
   robots.txt má, se ohlásil jako „nesmíme číst" (12 ze 16 zdrojů
   2. 11. 2026). Síť se tu pořád nepoužívá: server stojí na 127.0.0.1,
   takže zkouška běží i tam, kde se na cizi weby nedostaneme. */
{
  const http = await import('node:http');
  const srv = http.createServer((req, res) => {
    if (req.url === '/robots.txt') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('User-agent: *\nDisallow: /tajne/\nAllow: /\nCrawl-delay: 2\n');
      return;
    }
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end('<a href="/x">pozemek</a> 900 m\u00b2 za 500 000 K\u010d');
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const port = srv.address().port;
  const base = `http://127.0.0.1:${port}`;
  try {
    const volne = await R.smimeCist(base + '/seznam', { stahni: F.stahni, ua: UA, mezipamet: new Map() });
    pravda('OPRAVDOVÉ `stahni`: povolená cesta vyjde jako povolená',
      volne.dovoleno === true && /Allow/.test(volne.duvod || ''), JSON.stringify(volne));
    pravda('a z těla robots.txt se přečte i Crawl-delay',
      volne.delay === 2, JSON.stringify(volne));
    const zakaz = await R.smimeCist(base + '/tajne/x', { stahni: F.stahni, ua: UA, mezipamet: new Map() });
    pravda('OPRAVDOVÉ `stahni`: zakázaná cesta vyjde jako zakázaná',
      zakaz.dovoleno === false && /Disallow/.test(zakaz.duvod || ''), JSON.stringify(zakaz));
    /* A rozdil mezi „nesmíme" a „nevíme": obojí končí nečtením, ale
       nález to nesmí plést — podle něj se rozhoduje, co zapojit. */
    /* Rozbitý robots.txt musí mít VLASTNÍ SERVER: `smimeCist` ho hledá
       vždy v kořeni webu (`origin + '/robots.txt'`), takže cesta jako
       „/rozbity/a" by si vzála ten zdravý. Na tomhle moje přvní podoba
       téhle zkoušky spadla — a spadla správně. */
    const srv500 = http.createServer((q, o) => { o.writeHead(500); o.end('chyba'); });
    await new Promise((r) => srv500.listen(0, '127.0.0.1', r));
    const base500 = `http://127.0.0.1:${srv500.address().port}`;
    const rozbity = await R.smimeCist(base500 + '/a',
      { stahni: (u) => F.stahni(u, { pokusy: 1 }), ua: UA, mezipamet: new Map() });
    srv500.close();
    pravda('robots.txt, který odpověděl 500, značí NEVÍME, ne zákaz',
      rozbity.dovoleno === false && rozbity.nejdePrecist === true, JSON.stringify(rozbity));
    pravda('a zákaz z pravidla NEVÍME není',
      zakaz.nejdePrecist !== true, JSON.stringify(zakaz));
    /* `telo()` je ta opravena část — měří se oba tvary přímo. */
    pravda('`telo()` přečte tělo jako funkci i jako hodnotu',
      (await R.telo({ text: async () => 'a' })) === 'a' && (await R.telo({ text: 'b' })) === 'b');
    /* A naostro i celá sonda: jeden zápis do nálezu bez jakéhokoli
       podstrčení, takže se měří i čtení stránky, ne jen robots.txt. */
    const z = await S.sondujZdroj(
      { jmeno: 'Místní', host: '127.0.0.1', url: base + '/seznam', typ: 'sale' },
      { stahni: F.stahni, ua: UA, mezipamet: new Map() });
    pravda('sonda naostro vyhodnotí místní zdroj jako dostupný',
      z.verdikt === 'dostupné' && z.robots === 'dovoluje' && z.odpoved === 200,
      JSON.stringify(z));
    pravda('a změří na něm výtěžnost',
      z.vyteznost && z.vyteznost.metru >= 1 && z.vyteznost.korun >= 1,
      JSON.stringify(z.vyteznost));
  } finally { srv.close(); }
}

/* ---- 2c) NÁLEZ, KTERÝ UKAZUJE NA NÁS, SE NEZAPÍŠE --------------- */
/* Pojistka z §337. První běh sondy v Actions ohlásil 12 ze 16 zdrojů
   jako zakázané a u VŠECH DVANÁCTI stál slovo od slova týž důvod.
   To není pravda o cizích webech, to je vada u nás — a tehdy se
   zapsala do nálezu jako pravda. */
{
  const nepovoleny = (d) => ({ robots: 'nedovoluje', robotsDuvod: d });
  const povoleny = () => ({ robots: 'dovoluje', robotsDuvod: 'web robots.txt nemá' });
  /* Přesný tvar toho skutečného nálezu: 12 × týž důvod, 4 × 404. */
  const jakoTehdy = [
    ...Array.from({ length: 12 }, () => nepovoleny('robots.txt odpověděl 200')),
    ...Array.from({ length: 4 }, povoleny),
  ];
  const v = S.vzorecNasiVady(jakoTehdy);
  pravda('nález z 2. 11. (12 × týž důvod) se pozná jako NAŠE vada',
    v.nasiVada === true && v.kolik === 12 && v.mez === 8, JSON.stringify(v));
  /* A naopak: skutečné zákazy mají každý svoje pravidlo. Takový nález
     projít MUSÍ, jinak by pojistka zavřela sondu nadobro. */
  const opravdoveZakazy = [
    nepovoleny('Disallow: /'), nepovoleny('Disallow: /hledat'), nepovoleny('Disallow: /*?'),
    ...Array.from({ length: 13 }, povoleny),
  ];
  pravda('nález s různými pravidly projde (pojistka nezavře sondu nadobro)',
    S.vzorecNasiVady(opravdoveZakazy).nasiVada === false,
    JSON.stringify(S.vzorecNasiVady(opravdoveZakazy)));
  /* Mez má dno na třech: u dvou měřených zdrojů by „polovina" byla
     jeden a pojistka by padala na každém nálezu. */
  pravda('u dvou zdrojů se stejným důvodem pojistka nepadá (dno meze je 3)',
    S.vzorecNasiVady([nepovoleny('Disallow: /'), nepovoleny('Disallow: /')]).nasiVada === false);
  pravda('u tří už ano',
    S.vzorecNasiVady([nepovoleny('x'), nepovoleny('x'), nepovoleny('x')]).nasiVada === true);
  /* A v kódu sondy se ta pojistka opravdu VOLÁ a ukončuje běh — jinak
     by to byla funkce, kterou nikdo nepoužívá. */
  const kod = readFileSync(U('scripts/sonda-zdroju.mjs'), 'utf8');
  /* HLEDÁ SE VOLÁNÍ, NE DEFINICE — na tom tahle kontrola nejdřív
     spadla: `indexOf('vzorecNasiVady(nalez)')` našel hlavičku funkce.
     A zápis se bere POSLEDNÍ, protože ten první je výpis seznamu cílů
     (`--jen-cile`), který nic neměří a pojistku nepotřebuje. */
  const i = kod.indexOf('= vzorecNasiVady(nalez)');
  const j = kod.lastIndexOf('writeFileSync(SONDA_OUT');
  pravda('sonda pojistku volá PŘED zápisem nálezu a běh ukončí',
    i > 0 && j > i && /process\.exit\(1\)/.test(kod.slice(i, j)),
    `volání na ${i}, zápis na ${j}`);
}

/* ---- 2d) PŘI ZÁKAZU SE ZAPÍŠE CELÝ robots.txt ------------------- */
/* Jednovětný souhrn („Disallow: /") stačí na rozhodnutí „nestáhnout",
   ale ne na rozhodnutí „odpojit zdroj, odkud bereme čtyři pětiny
   nabídek". Z tohohle stroje se na cizí weby nedostaneme, takže kdo
   bude rozhodovat, to musí mít v nálezu — jinak rozhoduje podle mého
   přečtení, ne podle toho, co ten web napsal. */
{
  const TEXT = 'User-agent: *\nDisallow: /\n# tohle je celý ten soubor\n';
  const stahni = async (u) => (/robots\.txt$/.test(u)
    ? { ok: true, status: 200, text: async () => TEXT }
    : { ok: true, status: 200, text: async () => 'pozemek' });
  const v = await R.smimeCist('https://zakaz.test/a', { stahni, ua: UA, mezipamet: new Map() });
  pravda('zakázaná adresa vrátí i celý text robots.txt',
    v.dovoleno === false && v.text === TEXT, JSON.stringify(v));
  const vOk = await R.smimeCist('https://ok.test/a', {
    stahni: async (u) => (/robots\.txt$/.test(u)
      ? { ok: true, status: 200, text: async () => 'User-agent: *\nAllow: /\n' }
      : { ok: true, status: 200, text: async () => 'pozemek' }),
    ua: UA, mezipamet: new Map() });
  pravda('u povolené adresy se text nepřipojuje (nález by zbytečně rostl)',
    vOk.dovoleno === true && vOk.text === undefined, JSON.stringify(vOk));
  /* Do nálezu jde jen u ZAPOJENÝCH zdrojů: tam se o odpojení rozhoduje. */
  const zZapojeny = await S.sondujZdroj(
    { jmeno: 'Zapojený', host: 'zakaz.test', url: 'https://zakaz.test/a', typ: 'sale', stav: 'zapojeno' },
    { stahni, ua: UA, mezipamet: new Map() });
  pravda('u zapojeného zdroje je text robots.txt v nálezu',
    zZapojeny.robotsText === TEXT, JSON.stringify(zZapojeny.robotsText));
  const zKandidat = await S.sondujZdroj(
    { jmeno: 'Kandidát', host: 'zakaz.test', url: 'https://zakaz.test/a', typ: 'sale', stav: 'kandidát' },
    { stahni, ua: UA, mezipamet: new Map() });
  pravda('u kandidáta ne — tam zákaz znamená prostě „tím se nezabýváme"',
    zKandidat.robotsText === undefined && zKandidat.verdikt === 'zakázané',
    JSON.stringify(zKandidat));
  /* A strop, ať nález nenaroste o celé robots.txt deseti webů. */
  const dlouhy = 'User-agent: *\nDisallow: /\n' + 'x'.repeat(5000);
  const vD = await R.smimeCist('https://dlouhy.test/a', {
    stahni: async (u) => ({ ok: true, status: 200, text: async () => (/robots\.txt$/.test(u) ? dlouhy : 'x') }),
    ua: UA, mezipamet: new Map() });
  pravda('text robots.txt má strop 2 000 znaků',
    vD.text && vD.text.length === 2000, String(vD.text && vD.text.length));
}

/* ---- 2e) SONDA NAJDE VÝPIS, KDYŽ NA ZADANÉ ADRESE NIC NENÍ ------ */
/* PRVNÍ NÁLEZ SONDY OHLÁSIL u ÚZSVM, eDesky a Lesů ČR „obsah slabé" —
   jenže se ptala na ÚVODNÍ STRÁNKU. Na úvodní stránce výpis pozemků
   není ani u webu, který jich má tisíce, takže ten verdikt neříkal nic
   o zdroji, jen o tom, kam jsme se podívali. Hledání zdrojů, které se
   dívá na špatnou adresu, nehledá nic. */
{
  const UVOD = '<html><body><h1>Vítejte</h1>'
    + '<a href="/o-nas">O nás</a>'
    + '<a href="/nabidka-majetku">Nabídka majetku</a>'
    + '<a href="/kontakt">Kontakt</a>'
    + '<a href="https://jinde.test/nabidka">Nabídka na cizím webu</a>'
    + '</body></html>';
  const VYPIS = '<html><body>'
    + '<a href="/detail/1">Pozemek Lhota</a> 1 200 m² za 900 000 Kč '
    + '<a href="/detail/2">Pozemek Dolní</a> 2 400 m² za 1 500 000 Kč '
    + '<a href="/detail/3">Parcela Horní</a> 800 m² za 600 000 Kč'
    + '</body></html>';
  const o = S.odkazyNaVypis(UVOD, 'https://u.test/');
  pravda('odkaz na výpis se pozná z nápisu i z adresy',
    o.length === 1 && /nabidka-majetku/.test(o[0].url), JSON.stringify(o));
  pravda('cizí web se nebere — odvedl by nás jinam',
    !o.some((x) => /jinde\.test/.test(x.url)), JSON.stringify(o));

  const volane = [];
  const stahni = async (u) => {
    volane.push(u);
    if (/robots\.txt$/.test(u)) return { ok: true, status: 200, text: async () => 'User-agent: *\nAllow: /' };
    if (/nabidka-majetku/.test(u)) return { ok: true, status: 200, text: async () => VYPIS };
    return { ok: true, status: 200, text: async () => UVOD };
  };
  const z = await S.sondujZdroj({ jmeno: 'Úřad', host: 'u.test', url: 'https://u.test/', typ: 'sale' },
    { stahni, ua: UA, mezipamet: new Map() });
  pravda('sonda si najde výpis a verdikt je podle NĚHO, ne podle úvodní stránky',
    z.slibuje === 'slibné' && z.lepsiAdresa && /nabidka-majetku/.test(z.lepsiAdresa.url),
    JSON.stringify({ slibuje: z.slibuje, lepsi: z.lepsiAdresa }));
  pravda('a ta adresa je v nálezu — bez ní by se nevědělo, odkud verdikt je',
    z.lepsiAdresa && z.lepsiAdresa.popis === 'Nabídka majetku', JSON.stringify(z.lepsiAdresa));
  pravda('robots.txt se čte i u té další adresy',
    volane.filter((u) => /robots\.txt$/.test(u)).length >= 1, JSON.stringify(volane));

  /* ---- POŘADÍ ODKAZŮ PODLE SKÓRE, NE PODLE DOKUMENTU ----------- */
  /* NALEZENO MĚŘENÍM naostro: u Lesů ČR si sonda vybrala
     `/o-nas/prodej-drivi-verejnosti/` — prodej DŘÍVÍ. Slovo „prodej"
     samo o pozemku nic neříká a tři povolené dotazy se utratily na
     něco, co nás nezajímá, zatímco „Nabídka pozemků" stála na stránce
     až za tím. */
  {
    const html = '<a href="/o-nas/prodej-drivi-verejnosti/">Prodej dříví veřejnosti</a>'
      + '<a href="/nabidka-nemovitosti/pozemky">Nabídka pozemků</a>'
      + '<a href="/prodej-majetku">Prodej majetku</a>';
    const o = S.odkazyNaVypis(html, 'https://l.test/');
    pravda('nejvýš stojí odkaz, který mluví o POZEMCÍCH',
      /pozemky$/.test(o[0].url), JSON.stringify(o.map((x) => [x.skore, x.url])));
    pravda('a prodej dříví je až poslední — není to pozemek',
      /drivi/.test(o[o.length - 1].url), JSON.stringify(o.map((x) => [x.skore, x.url])));
    pravda('skóre: pozemek víc než majetek, majetek víc než holý prodej',
      S.skorOdkazu('/pozemky', '') > S.skorOdkazu('/majetek', '')
      && S.skorOdkazu('/majetek', '') > S.skorOdkazu('/prodej', ''));
    pravda('a jiné zboží jde do minusu',
      S.skorOdkazu('/prodej-driví', 'Prodej dříví') < 0
      && S.skorOdkazu('/prodej-sazenic', '') < 0);
    /* Řazení musí být STABILNÍ, ať je nález každý týden stejný a dá se
       srovnávat. Dva odkazy se stejným skóre si pořadí nemění. */
    const stejne = '<a href="/nabidka-a">Nabídka A</a><a href="/nabidka-b">Nabídka B</a>';
    const s1 = S.odkazyNaVypis(stejne, 'https://l.test/').map((x) => x.url).join();
    const s2 = S.odkazyNaVypis(stejne, 'https://l.test/').map((x) => x.url).join();
    pravda('řazení je stabilní (dvakrát totéž pořadí)', s1 === s2 && /nabidka-a.*nabidka-b/.test(s1), s1);
  }

  /* KDO UŽ VÝPIS MÁ, SE ZNOVU NESTAHUJE. Jinak bychom cizí web
     zatěžovali kvůli ničemu. */
  const volane2 = [];
  const stahni2 = async (u) => {
    volane2.push(u);
    if (/robots\.txt$/.test(u)) return { ok: true, status: 200, text: async () => 'User-agent: *\nAllow: /' };
    return { ok: true, status: 200, text: async () => VYPIS };
  };
  const z2 = await S.sondujZdroj({ jmeno: 'Hned výpis', host: 'v.test', url: 'https://v.test/vypis', typ: 'sale' },
    { stahni: stahni2, ua: UA, mezipamet: new Map() });
  pravda('zdroj, který je slibný hned, se dál neprochází',
    z2.slibuje === 'slibné' && !z2.lepsiAdresa && z2.zkusenoDalsich === undefined,
    JSON.stringify({ slibuje: z2.slibuje, zkuseno: z2.zkusenoDalsich }));

  /* A ZÁKAZ PLATÍ I NA TU DALŠÍ ADRESU. */
  /* MĚŘÍ SE, ŽE SE TA ADRESA VŮBEC NEVYŽÁDALA — ne že se nepovedla.
     Napoprvé tu stálo jen `!z3.lepsiAdresa` a podstrčení na zakázané
     adrese vyhodilo chybu: sabotáž, která kontrolu robots.txt ÚPLNĚ
     ODSTRANILA, prošla zeleně, protože výsledek vypadal stejně.
     Zkouška, která nerozliší „nestáhlo se" od „stáhlo a spadlo",
     tu nejdůležitější věc nehlídá. */
  const volane3 = [];
  const stahni3 = async (u) => {
    volane3.push(u);
    if (/v\.test\/robots\.txt$/.test(u)) return { ok: true, status: 200, text: async () => 'User-agent: *\nAllow: /' };
    if (/robots\.txt$/.test(u)) return { ok: true, status: 200, text: async () => 'User-agent: *\nDisallow: /nabidka' };
    if (/nabidka-majetku/.test(u)) return { ok: true, status: 200, text: async () => VYPIS };
    return { ok: true, status: 200, text: async () => UVOD };
  };
  const z3 = await S.sondujZdroj({ jmeno: 'Zakazuje výpis', host: 'u.test', url: 'https://u.test/', typ: 'sale' },
    { stahni: stahni3, ua: UA, mezipamet: new Map() });
  pravda('zakázaná další adresa se VŮBEC NEVYŽÁDÁ',
    !volane3.some((u) => /nabidka-majetku/.test(u)), JSON.stringify(volane3));
  pravda('a verdikt zůstane z té první adresy',
    !z3.lepsiAdresa && z3.slibuje !== 'slibné', JSON.stringify({ lepsi: z3.lepsiAdresa, slibuje: z3.slibuje }));

  /* Strop: nejvýš DALSICH_ADRES adres, ať se nestahuje půl webu. */
  const hodne = Array.from({ length: 20 }, (_, i) => `<a href="/nabidka-${i}">Nabídka ${i}</a>`).join('');
  pravda('najde se nejvýš DALSICH_ADRES dalších adres',
    S.odkazyNaVypis(hodne, 'https://u.test/').slice(0, S.DALSICH_ADRES).length === S.DALSICH_ADRES
    && S.DALSICH_ADRES <= 5);
  /* A lepší se pozná podle verdiktu, ne podle velikosti stránky —
     jinak by vyhrál web s velkou patičkou. */
  const slabe = { slovoPozemek: 1, korun: 1, metru: 0, odkazu: 0, bajtu: 900000 };
  const slibne = { slovoPozemek: 9, korun: 9, metru: 9, odkazu: 9, bajtu: 1000 };
  pravda('lepší je slibnější stránka, ne větší',
    S.lepsiVyteznost(slabe, slibne) === slibne && S.lepsiVyteznost(slibne, slabe) === slibne);
}

/* ---- 2f) SKOŘÁPKA: STROJOVÁ CESTA PŘES SITEMAP A RSS ----------- */
/* MĚŘENO 3. 11.: ÚZSVM vrátil 86 880 bajtů HTML, ve kterých nebylo ani
   jedno slovo „pozemek" a dvakrát „Kč". To není slabý obsah — to je
   skořápka, do které obsah dotahuje až prohlížeč. Verdikt „slabé" by
   tvrdil, že jsme ten zdroj změřili a nic tam není; pravda je, že jsme
   nezměřili nic. A pro takový zdroj je procházení odkazů slepé:
   na stránce žádné nejsou. Sitemapa a RSS ale strojově čitelné jsou. */
{
  pravda('velká stránka bez jediné zmínky pozemku je SKOŘÁPKA, ne „slabé"',
    S.slibuje({ bajtu: 86880, slovoPozemek: 0, korun: 2, metru: 0 }) === 'skořápka');
  pravda('malá stránka se za skořápku nevydává — tam se prostě nic nedovozuje',
    S.slibuje({ bajtu: 900, slovoPozemek: 0, korun: 0, metru: 0 }) === 'nic nenasvědčuje');
  pravda('a stránka, ze které jsme něco přečetli, zůstává „slabé"',
    S.slibuje({ bajtu: 80882, slovoPozemek: 4, korun: 0, metru: 0 }) === 'slabé');
  pravda('skořápka se v řazení bere jako MÍŇ než slabé (z té jsme přečetli aspoň něco)',
    S.lepsiVyteznost({ bajtu: 86880, slovoPozemek: 0, korun: 2 },
      { bajtu: 3000, slovoPozemek: 4, korun: 0 }).slovoPozemek === 4);

  const SITEMAP = '<?xml version="1.0"?><urlset>'
    + '<url><loc>https://u.test/o-nas</loc></url>'
    + '<url><loc>https://u.test/nabidka-majetku/pozemky</loc></url>'
    + '<url><loc>https://u.test/nabidka-majetku/pozemek-lhota-123</loc></url>'
    + '<url><loc>https://u.test/kontakt</loc></url>'
    + '</urlset>';
  const volane = [];
  const stahni = async (u) => {
    volane.push(u);
    if (/robots\.txt$/.test(u)) return { ok: true, status: 200, text: async () => 'User-agent: *\nAllow: /' };
    if (/sitemap\.xml$/.test(u)) return { ok: true, status: 200, text: async () => SITEMAP };
    if (/sitemap_index|rss|feed/.test(u)) return { ok: false, status: 404, text: async () => '' };
    /* Skořápka: velká stránka, žádné odkazy, žádná zmínka pozemku. */
    return { ok: true, status: 200, text: async () => '<div id="app"></div>' + 'x'.repeat(30000) };
  };
  const z = await S.sondujZdroj({ jmeno: 'Úřad', host: 'u.test', url: 'https://u.test/nabidka', typ: 'sale' },
    { stahni, ua: UA, mezipamet: new Map() });
  pravda('u skořápky sonda zkusí sitemapu a najde v ní adresy výpisu',
    z.slibuje === 'skořápka' && Array.isArray(z.strojoveAdresy)
    && z.strojoveAdresy.some((u) => /pozemky$/.test(u)),
    JSON.stringify({ slibuje: z.slibuje, adresy: z.strojoveAdresy }));
  pravda('a adresy, které s pozemkem nesouvisí, se neberou',
    !(z.strojoveAdresy || []).some((u) => /o-nas|kontakt/.test(u)), JSON.stringify(z.strojoveAdresy));
  pravda('do nálezu jde i to, co se zkusilo — ať je vidět, kde se hledalo',
    Array.isArray(z.strojoveZkusene) && z.strojoveZkusene.some((x) => /sitemap\.xml$/.test(x.url)),
    JSON.stringify(z.strojoveZkusene));
  pravda('robots.txt se čte i u sitemapy — není to výjimka',
    volane.filter((u) => /robots\.txt$/.test(u)).length >= 1, JSON.stringify(volane.slice(0, 4)));

  /* A ZDROJ, KTERÝ JE SLIBNÝ, SE STROJOVOU CESTOU NEOBTĚŽUJE. */
  const volane2 = [];
  const stahni2 = async (u) => {
    volane2.push(u);
    if (/robots\.txt$/.test(u)) return { ok: true, status: 200, text: async () => 'User-agent: *\nAllow: /' };
    return { ok: true, status: 200, text: async () =>
      '<a href="/d/1">Pozemek Lhota</a> 1 200 m² za 900 000 Kč <a href="/d/2">Pozemek Dolní</a> 2 400 m² za 1 500 000 Kč <a href="/d/3">Parcela</a> 800 m² za 600 000 Kč' };
  };
  const z2 = await S.sondujZdroj({ jmeno: 'Slibný', host: 'v.test', url: 'https://v.test/vypis', typ: 'sale' },
    { stahni: stahni2, ua: UA, mezipamet: new Map() });
  pravda('slibný zdroj se sitemapou nezatěžuje',
    z2.slibuje === 'slibné' && !z2.strojoveAdresy
    && !volane2.some((u) => /sitemap|rss|feed/.test(u)), JSON.stringify(volane2));

  /* A ZÁKAZ PLATÍ I NA SITEMAPU. */
  const volane3 = [];
  const stahni3 = async (u) => {
    volane3.push(u);
    if (/robots\.txt$/.test(u)) return { ok: true, status: 200, text: async () => 'User-agent: *\nDisallow: /sitemap' };
    if (/sitemap/.test(u)) return { ok: true, status: 200, text: async () => SITEMAP };
    return { ok: true, status: 200, text: async () => '<div id="app"></div>' + 'x'.repeat(30000) };
  };
  const z3 = await S.sondujZdroj({ jmeno: 'Zakazuje sitemapu', host: 'u.test', url: 'https://u.test/nabidka', typ: 'sale' },
    { stahni: stahni3, ua: UA, mezipamet: new Map() });
  pravda('zakázaná sitemapa se VŮBEC NEVYŽÁDÁ',
    !volane3.some((u) => /sitemap\.xml$/.test(u) && !/robots/.test(u)), JSON.stringify(volane3));
  pravda('a v nálezu stojí, že se číst nesmí',
    (z3.strojoveZkusene || []).some((x) => x.stav === 'nesmíme číst'),
    JSON.stringify(z3.strojoveZkusene));
}

/* ---- 3) ZAKÁZANOU STRÁNKU SONDA NESTÁHNE ------------------------- */
{
  const volane = [];
  /* PODSTRČENÍ MÁ TVAR, KTERÝ MÁ OPRAVDOVÉ `stahni`: tělo je FUNKCE
     `text()`, jako u `fetch`. Dřív tu stálo podstrčení, kde robots.txt
     vracel tělo jako HODNOTU `text`, a komentář u něj tvrdil, že se oba
     tvary používají schválně. Nepoužívaly — byla to vada v `smimeCist`
     a tahle zkouška se jí přizpůsobila místo toho, aby ji našla.
     Oba tvary se teď měří, a hlavně: blok 2b měří OPRAVDOVÉ `stahni`. */
  const stahni = async (u) => {
    volane.push(u);
    if (/robots\.txt$/.test(u)) return { ok: true, status: 200, text: async () => 'User-agent: *\nDisallow: /' };
    return { ok: true, status: 200, text: async () => 'pozemek pozemek pozemek 100 m² 500 Kč' };
  };
  const z = await S.sondujZdroj({ jmeno: 'Zakázaný', host: 'zakaz.test', url: 'https://zakaz.test/seznam', typ: 'sale' },
    { stahni, ua: UA, mezipamet: new Map() });
  pravda('zdroj, který zakazuje, skončí jako „zakázané"',
    z.verdikt === 'zakázané' && z.robots === 'nedovoluje', JSON.stringify(z));
  pravda('a jeho stránka se vůbec nestáhne',
    volane.length === 1 && /robots\.txt$/.test(volane[0]), JSON.stringify(volane));
  pravda('a v nálezu stojí, které pravidlo to zakázalo',
    /Disallow/.test(z.robotsDuvod || ''), z.robotsDuvod);
}

/* ---- 4) POVOLENÝ ZDROJ SE ZMĚŘÍ --------------------------------- */
{
  const stahni = async (u) => {
    if (/robots\.txt$/.test(u)) return { ok: true, status: 200, text: async () => 'User-agent: *\nAllow: /' };
    /* Vzorek vypadá jako výpis, ne jako jedna věta: mez pro „slibné"
       je schválně na třech nabídkách, aby ji neprošla úvodní stránka,
       kde slovo „pozemky" padne jednou v menu. */
    return { ok: true, status: 200,
      text: async () => ['<a href="/detail/1">Pozemek Lhota</a> 1 000 m² za 500 000 Kč',
        '<a href="/detail/2">Parcela Újezd</a> 2 400 m² za 1 200 000 Kč',
        '<a href="/detail/3">Pozemek Dolní Ves</a> 870 m² za 390 000 Kč'].join('\n') };
  };
  const z = await S.sondujZdroj({ jmeno: 'Dobrý', host: 'dobry.test', url: 'https://dobry.test/seznam', typ: 'sale' },
    { stahni, ua: UA, mezipamet: new Map() });
  pravda('dostupný zdroj se označí jako dostupný', z.verdikt === 'dostupné' && z.odpoved === 200,
    JSON.stringify(z));
  pravda('a nález nese, z čeho se soudí obsah (počty, ne jen slovo)',
    z.vyteznost && z.vyteznost.slovoPozemek >= 3 && z.vyteznost.korun >= 1 && z.slibuje === 'slibné',
    JSON.stringify(z.vyteznost) + ' → ' + z.slibuje);
  pravda('stránka bez pozemků se nevydává za slibnou',
    S.slibuje(S.vyteznost('<p>Vítejte na našem webu. Kontakt a úvodní slovo.</p>')) !== 'slibné');
}

/* ---- 5) SELHÁNÍ JE VÝSLEDEK, NE PÁD ------------------------------ */
{
  const stahni = async (u) => {
    if (/robots\.txt$/.test(u)) return { ok: true, status: 200, text: async () => 'User-agent: *\nAllow: /' };
    throw new Error('spojení odmítnuto');
  };
  const z = await S.sondujZdroj({ jmeno: 'Mrtvý', host: 'mrtvy.test', url: 'https://mrtvy.test/', typ: 'sale' },
    { stahni, ua: UA, mezipamet: new Map() });
  pravda('zdroj, který neodpoví, skončí jako „neodpovídá" a sonda běží dál',
    z.verdikt === 'neodpovídá' && /odmítnuto/.test(z.chyba || ''), JSON.stringify(z));
}

/* ---- 6) SEZNAM ZDROJŮ DRŽÍ TVAR --------------------------------- */
{
  const vse = [...K.ZAPOJENE, ...K.KANDIDATI];
  pravda(`seznam má zapojené i kandidáty (${K.ZAPOJENE.length} + ${K.KANDIDATI.length})`,
    K.ZAPOJENE.length >= 5 && K.KANDIDATI.length >= 3);
  pravda('každý záznam má jméno, hostitele, adresu, druh i důvod',
    vse.every((z) => z.jmeno && z.host && /^https:\/\//.test(z.url || '') && z.typ && z.proc && z.proc.length > 30),
    JSON.stringify(vse.find((z) => !(z.jmeno && z.host && z.url && z.typ && z.proc)) || {}));
  const hosty = vse.map((z) => z.host);
  pravda('žádný hostitel se v seznamu neopakuje', new Set(hosty).size === hosty.length,
    hosty.filter((h, i) => hosty.indexOf(h) !== i).join(', '));
  /* Jména zapojených se musí krýt se jmény, podle kterých robot pozná
     zdroj nabídky — jinak by se seznam a data rozešly beze slova. */
  const chybi = K.ZAPOJENE.map((z) => z.jmeno).filter((j) => !F.ZDROJ_JMENA.includes(j));
  pravda('jména zapojených zdrojů sedí na ZDROJ_JMENA', chybi.length === 0, chybi.join(', '));
  /* A TÁŽ SHODA OPAČNĚ. Tahle polovina tu chyběla a chytila by vadu,
     kterou jsem dnes udělal: zdroj „Nabídky státu" se zapojil do
     SOURCES, ale v registru zůstal mezi KANDIDÁTY. Nic nespadlo —
     jen diagnostika a sonda o živém zdroji dál tvrdily „kandidát",
     tedy „tohle se ještě nečte". Mlčící lež v tom, co web o sobě
     říká, je přesně to, co má hlídač chytat. */
  const neniVRegistru = F.ZDROJ_JMENA.filter((j) => !K.ZAPOJENE.some((z) => z.jmeno === j));
  pravda('a každý zapojený stahovač je v registru jako zapojený',
    neniVRegistru.length === 0,
    neniVRegistru.length
      ? `v SOURCES je, v ZAPOJENE chybí: ${neniVRegistru.join(', ')}`
      : 'registr i SOURCES mluví o týchž zdrojích');
  /* KANDIDÁT, KTERÉHO UŽ POKRÝVÁ JINÝ ZDROJ, to musí mít napsané —
     jinak vypadá jako nezapojená práce, která čeká. Změřeno 4. 11.
     z exportu centrální evidence: Lesy ČR tam posílají 45 ze 94
     záznamů a Správa železnic 17, kdežto Vojenské lesy ani jeden. */
  const pokryti = K.KANDIDATI.filter((z) => z.pokrytoJinym);
  pravda(`kandidáti pokrytí jiným zdrojem to mají napsané (${pokryti.length})`,
    pokryti.length >= 2, JSON.stringify(K.KANDIDATI.map((z) => z.jmeno)));
  pravda('a ten zdroj je opravdu zapojený',
    pokryti.every((z) => K.ZAPOJENE.some((v) => v.jmeno === z.pokrytoJinym)),
    JSON.stringify(pokryti.map((z) => z.pokrytoJinym)));
  pravda('a v důvodu stojí, čím je to změřené',
    pokryti.every((z) => /ZMĚŘENO/.test(z.proc || '')),
    'pokrytí bez měření je dohad, ne nález');

  pravda('u kandidátů se netvrdí, že je adresa ověřená',
    K.KANDIDATI.every((z) => z.adresaOverena === false)
    && K.ZAPOJENE.every((z) => z.adresaOverena === true),
    'ověřená adresa je ta, ze které se opravdu stahuje');
}

/* ---- 7) ROBOT SI KANDIDÁTY NAJDE SÁM VE VLASTNÍCH DATECH --------- */
{
  const data = JSON.parse(readFileSync(U('data/opportunities.json'), 'utf8'));
  const nalezeni = K.kandidatiZDat(data.opportunities);
  pravda(`ve vlastních datech se našli hostitelé mimo seznam (${nalezeni.length})`,
    nalezeni.length > 0,
    'centrální evidence dražeb odkazuje na dražebníky — ten výpis má růst sám');
  pravda('a žádný z nich není zdroj, který už v seznamu je',
    nalezeni.every((n) => ![...K.ZAPOJENE, ...K.KANDIDATI].some((z) => n.host === z.host || n.host.endsWith('.' + z.host))),
    JSON.stringify(nalezeni.map((n) => n.host)));
  pravda('a je u nich počet, podle kterého se dá rozhodnout',
    nalezeni.every((n) => n.pocet > 0 && /^https:\/\//.test(n.priklad)));
  const cile = S.cileSondy(data.opportunities);
  pravda('sonda měří zapojené, kandidáty i nalezené naráz',
    cile.length === K.ZAPOJENE.length + K.KANDIDATI.length + nalezeni.length,
    `cílů ${cile.length}`);
  const z = S.zavislost(data.opportunities, F.zdrojNabidky);
  pravda(`závislost se spočítá z dat (dnes ${z.podil} % — ${z.nejsilnejsi})`,
    z.podil > 0 && z.podil <= 100 && !!z.nejsilnejsi, JSON.stringify(z.podleZdroje));
}

/* ---- 8) ŽÁDNÉ OBCHÁZENÍ OCHRAN ---------------------------------- */
{
  const soubory = ['scripts/sonda-zdroju.mjs', 'scripts/robots.mjs', 'scripts/zdroje-kandidati.mjs',
    'scripts/fetch-opportunities.mjs'];
  const nalezy = [];
  for (const f of soubory) {
    const t = readFileSync(U(f), 'utf8');
    /* Prohlížeč se nepředstírá: řetězec „Mozilla" v hlavičce je přesně
       to předstírání. Jediná hlavička je BOT_UA z jednoho souboru. */
    if (/Mozilla\/\d/.test(t)) nalezy.push(`${f}: hlavička předstírající prohlížeč`);
    if (/UA_?SEZNAM|UA_LIST|userAgents|ua\s*=\s*\[/.test(t)) nalezy.push(`${f}: seznam hlaviček ke střídání`);
    if (/rotac|rotate|proxyList|proxies|SOCKS/i.test(t)) nalezy.push(`${f}: střídání adres nebo proxy`);
  }
  pravda('nikde se nestřídají hlavičky ani adresy a prohlížeč se nepředstírá',
    nalezy.length === 0, nalezy.join(' · '));
  const sonda = readFileSync(U('scripts/sonda-zdroju.mjs'), 'utf8');
  pravda('sonda si jméno robota nevyrábí, bere ho z bot-ua.mjs',
    /import \{ BOT_UA \} from '\.\/bot-ua\.mjs'/.test(sonda)
    && !/user-agent'\s*:/i.test(sonda),
    'kdyby si psala vlastní hlavičku, rozešla by se se zbytkem webu');
  pravda('a robots.txt se čte vždy před stránkou',
    sonda.indexOf('smimeCist(cil.url') < sonda.indexOf('stahni(cil.url'),
    'opačné pořadí znamená přečíst zákaz až po tom, co jsme ho porušili');
  pravda('mezi zdroji se čeká a dotaz má časový limit',
    S.PAUZA_MS >= 1000 && S.CAS_LIMIT_MS > 0 && /await spi\(PAUZA_MS\)/.test(sonda),
    `pauza ${S.PAUZA_MS} ms, limit ${S.CAS_LIMIT_MS} ms`);
}

/* ---- 9) NÁLEZ V REPOZITÁŘI JE ČITELNÝ A NELŽE ------------------- */
{
  const cesta = U('data/zdroje-sonda.json');
  let N = null;
  try { N = JSON.parse(readFileSync(cesta, 'utf8')); } catch (e) { N = null; }
  pravda('data/zdroje-sonda.json existuje a dá se přečíst',
    !!(N && Array.isArray(N.zdroje)), 'sonda ho zapisuje, --jen-cile ho umí založit');
  if (N && Array.isArray(N.zdroje)) {
    const nemereno = N.zdroje.filter((z) => z.verdikt === 'neměřeno').length;
    /* „Neměřeno" a „nedostupné" se nesmí splést: dokud sonda neběžela,
       musí být v souboru vidět, že se neměřilo, a ne že zdroje nejsou. */
    pravda('nezměřený nález to přiznává u každého zdroje',
      (N.updated === null) === (nemereno === N.zdroje.length),
      `updated ${JSON.stringify(N.updated)}, neměřeno ${nemereno} z ${N.zdroje.length}`);
    pravda('a nese závislost, kvůli které sonda vznikla',
      !!(N.zavislost && N.zavislost.podil > 0 && N.zavislost.nejsilnejsi),
      JSON.stringify(N.zavislost || {}));
  }
  /* POJISTKA PROTI MĚŘENÍ Z ROZBITÉ SÍTĚ. Kdyby ji sonda neměla,
     jediný běh ze stroje bez internetu by přepsal nález větou „deset
     webů je mrtvých". Je to táž úvaha jako u globální pojistky robota
     dat (§332) a stejně jako tam se hlídá, že v kódu opravdu je. */
  const sonda = readFileSync(U('scripts/sonda-zdroju.mjs'), 'utf8');
  pravda('nulová dostupnost proti dřívějšímu nálezu se bere jako naše síť, ne cizí weby',
    /if \(souhrn\.dostupne === 0 && drivDostupnych > 0\)/.test(sonda)
    && /process\.exit\(1\)/.test(sonda),
    'bez toho by běh bez internetu přepsal nález tvrzením, že zdroje neexistují');
}

/* ---- 2g) SKOŘÁPKA SE PŘEČTE PROHLÍŽEČEM ------------------------
   Naměřeno 3. 11. u ÚZSVM: 0 m², 0× „pozemek" — a to i po třech
   dalších adresách a po sitemap. Prohlížeč se SEM PODSTRKUJE, ať se
   měří rozhodování; že opravdový prohlížeč text přečte a drží
   robots.txt i u podřízených souborů, měří test-cti-prohlizecem. */
{
  /* Skořápka: velká stránka, ani jedno slovo o pozemku. */
  const SKORAPKA = '<html><body><div id="app">' + 'x'.repeat(25000) + '</div></body></html>';
  const VYKRESLENO = '<html><body>'
    + '<a href="/p/1">Pozemek 1 — 1 200 m², 450 000 Kč</a>'.repeat(40) + '</body></html>';
  const stahni = async (u) => {
    if (/robots\.txt$/.test(u)) return { ok: true, status: 200, text: async () => 'User-agent: *\nAllow: /' };
    return { ok: true, status: 200, text: async () => SKORAPKA };
  };
  const cil = { jmeno: 'Skořápka', host: 'sk.test', url: 'https://sk.test/', stav: 'kandidát' };

  const bez = await S.sondujZdroj(cil, { stahni, ua: UA, mezipamet: new Map() });
  pravda('bez prohlížeče zůstane „skořápka" (jinak by se nic neměřilo)',
    bez.slibuje === 'skořápka', bez.slibuje);

  const volane = [];
  const s2 = await S.sondujZdroj(cil, { stahni, ua: UA, mezipamet: new Map(),
    vykresli: async (u) => { volane.push(u); return { html: VYKRESLENO, zablokovano: 1, cizich: 4 }; } });
  pravda('s prohlížečem se verdikt zlepší', s2.slibuje === 'slibné', s2.slibuje);
  pravda('a v nálezu stojí, odkud a z čeho na co se změnil',
    s2.vykresleno && s2.vykresleno.url === 'https://sk.test/'
    && s2.vykresleno.bylo === 'skořápka' && s2.vykresleno.je === 'slibné'
    && s2.vykresleno.zablokovano === 1 && s2.vykresleno.cizich === 4,
    JSON.stringify(s2.vykresleno));
  pravda('a pustil se jen jednou, na měřenou adresu', volane.length === 1, JSON.stringify(volane));

  /* CO NEPOMOHLO, SE PŘIZNÁ — a verdikt se nemění. */
  const s3 = await S.sondujZdroj(cil, { stahni, ua: UA, mezipamet: new Map(),
    vykresli: async () => ({ html: SKORAPKA }) });
  pravda('vykreslení, které nepomohlo, verdikt nezmění a přizná se',
    s3.slibuje === 'skořápka' && s3.vykresleno && s3.vykresleno.nepomohlo === true,
    JSON.stringify(s3.vykresleno));

  /* PÁD PROHLÍŽEČE SONDU NESHODÍ. */
  const s4 = await S.sondujZdroj(cil, { stahni, ua: UA, mezipamet: new Map(),
    vykresli: async () => { throw new Error('prohlížeč nenaběhl'); } });
  pravda('pád prohlížeče sondu neshodí a zapíše se',
    s4.slibuje === 'skořápka' && /nenaběhl/.test((s4.vykresleno || {}).chyba || ''),
    JSON.stringify(s4.vykresleno));

  /* A U SLIBNÉHO ZDROJE SE PROHLÍŽEČ NEPOUŠTÍ VŮBEC. */
  const stahniSlibne = async (u) => {
    if (/robots\.txt$/.test(u)) return { ok: true, status: 200, text: async () => 'User-agent: *\nAllow: /' };
    return { ok: true, status: 200, text: async () => VYKRESLENO };
  };
  const kolik = [];
  const s5 = await S.sondujZdroj(cil, { stahni: stahniSlibne, ua: UA, mezipamet: new Map(),
    vykresli: async (u) => { kolik.push(u); return { html: VYKRESLENO }; } });
  pravda('u zdroje, který nabídky dal sám, se prohlížeč nepustí',
    s5.slibuje === 'slibné' && kolik.length === 0,
    `obsah ${s5.slibuje}, pustil se na: ${kolik.join(', ')}`);
}

/* ---- 2h) TÝŽ PORTÁL POD JINOU DOMÉNOU --------------------------
   NALEZENO MĚŘENÍM 3. 11. U ÚZSVM, a až po §354. Prohlížeč stránku
   vykreslil, robots.txt nic nezakázal — a obsah přesto nebyl. Teprve
   jmenovitě zapsané zahozené požadavky ukázaly, že ze osmi cizích
   požadavků šlo ŠEST na `nabidkamajetku.gov.cz`: aplikace bydlí na
   sousední doméně téhož jména. Verdikt „skořápka" tedy nebyl
   o zdroji, ale pořád jen o tom, kam se koukáme. */
{
  pravda('soused se pozná podle první části jména, cizí úřad ne',
    JSON.stringify(S.sousedniDomeny(
      [{ co: 'nabidkamajetku.gov.cz', kolik: 6 }, { co: 'www.googletagmanager.com', kolik: 1 }],
      'nabidkamajetku.cz')) === '["nabidkamajetku.gov.cz"]'
    && S.sousedniDomeny([{ co: 'cizi-urad.gov.cz' }], 'nabidkamajetku.cz').length === 0
    && S.sousedniDomeny([{ co: 'api.mapy.cz' }, { co: 'fonts.googleapis.com' }], 'exdrazby.cz').length === 0,
    'jinak by se chodilo na cizí weby jen proto, že mají stejnou příponu');

  const SKORAPKA = '<html><body><div id="app">' + 'x'.repeat(25000) + '</div></body></html>';
  const VYPIS = '<html><body>'
    + '<a href="/p/1">Pozemek 1 — 1 200 m², 450 000 Kč</a>'.repeat(40) + '</body></html>';
  const cil = { jmeno: 'Skořápka', host: 'sk.test', url: 'https://sk.test/', stav: 'kandidát' };
  const ZAHOZENI = [{ co: 'sk.gov.test', kolik: 6 }, { co: 'www.google.com', kolik: 1 }];
  /* Prohlížeč si vede seznam adres, na které ho někdo pustil —
     bez něj by se nedalo poznat zbytečné spuštění (sabotáž „čti
     souseda prohlížečem vždy" jinak projde zeleně). */
  const pustenNa = [];
  const vykresliNepomohl = async (u) => {
    pustenNa.push(u);
    return { html: SKORAPKA, zablokovano: 0, cizich: 7, cizinci: ZAHOZENI };
  };

  /* a) Soused nabídky má — verdikt se podle něj změní a adresa se zapíše. */
  const chozeno = [];
  const stahni = async (u) => {
    chozeno.push(u);
    if (/robots\.txt$/.test(u)) return { ok: true, status: 200, text: async () => 'User-agent: *\nAllow: /' };
    if (/^https:\/\/sk\.gov\.test\//.test(u)) return { ok: true, status: 200, text: async () => VYPIS };
    return { ok: true, status: 200, text: async () => SKORAPKA };
  };
  const a = await S.sondujZdroj(cil, { stahni, ua: UA, mezipamet: new Map(), vykresli: vykresliNepomohl });
  pravda('soused s nabídkami zdroj zachrání a adresa se zapíše',
    a.slibuje === 'slibné' && a.sousedniDomena
    && a.sousedniDomena.url === 'https://sk.gov.test/'
    && a.sousedniDomena.bylo === 'skořápka' && a.sousedniDomena.je === 'slibné',
    JSON.stringify(a.sousedniDomena) + ' / obsah ' + a.slibuje);
  pravda('na cizí měřidlo (google) se přitom nešlo',
    !chozeno.some((u) => /google/.test(u)), chozeno.join(' '));
  /* OTISK HNED PO TOMHLE PŘÍPADĚ. Seznam `pustenNa` sbírá i z dalších
     případů níž — a v jednom z nich se prohlížeč na souseda pouští
     právem. Bez otisku by kontrola padala na čistém kódu (padala;
     tohle je ta oprava). */
  const pustenPoA = pustenNa.slice();

  /* b) ROBOTS.TXT SOUSEDA PLATÍ. Je to jiný web, tedy jiný robots.txt
        — a když zakazuje, nesmí se stáhnout ani ta stránka. */
  const chozeno2 = [];
  const stahniZakaz = async (u) => {
    chozeno2.push(u);
    if (/sk\.gov\.test\/robots\.txt$/.test(u)) return { ok: true, status: 200, text: async () => 'User-agent: *\nDisallow: /' };
    if (/robots\.txt$/.test(u)) return { ok: true, status: 200, text: async () => 'User-agent: *\nAllow: /' };
    if (/^https:\/\/sk\.gov\.test\//.test(u)) return { ok: true, status: 200, text: async () => VYPIS };
    return { ok: true, status: 200, text: async () => SKORAPKA };
  };
  const b = await S.sondujZdroj(cil, { stahni: stahniZakaz, ua: UA, mezipamet: new Map(), vykresli: vykresliNepomohl });
  pravda('když soused zakazuje, stránka se nestáhne a zákaz se zapíše',
    b.slibuje === 'skořápka' && b.sousedniDomena && b.sousedniDomena.zakazano === true
    && !chozeno2.some((u) => u === 'https://sk.gov.test/'),
    JSON.stringify(b.sousedniDomena) + ' / chozeno: ' + chozeno2.filter((u) => !/robots/.test(u)).join(' '));

  /* c) Soused, který taky nic nenese, se PŘIZNÁ — netvrdí se práce,
        která nic nepřinesla. */
  const stahniNic = async (u) => {
    if (/robots\.txt$/.test(u)) return { ok: true, status: 200, text: async () => 'User-agent: *\nAllow: /' };
    return { ok: true, status: 200, text: async () => SKORAPKA };
  };
  const c = await S.sondujZdroj(cil, { stahni: stahniNic, ua: UA, mezipamet: new Map(), vykresli: vykresliNepomohl });
  pravda('soused, který taky nic nenese, se přizná jako nepomohl',
    c.slibuje === 'skořápka' && c.sousedniDomena && c.sousedniDomena.nepomohlo === true,
    JSON.stringify(c.sousedniDomena));

  /* c2) SOUSED, KTERÝ SE TAKY VYKRESLUJE AŽ V PROHLÍŽEČI. Naměřeno
         3. 11.: `nabidkamajetku.gov.cz` vyšlo ze serveru rovněž jako
         skořápka — je to táž aplikace, jen o doménu dál. Číst souseda
         jen ze serveru by tedy opakovalo touž chybu. */
  const ctenoProhlizecem = [];
  const c2 = await S.sondujZdroj(cil, { stahni: stahniNic, ua: UA, mezipamet: new Map(),
    vykresli: async (u) => {
      ctenoProhlizecem.push(u);
      /* Původní adresa zůstane skořápkou, soused se prohlížečem
         přečte — to je právě ten naměřený případ. */
      return u === 'https://sk.gov.test/'
        ? { html: VYPIS, zablokovano: 0, cizich: 0 }
        : { html: SKORAPKA, zablokovano: 0, cizich: 7, cizinci: ZAHOZENI };
    } });
  pravda('soused se taky přečte prohlížečem, když ze serveru nic nedá',
    c2.slibuje === 'slibné' && c2.sousedniDomena
    && c2.sousedniDomena.cteno === 'prohlížečem'
    && ctenoProhlizecem.includes('https://sk.gov.test/'),
    JSON.stringify(c2.sousedniDomena) + ' / vykreslováno: ' + ctenoProhlizecem.join(' '));
  pravda('a když nabídky dal už sám server, prohlížeč se na souseda nepustí',
    (a.sousedniDomena || {}).cteno === 'ze serveru'
    && !pustenPoA.includes('https://sk.gov.test/'),
    JSON.stringify(a.sousedniDomena) + ' / pouštěn na: ' + pustenPoA.join(' '));

  /* d) Když prohlížeč POMOHL, soused se nezkouší — není proč. */
  const chozeno3 = [];
  const stahniP = async (u) => {
    chozeno3.push(u);
    if (/robots\.txt$/.test(u)) return { ok: true, status: 200, text: async () => 'User-agent: *\nAllow: /' };
    return { ok: true, status: 200, text: async () => SKORAPKA };
  };
  const d = await S.sondujZdroj(cil, { stahni: stahniP, ua: UA, mezipamet: new Map(),
    vykresli: async () => ({ html: VYPIS, zablokovano: 0, cizich: 7, cizinci: ZAHOZENI }) });
  pravda('když prohlížeč pomohl, na souseda se vůbec nechodí',
    d.slibuje === 'slibné' && !d.sousedniDomena && !chozeno3.some((u) => /sk\.gov\.test/.test(u)),
    JSON.stringify(d.sousedniDomena) + ' / ' + chozeno3.filter((u) => /gov/.test(u)).join(' '));
}

/* ---- KANDIDÁT, KTERÝ ČEKÁ NA ČLOVĚKA ---------------------------
 *
 * Měřeno 5. 11.: v nálezu leželo PĚT dostupných a slibných zdrojů,
 * které nejsou zapojené, a nedozvěděl se o nich nikdo — úloha skončila
 * zeleně a číslo zůstalo v logu (§431). Tohle je ta funkce, podle které
 * se o nich hlásí, takže se měří ONA, ne až hlásič.
 */
{
  const zdroje = [
    { jmeno: 'Zapojený', host: 'a.test', url: 'https://a.test/', stav: 'zapojeno',
      verdikt: 'dostupné', slibuje: 'slibné' },
    { jmeno: 'Kandidát', host: 'b.test', url: 'https://b.test/majetek', stav: 'kandidát',
      verdikt: 'dostupné', slibuje: 'slibné', robots: 'dovoluje', odpoved: 200,
      vyteznost: { slovoPozemek: 12, korun: 5 } },
    { jmeno: 'Zakázaný', host: 'c.test', url: 'https://c.test/', stav: 'kandidát',
      verdikt: 'zakázané', slibuje: 'slibné' },
    { jmeno: 'Slabý', host: 'd.test', url: 'https://d.test/', stav: 'kandidát',
      verdikt: 'dostupné', slibuje: 'slabé' },
    { jmeno: 'Z dat', host: 'e.test', url: 'https://e.test/', stav: 'z vlastních dat',
      verdikt: 'dostupné', slibuje: 'slibné' },
  ];
  const a = S.akceschopneZdroje(zdroje);
  pravda('akceschopný je dostupný, slibný a NEzapojený', a.length === 2
    && a.some((z) => z.host === 'b.test') && a.some((z) => z.host === 'e.test'),
    JSON.stringify(a.map((z) => z.host)));
  pravda('zapojený zdroj se nehlásí (ten už čteme)', !a.some((z) => z.host === 'a.test'));
  pravda('zakázaný robots.txt se nehlásí (zákaz je konec)', !a.some((z) => z.host === 'c.test'));
  pravda('a slabý obsah taky ne', !a.some((z) => z.host === 'd.test'));

  const nove = S.noveKandidaty({ zdroje: [{ host: 'e.test', stav: 'kandidát',
    verdikt: 'dostupné', slibuje: 'slibné' }] }, zdroje);
  pravda('co bylo akceschopné i minule, není nové', nove.length === 1 && nove[0].host === 'b.test',
    JSON.stringify(nove.map((z) => z.host)));
  pravda('nová položka má společný tvar pro hlásič',
    !!nove[0] && !!nove[0].jmeno && !!nove[0].adresa && !!nove[0].verdikt && !!nove[0].coSTim,
    JSON.stringify(nove[0]));
  pravda('a v odůvodnění je naměřené, ne dojem',
    /robots dovoluje/.test(nove[0].proc) && /odpověď 200/.test(nove[0].proc)
    && /12× slovo o pozemku/.test(nove[0].proc), nove[0].proc);
  pravda('první nález (bez minulého) je celý nový',
    S.noveKandidaty(null, zdroje).length === 2);
  pravda('a stejný nález dvakrát nehlásí nic',
    S.noveKandidaty({ zdroje }, zdroje).length === 0);

  /* SPOJKY, NE JEN FUNKCE (§423): funkce může být bez vady a stejně se
     nikdo nic nedozví — stačí, aby se „nové" nezapsalo nebo aby úloha
     hlásič nezavolala. */
  const telo = readFileSync(new URL('./sonda-zdroju.mjs', import.meta.url), 'utf8');
  pravda('sonda zapisuje „nové kandidáty" do nálezu',
    /noveKandidaty:\s*noveK/.test(telo) && /noveKandidaty\(drive,\s*nalez\)/.test(telo),
    'v scripts/sonda-zdroju.mjs chybí zápis noveKandidaty');
  const uloha = readFileSync(new URL('../.github/workflows/sonda-zdroju.yml', import.meta.url), 'utf8');
  pravda('a úloha hlásič opravdu volá, s vlastním polem i značkou',
    /ohlas-nalez/.test(uloha) && /pole:\s*noveKandidaty/.test(uloha)
    && /znacka:\s*sonda-zdroju/.test(uloha), 'krok „Ohlásit nález" chybí nebo mu chybí vstupy');
}

console.log('Sonda zdrojů:');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb.`);
process.exit(chyb ? 1 : 0);
