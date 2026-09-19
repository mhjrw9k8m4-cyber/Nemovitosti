// Pravidelná kontrola zveřejněných inzerátů.
//
// Co dělá:
//   1) u každého inzerátu zkusí jeho odkaz — TŘIKRÁT za sebou s rostoucí
//      pauzou, protože jediná odpověď ze sítě nic nedokazuje,
//   2) u každé fotky ověří, že v úložišti pořád je a že je to obrázek,
//   3) spočítá otisk fotky a porovná ho se všemi ostatními — tím pozná
//      obrázek zkopírovaný z cizího inzerátu,
//   4) výsledky zapíše do tabulky listing_checks.
//
// Nic sám nemaže ani neskrývá: jen zapíše, co našel. Rozhodnutí o inzerátu
// je na člověku (nebo na pozdější frontě na schválení).
//
// Spuštění:  node scripts/kontrola-inzeratu.mjs
//   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  — bez nich skript nic nedělá
//   KONTROLA_LIMIT=50                        — kolik inzerátů projít (výchozí 200)
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const require_ = createRequire(import.meta.url);
const K = require_(path.join(ROOT, 'js', 'opakovana-kontrola.js'));

const SUPABASE_URL = (process.env.SUPABASE_URL || 'https://tcinuzftgmkvjjgvadky.supabase.co').replace(/\/+$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const LIMIT = parseInt(process.env.KONTROLA_LIMIT || '200', 10);
const CAS_LIMIT = 15000;     // ms na jeden pokus

const log = (...a) => console.log(...a);
const spi = (ms) => new Promise((r) => setTimeout(r, ms));

async function sb(cesta, volby = {}) {
  const r = await fetch(SUPABASE_URL + '/rest/v1/' + cesta, {
    ...volby,
    headers: {
      apikey: SERVICE_KEY, Authorization: 'Bearer ' + SERVICE_KEY,
      'Content-Type': 'application/json', ...(volby.headers || {}),
    },
  });
  const telo = await r.text();
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${telo.slice(0, 200)}`);
  return telo ? JSON.parse(telo) : null;
}

/* Jeden pokus o stažení hlavičky. Vrací tvar, kterému rozumí
   js/opakovana-kontrola.js — tedy stav, výslednou adresu a typ obsahu. */
async function pokus(url, metoda = 'HEAD') {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), CAS_LIMIT);
  try {
    const r = await fetch(url, {
      method: metoda, redirect: 'follow', signal: ac.signal,
      headers: { 'User-Agent': 'ParcelkaBot/1.0 (+https://parcelaka.cz)' },
    });
    return { stav: r.status, url: r.url || url, typ: r.headers.get('content-type') || '', chyba: null };
  } catch (e) {
    return { stav: 0, url: null, typ: '', chyba: (e && (e.code || e.name || e.message) || 'chyba').slice(0, 40) };
  } finally { clearTimeout(t); }
}

/* Několik pokusů za sebou. Jakmile jeden uspěje, dál se nezkouší —
   opakuje se jen to, co selhalo. */
async function zkusOpakovane(url, metoda = 'HEAD') {
  const pokusy = [];
  for (let i = 0; i < K.POKUSY; i++) {
    if (K.PAUZY[i]) await spi(K.PAUZY[i]);
    const p = await pokus(url, metoda);
    pokusy.push(p);
    if (!p.chyba && p.stav >= 200 && p.stav < 400) break;
    // Některé servery HEAD neumí — u 405 to zkusíme ještě jednou jako GET.
    if (p.stav === 405 && metoda === 'HEAD') {
      const g = await pokus(url, 'GET');
      pokusy.push(g);
      if (!g.chyba && g.stav >= 200 && g.stav < 400) break;
    }
  }
  return pokusy;
}

// --- otisk fotky ---------------------------------------------------------
let dekodujJpeg = null;
try { dekodujJpeg = require_('jpeg-js'); } catch { /* balíček není → otisky přeskočíme */ }

/* Zmenší obrázek na 9×8 šedých bodů (prostým průměrem oblastí) a spočítá
   otisk. Nepotřebuje plátno ani knihovnu na zmenšování. */
function otiskZPixelu(data, sirka, vyska) {
  const S = 9, V = 8, jasy = new Array(S * V).fill(0);
  for (let y = 0; y < V; y++) {
    for (let x = 0; x < S; x++) {
      const x0 = Math.floor((x * sirka) / S), x1 = Math.max(x0 + 1, Math.floor(((x + 1) * sirka) / S));
      const y0 = Math.floor((y * vyska) / V), y1 = Math.max(y0 + 1, Math.floor(((y + 1) * vyska) / V));
      let soucet = 0, pocet = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const i = (yy * sirka + xx) * 4;
          soucet += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          pocet++;
        }
      }
      jasy[y * S + x] = pocet ? soucet / pocet : 0;
    }
  }
  return K.otisk(jasy);
}

async function otiskFotky(url) {
  if (!dekodujJpeg) return null;
  try {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), CAS_LIMIT);
    const r = await fetch(url, { signal: ac.signal });
    clearTimeout(t);
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 12 * 1024 * 1024) return null;
    const obr = dekodujJpeg.decode(buf, { useTArray: true, maxMemoryUsageInMB: 128 });
    return otiskZPixelu(obr.data, obr.width, obr.height);
  } catch { return null; }
}

// --- hlavní běh ----------------------------------------------------------
async function main() {
  log('== Parcelka: pravidelná kontrola inzerátů ==');
  if (!SERVICE_KEY) {
    log('Chybí SUPABASE_SERVICE_ROLE_KEY — nic nekontroluji. (V GitHubu: Settings → Secrets.)');
    return;
  }

  const inzeraty = await sb(`listings?select=id,place,okres,url,photos,status&status=eq.approved&order=created_at.desc&limit=${LIMIT}`);
  log(`Inzerátů ke kontrole: ${Array.isArray(inzeraty) ? inzeraty.length : 0}`);
  if (!Array.isArray(inzeraty) || !inzeraty.length) { log('== Hotovo =='); return; }

  // otisky, které už známe z dřívějška — kvůli hledání kopií
  let znameOtisky = [];
  try { znameOtisky = await sb('listing_checks?select=listing_id,otisky') || []; } catch { znameOtisky = []; }
  const otiskyPodleInzeratu = new Map(znameOtisky.map((z) => [z.listing_id, z.otisky || []]));

  let spatnychOdkazu = 0, spatnychFotek = 0, kopii = 0;

  for (const inz of inzeraty) {
    const nalezy = [];
    const otisky = [];

    if (inz.url) {
      const pokusy = await zkusOpakovane(inz.url);
      const v = K.vyhodnotOdkaz(inz.url, pokusy);
      if (v.stav !== 'ok') {
        nalezy.push({ typ: 'odkaz', stav: v.stav, msg: v.msg, pokusu: v.pokusu });
        spatnychOdkazu++;
        log(`  ${inz.place}: ${v.msg} [${v.pokusu} pokusů]`);
      }
    }

    const fotky = Array.isArray(inz.photos) ? inz.photos.slice(0, 8) : [];
    for (const f of fotky) {
      const pokusy = await zkusOpakovane(f);
      const v = K.vyhodnotFotku(f, pokusy);
      if (v.stav !== 'ok') {
        nalezy.push({ typ: 'fotka', stav: v.stav, msg: v.msg, url: f, pokusu: v.pokusu });
        spatnychFotek++;
        log(`  ${inz.place}: ${v.msg} [${v.pokusu} pokusů]`);
        continue;
      }
      const o = await otiskFotky(f);
      if (o) otisky.push(o);
    }

    // kopie z jiného inzerátu?
    for (const o of otisky) {
      for (const [cizi, ciziOtisky] of otiskyPodleInzeratu) {
        if (cizi === inz.id) continue;
        if ((ciziOtisky || []).some((x) => K.jeStejnaFotka(o, x))) {
          nalezy.push({ typ: 'fotka', stav: 'kopie', msg: 'stejná fotka je i u jiného inzerátu', jiny: cizi });
          kopii++;
          log(`  ${inz.place}: stejná fotka jako u inzerátu ${cizi}`);
          break;
        }
      }
    }
    otiskyPodleInzeratu.set(inz.id, otisky);

    await sb('listing_checks', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify({
        listing_id: inz.id, checked_at: new Date().toISOString(),
        otisky, nalezy, ok: nalezy.length === 0,
      }),
    }).catch((e) => log('  (zápis výsledku se nepovedl: ' + e.message.slice(0, 80) + ')'));
  }

  log(`\nMrtvé nebo přesměrované odkazy: ${spatnychOdkazu}`);
  log(`Chybějící nebo vadné fotky: ${spatnychFotek}`);
  log(`Fotky zkopírované z jiného inzerátu: ${kopii}`);
  log('== Hotovo ==');
  if (spatnychOdkazu + spatnychFotek + kopii > 0) {
    console.log(`::warning::Kontrola inzerátů našla ${spatnychOdkazu + spatnychFotek + kopii} problémů — podívejte se do tabulky listing_checks.`);
  }
}

main().catch((e) => { console.error('CHYBA:', e.message); process.exit(1); });
