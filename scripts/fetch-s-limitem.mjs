/* Jediné místo, kde se na webu volá `fetch` s časovým limitem.
 * ====================================================================
 *
 * PROČ. Naměřeno 19. 10.: ze **devíti** skriptů, které běží v úlohách
 * GitHubu, volalo `fetch` **sedm** bez jakéhokoli limitu — a **žádná
 * z osmi úloh** neměla `timeout-minutes`. Visící spojení se tak nemělo
 * o co zastavit: `fetch` bez `AbortSignal` čeká, dokud druhá strana
 * neodpoví nebo nezavře spojení, a když mlčí, čeká se dál.
 *
 * Co to v praxi znamená: `send-alerts.mjs` rozesílá e-maily přes
 * Resend. Když Resend neodmítne, ale jen přestane odpovídat, úloha
 * `rozesilani.yml` běží do stropu, který GitHub vynutí sám — šest
 * hodin. Spotřebuje minuty a hlavně **další naplánovaný běh se
 * nespustí**, protože ten předchozí pořád visí.
 *
 * Vzor je převzatý z `kontrola-inzeratu.mjs`, kde už byl: AbortController
 * plus `setTimeout`, který ho spustí. Tady je vytažený na jedno místo,
 * aby se nemusel opisovat do sedmi souborů — a aby se dal v jednom
 * místě změnit.
 *
 * Chyba z limitu se přejmenuje: `AbortError` neřekne, co se stalo,
 * kdežto „Zdroj neodpověděl do 20 s" ano. V logu úlohy je to rozdíl
 * mezi hádáním a diagnózou.
 */

/* Dvacet vteřin: déle než nejpomalejší zdroj, se kterým web pracuje
   (ČÚZK i Supabase odpovídají do jednotek vteřin), a krátce dost na
   to, aby si toho úloha všimla dřív než člověk. */
export const VYCHOZI_LIMIT = 20000;

export async function fetchSLimitem(adresa, volby = {}, limit = VYCHOZI_LIMIT) {
  /* Když si volající přinese vlastní signál, platí jeho — tenhle
     pomocník mu ho nepřebíjí, jen doplňuje, když žádný není. */
  if (volby && volby.signal) return fetch(adresa, volby);
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), limit);
  try {
    return await fetch(adresa, Object.assign({}, volby, { signal: ac.signal }));
  } catch (e) {
    if (e && (e.name === 'AbortError' || e.code === 'ABORT_ERR')) {
      const chyba = new Error('Zdroj neodpověděl do ' + Math.round(limit / 1000)
        + ' s: ' + String(adresa).slice(0, 120));
      chyba.code = 'CASOVY_LIMIT';
      throw chyba;
    }
    throw e;
  } finally {
    clearTimeout(t);
  }
}
