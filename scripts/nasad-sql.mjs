#!/usr/bin/env node
/* NASAZENÍ DATABÁZE JEDNÍM TLAČÍTKEM
   ==================================================================
   Celá databáze je v supabase/00-vse.sql — 2 300 řádků, 117 kB. Doteď
   se nasazovala tak, že člověk soubor otevřel, označil, zkopíroval
   a vložil do SQL editoru Supabase. U počítače je to dvě minuty; na
   telefonu je to neproveditelné, a právě na telefonu se tenhle web
   nejčastěji obsluhuje. Výsledek byl, že hotová práce ležela nenasazená.

   Tenhle skript pošle soubor do databáze sám. Pouští ho
   .github/workflows/nasad-sql.yml po stisku tlačítka na GitHubu.

   NIC NEDĚLÁ SÁM OD SEBE. Žádný cron, jen ruční spuštění — a i tak
   nasadí teprve s přepínačem --opravdu. Bez něj si soubor jen přečte,
   zkontroluje a vypíše, co by poslal. Zakládání tabulek, které se
   rozjede samo po nějakém pushnutí, je přesně to, co se nemá stát.

   PROČ SERVICE ROLE KLÍČ NESTAČÍ. Tím se mluví s PostgREST, a ten umí
   jen volat funkce a sahat na tabulky, které už existují. Zakládat je
   neumí. Na to je Management API Supabase a k němu osobní přístupový
   token — proto je potřeba klíč navíc.

   CO POTŘEBUJE (proměnné prostředí):
     SUPABASE_URL   — adresa projektu, např. https://abcdefgh.supabase.co
                      (v repozitáři už je, odvodí se z ní označení projektu)
     SUPABASE_PAT   — osobní přístupový token ze supabase.com/dashboard/account/tokens
                      (Settings → Secrets and variables → Actions)

   JE TO BEZPEČNÉ PUSTIT OPAKOVANĚ. Sám soubor je tak psaný: tabulky
   přes „if not exists", pravidla se před vytvořením ruší, funkce se
   přepisují. Viz jeho hlavička.
*/
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOUBOR = path.join(KOREN, 'supabase', '00-vse.sql');
const API = process.env.SUPABASE_API || 'https://api.supabase.com';

function log(s) { console.log(s); }
function chyba(s) { console.log('::error::' + s); }

/** Z „https://abcdefgh.supabase.co" udělá „abcdefgh". */
export function oznaceniProjektu(url) {
  const m = /^https?:\/\/([a-z0-9-]+)\.supabase\.(co|in|net)/i.exec(String(url || '').trim());
  return m ? m[1] : null;
}

/** Pár vět o tom, co v souboru je — ať je po spuštění vidět, co se nasadilo. */
export function popisSQL(sql) {
  const spocti = (re) => (sql.match(re) || []).length;
  return {
    bajtu: Buffer.byteLength(sql),
    radku: sql.split('\n').length,
    tabulek: spocti(/^\s*create table if not exists\s/gim),
    funkci: spocti(/^\s*create or replace function\s/gim),
    pravidel: spocti(/^\s*create policy\s/gim),
  };
}

async function main() {
  const opravdu = process.argv.includes('--opravdu');
  const url = process.env.SUPABASE_URL || '';
  const token = process.env.SUPABASE_PAT || '';

  let sql;
  try {
    sql = readFileSync(SOUBOR, 'utf8');
  } catch (e) {
    chyba('Nenašel jsem supabase/00-vse.sql. Vzniká příkazem node scripts/build-sql.mjs.');
    process.exit(1);
  }
  /* Prázdný nebo osekaný soubor by databázi nepoškodil, ale tvářil by se,
     že nasazení proběhlo. Radši skončit nahlas. */
  if (sql.length < 1000) {
    chyba(`supabase/00-vse.sql má jen ${sql.length} znaků — to není celá databáze.`);
    process.exit(1);
  }

  const p = popisSQL(sql);
  log(`Soubor: ${p.radku} řádků, ${(p.bajtu / 1024).toFixed(1)} kB`);
  log(`Zakládá tabulek: ${p.tabulek} · funkcí: ${p.funkci} · pravidel přístupu: ${p.pravidel}`);

  const ref = oznaceniProjektu(url);
  if (!ref) {
    chyba('SUPABASE_URL chybí nebo nevypadá jako https://neco.supabase.co — bez něj nevím, kam SQL poslat.');
    process.exit(1);
  }
  log(`Projekt: ${ref}`);

  if (!opravdu) {
    log('');
    log('NASUCHO — nic se neodeslalo. Tohle je jen kontrola, že je co nasadit.');
    log('Opravdové nasazení pustí tentýž příkaz s přepínačem --opravdu.');
    return;
  }
  if (!token) {
    chyba('Chybí SUPABASE_PAT. Je to osobní přístupový token ze supabase.com/dashboard/account/tokens;'
      + ' vloží se do Settings → Secrets and variables → Actions.');
    process.exit(1);
  }

  log('');
  log('Posílám do databáze…');
  let odpoved;
  try {
    odpoved = await fetch(`${API}/v1/projects/${ref}/database/query`, {
      method: 'POST',
      headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: sql }),
    });
  } catch (e) {
    chyba('Na Management API Supabase se nepodařilo dovolat: ' + (e && e.message));
    process.exit(1);
  }

  const text = await odpoved.text().catch(() => '');
  if (!odpoved.ok) {
    /* Text odpovědi se vypisuje celý: u SQL chyby v něm stojí, který
       příkaz selhal a proč, a bez toho se nedá nic opravit. Token v něm
       není — posílá se jen v hlavičce. */
    if (odpoved.status === 401 || odpoved.status === 403) {
      chyba(`Token Supabase neprošel (${odpoved.status}). Je SUPABASE_PAT správný a platný?`);
    } else if (odpoved.status === 404) {
      chyba(`Projekt „${ref}" se nenašel (404). Sedí SUPABASE_URL na ten projekt, kam chceš nasadit?`);
    } else {
      chyba(`Databáze SQL odmítla (${odpoved.status}).`);
    }
    log(text.slice(0, 4000));
    process.exit(1);
  }

  log('Hotovo — databáze je nasazená.');
  log('');
  log('Co si ověřit na webu: otevři pozemek a napiš poznámku. Pod políčkem');
  log('musí stát „Uloží se k vašemu účtu" místo „zůstává jen v tomhle');
  log('prohlížeči" — to znamená, že tabulka poznámek v databázi je.');
  if (text && text.trim() && text.trim() !== '[]') log('\nOdpověď databáze: ' + text.slice(0, 1000));
}

/* Spouští se jen jako příkaz, ne při načtení — scripts/test-staticka.mjs
   načítá všechny skripty, aby ověřil, že se přeloží. */
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch((e) => { chyba(String((e && e.stack) || e)); process.exit(1); });
}
