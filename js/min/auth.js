(function () {
  var URL = (window.PK_SUPABASE_URL || '');
  var KEY = (window.PK_SUPABASE_KEY || '');
  var LSKEY = 'pk_auth';

  function deviceId() {
    try {
      var d = localStorage.getItem('pk_device');
      if (!d) {
        d = (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
            : (Date.now().toString(36) + Math.random().toString(36).slice(2, 12));
        localStorage.setItem('pk_device', d);
      }
      return d;
    } catch (e) { return ''; }
  }

  function getSession() { try { return JSON.parse(localStorage.getItem(LSKEY) || 'null'); } catch (e) { return null; } }

  function setSession(s) {
    try {
      if (s) {
        if (!s.expires_at && s.expires_in) s.expires_at = Math.floor(Date.now() / 1000) + Number(s.expires_in);
        localStorage.setItem(LSKEY, JSON.stringify(s));
      } else localStorage.removeItem(LSKEY);
    } catch (e) {}
  }

  function platiJeste(rezerva) {
    var s = getSession();
    if (!s || !s.access_token) return false;
    if (!s.expires_at) return false;
    return (Number(s.expires_at) - Math.floor(Date.now() / 1000)) > (rezerva || 0);
  }
  function loggedIn() { var s = getSession(); return !!(s && s.access_token); }
  function email() { var s = getSession(); return (s && s.user && s.user.email) || ''; }
  function uid() { var s = getSession(); return (s && s.user && s.user.id) || ''; }
  function token() { var s = getSession(); return (s && s.access_token) || ''; }

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

  function recover(mail) {
    var redir = '';
    try { redir = location.origin + '/muj-inzerat.html'; } catch (e) {}
    var ep = URL + '/auth/v1/recover' + (redir ? ('?redirect_to=' + encodeURIComponent(redir)) : '');
    return fetch(ep, {
      method: 'POST', headers: { 'apikey': KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: mail, redirect_to: redir || undefined })
    }).then(function (r) { return { ok: r.ok }; }).catch(function () { return { ok: false }; });
  }

  function recoveryToken() {
    try {
      var h = (location.hash || '').replace(/^#/, '');
      if (h.indexOf('type=recovery') === -1) return '';
      var m = /access_token=([^&]+)/.exec(h);
      return m ? decodeURIComponent(m[1]) : '';
    } catch (e) { return ''; }
  }
  function setPassword(newPw, accessToken) {
    return fetch(URL + '/auth/v1/user', {
      method: 'PUT',
      headers: { 'apikey': KEY, 'Authorization': 'Bearer ' + accessToken, 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: newPw })
    }).then(function (r) {
      return r.json().then(function (j) {
        if (r.ok) { setSession({ access_token: accessToken, user: j }); }
        return { ok: r.ok, data: j };
      });
    }).catch(function () { return { ok: false }; });
  }

  var probihaObnova = null;

  var POCKANI_MS = 1000;

  function nekdoObnovilJinde(poslanyToken, doKdy) {
    var s = getSession();
    if (s && s.refresh_token && s.refresh_token !== poslanyToken) return Promise.resolve(true);
    if (Date.now() >= doKdy) return Promise.resolve(false);
    return new Promise(function (hotovo) {
      setTimeout(function () { nekdoObnovilJinde(poslanyToken, doKdy).then(hotovo); }, 50);
    });
  }
  function refresh(vynutit) {
    var s = getSession();
    if (!s || !s.refresh_token) return Promise.resolve(false);
    if (!vynutit && platiJeste(300)) return Promise.resolve(true);
    if (probihaObnova) return probihaObnova;
    var poslanyToken = s.refresh_token;
    probihaObnova = fetch(URL + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST', headers: { 'apikey': KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: poslanyToken })
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (r.ok && j.access_token) { setSession(j); return true; }

        var duvod = String((j && (j.error_code || j.error || j.msg || j.message)) || '').toLowerCase();
        var opravduNeplati = (r.status === 400 || r.status === 401) &&
          /invalid|expired|revoked|not\s*found|already\s*used/.test(duvod);
        if (opravduNeplati) {

          return nekdoObnovilJinde(poslanyToken, Date.now() + POCKANI_MS).then(function (jinde) {
            if (jinde) return true;
            setSession(null);
            return false;
          });
        }
        return false;
      });
    }).catch(function () { return false; })
      .then(function (v) { probihaObnova = null; return v; });
    return probihaObnova;
  }

  function keepAlive() {
    var s = getSession();
    if (!s || !s.access_token) return Promise.resolve(false);
    if (!s.refresh_token) return Promise.resolve(true);
    if (platiJeste(300)) return Promise.resolve(true);
    return refresh().then(function (ok) { return ok || loggedIn(); });
  }
  function parse(r) {
    if (!r.ok) return r.json().then(function (j) { return { ok: false, error: j, status: r.status }; }).catch(function () { return { ok: false, status: r.status }; });
    return r.json().then(function (j) { return { ok: true, data: j }; }).catch(function () { return { ok: true, data: null }; });
  }

  function rpc(fn, args, asUser) {
    var u = asUser !== false;
    return fetch(URL + '/rest/v1/rpc/' + fn, { method: 'POST', headers: headers(u), body: JSON.stringify(args || {}) })
      .then(function (r) {
        if (r.status === 401 && u) {

          return refresh(true).then(function (ok) {
            if (!ok) return { ok: false, expired: true };
            return fetch(URL + '/rest/v1/rpc/' + fn, { method: 'POST', headers: headers(true), body: JSON.stringify(args || {}) }).then(parse);
          });
        }
        return parse(r);
      }).catch(function () { return { ok: false }; });
  }

  deviceId();

  window.PKAuth = {
    ready: !!(URL && KEY),
    getSession: getSession, loggedIn: loggedIn, email: email, uid: uid, token: token, deviceId: deviceId,
    signup: signup, login: login, logout: logout, rpc: rpc, keepAlive: keepAlive, platiJeste: platiJeste,
    recover: recover, recoveryToken: recoveryToken, setPassword: setPassword
  };
})();
