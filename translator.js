const Translator = (() => {
  let isOnline = navigator.onLine;
  window.addEventListener('online',  () => { isOnline = true; });
  window.addEventListener('offline', () => { isOnline = false; });
  function getIsOnline() { return isOnline; }

  async function googleTranslate(text, sourceLang) {
    if (!text || !text.trim()) return '';
    const params = new URLSearchParams({
      client: 'gtx',
      sl: sourceLang,
      tl: 'tr',
      dt: 't',
      q: text
    });
    const res = await fetch('https://translate.googleapis.com/translate_a/single?' + params);
    if (!res.ok) throw new Error('Çeviri hatası: ' + res.status);
    const data = await res.json();
    if (!data || !data[0]) throw new Error('Geçersiz yanıt.');
    return data[0].filter(i => i && i[0]).map(i => i[0]).join('');
  }

  async function translateLong(text, sourceLang) {
    const MAX = 4500;
    if (text.length <= MAX) return await googleTranslate(text, sourceLang);

    const sep = text.includes('\n|||SEP|||\n') ? '\n|||SEP|||\n' : '\n';
    const lines = text.split(sep);
    const chunks = [];
    let cur = '';
    for (const line of lines) {
      const c = cur ? cur + sep + line : line;
      if (c.length > MAX && cur) { chunks.push(cur); cur = line; }
      else cur = c;
    }
    if (cur) chunks.push(cur);

    // 3'erli paralel istek
    const results = [];
    for (let i = 0; i < chunks.length; i += 3) {
      const batch = chunks.slice(i, i + 3);
      const out = await Promise.all(batch.map(c => googleTranslate(c, sourceLang)));
      results.push(...out);
      if (i + 3 < chunks.length) await new Promise(r => setTimeout(r, 150));
    }
    return results.join(sep);
  }

  async function translate(text, sourceLang) {
    if (!text || !text.trim()) throw new Error('Metin boş.');
    if (!['en', 'ja'].includes(sourceLang)) throw new Error('Desteklenmeyen dil.');
    if (!isOnline) throw new Error('İnternet bağlantısı yok.');
    return await translateLong(text, sourceLang);
  }

  async function checkModelExists() { return false; }
  return { translate, getIsOnline, checkModelExists };
})();