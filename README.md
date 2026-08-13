# Pozemkomat

Web pro **Pozemkomat** — mapa příležitostí u pozemků. Na jedné interaktivní mapě
ukazuje pozemky, kde se něco děje: **dražby, exekuce, prodeje a obecní záměry**,
sbírané z veřejných zdrojů. Klik na bod → detail + proklik do katastru.

## Struktura

```
.
├── index.html        # celá stránka (hero, mapa, jak to funguje, FAQ, formulář…)
├── css/styles.css    # design system, mapa, animace, responsivita
├── js/main.js        # interaktivní mapa (Leaflet), filtry, hledání, počítadla…
└── assets/favicon.svg
```

## Vychytávky

- 🗺️ **Skutečná interaktivní mapa** (Leaflet + tmavé podklady CARTO) s klikacími body
- 🎛️ **Filtry** podle druhu příležitosti (prodej / dražba / exekuce / obec)
- 🔍 **Hledání lokality** — synchronně filtruje seznam i mapu
- 📋 **Seznam příležitostí** propojený s mapou (klik → přeletí na bod)
- 🔢 **Animovaná počítadla** při scrollování
- ✨ **Plynulé odkrývání sekcí** (scroll reveal), sticky header, tlačítko nahoru
- ❓ **FAQ** (rozbalovací), formulář na hlídání lokality, widget pro realitky

## Data (datová linka)

Web už nemá data natvrdo — načítá je ze souboru:

```
data/opportunities.json   # příležitosti, které web zobrazí
data/okresy.json          # okres → přibližné GPS (geokódování)
scripts/fetch-opportunities.mjs   # robot: sběr ze zdrojů → JSON
.github/workflows/update-data.yml # denní automatické spuštění robota
```

Web soubor `data/opportunities.json` načítá přes `fetch` a má bezpečnou zálohu
(když se soubor nenačte, použije vestavěná ukázková data — nikdy není prázdný).

### Formát jedné příležitosti

```json
{
  "place": "Kolín", "okres": "Kolín", "type": "drazba",
  "parcel": "412/3", "druh": "stavební", "area": 1240,
  "price": 640000, "extra": "dražba za 12 dní",
  "lat": 50.0281, "lng": 15.2003
}
```

`type` ∈ `sale` (na prodej) · `drazba` · `exekuce` · `obec` (obecní záměr).
`lat`/`lng` jsou nepovinné — když chybí, robot je doplní podle `okres`.

### Jak zapojit reálný zdroj

V `scripts/fetch-opportunities.mjs` jsou funkce `fetchDrazby()`,
`fetchInsolvence()`, `fetchUredniDesky()`, `fetchInzeraty()` — každá vrátí pole
příležitostí v uvedeném formátu. Robot je sjednotí, geokóduje, odstraní duplicity,
seřadí podle výhodnosti a zapíše. Stačí doplnit jednu z funkcí.

**Pozor:** u každého zdroje respektujte jeho podmínky (robots.txt, zákaz
automatického stahování). Nejčistší je zdroj, který sám nabízí otevřená data.

## Spuštění lokálně

Statický web bez build kroku:

```bash
python3 -m http.server 8000   # → http://localhost:8000
```

## Poznámka

Mapa běží na knihovně [Leaflet](https://leafletjs.com/) načítané z CDN.
Formulář a data jsou zatím ukázkové — web je funkční prototyp vzhledu a chování,
ne ostrý produkt s živými daty.
