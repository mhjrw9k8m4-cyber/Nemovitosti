// Průzkum v5 — sitemap okdrazby (enumerace dražeb) + parsování detailu pozemku.
const UA = { 'user-agent': 'ParcelkaBot/0.1 (+https://parcelaka.cz)' };
const get = async (u) => { const r = await fetch(u, { headers: UA, redirect: 'follow', signal: AbortSignal.timeout(25000) }); return { s: r.status, ct: r.headers.get('content-type') || '', t: await r.text() }; };

// 1) SITEMAP
for (const sm of ['https://www.okdrazby.cz/sitemap.xml', 'https://www.okdrazby.cz/sitemap-drazby.xml', 'https://www.okdrazby.cz/sitemap_index.xml']) {
  try {
    const r = await get(sm);
    const drazby = [...new Set([...r.t.matchAll(/\/drazba\/(\d+)-([a-z0-9-]+)/gi)].map(m => m[0]))];
    const subs = [...new Set([...r.t.matchAll(/https?:\/\/[^<\s"']+sitemap[^<\s"']*\.xml/gi)].map(m => m[0]))];
    console.log(`\n### ${sm} -> ${r.s} ${r.ct} ${r.t.length}B | /drazba/ odkazů: ${drazby.length} | pod-sitemapy: ${subs.length}`);
    if (subs.length) console.log('  pod-sitemapy:', subs.slice(0, 6).join(' '));
    if (drazby.length) console.log('  vzorek:', drazby.slice(0, 4).join(' '));
  } catch (e) { console.log(`### ${sm} chyba: ${e.message}`); }
}

// 2) DETAIL parsování (pozemek)
const durl = 'https://www.okdrazby.cz/drazba/26367-pozemky-o-velikosti-4-765-m-2-v';
try {
  const { s, t } = await get(durl);
  console.log(`\n=== DETAIL ${durl} -> ${s}, ${t.length}B`);
  const grab = (re, n = 2) => (t.match(re) || []).slice(0, n).map(x => x.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
  console.log('title:', grab(/<title>([^<]+)<\/title>/i));
  console.log('h1:', grab(/<h1[^>]*>([\s\S]{0,120}?)<\/h1>/i));
  console.log('nejnižší podání:', grab(/nejniž[^<]{0,4}podání[\s\S]{0,120}?(\d[\d\s .]*)\s*(kč|czk)/gi, 2));
  console.log('odhad:', grab(/odhad[^<]{0,10}cena[\s\S]{0,120}?(\d[\d\s .]*)\s*(kč|czk)/gi, 2));
  console.log('výměra:', grab(/(výmĕr|výměr|plocha|o velikosti)[\s\S]{0,40}?(\d[\d\s.,]*)\s*m\s*2?/gi, 3));
  console.log('okres/lokalita:', grab(/(okres|kraj|katastr[a-z]*\s*úz[a-z]*)[\s\S]{0,60}/gi, 3));
  console.log('termín/stav:', grab(/(zahájení|termín draž|dražba se koná|stav draž)[\s\S]{0,50}/gi, 2));
  // JSON ve flight datech?
  const fi = t.search(/"vymera"|"nejnizsiPodani"|"cenaOdhad"|"okres"|"katastralni"/i);
  if (fi > -1) console.log('\n>>> strukturovaná data v HTML:', t.slice(fi - 40, fi + 260).replace(/\s+/g, ' '));
} catch (e) { console.log('detail chyba:', e.message); }
console.log('\n--- hotovo ---');
