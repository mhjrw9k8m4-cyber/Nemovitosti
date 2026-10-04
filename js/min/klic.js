(function (root) {
  'use strict';
  function pkey(d) {
    if (!d) return '';

    if (d.__pk) return d.__pk;
    var la = (typeof d.lat === 'number') ? d.lat.toFixed(3) : '';
    var ln = (typeof d.lng === 'number') ? d.lng.toFixed(3) : '';
    var k = [d.place || '', d.parcel || '', d.okres || '', la, ln].join('|');
    if (typeof d === 'object') {
      try { Object.defineProperty(d, '__pk', { value: k, enumerable: false, configurable: true }); }
      catch (e) {}
    }
    return k;
  }

  function pkeyLegacy(d) {
    return [(d && d.place) || '', (d && d.parcel) || '', (d && d.okres) || ''].join('|');
  }
  root.PKKlic = { pkey: pkey, pkeyLegacy: pkeyLegacy };
}(typeof window !== 'undefined' ? window : this));
