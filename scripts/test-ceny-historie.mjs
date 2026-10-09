/* Test: pozná web, že majitel zlevnil?
 *
 * Spuštění: node scripts/test-ceny-historie.mjs
 *
 * PROČ. „O 25 % pod obvyklou cenou" je model, který se může mýlit.
 * „Majitel sám šel dolů o 25 %" je fakt — a pro kupujícího silnější
 * signál. Celé to ale stojí na párování nabídky se záznamem z minulého
 * běhu, a tam je jediná skutečná past: tvrdit „zlevněno" u nabídky,
 * která je ve skutečnosti JINÁ. To je horší než netvrdit nic, protože
 * si to člověk ověřit nemůže — minulou cenu vidí jen od nás.
 *
 * Proto se tu zkouší hlavně to, co se spárovat NESMÍ.
 */
import { spojCeny, klicCeny, klicMista } from './fetch-opportunities.mjs';
import { pricinaChyb } from './chyby-hlaska.mjs';

let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
const DEN = new Date('2026-10-03T00:00:00Z');
const N = (x) => Object.assign({ place: 'Kolín', okres: 'Kolín', parcel: '12/3', area: 1000, price: 1000000 }, x);

/* --- co se spárovat MÁ --- */
{
  const stare = [N({ price: 2000000, url: 'https://www.bezrealitky.cz/nemovitosti/1050656-pozemek' })];
  const nove = [N({ price: 1500000, url: 'http://bezrealitky.cz/nemovitosti/1050656-pozemek/' })];
  pravda('táž nabídka se pozná i přes http/https, www a lomítko navíc',
    spojCeny(stare, nove, DEN) === 1 && nove[0].cena_drive === 2000000, JSON.stringify(nove[0]));
  pravda('a zapíše se den změny', nove[0].cena_zmena === '2026-10-03', nove[0].cena_zmena);
}
{
  const stare = [N({ price: 2000000 })], nove = [N({ price: 1500000 })];
  pravda('bez odkazu se páruje přes obec, okres, parcelu a výměru',
    spojCeny(stare, nove, DEN) === 1 && nove[0].cena_drive === 2000000, JSON.stringify(nove[0]));
}
{
  const stare = [N({ price: 2000000, cena_drive: 2500000, cena_zmena: '2026-09-01' })];
  const nove = [N({ price: 2000000 })];
  spojCeny(stare, nove, DEN);
  pravda('když se cena nezměnila, historie se nese dál (jinak by zmizela hned při dalším běhu)',
    nove[0].cena_drive === 2500000 && nove[0].cena_zmena === '2026-09-01', JSON.stringify(nove[0]));
}

/* --- co se spárovat NESMÍ --- */
{
  /* Výměra musí rozhodnout i tam, kde VŠECHNO OSTATNÍ sedí — tedy při
     shodném odkazu. Portály adresy přepoužívají a bez tohohle by web
     u jiné nabídky tvrdil slevu, kterou si nikdo nemůže ověřit: minulou
     cenu vidí jen od nás.
     (Dřív tu stál případ bez odkazu — jenže tam je výměra součástí
     klíče, takže se nespárovaly tak jako tak a kontrola měřila prázdno.
     Poznalo se to až sabotáží: vypnutí té podmínky testem prošlo.) */
  const U = 'https://www.bezrealitky.cz/nemovitosti/1050656-pozemek';
  const stare = [N({ price: 2000000, area: 1000, url: U })];
  const nove = [N({ price: 1500000, area: 800, url: U })];
  pravda('jiná výměra = jiný pozemek, o slevě se nemluví ani při shodném odkazu',
    spojCeny(stare, nove, DEN) === 0 && !nove[0].cena_drive, JSON.stringify(nove[0]));
  /* Pojistka: při SHODNÉ výměře se tytéž dva záznamy spárovat musí —
     jinak by kontrola nad tím mohla procházet z jiného důvodu. */
  const stare2 = [N({ price: 2000000, area: 1000, url: U })];
  const nove2 = [N({ price: 1500000, area: 1000, url: U })];
  pravda('a při shodné výměře se spárují (jinak by kontrola nad tím neměřila výměru)',
    spojCeny(stare2, nove2, DEN) === 1, JSON.stringify(nove2[0]));
}
{
  // Týž „odkaz" u sedmi nabídek ze sedmi obcí — skutečný případ z dat.
  const stare = [N({ place: 'Bohušov', price: 900000, url: 'https://farmy.cz/nabidka_detail' })];
  const nove = [N({ place: 'Prušánky', price: 400000, url: 'https://farmy.cz/nabidka_detail' })];
  pravda('generická adresa bez identifikátoru se jako klíč nepoužije',
    klicCeny(nove[0]) === null && spojCeny(stare, nove, DEN) === 0, String(klicCeny(nove[0])));
}
{
  const stare = [N({ parcel: '—', price: 2000000 })], nove = [N({ parcel: '—', price: 1500000 })];
  pravda('bez odkazu a bez parcelního čísla se nepáruje nic',
    klicMista(nove[0]) === null && spojCeny(stare, nove, DEN) === 0, String(klicMista(nove[0])));
}
{
  const stare = [N({ price: 0 })], nove = [N({ price: 1500000 })];
  pravda('když minule cena nebyla, není z čeho počítat změnu',
    spojCeny(stare, nove, DEN) === 0 && !nove[0].cena_drive, JSON.stringify(nove[0]));
}
{
  const nove = [N({ price: 1500000 })];
  pravda('první běh bez minulých dat projde tiše', spojCeny(null, nove, DEN) === 0);
}
/* Zdražení je taky změna — a taky se zapíše. Kdyby se zapisovalo jen
   zlevnění, web by o pohybu ceny vzhůru mlčel a vypadalo by to, že
   cena stojí. */
{
  const stare = [N({ price: 1000000 })], nove = [N({ price: 1200000 })];
  spojCeny(stare, nove, DEN);
  pravda('zdražení se zapíše stejně jako zlevnění', nove[0].cena_drive === 1000000, JSON.stringify(nove[0]));
}

console.log('\nHistorie ceny nabídky');
console.log(zpravy.join('\n'));
console.log(`\n${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) { console.log('::error::Historie ceny: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy)); process.exit(1); }
process.exit(0);
