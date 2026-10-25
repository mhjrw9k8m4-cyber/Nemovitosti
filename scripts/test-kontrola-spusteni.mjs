// Test: kontrola připravenosti ke spuštění měří, co tvrdí.
//
// Spuštění: node scripts/test-kontrola-spusteni.mjs   (nepotřebuje prohlížeč)
//
// PROČ VZNIKL. scripts/kontrola-spusteni.mjs je nástroj, podle kterého
// se rozhodne „pustit, nebo nepustit". Takový nástroj musí platit
// hlavně ve dvou nepříjemných případech:
//   · když je něco rozbité — musí to NAJÍT a říct, co s tím,
//   · když se NEDÁ ZMĚŘIT — musí to přiznat, ne mlčet.
// Ta druhá je důležitější. Kontrola, která při nedostupné databázi
// napíše „nic nebrání", je horší než žádná: dá zelenou na základě toho,
// že se nic nezkusilo.
//
// Živá databáze se tu PŘEDSTÍRÁ: vlastní server odpovídá tak, jak by
// odpovídala Supabase v šesti různých stavech. Proti opravdové databázi
// tohle spustit nejde (a nemá) — klíče do zkoušky nepatří.
import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pricinaChyb } from './chyby-hlaska.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}

/* Falešná Supabase. `stav` říká, co má zrovna předstírat. */
let stav = 'vse-dobre';
const poslanoDoChyb = [];
const server = http.createServer((req, res) => {
  const u = req.url.split('?')[0];
  const odpoved = (kod, telo) => { res.writeHead(kod, { 'content-type': 'application/json' }); res.end(telo); };
  if (u === '/rest/v1/rpc/public_listings') {
    if (stav === 'sql-nenasazene') {
      return odpoved(404, JSON.stringify({ code: 'PGRST202', message: 'Could not find the function' }));
    }
    if (stav === 'databaze-mlci') { res.destroy(); return; }
    return odpoved(200, '[]');
  }
  if (u === '/rest/v1/rpc/prehled_navstevnosti') {
    return stav === 'prehled-otevreny' ? odpoved(200, '{"dni":1}') : odpoved(401, '{"message":"no"}');
  }
  if (u.startsWith('/storage/v1/object/public/listing-photos/')) {
    if (stav === 'balik-nebezel') return odpoved(400, '{"message":"Bucket not found"}');
    return stav === 'chybi-kbelik'
      ? odpoved(400, '{"message":"Bucket not found"}')
      : odpoved(404, '{"message":"Object not found"}');
  }
  if (u === '/rest/v1/rpc/zapis_chybu') {
    /* Co kontrola do té funkce pošle, si schováme: nesmí to být nic,
       co by databáze zapsala. */
    let telo = '';
    req.on('data', (d) => { telo += d; });
    return req.on('end', () => {
      poslanoDoChyb.push(telo);
      if (stav === 'chyby-nenasazene' || stav === 'balik-nebezel') {
        return odpoved(404, JSON.stringify({ code: 'PGRST202', message: 'Could not find the function' }));
      }
      return odpoved(204, '');
    });
  }
  if (u === '/auth/v1/settings') {
    return odpoved(200, JSON.stringify({ mailer_autoconfirm: stav === 'bez-potvrzovani' }));
  }
  odpoved(404, '{}');
});
await new Promise((r) => server.listen(8412, r));

function pust(rezim, dalsi) {
  stav = rezim;
  return new Promise((hotovo) => {
    const p = spawn('node', [path.join(KOREN, 'scripts', 'kontrola-spusteni.mjs'), ...(dalsi || [])],
      { cwd: KOREN, env: { ...process.env, SUPABASE_URL: 'http://127.0.0.1:8412' } });
    let out = '';
    p.stdout.setEncoding('utf8');
    p.stderr.setEncoding('utf8');
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { out += d; });
    p.on('close', (kod) => hotovo({ out, kod }));
  });
}

console.log('\nKontrola připravenosti ke spuštění');

/* ---- 1) všechno v pořádku: živá část nic neblokuje -------------- */
{
  const { out, kod } = await pust('vse-dobre');
  pravda('při zdravé databázi nehlásí nic, co blokuje',
    !/BLOKUJE SPUŠTĚNÍ/.test(out) && kod === 0, out.split('\n').filter((l) => /✕/.test(l)).join(' | '));
  pravda('a potvrdí všech pět živých kontrol',
    /public_listings\(\) v ní je/.test(out) && /uzavřená funkce je uzavřená/.test(out)
    && /kbelík listing-photos existuje/.test(out) && /potvrzování e-mailu je zapnuté/.test(out)
    && /hlášení chyb z prohlížeče je nasazené/.test(out),
    out.split('\n').filter((l) => /✓/.test(l)).slice(-6).join(' | '));
  /* A ta nejdůležitější vlastnost téhle kontroly: NIC NEZAPÍŠE.
     Hláška „ab" je kratší než tři znaky, takže ji zapis_chybu()
     odmítne ještě před insertem. Kdyby se tu jednou zkrátila cesta
     a poslala se „opravdová" hláška, vznikl by při každé kontrole
     připravenosti řádek v cizí databázi. */
  pravda('a ptá se hláškou, kterou databáze zahodí (kontrola nic nezapíše)',
    poslanoDoChyb.length >= 1 && poslanoDoChyb.every((t) => /"p_zprava":"ab"/.test(t)),
    'posláno: ' + poslanoDoChyb.join(' | ').slice(0, 160));
}

/* ---- 2) každý rozbitý stav musí být NÁLEZ, který blokuje -------- */
for (const [rezim, vzor, popis] of [
  ['sql-nenasazene', /public_listings\(\) v databázi NENÍ/, 'nenasazené SQL'],
  ['prehled-otevreny', /odpověděla NEPŘIHLÁŠENÉMU/, 'otevřená uzavřená funkce'],
  ['chybi-kbelik', /kbelík listing-photos neexistuje/, 'chybějící úložiště fotek'],
  ['bez-potvrzovani', /mailer_autoconfirm = true/, 'vypnuté potvrzování e-mailu'],
]) {
  const { out, kod } = await pust(rezim);
  pravda(`${popis}: najde se a blokuje`,
    vzor.test(out) && /BLOKUJE SPUŠTĚNÍ/.test(out) && /VERDIKT: NESPOUŠTĚT/.test(out) && kod === 1,
    `návratový kód ${kod}; ` + (out.split('\n').find((l) => /✕/.test(l)) || 'žádný nález'));
}

/* ---- 3) A TO NEJDŮLEŽITĚJŠÍ: nedostupná databáze není „v pořádku" */
{
  const { out } = await pust('databaze-mlci');
  pravda('nedostupná databáze se přizná jako NEZKOUŠENO',
    /\? živá databáze/.test(out), out.split('\n').filter((l) => /živá databáze/.test(l)).join(' | '));
  pravda('a nevydává se za ověřenou',
    !/databáze odpovídá a public_listings/.test(out));
}
{
  const { out } = await pust('vse-dobre', ['--bez-site']);
  pravda('s --bez-site se živá část nezkouší a je to napsané',
    /\? živá databáze/.test(out) && /--bez-site/.test(out));
}

/* ---- 4) verdikt nikdy nemlčí o tom, co se nezkusilo ------------- */
{
  const { out } = await pust('vse-dobre');
  pravda('ve výpisu je vždycky hromádka NEZKOUŠENO', /NEZKOUŠENO — NEPLATÍ ZA/.test(out));
  pravda('a je v ní průchod naostro, který neudělá žádný skript',
    /průchod naostro/.test(out) && /musí to projít člověk/.test(out));
  pravda('i odkaz na hlubší prohlídku oprávnění se servisním klíčem',
    /kontrola-databaze\.mjs se servisním klíčem/.test(out));
  /* Zkoušky v prohlížeči běží jen v Chromiu. Kdyby to verdikt
     neříkal, zelená CI by vypadala jako „otestováno všude" —
     a Safari je čtvrtina českých telefonů. */
  pravda('a přiznané Safari, kde neběžela ani jedna zkouška',
    /Safari a iPhone/.test(out) && /jen.{0,3}\n?.{0,30}Chromium/s.test(out),
    out.split('\n').filter((l) => /Safari/.test(l)).join(' | '));
}

/* ---- 5) nenasazené hlášení chyb: ztráta, ne blokace ------------ */
{
  const { out, kod } = await pust('chyby-nenasazene');
  pravda('chybějící zapis_chybu() se pozná a řekne, co se tím ztrácí',
    /zapis_chybu\(\) v databázi NENÍ/.test(out) && /do prázdna/.test(out),
    out.split('\n').filter((l) => /chyb/.test(l)).slice(0, 3).join(' | '));
  /* Spuštění to nebrání — web bez hlášení chyb funguje, jen slepý.
     Kdyby to blokovalo, přestal by se verdikt dát použít na otázku
     „můžu pustit?", a to je jeho jediná práce. */
  pravda('a spuštění tím neblokuje (web bez hlásiče funguje, jen slepý)',
    !/BLOKUJE SPUŠTĚNÍ/.test(out) && kod === 0,
    out.split('\n').filter((l) => /✕/.test(l)).join(' | '));
}

/* ---- 5b) dva nálezy, jedna příčina ----------------------------- */
/* Naměřeno na živé databázi 24. 10.: chyběl kbelík i zapis_chybu.
   Bez věty o společné příčině by se každý nález spravoval zvlášť —
   a kbelík by vznikl ručně, tedy bez stropu na velikost i typ. */
{
  const { out } = await pust('balik-nebezel');
  pravda('když chybí kbelík i zapis_chybu, řekne se, že je to JEDNA příčina',
    /společná příčina/.test(out) && /TÝŽ balík/.test(out),
    out.split('\n').filter((l) => /příčina|balík/.test(l)).slice(0, 3).join(' | '));
  pravda('a u kbelíku se varuje, aby se nezakládal ručně (byl by bez stropů)',
    /NEZAKLÁDEJTE ho ručně/.test(out),
    out.split('\n').filter((l) => /kbelík/.test(l)).slice(0, 2).join(' | '));
}

/* ---- 6) živý režim: nezměřeno je VADA, ne „v pořádku" ---------- */
{
  const a = await pust('vse-dobre', ['--jen-zive']);
  pravda('živý režim projde, když databáze odpovídá',
    a.kod === 0 && /živá databáze odpovídá a drží/.test(a.out),
    `kód ${a.kod}; ${a.out.split('\n').filter((l) => /VERDIKT/.test(l)).join(' | ')}`);
  pravda('a nehlásí v něm to, co se pozná z repozitáře (to hlídá CI při pushi)',
    !/js\/config\.js/.test(a.out), a.out.split('\n').filter((l) => /config/.test(l)).join(' | '));

  const b = await pust('vse-dobre', ['--jen-zive', '--bez-site']);
  pravda('ale „nezměřilo se nic" je v živém režimu VADA, ne klid',
    b.kod === 1 && /nezměřilo se nic/.test(b.out),
    `kód ${b.kod}; ${b.out.split('\n').filter((l) => /VERDIKT|nezměř/.test(l)).join(' | ')}`);

  const c = await pust('databaze-mlci', ['--jen-zive']);
  pravda('a nedostupná databáze taky',
    c.kod === 1, `kód ${c.kod}; ${c.out.split('\n').filter((l) => /VERDIKT/.test(l)).join(' | ')}`);
}

server.close();
console.log(zpravy.join('\n'));
console.log(`\n  ${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log('::error::Kontrola spuštění: ' + chyb + ' kontrol neprošlo.' + pricinaChyb(zpravy));
  process.exit(1);
}
process.exit(0);
