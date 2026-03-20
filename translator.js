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

  const SYSTEM = (lang) => `You are a professional anime subtitle translator. Translate ${lang} to natural Turkish.
Rules:
- Keep honorifics: senpai, kun, chan, sama, sensei, dono, san
- Translate naturally and in context, not word by word
- Keep sound effects as is (e.g. ドン, ガン)
- Match the tone: angry=sert, sad=duygusal, funny=eğlenceli
- Output ONLY translations, one per line, same count as input`;

  function getIsOnline()     { return navigator.onLine; }
  function isModelsReady()   { return sozluk !== null; }
  function getMode()         { return activeMode; }
  function setMode(mode)     { activeMode = mode; }
  function getLastProvider() { return lastProvider; }

  /* ---------- Cache ---------- */
  function getCached(key) { return cache.get(key); }
  function setCached(key, val) {
    if (cache.size > 1000) cache.delete(cache.keys().next().value);
    cache.set(key, val);
  }

  /* ---------- Sözlük ---------- */
  async function loadSozluk() {
    if (sozluk) return sozluk;
    try {
      const r = await fetch('./ja_tr.json');
      sozluk = await r.json();
    } catch(e) { sozluk = {}; }
    return sozluk;
  }

  async function dictExact(text) {
    const d = await loadSozluk();
    return d[text.trim()] || null;
  }

  /* ---------- API çağrısı ---------- */
  async function callAPI(url, key, model, system, userMsg) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userMsg }
        ],
        temperature: 0.2,
        max_tokens: 2048
      })
    });
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    return data.choices[0].message.content.trim();
  }

  /* ---------- AI Providerlar ---------- */
  const aiProviders = [
    {
      name: 'Groq',
      call: (sys, msg) => callAPI('https://api.groq.com/openai/v1/chat/completions', KEYS.groq, 'llama-3.1-8b-instant', sys, msg)
    },
    {
      name: 'GPT-4o-mini',
      call: (sys, msg) => callAPI('https://api.openai.com/v1/chat/completions', KEYS.openai, 'gpt-4o-mini', sys, msg)
    },
    {
      name: 'OpenRouter',
      call: (sys, msg) => callAPI('https://openrouter.ai/api/v1/chat/completions', KEYS.openrouter, 'meta-llama/llama-3.1-8b-instruct:free', sys, msg)
    }
  ];

  /* ---------- Google Translate ---------- */
  async function googleTranslate(text, lang) {
    const params = new URLSearchParams({ client: 'gtx', sl: lang, tl: 'tr', dt: 't', q: text });
    const res = await fetch('https://translate.googleapis.com/translate_a/single?' + params);
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    return data[0].filter(i => i && i[0]).map(i => i[0]).join('');
  }

  /* ---------- Offline sözlük ---------- */
  async function offlineTranslate(text, lang) {
    if (lang !== 'ja') return text;
    const d = await loadSozluk();
    // Sadece tam eşleşme — bozuk çeviri olmasın
    return d[text.trim()] || text;
  }

  /* ---------- Bağlamlı AI çevirisi (SRT için) ---------- */
  async function translateBatch(lines, lang) {
    const langName = lang === 'ja' ? 'Japanese' : 'English';
    const system = SYSTEM(langName);
    const numbered = lines.map((l, i) => `${i + 1}. ${l}`).join('\n');
    const prompt = `Translate these ${lines.length} subtitle lines to Turkish. Output exactly ${lines.length} lines, numbered:\n\n${numbered}`;

    let result = null;

    if (activeMode === 'google') {
      // Google modunda her satırı ayrı gönder
      const out = await Promise.all(lines.map(l => l.trim() ? googleTranslate(l, lang) : Promise.resolve(l)));
      return out;
    }

    // AI modunda: Groq → GPT → OpenRouter → Google
    for (const p of aiProviders) {
      try {
        const raw = await p.call(system, prompt);
        lastProvider = p.name;
        // Numaralı satırları parse et
        const parsed = raw.split('\n')
          .map(l => l.replace(/^\d+\.\s*/, '').trim())
          .filter(l => l.length > 0);
        if (parsed.length >= lines.length * 0.8) {
          // Yeterli satır döndüyse kullan
          const out = lines.map((_, i) => parsed[i] || lines[i]);
          return out;
        }
        result = parsed;
        break;
      } catch(e) {
        console.warn(p.name + ' başarısız:', e.message);
      }
    }

    // AI başarısız → Google'a düş
    if (!result) {
      lastProvider = 'Google';
      const out = await Promise.all(lines.map(l => l.trim() ? googleTranslate(l, lang) : Promise.resolve(l)));
      return out;
    }

    return lines.map((_, i) => result[i] || lines[i]);
  }

  /* ---------- Ana çeviri ---------- */
  async function translate(text, lang) {
    if (!text || !text.trim()) throw new Error('Metin boş.');
    if (!['en', 'ja'].includes(lang)) throw new Error('Desteklenmeyen dil.');

    const sep = '\n|||SEP|||\n';
    const isSRT = text.includes('|||SEP|||');
    const blocks = isSRT ? text.split(sep) : text.split('\n');
    const useOffline = !navigator.onLine;

    // Offline mod
    if (useOffline) {
      lastProvider = 'Offline Sözlük';
      const results = await Promise.all(blocks.map(b => b.trim() ? offlineTranslate(b, lang) : Promise.resolve(b)));
      return results.join(isSRT ? sep : '\n');
    }

    // Cache kontrolü (tüm metin için)
    const cacheKey = `${lang}:${text.substring(0, 100)}`;
    const cached = getCached(cacheKey);
    if (cached) { lastProvider = '⚡ Cache'; return cached; }

    // Sözlükte tam eşleşme ara (tek satır metin için)
    if (!isSRT && blocks.length === 1) {
      const dictMatch = await dictExact(text);
      if (dictMatch) {
        lastProvider = '📖 Sözlük';
        setCached(cacheKey, dictMatch);
        return dictMatch;
      }
    }

    // AI ile bağlamlı çeviri — 8'li batch
    const BATCH = 8;
    const results = new Array(blocks.length);

    for (let i = 0; i < blocks.length; i += BATCH) {
      const batch = blocks.slice(i, i + BATCH);
      const nonEmpty = batch.map(b => b.trim() ? b : '');
      const toTranslate = nonEmpty.filter(b => b.length > 0);

      if (!toTranslate.length) {
        batch.forEach((b, j) => { results[i + j] = b; });
        continue;
      }

      // Sözlükten tam eşleşenleri ayır
      const dictResults = await Promise.all(toTranslate.map(b => dictExact(b)));
      const needsAI = toTranslate.filter((_, j) => dictResults[j] === null);
      const aiIndices = toTranslate.map((_, j) => dictResults[j] === null ? j : -1).filter(j => j >= 0);

      let aiTranslated = [];
      if (needsAI.length > 0) {
        aiTranslated = await translateBatch(needsAI, lang);
      }

      // Sonuçları birleştir
      let aiIdx = 0;
      let dictIdx = 0;
      let trIdx = 0;

      batch.forEach((b, j) => {
        if (!b.trim()) {
          results[i + j] = b;
        } else {
          const dMatch = dictResults[trIdx];
          if (dMatch !== null) {
            results[i + j] = dMatch;
          } else {
            results[i + j] = aiTranslated[aiIdx++] || b;
          }
          trIdx++;
        }
      });

      if (i + BATCH < blocks.length) await new Promise(r => setTimeout(r, 50));
    }

    const finalResult = results.join(isSRT ? sep : '\n');
    setCached(cacheKey, finalResult);
    return finalResult;
  }

  async function checkModelExists() { return true; }
  async function preloadModel() { try { await loadSozluk(); } catch(e) {} }

  return { translate, getIsOnline, checkModelExists, preloadModel, isModelsReady, getMode, setMode, getLastProvider };
})();
