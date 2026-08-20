// Dočasný průzkum dražebních zdrojů — zjistí, který web vrací použitelná data.
// Spouští se ručně přes workflow „probe". Až najdeme zdroj, skript smažeme.
const UA = { 'user-agent': 'ParcelkaBot/0.1 (+https://parcelaka.cz)' };

const targets = [
  'https://www.portaldrazeb.cz/robots.txt',
  'https://www.portaldrazeb.cz/',
  'https://www.portaldrazeb.cz/sitemap.xml',
  'https://www.portaldrazeb.cz/rss',
  'https://www.exdrazby.cz/robots.txt',
  'https://www.exdrazby.cz/',
  'https://www.exdrazby.cz/sitemap.xml',
  'https://www.eurodrazby.cz/',
  'https://www.eurodrazby.cz/robots.txt',
  'https://drazby.net/',
  'https://www.okdrazby.cz/',
  'https://www.okdrazby.cz/robots.txt',
  'https://portaldrazeb.cz/api/auctions',
  'https://www.portaldrazeb.cz/drazby',
];

function analyze(url, status, ct, body) {
  const len = body.length;
  const low = body.toLowerCase();
  const cPozemek = (low.match(/pozemek/g) || []).length;
  const cDrazba = (low.match(/dra[žz]b/g) || []).length;
  const cKc = (low.match(/kč|czk/g) || []).length;
  const isJson = /json/i.test(ct) || /^[\s]*[{\[]/.test(body);
  // odhad: server-rendered HTML má odkazy na detaily dražeb; SPA má skoro prázdné tělo
  const links = (body.match(/href="[^"]*(drazb|detail|aukc|pozem)[^"]*"/gi) || []).length;
  const apiHints = (body.match(/\/api\/|graphql|\.json|axios|fetch\(/gi) || []).slice(0, 5);
  console.log(`\n=== ${url}`);
  console.log(`   status=${status} type=${ct} délka=${len}B`);
  console.log(`   "pozemek"×${cPozemek}  "dražb"×${cDrazba}  "Kč"×${cKc}  odkazy-na-detail×${links}`);
  if (isJson) console.log(`   >>> vypadá to na JSON! prvních 300 znaků: ${body.slice(0, 300).replace(/\s+/g, ' ')}`);
  if (apiHints.length) console.log(`   API stopy: ${[...new Set(apiHints)].join(', ')}`);
  if (links === 0 && len < 60000 && !isJson) console.log(`   (podezření na JS aplikaci — málo obsahu, žádné odkazy)`);
}

for (const url of targets) {
  try {
    const ctrl = AbortSignal.timeout(15000);
    const r = await fetch(url, { headers: UA, redirect: 'follow', signal: ctrl });
    const ct = r.headers.get('content-type') || '?';
    const body = await r.text();
    analyze(url, r.status, ct, body);
  } catch (e) {
    console.log(`\n=== ${url}\n   CHYBA: ${e && e.message ? e.message : e}`);
  }
}
console.log('\n--- průzkum hotový ---');
