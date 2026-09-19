/* Zatřídění 1000 tříd modelu do skupin — jeden znak na třídu:
     V = venku (mluví PRO fotku pozemku)
     N = jídlo, obaly, obrazovky, nábytek, oblečení, nářadí (mluví PROTI)
     . = zvířata, vozidla, budovy, sport a ostatní (neříká nic)

   NEUPRAVUJ RUČNĚ — vzniká příkazem:  node scripts/build-skupiny.mjs
   Kontrolní výpis skupin:             node scripts/build-skupiny.mjs --vypis */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PKSkupiny = api;
})(typeof self !== 'undefined' ? self : this, function () {
  return '..............................................................................................................................................................................................................................................................................................................................................................................................................NNN........N....NN..NN...N.V..V....NNN.V..NNV..NN.VV...N.N.N.N.......N.NN..NN...N..NNV.N.N.V.N.N.NNV..V.NN.N..NN..N.N.....N....VNN.NNNN.N.V..N....NN..NNNN.N...V.N...NN..NN...N.......V.N..N.NN.NNN..VN.N..N..NN..N.N..NN..NNNNV.N.....NN.NN..N.NN......VNNVNNNN.N...NV.NVN..N.N..VNN....NNNV...N..N..N....NV.N..V.....NNN.NN.V.V.NN...NN.NNV....N.NV.N.N..N..N.N.NNN.....NN...NNN.NN.NNNN..N...N.N....NNN.NN...N.....N.N..N.N.N....N..V.N.VNNN..NV.NVNN.V.NNVNNN.NN.N...NVN.N.NNV..V.NN...V....N...N.....V..NNNN.NNN.VN.NNNNN.N..V..VNNN..NNNNNNNNNNNNNNN.....N................VNNNNNNNNNNNV.VVVVVVVVV...VVVVVVVVVVVVVVVN';
});
