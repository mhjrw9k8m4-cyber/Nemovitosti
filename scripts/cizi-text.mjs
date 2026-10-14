/* CIZÍ TEXT: co na stránce není naše, se našimi pravidly neměří.
 *
 * Od 14. 10. stojí popis od inzerenta přímo v HTML stránky pozemku
 * (dřív byl jen v datovém ostrůvku pro skript, takže stránka bez
 * JavaScriptu o něj přišla — změřeno 699 znaků z 3 101). Tím se ale
 * dostal pod naše jazykové kontroly, a ty na něj nepatří: je to
 * doslovná citace toho, co napsal prodávající.
 *
 * Co kontroly hned našly, a co opravit NEJDE, protože by to znamenalo
 * přepisovat cizí větu:
 *   • „…o rozlohách 1044m²a 909m²" — chybí mezera, takže se předložka
 *     nedá poznat ani osadit,
 *   • „110 000m2,z 80% kvalitní pole" — čárka bez mezery,
 *   • „4 pozemků" tam, kde čeština chce „4 pozemky",
 *   • inzerát se dvěma otevíracími uvozovkami a žádnou zavírací.
 *
 * Typografie se na ten text pořád vztahuje (nezlomitelná mezera nic
 * nepřepisuje, jen nedovolí zlom) — měří se jen to, co je naše.
 *
 * Text se NEMAŽE, ale nahrazuje mezerami, aby čísla řádků a polohy
 * v hlášení zůstaly pravdivé.
 */
export const ZNACKA_CIZIHO = 'pz-popis-text';

const BLOK = /(<p id="pz-popis-text">)([\s\S]*?)(<\/p>)/g;

/** Vybílí cizí citace, délku i řádky zachová. */
export function bezCiziho(html) {
  if (String(html).indexOf(ZNACKA_CIZIHO) === -1) return html;
  return String(html).replace(BLOK, (cely, zac, telo, kon) =>
    zac + telo.replace(/[^\n]/g, ' ') + kon);
}

/** Kolik cizích citací na stránce je — aby se poznalo, že výjimka nezmrtvěla. */
export function pocetCizich(html) {
  return (String(html).match(/<p id="pz-popis-text">/g) || []).length;
}
