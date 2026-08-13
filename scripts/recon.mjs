#!/usr/bin/env node
// Farmy.cz — struktura výpisu nabídek + detailu (pole: typ, lokalita, výměra, cena).
const UA = { 'user-agent': 'PozemkomatBot/0.1 (+https://github.com/mhjrw9k8m4-cyber/Nemovitosti)' };
async function get(u) {
  try { const r = await fetch(u, { headers: UA, redirect: 'follow' }); const t = await r.text(); return { s: r.status, t }; }
  catch (e) { return { s: 0, t: '', err: e.message }; }
}
const strip = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

// 1) výpis nabídek
const list = await get('https://farmy.cz/inzerce_aktualni_nabidky');
console.log('výpis:', list.s, list.t.length + 'B');
// najdi bloky kolem odkazů nabidka_detail?nab=
const ids = [...new Set([...list.t.matchAll(/nabidka_detail\?nab=(\d+)/g)].map((m) => m[1]))];
console.log('počet nabídek na stránce:', ids.length, '| první id:', ids.slice(0, 5));
// ukázka HTML kolem prvního odkazu (ať vidím okolní data)
const i0 = list.t.indexOf('nabidka_detail?nab=');
if (i0 >= 0) console.log('okolí odkazu:', strip(list.t.slice(i0 - 400, i0 + 400)).slice(0, 500));

// 2) detail jedné nabídky
if (ids.length) {
  const det = await get('https://farmy.cz/nabidka_detail?nab=' + ids[0]);
  console.log(`\ndetail nab=${ids[0]}:`, det.s, det.t.length + 'B');
  for (const kw of ['pozem', 'výmě', 'vymer', 'cena', 'Kč', 'lokalit', 'okres', 'kraj', 'obec', 'druh', 'ha', 'm2', 'm²', 'gps', 'lat', 'katastr']) {
    const i = det.t.toLowerCase().indexOf(kw.toLowerCase());
    if (i >= 0) console.log(`  "${kw}": …${strip(det.t.slice(i - 25, i + 75))}…`);
  }
  // tabulkové řádky detailu
  const rows = [...det.t.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)].map((m) => strip(m[1])).filter((s) => s.length > 2 && s.length < 120);
  console.log('  řádky tabulky:', JSON.stringify(rows.slice(0, 12)));
}
console.log('\nHotovo.');
