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

   CO SE TU NEDĚLÁ. Nic se nezapisuje. Volá se jediná funkce,
   kontrola_opravneni() — ta jen čte katalog databáze a smí ji spustit
   výhradně service_role (viz supabase/kontrola-opravneni.sql). Zbytek
   jsou GET dotazy.

   Seznam tabulek vydá PostgREST sám (OpenAPI na kořeni) a vydá ho
   každému klíči jinak, podle toho, co ten klíč smí. U oprávnění FUNKCÍ
   to ale nestačilo: na nové klíče „sb_publishable_…" vrací kořen 401,
   takže zůstávalo u „ověřit se nepodařilo" — zrovna u té věci, kvůli
   které tenhle soubor vznikl. Proto se databáze ptá přímo.

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
  /* NEJDŘÍV JESTLI TEN KLÍČ VŮBEC PLATÍ, a teprve pak co s ním jde
     přečíst. První ostrý běh vrátil na kořenovém výpisu HTTP 401
     a z toho se nedalo poznat nic: buď je veřejný klíč neplatný —
     a pak se k datům nedostane ani web — nebo kořenový výpis jen
     nové klíče „sb_publishable_…" nepouští. To jsou dvě úplně různě
     vážné věci a hádat se mezi nimi nemá.
     Rozhodne dotaz na skutečná data: zveřejněné inzeráty má přečíst
     každý, to je jejich smysl. Když projdou, klíč platí. */
  const zkouska = await g(url, '/rest/v1/listings?select=*&limit=1', anonKlic);
  const klicPlati = zkouska.stav === 200;
  if (!klicPlati) {
    chyba('veřejný klíč nefunguje', `dotaz na zveřejněné inzeráty vrátil HTTP ${zkouska.stav}`,
      'Tenhle klíč má v js/config.js i prohlížeč — web se takhle k datům nedostane vůbec.'
      + ' Supabase → Project Settings → API, zkopírovat platný publishable key.');
  }

  /* Seznam funkcí vydá PostgREST jen na kořeni, a ten nové klíče
     nemusí pustit. Když nepustí, NEŘEKNE SE NIC — ne „v pořádku". */
  const verejne = await g(url, '/rest/v1/', anonKlic);
  if (verejne.stav === 200 && verejne.json) {
    const anon = zeSpecifikace(verejne.json);
    prehled.proNeprihlaseneFunkci = anon.funkce.length;
    const unikle = ma.zavrene.filter((f) => anon.funkce.indexOf(f) >= 0);
    if (unikle.length) {
      chyba(`${unikle.length} funkcí má v SQL zákaz, ale nepřihlášený je vidí`, unikle.join(', '),
        'Nahrajte supabase/00-vse.sql znovu — ty řádky „revoke all on function" neproběhly.');
    }
  } else if (klicPlati) {
    varovani('seznam funkcí pro nepřihlášeného se nepodařilo získat',
      `kořenový výpis vrátil HTTP ${verejne.stav}, data přitom veřejný klíč čte`,
      'Zákazy spuštění funkcí se takhle ověřit nedají. Data níž ověřená jsou.');
  }

  /* A TEĎ TA DŮLEŽITĚJŠÍ PŮLKA: data. Běží VŽDYCKY, i když kořenový
     výpis selhal — seznam tabulek je z klíče služby, ne odtamtud.
     Dřív byla celá tahle smyčka schovaná za úspěchem kořenového
     výpisu, takže se při 401 nezkontrolovalo ani jedno. Prázdnou
     tabulku navíc nejde odlišit od zavřené, proto je nález teprve
     „služba vidí řádky a nepřihlášený taky". */
  if (klicPlati) {
    let overeno = 0;
    for (const t of je.tabulky) {
      if (VEREJNE_TABULKY.indexOf(t) >= 0) continue;
      const jakoAnon = await g(url, `/rest/v1/${t}?select=*&limit=1`, anonKlic);
      overeno++;
      if (jakoAnon.stav !== 200 || !Array.isArray(jakoAnon.json) || !jakoAnon.json.length) continue;
      chyba(`tabulku ${t} přečte kdokoli bez přihlášení`,
        'vrátila řádek i na veřejný klíč',
        `V SQL chybí zapnuté RLS nebo pravidlo pro ${t}. Viz supabase/00-vse.sql.`);
    }
    prehled.proNeprihlaseneTabulek = overeno;
  }

  /* --- 2b) SKUTEČNÁ oprávnění funkcí, přímo z katalogu databáze ---
     Tohle je jediné místo, které dává na otázku „kdo smí co spustit"
     odpověď, a ne odhad. Čte ji funkce kontrola_opravneni() z pg_proc
     — viz supabase/kontrola-opravneni.sql, kde je i rozepsané, proč
     se čte proacl a ne has_function_privilege.

     DVĚ RŮZNÉ VĚCI, DVĚ RŮZNÉ VÁHY:
      · funkce, které SQL veřejnosti výslovně zakazuje a ona ji přesto
        má — to znamená, že „revoke" neproběhl. Chyba.
      · funkce, u kterých se o oprávnění nikdo nestaral (proacl je
        prázdné, tedy výchozí PUBLIC) — varování. Naměřeno: takových
        je 26 z 36 a ani jedna z nich díra není, protože si tělo hlídá
        auth.uid() samo (jediná výjimka, my_listing, chce k tomu tajný
        token v parametru a je pro anon povolená schválně). Dělat
        z toho chybu by znamenalo hlásit 26 planých poplachů a nikdo
        by tuhle kontrolu po třetím běhu nečetl. */
  const opr = await g(url, '/rest/v1/rpc/kontrola_opravneni', serviceKlic);
  if (opr.stav === 200 && Array.isArray(opr.json)) {
    const VSEM = ['PUBLIC', 'anon', 'authenticated'];
    const porusene = new Map();
    const vychozi = new Set();
    for (const r of opr.json) {
      if (!r || !r.funkce) continue;
      if (r.vychozi) vychozi.add(r.funkce);
      if (ma.zavrene.indexOf(r.funkce) >= 0 && VSEM.indexOf(r.komu) >= 0) {
        if (!porusene.has(r.funkce)) porusene.set(r.funkce, []);
        porusene.get(r.funkce).push(r.komu);
      }
    }
    prehled.opravneniPrecteno = opr.json.length;
    if (porusene.size) {
      chyba(`${porusene.size} funkcí má v SQL zákaz, ale databáze je pouští dál`,
        [...porusene].map(([f, k]) => `${f} → ${k.join(', ')}`).join('; '),
        'Řádky „revoke all on function" neproběhly. Nasadit supabase/00-vse.sql znovu.');
    }
    if (vychozi.size) {
      varovani(`${vychozi.size} funkcí má oprávnění na výchozím (spustí je kdokoli)`,
        [...vychozi].sort().join(', '),
        'Není to samo o sobě díra, pokud si tělo hlídá auth.uid(). Ale rozhodnuté to není.');
    }
  } else {
    varovani('skutečná oprávnění funkcí se nepodařilo přečíst',
      `kontrola_opravneni() vrátila HTTP ${opr.stav}`,
      'Chybí supabase/kontrola-opravneni.sql — nasaďte databázi znovu.');
  }

  /* --- 3) co uvidí přihlášený (jen když je čím se přihlásit) ------ */
  if (token) {
    /* TÁŽ PAST JAKO O KUS VÝŠ, a tady byla ještě tišší: smyčka přes
       tabulky visela na kořenovém výpisu, a ten vrací 401 i tomuhle
       klíči. Role přihlášeného se tedy nezkontrolovala vůbec — a na
       rozdíl od případu „není čím se přihlásit" o tom nepadlo ani
       slovo, protože varování hlídá jen chybějící přihlášení.
       Je to zrovna ta role, ve které tu díra byla. */
    const prih = await g(url, '/rest/v1/', anonKlic, token);
    if (prih.stav === 200 && prih.json) {
      const uzivatel = zeSpecifikace(prih.json);
      prehled.proPrihlaseneFunkci = uzivatel.funkce.length;
      const unikle = ma.zavrene.filter((f) => uzivatel.funkce.indexOf(f) >= 0);
      if (unikle.length) {
        chyba(`${unikle.length} funkcí má v SQL zákaz, ale přihlášený je vidí`, unikle.join(', '),
          'Přesně tahle díra už tu jednou byla (prehled_navstevnosti). Nahrát SQL znovu.');
      }
    } else {
      varovani('seznam funkcí pro přihlášeného se nepodařilo získat',
        `kořenový výpis vrátil HTTP ${prih.stav}`,
        'Zákazy spuštění funkcí se v téhle roli ověřit nedají. Tabulky ověřené jsou.');
    }
    let overeno = 0;
    for (const t of je.tabulky) {
      if (VEREJNE_TABULKY.indexOf(t) >= 0) continue;
      const jako = await g(url, `/rest/v1/${t}?select=*&limit=1`, anonKlic, token);
      overeno++;
      if (jako.stav !== 200 || !Array.isArray(jako.json) || !jako.json.length) continue;
      /* Přihlášený SVÁ data vidět má. Rozhodnout odsud, čí ten řádek
         je, nejde — jenže účet je čerstvý a prázdný, takže žádná data
         mít nemůže. Co mu tabulka přesto vydá, je cizí. */
      chyba(`tabulku ${t} přečte přihlášený uživatel`,
        'vrátila řádek účtu, který v ní nemá nic svého',
        `Projděte pravidla RLS pro ${t} v supabase/00-vse.sql.`);
    }
    prehled.proPrihlaseneTabulek = overeno;
  } else {
    varovani('kontrola „co vidí přihlášený" se nespustila',
      'chybí PK_TEST_EMAIL a PK_TEST_HESLO',
      'Právě v téhle roli vznikla díra v prehled_navstevnosti — stojí za to ji projít.');
  }

  return { nalezy, prehled };
}

/* ===== DOČASNÝ ÚČET MÍSTO CIZÍHO HESLA ==============================
   Role „přihlášený uživatel" je ta, ve které tu jednou byla díra:
   prehled_navstevnosti() si mohl zavolat každý, kdo si založil účet.
   Projít se dá jedině s platným přihlášením — jenže uložit si kvůli
   tomu někam HESLO SKUTEČNÉHO ČLOVĚKA je špatná výměna. Tajné
   proměnné repozitáře si přečte každý, kdo smí upravit workflow,
   a heslo k osobnímu e-mailu bývá totéž heslo ještě na deseti
   místech.
   Servisní klíč, který v repozitáři stejně je, umí účty zakládat
   i maza. Vyrobí se proto jednorázový, projde se s ním kontrola
   a hned se smaže. Heslo vzniká náhodně v běhu, nikam se nevypisuje
   a nikdo ho nikdy nepotřebuje znát.
   SMAZÁNÍ JE V „finally". Účet, který po spadlé kontrole zůstane
   v databázi, je přesně ten nepořádek, kvůli kterému by se tahle
   zkouška přestala pouštět. */
export async function zalozZkusebniUcet(url, serviceKlic) {
  const id = (globalThis.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now());
  /* Doména .invalid je k tomuhle vyhrazená normou (RFC 2606) — nikomu
     nepatří a nikdy patřit nebude, takže se nemůže stát, že by se
     účet založil na cizí adresu. */
  const email = `kontrola-${id}@parcelaka-kontrola.invalid`;
  const heslo = 'K' + id + '!x';
  const r = await fetch(url.replace(/\/+$/, '') + '/auth/v1/admin/users', {
    method: 'POST',
    headers: { apikey: serviceKlic, Authorization: 'Bearer ' + serviceKlic,
      'content-type': 'application/json' },
    body: JSON.stringify({ email, password: heslo, email_confirm: true }),
  });
  if (r.status !== 200 && r.status !== 201) return { chyba: `HTTP ${r.status}` };
  const j = await r.json().catch(() => null);
  return { id: j && j.id, email, heslo };
}

export async function smazZkusebniUcet(url, serviceKlic, idUzivatele) {
  if (!idUzivatele) return false;
  const r = await fetch(url.replace(/\/+$/, '') + '/auth/v1/admin/users/' + idUzivatele, {
    method: 'DELETE',
    headers: { apikey: serviceKlic, Authorization: 'Bearer ' + serviceKlic },
  });
  return r.status >= 200 && r.status < 300;
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
  let zkusebni = null;
  if (process.env.PK_TEST_EMAIL && process.env.PK_TEST_HESLO) {
    token = await prihlas(url, anonKlic, process.env.PK_TEST_EMAIL, process.env.PK_TEST_HESLO);
    if (!token) console.log('(Přihlášení zkušebním účtem neprošlo — ta část kontroly se vynechá.)');
  } else if (process.argv.indexOf('--se-zkusebnim-uctem') >= 0) {
    zkusebni = await zalozZkusebniUcet(url, serviceKlic);
    if (zkusebni.chyba || !zkusebni.id) {
      console.log(`(Dočasný účet se nepodařilo založit: ${zkusebni.chyba || 'bez id'}`
        + ' — role „přihlášený" se nezkontroluje.)');
      zkusebni = null;
    } else {
      tajne.push(zkusebni.heslo);
      token = await prihlas(url, anonKlic, zkusebni.email, zkusebni.heslo);
      if (!token) console.log('(Dočasný účet se nepodařilo přihlásit — role se nezkontroluje.)');
    }
  }

  let vysledek;
  try {
    vysledek = await zkontroluj({ url, anonKlic, serviceKlic, sql, token });
  } catch (e) {
    console.error('Kontrola spadla: ' + bezKlicu(e && e.message, tajne));
    await smazZkusebniUcet(url, serviceKlic, zkusebni && zkusebni.id);
    process.exit(1);
  } finally {
    if (zkusebni && zkusebni.id) {
      const smazano = await smazZkusebniUcet(url, serviceKlic, zkusebni.id);
      /* Řádek s ::warning:: musí začínat na kraji — odsazený příkaz
         se nemusí rozpoznat a zrovna tenhle vzkaz se ztratit nesmí. */
      console.log(smazano ? '  (dočasný účet smazán)'
        : '::warning::Dočasný účet se nepodařilo smazat — zkontrolujte Supabase → Authentication.');
    }
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
    /* NEDOKONČENÁ KONTROLA NENÍ KONTROLA V POŘÁDKU. První běh vypsal
       „nepřihlášený vidí undefined tabulek" a puntík byl přesto zelený:
       dotaz veřejným klíčem neprošel, takže celá otázka „kdo co vidí" —
       ta důležitější půlka — se vůbec nespočítala, a skončila jako
       varování, které se do souhrnu nedostalo. Souhrn proto říká
       ZVLÁŠŤ, co se ověřit nepodařilo, a nikdy netvrdí číslo, které
       nemá. */
    const kdoVidi = prehled.proNeprihlaseneTabulek != null
      ? `u ${prehled.proNeprihlaseneTabulek} neveřejných tabulek ověřeno, že je`
        + ' nepřihlášený nepřečte'
      : 'POZOR: co vidí nepřihlášený, se ověřit nepodařilo';
    const shrnuti = chyby.length
      ? `Kontrola databáze: ${chyby.length} nálezů — ` + chyby.map((n) => n.co).join('; ')
      : `Databáze sedí: ${prehled.vDatabaziTabulek} tabulek, `
        + `${prehled.vDatabaziFunkci} funkcí. ${kdoVidi}`
        + (prehled.proPrihlaseneTabulek != null
          ? `, a totéž ověřeno i pro přihlášeného uživatele`
          : '') + '.';
    console.log(`::${chyby.length ? 'error' : 'notice'}::` + bezKlicu(shrnuti, tajne));
    /* Varování taky do souhrnu — jinak se o nich člověk doví jen tak,
       že si otevře protokol, což je přesně to, čemu se tenhle řádek
       vyhýbá. */
    for (const n of nalezy.filter((x) => x.vaha !== 'chyba')) {
      console.log('::warning::' + bezKlicu(`${n.co} (${n.proc})`, tajne));
    }
  }
  process.exit(chyby.length ? 1 : 0);
}
