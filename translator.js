/* ============================================================
   KuromojiTokenizer — Kuromoji.js + Özel Sözlük ile Gelişmiş Tokenizasyon
   ============================================================ */
const KuromojiTokenizer = (() => {
  let tokenizer = null;
  let dict = null;
  const initPromise = initTokenizer();

  async function initTokenizer() {
    return new Promise((resolve, reject) => {
      kuromoji.builder({ dicPath: 'https://cdn.jsdelivr.net/npm/kuromoji@0.1.2/dict/' }).build((err, _tokenizer) => {
        if (err) return reject(err);
        tokenizer = _tokenizer;
        resolve(tokenizer);
      });
    });
  }

  async function ensureReady() {
    if (!tokenizer) await initPromise;
    return tokenizer;
  }

  async function tokenize(text) {
    if (!text) return [];
    const t = await ensureReady();
    const rawTokens = t.tokenize(text);
    
    // "Bunkatsu" benzeri birleştirme: Ekleri anlamlı parçalara bağla
    const merged = [];
    let buffer = { word: '', reading: '', pos: '' };
    
    for (const tok of rawTokens) {
      const surface = tok.surface_form;
      const pos = tok.pos;
      const reading = tok.reading || surface;
      
      // Yardımcı fiil/ek ise buffer'a ekle
      if (pos === '助動詞' || pos === '助詞' || pos === '接尾辞') {
        buffer.word += surface;
        buffer.reading += reading;
      } else {
        if (buffer.word) {
          merged.push({
            surface: buffer.word,
            reading: buffer.reading,
            pos: buffer.pos,
            basic: buffer.word
          });
          buffer = { word: '', reading: '', pos: '' };
        }
        buffer = { word: surface, reading: reading, pos: pos };
      }
    }
    if (buffer.word) {
      merged.push({
        surface: buffer.word,
        reading: buffer.reading,
        pos: buffer.pos,
        basic: buffer.word
      });
    }
    
    // Yüzey formlarını döndür
    return merged.map(t => t.surface).filter(s => s.trim().length > 0);
  }

  function translateWithDict(text, dictObj) {
    // Eşleşme önceliği: Tam eşleşme, sonra token bazlı
    const trimmed = text.trim();
    if (dictObj[trimmed]) return dictObj[trimmed];
    
    // Token'ları al (asenkron tokenize kullanmak için Promise gerek, ancak burada senkron çağrılacağı için önceden hazır varsay)
    // Not: translateWithDict asenkron olmalı; bu yüzden fonksiyon imzasını değiştiriyoruz.
    return null; // Bu fonksiyon asenkron olarak çağrılacak şekilde düzenlenecek
  }

  return {
    init: initTokenizer,
    tokenize,
    ensureReady,
    translateWithDict
  };
})();

/* ============================================================
   Translator — Ana çeviri modülü (Kuromoji + Geniş Sözlük)
   ============================================================ */
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
- Translate naturally and in context
- Keep sound effects as is (e.g. ドン, ガン)
- Match the tone: angry=sert, sad=duygusal, funny=eğlenceli
- Output ONLY translations, one per line, same count as input`;

  const JP_REGEX = /[\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\uFF00-\uFFEF]/;

  function getIsOnline()     { return navigator.onLine; }
  function isModelsReady()   { return sozluk !== null; }
  function getMode()         { return activeMode; }
  function setMode(mode)     { activeMode = mode; }
  function getLastProvider() { return lastProvider; }

  function postProcess(text) {
    if (!text) return text;
    let t = text;
    t = t.replace(/\b([A-ZÇĞİÖŞÜ]{2,})\b/g, w => w.charAt(0) + w.slice(1).toLowerCase());
    t = t.replace(/  +/g, ' ');
    t = t.split('\n').map(l => l.trim()).join('\n');
    t = t.replace(/\.\.\.\./g, '...').replace(/。。。/g, '...');
    t = t
      .replace(/\bben\s+ben\b/gi, 'ben')
      .replace(/\bseni\s+seni\b/gi, 'seni')
      .replace(/\bve\s+ve\b/gi, 've')
      .replace(/\bama\s+ama\b/gi, 'ama')
      .replace(/\bbu\s+bu\b/gi, 'bu');
    t = t.replace(/\s+([.,!?;:])/g, '$1');
    t = t.replace(/([.,!?;:])([^\s"'])/g, '$1 $2');
    t = t.replace(/\n{3,}/g, '\n\n');
    return t.trim();
  }

  function getCached(key) { return cache.get(key); }
  function setCached(key, val) {
    if (cache.size > 1000) cache.delete(cache.keys().next().value);
    cache.set(key, val);
  }

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

  async function callAPI(url, key, model, system, userMsg) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 15000);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({ model, messages: [{ role: 'system', content: system }, { role: 'user', content: userMsg }], temperature: 0.2, max_tokens: 2048 }),
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!res.ok) throw new Error(res.status);
      const data = await res.json();
      return data.choices[0].message.content.trim();
    } catch(e) {
      clearTimeout(timeoutId);
      throw e;
    }
  }

  const aiProviders = [
    { name: 'Groq',       call: (s, m) => callAPI('https://api.groq.com/openai/v1/chat/completions',      KEYS.groq,       'llama-3.1-8b-instant',                  s, m) },
    { name: 'GPT-4o-mini',call: (s, m) => callAPI('https://api.openai.com/v1/chat/completions',           KEYS.openai,     'gpt-4o-mini',                           s, m) },
    { name: 'OpenRouter', call: (s, m) => callAPI('https://openrouter.ai/api/v1/chat/completions',        KEYS.openrouter, 'meta-llama/llama-3.1-8b-instruct:free', s, m) }
  ];

  async function googleTranslate(text, lang) {
    const params = new URLSearchParams({ client: 'gtx', sl: lang, tl: 'tr', dt: 't', q: text });
    const res = await fetch('https://translate.googleapis.com/translate_a/single?' + params);
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    return data[0].filter(i => i && i[0]).map(i => i[0]).join('');
  }

  async function offlineTranslate(text, lang) {
    if (lang !== 'ja') return postProcess(text);
    const d = await loadSozluk();
    const trimmed = text.trim();
    
    // 1. Tam eşleşme
    if (d[trimmed]) return postProcess(d[trimmed]);
    
    // 2. Kuromoji ile tokenize edip sözlükte ara
    await KuromojiTokenizer.ensureReady();
    const tokens = await KuromojiTokenizer.tokenize(trimmed);
    
    const parts = [];
    let anyFound = false;
    for (const token of tokens) {
      if (d[token]) {
        parts.push(d[token]);
        anyFound = true;
      } else {
        // Japonca olmayan karakterleri olduğu gibi bırak
        if (!JP_REGEX.test(token)) parts.push(token);
      }
    }
    
    if (anyFound) return postProcess(parts.join(' '));
    return postProcess(trimmed);
  }

  async function translateBatch(lines, lang) {
    const langName = lang === 'ja' ? 'Japanese' : 'English';
    const system = SYSTEM(langName);
    const numbered = lines.map((l, i) => `${i + 1}. ${l}`).join('\n');
    const prompt = `Translate these ${lines.length} subtitle lines to Turkish. Output exactly ${lines.length} lines, numbered:\n\n${numbered}`;

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
      } catch(e) { console.warn(p.name + ':', e.message); }
    }

    lastProvider = 'Google';
    const out = await Promise.all(lines.map(l => l.trim() ? googleTranslate(l, lang) : Promise.resolve(l)));
    return out.map(postProcess);
  }

  async function translate(text, lang) {
    if (!text?.trim()) throw new Error('Metin boş.');
    if (!['en', 'ja'].includes(lang)) throw new Error('Desteklenmeyen dil.');

    const sep = '\n|||SEP|||\n';
    const isSRT = text.includes('|||SEP|||');
    const blocks = isSRT ? text.split(sep) : text.split('\n');
    const useOffline = !navigator.onLine || activeMode === 'offline';

    if (useOffline) {
      lastProvider = '📴 Sözlük';
      const results = await Promise.all(blocks.map(b => b.trim() ? offlineTranslate(b, lang) : Promise.resolve(b)));
      return results.join(isSRT ? sep : '\n');
    }

    const cacheKey = `${lang}:${text.substring(0, 150)}`;
    const cached = getCached(cacheKey);
    if (cached) { lastProvider = '⚡ Cache'; return cached; }

    if (!isSRT && blocks.length === 1) {
      const dictMatch = await dictExact(text);
      if (dictMatch) {
        const result = postProcess(dictMatch);
        lastProvider = '📖 Sözlük';
        setCached(cacheKey, result);
        return result;
      }
    }

    const BATCH = 8;
    const results = new Array(blocks.length);
    for (let i = 0; i < blocks.length; i += BATCH) {
      const batch = blocks.slice(i, i + BATCH);
      const toTranslate = batch.filter(b => b.trim());
      if (!toTranslate.length) {
        batch.forEach((b, j) => { results[i + j] = b; });
        continue;
      }
      const dictResults = await Promise.all(toTranslate.map(b => dictExact(b)));
      const needsAI = toTranslate.filter((_, j) => dictResults[j] === null);
      let aiTranslated = [];
      if (needsAI.length) aiTranslated = await translateBatch(needsAI, lang);

      let aiIdx = 0, trIdx = 0;
      batch.forEach((b, j) => {
        if (!b.trim()) results[i + j] = b;
        else {
          const dMatch = dictResults[trIdx];
          results[i + j] = dMatch !== null ? postProcess(dMatch) : (aiTranslated[aiIdx++] || b);
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
  async function preloadModel() {
    await loadSozluk();
    await KuromojiTokenizer.ensureReady();
  }

  return {
    translate, getIsOnline, checkModelExists, preloadModel,
    isModelsReady, getMode, setMode, getLastProvider
  };
})();
