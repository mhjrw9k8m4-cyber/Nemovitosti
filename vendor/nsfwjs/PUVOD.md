# NSFWJS — vlastní kopie, ne cizí CDN

Druhá polovina kontroly fotek; důvody jsou tytéž jako u
`vendor/tfjs/PUVOD.md` — cizí program na stránce s kontaktním
formulářem, bez ověření obsahu, a návštěvníkova IP adresa u třetí
strany.

Model (`assets/nsfw-model/`) byl u nás odjakživa, takže na CDN zbývala
jen tahle knihovna.

* NSFWJS 2.4.2, licence MIT (viz LICENSE)
* zdroj: balíček `nsfwjs@2.4.2` z npm, soubor `dist/nsfwjs.min.js`
* potřebuje `window.tf` (viz `vendor/tfjs/`) — v `package.json` to má
  zapsané jako peer dependency `@tensorflow/tfjs`

Pozn.: knihovna si jako peer žádá tfjs `^3.18.0`, kdežto web načítá
4.22.0. Běží to tak odjakživa a kontrola fotek funguje; je to zapsané
tady, aby se na to při příští aktualizaci nekoukalo jako na překvapení.

Při aktualizaci:

```
npm pack nsfwjs@<verze>
tar xzf nsfwjs-<verze>.tgz package/dist/nsfwjs.min.js package/LICENSE
cp package/dist/nsfwjs.min.js package/LICENSE vendor/nsfwjs/
```
