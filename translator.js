/* ============================================================
   Translator — Ana Çeviri Motoru
   JapaneseTokenizer'a bağımlıdır (global)
   ============================================================ */
const Translator = (() => {
  let dictMain = {};
  let activeMode = 'auto';
  let lastProvider = '-';
  const cache = new Map();
  
  const KEYS = {
    groq: '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',
    openai: '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',
    openrouter: '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'
  };
  
  const SYSTEM = (lang) => `You are a professional anime and manga translator. Translate ${lang} to natural, fluent Turkish as if you were a human translator.
- Keep honorifics: -san, -sama, -kun, -chan, -senpai, -sensei
- Keep sound effects (e.g. ドン, ガン) as is
- Match the tone: angry → sert, sad → duygulu, funny → esprili
- Translate meaning, not word-for-word
- Output ONLY the translated lines, same number as input.`;
  
  async function loadDict() {
    if (Object.keys(dictMain).length) return;
    try {
      const res = await fetch('./ja_tr.json');
      dictMain = await res.json();
      const trie = JapaneseTokenizer.buildTrie(dictMain);
      JapaneseTokenizer.setTrieRoot(trie);
      JapaneseTokenizer.buildKanjiList(dictMain);
    } catch(e) { 
      console.warn('Sözlük yüklenemedi, boş devam ediliyor.');
      dictMain = {}; 
    }
  }
  
  function postProcess(text) {
    if (!text) return text;
    let t = text;
    t = t.replace(/\b([A-ZÇĞİÖŞÜ]{2,})\b/g, w => w.charAt(0) + w.slice(1).toLowerCase());
    t = t.replace(/  +/g, ' ');
    t = t.split('\n').map(l => l.trim()).join('\n');
    t = t.replace(/\.\.\.\./g, '...').replace(/。。。/g, '...');
    t = t.replace(/\s+([.,!?;:])/g, '$1');
    t = t.replace(/([.,!?;:])([^\s"'])/g, '$1 $2');
    return t.trim();
  }
  
  async function callAPI(url, key, model, system, userMsg) {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), 15000);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({ model, messages: [{ role: 'system', content: system }, { role: 'user', content: userMsg }], temperature: 0.15 }),
        signal: ctrl.signal
      });
      clearTimeout(id);
      if (!res.ok) throw new Error(res.status);
      const data = await res.json();
      return data.choices[0].message.content.trim();
    } catch(e) {
      clearTimeout(id);
      throw e;
    }
  }
  
  async function googleTranslate(text, lang) {
    const p = new URLSearchParams({ client: 'gtx', sl: lang, tl: 'tr', dt: 't', q: text });
    const res = await fetch('https://translate.googleapis.com/translate_a/single?' + p);
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    return data[0].filter(i => i && i[0]).map(i => i[0]).join('');
  }
  
  const aiProviders = [
    { name: 'Groq', call: (s, m) => callAPI('https://api.groq.com/openai/v1/chat/completions', KEYS.groq, 'llama-3.3-70b-versatile', s, m) },
    { name: 'OpenRouter', call: (s, m) => callAPI('https://openrouter.ai/api/v1/chat/completions', KEYS.openrouter, 'meta-llama/llama-3.3-70b-instruct:free', s, m) },
    { name: 'GPT-4o-mini', call: (s, m) => callAPI('https://api.openai.com/v1/chat/completions', KEYS.openai, 'gpt-4o-mini', s, m) }
  ];
  
  async function translateOfflineEntry(text, lang) {
    if (lang !== 'ja') return postProcess(text);
    await loadDict();
    return postProcess(JapaneseTokenizer.translateWithDict(text, dictMain));
  }
  
  async function translateBatch(lines, lang) {
    const system = SYSTEM(lang === 'ja' ? 'Japanese' : 'English');
    const numbered = lines.map((l, i) => `${i+1}. ${l}`).join('\n');
    const prompt = `Translate these ${lines.length} lines to Turkish:\n${numbered}`;
    if (activeMode === 'google') {
      const out = await Promise.all(lines.map(l => l.trim() ? googleTranslate(l, lang) : Promise.resolve(l)));
      return out.map(postProcess);
    }
    for (const p of aiProviders) {
      try {
        const raw = await p.call(system, prompt);
        lastProvider = p.name;
        const parsed = raw.split('\n').map(l => l.replace(/^\d+\.\s*/, '').trim()).filter(l => l);
        if (parsed.length >= lines.length * 0.8) {
          return lines.map((orig, i) => postProcess(parsed[i] || orig));
        }
      } catch(e) { console.warn(p.name, e); }
    }
    lastProvider = 'Google';
    const out = await Promise.all(lines.map(l => l.trim() ? googleTranslate(l, lang) : Promise.resolve(l)));
    return out.map(postProcess);
  }
  
  async function translate(text, lang) {
    if (!text?.trim()) throw new Error('Boş metin');
    if (!['en','ja'].includes(lang)) throw new Error('Desteklenmeyen dil');
    const isSRT = text.includes('|||SEP|||');
    const blocks = isSRT ? text.split('\n|||SEP|||\n') : text.split('\n');
    const useOffline = !navigator.onLine || activeMode === 'offline';
    if (useOffline) {
      lastProvider = '📴 Offline';
      const res = await Promise.all(blocks.map(b => b.trim() ? translateOfflineEntry(b, lang) : Promise.resolve(b)));
      return res.join(isSRT ? '\n|||SEP|||\n' : '\n');
    }
    const cacheKey = `${lang}:${text.substring(0,200)}`;
    if (cache.has(cacheKey)) { lastProvider = '⚡ Cache'; return cache.get(cacheKey); }
    if (!isSRT && blocks.length === 1) {
      await loadDict();
      const exact = JapaneseTokenizer.translateWithDict(text, dictMain);
      if (exact && exact !== text) {
        const result = postProcess(exact);
        lastProvider = '📖 Sözlük';
        cache.set(cacheKey, result);
        return result;
      }
    }
    const BATCH = 6;
    const results = new Array(blocks.length);
    for (let i = 0; i < blocks.length; i += BATCH) {
      const batch = blocks.slice(i, i + BATCH).filter(b => b.trim());
      if (!batch.length) continue;
      const translated = await translateBatch(batch, lang);
      batch.forEach((_, idx) => { results[i + idx] = translated[idx] || batch[idx]; });
      if (i + BATCH < blocks.length) await new Promise(r => setTimeout(r, 100));
    }
    const final = results.join(isSRT ? '\n|||SEP|||\n' : '\n');
    cache.set(cacheKey, final);
    return final;
  }
  
  return {
    translate,
    getIsOnline: () => navigator.onLine,
    isModelsReady: () => Object.keys(dictMain).length > 0,
    getMode: () => activeMode,
    setMode: (m) => { activeMode = m; },
    getLastProvider: () => lastProvider,
    preloadModel: loadDict
  };
})();
