// Průzkum v6 — je CENA v serverovém HTML detailu? + sitemap enumerace. (důležité výstupy na konci)
const UA = { 'user-agent': 'ParcelkaBot/0.1 (+https://parcelaka.cz)' };
const get = async (u) => { const r = await fetch(u, { headers: UA, redirect: 'follow', signal: AbortSignal.timeout(25000) }); return { s: r.status, ct: r.headers.get('content-type') || '', t: await r.text() }; };

// CENA v detailu
const durl = 'https://www.okdrazby.cz/drazba/26367-pozemky-o-velikosti-4-765-m-2-v';
try {
  const { t } = await get(durl);
  const kc = [...new Set([...t.matchAll(/(\d[\d  .,]{3,})\s*Kč/gi)].map(m => m[1].trim()))].slice(0, 8);
  console.log('CENA "… Kč" v HTML:', JSON.stringify(kc));
  const flds = [...new Set([...t.matchAll(/"([a-zA-Z_]*(?:price|cena|podani|bid|castka|amount|odhad|vymera|vyvolav)[a-zA-Z_]*)"\s*:\s*"?(\d[\d.]*)/gi)].map(m => m[1] + '=' + m[2]))].slice(0, 12);
  console.log('číselná pole v datech:', JSON.stringify(flds));
} catch (e) { console.log('detail chyba:', e.message); }

// SITEMAP enumerace (na konci = tail ji ukáže)
let smInfo = [];
for (const sm of ['https://www.okdrazby.cz/sitemap.xml', 'https://www.okdrazby.cz/server-sitemap.xml', 'https://www.okdrazby.cz/sitemap-0.xml']) {
  try {
    const r = await get(sm);
    const drazby = [...new Set([...r.t.matchAll(/\/drazba\/\d+-[a-z0-9-]+/gi)].map(m => m[0]))];
    const subs = [...new Set([...r.t.matchAll(/https?:\/\/[^<\s"']+\.xml/gi)].map(m => m[0]))];
    smInfo.push(`${sm} -> ${r.s} ${r.t.length}B | dražeb:${drazby.length} | .xml odkazů:${subs.length}` + (subs.length ? ' :: ' + subs.slice(0, 5).join(' ') : '') + (drazby.length ? ' :: ' + drazby.slice(0, 2).join(' ') : ''));
  } catch (e) { smInfo.push(`${sm} chyba: ${e.message}`); }
}
console.log('\n===== SITEMAP =====');
for (const l of smInfo) console.log(l);
console.log('--- hotovo ---');
