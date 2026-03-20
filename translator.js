const Translator = (() => {
  let sozluk = null;
  let activeMode = 'auto';
  let lastProvider = '-';
  const cache = new Map();

  const KEYS = {
    groq:       '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',
    openai:     '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',
    openrouter: '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'
  };

  const SYSTEM_PROMPT = (lang) =>
    `You are an anime subtitle translator. Translate ${lang} to Turkish.
Rules:
- Keep honorifics as is: senpai, kun, chan, sama, sensei, dono
- Translate naturally, not word by word
- Keep sound effects in original form
- Output ONLY the translation, nothing else
- Keep the exact same number of lines`;

  function getIsOnline()     { return navigator.onLine; }
  function isModelsReady()   { return sozluk !== null; }
  function getMode()         { return activeMode; }
  function setMode(mode)     { activeMode = mode; }
  function getLastProvider() { return lastProvider; }

  /* ---------- Cache ---------- */
  function getCached(text, lang) { return cache.get(`${lang}:${text}`); }
  function setCached(text, lang, result) {
    if (cache.size > 500) cache.delete(cache.keys().next().value);
    cache.set(`${lang}:${text}`, result);
  }

  /* ---------- Sözlük ---------- */
  async function loadSozluk() {
    if (sozluk) return sozluk;
    try { const r = await fetch('./ja_tr.json'); sozluk = await r.json(); }
    catch(e) { sozluk = {}; }
    return sozluk;
  }

  async function dictLookup(text, lang) {
    if (lang !== 'ja') return null;
    const d = await loadSozluk();
    return d[text.trim()] || null;
  }

  /* ---------- Providerlar ---------- */
  async function callAPI(url, headers, body) {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    return data.choices[0].message.content.trim();
  }

  const providers = [
    {
      name: 'Groq (LLaMA)',
      fn: (text, lang) => callAPI(
        'https://api.groq.com/openai/v1/chat/completions',
        { 'Authorization': `Bearer ${KEYS.groq}` },
        { model: 'llama-3.1-8b-instant', temperature: 0.2, max_tokens: 1024,
          messages: [{ role: 'system', content: SYSTEM_PROMPT(lang === 'ja' ? 'Japanese' : 'English') }, { role: 'user', content: text }] }
      )
    },
    {
      name: 'GPT-4o-mini',
      fn: (text, lang) => callAPI(
        'https://api.openai.com/v1/chat/completions',
        { 'Authorization': `Bearer ${KEYS.openai}` },
        { model: 'gpt-4o-mini', temperature: 0.2, max_tokens: 1024,
          messages: [{ role: 'system', content: SYSTEM_PROMPT(lang === 'ja' ? 'Japanese' : 'English') }, { role: 'user', content: text }] }
      )
    },
    {
      name: 'OpenRouter',
      fn: (text, lang) => callAPI(
        'https://openrouter.ai/api/v1/chat/completions',
        { 'Authorization': `Bearer ${KEYS.openrouter}` },
        { model: 'meta-llama/llama-3.1-8b-instruct:free', temperature: 0.2, max_tokens: 1024,
          messages: [{ role: 'system', content: SYSTEM_PROMPT(lang === 'ja' ? 'Japanese' : 'English') }, { role: 'user', content: text }] }
      )
    },
    {
      name: 'Google',
      fn: async (text, lang) => {
        const params = new URLSearchParams({ client: 'gtx', sl: lang, tl: 'tr', dt: 't', q: text });
        const res = await fetch('https://translate.googleapis.com/translate_a/single?' + params);
        if (!res.ok) throw new Error(res.status);
        const data = await res.json();
        return data[0].filter(i => i && i[0]).map(i => i[0]).join('');
      }
    }
  ];

  /* ---------- Offline ---------- */
  async function offlineTranslate(text, lang) {
    if (lang !== 'ja') return text;
    const d = await loadSozluk();
    if (d[text.trim()]) return d[text.trim()];
    let r = text;
    Object.keys(d).sort((a, b) => b.length - a.length).forEach(k => { r = r.split(k).join(d[k]); });
    return r;
  }

  /* ---------- Akıllı çeviri ---------- */
  async function smartTranslate(text, lang) {
    if (!text || !text.trim()) return text;

    const cached = getCached(text, lang);
    if (cached) { lastProvider = '⚡ Cache'; return cached; }

    const dictMatch = await dictLookup(text, lang);
    if (dictMatch) { lastProvider = '📖 Sözlük'; setCached(text, lang, dictMatch); return dictMatch; }

    if (!navigator.onLine) {
      lastProvider = '📴 Offline';
      const r = await offlineTranslate(text, lang);
      setCached(text, lang, r);
      return r;
    }

    const list = activeMode === 'google'
      ? [providers[3]]
      : providers;

    for (const p of list) {
      try {
        const r = await p.fn(text, lang);
        lastProvider = p.name;
        setCached(text, lang, r);
        return r;
      } catch(e) {
        console.warn(p.name + ' başarısız:', e.message);
      }
    }

    lastProvider = 'Başarısız';
    return text;
  }

  /* ---------- Ana çeviri ---------- */
  async function translate(text, lang) {
    if (!text || !text.trim()) throw new Error('Metin boş.');
    if (!['en', 'ja'].includes(lang)) throw new Error('Desteklenmeyen dil.');

    const sep = '\n|||SEP|||\n';
    const isSRT = text.includes('|||SEP|||');
    const blocks = isSRT ? text.split(sep) : text.split('\n');
    const BATCH = navigator.onLine ? 5 : 1;
    const results = new Array(blocks.length);

    for (let i = 0; i < blocks.length; i += BATCH) {
      const batch = blocks.slice(i, i + BATCH);
      const nonEmpty = batch.filter(b => b.trim());
      if (!nonEmpty.length) { batch.forEach((b, j) => { results[i + j] = b; }); continue; }

      const combined = nonEmpty.join('\n');
      const translated = await smartTranslate(combined, lang);
      const lines = translated.split('\n');
      let li = 0;
      batch.forEach((b, j) => { results[i + j] = b.trim() ? (lines[li++] || b) : b; });

      if (i + BATCH < blocks.length) await new Promise(r => setTimeout(r, 50));
    }

    return results.join(isSRT ? sep : '\n');
  }

  async function checkModelExists() { return true; }
  async function preloadModel() { try { await loadSozluk(); } catch(e) {} }

  return { translate, getIsOnline, checkModelExists, preloadModel, isModelsReady, getMode, setMode, getLastProvider };
})();
