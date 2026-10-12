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
