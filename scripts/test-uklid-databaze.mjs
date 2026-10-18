/* Test: noční úklid databáze nesmí shodit úlohu ani vyzradit klíč.
   ====================================================================
   Spuštění: node scripts/test-uklid-databaze.mjs   (bez sítě navenek)

   PROČ. scripts/uklid-databaze.mjs běží jednou denně v úloze „Kontrola
   inzerátů" se SERVISNÍM KLÍČEM — tedy s klíčem, který obchází veškerá
   oprávnění. Dvě věci se u takového skriptu nesmí stát:

     1) aby svým selháním shodil celou noční úlohu. Úklid starých řádků
        je to nejméně důležité, co se v noci děje; když databáze
        neodpoví, má to říct a skončit v pořádku.
     2) aby se klíč objevil ve výpisu úlohy. Výpisy běhů jsou u
        veřejného repozitáře veřejné a stačil by jeden snímek obrazovky.

   A do třetice: když migrace ještě není nahraná (majitel nepustil
   supabase/00-vse.sql), funkce v databázi nejsou a PostgREST vrací 404.
   To není chyba úklidu — má to říct srozumitelně a jít dál.

   Zkouška proto pustí skript doopravdy, ale proti VLASTNÍMU serveru na
   localhostu, který odpovídá, jak si zrovna řekne.
   ==================================================================== */
import { execFile } from 'node:child_process';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pricinaChyb } from './chyby-hlaska.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SKRIPT = path.join(KOREN, 'scripts', 'uklid-databaze.mjs');
const KLIC = 'tajny-servisni-klic-nesmi-byt-videt';
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* Server, který odpovídá podle předpisu. Zapisuje si, na co se kdo ptal. */
function server(odpovidej) {
  const volani = [];
  const s = createServer((q, r) => {
    let telo = '';
    q.on('data', (d) => { telo += d; });
    q.on('end', () => {
      volani.push({ cesta: q.url, telo, klic: q.headers.apikey || '' });
      const o = odpovidej(q.url);
      r.statusCode = o.stav;
      r.setHeader('content-type', 'application/json');
      r.end(o.telo);
    });
  });
  return new Promise((hotovo) => s.listen(0, '127.0.0.1', () => hotovo({
    url: `http://127.0.0.1:${s.address().port}`, volani, zavri: () => s.close(),
  })));
}

function spust(env) {
  return new Promise((hotovo) => {
    execFile(process.execPath, [SKRIPT], { env: { ...process.env, ...env }, encoding: 'utf8' },
      (e, out, err) => hotovo({ kod: e ? (e.code || 1) : 0, vystup: String(out) + String(err) }));
  });
}

// --- 1) Bez klíče se nic neděje — a hlavně se nic nerozbije ----------
{
  const r = await spust({ SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '' });
  pravda('bez přihlašovacích údajů skončí v pořádku', r.kod === 0, `návratový kód ${r.kod}`);
  pravda('a řekne proč', /chybí SUPABASE_URL/.test(r.vystup), r.vystup.slice(0, 120));
}

// --- 2) Všechno v pořádku -------------------------------------------
{
  const s = await server((u) => ({ stav: 200, telo: /uklid_posty/.test(u) ? '7' : '3' }));
  const r = await spust({ SUPABASE_URL: s.url, SUPABASE_SERVICE_ROLE_KEY: KLIC, UKLID_DNI: '180' });
  s.zavri();
  pravda('zavolá obě úklidové funkce', s.volani.length === 2
    && s.volani.some((v) => /uklid_navstevnosti/.test(v.cesta))
    && s.volani.some((v) => /uklid_posty/.test(v.cesta)),
    'zavoláno: ' + s.volani.map((v) => v.cesta).join(', '));
  pravda('pošle, kolik dní se má nechat', /"p_dni":180/.test(s.volani.map((v) => v.telo).join(' ')),
    'těla: ' + s.volani.map((v) => v.telo).join(' '));
  pravda('napíše, kolik řádků ubylo', /smazáno 3 řádků/.test(r.vystup) && /smazáno 7 řádků/.test(r.vystup),
    r.vystup.slice(0, 200));
  pravda('a skončí v pořádku', r.kod === 0, `návratový kód ${r.kod}`);
  /* TOHLE JE TA VĚC, KVŮLI KTERÉ ZKOUŠKA VZNIKLA. */
  pravda('servisní klíč se ve výpisu neobjeví', r.vystup.indexOf(KLIC) < 0,
    'klíč je ve výpisu úlohy — a výpisy běhů jsou veřejné');
  pravda('ale do databáze se pošle (jinak by úklid nic nesměl)',
    s.volani.every((v) => v.klic === KLIC), 'volání šlo bez klíče');
}

// --- 3) Migrace ještě není nahraná → 404 ----------------------------
{
  const s = await server(() => ({ stav: 404, telo: '{"message":"function not found"}' }));
  const r = await spust({ SUPABASE_URL: s.url, SUPABASE_SERVICE_ROLE_KEY: KLIC });
  s.zavri();
  pravda('chybějící funkce v databázi skript neshodí', r.kod === 0, `návratový kód ${r.kod}`);
  pravda('a poradí, co s tím', /00-vse\.sql/.test(r.vystup), r.vystup.slice(0, 200));
  pravda('a nehlásí to jako chybu úlohy', !/::error::/.test(r.vystup), r.vystup.slice(0, 200));
}

// --- 4) Databáze se zlobí → varování, ne pád -------------------------
{
  const s = await server(() => ({ stav: 500, telo: '{"message":"nope"}' }));
  const r = await spust({ SUPABASE_URL: s.url, SUPABASE_SERVICE_ROLE_KEY: KLIC });
  s.zavri();
  pravda('selhání databáze noční úlohu neshodí', r.kod === 0, `návratový kód ${r.kod}`);
  pravda('ale je z toho varování, ne ticho', /::warning::/.test(r.vystup), r.vystup.slice(0, 200));
  pravda('a klíč ani tentokrát nikde', r.vystup.indexOf(KLIC) < 0, 'klíč prosákl do chybové hlášky');
}

console.log('\nNoční úklid databáze');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Úklid databáze: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
process.exit(0);
