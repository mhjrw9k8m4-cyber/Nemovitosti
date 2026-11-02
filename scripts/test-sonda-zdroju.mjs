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

/* ---- 3) ZAKÁZANOU STRÁNKU SONDA NESTÁHNE ------------------------- */
{
  const volane = [];
  const stahni = async (u) => {
    volane.push(u);
    if (/robots\.txt$/.test(u)) return { ok: true, status: 200, text: async () => 'User-agent: *\nDisallow: /' };
    return { ok: true, status: 200, text: async () => 'pozemek pozemek pozemek 100 m² 500 Kč' };
  };
  /* smimeCist čte robots.txt přes r.text jako HODNOTU, sonda stránku
     přes odp.text() jako FUNKCI — podstrčení musí umět obojí. */
  const stahni2 = async (u) => {
    volane.push(u);
    if (/robots\.txt$/.test(u)) return { ok: true, status: 200, text: 'User-agent: *\nDisallow: /' };
    return { ok: true, status: 200, text: async () => 'pozemek' };
  };
  const z = await S.sondujZdroj({ jmeno: 'Zakázaný', host: 'zakaz.test', url: 'https://zakaz.test/seznam', typ: 'sale' },
    { stahni: stahni2, ua: UA, mezipamet: new Map() });
  pravda('zdroj, který zakazuje, skončí jako „zakázané"',
    z.verdikt === 'zakázané' && z.robots === 'nedovoluje', JSON.stringify(z));
  pravda('a jeho stránka se vůbec nestáhne',
    volane.length === 1 && /robots\.txt$/.test(volane[0]), JSON.stringify(volane));
  pravda('a v nálezu stojí, které pravidlo to zakázalo',
    /Disallow/.test(z.robotsDuvod || ''), z.robotsDuvod);
  void stahni;
}

/* ---- 4) POVOLENÝ ZDROJ SE ZMĚŘÍ --------------------------------- */
{
  const stahni = async (u) => {
    if (/robots\.txt$/.test(u)) return { ok: true, status: 200, text: 'User-agent: *\nAllow: /' };
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
    if (/robots\.txt$/.test(u)) return { ok: true, status: 200, text: 'User-agent: *\nAllow: /' };
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
