(function (root) {
  'use strict';

  function tokenBarva(nazev, zaloha) {
    try {
      var v = getComputedStyle(document.documentElement).getPropertyValue(nazev).trim();
      return v || zaloha;
    } catch (e) { return zaloha; }
  }

  var TYPY = {
    sale:    { label: 'Na prodej',    color: tokenBarva('--c-sale', '#4361B8'), ink: tokenBarva('--c-sale-ink', '#364E95'), link: { label: 'Nabídka SPÚ',          url: 'https://spu.gov.cz/nabidky' } },
    drazba:  { label: 'Dražba',       color: tokenBarva('--c-drazba', '#CC6B33'), ink: tokenBarva('--c-drazba-ink', '#7E3C18'), link: { label: 'Dražební portál',     url: 'https://www.portaldrazeb.cz/' } },
    exekuce: { label: 'Exekuce',      color: tokenBarva('--c-exekuce', '#8C2F1E'), ink: tokenBarva('--c-exekuce-ink', '#8C2F1E'), link: { label: 'Ověřit v katastru', url: 'https://www.ikatastr.cz/' } },
    obec:    { label: 'Obecní záměr', zkratka: 'Záměr obce', color: tokenBarva('--c-obec', '#12AEBE'), ink: tokenBarva('--c-obec-ink', '#0A626B'), link: { label: 'Úřední deska obce',    url: 'https://www.uredni-deska.cz/' } },
    majitel: { label: 'Přímo od majitele', zkratka: 'Od majitele', color: tokenBarva('--c-majitel', '#8B4FE0'), ink: tokenBarva('--c-majitel-ink', '#6E3EB1'), link: { label: 'Ověřit v katastru',    url: 'https://www.ikatastr.cz/' } }
  };

  function esc(x) {
    var C = root.PKCisteni;
    if (C && C.esc) return C.esc(x);
    return String(x == null ? '' : x)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function sazba(x) {
    var C = root.PKCisteni;
    return (C && C.sazba) ? C.sazba(x) : x;
  }

  function fmt(n) {
    return String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  }
  function maVymeru(d) { return typeof d.area === 'number' && d.area > 0; }

  var IKONA_FOTEK = '<svg class="ik" viewBox="0 0 24 24" aria-hidden="true"><use href="#i-fotky"/></svg>';

  function odznakDruhu(d) {
    var t = TYPY[d.type] || {};
    return '<span class="opp-badge ' + esc(d.type) + '" style="--c-druh:' + (t.color || '') + '">' +
      esc(t.label || '') + '</span>';
  }

  function nahled(d) {
    var t = TYPY[d.type] || {};
    var F = root.PK_FOTKA;
    var zInzeratu = (F && F.url) ? F.url(d) : null;
    var fotky = (d.photos && d.photos.length) ? d.photos : (zInzeratu ? [zInzeratu] : []);
    if (fotky.length) {
      var cnt = fotky.length > 1
        ? '<span class="opp-count">' + IKONA_FOTEK + fotky.length + '</span>' : '';

      return '<svg class="opp-map" data-sn="ceka" viewBox="0 0 384 240" preserveAspectRatio="xMidYMid slice" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" aria-hidden="true">' +
        '<rect class="opp-map-pod" width="384" height="240"/>' +
        '<image data-href="' + esc(fotky[0]) + '" x="0" y="0" width="384" height="240" preserveAspectRatio="xMidYMid slice"/>' +
        '</svg>' +
        '<span class="opp-mgrad"></span>' + odznakDruhu(d) + cnt;
    }
    var S = root.PK_SNIMEK;
    if (!S || !S.html) return '<span class="opp-mgrad"></span>' + odznakDruhu(d);
    return S.html(d, { sirka: 384, vyska: 240, barva: t.color, id: 'ts' + (d._id != null ? d._id : '') }) +
      '<span class="opp-mgrad"></span>' + odznakDruhu(d);
  }

  function zaMetr(d) {
    var C = root.PK_CENY;
    return (C && C.zaMetr) ? C.zaMetr(d) : null;
  }
  function zaMetrTitul(d) {
    var C = root.PK_CENY;
    var t = (C && C.zaMetrPopis) ? C.zaMetrPopis(d) : '';
    return t ? ' title="' + String(t).replace(/"/g, '&quot;') + '"' : '';
  }

  function mistoRadek(d) {
    var okr = d.okres ? 'okres ' + esc(d.okres) : '';
    if (d.cast) return esc(d.cast) + (okr ? ' · ' + okr : '');
    if (d.place && d.okres && String(d.place).trim() === String(d.okres).trim()) return '';
    return okr;
  }

  function nadpis(d) {
    var K = root.PKKategorie;
    var z = (K && K.nadpisKategorie) ? K.nadpisKategorie(d) : null;
    if (!z && d.druh) z = String(d.druh).charAt(0).toUpperCase() + String(d.druh).slice(1);
    var C = root.PKCisteni;
    var h = (C && C.hlavaNabidky) ? C.hlavaNabidky(z || 'Pozemek', d.type) : (z || 'Pozemek');
    return sazba(esc(h));
  }

  function telo(d, pod) {
    var perM2 = zaMetr(d);
    var misto = mistoRadek(d);
    return '<div class="opp-body">' +
        '<div class="opp-nadpis">' +
          '<b class="opp-druh">' + nadpis(d) + '</b>' +
          (maVymeru(d) ? '<span class="opp-figures"><span class="m">' + fmt(d.area) + ' m²</span></span>' : '') +
        '</div>' +
        '<div class="opp-meta">' +
          '<span class="opp-place">' + sazba(esc(d.place)) + '</span>' +

          (misto ? ' <span class="opp-loc">' + misto + '</span>' : '') +
        '</div>' +
        '<div class="opp-cenarad">' +
          '<div class="opp-price">' + fmt(d.price) + ' Kč</div>' +
          (perM2 ? '<span class="opp-perm2"' + zaMetrTitul(d) + '>' + fmt(perM2) + ' Kč/m²</span>' : '') +
        '</div>' +
        (pod || '') +
      '</div>';
  }

  function vnitrek(d, pod) {
    return '<div class="opp-media">' + nahled(d) + '</div>' + telo(d, pod);
  }

  root.PKKarta = {
    TYPY: TYPY,
    odznakDruhu: odznakDruhu,
    nahled: nahled,
    telo: telo,
    vnitrek: vnitrek,
    mistoRadek: mistoRadek,
    nadpis: nadpis,
    fmt: fmt
  };
}(window));
