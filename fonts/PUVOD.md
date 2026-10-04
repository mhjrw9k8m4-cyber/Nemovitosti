# Písma — odkud jsou a jak jsou podřezaná

Dvě rodiny, obě na **vlastním serveru**, ne z Google Fonts: přes cizí CDN
by každé načtení stránky hlásilo návštěvníka třetí straně a do
`ochrana-udaju.html` by musel přijít další zpracovatel. Leží vedle
stylopisu a stránky je předepisují (`<link rel="preload">`), takže dojedou
souběžně se stylem, ne až po něm.

| Soubor | Rodina | Licence |
|---|---|---|
| `inter-latin.woff2`, `inter-latin-ext.woff2` | [Inter](https://rsms.me/inter/) | SIL Open Font License 1.1 |
| `fraunces-latin.woff2`, `fraunces-latin-ext.woff2` | [Fraunces](https://fraunces.undercase.xyz/) | SIL Open Font License 1.1 |

Obě jsou **proměnná** písma (jedna osa váhy, Fraunces navíc osu optické
velikosti). Fraunces se v nadpisu sama zúží a zostří, v drobném textu
povolí — `font-optical-sizing:auto` je výchozí, takže to stylopis nemusí
nikde nastavovat.

## Proč jsou podřezaná

Naměřeno: čtyři soubory z Google Fonts měly **253 kB** a nesly dohromady
**1 474 glyfů**. Na celém webu — ve všech stránkách, v opsaných
inzerátech (`data/popisy.json`) i ve stylopisu — se přitom vyskytuje
**159 různých znaků**. Nejhorší byl `inter-latin-ext`: 83 kB a 733 glyfů,
tedy IPA, vietnamština a latinka rozšířená o všechno možné.

Po podřezání je to **149 kB (o 42 % méně)**. Je to největší jediná úspora
na webu, protože písma se stahují na KAŽDÉ stránce a dělala tam tři
čtvrtiny všech bajtů (na `pridat.html` 254 kB ze 346 kB).

Ověřeno znak po znaku proti původním souborům: ze znaků, které web
ukazuje, se **neztratil ani jeden**. Šestnáct dalších (→ ↔ ✓ ✕ ● ♥ a
emoji) nemají ani původní písma, takže ta padala na systémové už dřív
a padají dál.

## Jak to zopakovat

Sada znaků je schválně **širší, než co web ukazuje dnes**: inzeráty jsou
cizí text a zítra v nich může stát německé ö nebo polské ł. Pokrytá je
celá Latin-1 a Latin Extended-A (čeština, slovenština, polština,
němčina, maďarština, chorvatština…), interpunkce, měny a pár symbolů.

Potřeba: `pip install fonttools brotli`

```sh
SADA='U+0020-007E,U+00A0-00FF,U+0100-017F,U+2000-206F,U+20A0-20BF,U+2190-21FF,
U+2212,U+2215,U+2264,U+2265,U+2022,U+25CF,U+2665,U+2713,U+2715,U+2113,U+2122,
U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+FEFF,U+FFFD'

for f in fonts/*.woff2; do
  pyftsubset "$f" --unicodes="$SADA" --flavor=woff2 \
    --layout-features='*' --no-hinting --output-file="$f.tmp.woff2"
  # osa váhy jen 400–800: tolik stylopis používá (ušetří 22 kB)
  fonttools varLib.instancer "$f.tmp.woff2" wght=400:800 -o "$f.tmp2.woff2"
  python3 -c "from fontTools.ttLib import TTFont; import sys; \
    t=TTFont(sys.argv[1]); t.flavor='woff2'; t.save(sys.argv[2])" "$f.tmp2.woff2" "$f"
  rm "$f.tmp.woff2" "$f.tmp2.woff2"
done
```

`--layout-features='*'` zůstává schválně: stylopis používá
`font-variant-numeric:tabular-nums`, což je OpenType funkce `tnum`,
a vyjmenovávat funkce ručně znamená na jednu zapomenout.

**Po výměně písem** je potřeba srovnat tři věci v `css/styles.css`:
`font-weight` v `@font-face` s osou souboru, `unicode-range` s tím, co
soubor opravdu nese, a razítko `?v=` se postará `scripts/oprav.mjs`.
Že to platí, hlídá `scripts/test-pisma.mjs`.

## Co se tím NEDĚLÁ

Písma se nepřevádějí na statické řezy. Proměnné písmo s osou 400–800 je
menší než čtyři statické řezy (400, 500, 600, 700, 800) a stylopis si
o mezilehlé váhy říká.
