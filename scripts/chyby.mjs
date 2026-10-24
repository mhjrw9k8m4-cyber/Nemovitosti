#!/usr/bin/env node
/* CO LIDEM V PROHLÍŽEČI PADÁ — VYPSÁNO DO TERMINÁLU
   ==================================================================
   Spuštění:
     SUPABASE_SERVICE_ROLE_KEY=… node scripts/chyby.mjs
     SUPABASE_SERVICE_ROLE_KEY=… node scripts/chyby.mjs --dni 30

   Čte čítače z tabulky `chyby_klienta` (supabase/chyby-klienta.sql),
   kam je posílá js/chyby.js z prohlížečů návštěvníků. Nic nemění.

   PROČ TO VŮBEC ČTE ČLOVĚK A NE ROBOT. Protože rozhodnutí „je tohle
   chyba webu, nebo cizí rozšíření" nikdo za nás neudělá. Hlášení jsou
   čítače hlášek, ne hlášení o lidech: nedá se z nich poznat, komu to
   spadlo, jen co a kde.

   NA CO SE TU DÍVAT NEJDŘÍV: na sloupec „prohlížeče". Všech 130
   zkoušek v prohlížeči běží jen v Chromiu, takže jediná zpráva
   o Safari nebo o starém Androidu přichází právě odtud.

   ČÍSLA JSOU PŘIBLIŽNÁ a je to napsané i tady: zapsat může kdokoli
   s veřejným klíčem, takže se dají nafouknout. K otázce „padá to,
   a komu" to stačí; k ničemu, co by se počítalo, ne.
   ================================================================== */
const URL_ = (process.env.SUPABASE_URL || 'https://tcinuzftgmkvjjgvadky.supabase.co').replace(/\/+$/, '');
const KLIC = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const i = process.argv.indexOf('--dni');
const DNI = Math.max(1, Math.min(parseInt(i >= 0 ? process.argv[i + 1] : '7', 10) || 7, 365));

if (!KLIC) {
  console.log('Chybí SUPABASE_SERVICE_ROLE_KEY — bez něj se hlášení přečíst nedají.');
  console.log('Najdete ho v Supabase → Project Settings → API → service_role.');
  process.exit(1);
}

const cislo = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const pruh = (n, max, sirka = 16) => '█'.repeat(Math.max(n > 0 ? 1 : 0, Math.round((n / (max || 1)) * sirka)));

const odpoved = await fetch(`${URL_}/rest/v1/rpc/prehled_chyb`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', apikey: KLIC, authorization: 'Bearer ' + KLIC },
  body: JSON.stringify({ p_dni: DNI }),
}).catch((e) => ({ ok: false, chyba: e }));

if (!odpoved || !odpoved.ok) {
  const t = odpoved && odpoved.text ? await odpoved.text().catch(() => '') : '';
  console.log('Nepovedlo se přečíst: ' + (odpoved && odpoved.status ? 'stav ' + odpoved.status : 'spojení')
    + (t ? ' — ' + t.slice(0, 200) : ''));
  console.log('Je balík supabase/00-vse.sql nahraný v databázi?');
  process.exit(1);
}
const d = await odpoved.json();

console.log(`\nChyby z prohlížečů za posledních ${d.dni} dní`);
console.log('='.repeat(46));
if (!d.celkem) {
  console.log('\nAni jedna. Buď je web v pořádku, nebo hlásič teprve od dneška');
  console.log('(hlásí se od nasazení, zpětně se nic dopočítat nedá), nebo na web');
  console.log('nikdo nepřišel — to se pozná z node scripts/navstevnost.mjs.\n');
  process.exit(0);
}
console.log(`\nnahlášených pádů: ${cislo(d.celkem)}`);

const strop = (d.stranky || []).find((x) => x.stranka === '(strop)');
if (strop) {
  console.log(`\nPOZOR: denní strop se sepnul — ${cislo(strop.pocet)} hlášení se nevešlo`);
  console.log('do vlastního řádku. Buď se web opravdu rozsypal, nebo tabulku někdo plní.');
}

const h = d.hlasky || [];
if (h.length) {
  console.log('\nNejčastější hlášky');
  const max = h[0].pocet;
  for (const x of h.slice(0, 15)) {
    console.log(`  ${String(cislo(x.pocet)).padStart(6)}  ${pruh(x.pocet, max).padEnd(16)}  ${x.zprava}`);
    console.log(`          ${x.zdroj || '(neznámé místo)'} · stránek: ${x.stranek} · naposled ${String(x.naposled).slice(0, 16)}`);
  }
}

const pr = d.prohlizece || [];
if (pr.length) {
  const celkem = pr.reduce((s, x) => s + x.pocet, 0) || 1;
  console.log('\nProhlížeče');
  for (const x of pr.slice(0, 12)) {
    console.log(`  ${String(x.prohlizec).padEnd(12)} ${String(Math.round(100 * x.pocet / celkem)).padStart(3)} %  (${cislo(x.pocet)})`);
  }
}

const st = (d.stranky || []).filter((x) => x.stranka !== '(strop)');
if (st.length) {
  console.log('\nStránky');
  const max = st[0].pocet;
  for (const x of st.slice(0, 12)) {
    console.log(`  ${String(cislo(x.pocet)).padStart(6)}  ${pruh(x.pocet, max).padEnd(16)}  ${x.stranka}`);
  }
}

console.log('\nHláška „‹adresa›" nebo „‹e-mail›" uvnitř textu není chyba: tak se');
console.log('z hlášky vyhazuje všechno, co by mohlo být osobní — v prohlížeči');
console.log('i v databázi. Čísla jsou přibližná, zapsat může kdokoli.\n');
