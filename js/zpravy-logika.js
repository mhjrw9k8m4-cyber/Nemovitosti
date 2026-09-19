/* Logika schránky a konverzace — bez DOMu, ať se dá otestovat v Node.
 *
 * Co tu řeší:
 *   - kdo je ten druhý a o který pozemek jde (dřív byl v hlavičce jen
 *     nápis „Konverzace" a majitel se třemi zájemci o tentýž pozemek
 *     neměl šanci poznat, komu píše),
 *   - kdy se seznam zpráv vůbec musí překreslit (překreslování každých
 *     15 s trhalo obsah zpátky dolů, i když si člověk četl starší zprávu),
 *   - jak se z hlášky od databáze udělá věta pro člověka.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PKZpravy = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var MAX_ZPRAVA = 2000;          // musí sedět s mezí v send_message (SQL)

  // Zájemce se označí koncem jeho id. Není to jméno ani e-mail — ty se
  // navzájem nikdy neukazují — ale je to stálé, takže majitel dva různé
  // zájemce u téhož pozemku rozliší.
  function stitekZajemce(uuid) {
    var s = String(uuid || '').replace(/[^0-9a-f]/gi, '');
    if (s.length < 4) return 'Zájemce';
    return 'Zájemce ' + s.slice(-4).toUpperCase();
  }

  // Hlavička konverzace. info = řádek z my_threads (může chybět, když
  // vlákno ještě nemá jedinou zprávu), zaloha = údaje z adresy stránky.
  function popisVlakna(info, zaloha) {
    zaloha = zaloha || {};
    var obec = (info && info.place) || zaloha.place || '';
    var okres = (info && info.okres) || zaloha.okres || '';
    var jsemMajitel = info ? !!info.is_owner : !!zaloha.is_owner;
    var titulek = obec ? obec : 'Pozemek';
    if (okres) titulek += ' · okr. ' + okres;
    var podtitul = jsemMajitel
      ? stitekZajemce((info && info.buyer_id) || zaloha.buyer_id)
      : 'Majitel pozemku';
    return { titulek: titulek, podtitul: podtitul, jsemMajitel: jsemMajitel };
  }

  // Otisk seznamu zpráv. Když se nezměnil, nemá smysl sahat na stránku.
  function otiskZprav(rows) {
    if (!rows || !rows.length) return '0';
    var posl = rows[rows.length - 1];
    return rows.length + ':' + (posl && posl.id ? posl.id : '') + ':' + (posl && posl.created_at ? posl.created_at : '');
  }

  // Přibyla zpráva od protistrany? Podle toho se rozhodne, jestli sjet dolů.
  function prisloNoveOdDruheho(stare, nove) {
    var s = (stare || []).length, n = (nove || []).length;
    if (n <= s) return false;
    for (var i = s; i < n; i++) if (nove[i] && !nove[i].mine) return true;
    return false;
  }

  // Hlášky z databáze jsou stručné a technické. Tohle z nich udělá větu,
  // která člověku řekne, co má udělat.
  var PREKLAD = [
    [/chvíli počkejte/i, 'Moment — mezi zprávami nechte pár vteřin.'],
    [/příliš mnoho zpráv/i, 'Za poslední hodinu je to hodně zpráv. Zkuste to prosím za chvíli.'],
    [/zpráva je prázdná/i, 'Zpráva je prázdná.'],
    [/zpráva je příliš dlouhá/i, 'Zpráva je moc dlouhá — vejde se ' + MAX_ZPRAVA + ' znaků.'],
    [/musíte být přihlášeni/i, 'Přihlášení vypršelo. Přihlaste se prosím znovu.'],
    [/inzerát neexistuje/i, 'Tenhle inzerát už na Parcelce není.'],
    [/nemáte přístup k této konverzaci/i, 'K téhle konverzaci nemáte přístup.'],
    [/žádná zpráva není|komu odpovídáte/i, 'Tomuhle zájemci zatím nejde odpovědět — nenapsal vám.']
  ];
  function hlaskaChyby(err) {
    var t = '';
    if (typeof err === 'string') t = err;
    else if (err) t = err.message || err.hint || err.details || '';
    for (var i = 0; i < PREKLAD.length; i++) if (PREKLAD[i][0].test(t)) return PREKLAD[i][1];
    return 'Zprávu se nepovedlo odeslat. Zkuste to prosím znovu.';
  }

  // Počítadlo znaků se ukáže, až když se blíží mez — jinak jen překáží.
  function stavDelky(text) {
    var n = (text || '').length;
    var zbyva = MAX_ZPRAVA - n;
    return { delka: n, zbyva: zbyva, prilis: zbyva < 0, ukazat: zbyva <= 200 };
  }

  return {
    MAX_ZPRAVA: MAX_ZPRAVA,
    stitekZajemce: stitekZajemce,
    popisVlakna: popisVlakna,
    otiskZprav: otiskZprav,
    prisloNoveOdDruheho: prisloNoveOdDruheho,
    hlaskaChyby: hlaskaChyby,
    stavDelky: stavDelky
  };
});
