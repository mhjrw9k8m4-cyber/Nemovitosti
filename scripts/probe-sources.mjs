// Průzkum v4 — jde parsovat výpis okdrazby /drazby/pozemky přímo? (odkazy, karta, stránkování)
const UA = { 'user-agent': 'ParcelkaBot/0.1 (+https://parcelaka.cz)' };
const get = async (u) => { const r = await fetch(u, { headers: UA, redirect: 'follow', signal: AbortSignal.timeout(20000) }); return { s: r.status, t: await r.text() }; };

try {
  const { t: html } = await get('https://www.okdrazby.cz/drazby/pozemky');
  console.log('délka:', html.length);
  // odkazy na detail
  const links = [...new Set([...html.matchAll(/\/drazba\/(\d+)-([a-z0-9-]+)/gi)].map(m => m[0]))];
  console.log('odkazů na dražbu:', links.length);
  console.log('vzorek slugů:', links.slice(0, 6).join('\n  '));
  // okolí prvního odkazu — je na kartě cena/lokalita?
  const i = html.indexOf(links[0]);
  console.log('\n--- HTML kolem 1. karty (±700) ---');
  console.log(html.slice(Math.max(0, i - 350), i + 500).replace(/</g, '‹').replace(/\s+/g, ' '));
  // stránkování
  const pages = [...new Set([...html.matchAll(/[?&](page|strana)=(\d+)/gi)].map(m => m[0]))];
  console.log('\nstránkování stopy:', pages.slice(0, 8).join(' '));
  for (const u of ['https://www.okdrazby.cz/drazby/pozemky?page=2', 'https://www.okdrazby.cz/drazby/pozemky/2', 'https://www.okdrazby.cz/drazby/pozemky?strana=2']) {
    try { const r = await get(u); const n = [...new Set([...r.t.matchAll(/\/drazba\/(\d+)-/g)].map(m => m[0]))].length; console.log(`  ${u} -> ${r.s}, dražeb: ${n}`); } catch (e) { console.log(`  ${u} -> ${e.message}`); }
  }
  // flight data se stavem/cenou?
  const fi = html.search(/nejniz|nejnizsi|vyvolavaci|"cena"/i);
  if (fi > -1) console.log('\n--- vzorek dat (cena) ---\n' + html.slice(fi - 60, fi + 240).replace(/\s+/g, ' '));
  // celkový počet?
  const tot = html.match(/(\d+)\s*(dražeb|dražby|výsledk|nemovitost|položek)/i);
  if (tot) console.log('\ncelkem text:', tot[0]);
} catch (e) { console.log('CHYBA:', e.message); }
console.log('\n--- hotovo ---');
