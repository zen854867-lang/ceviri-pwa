const Translator = (() => {
  let isOnline = navigator.onLine;
  window.addEventListener('online',  () => { isOnline = true; });
  window.addEventListener('offline', () => { isOnline = false; });
  function getIsOnline() { return isOnline; }

  async function apiTranslate(text, sourceLang) {
    if (!text || !text.trim()) return text;
    const res = await fetch('https://free-translate-api-o3p8.onrender.com/translate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text, to: 'tr', from: sourceLang })
    });
    if (!res.ok) throw new Error('Çeviri hatası: ' + res.status);
    const data = await res.json();
    return data.translatedText || text;
  }

  async function translateBlocks(blocks, sourceLang) {
    const results = new Array(blocks.length);
    const BATCH = 5;
    for (let i = 0; i < blocks.length; i += BATCH) {
      const batch = blocks.slice(i, i + BATCH);
      const out = await Promise.all(
        batch.map(b => b.trim() ? apiTranslate(b, sourceLang) : Promise.resolve(b))
      );
      out.forEach((r, j) => { results[i + j] = r; });
      if (i + BATCH < blocks.length) await new Promise(r => setTimeout(r, 100));
    }
    return results;
  }

  async function translate(text, sourceLang) {
    if (!text || !text.trim()) throw new Error('Metin boş.');
    if (!['en', 'ja'].includes(sourceLang)) throw new Error('Desteklenmeyen dil.');
    if (!isOnline) throw new Error('İnternet bağlantısı yok.');
    const sep = '\n|||SEP|||\n';
    const blocks = text.includes('|||SEP|||') ? text.split(sep) : text.split('\n');
    const translated = await translateBlocks(blocks, sourceLang);
    return translated.join(text.includes('|||SEP|||') ? sep : '\n');
  }

  async function checkModelExists() { return false; }
  return { translate, getIsOnline, checkModelExists };
})();