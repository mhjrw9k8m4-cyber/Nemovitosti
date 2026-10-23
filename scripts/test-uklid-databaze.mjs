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
  /* Osiřelé fotky odpovídají prázdným polem: tenhle případ měří úklid
     ŘÁDKŮ, a kdyby se sem připletl i seznam fotek, měřily by se dvě
     věci naráz. Fotky mají případ 5 jen pro sebe. */
  const s = await server((u) => (/osirele_fotky/.test(u)
    ? { stav: 200, telo: '[]' }
    : { stav: 200, telo: /uklid_posty/.test(u) ? '7' : '3' }));
  const r = await spust({ SUPABASE_URL: s.url, SUPABASE_SERVICE_ROLE_KEY: KLIC, UKLID_DNI: '180' });
  s.zavri();
  /* SEZNAM FUNKCÍ SE ČTE ZE SKRIPTU, ne z paměti. Dřív tu stálo
     „zavolá OBĚ úklidové funkce" s pevnou dvojkou — a při třetí
     úklidové funkci (nepotvrzené přihlášky k hlídání) zkouška spadla
     na vadu, která žádná nebyla. Takhle kontrola roste s tím, co se
     opravdu uklízí, a pořád hlásí, když se na některou zapomene. */
  const zdrojUklidu = (await import('node:fs')).readFileSync(
    new URL('./uklid-databaze.mjs', import.meta.url), 'utf8');
  /* A STEJNĚ TAK FUNKCE MIMO SEZNAM. osirele_fotky() se nevolá ze
     `ukoly`, ale zvlášť (potřebuje celou odpověď, ne zkrácenou), takže
     by ji kontrola podle seznamu minula — a to je zrovna ten krok,
     který maže soubory. */
  const cekane = [...zdrojUklidu.matchAll(/\['(uklid_[a-z_]+)'/g)].map((m) => m[1])
    .concat([...zdrojUklidu.matchAll(/rpcPlne\('([a-z_]+)'/g)].map((m) => m[1]));
  const nezavolane = cekane.filter((jm) => !s.volani.some((v) => v.cesta.includes(jm)));
  pravda(`zavolá všechny úklidové funkce ze svého seznamu (${cekane.length})`,
    cekane.length >= 3 && nezavolane.length === 0 && s.volani.length === cekane.length,
    `v seznamu: ${cekane.join(', ')} · zavoláno: ${s.volani.map((v) => v.cesta.split('/').pop()).join(', ')}`);
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

/* --- 5) OSIŘELÉ FOTKY: najít, smazat soubor, říct kolik ------------
   Mazání inzerátu ruší jen řádek v `listings`, takže fotky po
   smazaných inzerátech zůstávají v úložišti — a se stropem na počet
   fotek na účet je to past. Tady se měří celý dvoukrok: databáze
   vypíše jména, skript smaže SOUBORY přes Storage API.

   Proč soubory a ne řádky: smazaný řádek v `storage.objects` by soubor
   nechal ležet navždy a ještě by ho schoval před každým dalším
   úklidem. Zkouška proto trvá na tom, že se jde na /storage/v1/. */
{
  const fotky = ['uid-1/a.jpg', 'uid-1/b.jpg'];
  const s = await server((u) => (/osirele_fotky/.test(u)
    ? { stav: 200, telo: JSON.stringify(fotky.map((name) => ({ name }))) }
    : { stav: 200, telo: '0' }));
  const r = await spust({ SUPABASE_URL: s.url, SUPABASE_SERVICE_ROLE_KEY: KLIC });
  s.zavri();
  const smazani = s.volani.filter((v) => /^\/storage\/v1\//.test(v.cesta));
  pravda('osiřelé fotky se mažou v úložišti, ne jen v tabulce',
    smazani.length === 1 && /listing-photos/.test(smazani[0].cesta),
    'volání na úložiště: ' + (smazani.map((v) => v.cesta).join(', ') || '(žádné)'));
  pravda('a pošlou se všechna jména, která databáze vypsala',
    smazani.length === 1 && fotky.every((f) => smazani[0].telo.includes(f)),
    'tělo: ' + (smazani[0] || {}).telo);
  pravda('a napíše, kolik jich ubylo', /smazáno 2 osiřelých fotek/.test(r.vystup),
    r.vystup.slice(0, 240));
  pravda('skončí v pořádku a bez varování', r.kod === 0 && !/::warning::/.test(r.vystup),
    r.vystup.slice(0, 240));
  pravda('a klíč ani tady nikde', r.vystup.indexOf(KLIC) < 0, 'klíč prosákl');
}

/* --- 6) Nic k zahození není chyba ----------------------------------- */
{
  const s = await server((u) => (/osirele_fotky/.test(u)
    ? { stav: 200, telo: '[]' } : { stav: 200, telo: '0' }));
  const r = await spust({ SUPABASE_URL: s.url, SUPABASE_SERVICE_ROLE_KEY: KLIC });
  s.zavri();
  pravda('bez osiřelých fotek se na úložiště vůbec nejde',
    !s.volani.some((v) => /^\/storage\/v1\//.test(v.cesta)),
    'šlo se mazat prázdný seznam');
  pravda('a řekne, že nebylo co zahodit', /nic k zahození/.test(r.vystup), r.vystup.slice(0, 200));
  pravda('a není z toho varování', !/::warning::/.test(r.vystup), r.vystup.slice(0, 200));
}

/* --- 7) Úložiště odmítne mazání → varování, ne pád ------------------
   A hlavně: nesmí to vypadat jako úspěch. Kdyby se chyba spolkla,
   fotky by se hromadily dál a ve výpisu by stálo „uklizeno". */
{
  const s = await server((u) => {
    if (/osirele_fotky/.test(u)) return { stav: 200, telo: '[{"name":"uid-1/a.jpg"}]' };
    if (/^\/storage\/v1\//.test(u)) return { stav: 403, telo: '{"message":"not allowed"}' };
    return { stav: 200, telo: '0' };
  });
  const r = await spust({ SUPABASE_URL: s.url, SUPABASE_SERVICE_ROLE_KEY: KLIC });
  s.zavri();
  pravda('odmítnuté mazání fotek noční úlohu neshodí', r.kod === 0, `návratový kód ${r.kod}`);
  pravda('ale je z toho varování', /::warning::/.test(r.vystup), r.vystup.slice(0, 240));
  pravda('a netvrdí, že se uklidilo', !/smazáno 1 osiřelých/.test(r.vystup), r.vystup.slice(0, 240));
  pravda('a klíč nikde', r.vystup.indexOf(KLIC) < 0, 'klíč prosákl');
}

console.log('\nNoční úklid databáze');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Úklid databáze: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
process.exit(0);
