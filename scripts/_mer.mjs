/* Jednorázové měření: jak se liší ovládací prvky na úvodu (panel filtrů),
   hlídání a přidávání inzerátu. Není to hlídač, jen měřidlo pro rozhodnutí. */
import { chromium } from 'playwright-core';
const { BASE } = await import('./falesna-supabase-chat.mjs');
const prohlizec = await chromium.launch({ args: ['--no-sandbox'],
  executablePath: process.env.PW_CHROMIUM });
const ctx = await prohlizec.newContext({ bypassCSP: true, serviceWorkers: 'block',
  viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'cs-CZ' });
await ctx.route('**/*', (r) => {
  const u = new URL(r.request().url());
  return (u.hostname === '127.0.0.1' || u.hostname === 'localhost') ? r.continue() : r.abort();
});
const styl = (el) => {
  if (!el) return null;
  const s = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  return { fs: s.fontSize, fw: s.fontWeight, ff: s.fontFamily.split(',')[0],
    tt: s.textTransform, barva: s.color, pozadi: s.backgroundColor,
    ram: s.borderTopWidth + ' ' + s.borderTopColor, r: s.borderTopLeftRadius,
    pad: s.paddingTop + '/' + s.paddingLeft, v: Math.round(r.height) };
};
async function zmer(url, mapa, pred) {
  const p = await ctx.newPage();
  console.log('otvírám', url);
  await p.goto(BASE + url, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch((e) => console.log('  goto:', e.message));
  await p.waitForTimeout(1200);
  if (pred) { try { await pred(p); } catch (e) { console.log('  (příprava:', e.message, ')'); } }
  await p.waitForTimeout(900);
  const v = await p.evaluate(({ mapa, stylSrc }) => {
    const styl = eval('(' + stylSrc + ')');
    const out = {};
    for (const [jmeno, sel] of Object.entries(mapa)) out[jmeno] = styl(document.querySelector(sel));
    return out;
  }, { mapa, stylSrc: styl.toString() });
  await p.close();
  return v;
}
const panel = await zmer('/index.html', {
  'název oddílu': '.mc-prilezitosti .mc-cap',
  'popisek pole': '.mc-hodnoty .mc-rozsah > .mc-cap',
  'číselné pole': '#map-cena-od',
  'rozbalovátko': '#map-perm2',
  'dlaždice': '.mc-toggles .mc-prep',
}, async (p) => {
  await p.evaluate(() => { const d = document.getElementById('ms-filters'); if (d) d.open = true; });
});
const hlid = await zmer('/hlidani.html', {
  'název oddílu': '.hl-sekce-h b',
  'popisek pole': '.hl-lbl',
  'číselné pole': '#ns-cena-od, .hl-in',
  'rozbalovátko': '.hl-sel:not(.hl-skryty-sel)',
  'dlaždice': '.hl-dlazdice-b',
  'pilulka': '.hl-prep',
});
const pridat = await zmer('/pridat.html', {
  'název oddílu': '.add-sekce-cap',
  'popisek pole': '.add-field label',
  'číselné pole': '.add-form input',
  'rozbalovátko': '.add-form select',
});
await prohlizec.close();
const klice = ['název oddílu', 'popisek pole', 'číselné pole', 'rozbalovátko', 'dlaždice', 'pilulka'];
for (const k of klice) {
  console.log('\n== ' + k);
  for (const [jm, v] of [['úvod/panel', panel[k]], ['hlídání', hlid[k]], ['přidat', pridat[k]]]) {
    console.log('   ' + jm.padEnd(12) + (v ? JSON.stringify(v) : '—'));
  }
}
