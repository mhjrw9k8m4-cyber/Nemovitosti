# Hlídací pes přímo v aplikaci

Hlídání lokality umělo spočítat, kolik nových pozemků na člověka čeká, už
předtím. Jen to nikomu neřeklo: číslo bylo vidět teprve po otevření
stránky **Hlídání** — na kterou nemá důvod chodit, když neví, že tam něco
je. **Hlídací pes, který štěká jen když se na něj člověk podívá, není
hlídací pes.**

Teď počet svítí v menu na všech stránkách, vedle odznaku nepřečtených
zpráv, a na mobilu i jako tečka na tlačítku menu.

## Jak se počítá „nový pozemek"

Pozemek je nový, když **sedí na uložené hledání** a jeho **otisk není mezi
viděnými** (`seen_keys`). Otisk je `typ|okres|obec|parcela|cena|výměra`,
bez diakritiky — a musí být **shodný všude, kde se počítá, co je nové**,
jinak by si web a robot protiřečily: robot by poslal e-mailem něco, co web
už ukázal jako viděné.

Jeden pozemek může sedět na dvě hledání. Na odznaku se počítá **jednou** —
jinak by číslo rostlo s počtem hledání, ne s počtem pozemků.

| Kus | Kde |
|---|---|
| porovnávání a počítání | `js/hlidani-logika.js` |
| odznaky v menu a tečka na mobilu | `js/upozorneni.js` |
| stránka s hledáními | `hlidani.html` |
| e-mailový robot | **není** — rozesílač v repozitáři chybí, hlídání běží jen v aplikaci |

`hlidani.html` i odznak berou logiku ze **stejného modulu**. Dřív byla
zapsaná uvnitř stránky, takže ji nešlo ani otestovat, ani použít jinde.

## Kolik to stojí dat

Odznak se nejdřív zeptá na uložená hledání — to je levné. **Teprve když
nějaké existuje**, stáhne soubor s pozemky (530 kB, komprimovaně kolem
74 kB, a prohlížeč ho většinou už má z mapy). Kdo hlídání nepoužívá,
nestahuje nic navíc.

Spočítané číslo se drží **minutu** v paměti prohlížeče, ať se web neptá na
každé stránce znovu. Návštěva stránky Hlídání nebo Zprávy paměť zahodí —
jinak by odznak ještě minutu hlásil to, co si tam člověk právě přečetl.
Proto se `js/upozorneni.js` načítá i na těchto dvou stránkách: sám pozná,
kde je, paměť smaže a skončí.

## Proč to nenahrazuje e-mail

Tohle je poctivá odpověď, ne výmluva: **upozornění v aplikaci uvidí jen
ten, kdo na web přijde.** U pozemků to často nestačí — dražba má termín,
nabídka SPÚ má lhůtu. Kdo si zapnul hlídání, udělal to právě proto, že
nechce chodit na web každý den.

Takže:

- **v aplikaci** — funguje hned, nic nestojí, nic se nemůže ztratit ve
  spamu; ideální pro „co mi přibylo, když jsem tu nebyl",
- **e-mailem** — jediný způsob, jak zastihnout člověka, který na web
  nepřijde; potřebuje ověřenou doménu v Resendu (viz
  `docs/oprava-hlidani-a-pridavani.md`).

Obojí čte tatáž data a tentýž otisk, takže si neprotiřečí.

## Testy

```
node scripts/test-hlidani.mjs          # 32 testů: co je nový pozemek
node scripts/test-chat-prohlizec.mjs   # 27 kontrol v Chromiu, z toho odznak hlídání
```

Prohlížečový test hlídá i to, co se snadno rozbije: že po přečtení zpráv
odznak u **Zpráv** zhasne, ale odznak u **Hlídání** svítí dál.

> Pozor při úpravách šablony `scripts/generate-region-pages.mjs`: stránky
> okresů a krajů se generují znovu při každém běhu datového robota. Co
> není v šabloně, to příští běh smaže — a právě na tyhle stránky chodí
> lidé z vyhledávání nejčastěji.
