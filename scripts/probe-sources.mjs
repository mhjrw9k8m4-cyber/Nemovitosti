// Cílený průzkum okdrazby.cz + portaldrazeb.cz — struktura + robots + detail.
const UA = { 'user-agent': 'ParcelkaBot/0.1 (+https://parcelaka.cz)' };
const get = async (u) => { const r = await fetch(u, { headers: UA, redirect: 'follow', signal: AbortSignal.timeout(20000) }); return { s: r.status, ct: r.headers.get('content-type') || '', t: await r.text() }; };

async function robots(base) {
  try { const r = await get(base + '/robots.txt'); console.log(`\n### robots ${base}\n${r.t.slice(0, 400)}`); } catch (e) { console.log(`robots ${base} chyba: ${e.message}`); }
}

console.log('===== ROBOTS =====');
await robots('https://www.okdrazby.cz');
await robots('https://www.portaldrazeb.cz');

// okdrazby: najdi odkazy na detail + kategorie pozemky
console.log('\n===== OKDRAZBY homepage odkazy =====');
try {
  const h = await get('https://www.okdrazby.cz/');
  const links = [...new Set([...h.t.matchAll(/href="(\/[^"]*(?:drazba|detail|polozka|aukce)[^"]*)"/gi)].map(m => m[1]))].slice(0, 10);
  console.log('vzorek odkazů:', JSON.stringify(links, null, 0).slice(0, 800));
  // zkusíme kategorii pozemky (běžné filtry)
  for (const u of ['https://www.okdrazby.cz/drazby/pozemky', 'https://www.okdrazby.cz/katalog?category=pozemky', 'https://www.okdrazby.cz/api/items', 'https://www.okdrazby.cz/drazby?typ=nemovitost']) {
    try { const r = await get(u); console.log(`  ${u} -> ${r.s} ${r.ct} ${r.t.length}B ${/json/i.test(r.ct) ? 'JSON:' + r.t.slice(0, 200) : ''}`); } catch (e) { console.log(`  ${u} -> chyba ${e.message}`); }
  }
  // stáhni první detail a hledej JSON-LD / schema
  if (links.length) {
    const durl = links[0].startsWith('http') ? links[0] : 'https://www.okdrazby.cz' + links[0];
    const d = await get(durl);
    console.log(`\n--- DETAIL ${durl} (${d.t.length}B) ---`);
    const ld = [...d.t.matchAll(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)].map(m => m[1].trim());
    if (ld.length) console.log('JSON-LD nalezeno:', ld.map(x => x.slice(0, 400)).join('\n---\n'));
    else console.log('JSON-LD: NE');
    // hledej pozemek/výměra/cena v textu
    const grab = (re) => (d.t.match(re) || []).slice(0, 3).map(s => s.replace(/\s+/g, ' ').trim());
    console.log('výměra?', grab(/[^<>]{0,30}(m2|m²|výmĕr|výměr)[^<>]{0,30}/gi));
    console.log('cena?', grab(/[^<>]{0,20}(vyvolávací|nejnižší podání|odhad)[^<>]{0,40}/gi));
    console.log('druh?', grab(/[^<>]{0,10}(pozemek|orná|zahrada|louka|les|stavební)[^<>]{0,20}/gi));
  }
} catch (e) { console.log('okdrazby chyba:', e.message); }

console.log('\n===== PORTALDRAZEB /drazby odkazy =====');
try {
  const h = await get('https://www.portaldrazeb.cz/drazby');
  const links = [...new Set([...h.t.matchAll(/href="([^"]*(?:drazba|detail|zverejnena)[^"]*)"/gi)].map(m => m[1]))].slice(0, 8);
  console.log('vzorek odkazů:', JSON.stringify(links).slice(0, 700));
} catch (e) { console.log('portaldrazeb chyba:', e.message); }

console.log('\n--- hotovo ---');
