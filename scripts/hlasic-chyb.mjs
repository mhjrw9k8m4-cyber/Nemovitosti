/* Vložený odchytávač chyb do hlavičky každé stránky.
   ==================================================================
   Dvě věci, které sem tenhle krok vepíše:

     1. VLOŽENÝ SKRIPT v hlavičce, co nejdřív. Jen si pády ukládá do
        pole `window.PK_CHYBY`, nic neposílá a nic nenačítá.
     2. ODKAZ NA ODESÍLAČ js/chyby.js s `defer` — ten pole vybere.

   PROČ TO MUSÍ BÝT VLOŽENÝ SKRIPT, A NE JEN SOUBOR. Odložený soubor
   (`defer`) se spustí teprve po zpracování celé stránky, ale většina
   skriptů webu se spouští během ní — a stránka pozemku má patnáct
   neodložených. Posluchač založený až v odloženém souboru by tedy
   propásl právě ty pády, kdy se nespustí vůbec nic. Neodložený
   <script src> v hlavičce by to řešil taky, ale za jedno kolečko po
   síti před prvním vykreslením; vložených 320 B kolečko nestojí.

   PROČ JE TEXT NA VŠECH STRÁNKÁCH TOTOŽNÝ. CSP hashuje obsah
   vložených skriptů. Jedno jediné znění znamená jeden hash navíc
   v hlavičce všech 2 393 stránek; dvě znění by znamenala dva.

   KAM SE VKLÁDÁ. Hned ZA hlavičku CSP, ne před ni: politika z <meta>
   platí teprve na to, co prohlížeč zpracuje po ní. Skript před ní by
   se spustil i bez hashe, a tím by dávalo smysl ho hashovat ještě
   méně než hlídat.
   ================================================================== */

export const ZNACKA = 'data-pk="hlasic-chyb"';

/* JEDEN ŘÁDEK, A JE TO TAK SCHVÁLNĚ. Čitelnější podoba s odřádkováním
   by na 2 393 stránkách stála 1,4 kB navíc a hlavně: každá změna
   bílých znaků je jiný hash CSP, tedy přepis všech stránek. Vysvětlení
   patří do hlavičky tohohle souboru, ne do HTML. */
export const VLOZENY = `<script ${ZNACKA}>window.PK_CHYBY=[];(function(){var q=window.PK_CHYBY;`
  + `function u(z,s,r,c){try{if(q.length<20)q.push([z,s,r,c]);}catch(e){}}`
  + `window.addEventListener('error',function(e){u(e&&e.message,e&&e.filename,e&&e.lineno,e&&e.colno);});`
  + `window.addEventListener('unhandledrejection',function(e){var d=e&&e.reason;`
  + `u((d&&d.message)||String(d||''),'',0,0);});}());</script>`;

/* DVA ODKAZY, A POŘADÍ NENÍ JEDNO. Odložené skripty se spouštějí
   v pořadí, v jakém jsou ve stránce, a js/chyby.js i js/mereni.js
   stojí na js/neosobni.js (stráže, jméno stránky, cesta ven). Proto
   je sdílený soubor první v hlavičce — před oběma. */
export const ODESILAC = '<script src="js/neosobni.js" defer></script>\n'
  + '  <script src="js/chyby.js" defer></script>';

/* Odesílač už ve stránce je — v kterékoli podobě, do jaké ho dostane
   očištění (js/min/) a razítkování (?v=). Hledá se obojí, jinak by se
   odkaz při každém sestavení přepsal zpátky na neočištěný a všech
   2 393 stránek by se měnilo pořád. */
const MA_ODESILAC = /[ \t]*<script src="js\/(?:min\/)?neosobni\.js[^"]*"[^>]*><\/script>\n[ \t]*<script src="js\/(?:min\/)?chyby\.js[^"]*"[^>]*><\/script>\n?/;
const MA_VLOZENY = new RegExp('[ \\t]*<script ' + ZNACKA + '>[\\s\\S]*?</script>\\n?');

const JEDEN_ODKAZ = /[ \t]*<script src="js\/(?:min\/)?(?:neosobni|chyby)\.js[^"]*"[^>]*><\/script>\n?/g;

const PO_CSP = /([ \t]*<meta http-equiv="Content-Security-Policy"[^>]*>\n)/;
const PO_CHARSETU = /(<meta charset="[^"]*">\n)/i;

/* Vrátí stránku s hlásičem, nebo null, když se nemá kam vložit
   (stránka bez <meta charset> i bez CSP — ať se to pozná nahlas). */
export function vlozHlasicChyb(html) {
  let h = html;

  /* Staré znění pryč: text se musí shodovat s VLOZENY do bajtu,
     jinak by hash v CSP nesouhlasil a prohlížeč by skript zakázal. */
  const stary = h.match(MA_VLOZENY);
  if (stary) {
    if (stary[0].trim() === VLOZENY && MA_ODESILAC.test(h)) return h;
    h = h.replace(MA_VLOZENY, '');
  }

  /* Dvojice odkazů v jiném pořadí, rozdělená, nebo jen jeden z nich:
     pryč s oběma a napíší se znovu. Očištění a razítkování běží
     v řetězu AŽ ZA tímhle krokem, takže neočištěnou podobu opraví. */
  h = h.replace(JEDEN_ODKAZ, '');
  const blok = '  ' + VLOZENY + '\n  ' + ODESILAC + '\n';

  if (PO_CSP.test(h)) return h.replace(PO_CSP, '$1' + blok);
  if (PO_CHARSETU.test(h)) return h.replace(PO_CHARSETU, '$1' + blok);
  return null;
}
