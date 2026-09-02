// Parcelka — automatický test psaní v aplikaci (běží v GitHub Action, má síť).
// Ověří na ŽIVÉM Supabase, že chat funguje: dva zkušební účty, zkušební inzerát,
// odeslání zprávy, doručení oběma stranám, soukromí (cizí nepřečte). Zkušební
// inzerát na konci smaže (kaskádou zmizí i zprávy). Používá jen VEŘEJNÝ anon klíč.
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
  // Confirm email zapnutý? zkusíme rovnou login (pokud OFF, projde)
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
  console.log('== Test psaní v aplikaci ==', new Date().toISOString());
  const A = await signup('pk-chat-a-' + rnd + '@example.com', 'Test-' + rnd + 'A1');
  const B = await signup('pk-chat-b-' + rnd + '@example.com', 'Test-' + rnd + 'B1');
  const C = await signup('pk-chat-c-' + rnd + '@example.com', 'Test-' + rnd + 'C1');
  if (!A.token || !B.token || !C.token) {
    console.log('  ❌ Přihlášení účtů selhalo — nejspíš je zapnuté „Confirm email".');
    console.log('     A:', A.err || 'ok', '| B:', B.err || 'ok', '| C:', C.err || 'ok');
    console.log('  → Supabase → Authentication → Providers → Email → Confirm email = OFF, pak spusť test znovu.');
    process.exit(1);
  }
  ok('vytvořeny 3 zkušební účty (A, B, C)', true);

  // A založí zkušební inzerát
  const cl = await rpc(A.token, 'create_listing', {
    p_place: 'ZKUŠEBNÍ ' + rnd, p_okres: 'Kolín', p_druh: 'stavební pozemek', p_parcel: '0/0',
    p_area: 1000, p_price: 500000, p_lat: 50.03, p_lng: 15.20, p_description: 'test chatu', p_contact: '',
  });
  const listingId = Array.isArray(cl.j) ? (cl.j[0] && cl.j[0].id) : (cl.j && cl.j.id);
  ok('A založil zkušební inzerát', !!listingId, cl.txt && cl.txt.slice(0, 120));
  if (!listingId) { console.log('== Konec (bez inzerátu nelze testovat) =='); process.exit(1); }

  // B napíše majiteli (A)
  const s1 = await rpc(B.token, 'send_message', { p_listing: listingId, p_buyer: null, p_body: 'Dobrý den, je pozemek ještě volný?' });
  ok('B odeslal zprávu majiteli', s1.status === 200 && !!s1.j, s1.txt && s1.txt.slice(0, 120));

  // A vidí vlákno + nepřečtenou
  const t1 = await rpc(A.token, 'my_threads', {});
  const aThread = Array.isArray(t1.j) && t1.j[0];
  ok('A vidí konverzaci ve schránce', !!aThread, t1.txt && t1.txt.slice(0, 120));
  ok('A má 1 nepřečtenou zprávu', aThread && aThread.unread === 1, aThread && ('unread=' + aThread.unread));
  ok('A je označen jako majitel', aThread && aThread.is_owner === true);
  const buyerId = aThread && aThread.buyer_id;

  // A si přečte vlákno (a označí přečtené) a odpoví
  const tm1 = await rpc(A.token, 'thread_messages', { p_listing: listingId, p_buyer: buyerId });
  ok('A přečte zprávu od B', Array.isArray(tm1.j) && tm1.j.length === 1 && /volný/.test(tm1.j[0].body || ''), tm1.txt && tm1.txt.slice(0, 120));
  const s2 = await rpc(A.token, 'send_message', { p_listing: listingId, p_buyer: buyerId, p_body: 'Ano, volný je. Kdy se přijdete podívat?' });
  ok('A odpověděl kupujícímu', s2.status === 200 && !!s2.j, s2.txt && s2.txt.slice(0, 120));

  // B vidí odpověď
  const tm2 = await rpc(B.token, 'thread_messages', { p_listing: listingId, p_buyer: B.uid });
  ok('B vidí obě zprávy (i odpověď majitele)', Array.isArray(tm2.j) && tm2.j.length === 2, tm2.txt && tm2.txt.slice(0, 120));

  // SOUKROMÍ: cizí účet C nesmí číst cizí konverzaci
  const tmC = await rpc(C.token, 'thread_messages', { p_listing: listingId, p_buyer: buyerId });
  ok('SOUKROMÍ: cizí (C) NEPŘEČTE konverzaci', tmC.status !== 200 || !(Array.isArray(tmC.j) && tmC.j.length), 'status=' + tmC.status);
  const thC = await rpc(C.token, 'my_threads', {});
  ok('SOUKROMÍ: cizí (C) nemá ve schránce nic', Array.isArray(thC.j) && thC.j.length === 0);

  // unread_count pro A po přečtení = 0
  const uc = await rpc(A.token, 'unread_count', {});
  ok('A má po přečtení 0 nepřečtených', (typeof uc.j === 'number' ? uc.j : -1) === 0, 'unread_count=' + uc.j);

  // Úklid: A smaže zkušební inzerát (kaskádou zmizí i zprávy)
  const del = await rpc(A.token, 'delete_listing', { p_id: listingId });
  ok('úklid: zkušební inzerát smazán', del.status === 200, del.txt && del.txt.slice(0, 120));

  console.log('\n== VÝSLEDEK: ' + pass + ' OK, ' + fail + ' chyb ==');
  console.log('(Zkušební účty pk-chat-*@example.com můžeš v Supabase → Authentication smazat, nevadí ani když zůstanou.)');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('Test spadl:', e && e.message); process.exit(1); });
