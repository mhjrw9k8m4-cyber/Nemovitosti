// Průzkum struktury okdrazby /drazby/pozemky → __NEXT_DATA__ JSON.
const UA = { 'user-agent': 'ParcelkaBot/0.1 (+https://parcelaka.cz)' };
const get = async (u) => (await fetch(u, { headers: UA, redirect: 'follow', signal: AbortSignal.timeout(20000) })).text();

function nextData(html) {
  const m = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  return m ? JSON.parse(m[1]) : null;
}
// najdi první pole objektů, které vypadá jako seznam dražeb (má hodně prvků s cenou/názvem)
function findList(obj, depth = 0, path = '') {
  if (depth > 8 || !obj || typeof obj !== 'object') return null;
  if (Array.isArray(obj) && obj.length >= 3 && typeof obj[0] === 'object' && obj[0]) {
    const keys = Object.keys(obj[0]).join(',').toLowerCase();
    if (/(cena|price|nazev|name|slug|id).*(cena|price|nazev|name|slug|id)/.test(keys) || obj.length >= 8) return { path, arr: obj };
  }
  for (const k of Object.keys(obj)) {
    const r = findList(obj[k], depth + 1, path + '.' + k);
    if (r) return r;
  }
  return null;
}

try {
  const html = await get('https://www.okdrazby.cz/drazby/pozemky');
  console.log('HTML délka:', html.length);
  const nd = nextData(html);
  if (!nd) { console.log('__NEXT_DATA__ NENALEZENO'); }
  else {
    const pp = nd.props && nd.props.pageProps;
    console.log('pageProps klíče:', pp ? Object.keys(pp).join(', ') : '(žádné)');
    const found = findList(nd);
    if (found) {
      console.log('\n>>> seznam na cestě:', found.path, '| počet:', found.arr.length);
      console.log('klíče prvku:', Object.keys(found.arr[0]).join(', '));
      console.log('\nUKÁZKA 1. prvku:', JSON.stringify(found.arr[0]).slice(0, 900));
      console.log('\nUKÁZKA 2. prvku:', JSON.stringify(found.arr[1]).slice(0, 700));
    } else {
      console.log('Seznam dražeb v NEXT_DATA nenalezen. Klíče props:', Object.keys(nd.props || {}).join(','));
    }
    // hledáme i pagination / total
    const s = JSON.stringify(nd);
    const tot = s.match(/"(total|totalCount|count|pocet|totalItems|pages?)":\s*\d+/gi);
    if (tot) console.log('\npočty/pagination:', [...new Set(tot)].slice(0, 8).join('  '));
  }
} catch (e) { console.log('CHYBA:', e.message); }
console.log('\n--- hotovo ---');
