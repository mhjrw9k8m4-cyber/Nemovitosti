/* JEDNO MÍSTO, KTERÝM SE MLUVÍ S GITHUBEM
   ==================================================================
   Skripty, které se ptají GitHubu (stav robota, stav plánovaných úloh,
   vyvolání úlohy), potřebují tři stejné věci: adresu API, hlavičky
   s tokenem a časový limit. Dokud to měl každý u sebe, byla to kopie
   — a hlavně: ta pojistka na přesměrování by se musela hlídat
   v každé kopii zvlášť.

   PŘESMĚROVAT API LZE JEN NA TENHLE STROJ. Bez té pojistky by se dala
   proměnnou v prostředí odklonit hlavička s tokenem na cizí stroj.
   Existuje proto, aby se dalo postavit falešné API a změřit, že
   požadavky odcházejí správně — tedy aby ta jediná řádka, která něco
   doopravdy provede, nebyla jediná nevyzkoušená.
   ================================================================== */
export const API = (() => {
  const vlastni = (process.env.PK_GITHUB_API || '').trim().replace(/\/+$/, '');
  if (!vlastni) return 'https://api.github.com';
  if (!/^http:\/\/(127\.0\.0\.1|localhost):\d{2,5}$/.test(vlastni)) {
    console.log('::error::PK_GITHUB_API smí ukazovat jen na'
      + ` tenhle stroj (http://127.0.0.1:PORT), dostal jsem „${vlastni}".`
      + ' Jinak by se dala hlavička s tokenem odklonit jinam.');
    process.exit(1);
  }
  return vlastni;
})();

export const REPO = process.env.GITHUB_REPOSITORY || '';
export const TOKEN = process.env.GITHUB_TOKEN || '';
export const VETEV = process.env.GITHUB_REF_NAME || '';

export async function ghx(cesta, nastaveni = {}) {
  return fetch(`${API}${cesta}`, {
    ...nastaveni,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${TOKEN}`,
      'x-github-api-version': '2022-11-28',
      'user-agent': 'parcelaka-sebeoprava',
      ...(nastaveni.body ? { 'content-type': 'application/json' } : {}),
    },
    signal: AbortSignal.timeout(30000),
  });
}
