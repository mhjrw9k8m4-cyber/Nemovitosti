// Parcelka — automatický test přidávání inzerátů (moderace). Běží v GitHub
// Action (má síť), ověří na ŽIVÉM Supabase, že create_listing funguje a hlavně
// že server MODERUJE: odmítne vulgarity i spam, drží limit, čistí fotky/detaily.
// Používá jen VEŘEJNÝ anon klíč. Zkušební inzeráty na konci smaže.
const URL = process.env.SB_URL || 'https://tcinuzftgmkvjjgvadky.supabase.co';
const KEY = process.env.SB_KEY || 'sb_publishable_mnPDOe03iHjoDxc7C2x2iA_q4HOSec0';
const rnd = Math.random().toString(36).slice(2, 8);
let pass = 0, fail = 0;
function ok(name, cond, extra) { if (cond) { pass++; console.log('  ✅ ' + name); } else { fail++; console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); } }

async function auth(path, body) {
  const r = await fetch(URL + '/auth/v1/' + path, { method: 'POST', headers: { apikey: KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { status: r.status, j: await r.json().catch(() => ({})) };
}
async function signup(email, pw) {
  let { j } = await auth('signup', { email, password: pw });
  if (j && j.access_token) return { token: j.access_token, uid: j.user && j.user.id };
  const r = await auth('token?grant_type=password', { email, password: pw });
  if (r.j && r.j.access_token) return { token: r.j.access_token, uid: r.j.user && r.j.user.id };
  return { err: (j && (j.msg || j.error_description)) || 'HTTP' };
}
async function rpc(token, fn, args) {
  const r = await fetch(URL + '/rest/v1/rpc/' + fn, {
    method: 'POST', headers: { apikey: KEY, Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(args || {}),
  });
  const txt = await r.text(); let j = null; try { j = txt ? JSON.parse(txt) : null; } catch {}
  return { status: r.status, j, txt };
}
function mkArgs(over) {
  return Object.assign({
    p_place: 'ZKUŠEBNÍ ' + rnd, p_okres: 'Kolín', p_druh: 'stavební pozemek', p_parcel: '0/0',
    p_area: 1000, p_price: 500000, p_lat: 50.03, p_lng: 15.20,
    p_description: 'Pěkný rovinatý pozemek u obce.', p_contact: '777123456',
    p_photos: [], p_features: ['Elektřina', 'Voda'], p_access: 'Zpevněná cesta',
  }, over || {});
}

(async () => {
  console.log('== Test přidávání inzerátů (moderace) ==', new Date().toISOString());
  const A = await signup('pk-list-a-' + rnd + '@example.com', 'Test-' + rnd + 'A1');
  if (!A.token) { console.log('  ❌ Přihlášení selhalo (Confirm email zapnutý?).', A.err); process.exit(1); }
  ok('vytvořen zkušební účet', true);

  // Kvóta na startu
  const q0 = await rpc(A.token, 'my_listing_quota', {});
  const q0row = Array.isArray(q0.j) ? q0.j[0] : q0.j;
  ok('kvóta funguje (free: used 0, max 1)', q0row && q0row.used === 0 && q0row.max === 1, q0.txt && q0.txt.slice(0, 120));

  // Jeden platný inzerát, který ZÁROVEŇ zkouší moderaci: cizí fotka (má se
  // zahodit) + neplatný přístup (má se uložit null) + platné sítě.
  // Pozn.: server má 90s cooldown mezi inzeráty, proto testujeme na jednom.
  const cl = await rpc(A.token, 'create_listing', mkArgs({
    p_photos: ['https://zlyweb.example.com/x.jpg'], p_access: 'VYMYŠLENÝ PŘÍSTUP',
  }));
  const listingId = Array.isArray(cl.j) ? (cl.j[0] && cl.j[0].id) : (cl.j && cl.j.id);
  ok('vytvořen platný inzerát', !!listingId, cl.txt && cl.txt.slice(0, 140));

  const pub = await rpc(A.token, 'public_listings', {});
  const mine = Array.isArray(pub.j) && pub.j.find((x) => x.id === listingId);
  ok('inzerát je ve veřejném seznamu', !!mine);
  ok('sítě (features) uložené', mine && Array.isArray(mine.features) && mine.features.indexOf('Elektřina') >= 0, mine && JSON.stringify(mine.features));
  ok('MODERACE: cizí fotka zahozena (photos prázdné)', mine && Array.isArray(mine.photos) && mine.photos.length === 0, mine && JSON.stringify(mine.photos));
  ok('MODERACE: neplatný přístup zahozen (null)', mine && (mine.access == null), mine && ('access=' + (mine && mine.access)));

  // MODERACE textu — tyhle inzerát NEVYTVOŘÍ (odmítnou se), takže je cooldown netrápí.
  const bad = await rpc(A.token, 'create_listing', mkArgs({ p_description: 'tohle je kokot inzerat' }));
  ok('MODERACE: vulgarita odmítnuta serverem', bad.status >= 400 && /nevhodn/i.test(bad.txt || ''), 'status=' + bad.status + ' ' + (bad.txt || '').slice(0, 80));

  const spam = await rpc(A.token, 'create_listing', mkArgs({ p_description: 'nejlepsi viagra a casino zdarma' }));
  ok('MODERACE: spam odmítnut serverem', spam.status >= 400 && /spam/i.test(spam.txt || ''), 'status=' + spam.status + ' ' + (spam.txt || '').slice(0, 80));

  // FREE LIMIT: druhý inzerát (i jinak platný) se u free účtu odmítne (limit 1).
  // Limit se v create_listing kontroluje PŘED cooldownem, takže hláška je o limitu.
  const second = await rpc(A.token, 'create_listing', mkArgs({ p_place: 'ZKUŠEBNÍ 2 ' + rnd }));
  ok('FREE LIMIT: druhý inzerát odmítnut (limit 1)', second.status >= 400 && /limit/i.test(second.txt || ''), 'status=' + second.status + ' ' + (second.txt || '').slice(0, 80));

  // Kvóta po vytvoření
  const q1 = await rpc(A.token, 'my_listing_quota', {});
  const q1row = Array.isArray(q1.j) ? q1.j[0] : q1.j;
  ok('kvóta ukazuje used 1 z 1 (free)', q1row && q1row.used === 1 && q1row.max === 1, q1row && ('used=' + q1row.used + ' max=' + q1row.max));

  // Úklid: smazat všechny zkušební inzeráty tohoto účtu
  const mine2 = await rpc(A.token, 'my_listings', {});
  const ids = Array.isArray(mine2.j) ? mine2.j.map((x) => x.id) : [];
  let del = 0;
  for (const id of ids) { const d = await rpc(A.token, 'delete_listing', { p_id: id }); if (d.status === 200) del++; }
  ok('úklid: zkušební inzeráty smazány', del === ids.length && ids.length > 0, 'smazáno ' + del + '/' + ids.length);

  console.log('\n== VÝSLEDEK: ' + pass + ' OK, ' + fail + ' chyb ==');
  console.log('(Zkušební účet pk-list-*@example.com můžeš v Supabase → Authentication smazat.)');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('Test spadl:', e && e.message); process.exit(1); });
