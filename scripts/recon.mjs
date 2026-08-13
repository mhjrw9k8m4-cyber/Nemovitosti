#!/usr/bin/env node
// Průzkum API exdrazby.cz (API Platform / Symfony) — najít reálné cesty.
const UA = {
  'user-agent': 'PozemkomatBot/0.1 (+https://github.com/mhjrw9k8m4-cyber/Nemovitosti)',
  accept: 'application/ld+json, application/json, */*',
};

async function get(url, opts = {}) {
  try {
    const r = await fetch(url, { headers: UA, redirect: 'follow', ...opts });
    const t = await r.text();
    return { ok: r.ok, status: r.status, ct: r.headers.get('content-type'), len: t.length, text: t };
  } catch (e) { return { ok: false, status: 0, err: e.message, text: '' }; }
}

// 1) API Platform entrypoint — /api obvykle vrací seznam kolekcí (Hydra)
console.log('=== API Platform discovery ===');
for (const p of ['/api', '/api/', '/api/docs.jsonld', '/api/docs.json', '/api/v3', '/api/v2', '/api/v1']) {
  const r = await get('https://www.exdrazby.cz' + p);
  console.log(p, '→', r.status, r.ct, r.len + 'B', '::', r.text.slice(0, 200).replace(/\s+/g, ' '));
}

// 2) vytáhnout z JS bundlu route stringy typu `api/...` (i bez lomítka na začátku)
console.log('\n=== route stringy z JS bundlu ===');
const home = await get('https://www.exdrazby.cz/');
const bundle = (home.text.match(/src="(\/static\/js\/main[^"]+\.js)"/) || [])[1];
if (bundle) {
  const js = await get('https://www.exdrazby.cz' + bundle);
  const paths = [...new Set([...js.text.matchAll(/["'`]((?:\/)?api\/[a-z0-9_\-\/{}.:]{2,60})["'`]/gi)].map((m) => m[1]))].slice(0, 40);
  console.log('api/... stringy:', JSON.stringify(paths));
  // slova blízko "auction", "drazb", "nemovit", "search", "filter", "items"
  const words = [...new Set([...js.text.matchAll(/["'`]([a-z_]{4,30}(?:s|Items|List|Collection))["'`]/g)].map((m) => m[1]))].filter((w) => /auction|drazb|item|nemovit|realt|estate|proper|search|filter|result/i.test(w)).slice(0, 40);
  console.log('podezřelá slova:', JSON.stringify(words));
}
console.log('\nHotovo.');
