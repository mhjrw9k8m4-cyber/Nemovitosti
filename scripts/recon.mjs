#!/usr/bin/env node
// edesky.cz bez API klíče — jde procházet záměry prodeje pozemků z HTML?
const UA = { 'user-agent': 'PozemkomatBot/0.1 (+https://github.com/mhjrw9k8m4-cyber/Nemovitosti)' };
async function get(u) { try { const r = await fetch(u, { headers: UA, redirect: 'follow' }); const t = await r.text(); return { s: r.status, ct: r.headers.get('content-type'), t }; } catch (e) { return { s: 0, t: '', err: e.message }; } }
const strip = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();

// homepage – najdi vyhledávací formulář (action) a odkazy
const home = await get('https://edesky.cz/');
console.log('home:', home.s, home.t.length + 'B');
const forms = [...home.t.matchAll(/<form[^>]*action="([^"]*)"[^>]*>/gi)].map((m) => m[1]);
console.log('formuláře action:', JSON.stringify(forms.slice(0, 6)));
const navlinks = [...new Set([...home.t.matchAll(/href="(\/[^"]+)"/gi)].map((m) => m[1]).filter((h) => /hleda|dokument|zamer|zám|obec|kategor|vyhled/i.test(h)))].slice(0, 15);
console.log('odkazy:', JSON.stringify(navlinks));

// zkusíme běžné hledací cesty (Rails) bez klíče
console.log('\n-- hledání bez klíče --');
for (const u of [
  'https://edesky.cz/hledej?q=z%C3%A1m%C4%9Br+prodeje+pozemku',
  'https://edesky.cz/search?q=z%C3%A1m%C4%9Br+prodeje+pozemku',
  'https://edesky.cz/dokumenty?q=z%C3%A1m%C4%9Br+prodeje+pozemku',
  'https://edesky.cz/hledani?q=prodej+pozemku',
]) {
  const r = await get(u);
  const docs = [...new Set([...r.t.matchAll(/href="(\/dokument[^"]*)"/gi)].map((m) => m[1]))];
  console.log(u.replace('https://edesky.cz', ''), '→', r.s, r.t.length + 'B', 'dokumentů:', docs.length, docs.slice(0, 2));
}
console.log('\nHotovo.');
