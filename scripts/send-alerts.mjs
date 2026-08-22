// =====================================================================
// Parcelka — rozesílání upozornění na lokalitu (běží v GitHub Action).
//
// Co dělá při každém běhu:
//   1) Načte aktuální příležitosti (data/opportunities.json).
//   2) Nové (dosud neviděné) zapíše do tabulky alert_seen v Supabase.
//      → PRVNÍ běh jen "zapamatuje" současný stav a NIC nepošle (pojistka
//        proti zaplavení e-maily starým backlogem).
//   3) Nepotvrzeným přihláškám pošle POTVRZOVACÍ e-mail (double opt-in).
//   4) Potvrzeným přihláškám pošle NOVÉ příležitosti v jejich okrese/typu.
//
// BEZPEČNOST / ZKUŠEBNÍ REŽIM:
//   Ve výchozím stavu je DRY-RUN — jen vypíše, co by poslal, ale NIC neodešle
//   a nic v databázi nemění. Ostré odesílání zapneš proměnnou ALERTS_LIVE=1.
//   Doporučeno: nech pár běhů v dry-run, zkontroluj log, pak teprve zapni.
//
// Proměnné prostředí (GitHub → Settings → Secrets and variables → Actions):
//   SUPABASE_URL               (nepovinné; jinak výchozí z projektu)
//   SUPABASE_SERVICE_ROLE_KEY  (TAJNÉ — service_role klíč ze Supabase)
//   RESEND_API_KEY             (TAJNÉ — klíč z Resend)
//   ALERT_FROM                 (např. "Parcelka <upozorneni@parcelaka.cz>")
//   SITE_URL                   (např. "https://parcelaka.cz")
//   ALERTS_LIVE                (=1 zapne ostré odesílání; jinak dry-run)
// =====================================================================

import { readFile } from 'node:fs/promises';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://tcinuzftgmkvjjgvadky.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const ALERT_FROM = process.env.ALERT_FROM || 'Parcelka <onboarding@resend.dev>';
const SITE_URL = (process.env.SITE_URL || 'https://parcelaka.cz').replace(/\/+$/, '');
const LIVE = process.env.ALERTS_LIVE === '1';

const MAX_ITEMS_PER_EMAIL = 12;   // kolik příležitostí nejvýš vypíšeme v jednom e-mailu
const MAX_CONFIRM_PER_RUN = 200;  // strop potvrzovacích e-mailů za běh
const MAX_ALERTS_PER_RUN = 500;   // strop upozorňovacích e-mailů za běh

function log(...a) { console.log(...a); }
function die(msg) { console.error('CHYBA:', msg); process.exit(1); }

// --- diakritika pryč + malá písmena (pro porovnávání okresů) ---
function norm(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}
function fmt(n) { return (typeof n === 'number' && n > 0) ? n.toLocaleString('cs-CZ') : ''; }

// Stabilní otisk příležitosti (ať poznáme, co je nové a neposíláme to dvakrát)
function keyOf(o) {
  return [o.type || '', norm(o.okres), norm(o.place), o.parcel || '', o.price || '', o.area || '']
    .join('|').slice(0, 240);
}

// --- Supabase REST (service_role obchází RLS) ---
async function sb(path, opts = {}) {
  const r = await fetch(SUPABASE_URL + '/rest/v1/' + path, {
    ...opts,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: 'Bearer ' + SERVICE_KEY,
      'Content-Type': 'application/json',
      ...(opts.headers || {})
    }
  });
  if (!r.ok) throw new Error('Supabase ' + path + ' → ' + r.status + ' ' + (await r.text()).slice(0, 300));
  const txt = await r.text();
  return txt ? JSON.parse(txt) : null;
}

async function resendSend(to, subject, html) {
  if (!LIVE) { log('  [dry-run] e-mail →', to, '|', subject); return true; }
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + RESEND_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: ALERT_FROM, to: [to], subject, html })
  });
  if (!r.ok) { console.error('  Resend selhal pro', to, '→', r.status, (await r.text()).slice(0, 200)); return false; }
  return true;
}

// --- šablony e-mailů (jednoduché, čitelné, s odhlášením) ---
function shell(inner) {
  return '<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;color:#1a2735;">' +
    '<div style="font-size:20px;font-weight:800;color:#2f6fd6;padding:8px 0 16px;">Parcelka</div>' +
    inner +
    '<hr style="border:none;border-top:1px solid #e3e9f0;margin:22px 0 12px;">' +
    '<div style="font-size:12px;color:#8090a2;">Parcelka — příležitosti u pozemků na jedné mapě. ' +
    'Data z veřejných zdrojů, ověření vždy v katastru.</div></div>';
}
function confirmEmail(sub) {
  const link = SITE_URL + '/upozorneni.html?confirm=' + encodeURIComponent(sub.confirm_token);
  const kde = sub.okres ? ('okres <b>' + esc(sub.okres) + '</b>') : 'vaše okolí';
  return shell(
    '<p style="font-size:15px;line-height:1.5;">Děkujeme za zájem o hlídání lokality. Ještě prosím potvrďte, ' +
    'že chcete dostávat upozornění na nové pozemky pro ' + kde + '.</p>' +
    '<p style="margin:22px 0;"><a href="' + link + '" style="background:#2f6fd6;color:#fff;text-decoration:none;' +
    'font-weight:700;padding:12px 22px;border-radius:10px;display:inline-block;">Potvrdit hlídání</a></p>' +
    '<p style="font-size:13px;color:#8090a2;">Pokud jste o hlídání nežádali, tento e-mail ignorujte — bez potvrzení nic neposíláme.</p>'
  );
}
function alertEmail(sub, items) {
  const unsub = SITE_URL + '/upozorneni.html?unsubscribe=' + encodeURIComponent(sub.unsubscribe_token);
  const kde = sub.okres ? ('okres ' + esc(sub.okres)) : 'vaše okolí';
  const rows = items.map(o => {
    const bits = [];
    if (o.druh) bits.push(esc(o.druh));
    if (fmt(o.area)) bits.push(fmt(o.area) + ' m²');
    if (fmt(o.price)) bits.push(fmt(o.price) + ' Kč');
    const link = SITE_URL + '/index.html?kraj=' + encodeURIComponent(o.okres || '') + '#mapa';
    return '<tr><td style="padding:10px 0;border-bottom:1px solid #eef2f7;">' +
      '<div style="font-weight:700;font-size:15px;">' + esc(o.place || 'Neuvedeno') + '</div>' +
      '<div style="font-size:13px;color:#6b7a8d;">' + bits.join(' · ') + '</div>' +
      '<a href="' + link + '" style="font-size:13px;color:#2f6fd6;text-decoration:none;">Zobrazit na mapě →</a>' +
      '</td></tr>';
  }).join('');
  return shell(
    '<p style="font-size:15px;line-height:1.5;">Objevily se <b>nové příležitosti</b> pro ' + kde + ':</p>' +
    '<table style="width:100%;border-collapse:collapse;margin:10px 0;">' + rows + '</table>' +
    '<p style="font-size:13px;color:#8090a2;margin-top:18px;">' +
    '<a href="' + unsub + '" style="color:#8090a2;">Odhlásit hlídání</a></p>'
  );
}

// --- porovnání okresu přihlášky s příležitostí ---
function matchesOkres(subOkres, o) {
  if (!subOkres) return true;                 // hlídá „okolí" = vše
  const s = norm(subOkres);
  if (!s) return true;
  const ok = norm(o.okres), pl = norm(o.place);
  return ok === s || ok.includes(s) || s.includes(ok) || pl.includes(s);
}
function matchesType(types, o) {
  if (!Array.isArray(types) || !types.length) return true;   // prázdné = všechny typy
  return types.includes(o.type);
}

async function main() {
  log('== Parcelka: rozesílání upozornění ==', LIVE ? '(OSTRÝ REŽIM)' : '(zkušební — nic se neodešle)');
  // Ještě není nastavené (chybí klíč) → tiše skonči ÚSPĚŠNĚ, ať nechodí „failed" e-maily.
  if (!SERVICE_KEY) { log('SUPABASE_SERVICE_ROLE_KEY není nastavený — upozornění zatím nejsou zapnutá. Končím bez akce.'); return; }
  if (LIVE && !RESEND_API_KEY) { log('Ostrý režim zapnutý, ale chybí RESEND_API_KEY — nic neodesílám. Doplňte klíč.'); return; }

  // 1) načti příležitosti
  let raw;
  try { raw = JSON.parse(await readFile(new URL('../data/opportunities.json', import.meta.url), 'utf8')); }
  catch (e) { die('nelze načíst data/opportunities.json: ' + e.message); }
  const opps = (Array.isArray(raw) ? raw : (raw.opportunities || raw.items || []))
    .filter(o => o && typeof o.lat === 'number' && typeof o.lng === 'number');
  log('Příležitostí v datech:', opps.length);

  // Přidáme i schválené inzeráty od lidí — ať upozorníme i na nově přidané pozemky.
  try {
    const ul = await sb('listings?select=place,okres,druh,parcel,area,price,lat,lng&status=eq.approved');
    if (Array.isArray(ul)) {
      let added = 0;
      ul.forEach(u => {
        if (u && typeof u.lat === 'number' && typeof u.lng === 'number') {
          opps.push({ type: 'majitel', place: u.place, okres: u.okres, druh: u.druh,
            parcel: u.parcel, area: u.area, price: u.price, lat: u.lat, lng: u.lng });
          added++;
        }
      });
      log('Inzerátů od lidí:', added);
    }
  } catch (e) { log('Inzeráty od lidí se nepodařilo načíst:', e.message); }

  // je tabulka alert_seen prázdná? (první běh → jen seed, nic neposílat)
  const seenCount = await sb('alert_seen?select=key&limit=1');
  const firstRun = !(Array.isArray(seenCount) && seenCount.length);

  // 2) zapiš nové do alert_seen; response (ignore-duplicates) vrátí jen NOVĚ vložené
  const byKey = new Map();
  for (const o of opps) { const k = keyOf(o); if (!byKey.has(k)) byKey.set(k, o); }
  const rowsToInsert = [...byKey.entries()].map(([key, o]) => ({
    key, okres: o.okres || null, type: o.type || null, place: o.place || null,
    price: (typeof o.price === 'number' ? o.price : null), area: (typeof o.area === 'number' ? o.area : null),
    lat: o.lat, lng: o.lng, url: o.url || null
  }));

  let newOpps = [];
  if (LIVE) {
    // vlož po dávkách; ignore-duplicates → vrací jen skutečně nové řádky
    for (let i = 0; i < rowsToInsert.length; i += 500) {
      const chunk = rowsToInsert.slice(i, i + 500);
      const inserted = await sb('alert_seen', {
        method: 'POST',
        headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
        body: JSON.stringify(chunk)
      });
      if (Array.isArray(inserted)) newOpps.push(...inserted);
    }
  } else {
    // dry-run: nové = ty, jejichž klíč ještě není v alert_seen
    const existing = await sb('alert_seen?select=key');
    const have = new Set((existing || []).map(r => r.key));
    newOpps = rowsToInsert.filter(r => !have.has(r.key));
  }
  // připoj plná data příležitosti (kvůli druhu apod.)
  newOpps = newOpps.map(r => ({ ...(byKey.get(r.key) || {}), ...r }));
  log('Nových příležitostí od minule:', newOpps.length);

  // 3) přihlášky
  const subs = await sb('watch_subscriptions?select=*&active=eq.true');
  log('Aktivních přihlášek:', Array.isArray(subs) ? subs.length : 0);

  // 3a) potvrzovací e-maily nepotvrzeným (posílají se VŽDY — i při prvním běhu, hlídá confirm_sent_at)
  let confirmSent = 0;
  for (const s of (subs || [])) {
    if (s.confirmed || !s.confirm_token) continue;
    if (s.confirm_sent_at) continue;
    if (confirmSent >= MAX_CONFIRM_PER_RUN) break;
    const ok = await resendSend(s.email, 'Potvrďte hlídání lokality — Parcelka', confirmEmail(s));
    if (ok) {
      confirmSent++;
      if (LIVE) await sb('watch_subscriptions?id=eq.' + s.id, {
        method: 'PATCH', body: JSON.stringify({ confirm_sent_at: new Date().toISOString() })
      });
    }
  }
  log('Potvrzovacích e-mailů:', confirmSent);

  // Při PRVNÍM běhu jen zapamatujeme stav a upozornění NEposíláme (ať nikoho nezavalí starý seznam).
  if (firstRun) {
    log('PRVNÍ běh — zapamatoval jsem si příležitosti, upozornění zatím neposílám.');
    log('== Hotovo ==');
    return;
  }

  // 3b) upozornění potvrzeným — jen NOVÉ příležitosti v jejich okrese/typu
  let alertSent = 0;
  for (const s of (subs || [])) {
    if (!s.confirmed) continue;
    if (alertSent >= MAX_ALERTS_PER_RUN) break;
    const since = s.last_notified_at ? Date.parse(s.last_notified_at) : 0;
    const items = newOpps.filter(o =>
      matchesOkres(s.okres, o) && matchesType(s.types, o) &&
      (!o.first_seen || !since || Date.parse(o.first_seen) > since)
    ).slice(0, MAX_ITEMS_PER_EMAIL);
    if (!items.length) continue;
    const ok = await resendSend(s.email, 'Nové pozemky ' + (s.okres ? ('— okres ' + s.okres) : 've vašem okolí') + ' — Parcelka', alertEmail(s, items));
    if (ok) {
      alertSent++;
      if (LIVE) await sb('watch_subscriptions?id=eq.' + s.id, {
        method: 'PATCH', body: JSON.stringify({ last_notified_at: new Date().toISOString() })
      });
    }
  }
  log('Upozorňovacích e-mailů:', alertSent);
  log('== Hotovo ==');
}

main().catch(e => die(e.message));
