/* ROZBAL NA TELEFONU HLEDÁNÍ — jedno místo pro všechny zkoušky.
   ====================================================================
   Na úzkém displeji je vidět jen pole s lupou; okolí, druhy nabídek
   a „Druh, cena, výměra a další" se ukážou až po klepnutí do pole
   (viz js/main.js, rozbaleniHledani). Zkoušky, které na ty filtry
   sahají, musí udělat totéž co člověk — klepnout.

   JEDNO VOLÁNÍ NA STRÁNKU STAČÍ: blok se rozbaluje V TOKU a sám se
   nezavírá, takže zůstane otevřený až do „Hotovo". (U dřívějšího
   pokusu s překryvem to stačit nemohlo a bylo to znamení, že je
   špatně návrh, ne zkoušky.)

   Na širokém displeji se nic neschovává a funkce neudělá nic, takže
   ji jde volat bez ohledu na šířku okna. */
export async function rozbalHledani(p, cekani = 350) {
  const blok = await p.$('#ms-rozsirene');
  if (!blok) return false;
  if (await blok.isVisible()) return true;
  const pole = await p.$('#map-search');
  if (!pole) return false;
  await pole.click();
  await p.waitForTimeout(cekani);
  return true;
}

/* A OTEVŘI I PANEL FILTRŮ („Druh, cena, výměra a další").
   ====================================================================
   Od 29. 10. leží V PANELU i druh nabídky a řazení — majitel je tam
   poslal („toto by mělo být spojené se zbytkem a řazení tedy v té
   tabulce"). Ve sbaleném panelu nejsou vidět, takže klepnutí do nich
   tiše neudělá nic a zkouška pak měří výchozí stav, ne nastavený. Stalo
   se to třem zkouškám naráz (test-barvy, test-odkaz-prohlizec,
   test-sliby), tak ať je otevírání na jednom místě.

   Nejdřív se rozbalí hledání jako člověk (klepnutím do pole), pak se
   otevře `<details id="ms-filters">`. Souhrn `.msf-summary` se
   nekliká: na telefonu ho ve sbaleném stavu překrývá mapa a Playwright
   by místo srozumitelné hlášky spadl na třicetisekundový timeout. */
export async function otevriPanel(p, cekani = 300) {
  await rozbalHledani(p, cekani);
  const je = await p.evaluate(() => {
    const d = document.getElementById('ms-filters');
    if (!d) return false;
    d.open = true;
    return true;
  });
  await p.waitForTimeout(cekani);
  return je;
}

