/* Nastavení řazení ve zkouškách — na jednom místě.
 *
 * Proč to není prosté `selectOption('#map-sort', …)`: web staví nad
 * každým <select> vlastní rozbalovač (.cdd, kvůli nevzhlednému
 * systémovému na iPhonu) a původní prvek zmenší na 1 × 1 px. Dokud
 * řazení stálo v hlavičce výpisu, vracelo mu pravidlo .msv-razeni
 * .map-select plnou krabici a Playwright si s ním poradil. Od
 * 29. 10. je řazení v panelu filtrů (majitel: „a řazení, tedy v té
 * tabulce") a ta výjimka s ním zmizela — selectOption od té doby čeká
 * třicet sekund na prvek, který je 1 × 1 px a neviditelný.
 *
 * Událost `change` je přesně to, co vyrobí klepnutí ve vlastním
 * rozbalovači, takže se zkouší tentýž kód, jaký běží člověku. */
export async function nastavRazeni(p, mode) {
  return p.evaluate((m) => {
    const el = document.getElementById('map-sort');
    if (!el) return false;
    el.value = m;
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return el.value === m;
  }, mode);
}
