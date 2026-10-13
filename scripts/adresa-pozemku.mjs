/* Adresa stránky inzerátu pro zkoušky — vybraná z DAT, ne napsaná napevno.
 *
 * PROČ TOHLE EXISTUJE. Čtyři zkoušky si v sobě nesly tutéž adresu
 * s konkrétní parcelou („Police 6242 m² na Vsetínsku"). Ta parcela se
 * jednoho dne z nabídek ztratila — robot stahuje zdroje čtyřikrát denně
 * a prodané mizí — a stránka se od té chvíle vykreslovala prázdná:
 * test-snimek ohlásil sedm chyb, test-ikony jednu, a ani jedna z nich
 * nebyla v kódu webu. Zkouška přivázaná na jeden záznam v živých datech
 * takhle shnije vždycky; je to jen otázka času.
 *
 * Adresa se proto skládá z prvního pozemku, který splňuje, co daná
 * zkouška potřebuje. Vrací se i ten pozemek, aby šlo tvrdit něco
 * o jeho číslech, a `null`, když takový není — volající to musí ohlásit,
 * jinak by zkouška mlčky měřila prázdnou stránku.
 */
import { readFileSync } from 'node:fs';

/** Klíč, kterým stránka pozemek.html pozná, který pozemek ukázat. */
function klicPozemku(d) {
  return [d.place || '', d.parcel || '', d.okres || '', d.lat.toFixed(3), d.lng.toFixed(3)].join('|');
}

/**
 * @param {(x: object) => boolean} [filtr] další podmínka (druh, výměra…)
 * @returns {{url: string, d: object} | null}
 */
export function adresaPozemku(filtr) {
  const vse = JSON.parse(readFileSync('data/opportunities.json', 'utf8')).opportunities || [];
  const d = vse.find((x) => typeof x.lat === 'number' && typeof x.lng === 'number'
    && x.price > 0 && (!filtr || filtr(x)));
  if (!d) return null;
  return { url: `pozemek.html?p=${encodeURIComponent(klicPozemku(d))}&ll=${d.lat},${d.lng}`, d };
}
