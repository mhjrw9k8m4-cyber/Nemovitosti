# Co může udělat jen majitel

Seznam věcí, které **nejdou udělat z repozitáře** — potřebují heslo,
klíč, peníze nebo rozhodnutí o produktu. Každá položka říká, co odemkne
a co stojí. Podrobnosti k nasazení jsou v `docs/pred-vydanim.md`;
tohle je krátký seznam k odškrtávání.

*Stav k 23. 10. 2026. Čísla v závorkách jsou naměřená, ne odhadnutá.*

---

## 1. Druhý zdroj nabídek — `APIFY_TOKEN`

**Proč je to první.** V datech je 1 932 nabídek a **900 z nich (47 %)
je od jednoho velkoobchodníka** (druhý největší inzerent má šest,
594 inzerentů má jedinou). V některých okresech drží u jednoho druhu
86 až 100 % nabídek. Cenový verdikt („levnější než 78 % pozemků téhož
druhu v okrese") proto u **563 z 876 verdiktů** srovnává většinově
s jeho vlastním cenníkem — web to od 23. 10. u čísla přiznává a nad
90 % mlčí (oddíl 135 v `docs/optimalizace.md`), ale to je obvaz, ne
léčba. Zdroje dnes: bezrealitky.cz 1 635, SPÚ 209, dražební weby 97,
Sreality 0.

**Co s tím.** Založit účet na apify.com, vzít token a dát ho do
GitHub Secrets jako `APIFY_TOKEN`. Robot (`update-data.yml`) ho umí
použít hned — kód na Sreality je napsaný a čeká.

**Co to odemkne.** Cenový verdikt přestane být o jednom prodejci.
Hlídá to `scripts/test-inzerenti.mjs`: dnes 47 %, a kdyby to přešlo
60 %, zkouška spadne.

---

## 2. Nasadit měření návštěvnosti

Je **napsané, otestované a nenasazené**. Vlastní čítače bez cookies
a bez IP (`supabase/navstevnost.sql`, `js/mereni.js`), se stropem
5 000 řádků na den.

**Dokud neběží, je každé rozhodnutí o webu hádání** — moje i tvoje.
Nevíme, jestli na web někdo přišel, odkud a na co se kouká.

Co to chce: pustit `supabase/00-vse.sql` (viz bod 5) a nasadit web.

---

## 3. Zapnout hlídání e-mailem

Hotová funkce, která dnes **nedělá nic**. Mění web z „místa, kam se
chodí" na „web, který se ozve" — bez toho se nikdo nevrací.

Potřebuje čtyři věci, v tomhle pořadí:

1. ověřit domén u Resendu (DNS záznamy u Wedosu),
2. `RESEND_API_KEY` a `PK_MAIL_FROM` do GitHub Secrets,
3. v `supabase/hlidani-mailem.sql` přepnout `PK_MAIL_ZAPNUTO` na `true`,
4. v `rozesilani.yml` dát `--opravdu` (bez něj rozesílač jen tiskne, co
   by poslal — a je to tak schválně).

Kroky 3 a 4 udělám na tvoje slovo; klíče ode mě nikdy nesmí projít.

---

## 4. Identita provozovatele

Na webu dnes **není, kdo ho provozuje** — žádné jméno, IČO, adresa.
Odemyká dvě věci naráz: důvěru (kdo nekupuje pozemek od anonyma) a
platby (platební brána chce subjekt).

Rozhodnutí je tvoje: fyzická osoba s IČO, nebo s.r.o. Pak se dopíše do
patičky a do `ochrana-udaju.html`.

---

## 5. Pustit SQL a dotáhnout nastavení Supabase

`supabase/00-vse.sql` jde pustit celý a opakovaně (SQL Editor → Run).
**Sedm věcí** v něm běžící projekt bez nového spuštění nemá — mezi nimi
stropy, které brání tomu, aby databáze rostla zvenčí, a strop na počet
fotek v úložišti. Výpis je v `docs/pred-vydanim.md`, oddíl 3a.

A tři nastavení, která SQL neumí (oddíl 3b):
*Confirm email* zapnout, *Minimum password length* na 8,
*Redirect URLs* omezit na vlastní domény.

---

## 6. Rozhodnutí: ukazovat kontakt na inzerenta komukoli?

`public_listings()` vrací i telefon a smí ji zavolat kdokoli s veřejným
klíčem — **jeden dotaz vydá kontakty všech inzerentů naráz**. Že se
kontakt ukáže na stránce pozemku, je záměr; hromadnost ne.

Opravit to kódem samo nic nezmění (`id` vydá týž výpis a anonymní
volající nemá, podle čeho se poznat). Co pomůže, je **rozhodnutí**:
ukazovat kontakt až po přihlášení, s brzdou na účet. Bezpečné, ale
zájemce, který se registrovat nechce, se neozve.

Dnes to nestojí nic — tabulka inzerátů je prázdná. Proto je teď
nejlevnější chvíle se rozhodnout: po prvním opravdovém inzerentovi už
by to znamenalo měnit pravidla někomu, kdo na ně přistoupil.
Rozebráno v oddílu 132 `docs/optimalizace.md`.

---

## 7. Rozhodnutí: co s spoluvlastnickými podíly

**531 z 1 953 nabídek (27 %) jsou spoluvlastnické podíly** — často
1/66, 1/90 parcely. Kupující s takovým podílem nemůže o pozemku
rozhodovat sám. Web je dnes ukazuje jako každou jinou nabídku, jen
u nich nedělá odhad ani verdikt (to je správně) a říká u nich, že jde
o podíl.

Otázka je produktová: mají být **ve výpisu normálně**, nebo za
samostatným filtrem („jen celé pozemky" je dnes schovaný až v hlídání)?
Nabídek od toho jednoho velkoobchodníka je 43 % podílových, takže na
mapě jich je hodně.

---

## 7c. Rozhodnutí na potom: strop noční rozesílky

Noční úloha si stahuje **všechna** zralá hledání (naměřeno 4 000 řádků
při 20 000 uložených hledáních) a pošle z nich nejvýš dvě stě e-mailů;
zbytek odpovědi zahodí. Stáhnout jen tolik, kolik se stihne, vypadá
zřejmě — ale rozbilo by to spravedlnost: **komu hledání nic nenajde,
tomu se čas odeslání nikdy nepřepíše**, takže by v okně stropu seděl
každou noc znovu a lidé za ním by se na řadu nedostali. Proto se to
NEUDĚLALO (podrobně v `docs/optimalizace.md`, část 138).

Udělat se to dá, ale musí k tomu přijít záznam „kdy se tohle hledání
naposled **zkoušelo**" (dnes se píše jen „kdy se poslalo"). To je práce
na hodinu a nikomu nic nerozbije — jen do ní nemá smysl jít, dokud
rozesílání vůbec neběží (bod 3). **Stačí říct slovo.** Do té doby je
cena jedna zbytečně velká odpověď za noc.

## 7b. Co vadou NENÍ (ať se to nespravuje podruhé)

Při kritice 23. 10. jsem si dvě věci napsal jako vadu a nejsou:

* **„Nové na trhu" není prázdné.** `first_seen` má sice 1 529 z 1 953
  nabídek shodné (den, kdy se evidence zavedla), ale `nove-pozemky.html`
  je mezi novinky nepočítá a **říká to rovnou**. Za posledních sedm dní
  je tam 111 skutečně nových nabídek.
* **Cenová historie se vede.** Je v `data/zlevneni.json` (ne v poli
  `cena_zmena`, podle kterého jsem počítal poprvé): 83 zlevnění za
  sedm dní.

---

## 8. Odložené, dokud není 1–5

* **VAPID a upozornění do telefonu** — klíče vygenerované, do Secrets
  nenahrané.
* **Stripe** — `api/create-checkout.js` je schválně zavřený: umí
  vytvořit platbu na 299 Kč, ale webhook zvýraznění ještě nedoručí.
  Zapnout až s identitou (bod 4).
* **Vlastní SMTP v Supabase** — bez něj posílá potvrzovací e-maily
  Supabase ze své adresy a má denní strop.
