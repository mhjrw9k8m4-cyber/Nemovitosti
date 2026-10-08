#!/usr/bin/env node
/* KOLIK LIDÍ NA WEB CHODÍ — VYPSÁNO DO TERMINÁLU
   ==================================================================
   Spuštění:
     SUPABASE_SERVICE_ROLE_KEY=… node scripts/navstevnost.mjs
     SUPABASE_SERVICE_ROLE_KEY=… node scripts/navstevnost.mjs --dni 7

   Čte čítače z tabulky `navstevnost` (supabase/navstevnost.sql) a vypíše
   je lidsky. Nic nemění.

   PROČ TO NENÍ STRÁNKA NA WEBU. Souhrn smí číst jen majitel, a web
   žádnou představu o „majiteli" nemá — jsou tu jen běžné účty. Dát
   funkci právo `authenticated` by znamenalo, že si návštěvnost přečte
   kdokoli, kdo se zaregistruje. Místo vymýšlení správcovských rolí se
   to čte servisním klíčem, který existuje a leží v tajných proměnných
   repozitáře; totéž dělá rozesílač.

   ČÍSLA JSOU PŘIBLIŽNÁ A JE TO NAPSANÉ I TADY. Zapisovat může kdokoli
   (jinak by to z veřejné stránky nešlo), takže se dají nafouknout.
   Na otázku „chodí sem deset lidí denně, nebo tisíc" to stačí;
   na fakturaci inzerentovi ne.
   ================================================================== */
const URL_ = (process.env.SUPABASE_URL || 'https://tcinuzftgmkvjjgvadky.supabase.co').replace(/\/+$/, '');
const KLIC = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const i = process.argv.indexOf('--dni');
const DNI = Math.max(1, Math.min(parseInt(i >= 0 ? process.argv[i + 1] : '30', 10) || 30, 365));

if (!KLIC) {
  console.log('Chybí SUPABASE_SERVICE_ROLE_KEY — bez něj se čítače přečíst nedají.');
  console.log('Najdete ho v Supabase → Project Settings → API → service_role.');
  process.exit(1);
}

const cislo = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const pruh = (n, max, sirka = 28) => '█'.repeat(Math.max(n > 0 ? 1 : 0, Math.round((n / (max || 1)) * sirka)));

const odpoved = await fetch(`${URL_}/rest/v1/rpc/prehled_navstevnosti`, {
  method: 'POST',
  headers: { 'content-type': 'application/json', apikey: KLIC, authorization: 'Bearer ' + KLIC },
  body: JSON.stringify({ p_dni: DNI }),
}).catch((e) => ({ ok: false, chyba: e }));

if (!odpoved || !odpoved.ok) {
  const t = odpoved && odpoved.text ? await odpoved.text().catch(() => '') : '';
  console.log('Nepovedlo se přečíst: ' + (odpoved && odpoved.status ? 'stav ' + odpoved.status : 'spojení') + (t ? ' — ' + t.slice(0, 200) : ''));
  console.log('Je migrace supabase/navstevnost.sql nahraná v databázi?');
  process.exit(1);
}
const d = await odpoved.json();

console.log(`\nNávštěvnost za posledních ${d.dni} dní`);
console.log('='.repeat(46));
if (!d.celkem || !d.celkem.zobrazeni) {
  console.log('\nZatím nic. Buď web ještě nikdo nenavštívil, nebo migrace');
  console.log('běží teprve od dneška. Měření začíná dnem nasazení — zpětně');
  console.log('se nic dopočítat nedá.\n');
  process.exit(0);
}
console.log(`\nzobrazení stránek: ${cislo(d.celkem.zobrazeni)}`);
console.log(`návštěv (relací):  ${cislo(d.celkem.navstevy)}`);

const dny = d.po_dnech || [];
if (dny.length > 1) {
  console.log('\nPo dnech');
  const max = Math.max(...dny.map((x) => x.zobrazeni));
  for (const x of dny.slice(-21)) {
    console.log(`  ${x.den}  ${String(cislo(x.zobrazeni)).padStart(7)}  ${pruh(x.zobrazeni, max)}`);
  }
}

const str = d.stranky || [];
if (str.length) {
  console.log('\nNejčtenější stránky');
  const max = str[0].zobrazeni;
  for (const x of str.slice(0, 15)) {
    console.log(`  ${String(cislo(x.zobrazeni)).padStart(7)}  ${pruh(x.zobrazeni, max, 16).padEnd(16)}  ${x.stranka}`);
  }
}

const zd = d.zdroje || [];
if (zd.length) {
  console.log('\nOdkud lidé přišli');
  const max = zd[0].zobrazeni;
  for (const x of zd.slice(0, 12)) {
    console.log(`  ${String(cislo(x.zobrazeni)).padStart(7)}  ${pruh(x.zobrazeni, max, 16).padEnd(16)}  ${x.zdroj}`);
  }
}

const za = d.zarizeni || [];
if (za.length) {
  const celkem = za.reduce((s, x) => s + x.zobrazeni, 0) || 1;
  console.log('\nZařízení');
  for (const x of za) {
    console.log(`  ${x.zarizeni.padEnd(8)} ${String(Math.round(100 * x.zobrazeni / celkem)).padStart(3)} %  (${cislo(x.zobrazeni)})`);
  }
}
console.log('\nČísla jsou přibližná: zapisovat do čítačů může kdokoli, kdo otevře');
console.log('stránku, takže se dají nafouknout. Na rozhodování stačí, na fakturu ne.\n');
