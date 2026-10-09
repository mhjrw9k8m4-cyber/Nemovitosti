/* Kontrola databáze — co v Supabase opravdu je a kdo se k tomu dostane.
   ====================================================================
   SPUŠTĚNÍ (u sebe, ne v CI — servisní klíč do repozitáře nepatří):

     SUPABASE_SERVICE_ROLE_KEY=… node scripts/kontrola-databaze.mjs

   Klíč je v Supabase → Project Settings → API → service_role.
   Volitelně, kvůli kontrole „co vidí přihlášený":
     PK_TEST_EMAIL=… PK_TEST_HESLO=… (běžný účet, klidně zkušební)

   PROČ TOHLE EXISTUJE. Kód k databázi je otestovaný proti falešné
   Supabase, takže se ví, že se ptá správně. Co se z repozitáře zjistit
   NEDÁ, je jestli SQL v supabase/ někdo doopravdy nahrál a jestli to,
   co v databázi stojí, má správná oprávnění. Zrovna na tom už web
   jednou pohořel: prehled_navstevnosti() si mohl zavolat každý, kdo
   si založil účet. Ne proto, že by někdo udělal chybu v SQL —
   PostgreSQL totiž nové funkci dává právo spuštění VŠEM, dokud se mu
   to výslovně nezakáže. Tenhle soubor se proto ptá databáze samotné.

   CO SE TU NEDĚLÁ. Nic se nezapisuje a nevolá se jediná funkce: jen
   GET dotazy. Seznam tabulek a funkcí vydá PostgREST sám (OpenAPI na
   kořeni), a protože ho vydá KAŽDÉMU KLÍČI JINAK — podle toho, co ten
   klíč smí — je to zároveň ta nejpoctivější zkouška oprávnění, jakou
   jde udělat bez zásahu do dat.

   SERVISNÍ KLÍČ SE NIKAM NEVYPISUJE. Obchází veškerá oprávnění, takže
   kdyby se objevil ve výpisu, stačí poslat snímek obrazovky a databáze
   je cizí. Všechno, co jde ven, prochází pres bezKlicu().
   ==================================================================== */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* Tabulky, které SMÍ číst kdokoli bez přihlášení. Seznam je krátký
   schválně: cokoli dalšího je nález, ne nastavení. `listings` jsou
   zveřejněné inzeráty — ty má web ukazovat i nepřihlášenému, to je
   jejich smysl. Všechno ostatní jsou buď cizí data (zprávy, poznámky,
   hlídání, platby), nebo provozní záznamy, které veřejnosti nepatří. */
export const VEREJNE_TABULKY = ['listings'];

/** Vytáhne z SQL, co MÁ v databázi být. Jeden zdroj pravdy je ten SQL. */
export function ocekavaneZeSQL(sql) {
  const tabulky = [...sql.matchAll(/^create table if not exists ([a-z_][a-z0-9_]*)/gmi)]
    .map((m) => m[1].toLowerCase());
  const funkce = [...sql.matchAll(/^create (?:or replace )?function ([a-z_][a-z0-9_]*)\s*\(/gmi)]
    .map((m) => m[1].toLowerCase());
  /* Funkce, u kterých SQL výslovně bere právo veřejnosti. Právě ty
     nesmí být vidět na klíči nepřihlášeného — a kdyby se na některou
     zapomnělo, tahle kontrola to má říct. */
  const zavrene = [...sql.matchAll(/^revoke all on function ([a-z_][a-z0-9_]*)\s*\([^)]*\)\s*from ([^;]+);/gmi)]
    .filter((m) => /\banon\b|\bpublic\b/i.test(m[2]))
    .map((m) => m[1].toLowerCase());
  return { tabulky: [...new Set(tabulky)], funkce: [...new Set(funkce)],
    zavrene: [...new Set(zavrene)] };
}

/** Z OpenAPI, který PostgREST vydá danému klíči, vybere tabulky a RPC. */
export function zeSpecifikace(spec) {
  const cesty = Object.keys((spec && spec.paths) || {});
  const tabulky = cesty.filter((c) => /^\/[a-z_][a-z0-9_]*$/i.test(c)).map((c) => c.slice(1).toLowerCase());
  const funkce = cesty.filter((c) => /^\/rpc\/[a-z_][a-z0-9_]*$/i.test(c))
    .map((c) => c.slice(5).toLowerCase());
  return { tabulky: [...new Set(tabulky)], funkce: [...new Set(funkce)] };
}

/** Servisní klíč se nesmí dostat do výpisu ani omylem přes chybu. */
export function bezKlicu(text, klice) {
  let t = String(text == null ? '' : text);
  for (const k of klice) {
    if (k && k.length >= 8) t = t.split(k).join('«klíč skryt»');
  }
  return t;
}

async function ziskej(url, cesta, klic, token) {
  const r = await fetch(url.replace(/\/+$/, '') + cesta, {
    headers: Object.assign({ apikey: klic },
      token ? { Authorization: 'Bearer ' + token } : { Authorization: 'Bearer ' + klic }),
  });
  const telo = await r.text();
  let json = null;
  try { json = JSON.parse(telo); } catch (e) { /* nevadí, stav stačí */ }
  return { stav: r.status, json, telo };
}

/**
 * Projde databázi a vrátí seznam nálezů.
 * @returns {{nalezy: Array, prehled: object}}
 */
export async function zkontroluj({ url, anonKlic, serviceKlic, sql, token = null, fetchFn }) {
  const g = fetchFn || ziskej;
  const nalezy = [];
  const chyba = (co, proc, rada) => nalezy.push({ vaha: 'chyba', co, proc, rada });
  const varovani = (co, proc, rada) => nalezy.push({ vaha: 'varování', co, proc, rada });

  const ma = ocekavaneZeSQL(sql);
  const prehled = { ocekavanoTabulek: ma.tabulky.length, ocekavanoFunkci: ma.funkce.length,
    zavrenychVSQL: ma.zavrene.length };

  /* --- 1) servisní klíč: co v databázi vůbec je ------------------- */
  const sluzba = await g(url, '/rest/v1/', serviceKlic);
  if (sluzba.stav !== 200 || !sluzba.json) {
    chyba('databáze neodpověděla', `HTTP ${sluzba.stav}`,
      'Zkontrolujte SUPABASE_SERVICE_ROLE_KEY a adresu v js/config.js.');
    return { nalezy, prehled };
  }
  const je = zeSpecifikace(sluzba.json);
  prehled.vDatabaziTabulek = je.tabulky.length;
  prehled.vDatabaziFunkci = je.funkce.length;

  const chybiT = ma.tabulky.filter((t) => je.tabulky.indexOf(t) < 0);
  if (chybiT.length) {
    chyba(`v databázi chybí ${chybiT.length} z ${ma.tabulky.length} tabulek`, chybiT.join(', '),
      'Supabase → SQL Editor → nahrát supabase/00-vse.sql.');
  }
  const chybiF = ma.funkce.filter((f) => je.funkce.indexOf(f) < 0);
  if (chybiF.length) {
    chyba(`v databázi chybí ${chybiF.length} z ${ma.funkce.length} funkcí`, chybiF.join(', '),
      'Supabase → SQL Editor → nahrát supabase/00-vse.sql.');
  }

  /* --- 2) co uvidí nepřihlášený ---------------------------------- */
  const verejne = await g(url, '/rest/v1/', anonKlic);
  if (verejne.stav !== 200 || !verejne.json) {
    varovani('veřejný klíč nedostal seznam', `HTTP ${verejne.stav}`,
      'Klíč v js/config.js nemusí platit — web by se k datům nedostal taky.');
  } else {
    const anon = zeSpecifikace(verejne.json);
    prehled.proNeprihlaseneTabulek = anon.tabulky.length;
    prehled.proNeprihlaseneFunkci = anon.funkce.length;
    /* Funkce, kterou SQL veřejnosti výslovně zakazuje, a přesto ji
       nepřihlášený vidí — tedy na ni nikdo to „revoke" nepustil. */
    const unikle = ma.zavrene.filter((f) => anon.funkce.indexOf(f) >= 0);
    if (unikle.length) {
      chyba(`${unikle.length} funkcí má v SQL zákaz, ale nepřihlášený je vidí`, unikle.join(', '),
        'Nahrajte supabase/00-vse.sql znovu — ty řádky „revoke all on function" neproběhly.');
    }
    /* A teď to hlavní: data. Prázdnou tabulku nejde odlišit od zavřené,
       takže se pokaždé ptáme i servisním klíčem — teprve „služba vidí
       řádky, nepřihlášený ne" je důkaz, že je zavřená doopravdy. */
    for (const t of je.tabulky) {
      if (VEREJNE_TABULKY.indexOf(t) >= 0) continue;
      const jakoAnon = await g(url, `/rest/v1/${t}?select=*&limit=1`, anonKlic);
      if (jakoAnon.stav !== 200 || !Array.isArray(jakoAnon.json) || !jakoAnon.json.length) continue;
      chyba(`tabulku ${t} přečte kdokoli bez přihlášení`,
        'vrátila řádek i na veřejný klíč',
        `V SQL chybí zapnuté RLS nebo pravidlo pro ${t}. Viz supabase/00-vse.sql.`);
    }
  }

  /* --- 3) co uvidí přihlášený (jen když je čím se přihlásit) ------ */
  if (token) {
    const prih = await g(url, '/rest/v1/', anonKlic, token);
    if (prih.stav === 200 && prih.json) {
      const uzivatel = zeSpecifikace(prih.json);
      prehled.proPrihlaseneFunkci = uzivatel.funkce.length;
      const unikle = ma.zavrene.filter((f) => uzivatel.funkce.indexOf(f) >= 0);
      if (unikle.length) {
        chyba(`${unikle.length} funkcí má v SQL zákaz, ale přihlášený je vidí`, unikle.join(', '),
          'Přesně tahle díra už tu jednou byla (prehled_navstevnosti). Nahrát SQL znovu.');
      }
      for (const t of je.tabulky) {
        if (VEREJNE_TABULKY.indexOf(t) >= 0) continue;
        const jako = await g(url, `/rest/v1/${t}?select=*&limit=1`, anonKlic, token);
        if (jako.stav !== 200 || !Array.isArray(jako.json) || !jako.json.length) continue;
        /* Přihlášený SVÁ data vidět má — nález je to jen u tabulek,
           kde cizí data nemá co vidět nikdo kromě služby. Rozhodnout
           to odsud nejde (nevíme, čí ten řádek je), tak se to hlásí
           jako varování k přečtení, ne jako chyba. */
        varovani(`tabulku ${t} přečte přihlášený uživatel`,
          'vrátila řádek — ověřte, že to jsou JEHO data',
          `Projděte pravidla RLS pro ${t} v supabase/00-vse.sql.`);
      }
    }
  } else {
    varovani('kontrola „co vidí přihlášený" se nespustila',
      'chybí PK_TEST_EMAIL a PK_TEST_HESLO',
      'Právě v téhle roli vznikla díra v prehled_navstevnosti — stojí za to ji projít.');
  }

  return { nalezy, prehled };
}

/* ---------- spuštění z příkazové řádky ---------- */
async function prihlas(url, anonKlic, email, heslo) {
  const r = await fetch(url.replace(/\/+$/, '') + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { apikey: anonKlic, 'content-type': 'application/json' },
    body: JSON.stringify({ email, password: heslo }),
  });
  if (r.status !== 200) return null;
  const j = await r.json().catch(() => null);
  return (j && j.access_token) || null;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const cfg = readFileSync(path.join(KOREN, 'js', 'config.js'), 'utf8');
  /* Adresa se bere z js/config.js — není tajná a stojí tam pro každý
     prohlížeč. Proměnná ji přebije, kdyby se kontrolovalo jiné prostředí;
     je to tentýž postup jako v scripts/nasad-sql.mjs, ať si ty dva
     nástroje nesahají na jiný projekt. */
  const url = process.env.SUPABASE_URL
    || (/PK_SUPABASE_URL\s*=\s*'([^']+)'/.exec(cfg) || [])[1] || '';
  const anonKlic = (/PK_SUPABASE_KEY\s*=\s*'([^']+)'/.exec(cfg) || [])[1] || '';
  const serviceKlic = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const tajne = [serviceKlic, process.env.PK_TEST_HESLO || ''];

  if (!url || !anonKlic) {
    console.error('V js/config.js nejsou adresa ani veřejný klíč Supabase.');
    process.exit(1);
  }
  if (!serviceKlic) {
    console.error('Chybí SUPABASE_SERVICE_ROLE_KEY.');
    console.error('Supabase → Project Settings → API → service_role, pak:');
    console.error('  SUPABASE_SERVICE_ROLE_KEY=… node scripts/kontrola-databaze.mjs');
    process.exit(1);
  }
  const sql = readFileSync(path.join(KOREN, 'supabase', '00-vse.sql'), 'utf8');
  let token = null;
  if (process.env.PK_TEST_EMAIL && process.env.PK_TEST_HESLO) {
    token = await prihlas(url, anonKlic, process.env.PK_TEST_EMAIL, process.env.PK_TEST_HESLO);
    if (!token) console.log('(Přihlášení zkušebním účtem neprošlo — ta část kontroly se vynechá.)');
  }

  let vysledek;
  try {
    vysledek = await zkontroluj({ url, anonKlic, serviceKlic, sql, token });
  } catch (e) {
    console.error('Kontrola spadla: ' + bezKlicu(e && e.message, tajne));
    process.exit(1);
  }
  const { nalezy, prehled } = vysledek;

  console.log('\nKontrola databáze — ' + url.replace(/^https?:\/\//, ''));
  console.log(`  v SQL: ${prehled.ocekavanoTabulek} tabulek, ${prehled.ocekavanoFunkci} funkcí`
    + ` (z toho ${prehled.zavrenychVSQL} se zakázaným spuštěním pro veřejnost)`);
  if (prehled.vDatabaziTabulek != null) {
    console.log(`  v databázi: ${prehled.vDatabaziTabulek} tabulek, ${prehled.vDatabaziFunkci} funkcí`);
  }
  if (prehled.proNeprihlaseneFunkci != null) {
    console.log(`  nepřihlášený vidí: ${prehled.proNeprihlaseneTabulek} tabulek,`
      + ` ${prehled.proNeprihlaseneFunkci} funkcí`);
  }
  if (prehled.proPrihlaseneFunkci != null) {
    console.log(`  přihlášený vidí: ${prehled.proPrihlaseneFunkci} funkcí`);
  }

  const chyby = nalezy.filter((n) => n.vaha === 'chyba');
  console.log('');
  if (!nalezy.length) {
    console.log('  ✓ Všechno sedí: co je v SQL, je i v databázi, a nikdo nevidí víc, než má.');
  }
  for (const n of nalezy) {
    console.log(`  ${n.vaha === 'chyba' ? '✕' : '•'} ${bezKlicu(n.co, tajne)}`);
    console.log(`      ${bezKlicu(n.proc, tajne)}`);
    console.log(`      → ${n.rada}`);
  }
  console.log(`\n${chyby.length} ${chyby.length === 1 ? 'chyba' : 'chyb'}, `
    + `${nalezy.length - chyby.length} k přečtení\n`);

  /* ZÁVĚR I DO PŘEHLEDU BĚHU, ne jen do protokolu. Krok v
     .github/workflows/nasad-sql.yml má continue-on-error — nasazení
     a kontrola jsou dvě různé otázky — jenže tím přestane barva kroku
     cokoli znamenat a výsledek se dá zjistit jen rozkliknutím
     protokolu. Ten se na telefonu čte mizerně a přes API ho nejde
     stáhnout vůbec. Řádek ::error:: / ::notice:: skončí v souhrnu
     běhu, takže je vidět na první pohled i odtud. */
  if (process.env.GITHUB_ACTIONS) {
    const shrnuti = chyby.length
      ? `Kontrola databáze: ${chyby.length} nálezů — ` + chyby.map((n) => n.co).join('; ')
      : `Kontrola databáze v pořádku: ${prehled.vDatabaziTabulek} tabulek, `
        + `${prehled.vDatabaziFunkci} funkcí, nepřihlášený vidí `
        + `${prehled.proNeprihlaseneTabulek} tabulek a ${prehled.proNeprihlaseneFunkci} funkcí.`;
    console.log(`::${chyby.length ? 'error' : 'notice'}::` + bezKlicu(shrnuti, tajne));
  }
  process.exit(chyby.length ? 1 : 0);
}
