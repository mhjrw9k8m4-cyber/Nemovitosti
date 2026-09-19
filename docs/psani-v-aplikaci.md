# Psaní mezi lidmi v aplikaci

Zájemce a majitel si píší přímo na Parcelce. Nikdo z nich neuvidí e-mail
ani telefon toho druhého — to je celý smysl: kdo dá inzerát, nedostane
spam, a kdo se ptá, nemusí vydávat kontakt dřív, než chce.

## Jak to drží pohromadě

| Kus | Kde | Co dělá |
|---|---|---|
| tabulka a funkce | `supabase/messaging.sql` | `send_message`, `my_threads`, `thread_messages`, `unread_count` |
| schránka a konverzace | `zpravy.html` | seznam vláken, okno chatu |
| logika bez DOMu | `js/zpravy-logika.js` | hlavička, překreslování, hlášky, počítadlo znaků |
| odznak v menu | `js/zpravy-odznak.js` | počet nepřečtených u položky „Zprávy" |
| vstup z mapy | `js/main.js` → „Napsat majiteli" | `zpravy.html?l=…&new=1&p=obec&ok=okres` |

**Vlákno = dvojice (inzerát, zájemce).** Majitel je vždy `listings.user_id`.
Psát jde jen přes `send_message`; přímý zápis do tabulky z prohlížeče
povolený není, takže si nikdo nepodstrčí cizí jméno odesílatele.

## Co se opravovalo a proč

**Odznak svítil na jediné stránce ze sta dvou.** Kód byl vložený natvrdo
v `index.html`. Kdo přišel na stránku okresu — a tam chodí lidé
z vyhledávání nejčastěji — se o nové zprávě nedozvěděl.

**A na mobilu nebyl vidět ani tam.** Menu je schované za hamburgerem,
takže odznak u položky „Zprávy" nikdo neuvidí, dokud menu neotevře — a
otevřít ho nemá proč, když neví, že mu někdo napsal. Proto přibyla tečka
přímo na tlačítku menu (`.nav-toggle .nav-dot`). **Odhalil to až test
v opravdovém prohlížeči v mobilním rozměru**; v Node to vypadalo hotově.

**V hlavičce konverzace stálo jen „Konverzace".** Majitel se třemi zájemci
o tentýž pozemek netušil, komu odpovídá. Teď je tam obec, okres a `Zájemce
2222` — konec cizího id, žádné jméno ani e-mail. Pro nové vlákno, které
`my_threads` ještě nezná, nese obec a okres odkaz z mapy (`p=`, `ok=`).

> `o=1` už znamená „jsem majitel", proto se okres předává jako `ok=`.
> Se jménem `o` by z okresu pojmenovaného „1" byl rázem majitel.

**Seznam se překresloval každých 15 s.** Pohled skočil zpátky dolů i
uprostřed čtení starší zprávy. Teď se překresluje jen při změně a dolů se
sjede jen tehdy, když už jsem dole nebo mi přišla nová zpráva od druhého.

**Odeslání vypadalo jako by se nic nestalo.** Na pomalé síti se nic nedělo,
dokud neodpověděl server. Teď se bublina ukáže hned jako „odesílám…";
když to server odmítne, zšedne, text zůstane v poli a nad ním je věta,
co s tím — ne technická hláška z databáze.

**Na pozadí se web pořád doptával.** Teď se při skryté záložce neptá
vůbec a po návratu načte rovnou — méně dat i baterie.

## Testy

```
node scripts/test-zpravy.mjs          # 44 testů logiky, běží všude
node scripts/test-chat-prohlizec.mjs  # 22 kontrol v opravdovém Chromiu
```

Ten druhý si sám spustí zkušební Supabase (`scripts/falesna-supabase-chat.mjs`)
a projde celou cestu: zájemce napíše → majitel to vidí i se zavřeným menu
na mobilu → odpoví → odpověď dorazí zpět **bez obnovení stránky**. Potřebuje
`playwright-core`; v sandboxu navíc `PW_CHROMIUM=cesta/k/chrome`.

Oba běží v CI (`.github/workflows/testy.yml`), prohlížečový zvlášť, ať
rychlé testy zůstanou rychlé.

## Co tu ještě není

**Upozornění na novou zprávu e-mailem.** Kdo se na web nevrátí, o dotazu
se nedozví. Hotové to bude, až projde ověření domény v Resendu — do té doby
by se stejně nic neodeslalo (účet je v testovacím režimu, viz
`docs/oprava-hlidani-a-pridavani.md`).
