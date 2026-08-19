// Parcelka — jednoduché přihlašování přes Supabase Auth (e-mail + heslo).
// Používá se na pridat.html a muj-inzerat.html. Session se ukládá v prohlížeči.
(function () {
  var URL = (window.PK_SUPABASE_URL || '');
  var KEY = (window.PK_SUPABASE_KEY || '');
  var LSKEY = 'pk_auth';

  function getSession() { try { return JSON.parse(localStorage.getItem(LSKEY) || 'null'); } catch (e) { return null; } }
  function setSession(s) { try { if (s) localStorage.setItem(LSKEY, JSON.stringify(s)); else localStorage.removeItem(LSKEY); } catch (e) {} }
  function loggedIn() { var s = getSession(); return !!(s && s.access_token); }
  function email() { var s = getSession(); return (s && s.user && s.user.email) || ''; }

  function headers(useUser) {
    var h = { 'apikey': KEY, 'Content-Type': 'application/json' };
    var s = getSession();
    h['Authorization'] = 'Bearer ' + ((useUser && s && s.access_token) ? s.access_token : KEY);
    return h;
  }

  function signup(mail, pw) {
    return fetch(URL + '/auth/v1/signup', {
      method: 'POST', headers: { 'apikey': KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: mail, password: pw })
    }).then(function (r) {
      return r.json().then(function (j) {
        // Když je „Confirm email" vypnuté, přijde rovnou session → přihlásíme.
        if (r.ok && j.access_token) { setSession(j); }
        else if (r.ok && j.session && j.session.access_token) { setSession(j.session); }
        return { ok: r.ok, data: j, session: loggedIn() };
      });
    }).catch(function () { return { ok: false, data: { msg: 'Připojení selhalo.' } }; });
  }

  function login(mail, pw) {
    return fetch(URL + '/auth/v1/token?grant_type=password', {
      method: 'POST', headers: { 'apikey': KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: mail, password: pw })
    }).then(function (r) {
      return r.json().then(function (j) {
        if (r.ok && j.access_token) { setSession(j); }
        return { ok: r.ok && !!j.access_token, data: j };
      });
    }).catch(function () { return { ok: false, data: { msg: 'Připojení selhalo.' } }; });
  }

  function logout() { setSession(null); }

  // Automatické obnovení přihlášení (aby po hodině nevypadl) — přes refresh token.
  function refresh() {
    var s = getSession();
    if (!s || !s.refresh_token) return Promise.resolve(false);
    return fetch(URL + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST', headers: { 'apikey': KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: s.refresh_token })
    }).then(function (r) {
      return r.json().then(function (j) {
        if (r.ok && j.access_token) { setSession(j); return true; }
        setSession(null); return false;
      });
    }).catch(function () { return false; });
  }
  function parse(r) {
    if (!r.ok) return r.json().then(function (j) { return { ok: false, error: j, status: r.status }; }).catch(function () { return { ok: false, status: r.status }; });
    return r.json().then(function (j) { return { ok: true, data: j }; }).catch(function () { return { ok: true, data: null }; });
  }
  // Volání Supabase funkce jako přihlášený uživatel (nebo veřejně).
  // Když vyprší přihlášení (401), samo se obnoví a zkusí to znovu.
  function rpc(fn, args, asUser) {
    var u = asUser !== false;
    return fetch(URL + '/rest/v1/rpc/' + fn, { method: 'POST', headers: headers(u), body: JSON.stringify(args || {}) })
      .then(function (r) {
        if (r.status === 401 && u) {
          return refresh().then(function (ok) {
            if (!ok) return { ok: false, expired: true };
            return fetch(URL + '/rest/v1/rpc/' + fn, { method: 'POST', headers: headers(true), body: JSON.stringify(args || {}) }).then(parse);
          });
        }
        return parse(r);
      }).catch(function () { return { ok: false }; });
  }

  window.PKAuth = {
    ready: !!(URL && KEY),
    getSession: getSession, loggedIn: loggedIn, email: email,
    signup: signup, login: login, logout: logout, rpc: rpc
  };
})();
