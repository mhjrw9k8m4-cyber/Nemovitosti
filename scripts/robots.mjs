/**
 * Čtení robots.txt — rozhodnutí, jestli smíme stránku číst.
 * ====================================================================
 * Dosud stálo „robots.txt dovoluje" jen v komentářích u tří stahovačů
 * (viz scripts/fetch-opportunities.mjs). To je tvrzení z jednoho dne:
 * až se soubor na cizím webu změní, komentář o tom nic nenapoví a robot
 * bude dál brát, co brát nemá. Tenhle modul to mění na věc, kterou si
 * robot přečte sám.
 *
 * Pravidla jsou z RFC 9309 (dřív „robots exclusion protocol"):
 *   · skupiny začínají řádky User-agent, platí ta NEJKONKRÉTNĚJŠÍ,
 *     která na naše jméno sedí; jinak skupina pro `*`;
 *   · z pravidel v ní vyhrává NEJDELŠÍ cesta, která na adresu sedí,
 *     a při stejné délce vyhrává Allow (tak to dělají i prohlížeče
 *     vyhledávačů — zákaz se nesmí dát obejít delším povolením);
 *   · `Disallow:` bez hodnoty znamená „nic nezakazuji";
 *   · `*` zastupuje libovolný úsek, `$` konec adresy;
 *   · Crawl-delay bereme jako POKYN, ne doporučení.
 *
 * Co tenhle modul SCHVÁLNĚ neumí: obejít zákaz. Když robots.txt
 * nejde přečíst, odpověď je „nečíst" — ne „asi to bude dobré".
 * Zdroj, který si nepřeje být čten, se číst nebude.
 */

/** Rozebere robots.txt na skupiny. Vrací [{ ua:[…], pravidla:[{ typ, cesta }], delay }]. */
export function rozeberRobots(text) {
  const skupiny = [];
  let akt = null, cekamUa = false;
  for (const radekRaw of String(text || '').split(/\r?\n/)) {
    const radek = radekRaw.replace(/#.*$/, '').trim();
    if (!radek) continue;
    const i = radek.indexOf(':');
    if (i < 0) continue;
    const klic = radek.slice(0, i).trim().toLowerCase();
    const hod = radek.slice(i + 1).trim();
    if (klic === 'user-agent') {
      /* Několik User-agent řádků za sebou = jedna skupina pro víc jmen.
         Jakmile přijde pravidlo, další User-agent zakládá skupinu novou. */
      if (!akt || !cekamUa) { akt = { ua: [], pravidla: [], delay: null }; skupiny.push(akt); }
      akt.ua.push(hod.toLowerCase());
      cekamUa = true;
      continue;
    }
    if (!akt) continue;                    // pravidlo bez skupiny — mimo protokol
    cekamUa = false;
    if (klic === 'disallow') akt.pravidla.push({ typ: 'zakaz', cesta: hod });
    else if (klic === 'allow') akt.pravidla.push({ typ: 'povoleni', cesta: hod });
    else if (klic === 'crawl-delay') {
      const n = Number(String(hod).replace(',', '.'));
      if (isFinite(n) && n >= 0) akt.delay = n;
    }
  }
  return skupiny;
}

/** Jméno robota ze celé hlavičky user-agent: „PozemkyKrokem/1.0 (+…)" → „pozemkykrokem". */
export function jmenoRobota(ua) {
  const m = /^([^/\s]+)/.exec(String(ua || '').trim());
  return (m ? m[1] : '').toLowerCase();
}

/** Skupina, která na nás sedí. Nejkonkrétnější = nejdelší sedící jméno. */
export function skupinaPro(skupiny, ua) {
  const jmeno = jmenoRobota(ua);
  let nejlepsi = null, nejlepsiDelka = -1, hvezda = null;
  for (const s of skupiny) {
    for (const u of s.ua) {
      if (u === '*') { if (!hvezda) hvezda = s; continue; }
      if (jmeno && jmeno.includes(u) && u.length > nejlepsiDelka) { nejlepsi = s; nejlepsiDelka = u.length; }
    }
  }
  return nejlepsi || hvezda || null;
}

/** Sedí vzor cesty (s `*` a `$`) na adresu? */
export function cestaSedi(vzor, cesta) {
  const v = String(vzor || '');
  if (v === '') return false;              // „Disallow:" bez hodnoty nezakazuje nic
  let re = '';
  for (let i = 0; i < v.length; i++) {
    const c = v[i];
    if (c === '*') re += '[\\s\\S]*';
    else if (c === '$' && i === v.length - 1) re += '$';
    else re += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
  try { return new RegExp('^' + re).test(cesta); } catch { return false; }
}

/**
 * Smíme číst `cesta` (včetně dotazu) podle textu robots.txt?
 * Vrací { dovoleno, pravidlo, delay } — `pravidlo` je to, které rozhodlo.
 */
export function jeDovoleno(robotsText, cesta, ua) {
  const skupiny = rozeberRobots(robotsText);
  const s = skupinaPro(skupiny, ua);
  if (!s) return { dovoleno: true, pravidlo: null, delay: null };
  let nej = null;
  for (const p of s.pravidla) {
    if (!cestaSedi(p.cesta, cesta)) continue;
    /* Nejdelší sedící pravidlo; při stejné délce vyhrává povolení. */
    if (!nej || p.cesta.length > nej.cesta.length
      || (p.cesta.length === nej.cesta.length && p.typ === 'povoleni')) nej = p;
  }
  return { dovoleno: !nej || nej.typ === 'povoleni', pravidlo: nej, delay: s.delay };
}

/**
 * Přečte robots.txt daného webu a rozhodne o adrese.
 *   url    — celá adresa, kterou chceme číst
 *   stahni — funkce (url) => { ok, status, text } (vkládá se, ať je to
 *            zkoušitelné bez sítě; v robotovi se předá `stahni` ze
 *            fetch-opportunities.mjs, který umí opakování a časový limit)
 *   ua     — hlavička user-agent, pod kterou se ptáme
 *
 * Nedostupný robots.txt (chyba sítě, 5xx) = NEČÍST. Tak to žádá
 * RFC 9309: dokud nevíme, co web dovoluje, nemáme právo brát.
 * Chybějící robots.txt (404) = číst smíme; to web říká výslovně.
 */
export async function smimeCist(url, { stahni, ua, mezipamet }) {
  let u;
  try { u = new URL(url); } catch { return { dovoleno: false, duvod: 'adresa se nedá přečíst' }; }
  const klic = u.origin;
  const cache = mezipamet || smimeCist._cache || (smimeCist._cache = new Map());
  let zapis = cache.get(klic);
  if (!zapis) {
    try {
      const r = await stahni(u.origin + '/robots.txt');
      if (r && r.status === 404) zapis = { text: '', chybi: true };
      else if (r && r.ok && typeof r.text === 'string') zapis = { text: r.text };
      else zapis = { chyba: `robots.txt odpověděl ${r && r.status ? r.status : 'nijak'}` };
    } catch (e) {
      zapis = { chyba: 'robots.txt se nepodařilo přečíst: ' + (e && e.message ? e.message : e) };
    }
    cache.set(klic, zapis);
  }
  if (zapis.chyba) return { dovoleno: false, duvod: zapis.chyba };
  const cesta = u.pathname + (u.search || '');
  const v = jeDovoleno(zapis.text, cesta, ua);
  return {
    dovoleno: v.dovoleno,
    duvod: zapis.chybi ? 'web robots.txt nemá — čtení nezakazuje'
      : (v.pravidlo ? `${v.pravidlo.typ === 'zakaz' ? 'Disallow' : 'Allow'}: ${v.pravidlo.cesta}`
        : 'robots.txt tuhle cestu neřeší'),
    delay: v.delay,
  };
}
