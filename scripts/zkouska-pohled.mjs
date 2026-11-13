/* Přepnutí Seznam / Mapa pro zkoušky v prohlížeči.
 * ====================================================================
 * PROČ TOHLE EXISTUJE. Úvodní stránka má na telefonu dva pohledy nad
 * sebou a vidět je vždycky jen jeden. Který je výchozí, se za dva dny
 * obrátilo dvakrát (17. 10. na mapu, 18. 10. zpátky na seznam, obojí
 * na přání majitele — viz js/main.js), takže se na to nedá spoléhat.
 * Zkouška, která měří cokoli v jednom z těch pohledů, si ho proto
 * vyžádá JMÉNEM; jinak čeká třicet vteřin na prvek, který v DOMu je,
 * ale není vidět, a hlásí to jako „chybí".
 *
 * A NESMÍ SE TO PSÁT PODLE TOHO, CO JE PRÁVĚ AKTIVNÍ. Zkouška podkladu
 * mapy klikala na `.mvt-btn:not(.active)` ve významu „přepni na mapu".
 * Ve chvíli, kdy se výchozí pohled obrátil, to začalo přepínat na
 * seznam a měřila se šířka něčeho, co je jen na mapě (0 px). Proto se
 * tady pohled žádá JMÉNEM.
 *
 * ČEKÁ SE NA JS, NE NA HODINKY. Tlačítka jsou ve statickém HTML, ale
 * přepínají až od chvíle, kdy js/main.js navěsí obsluhu — klepnutí
 * dřív by tiše nic neudělalo a zkouška by měřila skrytý pohled dál.
 * Čeká se proto na vykreslený výpis a výsledek se ověřuje na třídě
 * `.map-app.mv-seznam`; při nezdaru se klepne ještě jednou.
 *
 * Na monitoru přepínač není (oba pohledy stojí vedle sebe) — pak se
 * nic nestane a vrací se false, což není chyba.
 * ==================================================================== */

const JE_SEZNAM = () => {
  const a = document.querySelector('.map-app');
  return !!(a && a.classList.contains('mv-seznam'));
};

/** Přepne úvodní stránku na daný pohled ('seznam' | 'mapa').
 *  Vrací true, když pohled po návratu opravdu platí. */
export async function naPohled(p, pohled, cekani) {
  const chceSeznam = pohled === 'seznam';
  // Přepínač je jen na telefonu; na monitoru není co přepínat.
  const je = await p.evaluate(() => !!document.querySelector('.mv-toggle .mvt-btn'));
  if (!je) return false;
  // Dokud výpis nevykreslil JS, nemá tlačítko navěšenou obsluhu.
  await p.waitForFunction(() => document.querySelectorAll('#opp-list .opp-item').length > 0,
    null, { timeout: 30000 }).catch(() => {});
  for (let pokus = 0; pokus < 2; pokus++) {
    const hotovo = await p.evaluate((mv) => {
      const a = document.querySelector('.map-app');
      const jeSeznam = !!(a && a.classList.contains('mv-seznam'));
      if (jeSeznam === (mv === 'seznam')) return true;
      const b = [...document.querySelectorAll('.mv-toggle .mvt-btn')]
        .find((x) => (x.getAttribute('data-mv') || '') === mv);
      if (b) b.click();
      return false;
    }, pohled);
    /* Čeká se i při „hotovo": po přepnutí se mapa i výpis ještě
       dorovnávají a zkouška, která měří hned, chytí půl přechodu. */
    await p.waitForTimeout(cekani == null ? 900 : cekani);
    if (hotovo) break;
  }
  return await p.evaluate(JE_SEZNAM) === chceSeznam;
}

export const naSeznam = (p, cekani) => naPohled(p, 'seznam', cekani);
export const naMapu = (p, cekani) => naPohled(p, 'mapa', cekani);

/** Otevře na telefonu otvírač „Další akce" nad výpisem.
 *
 *  OD 13. 11. JE NÁŘADÍ POD JEDNÍM NÁPISEM. Majitel poslal vyfocený
 *  telefon: „ale aj potřebuju, aby jsi to nějak upravil, je to
 *  přehlcené" — sedm tlačítek v pěti řádcích nad první nabídkou je
 *  teď v <details id="mn-vse">: „Procházet po jednom", „Uložené",
 *  „Porovnat", „Zobrazit skryté", „Dražby po termínu" a „Stáhnout
 *  výběr". Kdo na ně chce klepnout, musí otvírač nejdřív otevřít —
 *  jinak Playwright čeká třicet vteřin a zkouška PADNE, protože
 *  prvek v zavřeném <details> nemá krabici (přesně tak spadl
 *  test-rozvrzeni na `p.click('#mc-prosle')`).
 *  Na monitoru obal mizí (display:contents) a nářadí stojí v řádku,
 *  takže tam pomůcka nic nedělá a vrací false. */
export async function otevriNastroje(p, cekani) {
  const otevrel = await p.evaluate(() => {
    const o = document.getElementById('mn-vse');
    if (!o) return false;
    const s = o.querySelector('summary');
    if (!s || !s.checkVisibility()) return false;   // monitor: otvírač se nekreslí
    if (!o.open) o.open = true;
    return true;
  });
  if (otevrel) await p.waitForTimeout(cekani == null ? 300 : cekani);
  return otevrel;
}
