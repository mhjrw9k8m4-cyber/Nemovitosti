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

console.log('Sonda zdrojů:');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb.`);
process.exit(chyb ? 1 : 0);
