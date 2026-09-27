// Data v JSONu, která se vkládají do <script> uvnitř stránky.
//
// PROČ TO NENÍ JEN JSON.stringify: obsah <script> je v HTML surový text.
// Končí PRVNÍM výskytem „</scr'+'ipt" a nikoho nezajímá, že ten výskyt je
// uvnitř řetězce v JSONu. Když se tedy do názvu obce dostane
// „</scr'+'ipt><img src=x onerror=…>", JSON se v tom místě rozpadne,
// značka vyskočí do stránky a obrázek se každému návštěvníkovi pokusí
// načíst — a s ním i to, co je v onerror.
//
// Na tomhle webu to není teoretická úvaha: texty sbírá robot z cizích
// dražebních rejstříků a inzertních webů, na které nemáme žádný vliv.
// A protože se stránky generují do statických souborů, zůstalo by to na
// parcelaka.cz ležet, dokud by si toho někdo nevšiml.
//
// Co se s tím dělá: „<", „>" a „&" se do JSONu zapíšou jako UNICODOVÝM
// ZÁPISEM (\u003c a spol.). To je v JSONu TÝŽ znak, takže kdokoli to
// přečte — vyhledávač u ld+json, prohlížeč u window.PK_… — dostane
// přesně původní text. Jen už v tom není nic, co by HTML mohlo brát
// jako konec skriptu.
//
// Dva oddělovače řádků jsou zvlášť: jako znak v zápisu řetězce
// v JavaScriptu neprojdou (JSON je připouští, JavaScript do ES2019 ne),
// takže by window.PK_… shodilo celý skript.
const ZVLAST = {
  '<': '\\u003c', '>': '\\u003e', '&': '\\u0026',
  '\u2028': '\\u2028', '\u2029': '\\u2029',
};
export function jsonVeStrance(hodnota) {
  return JSON.stringify(hodnota).replace(/[<>&\u2028\u2029]/g, function (c) { return ZVLAST[c]; });
}
