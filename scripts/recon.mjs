#!/usr/bin/env node
// edesky /dokumenty – struktura výpisu (název, obec, odkaz) pro obecní záměry.
const UA = { 'user-agent': 'PozemkomatBot/0.1 (+https://github.com/mhjrw9k8m4-cyber/Nemovitosti)' };
async function get(u) { try { const r = await fetch(u, { headers: UA, redirect: 'follow' }); const t = await r.text(); return { s: r.status, t }; } catch (e) { return { s: 0, t: '', err: e.message }; } }
const strip = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

const r = await get('https://edesky.cz/dokumenty?q=' + encodeURIComponent('záměr prodeje pozemku'));
console.log('dokumenty:', r.s, r.t.length + 'B');
// rozděl podle odkazů na dokument a ukaž okolí (název + obec)
const idx = [...r.t.matchAll(/href="(\/dokument\/\d+[^"]*)"/gi)];
console.log('dokumentů:', idx.length);
// vypiš 5 bloků: odkaz + okolní text
for (let i = 0; i < Math.min(5, idx.length); i++) {
  const pos = idx[i].index;
  console.log(`\n[${i}] ${idx[i][1]}`);
  console.log('   okolí:', strip(r.t.slice(pos - 250, pos + 250)).slice(0, 320));
}
// detail jednoho dokumentu – jak vypadá + odkaz na originál/PDF a obec
if (idx.length) {
  const det = await get('https://edesky.cz' + idx[0][1]);
  console.log('\n=== detail dokumentu ===', det.s, det.t.length + 'B');
  console.log('název (title):', (det.t.match(/<title>([^<]+)<\/title>/) || [])[1]);
  for (const kw of ['obec', 'katastr', 'parc', 'výmě', 'm2', 'Kč', 'zdroj', 'pdf', 'originál', 'úřední deska']) {
    const i = det.t.toLowerCase().indexOf(kw.toLowerCase());
    if (i >= 0) console.log(`  "${kw}": …${strip(det.t.slice(i - 20, i + 80))}…`);
  }
  const pdf = [...new Set([...det.t.matchAll(/href="(https?:\/\/[^"]+\.pdf[^"]*)"/gi)].map((m) => m[1]))].slice(0, 3);
  console.log('  PDF odkazy:', JSON.stringify(pdf));
}
console.log('\nHotovo.');
