#!/usr/bin/env node
/* BĚŽÍ VŮBEC JEŠTĚ TI HLÍDAČI? — KONTROLA PLÁNOVANÝCH ÚLOH
   ==================================================================
   Spuštění: node scripts/kontrola-uloh.mjs

   PROČ. Celý ten řetěz hlídačů visí na plánovaných úlohách: robot dat
   každých 6 h, kontrola nasazení každých 6 h, kontrola inzerátů a
   cvičení sebeopravy denně, rozesílání denně. Všechny mají jednu
   společnou tichou vadu, kterou nikdo z nich sám nepozná:

     GITHUB PLÁNOVANÉ ÚLOHY PO 60 DNECH BEZ AKTIVITY SÁM VYPNE.

   A úloha se dá vypnout i jedním kliknutím v záložce Actions. Od té
   chvíle je všechno zelené — protože se nic neměří. Hlídač, který
   přestal chodit do práce, nehlásí vady; hlásí ticho, a ticho se
   snadno splete s klidem. Je to přesně to pravidlo, které tenhle
   repozitář používá uvnitř („kontrola, co se nedá provést, to musí
   říct nahlas"), jen o úroveň výš.

   CO SE MĚŘÍ, PRO KAŽDOU PLÁNOVANOU ÚLOHU V REPOZITÁŘI:
     1. je u GitHubu ve stavu `active` — ne vypnutá ručně ani pro
        nečinnost,
     2. její poslední běh není starší než DVOJNÁSOBEK její periody.
        Jeden vynechaný běh se promíjí (GitHub umí plán o desítky minut
        zdržet), dva už jsou nález.

   Seznam úloh se NEPÍŠE SEM, čte se z `.github/workflows/`. Nová
   plánovaná úloha je tím pokrytá v den, kdy vznikne.

   KDO HLÍDÁ HLÍDAČE. Tahle kontrola se sama ze své podstaty ověřit
   nemůže — proto běží ve DVOU úlohách s různou periodou (kontrola
   nasazení každých 6 h, cvičení sebeopravy denně). Když umře jedna,
   druhá to při svém běhu nahlásí, protože v seznamu je i ta mrtvá.
   Obě naráz už nikdo nepozná; to je napsané tady i v docs.
   ================================================================== */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ghx, REPO, TOKEN } from './github-api.mjs';

const KOREN = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const NASOBEK = 2;   // kolik period se promine, než je to nález

/* ---- čisté funkce: jdou změřit bez sítě ------------------------- */

/* Z cronu perioda v hodinách. Umí jen tvary, které v repozitáři
   doopravdy jsou — hádat u neznámého tvaru by bylo horší než přiznat,
   že se neví. */
export function periodaHodin(cron) {
  const d = String(cron || '').trim().split(/\s+/);
  if (d.length !== 5) return null;
  const [, hodina, den, mesic, denTydne] = d;
  if (den !== '*' || mesic !== '*') return null;
  const kazdychN = hodina.match(/^\*\/(\d+)$/);
  if (kazdychN && denTydne === '*') return Number(kazdychN[1]);
  if (/^\d+$/.test(hodina)) {
    if (denTydne === '*') return 24;
    if (/^\d(-\d)?$/.test(denTydne)) return 24 * 7;   // vybrané dny v týdnu
  }
  return null;
}

/* Verdikt o jedné úloze. Tři možné odpovědi, a „nevím" je jedna z nich. */
export function nalezUlohy({ jmeno, stav, vekHodin, perioda }) {
  if (stav && stav !== 'active') {
    return { vada: `${jmeno} je u GitHubu ve stavu „${stav}" — nehlídá tedy nic`
      + (stav === 'disabled_inactivity'
        ? ' (GitHub plán sám vypne po 60 dnech bez aktivity)' : '') };
  }
  if (perioda === null) return { nevim: `${jmeno}: neznámý tvar plánu, periodu neumím spočítat` };
  if (vekHodin === null) return { nevim: `${jmeno}: nepodařilo se zjistit, kdy běžela naposledy` };
  const strop = perioda * NASOBEK;
  if (vekHodin > strop) {
    return { vada: `${jmeno} neběžela ${vekHodin.toFixed(0)} h, a má každých ${perioda} h`
      + ` (strop ${strop} h) — plán tedy nejede, i když úloha vypnutá není` };
  }
  return { dobre: `${jmeno} jede (naposledy před ${vekHodin.toFixed(0)} h, má každých ${perioda} h)` };
}

/* Plánované úlohy ze souborů, ne ze seznamu v kódu. */
export function planovaneUlohy(adresar) {
  const ven = [];
  for (const f of readdirSync(adresar).sort()) {
    if (!/\.ya?ml$/.test(f)) continue;
    const t = readFileSync(path.join(adresar, f), 'utf8');
    if (!/^\s*schedule:/m.test(t)) continue;
    const crony = [...t.matchAll(/cron:\s*'([^']+)'/g)].map((m) => m[1]);
    /* Víc plánů v jedné úloze = platí ten NEJČASTĚJŠÍ, protože ten
       určuje, jak dlouho smí být ticho. */
    const periody = crony.map(periodaHodin).filter((p) => p !== null);
    ven.push({
      soubor: `.github/workflows/${f}`,
      crony,
      perioda: periody.length ? Math.min(...periody) : null,
    });
  }
  return ven;
}

/* ---- výkonná část ---------------------------------------------- */
if (import.meta.url === `file://${process.argv[1]}`) {
  const dobre = [], vady = [], nezmereno = [];
  const ulohy = planovaneUlohy(path.join(KOREN, '.github', 'workflows'));

  if (!ulohy.length) {
    vady.push('v repozitáři není ani jedna plánovaná úloha — buď zmizely, nebo se špatně čtou');
  }
  if (!REPO || !TOKEN) {
    nezmereno.push('není GITHUB_TOKEN ani GITHUB_REPOSITORY, takže se stav úloh u GitHubu nezjistil');
  } else {
    let seznam = null;
    try {
      const r = await ghx(`/repos/${REPO}/actions/workflows?per_page=100`);
      if (!r.ok) nezmereno.push(`seznam úloh se nestáhl — API vrátilo ${r.status}`);
      else seznam = (await r.json()).workflows || [];
    } catch (e) {
      nezmereno.push(`seznam úloh se nestáhl (${e.message})`);
    }
    if (seznam) {
      for (const u of ulohy) {
        const naGitHubu = seznam.find((w) => w.path === u.soubor);
        if (!naGitHubu) {
          nezmereno.push(`${u.soubor}: GitHub o téhle úloze neví (ještě se nenasadila?)`);
          continue;
        }
        let vekHodin = null;
        try {
          const rb = await ghx(`/repos/${REPO}/actions/workflows/${naGitHubu.id}/runs?per_page=1`);
          if (rb.ok) {
            const b = ((await rb.json()).workflow_runs || [])[0];
            const kdy = b && (b.updated_at || b.created_at);
            if (kdy) vekHodin = (Date.now() - Date.parse(kdy)) / 3600000;
          }
        } catch (e) { vekHodin = null; }
        const v = nalezUlohy({
          jmeno: naGitHubu.name || u.soubor, stav: naGitHubu.state,
          vekHodin, perioda: u.perioda,
        });
        if (v.vada) vady.push(v.vada);
        else if (v.nevim) nezmereno.push(v.nevim);
        else dobre.push(v.dobre);
      }
    }
  }

  const out = [`\nBĚŽÍ JEŠTĚ TI HLÍDAČI? — ${ulohy.length} plánovaných úloh`];
  for (const t of dobre) out.push('  ✓ ' + t);
  for (const t of nezmereno) out.push('  ? ' + t);
  for (const t of vady) out.push('  ✕ ' + t);
  /* Nezměřilo se nic = nález. Kontrola, která se nedá provést, to musí
     říct nahlas — jinak je z ní jen další ticho. */
  if (!dobre.length && !vady.length) {
    out.push('  ✕ nezměřilo se nic — a to není klid, jen ticho');
    vady.push('nezměřilo se nic');
  }
  out.push(`\n  ${dobre.length} jede, ${nezmereno.length} nezměřeno, ${vady.length} vad\n`);
  console.log(out.join('\n'));
  if (vady.length) {
    console.log('::error::Plánované úlohy: ' + vady.length + ' vad. ' + vady.join(' // '));
    process.exit(1);
  }
}
