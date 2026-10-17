/* Dva převody textu, které si každý generátor psal sám.
 * ===================================================================
 * PROČ TENHLE SOUBOR VZNIKL. Změřeno 15. 10.: `slug()` byla v sedmi
 * skriptech a `esc()` ve čtyřech — dohromady jedenáct kopií. Nebyly to kopie téhož — `slug()`
 * měla DVĚ různá provedení:
 *
 *   • seznam patnácti českých písmen (build-og, regiony-meta,
 *     generate-parcel-pages) — co v seznamu není, spadne pod
 *     `[^a-z0-9]+` a změní se na spojovník: „Müglitz" → „m-glitz",
 *   • rozklad NFD a odstranění diakritiky (generate-data-rezy,
 *     test-misto-prahy) — zvládne jakékoli písmeno s háčkem nad ním:
 *     „Müglitz" → „muglitz".
 *
 * Na dnešních datech se obě chovají STEJNĚ: ze VŠECH 5 233 textů,
 * které v `data/**` jsou, se rozcházejí v NULE. Proto se dalo
 * sjednotit bez přejmenování jediné stránky — a kánonem je rozklad
 * NFD, protože je obecnější: jediné cizí jméno v datech (a jednou
 * tam bude) by jinak dostalo adresu se spojovníkem místo písmena.
 * Na 20 000 náhodných řetězcích se obě podoby rozešly 702×, a vždy
 * jen na písmenech, která čeština nemá (ä ñ ô ü ö ł) — tedy přesně
 * tam, kde je nové chování to správné.
 *
 * `esc()` byla naproti tomu čtyřikrát doslova totéž: na týchž
 * 6 444 řetězcích NULA rozdílů.
 *
 * JEDEN ROZDÍL, KTERÝ SE MUSÍ ZMÍNIT: staré podoby psaly
 * `String(s || '')`, takže z `0` dělaly prázdno; kánon píše
 * `String(s == null ? '' : s)`, takže z `0` udělá „0". Prověřeno na
 * všech 28 místech, kde se `slug()` volá: vždy je argumentem jméno
 * (obec, okres, kraj, druh), nikdy číslo — a volání, kde může přijít
 * `null`, si to hlídá samo (`kraj ? … : …`).
 *
 * ADRESY STRÁNEK Z TOHO VZNIKAJÍ, takže na téhle funkci drží
 * odkazy z vyhledávačů. Kdo ji mění, přejmenuje 2 119 souborů —
 * to je v `git status` vidět a nedá se to udělat omylem.
 *
 * DVĚ KOPIE ZŮSTÁVAJÍ SCHVÁLNĚ, a není to nedodělek:
 * `scripts/test-misto-prahy.mjs` a `scripts/test-graf-cen.mjs` si slug
 * skládají samy. Obě zkoušky totiž MĚŘÍ jména souborů, která touhle
 * funkcí vznikla — kdyby si ji vzaly odtud, měřily by funkci sama
 * sebou a společná chyba by prošla. U první z nich to stálo
 * v komentáři už dřív; teď to platí u obou.
 *
 * CO SE SEM NEDALO: `fmt()`. Vypadá taky jako čtyřikrát totéž,
 * ale změřeno: `String(n).replace(…)` dělá oddělovač OBYČEJNOU
 * mezerou (U+0020), kdežto `Intl.NumberFormat('cs-CZ')`
 * nezlomitelnou (U+00A0), a u neceločíselné hodnoty dá první
 * „1 234.6" (anglická desetinná tečka!), druhá „1 235" (zaokrouhlí)
 * a `toLocaleString` „1 234,6". Tři různé výsledky, ne tři kopie.
 * Navíc obyčejná mezera je tu SCHVÁLNĚ: `scripts/sazba.mjs` ji
 * v číslech sám mění na nezlomitelnou (doloženo v `data.html`:
 * „1 957"), takže sjednocení na Intl by sazbě sebralo práci,
 * kterou dnes dělá na celém webu jednotně. Zůstává, jak je.
 * =================================================================== */

/** Adresa z názvu: bez diakritiky, malá písmena, spojovníky. */
export function slug(s) {
  return String(s == null ? '' : s)
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

/* Apostrof se nepřevádí schválně: všechny atributy na tomhle webu
   stojí v dvojitých uvozovkách, takže `'` uvnitř nic nerozbije, a
   `&#39;` by jen znečitelnilo zdroj stránky. */
/** Text do HTML (i do atributu v dvojitých uvozovkách). */
export function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Totéž pod jménem, které čte lépe u atributů. */
export const attr = esc;

/* KOMENTÁŘE V HTML DO HOTOVÝCH STRÁNEK NEPATŘÍ.
 *
 * Generátor stránek pozemků už dávno čistí vložený <style> a zdůvodnění
 * je u něj napsané (bezKomentaruVeStylu): předloha je ZDROJ, komentáře
 * v ní jsou to, podle čeho se upravuje, a do hotových stránek nepatří. U komentářů mimo <style> to platí stejně, jen tím
 * krokem nikdy neprošly — a jeden z nich byl na hotové stránce dokonce
 * nepravdivý: „TENHLE SOUBOR JE VZOR, NE STRÁNKA. Bez `?p=` v adrese je
 * na něm jediná věta „Načítám pozemek…"." To je pravda o předloze
 * pozemek.html, ne o pozemek-benesov-benesov-1sjtz7b.html, kde celý
 * obsah stojí v HTML. Kopírovalo se to na 2 140 stránek.
 *
 * Naměřeno na všech stránkách pozemků: 19,90 MB gzipem → 17,27 MB,
 * tedy 1,26 kB při každém otevření inzerátu.
 *
 * BEZPEČNOST: nejde přes celý text regulárním výrazem. V <script> i
 * <style> může „<!--" stát jako kus kódu nebo textu, a sebrat ho odtud
 * by stránku rozbilo. Dokument se proto nejdřív rozdělí na ty bloky
 * a čistí se jen to mezi nimi. (Ověřeno na 300 stránkách: ani v jednom
 * skriptu ani stylu takový řetězec dnes není — tohle je pojistka pro
 * to, co přijde.)
 *
 * POŘADÍ: volá se až úplně nakonec, po migrujSkripty(). Ta si totiž
 * značkuje místo pro skripty komentářem <!--PK-SEM-SKRIPTY--> a kdyby
 * se čistilo dřív, zmizela by jí značka pod rukama.
 */
export function bezKomentaruVHtml(html) {
  const bloky = /<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi;
  let out = '', konec = 0;
  for (const m of html.matchAll(bloky)) {
    out += html.slice(konec, m.index).replace(/<!--[\s\S]*?-->/g, '');
    out += m[0];
    konec = m.index + m[0].length;
  }
  out += html.slice(konec).replace(/<!--[\s\S]*?-->/g, '');
  /* Po komentáři zůstane prázdný řádek; dva za sebou se slijí v jeden. */
  return out.replace(/\n[ \t]*\n[ \t]*\n+/g, '\n\n');
}
