# Co je v této složce

`settings.json` říká Claude Code, které dva doplňky („pluginy") si má
v tomhle repozitáři zapnout. Není to součást webu — do stránek, do CSS
ani do zkoušek to nijak nezasahuje. Generátory (`node scripts/oprav.mjs`)
tuto složku nečtou a nepřepisují.

Majitel si oba doplňky vyžádal 1. 11. 2026 („ano, normálně to vše
nainstaluj, máš potvrzení"). Obojí je MIT a veřejné na GitHubu.

## ecc@ecc — github.com/affaan-m/ECC

Velká sada pro Claude Code: 71 agentů, 620 souborů s dovednostmi,
98 příkazů, 122 pravidel a **hooky**. Verze při instalaci 2.2.3.

Hooky jsou ta část, o které je dobré vědět: ECC si zavěsí vlastní
program **před každé spuštění příkazu v shellu a před každý zápis nebo
úpravu souboru**. V tomhle repozitáři jde o hodně volání — jedno
`oprav.mjs` a jedna rychlá sada (134 zkoušek) jich udělají tisíce.
Zapnuto je to ve výchozím nastavení (`hooks_enabled: true`,
`hook_profile: standard`).

Kdyby to překáželo, jsou tři stupně, od nejmenšího zásahu:

1. jen hooky pryč, dovednosti a příkazy zůstanou →
   `claude plugin configure ecc@ecc --values-stdin` a poslat
   `{"hooks_enabled": false}`,
2. lehčí profil hooků → totéž s `{"hook_profile": "minimal"}`,
3. celý doplněk pryč → v `settings.json` změnit `"ecc@ecc"` na `false`.

## prompts.chat@prompts.chat — github.com/f/prompts.chat

To z toho videa: knihovna výzev („promptů"), přes 170 tisíc hvězd na
GitHubu. Doplněk je malý a **žádné hooky nemá** — jsou v něm dva
příkazy (`/prompts.chat:prompts`, `/prompts.chat:skills`), dva agenti,
dvě dovednosti a připojení na API prompts.chat přes MCP.

POZOR, JEDNA VĚC NEFUNGUJE A NENÍ TO VADA DOPLŇKU: to připojení na API
vede na `https://prompts.chat/api/mcp` a síťová pravidla tohohle
prostředí tu adresu nepouštějí (vyzkoušeno, proxy odpoví 403). Příkazy,
agenti i dovednosti se nainstalují a načtou, ale dokud se `prompts.chat`
nepřidá v nastavení prostředí mezi povolené adresy, hledání výzev přes
API nic nevrátí.
