# Leaflet — vlastní kopie, ne cizí CDN

Mapová knihovna se dřív stahovala z `unpkg.com`. Když ten výpadek měl,
nestáhla se — a s ní padl **celý výpis pozemků**, protože skript se bez
`L` nedostal přes start. Člověk viděl prázdnou stránku a web mu k tomu
neřekl ani slovo.

Cizí CDN je u hlavní funkce webu zbytečné riziko: přidává výpadek,
o kterém se nedá nic dělat, a posílá návštěvníkovu IP adresu třetí
straně. Knihovna má 150 kB (42 kB po kompresi) a nemění se — patří
proto sem, vedle ostatních souborů webu.

* Leaflet 1.9.4, licence BSD 2-Clause (viz LICENSE)
* zdroj: https://unpkg.com/leaflet@1.9.4/dist/
* soubory: `leaflet.js`, `leaflet.css`, `images/` (šipky a stíny značek)

Při aktualizaci stačí nahradit tyhle soubory novými z téhož místa
a přepsat číslo verze v `PUVOD.md`.
