const Translator = (() => {
  let sozluk = null;
  let activeMode = 'groq'; // 'groq' veya 'google'

  const GROQ_KEY = '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';
  const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

  function getIsOnline() { return navigator.onLine; }
  function isModelsReady() { return sozluk !== null; }
  function getMode() { return activeMode; }
  function setMode(mode) { activeMode = mode; }

  async function loadSozluk() {
    if (sozluk) return sozluk;
    try {
      const res = await fetch('./ja_tr.json');
      sozluk = await res.json();
    } catch(e) { sozluk = {}; }
    return sozluk;
  }

  /* ---------- Sözlük ile ön işleme ---------- */
  async function applyDictionary(text, sourceLang) {
    if (sourceLang !== 'ja') return text;
    const dict = await loadSozluk();
    // Sadece tam cümle eşleşmesinde sözlüğü kullan
    if (dict[text.trim()]) return dict[text.trim()];
    return null; // eşleşme yok, AI'a gönder
  }

  /* ---------- Groq (LLaMA) ---------- */
  async function groqTranslate(text, sourceLang) {
    if (!text || !text.trim()) return text;
    const langName = sourceLang === 'ja' ? 'Japanese' : 'English';
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_KEY}`
      },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [
          {
            role: 'system',
            content: `You are an anime subtitle translator. Translate ${langName} to Turkish. Rules:
- Keep anime honorifics as is (senpai, kun, chan, sama, sensei etc.)
- Translate naturally, not word by word
- Keep sound effects in original (e.g. "ドン" stays as "ドン")
- Output ONLY the translation, nothing else
- Keep the same number of lines`
          },
          { role: 'user', content: text }
        ],
        temperature: 0.3,
        max_tokens: 1024
      })
    });
    if (!res.ok) throw new Error('Groq hatası: ' + res.status);
    const data = await res.json();
    return data.choices[0].message.content.trim();
  }

  /* ---------- Google Translate ---------- */
  async function googleTranslate(text, sourceLang) {
    if (!text || !text.trim()) return text;
    const params = new URLSearchParams({ client: 'gtx', sl: sourceLang, tl: 'tr', dt: 't', q: text });
    const res = await fetch('https://translate.googleapis.com/translate_a/single?' + params);
    if (!res.ok) throw new Error('Google hatası: ' + res.status);
    const data = await res.json();
    if (!data || !data[0]) return text;
    return data[0].filter(i => i && i[0]).map(i => i[0]).join('');
  }

  /* ---------- Offline sözlük ---------- */
  async function offlineTranslate(text, sourceLang) {
    if (sourceLang !== 'ja') return text;
    const dict = await loadSozluk();
    if (dict[text.trim()]) return dict[text.trim()];
    let result = text;
    const keys = Object.keys(dict).sort((a, b) => b.length - a.length);
    for (const key of keys) result = result.split(key).join(dict[key]);
    return result;
  }

  /* ---------- Ana çeviri ---------- */
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

      if (useOffline) {
        const out = await Promise.all(batch.map(b => b.trim() ? offlineTranslate(b, sourceLang) : Promise.resolve(b)));
        out.forEach((r, j) => { results[i + j] = r; });
        continue;
      }

      // Önce sözlükten tam eşleşme dene
      const dictResults = await Promise.all(batch.map(async b => {
        if (!b.trim()) return b;
        const dictMatch = await applyDictionary(b, sourceLang);
        return dictMatch;
      }));

      // Sözlükte bulunamayanları AI'a gönder
      const needsTranslation = batch.filter((b, j) => b.trim() && dictResults[j] === null);

      if (needsTranslation.length > 0) {
        const combined = needsTranslation.join('\n');
        let translated;
        try {
          if (activeMode === 'groq') {
            translated = await groqTranslate(combined, sourceLang);
          } else {
            translated = await googleTranslate(combined, sourceLang);
          }
        } catch(e) {
          // Groq başarısız → Google'a düş
          console.warn('Groq başarısız, Google deneniyor:', e.message);
          translated = await googleTranslate(combined, sourceLang);
        }
        const translatedLines = translated.split('\n');
        let li = 0;
        batch.forEach((b, j) => {
          if (!b.trim()) {
            results[i + j] = b;
          } else if (dictResults[j] !== null) {
            results[i + j] = dictResults[j];
          } else {
            results[i + j] = translatedLines[li++] || b;
          }
        });
      } else {
        batch.forEach((b, j) => { results[i + j] = dictResults[j] !== null ? dictResults[j] : b; });
      }

      if (i + BATCH < blocks.length) await new Promise(r => setTimeout(r, 50));
    }

    return results.join(text.includes('|||SEP|||') ? sep : '\n');
  }

  async function checkModelExists() { return true; }
  async function preloadModel() { try { await loadSozluk(); } catch(e) {} }

  return { translate, getIsOnline, checkModelExists, preloadModel, isModelsReady, getMode, setMode };
})();
