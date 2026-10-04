# TensorFlow.js — vlastní kopie, ne cizí CDN

Knihovna se stahovala z `cdn.jsdelivr.net`. Je to táž úvaha jako
u Leafletu (viz `vendor/leaflet/PUVOD.md`), jen o stupeň vážnější:

* **Je to cizí program, který se spustí na stránce** `pridat.html` — tedy
  tam, kde člověk vyplňuje svůj kontakt. Načítal se bez jakéhokoli
  ověření obsahu (žádné `integrity`), takže kdokoli, kdo by dokázal
  podstrčit jinou odpověď z CDN nebo z DNS, by měl ve formuláři volnou
  ruku. U knihovny na kontrolu fotek je to zbytečné riziko.
* **Posílá návštěvníkovu IP adresu třetí straně.** Model už přitom ležel
  u nás (`assets/mobilenet/`, `assets/nsfw-model/`), takže z celé
  kontroly fotek chodily na cizí server jen ty dva skripty.
* **Přidává výpadek, o kterém se nedá nic dělat.** Když se knihovna
  nestáhne, kontrola fotky se tiše přeskočí.

Soubor je 1,4 MB a stahuje se jen tehdy, když někdo přidává pozemek
s fotkou — na ostatních stránkách se o něm nedozvíte.

* TensorFlow.js 4.22.0, licence Apache-2.0 (viz LICENSE)
* zdroj: balíček `@tensorflow/tfjs@4.22.0` z npm, soubor `dist/tf.min.js`
  (to je přesně to, co servírovalo `cdn.jsdelivr.net/npm/...`)
* licenční hlavička zůstává i uvnitř `tf.min.js`, nesmí se odstraňovat

Při aktualizaci:

```
npm pack @tensorflow/tfjs@<verze>
tar xzf tensorflow-tfjs-<verze>.tgz package/dist/tf.min.js
cp package/dist/tf.min.js vendor/tfjs/
```

a přepsat číslo verze tady.

**Razítko `?v=` tyhle dva soubory nemají**, protože se nenačítají ze
značky v HTML, ale až z JavaScriptu (`loadScript('vendor/tfjs/tf.min.js')`).
Po aktualizaci tedy může prohlížeč chvíli servírovat starou kopii
z cache. U knihovny, která se mění řádově jednou za rok, to nestojí za
zvláštní mechaniku — kdyby na tom jednou záleželo, dá se do té adresy
v `js/pridat.js` a `js/fototema.js` dopsat číslo verze rukou.
