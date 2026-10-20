/* Čekání na PŘIPRAVENOU STRÁNKU — a ne na hodinky.
 *
 * Proč to tu je: po `goto` se ve zkouškách čekalo pevnou dobu, než se
 * rozběhne JS stránky — nejčastěji `waitForTimeout(2200)`. Naměřeno
 * 19. 10.: **201 takových míst ve zkouškách, dohromady 8,5 minuty**
 * čistého spánku. To je špatně dvakrát:
 *
 *   1) Na pomalejším stroji (CI) nemusí pevná doba stačit a zkouška
 *      spadne na něčem, co v aplikaci není. Přesně tím padl běh 553:
 *      čekalo se 260 ms na překreslení, které trvá 300 ms.
 *   2) Na rychlém stroji se čeká zbytečně. Sada v prohlížeči trvala
 *      59 minut, z toho nejméně 27 % se prospalo.
 *
 * Čeká se proto na to, NA CO ČEKÁ ČLOVĚK: až je na stránce vidět to,
 * co se vzápětí měří. Pozor na jednu věc — čekat se smí jen na to, co
 * zkouška NEMĚŘÍ. Kdo si počká na „políčko je zaostřené" a pak změří,
 * že je zaostřené, nezměřil nic.
 *
 * Každá funkce vrací `true`, když se dočkala, a `false`, když ne —
 * aby zkouška mohla pojmenovat chybu sama, místo aby padla na timeoutu
 * a v CI zůstal výpis, ze kterého není poznat co a kde.
 */

const STROP = 20000;

/* Obecné: čeká na splnění podmínky v prohlížeči. Tenčí než
   p.waitForFunction jen o to, že nevyhazuje — chyba patří do výpisu
   zkoušky, ne do stopy výjimky. */
export async function pripravenoKdyz(p, podminka, arg = null, strop = STROP) {
  try { await p.waitForFunction(podminka, arg, { timeout: strop }); return true; }
  catch (e) { return false; }
}

/* STRÁNKA POZEMKU. Políčko poznámky i věta „kde to leží" vznikají až
   v js/pozemek.js, a to v jednom běhu: jak je políčko na stránce, jsou
   navěšené i jeho obsluhy (viz `poznEl.addEventListener` hned za jeho
   vytvořením). Věta `#pz-pozn-kde` se dosazuje v `rekniKde()` až potom,
   takže je to pozdější a tedy poctivější značka připravenosti. */
export function pripravenoPozemek(p, strop = STROP) {
  return pripravenoKdyz(p, () => {
    const pole = document.getElementById('pz-pozn-text');
    const kde = document.getElementById('pz-pozn-kde');
    return !!pole && !!kde && (kde.textContent || '').trim().length > 0;
  }, null, strop);
}

/* VÝPIS NABÍDEK (úvodní stránka). Karty vykresluje js/main.js z dat,
   takže první `.opp-item` znamená, že data došla a výpis je vykreslený.
   Kostra načítání (`.opp-skel`) se nepočítá — ta je na stránce i když
   data ještě nejsou. */
export function pripravenoVypis(p, strop = STROP) {
  return pripravenoKdyz(p, () => !!document.querySelector('.opp-item'), null, strop);
}

/* ULOŽENÍ POZNÁMKY. Viditelná značka je `#pz-pozn-stav`: „uloženo",
   „smazáno", nebo věta o chybě. Čeká se na ni místo na prodlevu
   ukládání (600 ms po psaní, hned při odchodu z pole). */
export function poznamkaUlozena(p, vzor = /uložen|smazán/i, strop = 10000) {
  return pripravenoKdyz(p, (v) => {
    const el = document.getElementById('pz-pozn-stav');
    return !!el && new RegExp(v.zdroj, v.priznaky).test(el.textContent || '');
  }, { zdroj: vzor.source, priznaky: vzor.flags }, strop);
}

/* A KDYŽ SE MĚŘÍ, ŽE NIC NEODEŠLO: po uložení se musí dát síti šance
   něco odeslat, jinak by kontrola „poznámka neodešla ven" prošla jen
   proto, že se měřilo dřív, než by request vůbec vznikl. `networkidle`
   je podmínka (půl sekundy bez provozu), ne pevná doba. */
export async function sitUtichla(p, strop = 5000) {
  try { await p.waitForLoadState('networkidle', { timeout: strop }); return true; }
  catch (e) { return false; }
}

/* DOM UTICHL — obecná připravenost pro zkoušky, které projdou DESÍTKY
   různých stránek a na každé měří rozvržení (terče pro prst, přetékání,
   velikosti písma). Tam se nedá čekat na jeden konkrétní prvek: každá
   stránka má jiný. Čekat na pevnou dobu taky ne — v test-rozvrzeni to
   bylo 10 stránek × (2 500 + 500) ms, tedy půl minuty spánku v jednom
   cyklu.
   Čeká se proto na to, že stránka PŘESTALA MĚNIT DOM: nasadí se
   MutationObserver a čeká se na daný interval klidu. Značka je per
   dokument, takže se po každé navigaci nasazuje znovu (`if` níž to
   pozná sám).
   Mez: stránka, která DOM mění pořád (dojíždějící dlaždice mapy), se
   neutiší — proto strop. Vyprší-li, měří se dál; je to čekání, ne
   kontrola. */
export async function domUtichlo(p, ticho = 400, strop = 15000) {
  await p.evaluate((t) => {
    if (window.__pkTicho) return;
    window.__pkTicho = { kdy: Date.now(), ticho: t };
    try {
      new MutationObserver(() => { window.__pkTicho.kdy = Date.now(); })
        .observe(document.documentElement,
          { childList: true, subtree: true, attributes: true, characterData: true });
    } catch (e) {}
  }, ticho).catch(() => {});
  return pripravenoKdyz(p, (t) => document.readyState === 'complete'
    && !!window.__pkTicho && (Date.now() - window.__pkTicho.kdy) > t, ticho, strop);
}

/* PŘEKRESLENÍ VÝPISU PO ZÁSAHU (úvodní stránka).
 *
 * Filtr, řazení i hledání vedou v js/main.js na jedinou funkci
 * `renderList()`, a ta si na začátku přičte `window.PK_VYKRESLENI`
 * (počitadlo je tam pro zkoušky, web ho sám nepoužívá). Čeká se tedy
 * na to, že výpis vznikl ZNOVU — ne na dobu, o které si zkouška myslí,
 * že na to stačí.
 *
 * Proč to tu je: po `dispatchEvent` zbylo ve zkouškách 22 míst
 * s pevným čekáním, dohromady 16,5 s. Pevná doba je buď zbytečně
 * dlouhá, nebo v CI pod zátěží krátká — a tam, kde je krátká, zkouška
 * měří stav PŘED zásahem a tvrdí o něm něco, co o něm neplatí.
 *
 * Hledání je odložené (debounce), takže se čeká i na tu prodlevu;
 * štědrý strop se platí jen tehdy, když se nestane nic.
 */
export async function vykresleniPo(p, zasah, strop = STROP) {
  const pred = await p.evaluate(() => window.PK_VYKRESLENI || 0).catch(() => 0);
  await zasah();
  return pripravenoKdyz(p, (n) => (window.PK_VYKRESLENI || 0) > n, pred, strop);
}
