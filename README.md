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

## Data

Body na mapě jsou zatím **ukázková** (ilustrační). V ostré verzi by je nahradila
data z veřejných zdrojů:

- Portál dražeb
- Insolvenční rejstřík
- Úřední desky obcí (záměry prodeje)
- Veřejné inzertní portály
- Katastr nemovitostí (ČÚZK)

## Spuštění lokálně

Statický web bez build kroku:

```bash
python3 -m http.server 8000   # → http://localhost:8000
```

## Poznámka

Mapa běží na knihovně [Leaflet](https://leafletjs.com/) načítané z CDN.
Formulář a data jsou zatím ukázkové — web je funkční prototyp vzhledu a chování,
ne ostrý produkt s živými daty.
