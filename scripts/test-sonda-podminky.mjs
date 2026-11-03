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
import { deflateSync } from 'node:zlib';
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
    z2.stranky.length === 1 && ((z2.stranky[0] || {}).stav === 'nesmíme číst')
    && /Disallow/.test((z2.stranky[0] || {}).duvod || ''), JSON.stringify(z2.stranky));
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
  /* ČTE SE OBEZŘETNĚ. `z.stranky[0].pasaze` napsané napřímo shodilo
     celý běh výjimkou, když jiná změna způsobila, že se žádná stránka
     nenačetla — a místo hlášení „tahle kontrola padla" nevypsala
     zkouška vůbec nic. Hlídač, který selže pádem, neřekne proč. */
  const s1 = (z.stranky || [])[0] || {};
  const p1 = s1.pasaze || [];
  pravda('povolený web se přečte a pasáže o automatu jsou v nálezu',
    /přečteno \(1 pasáží/.test(z.verdikt) && p1.length === 1
    && /automatizovan/.test((p1[0] || {}).text || ''),
    JSON.stringify(z.verdikt) + ', stránek ' + (z.stranky || []).length + ', pasáží ' + p1.length);
  pravda('a odstavec, který s automatem nesouvisí, se nepřipojí',
    p1.length > 0 && !p1.some((p) => /občanským/.test(p.text)), JSON.stringify(p1));
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
    (zNic.stranky[0] || {}).znaku >= P.ZNAKU_NA_STRANKU
    && (zNic.stranky[0] || {}).odstavcuCelkem >= 1,
    JSON.stringify({ stranek: (zNic.stranky || []).length, znaku: (zNic.stranky[0] || {}).znaku,
      odstavcu: (zNic.stranky[0] || {}).odstavcuCelkem }));
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
    /málo textu/.test(zPrazdna.verdikt)
    && /málo textu/.test((zPrazdna.stranky[0] || {}).stav || ''),
    JSON.stringify({ verdikt: zPrazdna.verdikt, stranek: (zPrazdna.stranky || []).length,
      stav: (zPrazdna.stranky[0] || {}).stav }));
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
  const zakazy = c.filter((x) => x.proc === 'zákaz');
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
    (k.find((x) => x.jmeno === 'Slibný') || {}).proc === 'slibný kandidát', JSON.stringify(k));
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

  /* PODMÍNKY SE PTAJÍ TAM, KDE OBSAH JE. Naměřeno 3. 11.: ÚZSVM má
     v registru `nabidkamajetku.cz`, ale nabídky jsou až na
     `nabidkamajetku.gov.cz` (§355). Ptát se na práva ke skořápce
     znamená ptát se na web, ze kterého nic brát nebudeme. */
  const sSousedem = { updated: '2026-11-03', zdroje: [
    { jmeno: 'Úřad', host: 'u.cz', stav: 'kandidát', robots: 'dovoluje', slibuje: 'slibné',
      sousedniDomena: { url: 'https://u.gov.cz/', bylo: 'skořápka', je: 'slibné', cteno: 'prohlížečem' } },
    { jmeno: 'Soused nepomohl', host: 'n.cz', stav: 'kandidát', robots: 'dovoluje', slibuje: 'slibné',
      sousedniDomena: { url: 'https://n.gov.cz/', je: 'skořápka', nepomohlo: true } },
    { jmeno: 'Soused zakazuje', host: 'z.cz', stav: 'kandidát', robots: 'dovoluje', slibuje: 'slibné',
      sousedniDomena: { url: 'https://z.gov.cz/', zakazano: true, duvod: 'Disallow: /' } },
  ] };
  const cs = P.cilePodminek(sSousedem);
  pravda('podmínky se čtou na doméně, kde nabídky opravdu jsou',
    cs[0] && cs[0].host === 'u.gov.cz' && /u\.gov\.cz/.test(cs[0].domov || ''),
    JSON.stringify(cs[0]));
  /* DRUHÝ CÍL: PŮVODNÍ WEB Z REGISTRU. Přepsat hosta na sousední
     doménu je správné kvůli OBSAHU, ale podmínky tím přestaly mít kde
     být. Naměřeno 3. 11. u ÚZSVM: domovská stránka aplikace
     nabidkamajetku.gov.cz se vykreslila, našla NULA odkazů (jen google
     a googletagmanager) a verdikt zněl „odkaz na podmínky se na
     domovské stránce nenašel". Právní stránky organizace v aplikaci
     skoro nikdy nejsou — bývají na webu, který ji provozuje. */
  const uzsvm = cs.filter((c) => c.jmeno.startsWith('Úřad'));
  pravda('u kandidáta na sousední doméně se čtou OBA weby',
    uzsvm.length === 2 && uzsvm.some((c) => c.host === 'u.gov.cz')
      && uzsvm.some((c) => c.host === 'u.cz'),
    JSON.stringify(uzsvm));
  pravda('a je u nich poznat, který je který',
    !!uzsvm.find((c) => c.host === 'u.cz' && /registru/.test(c.jmeno)),
    'jinak dostane vlastník dva verdikty a neví, kde který platí');
  pravda('druhý cíl má domovskou adresu z TOHO hosta, ne z druhého',
    !!uzsvm.find((c) => c.host === 'u.cz' && /\/\/(www\.)?u\.cz/.test(c.domov || '')),
    JSON.stringify(uzsvm.map((c) => c.domov)));
  /* A KDE SE HOST NEPŘEPSAL, DRUHÝ CÍL NENÍ. Jinak by se každý
     kandidát čistě navíc načítal dvakrát a cizí weby by dostaly
     dvojnásobek dotazů za nic. */
  const nepomohl = cs.filter((c) => c.jmeno.startsWith('Soused nepomohl'));
  const zakazuje = cs.filter((c) => c.jmeno.startsWith('Soused zakazuje'));
  pravda('a kde soused nepomohl nebo zakazuje, zůstává původní adresa',
    nepomohl.length === 1 && nepomohl[0].host === 'n.cz'
      && zakazuje.length === 1 && zakazuje[0].host === 'z.cz',
    JSON.stringify([nepomohl, zakazuje]));
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
      && /automatizovan/.test((((z.stranky[0] || {}).pasaze || [])[0] || {}).text || ''),
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

/* ---- 6) PASÁŽ MUSÍ BÝT O PŘÍSTUPU, NE JEN OBSAHOVAT SLOVO -------
   Fixtury jsou SKUTEČNÉ věty z běhu 3. 11., kdy sonda našla devět
   pasáží a pravdivá byla nula. */
{
  const SKUTECNE_FALESNE = [
    ['odkaz na ověření e-mailu (drazby.policenm.cz)',
      'Po odeslání registračního formuláře je zapotřebí ověřit e-mailovou adresu.'
      + ' Odkaz pro ověření e-mailové adresy se automaticky odeslán do registračního e-mailu.'],
    ['prodloužení dražby (verejnedrazby.cz)',
      'Učiní-li účastník (navýšení) příhoz v době 2 minuty před okamžikem stanoveného'
      + ' ukončení výběrového řízení, prodlužuje se výběrové řízení automaticky o dalších 5 minut.'],
    ['log příhozů (drazby.policenm.cz)',
      'Podání (příhozy) Účastníků elektronické dražby a průběh elektronické dražby jsou'
      + ' zapisovány do tzv. Logu dražby. Dražební systém eviduje podání s přesným časem.'],
    ['adresa api.* v odstavci o pokutách (Bezrealitky)',
      'Pokuta slouží pouze k úplnému omezení zadávání nabídek ze strany realitních kanceláří'
      + ' a realitních makléřů. Smluvní podmínky jsme pro Vás rozdělili dle jednotlivých služeb,'
      + ' aby se Vám v nich lépe orientovalo. Více na https://api.bezrealitky.cz/page-file/ ano.'],
  ];
  for (const [kde, veta] of SKUTECNE_FALESNE) {
    const r = P.oAutomatu('<p>' + veta + '</p>');
    pravda(`nepočítá se jako pasáž: ${kde}`,
      r.every((x) => x.kontext === false),
      JSON.stringify(r.map((x) => ({ s: x.slovo, k: x.kontext }))));
  }
  const skutecny = P.oAutomatu('<p>Je zakázáno obsah serveru vytěžovat automatizovanými'
    + ' prostředky, zejména roboty a skripty, bez předchozího písemného souhlasu.</p>');
  pravda('ale opravdový zákaz se jako pasáž POČÍTÁ',
    skutecny.length >= 1 && skutecny.some((x) => x.kontext === true),
    JSON.stringify(skutecny.map((x) => ({ s: x.slovo, k: x.kontext }))));

  /* JSON z moderního webu: „api" se v něm najde vždycky a neznamená nic. */
  pravda('jeKod pozná JSON a jména tříd',
    P.jeKod('…iod":10,"children":["$","$L1d",null,{"data-api":"/_stats/plausible/api/e') === true
    && P.jeKod('Je zakázáno vytěžovat obsah serveru roboty.') === false);
  /* A HLAVNĚ: ať se to opravdu POUŽIJE. První podoba téhle kontroly
     zkoušela jen samotnou funkci, takže sabotáž „jeKod nic nezahodí"
     prošla zeleně — hlídal jsem nástroj, ne práci. Měří se proto celá
     cesta, na SKUTEČNÉM kusu JSONu z drazbynaxos.cz. */
  /* Blok stojí jako TEXT STRÁNKY, ne ve <script>: tak se k pasážím
     opravdu dostal (odstranění značek nechá obsah skriptu v textu),
     a navíc musí mít MEZERY, jinak ho zahodí už textZeSkriptu.
     Napoprvé jsem ho dal do <script> bez mezer — sabotáž pak prošla,
     protože fixtura k měřenému místu vůbec nedolezla. */
  const jsonBlok = '<p>iod":10,"children":["$","$L1d",null,{"enabled":false,"children":'
    + '["$","body",null,{"className":"lato_1f345234-module__u2d25a__className bg-slate-700'
    + ' antialiased flex flex-col min-h-screen overscroll-none","children":[["$","$L1f",null,'
    + '{"data-domain":"drazbynaxos.cz","data-api":"/_stats/plausible/api/event"}]]}]}]</p>';
  pravda('a JSON se k pasážím vůbec nedostane',
    P.oAutomatu(jsonBlok).length === 0, JSON.stringify(P.oAutomatu(jsonBlok)).slice(0, 180));

  /* ZNAČKY SE DO VÝSEKU NESMÍ DOSTAT: text ze skriptu je nese. */
  const zeSkriptu = '<script>window.X={"t":"<p>Je zakázáno vytěžovat obsah serveru'
    + ' automatizovanými prostředky.</p> <h3>Další</h3>"}</script>';
  const r2 = P.oAutomatu(zeSkriptu);
  pravda('pasáž z textu ve skriptu se najde',
    r2.some((x) => x.kontext === true), JSON.stringify(r2));
  pravda('a nenese v sobě značky (člověk to čte)',
    r2.every((x) => !/<\/?\w+>/.test(x.text)), JSON.stringify(r2.map((x) => x.text.slice(0, 60))));
}

/* ---- 7) STRÁNKA, KTERÁ SE SKLÁDÁ AŽ V PROHLÍŽEČI ----------------
   Naměřeno 3. 11.: tak skončily podmínky Bezrealitek i
   elektronickedrazby.cz („málo textu — vykresluje se až v prohlížeči").
   Prohlížeč se SEM PODSTRKUJE, ať se dá změřit rozhodování, ne
   Chromium. Že opravdový prohlížeč text přečte a drží robots.txt
   i u podřízených souborů, měří test-cti-prohlizecem naostro. */
{
  const CHUDE = '<html><body><p>Načítám…</p><a href="/podminky">Podmínky</a></body></html>';
  /* POZOR NA PRECEDENCI: `.repeat()` se váže na POSLEDNÍ literál, ne
     na celý součet. Napoprvé mi tím fixtura vyšla na 1 500 znaků
     místo 2 400, spadla pod mez „málo textu" a kontrola „u stránky,
     která text dala sama, se prohlížeč nepustí" padala na dobrém kódu.
     Proto závorka a proto se délka hned kontroluje. */
  const VETA_ZAKAZ = 'Je zakázáno obsah serveru vytěžovat automatizovanými'
    + ' prostředky, zejména roboty a skripty. ';
  const BOHATE = '<html><body><p>' + VETA_ZAKAZ.repeat(30) + '</p></body></html>';
  pravda('bohatá fixtura je opravdu nad mezí „málo textu"',
    P.celyText(BOHATE).join('').replace(/\s/g, '').length > P.ZNAKU_NA_STRANKU,
    'má ' + P.celyText(BOHATE).join('').replace(/\s/g, '').length
    + ', mez je ' + P.ZNAKU_NA_STRANKU);
  const stahni = async (u) => {
    if (/robots\.txt$/.test(u)) return { ok: true, status: 200, text: async () => 'User-agent: *\nAllow: /' };
    return { ok: true, status: 200, text: async () => CHUDE };
  };
  const cil = { jmeno: 'Skládá skript', host: 's.test', domov: 'https://s.test/' };

  const bez = await P.zmerPodminky(cil, { stahni, ua: UA, mezipamet: new Map() });
  pravda('bez prohlížeče zůstane „málo textu" (jinak by se nic neměřilo)',
    /málo textu/.test(bez.verdikt), bez.verdikt);

  const volane = [];
  const vykresli = async (url) => { volane.push(url); return { html: BOHATE, zablokovano: 2, cizich: 3 }; };
  const s2 = await P.zmerPodminky(cil, { stahni, ua: UA, mezipamet: new Map(), vykresli });
  pravda('s prohlížečem se pasáž o zákazu najde',
    /přečteno \(/.test(s2.verdikt), s2.verdikt);
  const prvni = (s2.stranky || [])[0] || {};
  pravda('a v nálezu stojí, že se čtelo prohlížečem',
    prvni.cteno === 'prohlížečem', JSON.stringify({ cteno: prvni.cteno, v: prvni.vykresleno }));
  pravda('i kolik znaků to přineslo a kolik se zahodilo kvůli robots.txt',
    prvni.vykresleno && prvni.vykresleno.je > prvni.vykresleno.bylo
    && prvni.vykresleno.zablokovano === 2 && prvni.vykresleno.cizich === 3,
    JSON.stringify(prvni.vykresleno));

  /* CO NEPŘINESLO VÍC, SE NEBERE — ať nález netvrdí víc práce, než
     se udělalo. */
  const s3 = await P.zmerPodminky(cil, { stahni, ua: UA, mezipamet: new Map(),
    vykresli: async () => ({ html: '<html><body><p>Taky nic.</p></body></html>' }) });
  pravda('vykreslení, které nepřineslo víc textu, se nebere',
    ((s3.stranky || [])[0] || {}).cteno === 'ze serveru',
    JSON.stringify((s3.stranky || [])[0] || {}).slice(0, 160));

  /* PÁD PROHLÍŽEČE NESMÍ SHODIT SONDU — a má být v nálezu vidět. */
  const s4 = await P.zmerPodminky(cil, { stahni, ua: UA, mezipamet: new Map(),
    vykresli: async () => { throw new Error('prohlížeč nenaběhl'); } });
  pravda('pád prohlížeče sondu neshodí a zapíše se',
    /málo textu/.test(s4.verdikt)
    && /nenaběhl/.test((((s4.stranky || [])[0] || {}).vykresleno || {}).chyba || ''),
    JSON.stringify((s4.stranky || [])[0] || {}).slice(0, 200));

  /* A KDE TEXT JE, PROHLÍŽEČ SE NEPOUŠTÍ. Jeden běh prohlížeče na
     adresu by u šesti cílů znamenal desítky zbytečných spuštění. */
  /* DOMOVSKÁ STRÁNKA MUSÍ MÍT ODKAZ NA PODMÍNKY, jinak se sonda vrátí
     s „odkaz se nenašel" a smyčka stránek se vůbec nespustí — kontrola
     pod tím by pak byla planá. Naletěl jsem na to: sabotáž „prohlížeč
     se pouští vždycky" napoprvé prošla zeleně právě proto. */
  const BOHATE_DOMOV = BOHATE.replace('</body>', '<a href="/podminky">Podmínky</a></body>');
  const stahniBohate = async (u) => {
    if (/robots\.txt$/.test(u)) return { ok: true, status: 200, text: async () => 'User-agent: *\nAllow: /' };
    if (/\/podminky$/.test(u)) return { ok: true, status: 200, text: async () => BOHATE };
    return { ok: true, status: 200, text: async () => BOHATE_DOMOV };
  };
  const kolik = [];
  await P.zmerPodminky(cil, { stahni: stahniBohate, ua: UA, mezipamet: new Map(),
    vykresli: async (u) => { kolik.push(u); return { html: BOHATE }; } });
  pravda('u stránky, která text dala sama, se prohlížeč vůbec nepustí',
    kolik.length === 0, 'pustil se na: ' + kolik.join(', '));
  pravda('a jinak se pustí jen na tu chudou adresu', volane.length >= 1, JSON.stringify(volane));
}

/* ---- 7a) ODKAZ NA DOMOVSKOU STRÁNKU SAMU SE NEBERE --------------
   NALEZENO MĚŘENÍM 3. 11. U ÚZSVM, a bylo to horší než chybějící
   odkaz. Ve vykresleném domovu „našla" sonda jediný odkaz — vedl na
   domovskou stránku samu, s popisem „Dopravní prostředky a
   příslušenství 74". Stránka se přečetla podruhé a verdikt zněl
   „přečteno, ale nic o automatickém přístupu": tvrzení, že se
   podmínky čely, i když se žádné nečetly. */
{
  pravda('odkaz na domovskou stránku samu se mezi podmínky nepočítá',
    P.odkazyNaPodminky('<a href="/">Dopravní prostředky a příslušenství 74</a>',
      'https://u.gov.cz/').length === 0
    && P.odkazyNaPodminky('<a href="https://u.gov.cz">Pozemky a nabídka majetku</a>',
      'https://u.gov.cz/').length === 0,
    'jinak verdikt tvrdí, že se dívalo tam, kde se nedívalo');
  pravda('ale opravdový odkaz na podmínky se bere dál',
    P.odkazyNaPodminky('<a href="/">Nabídka majetku</a><a href="/obchodni-podminky">Obchodní podmínky</a>',
      'https://u.gov.cz/').map((o) => o.url).join() === 'https://u.gov.cz/obchodni-podminky',
    JSON.stringify(P.odkazyNaPodminky('<a href="/">Nabídka majetku</a><a href="/obchodni-podminky">Obchodní podmínky</a>', 'https://u.gov.cz/')));

  /* A NAOSTRO SKRZ CELOU SONDU: když je ve vykresleném domovu jen
     odkaz na něj samotný, verdikt MUSÍ zůstat „nenašel se" — tohle
     je ta věta, která u ÚZSVM lhala. */
  /* SKOŘÁPKA SE SLOVY O PODMÍNKÁCH V TĚLE. Je to realistické: do
     skořápky bývá vepsaná navigace i patička, takže „Podmínky užití"
     v textu je, jen to není stránka podmínek. A je to tu nutné —
     dokud skořápka ta slova neměla, zastavila ji už kontrola slov
     a srovnání s domovem se nikdy neuplatnilo: sabotáž, která to
     srovnání vyhodila, prošla zeleně. */
  const DOMOV_PRAZDNY2 = '<html><body><div id="app">Podmínky užití · Právní informace · '
    + 'x'.repeat(3000) + '</div></body></html>';
  const DOMOV_SAM = '<html><body><a href="/">Dopravní prostředky a příslušenství 74</a></body></html>';
  const stahni2 = async (u) => {
    if (/robots\.txt$/.test(u)) return { ok: true, status: 200, text: async () => 'User-agent: *\nAllow: /' };
    return { ok: true, status: 200, text: async () => DOMOV_PRAZDNY2 };
  };
  const v = await P.zmerPodminky({ jmeno: 'Sám na sebe', host: 'x.test', domov: 'https://x.test/' },
    { stahni: stahni2, ua: UA, mezipamet: new Map(), vykresli: async () => ({ html: DOMOV_SAM }) });
  pravda('a sonda pak nevydá „přečteno", ale „nenašel se"',
    /odkaz na podmínky se nenašel a není ani na obvyklých adresách/.test(v.verdikt)
    && (v.stranky || []).length === 0,
    v.verdikt + ' / stránek ' + (v.stranky || []).length);
  /* A TOHLE JE TA PODSTATNÁ POLOVINA: tenhle server vrací na KAŽDOU
     adresu tutéž skořápku, tedy i na `/podminky`. Kdyby obvyklé
     adresy stačilo poměřit délkou textu, sonda by první z nich
     prohlásila za podmínky a vydala „přečteno" o stránce, která
     s podmínkami nemá nic společného. Na tom tahle kontrola spadla,
     když jsem to pravidlo napsal jen na délku. */
  pravda('obvyklé adresy se zkusily, a je zapsáno, že to byla táž skořápka',
    (v.zkusenoZnamych || []).length >= 1
    && (v.zkusenoZnamych || []).every(function (x) { return /tatáž stránka jako domov/.test(x.stav); }),
    JSON.stringify(v.zkusenoZnamych));
}

/* ---- 7b) DOMOVSKÁ STRÁNKA, KTERÁ SE SKLÁDÁ AŽ V PROHLÍŽEČI ------
   NALEZENO MĚŘENÍM 3. 11. U ÚZSVM. Sonda u `nabidkamajetku.gov.cz`
   vrátila „odkaz na podmínky se na domovské stránce nenašel" — jenže
   to nebyla pravda o webu: v serverovém HTML nejsou ŽÁDNÉ odkazy,
   protože je vykresluje skript. Vykreslování se do té chvíle pouštělo
   jen na NALEZENÉ stránky, takže na takovém webu hledání skončilo
   hned a nezjistilo nic. */
{
  const VETA = 'Je zakázáno obsah serveru vytěžovat automatizovanými'
    + ' prostředky, zejména roboty a skripty. ';
  const PODMINKY = '<html><body><p>' + VETA.repeat(30) + '</p></body></html>';
  /* Domov BEZ JEDINÉHO ODKAZU — přesně to, co vrací aplikace
     vykreslovaná skriptem. */
  const DOMOV_PRAZDNY = '<html><body><div id="app">' + 'x'.repeat(3000) + '</div></body></html>';
  const DOMOV_S_ODKAZEM = '<html><body><a href="/podminky">Obchodní podmínky</a></body></html>';
  const stahni = async (u) => {
    if (/robots\.txt$/.test(u)) return { ok: true, status: 200, text: async () => 'User-agent: *\nAllow: /' };
    if (/\/podminky$/.test(u)) return { ok: true, status: 200, text: async () => PODMINKY };
    return { ok: true, status: 200, text: async () => DOMOV_PRAZDNY };
  };
  const cil = { jmeno: 'Domov skládá skript', host: 'd.test', domov: 'https://d.test/' };

  const bez = await P.zmerPodminky(cil, { stahni, ua: UA, mezipamet: new Map() });
  /* BEZ PROHLÍŽEČE SE ODKAZ NENAJDE — ale podmínky tu na obvyklé
     adrese `/podminky` OPRAVDU JSOU, takže se najdou tudy. Dřív tady
     stálo, že verdikt zůstane „nenašel se"; to byla pravda o tehdejší
     sondě, ne o tomhle webu. */
  pravda('bez prohlížeče se odkaz nenajde, ale obvyklá adresa podmínky má',
    /přečteno \(/.test(bez.verdikt)
    && (bez.zkusenoZnamych || []).some(function (x) { return x.stav === 'je'; })
    && (bez.nalezeneOdkazy || []).some(function (o) { return o.zeZnamych; }),
    bez.verdikt + ' / ' + JSON.stringify(bez.zkusenoZnamych));

  const naDomov = [];
  const a = await P.zmerPodminky(cil, { stahni, ua: UA, mezipamet: new Map(),
    vykresli: async (u) => { naDomov.push(u); return { html: DOMOV_S_ODKAZEM, zablokovano: 1, cizich: 2 }; } });
  /* OBVYKLÁ ADRESA, KTERÁ EXISTUJE, ALE PODMÍNKY TO NEJSOU. Weby
     odpovídají na neexistující adresu kódem 200 a vlastní stránkou
     („tichá 404") častěji, než by člověk čekal. Taková stránka se od
     domovské liší, takže ji samo srovnání s domovem nezastaví — musí
     ji zastavit to, že v ní o podmínkách nic není. */
  const CIZI = '<html><body><p>' + 'Kontaktujte nás na telefonu. '.repeat(120) + '</p></body></html>';
  const stahniCizi = async (u) => {
    if (/robots\.txt$/.test(u)) return { ok: true, status: 200, text: async () => 'User-agent: *\nAllow: /' };
    if (/\/podminky/.test(u)) return { ok: true, status: 200, text: async () => CIZI };
    return { ok: true, status: 200, text: async () => DOMOV_PRAZDNY };
  };
  const ticha = await P.zmerPodminky({ jmeno: 'Tichá 404', host: 't.test', domov: 'https://t.test/' },
    { stahni: stahniCizi, ua: UA, mezipamet: new Map() });
  pravda('obvyklá adresa bez zmínky o podmínkách se nevezme za podmínky',
    /nenašel/.test(ticha.verdikt)
    && (ticha.zkusenoZnamych || []).some(function (x) { return /o podmínkách v ní nic není/.test(x.stav); }),
    ticha.verdikt + ' / ' + JSON.stringify(ticha.zkusenoZnamych));

  /* A KDE SE ODKAZ NAŠEL, OBVYKLÉ ADRESY SE NEZKOUŠEJÍ. Jinak by
     každý zdroj dostal šest dotazů navíc za nic. */
  const sOdkazem = await P.zmerPodminky(cil, { stahni, ua: UA, mezipamet: new Map(),
    vykresli: async () => ({ html: DOMOV_S_ODKAZEM, zablokovano: 0, cizich: 0 }) });
  pravda('kde se odkaz našel, obvyklé adresy se vůbec nezkoušejí',
    sOdkazem.zkusenoZnamych === undefined,
    JSON.stringify(sOdkazem.zkusenoZnamych));

  pravda('vykreslený domov odkazy najde a podmínky se přečtou',
    /přečteno \(/.test(a.verdikt) && (a.nalezeneOdkazy || []).length >= 1
    && a.domovVykreslen && a.domovVykreslen.odkazu >= 1,
    a.verdikt + ' / ' + JSON.stringify(a.domovVykreslen));
  pravda('a prohlížeč se pustil na domovskou adresu',
    naDomov.includes('https://d.test/'), naDomov.join(' '));

  /* CO NEPOMOHLO, SE PŘIZNÁ. */
  const b = await P.zmerPodminky(cil, { stahni, ua: UA, mezipamet: new Map(),
    vykresli: async () => ({ html: DOMOV_PRAZDNY, zablokovano: 0, cizich: 0 }) });
  /* Verdikt už tu „nenašel se" nebude: po neúspěšném vykreslení sonda
     sáhne na obvyklé adresy a na `/podminky` je tenhle server má.
     Kontroluje se tedy to, o čem tahle zkouška je — že se NEÚSPĚCH
     vykreslení přizná, a ne že se o něm mlčí. */
  pravda('vykreslení domova, které odkazy nenašlo, se přizná',
    b.domovVykreslen && b.domovVykreslen.nepomohlo === true
    && (b.zkusenoZnamych || []).length >= 1,
    b.verdikt + ' / ' + JSON.stringify(b.domovVykreslen));

  /* PÁD PROHLÍŽEČE SONDU NESHODÍ. */
  const c = await P.zmerPodminky(cil, { stahni, ua: UA, mezipamet: new Map(),
    vykresli: async () => { throw new Error('prohlížeč nenaběhl'); } });
  /* Verdikt tu už nebude „nenašel se": po pádu prohlížeče sonda zkusí
     obvyklé adresy a na `/podminky` je tenhle server má. O čem tahle
     kontrola je, zůstává — PÁD SE NESMÍ SPOLKNOUT a běh nesmí skončit
     výjimkou. */
  pravda('pád prohlížeče na domovské stránce sondu neshodí a zapíše se',
    /nenaběhl/.test((c.domovVykreslen || {}).chyba || '') && !!c.verdikt,
    JSON.stringify(c.domovVykreslen) + ' / ' + c.verdikt);

  /* A KDE DOMOV ODKAZY DÁ SÁM, PROHLÍŽEČ SE NA NĚJ NEPOUŠTÍ. */
  const naDomov2 = [];
  const stahniSOdkazem = async (u) => {
    if (/robots\.txt$/.test(u)) return { ok: true, status: 200, text: async () => 'User-agent: *\nAllow: /' };
    if (/\/podminky$/.test(u)) return { ok: true, status: 200, text: async () => PODMINKY };
    return { ok: true, status: 200, text: async () => DOMOV_S_ODKAZEM };
  };
  const d = await P.zmerPodminky(cil, { stahni: stahniSOdkazem, ua: UA, mezipamet: new Map(),
    vykresli: async (u) => { naDomov2.push(u); return { html: DOMOV_S_ODKAZEM }; } });
  pravda('kde domov odkazy dá sám, prohlížeč se na něj nepustí',
    !naDomov2.includes('https://d.test/') && !d.domovVykreslen,
    'pouštěn na: ' + naDomov2.join(' ') + ' / ' + JSON.stringify(d.domovVykreslen));
}

/* ---- 7c) DOKUMENTY SE VYBÍRAJÍ PODLE JMÉNA, NE PODLE POŘADÍ ------
   NALEZENO MĚŘENÍM 3. 11. U verejnedrazby.cz: sonda přečetla tři
   dokumenty a ani jeden nebyly podmínky — byly to přílohy jedné
   dražby (`f_6ae20774c24ec1.46881867.pdf`), protože se brávaly první
   tři v pořadí. Tři stažení megabajtů za odpověď, která nic neřeší;
   a skutečný dražební řád by se při čtyřech odkazech nestáhl vůbec. */
{
  const d = [
    { url: 'https://v.cz/data/A8144/f_6ae20774c24ec1.46881867.pdf', popis: 'Příloha' },
    { url: 'https://v.cz/data/A8144/f_6ae20774eae839.pdf', popis: '' },
    { url: 'https://v.cz/pdf/Dra%C5%BEebn%C3%AD%20%C5%99%C3%A1d.pdf', popis: 'Dražební řád' },
    { url: 'https://v.cz/x/obchodni-podminky.pdf', popis: '' },
  ];
  const v = P.vyberDokumenty(d).map((u) => u.split('/').pop());
  pravda('dokument, který se jmenuje jako podmínky, jde první',
    /Dra|obchodni-podminky/.test(v[0] || '') && /Dra|obchodni-podminky/.test(v[1] || ''),
    JSON.stringify(v));
  pravda('a příloha dražby se nevyhazuje, jen jde na konec',
    v.length === 4 && /^f_/.test(v[2]) && /^f_/.test(v[3]),
    'u zdroje, kde žádný odkaz jménem nevypadá, je lepší přečíst cokoli než nic: '
    + JSON.stringify(v));
  pravda('pozná se i dražební řád a VOP, ne jen slovo „podmínky"',
    P.SLOVA_DOKUMENT.test('Dražební řád - 8.3.2025.pdf')
    && P.SLOVA_DOKUMENT.test('vop.pdf')
    && P.SLOVA_DOKUMENT.test('provozní řád')
    && !P.SLOVA_DOKUMENT.test('f_6ae20774c24ec1.46881867.pdf'),
    'řád a VOP jsou podmínky, i když se slovo „podmínky" nikde nevyskytuje');
  pravda('a stejná adresa se nečte dvakrát',
    P.vyberDokumenty([{ url: 'https://v.cz/a.pdf' }, { url: 'https://v.cz/a.pdf' }]).length === 1);
}

/* ---- 8) PODMÍNKY V DOKUMENTU SE OPRAVDU PŘEČTOU -----------------
   NALEZENO MĚŘENÍM 3. 11. U TŘÍ ZDROJŮ. Sonda skončila u odkazu a
   věty „text je nejspíš v odkazovaném dokumentu" — Bezrealitky 5 PDF,
   elektronickedrazby.cz dražební řád, verejnedrazby.cz 3 PDF. Odkaz
   není odpověď na „smělo by se to čist?", je to domácí úkol pro
   člověka. Čtečka je scripts/cti-pdf.mjs (bez nové závislosti) a tady
   se měří, že ji sonda opravdu použije — a za jakých podmínek. */
{
  const VETA_PDF = 'Je zakázáno obsah serveru vytěžovat automatizovanými prostředky, zejména roboty.';
  /* Opravdové PDF, ne podstrčený text: kdyby se čtečka rozbila,
     musí to tahle zkouška poznat. */
  /* VĚTA SE DO PDF ZAPISUJE V cp1250, ne jako latin1. Napoprvé jsem
     ji zapsal přes `Buffer.from(…, 'latin1')` — česká diakritika se
     tím rozsypala, čtečka ji přečetla jako cizí písmena a pasáž se
     našla jen na ASCII slově „roboty". Kontrola to odhalila, protože
     si ověřuje KONKRÉTNÍ slovo, ne jen „něco se našlo".
     (Stojí za zmínku, že `citelnost()` tohle nezachytí: z latin1 i
     z cp1250 vyjdou platná písmena, jen jiná. Hlídá rozsypaný čaj,
     ne záměnu dvou podobných kódování.) */
  const CP1250 = { 'á': 0xe1, 'č': 0xe8, 'ď': 0xef, 'é': 0xe9, 'ě': 0xec, 'í': 0xed, 'ň': 0xf2,
    'ó': 0xf3, 'ř': 0xf8, 'š': 0x9a, 'ť': 0x9d, 'ú': 0xfa, 'ů': 0xf9, 'ý': 0xfd, 'ž': 0x9e,
    'Á': 0xc1, 'Č': 0xc8, 'É': 0xc9, 'Ě': 0xcc, 'Í': 0xcd, 'Ř': 0xd8, 'Š': 0x8a,
    'Ú': 0xda, 'Ů': 0xd9, 'Ý': 0xdd, 'Ž': 0x8e };
  const vCp1250 = (txt) => Buffer.from([...txt].map((ch) =>
    CP1250[ch] != null ? CP1250[ch] : (ch.charCodeAt(0) & 0xff)));
  const pdfSVetou = (veta) => {
    const obsah = Buffer.concat([Buffer.from('BT /F1 12 Tf (', 'latin1'),
      vCp1250(veta), Buffer.from(') Tj ET\n', 'latin1')]);
    const telo = deflateSync(obsah);
    return Buffer.concat([
      Buffer.from('%PDF-1.4\n4 0 obj\n<< /Length ' + telo.length + ' /Filter /FlateDecode >>\nstream\n', 'latin1'),
      telo, Buffer.from('\nendstream\nendobj\n%%EOF\n', 'latin1'),
    ]);
  };
  const PDF_ZAKAZ = pdfSVetou(VETA_PDF);
  /* „Sken": PDF bez jediného textového operátoru. */
  const PDF_SKEN = (() => {
    const obsah = Buffer.from('q 612 0 0 792 0 0 cm /Im0 Do Q\n', 'latin1');
    const telo = deflateSync(obsah);
    return Buffer.concat([
      Buffer.from('%PDF-1.4\n4 0 obj\n<< /Length ' + telo.length + ' /Filter /FlateDecode >>\nstream\n', 'latin1'),
      telo, Buffer.from('\nendstream\nendobj\n%%EOF\n', 'latin1'),
    ]);
  })();
  const DOMOV = '<html><body><a href="/podminky">Obchodní podmínky</a></body></html>';
  const STRANKA = '<html><body><p>Vítejte na stránce.</p>'
    + '<a href="/radek.pdf">Dražební řád</a></body></html>';
  const cil = { jmeno: 'Vše v PDF', host: 'p.test', domov: 'https://p.test/' };

  const udelejStahni = (pdf, robotsPdf) => {
    const chozeno = [];
    const fn = async (u) => {
      chozeno.push(u);
      if (/robots\.txt$/.test(u)) {
        return { ok: true, status: 200,
          text: async () => robotsPdf || 'User-agent: *\nAllow: /' };
      }
      if (/\.pdf$/.test(u)) {
        return { ok: true, status: 200, arrayBuffer: async () => pdf,
          text: async () => 'binární' };
      }
      if (/\/podminky$/.test(u)) return { ok: true, status: 200, text: async () => STRANKA };
      return { ok: true, status: 200, text: async () => DOMOV };
    };
    return { fn, chozeno };
  };

  /* a) PDF se přečte a zákaz se najde. */
  {
    const { fn } = udelejStahni(PDF_ZAKAZ);
    const z = await P.zmerPodminky(cil, { stahni: fn, ua: UA, mezipamet: new Map() });
    const dok = (z.stranky || []).find((x) => x.jeDokument);
    pravda('zákaz v PDF se najde a dostane se do verdiktu',
      /přečteno \(/.test(z.verdikt) && !!dok && dok.stav === 'přečteno'
      && (dok.pasaze || []).some((a) => /vytěžovat/.test(a.text)),
      z.verdikt + ' / ' + JSON.stringify(dok && { stav: dok.stav, znaku: dok.znaku, citelnost: dok.citelnost }));
    pravda('a v nálezu stojí, že se čtelo z dokumentu',
      !!dok && dok.cteno === 'z dokumentu' && dok.citelnost >= 0.9,
      JSON.stringify(dok && { cteno: dok.cteno, citelnost: dok.citelnost }));
  }

  /* b) ROBOTS.TXT PLATÍ NA DOKUMENT ZVLÁŠŤ. U Bezrealitek je to celý
        rozdíl: jejich PDF bydlí na api.bezrealitky.cz s Disallow: /.
        Zakázaný dokument se nesmí STÁHNOUT, ne jen nepoužít. */
  {
    const { fn, chozeno } = udelejStahni(PDF_ZAKAZ, 'User-agent: *\nDisallow: /radek.pdf');
    const z = await P.zmerPodminky(cil, { stahni: fn, ua: UA, mezipamet: new Map() });
    const dok = (z.stranky || []).find((x) => x.jeDokument);
    pravda('zakázaný dokument se nestáhne a zákaz je v nálezu',
      !!dok && dok.stav === 'nesmíme číst' && /Disallow/.test(dok.duvod || '')
      && !chozeno.some((u) => /\.pdf$/.test(u) && !/robots/.test(u)),
      JSON.stringify(dok) + ' / chozeno: ' + chozeno.filter((u) => !/robots/.test(u)).join(' '));
    pravda('a verdikt z něj nic netvrdí',
      !/přečteno \(/.test(z.verdikt), z.verdikt);
  }

  /* c) SKEN SE PŘIZNÁ. Naskenovaný papír text neobsahuje — a „nic
        o automatu se nenašlo" by u něj byla lež, ne nález. */
  {
    const { fn } = udelejStahni(PDF_SKEN);
    const z = await P.zmerPodminky(cil, { stahni: fn, ua: UA, mezipamet: new Map() });
    const dok = (z.stranky || []).find((x) => x.jeDokument);
    pravda('z naskenovaného dokumentu se nic netvrdí, přizná se',
      !!dok && dok.stav === 'nepřečetli jsme ho' && /sken|není text/.test(dok.duvod || ''),
      JSON.stringify(dok));
  }

  /* c2) NEČITELNÝ TEXT SE NESMÍ VYDÁVAT ZA PŘEČTENÝ. Tohle je ta
         kontrola, kvůli které `PRAH_CITELNOSTI` existuje — a napoprvé
         jsem ji neměl: sabotáž „mez na čitelnost zrušena" prošla
         zeleně, protože žádná fixtura mojibake nevyrobila. Dvoubajtové
         kódy BEZ ToUnicode tabulky ho vyrobí přesně tak, jak to dělají
         opravdová PDF s fontem Identity-H. */
  {
    const obsah = Buffer.from('BT /F1 12 Tf <0048004900480049004800490048004900480049> Tj ET\n', 'latin1');
    const telo = deflateSync(obsah);
    const PDF_MOJIBAKE = Buffer.concat([
      Buffer.from('%PDF-1.4\n4 0 obj\n<< /Length ' + telo.length + ' /Filter /FlateDecode >>\nstream\n', 'latin1'),
      telo, Buffer.from('\nendstream\nendobj\n%%EOF\n', 'latin1'),
    ]);
    const { fn } = udelejStahni(PDF_MOJIBAKE);
    const z = await P.zmerPodminky(cil, { stahni: fn, ua: UA, mezipamet: new Map() });
    const dok = (z.stranky || []).find((x) => x.jeDokument);
    pravda('nečitelný text se přizná, nevydává se za „nic o automatu"',
      !!dok && dok.stav === 'nepřečetli jsme ho' && /čitelnost/.test(dok.duvod || '')
      && dok.citelnost < P.PRAH_CITELNOSTI,
      JSON.stringify(dok));
    pravda('a mez na čitelnost je vysoko (text se bere jen hodnověrný)',
      P.PRAH_CITELNOSTI >= 0.8 && P.PRAH_CITELNOSTI <= 1,
      String(P.PRAH_CITELNOSTI));
  }

  /* c3) A NAOSTRO SKRZ CELOU SONDU: tři přílohy a jedny podmínky,
         strop je tři. Kdyby se bralo pořadí, podmínky by se vůbec
         nestáhly — a to je přesně ten případ verejnedrazby.cz. */
  {
    const ODKAZY = '<html><body><p>Vítejte.</p>'
      + '<a href="/data/f_6ae20774c24ec1.pdf">Příloha</a>'
      + '<a href="/data/f_6ae20774eae839.pdf">Příloha</a>'
      + '<a href="/data/f_6ae20775443a98.pdf">Příloha</a>'
      + '<a href="/pdf/obchodni-podminky.pdf">Obchodní podmínky</a>'
      + '</body></html>';
    const chozeno = [];
    const fn = async (u) => {
      chozeno.push(u);
      if (/robots\.txt$/.test(u)) return { ok: true, status: 200, text: async () => 'User-agent: *\nAllow: /' };
      if (/obchodni-podminky\.pdf$/.test(u)) {
        return { ok: true, status: 200, arrayBuffer: async () => PDF_ZAKAZ, text: async () => 'b' };
      }
      if (/\.pdf$/.test(u)) return { ok: true, status: 200, arrayBuffer: async () => PDF_SKEN, text: async () => 'b' };
      if (/\/podminky$/.test(u)) return { ok: true, status: 200, text: async () => ODKAZY };
      return { ok: true, status: 200, text: async () => DOMOV };
    };
    const z = await P.zmerPodminky(cil, { stahni: fn, ua: UA, mezipamet: new Map() });
    pravda('podmínky se stáhnou i když jsou v odkazech čtvrté ze čtyř',
      chozeno.some((u) => /obchodni-podminky\.pdf$/.test(u)) && /přečteno \(/.test(z.verdikt),
      z.verdikt + ' / stažené: '
      + chozeno.filter((u) => /\.pdf$/.test(u)).map((u) => u.split('/').pop()).join(' '));
  }

  /* d) STROP NA POČET DOKUMENTŮ. Jeden zdroj jich může odkazovat deset
        a každý je stažení megabajtů. */
  {
    const MNOHO = '<html><body><p>Vítejte.</p>'
      + Array.from({ length: 6 }, (_, i) => `<a href="/d${i}.pdf">Dokument ${i}</a>`).join('')
      + '</body></html>';
    const chozeno = [];
    const fn = async (u) => {
      chozeno.push(u);
      if (/robots\.txt$/.test(u)) return { ok: true, status: 200, text: async () => 'User-agent: *\nAllow: /' };
      if (/\.pdf$/.test(u)) return { ok: true, status: 200, arrayBuffer: async () => PDF_ZAKAZ, text: async () => 'b' };
      if (/\/podminky$/.test(u)) return { ok: true, status: 200, text: async () => MNOHO };
      return { ok: true, status: 200, text: async () => DOMOV };
    };
    const z = await P.zmerPodminky(cil, { stahni: fn, ua: UA, mezipamet: new Map() });
    const dokumentu = (z.stranky || []).filter((x) => x.jeDokument).length;
    const stazenych = chozeno.filter((u) => /\.pdf$/.test(u) && !/robots/.test(u)).length;
    pravda(`dokumentů se přečte nejvýš ${P.DOKUMENTU_NA_ZDROJ}`,
      dokumentu === P.DOKUMENTU_NA_ZDROJ && stazenych <= P.DOKUMENTU_NA_ZDROJ,
      `v nálezu ${dokumentu}, stažených ${stazenych}, na stránce 6`);
    pravda('a strop je malý (jeden zdroj není archiv)',
      P.DOKUMENTU_NA_ZDROJ <= 5, String(P.DOKUMENTU_NA_ZDROJ));
  }
}

console.log('Sonda podmínek: čte jen to, co smí');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb.`);
if (chyb) { console.error(`::error::Sonda podmínek: ${chyb} kontrol neprošlo.${pricinaChyb(zpravy)}`); process.exit(1); }
process.exit(0);
