const Translator = (() => {
  let sozluk = null;

  function getIsOnline() { return navigator.onLine; }
  function isModelsReady() { return sozluk !== null; }

  async function loadSozluk() {
    if (sozluk) return sozluk;
    const res = await fetch('./ja_tr.json');
    sozluk = await res.json();
    return sozluk;
  }

  async function offlineTranslate(text, sourceLang) {
    if (sourceLang !== 'ja') return text;
    const dict = await loadSozluk();
    if (dict[text.trim()]) return dict[text.trim()];
    let result = text;
    const keys = Object.keys(dict).sort((a, b) => b.length - a.length);
    for (const key of keys) result = result.split(key).join(dict[key]);
    return result;
  }

  async function googleTranslate(text, sourceLang) {
    if (!text || !text.trim()) return text;
    const params = new URLSearchParams({ client: 'gtx', sl: sourceLang, tl: 'tr', dt: 't', q: text });
    const res = await fetch('https://translate.googleapis.com/translate_a/single?' + params);
    if (!res.ok) throw new Error('Çeviri hatası: ' + res.status);
    const data = await res.json();
    if (!data || !data[0]) return text;
    return data[0].filter(i => i && i[0]).map(i => i[0]).join('');
  }

  async function translate(text, sourceLang) {
    if (!text || !text.trim()) throw new Error('Metin boş.');
    if (!['en', 'ja'].includes(sourceLang)) throw new Error('Desteklenmeyen dil.');

    const sep = '\n|||SEP|||\n';
    const blocks = text.includes('|||SEP|||') ? text.split(sep) : text.split('\n');
    const useOffline = !navigator.onLine;
    const BATCH = 5;
    const results = new Array(blocks.length);

    for (let i = 0; i < blocks.length; i += BATCH) {
      const batch = blocks.slice(i, i + BATCH);
      const out = await Promise.all(batch.map(async b => {
        if (!b.trim()) return b;
        if (useOffline) return await offlineTranslate(b, sourceLang);
        return await googleTranslate(b, sourceLang);
      }));
      out.forEach((r, j) => { results[i + j] = r; });
      if (!useOffline && i + BATCH < blocks.length) await new Promise(r => setTimeout(r, 100));
    }

    return results.join(text.includes('|||SEP|||') ? sep : '\n');
  }

  async function checkModelExists() { return true; }
  async function preloadModel() { try { await loadSozluk(); } catch(e) {} }

  return { translate, getIsOnline, checkModelExists, preloadModel, isModelsReady };
})();
