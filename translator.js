const Translator = (() => {
  let sozluk = null;

  function getIsOnline() {
    return navigator.onLine;
  }

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
    for (const key of keys) {
      result = result.split(key).join(dict[key]);
    }
    return result;
  }

  async function googleTranslate(text, sourceLang) {
    if (!text || !text.trim()) return text;
    const params = new URLSearchParams({
      client: 'gtx', sl: sourceLang, tl: 'tr', dt: 't', q: text
    });
    const res = await fetch('https://translate.googleapis.com/translate_a/single?' + params);
    if (!res.ok) throw new Error('Ceviri hatasi: ' + res.status);
    const data = await res.json();
    if (!data || !data[0]) return text;
    return data[0].filter(i => i && i[0]).map(i => i[0]).join('');
  }

  async function translateBlocks(blocks, sourceLang, useOffline) {
    const results = new Array(blocks.length);
    const BATCH = useOffline ? 1 : 5;
    for (let i = 0; i < blocks.length; i += BATCH) {
      const batch = blocks.slice(i, i + BATCH);
      const out = await Promise.all(batch.map(async b => {
        if (!b.trim()) return b;
        if (useOffline) return await offlineTranslate(b, sourceLang);
        return await googleTranslate(b, sourceLang);
      }));
      out.forEach((r, j) => { results[i + j] = r; });
      if (i + BATCH < blocks.length && !useOffline) {
        await new Promise(r => setTimeout(r, 100));
      }
    }
    return results;
  }

  async function translate(text, sourceLang) {
    if (!text || !text.trim()) throw new Error('Metin bos.');
    if (!['en', 'ja'].includes(sourceLang)) throw new Error('Desteklenmeyen dil.');
    const useOffline = !navigator.onLine;
    const sep = '\n|||SEP|||\n';
    const blocks = text.includes('|||SEP|||') ? text.split(sep) : text.split('\n');
    const translated = await translateBlocks(blocks, sourceLang, useOffline);
    return translated.join(text.includes('|||SEP|||') ? sep : '\n');
  }

  function isModelsReady() { return true; }
  async function checkModelExists() { return true; }
  async function preloadModel() {
    try { await loadSozluk(); } catch(e) {}
  }

  return { translate, getIsOnline, checkModelExists, preloadModel, isModelsReady };
})();
