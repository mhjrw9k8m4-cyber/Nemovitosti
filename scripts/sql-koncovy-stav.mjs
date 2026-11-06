/* CO V DATABÁZI ZŮSTANE, AŽ 00-vse.sql DOBĚHNE CELÝ.
 *
 * Proč to vzniklo: hlídač §466 hledal v balíku ŘETĚZCE. Oponentní
 * posudek 6. 11. na to ukázal sedm obchvatů a čtyři jsem si naměřil
 * sám — každý otevřel díru a hlídač u všech čtyř hlásil 12/12:
 *
 *   alter table listings disable row level security;
 *   create policy verejne_zpet on listings for select using (true);
 *   create policy "zpet" on public.listings for select using (true);
 *     create policy "zpet2" on listings for select using (true);
 *
 * První z nich je ten poučný. Hlídač ověřoval RLS tím, že se v souboru
 * NĚKDE vyskytuje „enable row level security". To je pravda i v balíku,
 * který ho na konci vypne. **Přítomnost příkazu není stav.** Pořadí
 * rozhoduje a čte se v něm celý soubor, ne jeden řádek.
 *
 * Zbylé tři jsou o tom, co všechno je v SQL totéž slovo: jméno
 * pravidla může a nemusí být v uvozovkách, tabulka se smí psát
 * `public.listings`, příkaz smí být odsazený. Vzorek kotvený na `^`
 * s povinnými uvozovkami je tedy hlídač jen na jeden z mnoha způsobů,
 * jak tu věc napsat.
 *
 * Čte se tu:
 *   · rls          — tabulka → má zapnuté RLS? (poslední příkaz vyhrává)
 *   · politiky     — tabulka → jména pravidel, která přežijí
 *   · funkce       — jméno → podpisy (typy parametrů), které přežijí
 *   · sloupce      — tabulka → sloupce, které po všech alter zbydou
 *   · prava        — jméno funkce → role, které ji smí spustit
 *   · tela         — jméno funkce → tělo poslední přežívající podoby
 *
 * NENÍ to parser SQL a nemá být. Je to čtečka šesti druhů příkazů,
 * které tenhle balík používá — a každý z nich ve všech podobách,
 * ve kterých se dá napsat. Co nepozná, to NEZAMLČÍ: `neznamo` nese
 * příkazy, které vypadají jako jeden z těch šesti, ale přečíst se
 * nedaly, a hlídač z nich dělá nález.
 */

/** Pryč komentáře — ale jen ty, které nejsou v apostrofech. */
export function bezKomentaru(sql) {
  let ven = '';
  let i = 0;
  const s = String(sql || '');
  while (i < s.length) {
    const z = s[i];
    if (z === "'") {                       // řetězec: opsat celý
      ven += z; i++;
      while (i < s.length) { ven += s[i]; if (s[i] === "'" && s[i + 1] !== "'") { i++; break; } i++; }
      continue;
    }
    if (z === '$' && s.slice(i, i + 2) === '$$') {   // tělo funkce: opsat celé
      const konec = s.indexOf('$$', i + 2);
      if (konec < 0) { ven += s.slice(i); break; }
      ven += s.slice(i, konec + 2); i = konec + 2; continue;
    }
    if (z === '-' && s[i + 1] === '-') {    // řádkový komentář
      const nl = s.indexOf('\n', i);
      if (nl < 0) break;
      ven += '\n'; i = nl + 1; continue;
    }
    if (z === '/' && s[i + 1] === '*') {    // blokový komentář
      const konec = s.indexOf('*/', i + 2);
      if (konec < 0) break;
      ven += ' '; i = konec + 2; continue;
    }
    ven += z; i++;
  }
  return ven;
}

/** „public.listings" → „listings"; „\"Jméno\"" → „Jméno". */
export function jmeno(x) {
  let t = String(x || '').trim();
  if (t.startsWith('"') && t.endsWith('"') && t.length > 1) return t.slice(1, -1);
  t = t.replace(/^[a-z_][a-z0-9_]*\./i, '');            // schéma pryč
  if (t.startsWith('"') && t.endsWith('"') && t.length > 1) return t.slice(1, -1);
  return t.toLowerCase();
}

/* Týž typ se v PostgreSQL píše víc způsoby. Když `create` napíše
   `int` a `drop` `integer`, je to TÁŽ funkce — hlídač, který je
   porovnává po znacích, by ji pokládal za živou a hlásil planý nález
   („v databázi chybí"), nebo naopak přehlédl, že ji balík zrušil. */
const ALIASY = new Map([
  ['int', 'integer'], ['int4', 'integer'], ['int2', 'smallint'], ['int8', 'bigint'],
  ['float4', 'real'], ['float8', 'double precision'], ['float', 'double precision'],
  ['bool', 'boolean'], ['varchar', 'character varying'], ['char', 'character'],
  ['timestamptz', 'timestamp with time zone'], ['timetz', 'time with time zone'],
  ['decimal', 'numeric'],
]);
export function normalizujTyp(t) {
  let v = String(t || '').trim().toLowerCase().replace(/\s+/g, ' ');
  v = v.replace(/^(?:in|out|inout|variadic)\s+/, '');   // směr parametru není typ
  const pole = /\[\s*\d*\s*\]\s*$/.test(v) ? '[]' : '';
  v = v.replace(/(\[\s*\d*\s*\]\s*)+$/, '').trim();
  v = v.replace(/\(\s*\d+(\s*,\s*\d+)?\s*\)\s*$/, '').trim();   // délka/přesnost
  v = v.replace(/^"(.*)"$/, '$1');
  return (ALIASY.get(v) || v) + pole;
}

/** Seznam parametrů → podpis „uuid,uuid". Jména parametrů i `default` pryč. */
export function podpisZSeznamu(seznam) {
  const kusy = [];
  let hloubka = 0, ted = '', vApostrofu = false;
  for (const z of String(seznam || '')) {
    if (vApostrofu) { ted += z; if (z === "'") vApostrofu = false; continue; }
    if (z === "'") { vApostrofu = true; ted += z; continue; }
    if (z === '(') hloubka++;
    if (z === ')') hloubka--;
    if (z === ',' && hloubka === 0) { kusy.push(ted); ted = ''; continue; }
    ted += z;
  }
  if (ted.trim()) kusy.push(ted);
  return kusy.map((k) => {
    let t = k.replace(/\s+default\s[\s\S]*$/i, '').replace(/\s*=\s*[^,]*$/, '').trim().replace(/\s+/g, ' ');
    t = t.replace(/^(?:in|out|inout|variadic)\s+/i, '');
    /* Prvním slovem může být JMÉNO parametru („p_lat double precision")
       nebo už sám typ („double precision"). Pozná se to tak, že druhé
       slovo je pokračováním typu, ne typ sám. */
    const slova = t.split(' ');
    if (slova.length > 1 && !/^(precision|varying|with|without)$/i.test(slova[1])) {
      t = slova.slice(1).join(' ');
    }
    return normalizujTyp(t);
  }).filter((x) => x !== '').join(',');
}

/** Od pozice otevírací závorky vrátí její obsah (závorky se párují). */
function vZavorce(s, i) {
  if (s[i] !== '(') return null;
  let hloubka = 0, vApostrofu = false;
  for (let j = i; j < s.length; j++) {
    const z = s[j];
    if (vApostrofu) { if (z === "'") vApostrofu = false; continue; }
    if (z === "'") { vApostrofu = true; continue; }
    if (z === '(') hloubka++;
    else if (z === ')') { hloubka--; if (!hloubka) return { text: s.slice(i + 1, j), konec: j }; }
  }
  return null;
}

/* Identifikátor: buď v uvozovkách (může nést mezery), nebo bez nich
   (pak končí mezerou, závorkou nebo tečkou). Schéma se bere s ním. */
const ID = '(?:"[^"]+"|[a-z_][a-z0-9_$]*)';
const ID_TAB = `(?:${ID}\\s*\\.\\s*)?${ID}`;

export function koncovyStav(sqlSKomentari) {
  const sql = bezKomentaru(sqlSKomentari);
  const rls = new Map();
  const politiky = new Map();
  const funkce = new Map();
  const sloupce = new Map();
  const prava = new Map();
  const tela = new Map();
  const neznamo = [];

  /* --- RLS: poslední příkaz vyhrává ----------------------------- */
  for (const m of sql.matchAll(new RegExp(
    `alter\\s+table\\s+(?:if\\s+exists\\s+)?(${ID_TAB})\\s+(enable|disable)\\s+row\\s+level\\s+security`, 'gi'))) {
    rls.set(jmeno(m[1]), m[2].toLowerCase() === 'enable');
  }
  /* Příkaz, který o RLS mluví a nedal se přečíst, se nesmí zamlčet. */
  for (const m of sql.matchAll(/row\s+level\s+security/gi)) {
    const od = Math.max(0, m.index - 120);
    const okoli = sql.slice(od, m.index + 30);
    if (!/alter\s+table\s+(?:if\s+exists\s+)?(?:"[^"]+"|[a-z_][a-z0-9_$]*)(?:\s*\.\s*(?:"[^"]+"|[a-z_][a-z0-9_$]*))?\s+(enable|disable|force|no\s+force)\s+row\s+level\s+security/i.test(okoli)) {
      neznamo.push('RLS: ' + okoli.replace(/\s+/g, ' ').trim().slice(-90));
    }
  }

  /* --- Pravidla (policy) ---------------------------------------- */
  for (const m of sql.matchAll(new RegExp(
    `(create\\s+policy|drop\\s+policy(?:\\s+if\\s+exists)?)\\s+(${ID})\\s+on\\s+(?:table\\s+)?(${ID_TAB})`, 'gi'))) {
    const tab = jmeno(m[3]);
    const jm = jmeno(m[2]);
    if (!politiky.has(tab)) politiky.set(tab, new Set());
    if (/^create/i.test(m[1])) politiky.get(tab).add(jm); else politiky.get(tab).delete(jm);
  }
  for (const m of sql.matchAll(/\b(?:create|drop|alter)\s+policy\b/gi)) {
    const okoli = sql.slice(m.index, m.index + 200);
    if (!new RegExp(`^(?:create\\s+policy|drop\\s+policy(?:\\s+if\\s+exists)?|alter\\s+policy)\\s+${ID}\\s+on\\s`, 'i').test(okoli.replace(/\s+/g, ' '))) {
      neznamo.push('policy: ' + okoli.replace(/\s+/g, ' ').trim().slice(0, 90));
    }
  }

  /* --- Funkce: podpisy a těla ----------------------------------- */
  const reF = new RegExp(
    `(create\\s+(?:or\\s+replace\\s+)?function|drop\\s+function(?:\\s+if\\s+exists)?)\\s+(${ID_TAB})\\s*(?=\\()`, 'gi');
  for (const m of sql.matchAll(reF)) {
    const zav = vZavorce(sql, m.index + m[0].length);
    if (!zav) { neznamo.push('funkce: ' + m[0].replace(/\s+/g, ' ')); continue; }
    const jm = jmeno(m[2]);
    const podpis = podpisZSeznamu(zav.text);
    if (!funkce.has(jm)) funkce.set(jm, new Set());
    if (/^create/i.test(m[1])) {
      funkce.get(jm).add(podpis);
      const konec = sql.indexOf('$$', sql.indexOf('$$', zav.konec) + 2);
      tela.set(jm + '(' + podpis + ')', konec > 0 ? sql.slice(zav.konec, konec) : sql.slice(zav.konec, zav.konec + 2000));
    } else {
      funkce.get(jm).delete(podpis);
      tela.delete(jm + '(' + podpis + ')');
    }
  }

  /* --- Sloupce, se kterými balík hýbe --------------------------- */
  for (const m of sql.matchAll(new RegExp(
    `alter\\s+table\\s+(?:if\\s+exists\\s+)?(${ID_TAB})\\s+(add|drop)\\s+column\\s+(?:if\\s+(?:not\\s+)?exists\\s+)?(${ID})`, 'gi'))) {
    const tab = jmeno(m[1]);
    if (!sloupce.has(tab)) sloupce.set(tab, new Set());
    if (m[2].toLowerCase() === 'add') sloupce.get(tab).add(jmeno(m[3]));
    else sloupce.get(tab).delete(jmeno(m[3]));
  }
  /* A sloupce, které zakládá samo `create table`. */
  for (const m of sql.matchAll(new RegExp(`create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?(${ID_TAB})\\s*(?=\\()`, 'gi'))) {
    const zav = vZavorce(sql, m.index + m[0].length);
    if (!zav) continue;
    const tab = jmeno(m[1]);
    if (!sloupce.has(tab)) sloupce.set(tab, new Set());
    for (const r of zav.text.split('\n')) {
      const s = r.trim();
      const mm = new RegExp(`^(${ID})\\s+[a-z]`, 'i').exec(s);
      if (mm && !/^(primary|foreign|unique|check|constraint|exclude)\b/i.test(s)) sloupce.get(tab).add(jmeno(mm[1]));
    }
  }
  /* Pozor na pořadí: „create table if not exists" nad existující
     tabulkou neudělá nic, ale `alter ... drop column` ano. Proto se
     ještě jednou projdou alter příkazy — ty jsou v balíku vždy za
     zakládáním tabulky. */
  for (const m of sql.matchAll(new RegExp(
    `alter\\s+table\\s+(?:if\\s+exists\\s+)?(${ID_TAB})\\s+(add|drop)\\s+column\\s+(?:if\\s+(?:not\\s+)?exists\\s+)?(${ID})`, 'gi'))) {
    const tab = jmeno(m[1]);
    if (!sloupce.has(tab)) sloupce.set(tab, new Set());
    if (m[2].toLowerCase() === 'add') sloupce.get(tab).add(jmeno(m[3]));
    else sloupce.get(tab).delete(jmeno(m[3]));
  }

  /* --- Kdo smí spustit kterou funkci ---------------------------- */
  const reP = new RegExp(
    `(grant\\s+execute|revoke\\s+(?:all|execute)(?:\\s+privileges)?)\\s+on\\s+function\\s+(${ID_TAB})\\s*(?=\\()`, 'gi');
  for (const m of sql.matchAll(reP)) {
    const zav = vZavorce(sql, m.index + m[0].length);
    if (!zav) { neznamo.push('právo: ' + m[0].replace(/\s+/g, ' ')); continue; }
    const zbytek = sql.slice(zav.konec + 1, zav.konec + 201);
    const komu = /^\s*(?:to|from)\s+([^;]+);/i.exec(zbytek);
    if (!komu) { neznamo.push('právo bez rolí: ' + m[0].replace(/\s+/g, ' ')); continue; }
    const klic = jmeno(m[2]) + '(' + podpisZSeznamu(zav.text) + ')';
    if (!prava.has(klic)) prava.set(klic, new Set());
    const role = komu[1].split(',').map((r) => r.trim().toLowerCase().replace(/^"|"$/g, ''));
    for (const r of role) {
      if (/^create|^grant/i.test(m[1])) prava.get(klic).add(r); else prava.get(klic).delete(r);
    }
  }

  return { rls, politiky, funkce, sloupce, prava, tela, neznamo };
}

/** Jména funkcí, která po doběhnutí SQL v databázi zůstanou. */
export function funkceKtereZbydou(sql) {
  const { funkce } = koncovyStav(sql);
  return [...funkce.entries()].filter(([, s]) => s.size).map(([j]) => j);
}

/** Funkce, které PŘEŽIJÍ a smí je spustit nepřihlášený (anon/PUBLIC).
 *
 *  Samotný `grant` nestačí: když se funkce pak zruší, zmizí s ní
 *  i přidělená práva. Hlídač, který čte jen granty, by tedy po §466
 *  pořád hlásil `my_listing(uuid,uuid)` jako povolenou anonovi —
 *  přitom už neexistuje. Protíná se to proto s přežívajícími podpisy.
 */
export function anonMuzeSpustit(stav) {
  const ven = [];
  for (const [klic, role] of stav.prava) {
    if (!role.has('anon') && !role.has('public')) continue;
    const m = /^([^(]+)\((.*)\)$/.exec(klic);
    if (!m) continue;
    const podpisy = stav.funkce.get(m[1]);
    if (podpisy && podpisy.has(m[2])) ven.push(klic);
  }
  return ven.sort();
}

/** Tabulky, do kterých tělo funkce ZAPISUJE (insert/update/delete). */
export function zapisujeDo(telo) {
  const t = String(telo || '');
  const tab = new Set();
  /* `(?<![a-z_])` místo `\b` schválně: hranice slova sestavená
     v řetězci kolem proměnné je past, kterou hlídá
     scripts/test-mrtva-hranice.mjs (§454), a strop takových míst smí
     jen klesat. Tady je to navíc přesnější — jde o SQL klíčové slovo,
     ne o české slovo. */
  for (const m of t.matchAll(new RegExp(`(?<![a-z_])(?:insert\\s+into|update|delete\\s+from)\\s+(${ID_TAB})`, 'gi'))) {
    tab.add(jmeno(m[1]));
  }
  return tab;
}
