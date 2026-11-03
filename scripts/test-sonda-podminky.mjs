// Test: sonda podmínek čte jen to, co smí — a hlásí, co našla.
//
// Spuštění: node scripts/test-sonda-podminky.mjs   (bez prohlížeče)
//
// §339 změřil, že robots.txt zdroje, odkud bereme 81 % obsahu, má
// `Disallow: /`. Majitel rozhodl: nejdřív zjistit podmínky. Tahle
// sonda to dělá měřením — a dvě věci se u ní nesmí pokazit:
//
//   1) ČTENÍ PODMÍNEK NEMÁ VÝJIMKU. Je to obyčejné stahování cizí
//      stránky. Když web tu cestu zakazuje, nestahuje se a do nálezu
//      se napíše, že to nešlo. Jinak by vznikla absurdita: zákaz
//      zjišťujeme tím, že ho porušíme.
//   2) NIC SE NEDOMÝŠLÍ. Do nálezu jde jen to, co na té stránce
//      opravdu stálo. Žádné „asi to znamená".
//
// Síť se nepoužívá: stahování se podstrkuje, a jedna kontrola běží
// naostro proti serveru na 127.0.0.1 (pravidlo z §337).
import { readFileSync } from 'node:fs';
import { pricinaChyb } from './chyby-hlaska.mjs';

let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
const P = await import('./sonda-podminky.mjs');
const F = await import('./fetch-opportunities.mjs');
const UA = (await import('./bot-ua.mjs')).BOT_UA;

/* ---- 1) ODKAZ NA PODMÍNKY SE POZNÁ, CIZÍ WEB SE NEBERE ---------- */
{
  const html = `<html><body>
    <a href="/o-nas">O nás</a>
    <a href="/podminky-uziti">Podmínky užití</a>
    <a href="/obchodni-podminky">Obchodní podmínky</a>
    <a href="https://jiny.test/terms">Terms (cizí web)</a>
    <a href="/kontakt">Kontakt</a>
    <a href="/pravni-informace">Právní informace</a>
    <a href="/podminky-uziti#cl5">Podmínky užití (táž stránka s kotvou)</a>
  </body></html>`;
  const o = P.odkazyNaPodminky(html, 'https://web.test/');
  pravda('najdou se odkazy na podmínky, ne všechny odkazy',
    o.length === 3 && o.every((x) => /web\.test/.test(x.url)), JSON.stringify(o));
  pravda('cizí web se nebere — odvedl by nás jinam',
    !o.some((x) => /jiny\.test/.test(x.url)), JSON.stringify(o));
  pravda('kotva na tutéž stránku se nepočítá dvakrát',
    new Set(o.map((x) => x.url)).size === o.length, JSON.stringify(o));
  pravda('u odkazu je i jeho nápis, ať se v nálezu pozná, co to je',
    o.every((x) => typeof x.popis === 'string'), JSON.stringify(o));
  /* Odkaz se pozná i podle ADRESY, když nápis nic neříká — a naopak. */
  pravda('odkaz se pozná z adresy i z nápisu',
    P.odkazyNaPodminky('<a href="/vop">Dokument</a>', 'https://w.test/').length === 0
    && P.odkazyNaPodminky('<a href="/x">Smluvní podmínky</a>', 'https://w.test/').length === 1);
  /* Strop, ať se nestahuje půl webu. */
  const hodne = Array.from({ length: 20 }, (_, i) => `<a href="/podminky-${i}">Podmínky ${i}</a>`).join('');
  pravda('najde se nejvýš STRANEK_NA_ZDROJ adres',
    P.odkazyNaPodminky(hodne, 'https://w.test/').length === P.STRANEK_NA_ZDROJ);
}

/* ---- 2) VYBÍRAJÍ SE JEN ODSTAVCE O AUTOMATICKÉM PŘÍSTUPU -------- */
{
  const html = `<html><body>
    <p>1. Tyto podmínky upravují užívání služby. Platba se provádí kartou
       a reklamace se řeší do třiceti dnů od převzetí zboží bez výhrad.</p>
    <p>2. Uživatel není oprávněn obsah serveru automatizovaně stahovat,
       kopírovat ani jinak hromadně získávat, zejména pomocí robotů,
       crawlerů či obdobných skriptů bez předchozího písemného souhlasu.</p>
    <p>3. Ceny jsou uvedeny včetně daně z přidané hodnoty a mohou se měnit.</p>
    <p>4. Přístup k datovému rozhraní (API) je možný na základě smlouvy.</p>
  </body></html>`;
  const p = P.oAutomatu(html);
  pravda('vyberou se jen odstavce o automatickém přístupu',
    p.length === 2 && /automatizovan/.test(p[0].text) && /rozhran/i.test(p[1].text), JSON.stringify(p));
  pravda('odstavec o platbách a reklamacích se nebere',
    !p.some((x) => /reklamace/.test(x.text)), JSON.stringify(p));
  pravda('odstavec se nezkracuje pod čitelnost, ale má strop',
    p.every((x) => x.text.length <= P.DELKA_ODSTAVCE + 2));
  /* A HLAVNĚ: u pasáže stojí SLOVO, kvůli kterému se vybrala, a výsek
     je kolem něj — ne šest set znaků úvodu, za kterými to slovo
     zůstane. Na tom padl první běh naostro: do nálezu se zapsal odstavec,
     ze kterého nebylo poznat, proč tam je. */
  pravda('u pasáže stojí slovo, kvůli kterému se vybrala',
    /automatizovan/i.test(p[0].slovo) && /rozhran/i.test(p[1].slovo),
    JSON.stringify(p.map((x) => x.slovo)));
  pravda('a to slovo je uvnitř výseku, ne za řezem',
    p.every((x) => x.text.toLowerCase().includes(x.slovo.toLowerCase())),
    JSON.stringify(p));
  {
    /* Dlouhý odstavec, kde slovo stojí až na konci: výsek ho musí
       obsahovat, ať je odstavec jak chce dlouhý. */
    const dlouhy = '<p>' + 'Toto je úvodní věta bez významu pro náš účel. '.repeat(60)
      + 'Obsah nelze automatizovaně stahovat.</p>';
    const q = P.oAutomatu(dlouhy);
    pravda('slovo na konci dlouhého odstavce se do výseku vejde',
      q.length === 1 && /automatizovan/.test(q[0].text), JSON.stringify(q));
  }
  pravda('značky se odstraní, text zůstane',
    !/[<>]/.test(P.bezZnacek('<p>text &amp; dál</p>')) && /text & dál/.test(P.bezZnacek('<p>text &amp; dál</p>')));
  pravda('krátké úryvky se za odstavec nepočítají',
    P.odstavce('ano\nkratke\n' + 'x'.repeat(50)).length === 1);
  /* A TOHLE JE TA VADA, KTEROU ZKOUŠKA NAŠLA: bod podmínek rozlámaný
     ve zdroji na tři řádky musí vyjít jako JEDEN odstavec, ne tři
     půlvěty — podle půlvět se rozhodnout nedá. */
  const rozlamany = '<p>2. Uživatel není oprávněn obsah\n   automatizovaně stahovat\n   pomocí robotů.</p>';
  pravda('bod rozlámaný ve zdroji na víc řádků je JEDEN odstavec',
    P.odstavce(P.bezZnacek(rozlamany)).length === 1, JSON.stringify(P.odstavce(P.bezZnacek(rozlamany))));
  pravda('a hranice odstavce se bere ze značek',
    P.odstavce(P.bezZnacek('<li>' + 'a'.repeat(45) + '</li><li>' + 'b'.repeat(45) + '</li>')).length === 2);
}

/* ---- 3) ZÁKAZ PLATÍ I NA ČTENÍ PODMÍNEK ------------------------- */
/* Jinak by vznikla absurdita: zákaz zjišťujeme tím, že ho porušíme. */
{
  const volane = [];
  const stahni = async (u) => {
    volane.push(u);
    if (/robots\.txt$/.test(u)) return { ok: true, status: 200, text: async () => 'User-agent: *\nDisallow: /' };
    return { ok: true, status: 200, text: async () => '<a href="/podminky">Podmínky</a>' };
  };
  const z = await P.zmerPodminky({ jmeno: 'Zakazuje', host: 'z.test', domov: 'https://z.test/' },
    { stahni, ua: UA, mezipamet: new Map() });
  pravda('web, který zakazuje, se nečte ani kvůli podmínkám',
    /nedovoluje/.test(z.verdikt) && volane.length === 1 && /robots\.txt$/.test(volane[0]),
    JSON.stringify({ verdikt: z.verdikt, volane }));
  pravda('a v nálezu stojí, které pravidlo to zakázalo',
    /Disallow/.test(z.duvod || ''), z.duvod);
  /* A zákaz na PODSTRÁNCE: domov se přečte, podmínky ne. */
  const stahni2 = async (u) => {
    if (/robots\.txt$/.test(u)) return { ok: true, status: 200, text: async () => 'User-agent: *\nDisallow: /podminky' };
    return { ok: true, status: 200, text: async () => '<a href="/podminky">Podmínky užití</a>' };
  };
  const z2 = await P.zmerPodminky({ jmeno: 'Část', host: 'c.test', domov: 'https://c.test/' },
    { stahni: stahni2, ua: UA, mezipamet: new Map() });
  pravda('zakázaná PODSTRÁNKA se taky nestáhne a je to v nálezu',
    z2.stranky.length === 1 && z2.stranky[0].stav === 'nesmíme číst'
    && /Disallow/.test(z2.stranky[0].duvod || ''), JSON.stringify(z2.stranky));
}

/* ---- 4) CELÁ CESTA, KDYŽ SE ČÍST SMÍ --------------------------- */
{
  const PODMINKY = `<html><body>
    <p>2. Uživatel není oprávněn obsah automatizovaně stahovat pomocí robotů
       ani jej hromadně kopírovat bez písemného souhlasu provozovatele.</p>
    <p>3. Doručování se řídí občanským zákoníkem a lhůty jsou zachovány.</p>
  </body></html>`;
  const stahni = async (u) => {
    if (/robots\.txt$/.test(u)) return { ok: true, status: 200, text: async () => 'User-agent: *\nAllow: /' };
    if (/podminky/.test(u)) return { ok: true, status: 200, text: async () => PODMINKY };
    return { ok: true, status: 200, text: async () => '<a href="/podminky-uziti">Podmínky užití</a>' };
  };
  const z = await P.zmerPodminky({ jmeno: 'Povoluje', host: 'p.test', domov: 'https://p.test/' },
    { stahni, ua: UA, mezipamet: new Map() });
  pravda('povolený web se přečte a pasáže o automatu jsou v nálezu',
    /přečteno \(1 pasáží/.test(z.verdikt) && z.stranky[0].pasaze.length === 1
    && /automatizovan/.test(z.stranky[0].pasaze[0].text), JSON.stringify(z.verdikt));
  pravda('a odstavec, který s automatem nesouvisí, se nepřipojí',
    !z.stranky[0].pasaze.some((p) => /občanským/.test(p.text)), JSON.stringify(z.stranky[0].pasaze));
  /* Stránka bez jediné zmínky se do nálezu dostane TAKY — „nic tam
     není" je nález, ne mlčení. */
  /* Stránka MUSÍ mít dost textu, jinak by to spadlo do „málo textu" —
     a právě ten rozdíl se tu měří. Padlo na tom moje první podoby
     téhle předlohy: tři věty na „nic o automatu" nestačí, protože tři
     věty neznamenají, že jsme podmínky přečetli. */
  /* Musí to být dost dlouhé na ÚPLNÉ podmínky (ZNAKU_NA_PODMINKY),
     ne jen nad prahem jedné stránky. Padlo na tom i tohle: 2 320 znaků
     je nad prahem stránky, ale smluvní podmínky to nejsou. */
  const DLOUHE = '<p>' + 'Platba kartou a reklamace do třiceti dnů od převzetí věci bez výhrad. '.repeat(160) + '</p>';
  const stahniNic = async (u) => {
    if (/robots\.txt$/.test(u)) return { ok: true, status: 200, text: async () => 'User-agent: *\nAllow: /' };
    if (/podminky/.test(u)) return { ok: true, status: 200, text: async () => DLOUHE };
    return { ok: true, status: 200, text: async () => '<a href="/podminky">Podmínky</a>' };
  };
  const zNic = await P.zmerPodminky({ jmeno: 'Nic', host: 'n.test', domov: 'https://n.test/' },
    { stahni: stahniNic, ua: UA, mezipamet: new Map() });
  pravda('„nic o automatu" je taky nález, ne mlčení',
    /nic o automatick/.test(zNic.verdikt), zNic.verdikt);
  pravda('a v nálezu je doklad, kolik textu se přečetlo',
    zNic.stranky[0].znaku >= P.ZNAKU_NA_STRANKU && zNic.stranky[0].odstavcuCelkem >= 1,
    JSON.stringify({ znaku: zNic.stranky[0].znaku, odstavcu: zNic.stranky[0].odstavcuCelkem }));
  /* A TEN ROZDÍL, PRO KTERÝ TO VZNIKLO. Stránka vykreslená až
     v prohlížeči vrátí skoro prázdné HTML. „Nic o automatu" by z ní
     byla lež — nepřečetli jsme nic, z čeho by se to dalo poznat. */
  const stahniPrazdna = async (u) => {
    if (/robots\.txt$/.test(u)) return { ok: true, status: 200, text: async () => 'User-agent: *\nAllow: /' };
    if (/podminky/.test(u)) return { ok: true, status: 200, text: async () => '<div id="app"></div>' };
    return { ok: true, status: 200, text: async () => '<a href="/podminky">Podmínky</a>' };
  };
  const zPrazdna = await P.zmerPodminky({ jmeno: 'Aplikace', host: 'a.test', domov: 'https://a.test/' },
    { stahni: stahniPrazdna, ua: UA, mezipamet: new Map() });
  /* A TŘETÍ STAV, který přinesl druhý běh naostro: stránka se PŘEČETLA
     a nic o robotech v ní nebylo — jenže vydala jen dva tisíce znaků,
     což na úplné podmínky nestačí. Takový nález nesmí znít jako
     odpověď. */
  const stahniKratke = async (u) => {
    if (/robots\.txt$/.test(u)) return { ok: true, status: 200, text: async () => 'User-agent: *\nAllow: /' };
    if (/podminky/.test(u)) return { ok: true, status: 200,
      text: async () => '<p>' + 'Služba se poskytuje podle těchto ujednání a lhůt. '.repeat(50) + '</p>'
        + '<a href="/soubory/podminky.pdf">Podmínky v PDF</a>' };
    return { ok: true, status: 200, text: async () => '<a href="/podminky">Podmínky</a>' };
  };
  const zKratke = await P.zmerPodminky({ jmeno: 'Krátké', host: 'k.test', domov: 'https://k.test/' },
    { stahni: stahniKratke, ua: UA, mezipamet: new Map() });
  pravda('přečtené, ale na úPLNÉ podmínky příliš krátké — to není odpověď',
    /na úplné podmínky je to málo/.test(zKratke.verdikt)
    && zKratke.znakuCelkem < P.ZNAKU_NA_PODMINKY, zKratke.verdikt);
  pravda('a v nálezu je vodítko, kam se text schoval (odkaz na dokument)',
    Array.isArray(zKratke.dokumenty) && /podminky\.pdf$/.test(zKratke.dokumenty[0] || ''),
    JSON.stringify(zKratke.dokumenty));
  pravda('skoro prázdná stránka se NEVYDÁ za „nic o automatu"',
    /málo textu/.test(zPrazdna.verdikt) && /málo textu/.test(zPrazdna.stranky[0].stav),
    JSON.stringify({ verdikt: zPrazdna.verdikt, stav: zPrazdna.stranky[0].stav }));
  /* JEDEN SKOK DÁL: podmínky bývají rozdělené na víc dokumentů. */
  const stahniDva = async (u) => {
    if (/robots\.txt$/.test(u)) return { ok: true, status: 200, text: async () => 'User-agent: *\nAllow: /' };
    if (/\/smluvni/.test(u)) return { ok: true, status: 200,
      text: async () => DLOUHE + '<a href="/podminky-uziti">Podmínky užití</a>' };
    if (/\/podminky-uziti/.test(u)) return { ok: true, status: 200,
      text: async () => '<p>7. Obsah nelze automatizovaně stahovat roboty ani hromadně kopírovat bez souhlasu.</p>' };
    return { ok: true, status: 200, text: async () => '<a href="/smluvni-podminky">Smluvní podmínky</a>' };
  };
  const zDva = await P.zmerPodminky({ jmeno: 'Dva', host: 'd.test', domov: 'https://d.test/' },
    { stahni: stahniDva, ua: UA, mezipamet: new Map() });
  pravda('odkaz na další podmínky Z TÉ STRÁNKY se dojde (jeden skok)',
    zDva.stranky.length === 2 && /1 pasáží/.test(zDva.verdikt), JSON.stringify(zDva.verdikt));
  /* A když se odkaz nenajde, řekne se to — ať se nehádá, proč je prázdno. */
  const stahniBez = async (u) => ({ ok: true, status: 200,
    text: async () => (/robots\.txt$/.test(u) ? 'User-agent: *\nAllow: /' : '<a href="/kontakt">Kontakt</a>') });
  const zBez = await P.zmerPodminky({ jmeno: 'Bez', host: 'b.test', domov: 'https://b.test/' },
    { stahni: stahniBez, ua: UA, mezipamet: new Map() });
  pravda('když odkaz na podmínky není, nález to řekne',
    /nenašel/.test(zBez.verdikt), zBez.verdikt);
}

/* ---- 5) CÍLE SE BEROU Z MĚŘENÍ, NE ZE SEZNAMU V KÓDU ----------- */
{
  const nalez = { updated: '2026-11-02', zdroje: [
    { jmeno: 'Zakazuje', host: 'api.zak.cz', stav: 'zapojeno', robots: 'nedovoluje', robotsDuvod: 'Disallow: /' },
    { jmeno: 'Dovoluje', host: 'ok.cz', stav: 'zapojeno', robots: 'dovoluje' },
    { jmeno: 'Kandidát zakazuje', host: 'kand.cz', stav: 'kandidát', robots: 'nedovoluje' },
  ] };
  const c = P.cilePodminek(nalez);
  const zakazy = c.filter((x) => x.duvod === 'zákaz');
  pravda('cílem se zákazem je jen ZAPOJENÝ zdroj, který nás zakazuje',
    zakazy.length === 1 && zakazy[0].jmeno === 'Zakazuje', JSON.stringify(c));
  pravda('a domov se bere z webu, ne z API — podmínky nejsou v rozhraní',
    zakazy[0].domov === 'https://www.zak.cz/', zakazy[0].domov);
  pravda('zapojený zdroj, který nás NEZAKAZUJE, se nečte (není proč)',
    !c.some((x) => x.jmeno === 'Dovoluje'), JSON.stringify(c));

  /* DRUHÁ TŘÍDA CÍLŮ: slibný kandidát, kterého NEVOZÍME. Majitelův
     pokyn byl „jen zjistit podmínky", a to platí i pro zdroj, který
     by se mohl přidat — odpovědět musí člověk PŘED přidáním. */
  const sKandidaty = { updated: '2026-11-03', zdroje: [
    { jmeno: 'Slibný', host: 'slibny.cz', stav: 'kandidát', robots: 'dovoluje', slibuje: 'slibné' },
    { jmeno: 'Slabý', host: 'slaby.cz', stav: 'kandidát', robots: 'dovoluje', slibuje: 'slabé' },
    { jmeno: 'Slibný ale zakázaný', host: 'zakaz.cz', stav: 'kandidát', robots: 'nedovoluje', slibuje: 'slibné' },
    { jmeno: 'Na podřízené adrese', host: 'drazby.obec.cz', stav: 'kandidát', robots: 'dovoluje', slibuje: 'slibné' },
  ] };
  const k = P.cilePodminek(sKandidaty);
  pravda('slibný kandidát se dostane mezi cíle', k.some((x) => x.jmeno === 'Slibný'), JSON.stringify(k));
  pravda('a je označený jako kandidát, ne jako zákaz',
    (k.find((x) => x.jmeno === 'Slibný') || {}).duvod === 'slibný kandidát', JSON.stringify(k));
  pravda('SLABÝ kandidát se nečte (nemá cenu na něj posílat dotazy)',
    !k.some((x) => x.jmeno === 'Slabý'), JSON.stringify(k));
  /* Zakázaný kandidát se nečte VŮBEC: robots.txt je odpověď sama.
     Posílat dotazy na web, který nás zakazuje, kvůli zdroji, který ani
     nevozíme, by bylo přesně to, co tahle sonda nemá dělat. */
  pravda('a zakázaný kandidát taky ne — robots.txt je odpověď sama',
    !k.some((x) => x.jmeno === 'Slibný ale zakázaný'), JSON.stringify(k));
  pravda('hostu s podřízenou částí se „www." NEPŘIDÁVÁ',
    (k.find((x) => x.jmeno === 'Na podřízené adrese') || {}).domov === 'https://drazby.obec.cz/',
    'www.drazby.obec.cz neexistuje, takže by sonda hlásila „nenašly se" tam, kde se jen nedívala správně');
  pravda('a hostu bez ní ano', P.domovZHostu('drazbynaxos.cz') === 'https://www.drazbynaxos.cz/',
    P.domovZHostu('drazbynaxos.cz'));
  pravda('bez měření se nečte nic (cíle by se neznaly)',
    P.cilePodminek(null).length === 0 && P.cilePodminek({ zdroje: [] }).length === 0);
  /* A v kódu se opravdu rozhoduje podle nálezu, ne podle zadrátovaného
     seznamu webů — na tom by celá poctivost spadla. */
  const kod = readFileSync(new URL('../scripts/sonda-podminky.mjs', import.meta.url), 'utf8');
  /* HLEDÁ SE V KÓDU, NE V KOMENTÁŘÍCH. První podoba téhle kontroly
     padla na mém vlastním komentáři, který vysvětluje, proč skript
     vznikl — a tam ta jména PATŘÍ. Nepatří do rozhodování. */
  const kodBezKom = kod.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/^\s*\/\/.*$/gm, ' ');
  pravda('skript nemá zadrátovaný seznam webů (cíle bere z měření)',
    !/bezrealitky|sreality/i.test(kodBezKom));
  pravda('a bez změřeného nálezu sondy skončí chybou',
    /nalez\.updated/.test(kod) && /process\.exit\(1\)/.test(kod));
}

/* ---- 6) NAOSTRO: OPRAVDOVÉ `stahni`, MÍSTNÍ SERVER ------------- */
/* Pravidlo z §337: aspoň jedna kontrola běží bez podstrčení. */
{
  const http = await import('node:http');
  const srv = http.createServer((req, res) => {
    if (req.url === '/robots.txt') {
      res.writeHead(200, { 'content-type': 'text/plain' });
      res.end('User-agent: *\nAllow: /\n'); return;
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    if (/podminky/.test(req.url)) {
      res.end('<html><body><p>5. Obsah serveru nelze automatizovaně stahovat roboty'
        + ' ani hromadně kopírovat bez písemného souhlasu provozovatele serveru.</p></body></html>');
    } else {
      res.end('<html><body><a href="/podminky-uziti">Podmínky užití</a></body></html>');
    }
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${srv.address().port}`;
  try {
    const z = await P.zmerPodminky({ jmeno: 'Místní', host: '127.0.0.1', domov: base + '/' },
      { stahni: F.stahni, ua: UA, mezipamet: new Map() });
    pravda('NAOSTRO: domov, odkaz i podmínky se přečtou opravdovým `stahni`',
      /přečteno \(1 pasáží/.test(z.verdikt) && z.stranky.length === 1
      && /automatizovan/.test(z.stranky[0].pasaze[0].text),
      JSON.stringify({ verdikt: z.verdikt, stranky: z.stranky.length }));
  } finally { srv.close(); }
}

/* ---- 7) NÁLEZ V REPOZITÁŘI SE DÁ PŘEČÍST A NELŽE -------------- */
{
  let d = null;
  try { d = JSON.parse(readFileSync(new URL('../data/zdroje-podminky.json', import.meta.url), 'utf8')); } catch { d = null; }
  pravda('data/zdroje-podminky.json existuje a dá se přečíst', !!d && Array.isArray(d.zdroje));
  if (d && !d.updated) {
    pravda('nezměřený nález to přiznává u každého zdroje',
      d.zdroje.every((z) => z.verdikt === 'neměřeno'), JSON.stringify(d.zdroje.map((z) => z.verdikt)));
  } else if (d) {
    pravda('změřený nález má u každého zdroje verdikt',
      d.zdroje.every((z) => typeof z.verdikt === 'string' && z.verdikt && z.verdikt !== 'neměřeno'),
      JSON.stringify(d.zdroje.map((z) => z.verdikt)));
  }
}

/* ---- 8) TEXT VE VLOŽENÉM JSONU, NE JEN VE ZNAČKÁCH ------------- */
/* Druhý běh naostro přečetl u jednoho zdroje jen 2 137 znaků — a to na
   smluvní podmínky nestačí. Příčina: dnešní weby posílají obsah jako
   JSON ve `<script>` a do značek ho vykreslí až prohlížeč, kdežto
   `bezZnacek` `<script>` zahazuje. Vyhodil jsem tedy přesně to místo,
   kde ten text nejspíš byl. Není to obcházení ničeho: je to čtení TÉŽE
   stránky, jen se text bere i odtamtud, kam ho web uložil. */
{
  const VETA = 'Uživatel není oprávněn obsah automatizovaně stahovat roboty ani hromadně kopírovat.';
  const html = '<html><body><div id="app"></div>'
    + '<script id="__NEXT_DATA__" type="application/json">'
    /* Adresa MUSÍ být delší než 40 znaků, jinak ji vyloučí délka
       a pravidlo „adresa není text" se vůbec nezměří. Na tom tahle
       kontrola nejdřív prošla i se sabotáží. */
    + JSON.stringify({ props: { text: VETA, nazev: 'Podmínky',
      url: 'https://w.test/informace/smluvni-podminky/priloha-c-3-sazebnik.pdf' } })
    + '</script></body></html>';
  const t = P.textZeSkriptu(html);
  pravda('věta z vloženého JSONu se najde',
    t.some((x) => /automatizovan/.test(x)), JSON.stringify(t));
  pravda('a klíče, krátká slova ani adresy se za text nepočítají',
    !t.some((x) => /^https?:/.test(x)) && !t.some((x) => x === 'Podmínky'), JSON.stringify(t));
  /* A proč se adresa nepočítá: NEMÁ MEZERU. Napsal jsem si na to
     nejdřív zvláštní pravidlo („adresa není text"), jenže sabotáž toho
     řádku nic neshodila — pravidlo bylo mrtvé, protože tohle ho
     předběhne. Měří se tedy ten skutečný důvod. */
  pravda('dlouhá adresa se nepočítá, protože nemá mezeru',
    !t.some((x) => /sazebnik\.pdf/.test(x)), JSON.stringify(t));
  /* Tělo skriptu musí být delší než 80 znaků — kratší vložené skripty
     jsou přepínače a počítadla, ne obsah. Na tom tahle kontrola
     nejdřív padla: samotná ta věta v JSONu má 70 znaků. */
  pravda('a text s mezerou i interpunkcí se počítá',
    P.textZeSkriptu('<script type="application/json">'
      + JSON.stringify({ a: 'Toto je dost dlouhá věta o automatickém přístupu a robotech.',
        b: 'A tady je druhá věta, ať je tělo skriptu delší než osmdesát znaků.' })
      + '</script>').length === 2);
  pravda('celyText vrátí text ze značek I z JSONu, bez zdvojení',
    P.celyText('<p>' + VETA + '</p><script type="application/json">'
      + JSON.stringify({ a: VETA }) + '</script>').length === 1);
  pravda('oAutomatu najde pasáž, i když je obsah jen v JSONu',
    P.oAutomatu(html).length === 1, JSON.stringify(P.oAutomatu(html)));
  /* A DOKLAD MUSÍ MĚŘIT TOTÉŽ, CO SE PROHLEDÁVÁ. Jinak by stránka
     s obsahem v JSONu vyšla jako „málo textu", i když se text našel. */
  const dlouhyJson = '<div id="app"></div><script type="application/json">'
    + JSON.stringify({ t: (VETA + ' ').repeat(120) }) + '</script>';
  const stahni = async (u) => {
    if (/robots\.txt$/.test(u)) return { ok: true, status: 200, text: async () => 'User-agent: *\nAllow: /' };
    if (/podminky/.test(u)) return { ok: true, status: 200, text: async () => dlouhyJson };
    return { ok: true, status: 200, text: async () => '<a href="/podminky">Podmínky</a>' };
  };
  const z = await P.zmerPodminky({ jmeno: 'V JSONu', host: 'j.test', domov: 'https://j.test/' },
    { stahni, ua: UA, mezipamet: new Map() });
  pravda('stránka s obsahem v JSONu se NEVYDÁ za „málo textu"',
    /pasáží o automatick/.test(z.verdikt) && z.znakuCelkem >= P.ZNAKU_NA_PODMINKY,
    JSON.stringify({ verdikt: z.verdikt, znaku: z.znakuCelkem }));
}

console.log('Sonda podmínek: čte jen to, co smí');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb.`);
if (chyb) { console.error(`::error::Sonda podmínek: ${chyb} kontrol neprošlo.${pricinaChyb(zpravy)}`); process.exit(1); }
process.exit(0);
