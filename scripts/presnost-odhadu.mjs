/* PŘESNOST ODHADU PODLE DRUHU — jedno místo, kde se počítá.
   ==================================================================
   Používá to měřidlo (scripts/mericka-odhadu.mjs) i generátor řezů
   (scripts/generate-data-rezy.mjs), který výsledek ukládá do
   data/model.json. Kdyby to byly dvě kopie, rozešly by se — a web by
   pak u čísla psal jinou nejistotu, než jakou měřidlo naměří.

   JAK SE MĚŘÍ. Křížově na desetinách: nabídky se rozdělí na deset dílů,
   model se vždycky postaví z devíti a odhaduje ten desátý. Odhad se
   porovná s NABÍDKOVOU cenou. Bez toho by se model měřil na datech,
   ze kterých je postavený, a vyšel by vždycky skvěle.

   PROČ MEDIÁN: pár pokřivených cen (podíl, překlep v inzerátu) by
   průměr utrhlo. Dělení se řídí pořadím v datech (i % 10), takže dvě
   spuštění dají totéž číslo.

   NA ČEM SE MĚŘÍ: jen celé pozemky na prodej. U podílu je cena za
   zlomek a výměra celá, takže „chyba odhadu" by měřila tu nesrovnalost,
   ne model. Dražby mají vyvolávací cenu, což není nabídková cena.
   ================================================================== */

export function median(a) {
  if (!a.length) return null;
  const b = a.slice().sort((x, y) => x - y);
  const i = Math.floor(b.length / 2);
  return b.length % 2 ? b[i] : (b[i - 1] + b[i]) / 2;
}

/* Vrací { skupina: { median, kolik, celkem } } — medián absolutní
   procentní chyby, u kolika nabídek odhad vůbec vznikl a kolik jich
   v té skupině je. `kolik` a `celkem` jsou tu proto, že „odhad nevznikl"
   je svůj vlastní druh nepřesnosti: člověk nedostane špatné číslo,
   dostane mlčení — a to se z mediánu chyby nepozná. */
export function presnostPodleDruhu(VSE, CENY) {
  const vzorek = VSE.filter((d) => d.type === 'sale' && !d.podil && d.price > 0 && d.area > 0);
  const poradi = new Map(VSE.map((d, i) => [d, i]));
  const chybaNabidky = new Map();
  for (let f = 0; f < 10; f++) {
    const trenink = VSE.filter((_, i) => i % 10 !== f);
    const model = CENY.postav(trenink);
    for (const d of vzorek) {
      if (poradi.get(d) % 10 !== f) continue;
      const o = model.odhad(d);
      if (!o || !(o.zaM2 > 0)) continue;
      const skutecna = d.price / d.area;
      chybaNabidky.set(d, Math.abs(o.zaM2 - skutecna) / skutecna * 100);
    }
  }
  const ven = {};
  for (const d of vzorek) {
    const g = CENY.druhGroup(d.druh) || '';
    if (!ven[g]) ven[g] = { chyby: [], celkem: 0 };
    ven[g].celkem++;
    const ch = chybaNabidky.get(d);
    if (ch != null) ven[g].chyby.push(ch);
  }
  const vysledek = {};
  for (const g of Object.keys(ven)) {
    vysledek[g] = { median: median(ven[g].chyby), kolik: ven[g].chyby.length, celkem: ven[g].celkem };
  }
  return vysledek;
}
