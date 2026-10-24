#!/usr/bin/env node
/* OHLÁSIT SELHÁNÍ NOČNÍ ÚLOHY — jeden úkol v repozitáři na jednu úlohu.
   ====================================================================
   Volá to .github/actions/ohlas-selhani (krok s `if: failure()`) ze
   všech úloh, které běží podle hodin.

   PROČ TO VZNIKLO. Noční úlohy jsou tři — robot dat (každých 6 hodin),
   kontrola inzerátů (denně) a rozesílání (denně) — a když některá
   selhala, nestalo se NIC. Zůstala po ní červená tečka v záložce
   Actions, kam se nikdo nedívá, a web dál ukazoval data, která se
   přestala obnovovat. Repozitář má 253 zkoušek, tři síta proti rozpadu
   zdrojů a měřidla na všechno — a chyběl mu ten nejhloupější kus:
   někomu to říct.

   JEDEN ÚKOL NA ÚLOHU, NE JEDEN NA BĚH. Nový úkol při každém selhání
   by za týden znamenal sedm stejných a člověk by je přestal otevírat.
   Existující otevřený úkol se proto jen doplní komentářem; poznává se
   podle skryté značky v těle, ne podle názvu (název se dá přepsat).

   SÁM NIKDY NESPADNE. Běží ve chvíli, kdy už něco selhalo, takže jeho
   vlastní chyba nesmí tu první přebít ani zakrýt. Co se nepovede, napíše
   jako `::warning::` a skončí s nulou — ale NIKDY nemlčí.

   Spuštění (proměnné prostředí):
     GH_TOKEN  — github.token z běhu
     REPO      — „vlastnik/jmeno"
     JMENO     — jméno úlohy do názvu úkolu
     VYZNAM    — jedna věta pro člověka: co se tím pokazilo
     BEH       — adresa běhu, který selhal
     ZNACKA    — github.workflow (z něj se dělá skrytá značka)
   ==================================================================== */
const E = process.env;
const chybi = ['GH_TOKEN', 'REPO', 'JMENO', 'VYZNAM', 'BEH'].filter((k) => !E[k]);
if (chybi.length) {
  console.log('::warning::ohlas-selhani: chybí ' + chybi.join(', ') + ' — úkol se nezaloží');
  process.exit(0);
}
/* GH_API je švík pro zkoušku: scripts/test-ohlas-selhani.mjs si GitHub
   předstírá vlastním serverem. V běhu se nenastavuje a výchozí hodnota
   je ta pravá adresa — kdyby se proměnná vloudila do workflow, úkol by
   se tiše zakládal někam jinam, takže na to hlídá táž zkouška. */
const API = (E.GH_API || 'https://api.github.com') + '/repos/' + E.REPO;
const hlavicky = {
  Authorization: 'Bearer ' + E.GH_TOKEN,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
  'Content-Type': 'application/json',
};
/* Jak dlouho po posledním ozvání se mlčí. Přepsat jde proměnnou, ale
   nikdy to není nula: hlášení bez stropu je šum. */
const TICHO_HODIN = Math.max(1, parseInt(E.TICHO_HODIN || '24', 10) || 24);
const slug = String(E.ZNACKA || E.JMENO).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const ZNACKA = `<!-- ohlas-selhani:${slug} -->`;

async function jdi(cesta, volby) {
  const r = await fetch(API + cesta, { ...volby, headers: hlavicky });
  const t = await r.text();
  let j = null; try { j = JSON.parse(t); } catch (e) { /* níž */ }
  return { stav: r.status, j, t };
}

try {
  /* Hledá se jen mezi OTEVŘENÝMI úkoly. Zavřený úkol znamená „tohle už
     je vyřešené", takže další selhání má vzniknout jako nový — jinak by
     se komentáře lepily pod něco, co nikdo nečte. */
  const seznam = await jdi('/issues?state=open&per_page=100');
  const uz = (Array.isArray(seznam.j) ? seznam.j : []).find((i) => String(i.body || '').includes(ZNACKA));

  if (uz) {
    /* TICHO: úkol už existuje a říká, co je špatně. Když selhává něco,
       co se bez člověka spravit nedá (chybí kbelík v Supabase, není
       nasazené SQL), přidávat „selhalo znovu" čtyřikrát denně znamená
       vyrobit šum — a šum nikdo nečte, takže by se tím zrušil celý
       smysl hlášení. Jediná nová informace je „pořád to není spravené"
       a na tu stačí jednou za den.
       KDYŽ SE ČAS NEDÁ ZJISTIT, komentář SE PŘIDÁ: mlčet kvůli
       nejistotě by znamenalo mlčet o selhání. */
    const kom = await jdi(`/issues/${uz.number}/comments?per_page=100`);
    const casy = [uz.created_at, ...(Array.isArray(kom.j) ? kom.j.map((c) => c.created_at) : [])]
      .map((x) => Date.parse(x)).filter((n) => isFinite(n));
    const stariH = casy.length ? (Date.now() - Math.max(...casy)) / 3600000 : Infinity;
    if (stariH < TICHO_HODIN) {
      console.log(`Úkol #${uz.number} je otevřený a ozval se před ${stariH.toFixed(1)} h —`
        + ` komentář se nepřidává (ticho ${TICHO_HODIN} h, ať se z hlášení nestane šum).`);
      process.exit(0);
    }
    const r = await jdi(`/issues/${uz.number}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body: 'Selhalo znovu: ' + E.BEH }),
    });
    if (r.stav >= 200 && r.stav < 300) console.log(`Úkol #${uz.number} už byl otevřený — doplněn komentář.`);
    else console.log(`::warning::komentář k úkolu #${uz.number} se nepovedlo přidat (${r.stav})`);
  } else {
    const telo = ZNACKA + '\n\n**' + E.VYZNAM + '**\n\n'
      + 'Poslední selhání: ' + E.BEH + '\n\n'
      + 'Tenhle úkol zakládá a doplňuje `.github/actions/ohlas-selhani`.'
      + ' Jeden úkol na úlohu: další selhání přijde jako komentář, ne jako nový úkol.'
      + ' Až to bude v pořádku, úkol zavřete — při dalším selhání se založí nový.';
    const r = await jdi('/issues', {
      method: 'POST',
      body: JSON.stringify({ title: 'Noční úloha selhala: ' + E.JMENO, body: telo }),
    });
    if (r.j && r.j.number) console.log('Založen úkol #' + r.j.number);
    else console.log('::warning::úkol se nepovedlo založit (' + r.stav + '): '
      + String((r.j && r.j.message) || r.t).slice(0, 120));
  }
} catch (e) {
  console.log('::warning::ohlas-selhani: ' + String((e && e.message) || e).slice(0, 140));
}
process.exit(0);
