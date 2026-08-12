# Pozemkomat

Landing page pro **Pozemkomat** — katastrální mapu nové generace, která barevně
odlišuje stav každého pozemku (na prodej, exekuce, státní, soukromé) a nabízí
proklik do katastru nebo na inzerát.

Vychází z vizuálního náčrtu (verze 0.2) a je z něj čistě strukturovaný,
responzivní statický web.

## Struktura

```
.
├── index.html        # struktura stránky (hero, jak to funguje, features, widget, CTA)
├── css/styles.css    # design system — paleta, typografie, layout, responsivita
├── js/main.js        # mobilní menu, kopírování embed kódu
└── assets/favicon.svg
```

## Spuštění lokálně

Jde o statický web bez build kroku — stačí otevřít `index.html` v prohlížeči,
nebo spustit jednoduchý server:

```bash
python3 -m http.server 8000
# → http://localhost:8000
```

## Design

- **Fonty:** Fraunces (nadpisy), Inter (text), IBM Plex Mono (technické popisky)
- **Paleta:** tmavá „ink" plocha, pergamenová mapa, měděné akcenty
- **Stavy pozemku:** zelená (prodej), cihlová (exekuce), šedá (státní), modrá (soukromé)

Barvy a rozměry jsou vedené jako CSS proměnné v `:root` (`css/styles.css`),
takže se dají snadno upravit na jednom místě.

## Co je hotové oproti náčrtu

- Rozdělení do samostatných souborů (HTML / CSS / JS) místo jednoho inline souboru
- Funkční mobilní menu (hamburger)
- Sticky header s blur pozadím
- Tlačítko „Kopírovat" u embed kódu
- Přístupnost: skip-link, `aria` atributy, focus stavy, `prefers-reduced-motion`
- SEO / Open Graph meta tagy, favicon

## Stav

Verze 0.2 · neveřejný náhled / koncept.
