// Parcelka — automatický test chytrých upozornění (uložená hledání).
// Běží v GitHub Action (má síť), ověří na ŽIVÉM Supabase, že RPC pro „Hlídání"
// fungují: uložit hledání, načíst svoje, označit prohlédnuté (seen_keys),
// smazat, a hlavně SOUKROMÍ (cizí účet cizí hledání nevidí ani nesmaže).
// Používá jen VEŘEJNÝ anon klíč.
const URL = process.env.SB_URL || 'https://tcinuzftgmkvjjgvadky.supabase.co';
const KEY = process.env.SB_KEY || 'sb_publishable_mnPDOe03iHjoDxc7C2x2iA_q4HOSec0';
const rnd = Math.random().toString(36).slice(2, 8);
let pass = 0, fail = 0;
function ok(name, cond, extra) { if (cond) { pass++; console.log('  ✅ ' + name); } else { fail++; console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); } }

async function auth(path, body) {
  const r = await fetch(URL + '/auth/v1/' + path, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  return { status: r.status, j };
}
async function signup(email, pw) {
  let { status, j } = await auth('signup', { email, password: pw });
  if (j && j.access_token) return { token: j.access_token, uid: j.user && j.user.id };
  const r = await auth('token?grant_type=password', { email, password: pw });
  if (r.j && r.j.access_token) return { token: r.j.access_token, uid: r.j.user && r.j.user.id };
  return { err: (j && (j.msg || j.error_description || j.error)) || (r.j && (r.j.msg || r.j.error_description)) || ('HTTP ' + status) };
}
async function rpc(token, fn, args) {
  const r = await fetch(URL + '/rest/v1/rpc/' + fn, {
    method: 'POST', headers: { apikey: KEY, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(args || {}),
  });
  const txt = await r.text(); let j = null; try { j = txt ? JSON.parse(txt) : null; } catch {}
  return { status: r.status, j, txt };
}

(async () => {
  console.log('== Test chytrých upozornění (Hlídání) ==', new Date().toISOString());
  const A = await signup('pk-srch-a-' + rnd + '@example.com', 'Test-' + rnd + 'A1');
  const B = await signup('pk-srch-b-' + rnd + '@example.com', 'Test-' + rnd + 'B1');
  if (!A.token || !B.token) {
    console.log('  ❌ Přihlášení účtů selhalo — nejspíš je zapnuté „Confirm email".');
    console.log('     A:', A.err || 'ok', '| B:', B.err || 'ok');
    console.log('  → Supabase → Authentication → Providers → Email → Confirm email = OFF, pak spusť test znovu.');
    process.exit(1);
  }
  ok('vytvořeny 2 zkušební účty (A, B)', true);

  // A uloží hledání s detaily (elektřina + voda)
  const sv = await rpc(A.token, 'save_search', {
    p_label: 'Test ' + rnd, p_okres: 'Kolín', p_druh: 'stavební pozemek', p_type: 'sale',
    p_max_price: 800000, p_min_area: 500, p_features: ['Elektřina', 'Voda'],
  });
  const searchId = Array.isArray(sv.j) ? sv.j[0] : sv.j;
  ok('A uložil hledání', sv.status === 200 && !!searchId, sv.txt && sv.txt.slice(0, 140));
  if (!searchId) { console.log('== Konec (bez hledání nelze testovat) — nasazený saved-searches.sql? =='); process.exit(1); }

  // A vidí svoje hledání a sedí kritéria
  const my1 = await rpc(A.token, 'my_searches', {});
  const s = Array.isArray(my1.j) && my1.j.find((x) => x.id === searchId);
  ok('A vidí svoje hledání v seznamu', !!s, my1.txt && my1.txt.slice(0, 140));
  ok('kritéria sedí (okres, cena, výměra)', s && s.okres === 'Kolín' && s.max_price === 800000 && s.min_area === 500, s && JSON.stringify({ okres: s.okres, max: s.max_price, min: s.min_area }));
  ok('detaily (features) uložené', s && Array.isArray(s.features) && s.features.includes('Elektřina') && s.features.includes('Voda'), s && JSON.stringify(s.features));
  ok('seen_keys začíná prázdné', s && Array.isArray(s.seen_keys) && s.seen_keys.length === 0, s && ('len=' + (s.seen_keys && s.seen_keys.length)));

  // A označí prohlédnuté (uloží klíče) → příště se nové počítají od těchhle
  const keys = ['sale|kolin|test|0/0|500000|1000', 'sale|kolin|test2|1/1|600000|800'];
  const mk = await rpc(A.token, 'mark_search_seen', { p_id: searchId, p_keys: keys });
  ok('A označil hledání jako prohlédnuté', mk.status === 200 && mk.j === true, mk.txt && mk.txt.slice(0, 140));
  const my2 = await rpc(A.token, 'my_searches', {});
  const s2 = Array.isArray(my2.j) && my2.j.find((x) => x.id === searchId);
  ok('seen_keys se uložily (2 klíče)', s2 && Array.isArray(s2.seen_keys) && s2.seen_keys.length === 2, s2 && ('len=' + (s2.seen_keys && s2.seen_keys.length)));
  ok('last_checked_at se nastavilo', s2 && !!s2.last_checked_at);

  // SOUKROMÍ: B nevidí hledání A
  const myB = await rpc(B.token, 'my_searches', {});
  ok('SOUKROMÍ: cizí (B) nevidí hledání A', Array.isArray(myB.j) && !myB.j.some((x) => x.id === searchId), 'count=' + (Array.isArray(myB.j) ? myB.j.length : '?'));

  // SOUKROMÍ: B nesmí smazat hledání A (delete_search vrací false / 0 řádků)
  const delB = await rpc(B.token, 'delete_search', { p_id: searchId });
  ok('SOUKROMÍ: cizí (B) NESMAŽE hledání A', delB.j === false, 'ret=' + JSON.stringify(delB.j));
  const my3 = await rpc(A.token, 'my_searches', {});
  ok('hledání A po pokusu B pořád existuje', Array.isArray(my3.j) && my3.j.some((x) => x.id === searchId));

  // SOUKROMÍ: B nesmí přepsat seen_keys hledání A
  const mkB = await rpc(B.token, 'mark_search_seen', { p_id: searchId, p_keys: ['hack'] });
  ok('SOUKROMÍ: cizí (B) NEPŘEPÍŠE prohlédnuté A', mkB.j === false, 'ret=' + JSON.stringify(mkB.j));

  // Úklid: A smaže svoje hledání
  const del = await rpc(A.token, 'delete_search', { p_id: searchId });
  ok('A smazal svoje hledání', del.status === 200 && del.j === true, del.txt && del.txt.slice(0, 140));
  const my4 = await rpc(A.token, 'my_searches', {});
  ok('hledání je opravdu pryč', Array.isArray(my4.j) && !my4.j.some((x) => x.id === searchId));

  console.log('\n== VÝSLEDEK: ' + pass + ' OK, ' + fail + ' chyb ==');
  console.log('(Zkušební účty pk-srch-*@example.com můžeš v Supabase → Authentication smazat, nevadí ani když zůstanou.)');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('Test spadl:', e && e.message); process.exit(1); });
