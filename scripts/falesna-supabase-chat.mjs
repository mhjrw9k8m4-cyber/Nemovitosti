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

      // Uložená hledání — kvůli odznaku „Hlídání" v menu. Jedno hledání
      // na okres Tábor, nic zatím viděného: co sedí, je nové.
      if (fn === 'my_searches') {
        return send(200, JSON.stringify(uid === UID_MAJITEL
          ? [{ id: 's1', label: 'Tábor', okres: 'Tábor', druh: '', ptype: '', max_price: 0, min_area: 0,
               features: [], seen_keys: videno.get('s1') || [] }]
          : []));
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
