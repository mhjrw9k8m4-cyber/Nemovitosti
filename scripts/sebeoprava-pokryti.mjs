#!/usr/bin/env node
/* CO GENERÁTORY PÍŠOU × CO AUTOMAT SMÍ PŘEPSAT
   ==================================================================
   Spuštění: node scripts/sebeoprava-pokryti.mjs
   (dělá si jednorázovou kopii repozitáře, trvá minuty)

   PROČ. Sebeoprava má jediné místo, kde se rozhoduje, na co smí
   sáhnout: seznam `PATRI_GENERATORUM` v scripts/sebeoprava.mjs. Ten
   seznam je psaný RUČNĚ — a to je dobře, protože jde o bezpečnostní
   hranici. Jenže ručně psaná hranice se rozejde s tím, co generátory
   doopravdy píšou, a nikdo si toho nemusí všimnout: automat se pak
   tváří, že má pravidla, a přitom má DÍRU (soubor, který se rozchází,
   ale on ho opravit nesmí) nebo MRTVÉ PRAVIDLO (vzor, který nesedí na
   žádný soubor v repozitáři).

   Právě tohle se stalo: seznam povoloval `rss*.xml`, ale kanály se
   jmenují `novinky-*.xml`. Vzor tedy nesedl na nic a patnáct souborů,
   které generátory píšou při každé změně dat, automat opravit nesměl.
   Zelená pravidla, zelené zkoušky, hranice vedle.

   JAK SE TO MĚŘÍ, A PROČ TAKHLE. Nečte se kód generátorů (ten by se
   dal čtením vyložit jakkoli) — pustí se a koukne se, CO SKUTEČNĚ
   PŘEPSALY. Signálem je čas změny, ne obsah: generátor, který zapíše
   tentýž text, soubor přesto VLASTNÍ, a automat na něj tedy smí.
   Pak se obě strany porovnají:

     · soubor, který generátory píšou a seznam ho nepovoluje → DÍRA,
     · vzor v seznamu, který nesedí na žádný soubor → MRTVÉ PRAVIDLO,
     · nezměřilo se nic → taky nález, ne úspěch.
   ================================================================== */
import { mkdtempSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { PATRI_GENERATORUM, patriGeneratorum } from './sebeoprava.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ok = 0, chyb = 0;
const zpravy = [];
function pravda(popis, vyslo, proc) {
  if (vyslo) { ok++; zpravy.push('  ✓ ' + popis); }
  else { chyb++; zpravy.push(`  ✕ ${popis}${proc ? '\n      ' + proc : ''}`); }
}
const spust = (p, a, kde) => {
  const r = spawnSync(p, a, { cwd: kde, encoding: 'utf8', timeout: 1800000 });
  return { kod: r.status, out: String(r.stdout || '') + String(r.stderr || '') };
};

const adr = mkdtempSync(path.join(tmpdir(), 'pokryti-sebeopravy-'));
const PRACE = path.join(adr, 'prace');
process.on('exit', () => { try { rmSync(adr, { recursive: true, force: true }); } catch (e) { /* nic */ } });

const k = spust('git', ['clone', '--quiet', KOREN, PRACE], adr);
pravda('jednorázová kopie repozitáře se postavila', k.kod === 0, k.out.slice(0, 200));
try { symlinkSync(path.join(KOREN, 'node_modules'), path.join(PRACE, 'node_modules')); } catch (e) { /* už je */ }
writeFileSync(path.join(PRACE, '.git', 'info', 'exclude'), 'node_modules\n');

/* Sledují se jen VERZOVANÉ soubory: co v repozitáři není, to se
   nerozchází a automat o tom nerozhoduje. */
const sledovane = spust('git', ['ls-files'], PRACE).out.split('\n').filter(Boolean);
pravda(`je co měřit — ${sledovane.length} verzovaných souborů`, sledovane.length > 2000,
  `jen ${sledovane.length}`);

const casPred = new Map();
for (const f of sledovane) {
  try { casPred.set(f, statSync(path.join(PRACE, f)).mtimeMs); } catch (e) { /* smazaný */ }
}

const o = spust('node', [path.join(PRACE, 'scripts', 'oprav.mjs')], PRACE);
pravda('generátory proběhly', o.kod === 0, o.out.split('\n').slice(-6).join(' | '));

const psane = [];
for (const f of sledovane) {
  let po = null;
  try { po = statSync(path.join(PRACE, f)).mtimeMs; } catch (e) { po = null; }
  if (po === null || casPred.get(f) === undefined) continue;
  if (po !== casPred.get(f)) psane.push(f);
}
pravda(`generátory něco opravdu přepsaly — ${psane.length} souborů`, psane.length > 100,
  `přepsalo se jen ${psane.length}; nezměřilo se tedy nic a to není úspěch`);

/* ---- DÍRY: generátory to píšou, ale automat na to nesmí ---------- */
const diry = psane.filter((f) => !patriGeneratorum(f));
/* Skupiny podle prvního adresáře/přípony, ať se v tisících jmen dá číst. */
const skupina = (f) => (f.includes('/') ? f.slice(0, f.indexOf('/')) + '/…' : '…' + path.extname(f));
const dirySkupiny = [...new Set(diry.map(skupina))];
pravda('každý soubor, který generátory píšou, smí automat opravit',
  diry.length === 0,
  `${diry.length} souborů automat opravit NESMÍ, i když je generátory přepisují`
  + ` (${dirySkupiny.join(', ')}), např. ${diry.slice(0, 5).join(', ')}`
  + ' — při jejich rozchodu automat odmítne pracovat a červená zůstane');

/* ---- MRTVÁ PRAVIDLA: vzor, který nesedí na nic ------------------- */
const mrtve = PATRI_GENERATORUM.filter((v) => !sledovane.some((f) => v.test(f)));
pravda(`žádné pravidlo v seznamu není mrtvé (${PATRI_GENERATORUM.length} pravidel)`,
  mrtve.length === 0,
  `nesedí na žádný soubor: ${mrtve.map(String).join(', ')}`
  + ' — pravidlo, které nesedí na nic, jen budí dojem, že je něco pokryté');

/* ---- A CO SE NEZMĚŘILO, AŤ JE VIDĚT ------------------------------ */
/* Měří se, co generátory v TOMHLE běhu přepsaly. Soubor, jehož výstup
   se nezměnil, generátor nepřepíše — a tím o něm měření nic neví.
   Nenalezená díra tedy NENÍ důkaz, že díra není; důkazem je jen
   nalezená. Proto se vypisuje, u kterých pravidel se nezměřilo nic. */
{
  const bezMereni = PATRI_GENERATORUM.filter((v) =>
    sledovane.some((f) => v.test(f)) && !psane.some((f) => v.test(f)));
  if (bezMereni.length) {
    zpravy.push(`  ? u ${bezMereni.length} pravidel se v tomhle běhu nezměřilo nic`
      + ' (generátory nepřepsaly ani jeden soubor, který na ně sedí):'
      + `\n      ${bezMereni.map(String).join(', ')}`
      + '\n      Nenalezená díra u nich tedy NENÍ důkaz, že díra není.');
  } else {
    zpravy.push('  ✓ u každého pravidla se změřil aspoň jeden soubor');
  }
}

/* ---- a kolik toho tedy automat pokrývá -------------------------- */
{
  const pokryto = psane.length - diry.length;
  const procent = psane.length ? Math.round((pokryto / psane.length) * 1000) / 10 : 0;
  zpravy.push(`  · pokrytí: automat smí opravit ${pokryto} z ${psane.length} souborů,`
    + ` které generátory píšou (${procent} %)`);
  const podle = new Map();
  for (const f of psane) {
    const s = skupina(f);
    if (!podle.has(s)) podle.set(s, { vse: 0, diry: 0 });
    podle.get(s).vse++;
    if (!patriGeneratorum(f)) podle.get(s).diry++;
  }
  for (const [s, v] of [...podle.entries()].sort((a, b) => b[1].vse - a[1].vse)) {
    zpravy.push(`    ${v.diry ? '✕' : '✓'} ${s}: ${v.vse} psaných`
      + (v.diry ? `, z toho ${v.diry} nepokrytých` : ''));
  }
}

console.log('\nPOKRYTÍ SEBEOPRAVY (co generátory píšou × co automat smí)');
console.log(zpravy.join('\n'));
console.log(`\n  ${ok} v pořádku, ${chyb} chyb\n`);
if (chyb) {
  console.log(`::error::Pokrytí sebeopravy: ${chyb} kontrol neprošlo —`
    + ' hranice toho, na co automat smí, se rozešla s tím, co generátory píšou.');
  process.exit(1);
}
