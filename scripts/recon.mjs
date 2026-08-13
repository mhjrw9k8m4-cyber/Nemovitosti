#!/usr/bin/env node
// Průzkum exekučních dražeb (exdrazby.cz, Exekutorská komora) — co je dostupné.
const UA = { 'user-agent': 'PozemkomatBot/0.1 (+https://github.com/mhjrw9k8m4-cyber/Nemovitosti)' };

async function show(label, url, max = 900) {
  try {
    const r = await fetch(url, { headers: UA, redirect: 'follow' });
    const t = await r.text();
    console.log(`\n=== ${label} → HTTP ${r.status} · ${r.headers.get('content-type')} · ${t.length} B ===`);
    console.log(t.slice(0, max));
    return t;
  } catch (e) { console.log(`\n=== ${label} → CHYBA: ${e.message} ===`); return ''; }
}

// 1) sitemap — často seznam všech detailů dražeb
await show('sitemap.xml', 'https://www.exdrazby.cz/sitemap.xml', 1500);
// 2) homepage — je to server-rendered seznam nebo JS aplikace?
const home = await show('homepage', 'https://www.exdrazby.cz/', 600);
// 3) hledáme odkazy na detail dražby a zmínky o pozemcích
if (home) {
  const links = [...home.matchAll(/href="(\/[^"]*drazb[^"]*)"/gi)].map((m) => m[1]).slice(0, 15);
  console.log('\nOdkazy s "drazb":', JSON.stringify([...new Set(links)], null, 0));
  console.log('Zmínka "pozem":', home.toLowerCase().includes('pozem'));
  console.log('Vypadá jako JS app (root div/app):', /id="app"|id="root"|__NUXT__|__NEXT_DATA__/.test(home));
}
// 4) zkusíme typickou stránku výpisu nemovitostí
await show('seznam dražeb (guess)', 'https://www.exdrazby.cz/nemovitosti', 600);
console.log('\nHotovo.');
