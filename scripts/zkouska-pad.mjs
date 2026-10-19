/* Když zkouška PADNE, ať to pořád něco řekne.
 * ====================================================================
 * Zkouška v prohlížeči se dá shodit dvěma způsoby. Buď kontrola
 * neprojde — a to je dobrý případ: vypíše se ✕ s větou, co je špatně.
 * Nebo se někde sáhne na prvek, který tam není: `page.evaluate` vrátí
 * „Cannot read properties of null" a playwrightovské klepnutí na
 * chybějící tlačítko čeká třicet sekund a pak vyhodí TimeoutError.
 * V tu chvíli se proces ukončí uprostřed a **všechny kontroly, které
 * do té doby prošly, se nevypíšou** — v CI zbyde jen stopa výjimky, ze
 * které není poznat, co je rozbité.
 *
 * Naměřeno 19. 10.: dvě sabotáže (přepínačům vrstev jsem odebral třídu
 * a klepnutí do mapy výběru jsem odpojil) shodily zkoušku přesně
 * takhle — návratový kód 1, a ani jedna ✕.
 *
 * Tohle to nespraví za zkoušku; chybějící prvek má pořád patřit do
 * pojmenované kontroly. Ale aspoň se u pádu vypíše, kam zkouška došla
 * a na čem skončila — tedy to, co v CI potřebuje člověk vidět.
 * ==================================================================== */

export function hlasPad(titulek, zpravy) {
  let uz = false;
  const vypis = (e) => {
    if (uz) return;            // druhá výjimka už jen zdvojuje výpis
    uz = true;
    const zpr = String((e && e.message) || e || '').split('\n')[0];
    /* Z hromady řádků stopy je užitečný ten, který ukazuje do zkoušky
       samotné — tedy kde se to stalo. */
    const kde = String((e && e.stack) || '').split('\n')
      .find((r) => /scripts\/test-[a-z0-9-]+\.mjs:\d+/.test(r)) || '';
    console.log('\n' + titulek + '  (PŘERUŠENO — zkouška spadla, nedoběhla)');
    console.log(zpravy.join('\n'));
    console.log(`\n${zpravy.filter((x) => x.includes('✓')).length} kontrol prošlo, než to spadlo`);
    console.log('::error::' + titulek + ': zkouška PADLA, ne neprošla — ' + zpr
      + (kde ? ' | ' + kde.trim() : '')
      + ' | chybějící prvek patří do pojmenované kontroly, ne do výjimky');
    process.exit(1);
  };
  process.on('uncaughtException', vypis);
  process.on('unhandledRejection', vypis);
}
