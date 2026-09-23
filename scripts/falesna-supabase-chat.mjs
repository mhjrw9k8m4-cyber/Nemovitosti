// Falešná Supabase pro chat + statický web. Cílem je projít celou cestu
// kupující → majitel → odpověď přesně tak, jak ji projde člověk v telefonu.
import http from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = 8310;

const UID_MAJITEL = '11111111-1111-4111-8111-111111111111';
const UID_ZAJEMCE = '22222222-2222-4222-8222-222222222222';
const UID_ZAJEMCE2 = '33333333-3333-4333-8333-333333333333';
const LISTING = 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa';

const ucty = {                       // token → uid
  'tok-majitel': UID_MAJITEL, 'tok-zajemce': UID_ZAJEMCE, 'tok-zajemce2': UID_ZAJEMCE2,
};
let zpravy = [];                     // {id, created_at, listing_id, buyer_id, sender_id, body, read_at}
const videno = new Map();            // id hledání → klíče pozemků označených za viděné
// Uložená hledání podle uživatele. Majitel má jedno předem (kvůli odznaku
// „Hlídání" v menu), další si testy ukládají samy přes save_search.
const hledani = new Map();
// Inzeráty vložené přes „Přidat pozemek" a kolik jich kdo smí mít.
const inzeraty = [];
const kvota = new Map();
// Výsledky noční kontroly (id inzerátu → {ok, kdy, nalezy}); plní si je test.
const kontroly = new Map();
hledani.set(UID_MAJITEL, [{ id: 's1', label: 'Tábor', okres: 'Tábor', druh: null, ptype: null,
  max_price: 0, min_area: 0, features: [], created_at: new Date().toISOString() }]);
let poradi = 0;
export function stav() { return zpravy; }

function kdo(req) {
  const a = req.headers.authorization || '';
  const t = a.replace(/^Bearer\s+/i, '');
  return ucty[t] || null;
}
const TYPY = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml' };

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');
  const send = (kod, telo, typ) => { res.writeHead(kod, { 'content-type': typ || 'application/json' }); res.end(telo); };
  const telo = () => new Promise((r) => { let b = ''; req.on('data', (c) => (b += c)); req.on('end', () => r(b ? JSON.parse(b) : {})); });

  // ---- auth ----
  // Obnova přihlášení musí vrátit TOHO SAMÉHO člověka. Když to vracelo
  // pořád jeden účet, přepsalo se přihlášení majitele na zájemce hned
  // při otevření schránky — a test to odhalil až podle špatné role.
  const REF = { 'ref-majitel': 'tok-majitel', 'ref-zajemce': 'tok-zajemce', 'ref-zajemce2': 'tok-zajemce2' };
  if (u.pathname === '/auth/v1/token') {
    return telo().then((b) => {
      const tok = REF[b.refresh_token] || 'tok-zajemce';
      const ref = Object.keys(REF).find((k) => REF[k] === tok);
      return send(200, JSON.stringify({ access_token: tok, refresh_token: ref, user: { id: ucty[tok] } }));
    });
  }
  if (u.pathname === '/auth/v1/user') {
    const uid = kdo(req);
    return uid ? send(200, JSON.stringify({ id: uid })) : send(401, JSON.stringify({ message: 'neplatný token' }));
  }

  // ---- RPC ----
  /* Jen pro testy: podstrčí výsledek noční kontroly k inzerátu. Doopravdy
     ho tam zapisuje scripts/kontrola-inzeratu.mjs servisním klíčem. */
  if (u.pathname === '/zkouska/kontrola' && req.method === 'POST') {
    return telo().then((a) => {
      kontroly.set(a.id, { ok: !!a.ok, kdy: a.kdy || new Date().toISOString(), nalezy: a.nalezy || [] });
      return send(200, JSON.stringify({ ok: true }));
    });
  }

  if (u.pathname.startsWith('/rest/v1/rpc/')) {
    const fn = u.pathname.slice('/rest/v1/rpc/'.length);
    return telo().then((args) => {
      const uid = kdo(req);
      if (!uid) return send(401, JSON.stringify({ message: 'musíte být přihlášeni' }));

      if (fn === 'send_message') {
        const jeMajitel = uid === UID_MAJITEL;
        const buyer = jeMajitel ? args.p_buyer : uid;
        if (jeMajitel && !buyer) return send(400, JSON.stringify({ message: 'komu odpovídáte?' }));
        const body = String(args.p_body || '').trim();
        if (!body) return send(400, JSON.stringify({ message: 'zpráva je prázdná' }));
        if (body.length > 2000) return send(400, JSON.stringify({ message: 'zpráva je příliš dlouhá' }));
        if (body === 'RYCHLE') return send(400, JSON.stringify({ message: 'chvíli počkejte' }));
        zpravy.push({ id: 'm' + (++poradi), created_at: new Date().toISOString(), listing_id: args.p_listing,
          buyer_id: buyer, sender_id: uid, body, read_at: null });
        return send(200, JSON.stringify('m' + poradi));
      }

      if (fn === 'thread_messages') {
        const rows = zpravy.filter((m) => m.listing_id === args.p_listing && m.buyer_id === args.p_buyer);
        rows.forEach((m) => { if (m.sender_id !== uid && !m.read_at) m.read_at = new Date().toISOString(); });
        return send(200, JSON.stringify(rows.map((m) => ({ id: m.id, created_at: m.created_at,
          sender_id: m.sender_id, body: m.body, mine: m.sender_id === uid }))));
      }

      if (fn === 'my_threads') {
        const klice = new Map();
        zpravy.forEach((m) => {
          const jsem = m.buyer_id === uid || UID_MAJITEL === uid;
          if (!jsem) return;
          klice.set(m.listing_id + '|' + m.buyer_id, m);
        });
        const out = [...klice.entries()].map(([k, posl]) => {
          const [lid, bid] = k.split('|');
          const vl = zpravy.filter((m) => m.listing_id === lid && m.buyer_id === bid);
          return { listing_id: lid, buyer_id: bid, place: 'Kolín', okres: 'Kolín',
            is_owner: uid === UID_MAJITEL, last_body: vl[vl.length - 1].body,
            last_at: vl[vl.length - 1].created_at,
            unread: vl.filter((m) => m.sender_id !== uid && !m.read_at).length };
        });
        return send(200, JSON.stringify(out));
      }

      /* ---------- Vkládání inzerátu ----------
         Stejné meze jako doopravdy v databázi (create_listing
         v supabase/00-vse.sql). Kdyby tu byly volnější, test by
         prošel i pro zadání, které by živý web odmítl — a to je horší
         než test žádný. */
      if (fn === 'create_listing') {
        const t = (x) => String(x == null ? '' : x).trim();
        const misto = t(args.p_place);
        if (!misto) return send(400, JSON.stringify({ message: 'obec je povinná' }));
        if (misto.length < 2 || misto.length > 60) return send(400, JSON.stringify({ message: 'název obce musí mít 2 až 60 znaků' }));
        if (args.p_lat == null || args.p_lng == null) return send(400, JSON.stringify({ message: 'poloha je povinná' }));
        const blob = [misto, t(args.p_description), t(args.p_parcel)].join(' ').toLowerCase();
        if (/(kokot|kurv|píča|debil|zmrd|hovn|hajzl|prdel|porno)/.test(blob)) {
          return send(400, JSON.stringify({ message: 'obsah obsahuje nevhodná slova' }));
        }
        if (/(viagra|casino|kasino|bitcoin|klikni zde)/.test(blob)) {
          return send(400, JSON.stringify({ message: 'obsah vypadá jako spam' }));
        }
        const plocha = Number(args.p_area), cena = Number(args.p_price);
        if (!(plocha >= 10 && plocha <= 5000000)) return send(400, JSON.stringify({ message: 'výměra musí být mezi 10 m² a 500 ha' }));
        if (!(cena >= 1000 && cena <= 500000000)) return send(400, JSON.stringify({ message: 'cena musí být mezi 1 000 Kč a 500 mil. Kč' }));
        const zaMetr = cena / plocha;
        if (zaMetr < 1 || zaMetr > 100000) return send(400, JSON.stringify({ message: 'cena za m² je mimo reálné rozpětí — zkontrolujte cenu a výměru' }));
        if (t(args.p_description).length > 2000) return send(400, JSON.stringify({ message: 'popis je delší než 2000 znaků' }));
        if (/[<>]/.test(t(args.p_description))) return send(400, JSON.stringify({ message: 'popis nesmí obsahovat značky < a >' }));
        const kontakt = t(args.p_contact);
        if (!(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(kontakt) || /^[+0-9 ()-]{9,}$/.test(kontakt))) {
          return send(400, JSON.stringify({ message: 'kontakt musí být platný telefon nebo e-mail' }));
        }
        const moje = inzeraty.filter((x) => x.user_id === uid);
        if (moje.length >= (kvota.get(uid) || 10)) return send(400, JSON.stringify({ message: 'dosáhli jste limitu inzerátů' }));
        const id = 'l' + (++poradi);
        /* Stav jako doopravdy: create_listing vkládá rovnou 'approved'
           (model „jako Bazoš" — inzerát je na mapě hned, viz
           supabase/listings-autopublish.sql). Kdyby tu stav chyběl,
           stránka „moje inzeráty" by u každého ukázala „čeká" a test by
           si toho nevšiml. */
        inzeraty.push({ id, user_id: uid, status: 'approved', views: 0,
          place: misto, okres: t(args.p_okres), druh: t(args.p_druh),
          parcel: t(args.p_parcel), area: plocha, price: cena, lat: args.p_lat, lng: args.p_lng,
          description: t(args.p_description), contact: kontakt, photos: args.p_photos || [],
          features: args.p_features || [], access: t(args.p_access), created_at: new Date().toISOString() });
        return send(200, JSON.stringify([{ id }]));
      }

      if (fn === 'my_listing_quota') {
        return send(200, JSON.stringify([{ used: inzeraty.filter((x) => x.user_id === uid).length,
          max: kvota.get(uid) || 10 }]));
      }

      if (fn === 'my_listings') {
        /* Výsledek noční kontroly se vrací stejně jako doopravdy
           (my_listings() ho po listings-kontrola-vlastnikovi.sql
           přiváže z tabulky listing_checks). Test si ho může podstrčit
           přes /zkouska/kontrola. */
        return send(200, JSON.stringify(inzeraty.filter((x) => x.user_id === uid).map((x) => {
          const k = kontroly.get(x.id);
          return Object.assign({}, x, k ? { kontrola_ok: k.ok, kontrola_kdy: k.kdy, kontrola_nalezy: k.nalezy }
            : { kontrola_ok: null, kontrola_kdy: null, kontrola_nalezy: [] });
        })));
      }

      /* Smazání smí jen vlastník — stejně jako doopravdy (delete_listing
         maže „where id = … and user_id = auth.uid()"). Kdyby to tu bylo
         volnější, test by neuhlídal, že cizí inzerát smazat nejde. */
      if (fn === 'delete_listing') {
        const i = inzeraty.findIndex((x) => x.id === args.p_id && x.user_id === uid);
        if (i < 0) return send(200, JSON.stringify(false));
        inzeraty.splice(i, 1);
        return send(200, JSON.stringify(true));
      }

      // Uložená hledání. Výchozí je jedno na okres Tábor (kvůli odznaku
      // „Hlídání" v menu); zbytek si test uloží sám přes save_search.
      if (fn === 'my_searches') {
        return send(200, JSON.stringify((hledani.get(uid) || []).map((h) => Object.assign({}, h, {
          seen_keys: videno.get(h.id) || [] }))));
      }

      // Uložení hlídání. Stejné meze jako v databázi: bez přihlášení nic,
      // nejvýš dvacet hledání na člověka.
      if (fn === 'save_search') {
        const moje = hledani.get(uid) || [];
        if (moje.length >= 20) return send(400, JSON.stringify({ message: 'máte uložených už 20 hledání (víc nejde)' }));
        const id = 's' + (++poradi);
        moje.push({ id,
          label: (args.p_label || '').trim() || null,
          okres: (args.p_okres || '').trim() || null,
          druh: (args.p_druh || '').trim() || null,
          ptype: (args.p_type || '').trim() || null,
          max_price: args.p_max_price || 0, min_area: args.p_min_area || 0,
          features: args.p_features || [], created_at: new Date().toISOString() });
        hledani.set(uid, moje);
        return send(200, JSON.stringify(id));
      }

      if (fn === 'delete_search') {
        hledani.set(uid, (hledani.get(uid) || []).filter((h) => h.id !== args.p_id));
        videno.delete(args.p_id);
        return send(200, 'null');
      }

      // Označení pozemků za viděné — po něm musí upozornění z centra zmizet.
      if (fn === 'mark_search_seen') {
        videno.set(args.p_id, (videno.get(args.p_id) || []).concat(args.p_keys || []));
        return send(200, 'null');
      }

      if (fn === 'unread_count') {
        const n = zpravy.filter((m) => m.sender_id !== uid && !m.read_at &&
          (m.buyer_id === uid || uid === UID_MAJITEL)).length;
        return send(200, JSON.stringify(n));
      }
      return send(404, JSON.stringify({ message: 'neznámá funkce ' + fn }));
    });
  }
  if (u.pathname.startsWith('/rest/v1/')) return send(200, '[]');

  // ---- statický web ----
  let p = u.pathname === '/' ? '/index.html' : u.pathname;
  const f = path.join(ROOT, decodeURIComponent(p));
  if (!f.startsWith(ROOT) || !existsSync(f)) return send(404, 'nenalezeno', 'text/plain');
  return send(200, readFileSync(f), TYPY[path.extname(f)] || 'application/octet-stream');
});

server.listen(PORT, '127.0.0.1', () => console.log('chat server na ' + PORT));
export { PORT, UID_MAJITEL, UID_ZAJEMCE, UID_ZAJEMCE2, LISTING };
