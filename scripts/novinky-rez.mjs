/* Co je na trhu NOVÉHO — řez dat, odděleně od stránky.
 *
 * PROČ ZVLÁŠŤ. Celý ten řez stojí na jedné podmínce: nabídky z PRVNÍHO
 * dne evidence se nepočítají jako nové. Toho dne robot zdroje obešel
 * poprvé a `first_seen` naskočilo naráz 1 600 nabídkám, které na trhu
 * byly dávno předtím — nevíme jak dlouho.
 *
 * A tahle podmínka se v dnešních datech NEDÁ VYZKOUŠET: první den
 * evidence (19. 9. 2026) je starší než čtrnáctidenní okno, takže ho
 * okno vyloučí samo a sabotáž „podmínku smažeme" projde zeleně. Zkusil
 * jsem to a prošla — test hlídal jen to, že ten řádek v generátoru
 * někde je, a to je kontrola textu, ne chování.
 *
 * Proto je řez tady jako funkce s vlastními vstupy. Zkouška jí pak
 * podstrčí data, ve kterých první den evidence UVNITŘ okna leží, a na
 * nich se chování dokázat dá — dnes, i kdyby se archiv někdy zakládal
 * znovu a obě data se k sobě přiblížila.
 */
export const DNU_NOVE = 14;

/* První den evidence = nejstarší `first_seen` v datech. Záměrně ne
   konstanta: po novém založení archivu by opsané datum tiše pustilo
   tisíc starých nabídek mezi novinky. */
export function prvniDenEvidence(nabidky) {
  const dny = (nabidky || []).map((o) => String((o && o.first_seen) || '')).filter(Boolean).sort();
  return dny[0] || '';
}

export function minusDni(iso, n) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return '';
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]) - n * 86400000).toISOString().slice(0, 10);
}

/* Nově přidané: v okně, a NE z prvního dne evidence. Řadí se od
   nejnovějšího dne, v rámci dne od nejnižší ceny — kdo se dívá, co
   přišlo, chce vidět nejdřív to levné. */
export function noveNabidky(nabidky, opts) {
  const o = opts || {};
  const prvniDen = o.prvniDen != null ? o.prvniDen : prvniDenEvidence(nabidky);
  const dnu = o.dnu != null ? o.dnu : DNU_NOVE;
  /* OKNO JE VČETNĚ DNEŠNÍHO DNE, proto `dnu - 1`. Napsal jsem to
     nejdřív jako `dnes − 7` a to je osm kalendářních dnů: stránka by
     tvrdila „za posledních sedm dní přišlo 100", zatímco by počítala
     od 2. do 9. října. Na dnešních datech je v tom rozdíl čtrnáct
     nabídek. Malá věc, ale je to přesně ten druh čísla, které si web
     nenápadně nadsazuje ve svůj prospěch. */
  const odKdy = minusDni(o.dnesIso, Math.max(0, dnu - 1));
  if (!odKdy) return [];
  return (nabidky || [])
    .filter((x) => x && x.first_seen && x.first_seen > prvniDen && x.first_seen >= odKdy)
    .sort((a, b) => String(b.first_seen).localeCompare(String(a.first_seen))
      || (a.price || 1e15) - (b.price || 1e15));
}

/* Kolik přišlo za N dní. Tatáž podmínka, jen bez řazení a výpisu —
   proto přes tutéž funkci, ať se obě čísla na stránce nemohou rozejít. */
export function pocetNovych(nabidky, opts) {
  return noveNabidky(nabidky, opts).length;
}

/* Kolik nabídek naskočilo prvního dne. Je to číslo, které stránka
   PŘIZNÁVÁ, takže patří sem, ne do šablony. */
export function pocetZPrvnihoDne(nabidky, prvniDen) {
  const p = prvniDen != null ? prvniDen : prvniDenEvidence(nabidky);
  return (nabidky || []).filter((o) => o && o.first_seen === p).length;
}
