/* PROČ TENHLE SOUBOR EXISTUJE
   ---------------------------
   Když zkouška spadne v CI, z celého výpisu se do přehledu dostane
   jedině řádek `::error::`. Všech 126 zkoušek do něj psalo tutéž
   věc — „Stabilita: 1 kontrol neprošlo." — a KTERÁ kontrola padla
   a proč, zůstalo ve výpisu, který se u běhu přepsaného dalším
   pushem už nedá stáhnout. Diagnóza pak začínala tím, že se musel
   celý běh zopakovat místně, a u zkoušek, které místně projdou,
   nezačala vůbec.

   Přitom to v každé zkoušce leží připravené: pole `zpravy` nese
   u každé padlé kontroly jméno a hned pod ním důvod. Tahle funkce
   z něj složí jednu řádku, protože víc řádek `::error::` neunese.

   Mez 900 znaků je kvůli přehledu CI, který dlouhou poznámku
   zkrátí sám a bez varování. */
export function pricinaChyb(zpravy, kolik = 4, mez = 900) {
  const padle = (zpravy || [])
    .filter((z) => typeof z === 'string' && z.indexOf('✕') !== -1)
    /* Důvod je v poli pod jménem kontroly, oddělený novou řádkou;
       `::error::` je jednořádkový, takže se všechno slepí mezerami. */
    .map((z) => z.replace(/\s+/g, ' ').replace(/^\s*✕\s*/, '').trim())
    .filter((z) => z);
  if (!padle.length) return '';
  let vypis = padle.slice(0, kolik).join(' | ');
  if (padle.length > kolik) vypis += ` | …a dalších ${padle.length - kolik}`;
  if (vypis.length > mez) vypis = vypis.slice(0, mez - 1) + '…';
  return ' Co padlo: ' + vypis;
}
