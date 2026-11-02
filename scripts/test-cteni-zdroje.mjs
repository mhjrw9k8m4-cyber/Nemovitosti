// Test: změna na cizím webu nesmí zavřít zdroj.
//
// Spuštění: node scripts/test-cteni-zdroje.mjs   (bez prohlížeče, bez sítě)
//
// Stahovač zná jednu cestu: adresu a tvar odpovědi. Když zdroj přestaví
// web, ta cesta se zavře. scripts/cteni-zdroje.mjs je druhá cesta a je
// schválně postavená tak, aby na vzhledu nezávisela — čte JSON-LD
// (schema.org), mikrodata a nakonec POUHÉ SIGNÁLY: odkaz, u kterého je
// cena a výměra.
//
// Měří se to na téže nabídce ve čtyřech podobách: původní stránka,
// přestavěná (jiné třídy, jiná struktura), přestavěná bez JSON-LD
// a stránka s mikrodaty. Ze všech musí vypadnout táž nabídka — jinak
// je ta „druhá cesta" jen další cesta, která se zavře stejně snadno.
//
// A hlídá se i opačná chyba: na stránce, kde nabídky NEJSOU, si čtení
// nesmí nic vymyslet. Výpis s jednou cenou v hlavičce a bez výměr není
// nabídka a vydávat ho za ni by bylo horší než prázdno.

let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
const C = await import('./cteni-zdroje.mjs');
const ZAKLAD = 'https://priklad.test/pozemky';

/* ---- vzorky: TÁŽ dvojice nabídek ve čtyřech podobách stránky ----- */
/* Čísla jsou schválně různá, ať se pozná, že se nabídky nespletly. */
const NAB = [
  { url: 'https://priklad.test/detail/1', cena: 1250000, vymera: 1480, nazev: 'Stavební pozemek Lhota' },
  { url: 'https://priklad.test/detail/2', cena: 390000, vymera: 15000, nazev: 'Zahrada Újezd' },
];

const jsonLdBlok = JSON.stringify({
  '@context': 'https://schema.org', '@type': 'ItemList',
  itemListElement: NAB.map((n, i) => ({
    '@type': 'ListItem', position: i + 1,
    item: {
      '@type': 'Product', name: n.nazev, url: n.url,
      floorSize: { '@type': 'QuantitativeValue', value: n.vymera, unitCode: 'MTK' },
      offers: { '@type': 'Offer', price: n.cena, priceCurrency: 'CZK' },
    },
  })),
});

const puvodni = `<!doctype html><html><head><title>Pozemky</title>
<script type="application/ld+json">${jsonLdBlok}</script></head><body>
<ul class="vypis">${NAB.map((n) => `
  <li class="karta"><a class="karta-odkaz" href="${n.url.replace('https://priklad.test', '')}">${n.nazev}</a>
    <span class="cena">${n.cena.toLocaleString('cs-CZ')} Kč</span>
    <span class="vymera">${n.vymera.toLocaleString('cs-CZ')} m²</span></li>`).join('')}
</ul></body></html>`;

/* PŘESTAVĚNÁ STRÁNKA. Jiné značky, jiné třídy, jiné pořadí údajů
   (cena NAD odkazem), jiné obaly — tedy přesně to, co udělá redesign. */
const prestavena = `<!doctype html><html><head>
<script type="application/ld+json">${jsonLdBlok}</script></head><body>
<main data-v="2"><div class="x9f">${NAB.map((n) => `
  <article class="q1 q2"><header><b>${n.cena.toLocaleString('cs-CZ')},-</b>
  <i>${(n.vymera / 10000).toLocaleString('cs-CZ')} ha</i></header>
  <h3><a href="${n.url}" class="zz">${n.nazev}</a></h3></article>`).join('')}
</div></main></body></html>`;

const prestavenaBezLd = prestavena.replace(/<script[\s\S]*?<\/script>/i, '');

const sMikrodaty = `<!doctype html><html><body>${NAB.map((n) => `
  <div itemscope itemtype="https://schema.org/Product">
    <a href="${n.url}" itemprop="url"><span itemprop="name">${n.nazev}</span></a>
    <meta itemprop="price" content="${n.cena}">
    <span>${n.vymera.toLocaleString('cs-CZ')} m²</span>
  </div>`).join('')}</body></html>`;

/* ---- 1) čísla z textu ------------------------------------------- */
{
  pravda('cena se přečte s mezerami i bez nich',
    C.cenaZTextu('1 250 000 Kč') === 1250000 && C.cenaZTextu('1250000Kč') === 1250000);
  pravda('a v podobě „1 250 000,-" taky', C.cenaZTextu('cena 1 250 000,- za celek') === 1250000);
  pravda('a s nedělitelnou mezerou, jak ji sází náš web',
    C.cenaZTextu('1 250 000 Kč') === 1250000);
  pravda('číslo bez jednotky se za cenu nebere',
    C.cenaZTextu('inzerát 1250000') === null && C.cenaZTextu('PSČ 25063') === null,
    'jinak by se za cenu vydalo číslo inzerátu');
  pravda('nesmyslně nízká cena se nebere', C.cenaZTextu('5 Kč') === null);
  pravda('výměra se přečte v m² i v hektarech',
    C.vymeraZTextu('1 480 m²') === 1480 && C.vymeraZTextu('1,5 ha') === 15000);
  pravda('a „m2" je totéž jako „m²"', C.vymeraZTextu('820 m2') === 820);
  pravda('výměra bez jednotky se nebere', C.vymeraZTextu('rok 2026') === null);
}

/* ---- 2) táž nabídka ze čtyř podob stránky ----------------------- */
function sedi(nabidky, popisStranky, cestaOcek) {
  const podleUrl = new Map(nabidky.map((n) => [n.url.replace(/\/$/, ''), n]));
  const chybi = NAB.filter((n) => !podleUrl.has(n.url));
  pravda(`${popisStranky}: najdou se obě nabídky`, chybi.length === 0 && nabidky.length >= 2,
    `nalezeno ${nabidky.length}: ${JSON.stringify(nabidky.map((n) => n.url))}`);
  if (chybi.length) return;
  const spatne = NAB.filter((n) => {
    const x = podleUrl.get(n.url);
    return x.cena !== n.cena || x.vymera !== n.vymera;
  });
  pravda(`${popisStranky}: a mají správnou cenu i výměru`, spatne.length === 0,
    JSON.stringify(spatne.map((n) => [n.url, podleUrl.get(n.url)])));
  if (cestaOcek) {
    pravda(`${popisStranky}: a je vidět, kterou cestou se to přečetlo (${cestaOcek})`,
      nabidky.every((n) => n.odkud === cestaOcek), JSON.stringify([...new Set(nabidky.map((n) => n.odkud))]));
  }
}
sedi(C.prectiJakkoli(puvodni, ZAKLAD).nabidky, 'původní stránka', 'json-ld');
sedi(C.prectiJakkoli(prestavena, ZAKLAD).nabidky, 'přestavěná stránka', 'json-ld');
sedi(C.prectiJakkoli(prestavenaBezLd, ZAKLAD).nabidky, 'přestavěná a bez JSON-LD', 'signál');
sedi(C.prectiJakkoli(sMikrodaty, ZAKLAD).nabidky, 'stránka s mikrodaty', 'mikrodata');

/* ---- 3) ZÁPIS O CESTÁCH je důležitější než výsledek ------------- */
{
  const v = C.prectiJakkoli(prestavenaBezLd, ZAKLAD);
  pravda('v zápisu stojí všechny tři cesty a u každé počet',
    v.zapis.length === 3 && v.zapis.every((z) => typeof z.pocet === 'number'),
    JSON.stringify(v.zapis));
  const ld = v.zapis.find((z) => z.cesta === 'json-ld');
  pravda('a je z něj vidět, že zavřená cesta je právě ta jedna',
    ld && ld.pocet === 0 && v.zapis.find((z) => z.cesta === 'signál').pocet >= 2,
    JSON.stringify(v.zapis));
}

/* ---- 4) NA STRÁNCE BEZ NABÍDEK SE NIC NEVYMYSLÍ ---------------- */
{
  const uvod = `<!doctype html><html><body><h1>Vítejte</h1>
    <p>Prodáme váš pozemek. Provize od 15 000 Kč.</p>
    <a href="/o-nas">O nás</a> <a href="/kontakt">Kontakt</a></body></html>`;
  const v = C.prectiJakkoli(uvod, ZAKLAD);
  pravda('úvodní stránka s jednou cenou a bez výměr nevydá žádnou nabídku',
    v.nabidky.length === 0, JSON.stringify(v.nabidky));
  const hlaska = `<!doctype html><html><body><p>Žádné nabídky nenalezeny.</p>
    <a href="/zpet">Zpět</a></body></html>`;
  pravda('a prázdný výpis taky ne', C.prectiJakkoli(hlaska, ZAKLAD).nabidky.length === 0);
}

/* ---- 5) KDYŽ NEZABERE NIC, AŤ JE VIDĚT, CO TAM BYLO ------------ */
{
  const stena = `<!doctype html><html><body><h1>Ověřte, že jste člověk</h1>
    <p>Pokračujte prosím po přihlášení. Cloudflare.</p></body></html>`;
  const d = C.copakTamJe(stena);
  pravda('u zdi se pozná, že je to zeď, ne prázdná nabídka',
    d.vypadaNaPrihlaseni === true && d.cen === 0, JSON.stringify(d));
  const d2 = C.copakTamJe(prestavenaBezLd);
  pravda('a u přestavěné stránky se vypíše, co na ní je (ceny, výměry, odkazy)',
    d2.cen >= 2 && d2.vymer >= 2 && d2.odkazu >= 2 && d2.jsonLd === 0, JSON.stringify(d2));
  const d3 = C.copakTamJe(`<html><body><p>Žádné nabídky nenalezeny.</p></body></html>`);
  pravda('a prázdný výpis se pozná od rozbitého čtení', d3.vypadaNaPrazdno === true);
}

/* ---- 6) KDYŽ SE PŘESTĚHOVAL VÝPIS ----------------------------- */
{
  const rss = `<?xml version="1.0"?><rss><channel>
    <item><title>Stavební pozemek Lhota</title><link>https://priklad.test/detail/1</link></item>
    <item><title><![CDATA[Zahrada Újezd]]></title><link>https://priklad.test/detail/2</link></item>
  </channel></rss>`;
  const r = C.zRss(rss);
  pravda('z RSS se vytáhnou odkazy na nabídky i s názvy',
    r.length === 2 && r[0].url === NAB[0].url && /Zahrada/.test(r[1].nazev), JSON.stringify(r));
  const sitemap = `<urlset>
    <url><loc>https://priklad.test/detail/1</loc></url>
    <url><loc>https://priklad.test/o-nas</loc></url>
    <url><loc>https://priklad.test/detail/2</loc></url></urlset>`;
  const s = C.zeSitemapy(sitemap, /\/detail\//);
  pravda('ze sitemapy se vyberou jen adresy nabídek', s.length === 2, JSON.stringify(s));
  pravda('a bez vzoru se vrátí všechny', C.zeSitemapy(sitemap).length === 3);
}

/* ---- 7) relativní adresy ------------------------------------- */
{
  pravda('relativní adresa se doplní podle stránky',
    C.absolutni('/detail/9', ZAKLAD) === 'https://priklad.test/detail/9');
  pravda('absolutní zůstane', C.absolutni('https://jiny.test/a', ZAKLAD) === 'https://jiny.test/a');
  pravda('a bez základu se nic nevymýšlí', C.absolutni('/detail/9', '') === '');
}

/* ---- 8) OBEC A OKRES Z TEXTU --------------------------------- */
/* Nabídka bez okresu se v robotovi zahodí, takže druhá cesta musí umět
   místo pojmenovat z textu. A hlavně ho nesmí vymyslet: slovník obcí
   se staví z vlastních dat a v „Horní Dolní" je obec „Horní", kterou
   doopravdy máme — bez kontroly z toho vyšla nabídka na místě, které
   na stránce nikdo nenapsal. */
{
  const { readFileSync } = await import('node:fs');
  const d = JSON.parse(readFileSync(new URL('../data/opportunities.json', import.meta.url), 'utf8'));
  const slovnik = C.slovnikMist(d.opportunities);
  const okresy = new Set(d.opportunities.map((o) => o.okres).filter(Boolean));
  pravda(`slovník obcí se postavil z vlastních dat (${slovnik.size} obcí, ${okresy.size} okresů)`,
    slovnik.size > 500 && okresy.size === 77, `obcí ${slovnik.size}, okresů ${okresy.size}`);
  const kde = (t) => C.mistoZTextu(t, slovnik, okresy);

  const a = kde('Prodej stavebního pozemku 1 480 m², Lhota u Vsetína, okres Vsetín');
  pravda('„…, okres Vsetín" dá okres a obec si vezme z textu před ním',
    !!a && a.okres === 'Vsetín' && a.place === 'Lhota u Vsetína', JSON.stringify(a));
  const b = kde('Prodej pozemku Veselí nad Lužnicí, 3 700 m²');
  pravda('známá obec se pozná i bez okresu a ponechá si pravopis',
    !!b && b.place === 'Veselí nad Lužnicí' && b.okres === 'Tábor', JSON.stringify(b));
  const c = kde('Pozemek 2 000 m², okres Tábor');
  pravda('když stránka obec neuvádí, zůstane okres (a nic se nedomýšlí)',
    !!c && c.okres === 'Tábor' && c.place === 'Tábor', JSON.stringify(c));
  pravda('z „Horní Dolní" se nevyrobí obec „Horní"',
    kde('Pozemek 900 m² v Horní Dolní u Nikde') === null,
    JSON.stringify(kde('Pozemek 900 m² v Horní Dolní u Nikde')));
  pravda('a z „Dolní Benešov" se nevyrobí „Benešov"',
    kde('Pozemek v Dolní Benešov 800 m²') === null);
  pravda('text bez místa nedá nic', kde('Prodej pozemku 1 000 m² za 500 000 Kč') === null);
  pravda('a neznámý okres se za okres nevydává', kde('pozemek, okres Vymyšlený') === null);
  /* Spojky uvnitř jména nesmí jméno rozdělit — a naopak. */
  pravda('jméno se spojkou se pozná celé, ne po částech',
    C.pokracuje(' Benešov u Prahy ', 1, 'Benešov'.length) === true
    && C.pokracuje(' Benešov, okres Benešov ', 1, 'Benešov'.length) === false);
}

/* ---- 9) DRUHÁ CESTA V ROBOTOVI ------------------------------- */
/* Tady už se měří celá záchrana: zdroj, který dnes neodpověděl svým
   obvyklým způsobem, se zkusí přečíst jinak — a to, co z toho vyjde,
   musí být použitelná nabídka, ne polotovar. */
{
  const F = await import('./fetch-opportunities.mjs');
  const R = await import('./robots.mjs');
  const { readFileSync } = await import('node:fs');
  const d = JSON.parse(readFileSync(new URL('../data/opportunities.json', import.meta.url), 'utf8'));
  const slovnik = C.slovnikMist(d.opportunities);
  const okresy = new Set(d.opportunities.map((o) => o.okres).filter(Boolean));
  /* Stránka se jmény obcí, které v datech máme — jinak by se místo
     nepoznalo a zkouška by měřila něco jiného, než si myslí. */
  const obce = [...slovnik.keys()].slice(0, 2).map((k) => slovnik.get(k));
  const stranka = `<html><body>${obce.map((o, i) => `
    <article><a href="/n/${i}">Prodej pozemku ${o.obec}, okres ${o.okres}</a>
    <span>${(1000 + i * 500).toLocaleString('cs-CZ')} m²</span>
    <b>${(800000 + i * 1000).toLocaleString('cs-CZ')} Kč</b></article>`).join('')}</body></html>`;

  function nastroje(stahni) {
    return { stahni, smimeCist: R.smimeCist, prectiJakkoli: C.prectiJakkoli,
      copakTamJe: C.copakTamJe, mistoZTextu: C.mistoZTextu, slovnik, okresy, ua: 'ParcelkaBot/1.0' };
  }
  const CILE = [
    { jmeno: 'Zkušební prodej', host: 'zk.test', url: 'https://zk.test/vypis', typ: 'sale' },
    { jmeno: 'Zkušební dražby', host: 'dr.test', url: 'https://dr.test/vypis', typ: 'drazba' },
  ];
  const odpoved = (text) => ({ ok: true, status: 200, text: async () => text });

  // a) zdroj, který neodpověděl, se přečte druhou cestou
  {
    const volane = [];
    const stahni = async (u) => {
      volane.push(u);
      if (/robots\.txt$/.test(u)) return { ok: true, status: 200, text: 'User-agent: *\nAllow: /' };
      return odpoved(stranka);
    };
    const zdroje = [{ nazev: 'Zkušební prodej', stav: 'chyba', pocet: 0 }];
    const ven = await F.zalozniCestou(zdroje, CILE, nastroje(stahni));
    pravda('vypadlý zdroj se přečte druhou cestou a nabídky mají místo, cenu i výměru',
      ven.length === 2 && ven.every((o) => o.okres && o.place && o.price > 0 && o.area > 0),
      JSON.stringify(ven));
    pravda('a ve stavu zdroje je vidět, že to byla druhá cesta',
      zdroje[0].stav === 'druhá cesta' && zdroje[0].zalozni.verdikt === 'přečteno'
      && zdroje[0].zalozni.pocet === 2, JSON.stringify(zdroje[0]));
    pravda('a nabídky nesou jméno zdroje, ať se dají podržet při dalším výpadku',
      ven.every((o) => o.zdroj === 'Zkušební prodej'));
    pravda('robots.txt se stahoval před stránkou',
      /robots\.txt$/.test(volane[0]) && volane.length === 2, JSON.stringify(volane));
  }

  // b) zdroj, který čtení zakazuje
  {
    const volane = [];
    const stahni = async (u) => {
      volane.push(u);
      if (/robots\.txt$/.test(u)) return { ok: true, status: 200, text: 'User-agent: *\nDisallow: /' };
      return odpoved(stranka);
    };
    const zdroje = [{ nazev: 'Zkušební prodej', stav: 'chyba', pocet: 0 }];
    const ven = await F.zalozniCestou(zdroje, CILE, nastroje(stahni));
    pravda('zdroj, který čtení zakazuje, se druhou cestou nečte',
      ven.length === 0 && zdroje[0].zalozni.verdikt === 'nesmíme' && volane.length === 1,
      JSON.stringify({ ven: ven.length, zalozni: zdroje[0].zalozni, volane }));
    pravda('a zůstane u něj „chyba", nepředstírá se úspěch', zdroje[0].stav === 'chyba');
  }

  // c) dražby druhou cestou NE — jen diagnóza
  {
    const stahni = async (u) => (/robots\.txt$/.test(u)
      ? { ok: true, status: 200, text: 'User-agent: *\nAllow: /' } : odpoved(stranka));
    const zdroje = [{ nazev: 'Zkušební dražby', stav: 'chyba', pocet: 0 }];
    const ven = await F.zalozniCestou(zdroje, CILE, nastroje(stahni));
    pravda('u dražeb se druhou cestou nic nebere — chyběl by termín a druh dražby',
      ven.length === 0 && /diagnóza/.test(zdroje[0].zalozni.verdikt), JSON.stringify(zdroje[0].zalozni));
    pravda('ale diagnóza se zapíše, aby se dalo vyšetřit, co se změnilo',
      !!zdroje[0].zalozni.diagnoza && zdroje[0].zalozni.diagnoza.odkazu >= 2,
      JSON.stringify(zdroje[0].zalozni.diagnoza));
  }

  // d) zdroj, který odpověděl, se druhou cestou neotravuje
  {
    let dotazu = 0;
    const stahni = async () => { dotazu++; return odpoved(stranka); };
    const zdroje = [{ nazev: 'Zkušební prodej', stav: 'ok', pocet: 100 }];
    const ven = await F.zalozniCestou(zdroje, CILE, nastroje(stahni));
    pravda('zdroj, který odpověděl, se druhou cestou vůbec nezkouší',
      ven.length === 0 && dotazu === 0 && !zdroje[0].zalozni, `dotazů ${dotazu}`);
  }

  // e) nabídky bez poznaného místa se neberou
  {
    const cizi = `<html><body><article><a href="/n/1">Pozemek Vymyšlená Ves</a>
      <span>1 200 m²</span><b>900 000 Kč</b></article></body></html>`;
    const stahni = async (u) => (/robots\.txt$/.test(u)
      ? { ok: true, status: 200, text: 'User-agent: *\nAllow: /' } : odpoved(cizi));
    const zdroje = [{ nazev: 'Zkušební prodej', stav: 'chyba', pocet: 0 }];
    const ven = await F.zalozniCestou(zdroje, CILE, nastroje(stahni));
    pravda('nabídka, u které se nepozná místo, se nebere (a je to spočítané)',
      ven.length === 0 && zdroje[0].zalozni.bezMista === 1 && zdroje[0].stav === 'chyba',
      JSON.stringify(zdroje[0].zalozni));
  }

  // f) přihlašovací zeď
  {
    const zed = `<html><body><h1>Ověřte, že jste člověk</h1><p>Cloudflare</p></body></html>`;
    const stahni = async (u) => (/robots\.txt$/.test(u)
      ? { ok: true, status: 200, text: 'User-agent: *\nAllow: /' } : odpoved(zed));
    const zdroje = [{ nazev: 'Zkušební prodej', stav: 'chyba', pocet: 0 }];
    await F.zalozniCestou(zdroje, CILE, nastroje(stahni));
    pravda('za zdí se nic nevymýšlí a do nálezu se napíše, že je to zeď',
      zdroje[0].zalozni.verdikt === 'nepřečteno'
      && zdroje[0].zalozni.diagnoza.vypadaNaPrihlaseni === true,
      JSON.stringify(zdroje[0].zalozni));
  }

  // f2) stav „druhá cesta" se počítá jako odpověď, ne jako ticho
  {
    const kod = readFileSync(new URL('../scripts/fetch-opportunities.mjs', import.meta.url), 'utf8');
    pravda('stav „druhá cesta" patří mezi stavy, kdy zdroj odpověděl',
      /ODPOVEDEL = new Set\(\[[^\]]*'druhá cesta'\]\)/.test(kod),
      'jinak by se v historii počtů udělala děra právě v době výpadku');
  }

  // g) pořadí v robotovi: druhá cesta PŘED držením
  {
    const kod = readFileSync(new URL('../scripts/fetch-opportunities.mjs', import.meta.url), 'utf8');
    const iJinak = kod.indexOf('const jinak = await zalozniCestou(');
    const iDrzeni = kod.indexOf('const podrzeno = podrzNabidkyVypadlych(');
    pravda('v robotovi se druhá cesta zkouší PŘED držením starých nabídek',
      iJinak > 0 && iDrzeni > iJinak,
      `druhá cesta ${iJinak}, držení ${iDrzeni} — opačně by se míchal dnešní a včerejší obraz`);
  }
}

console.log('Čtení zdroje, který se změnil:');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb.`);
process.exit(chyb ? 1 : 0);
