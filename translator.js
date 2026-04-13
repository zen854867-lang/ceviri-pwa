/* ============================================================
   JapaneseTokenizer — Kapsamlı, Profesyonel Seviye Tokenizer
   Çift sözlük desteği, akıllı segmentasyon, çekim tanıma.
   ============================================================ */
const JapaneseTokenizer = (() => {
  // ----- PARTİKÜLLER -----
  const PARTICLES = new Set([
    'は','が','を','に','で','と','も','の','から','まで','より','へ',
    'や','か','な','ね','よ','わ','ぞ','ぜ','さ','など','とか','って','て',
    'には','では','とは','のは','からは','までは','よりは','へは','では',
    'ので','のに','けど','けれど','けれども','し','たり','ながら','ば',
    'たら','なら','ても','でも','とも','ては','ちゃ','じゃ','きゃ','ぎゃ',
    'かい','だい','かな','かしら','さえ','すら','こそ','だけ','のみ','ばかり',
    'くらい','ぐらい','ほど','までに','うちに','として','にとって','において',
    'によって','に対して','に関して','にて','をもって'
  ]);

  // ----- FİİL / SIFAT ÇEKİM EKLERİ -----
  const INFLECTION_SUFFIXES = [
    // Fiil çekimleri
    'ている','ていた','ています','ていました','てる','てた',
    'てある','ておく','てみる','てしまう','てしまった','ちゃう','じゃう',
    'てあげる','てもらう','てくれる','てやる',
    'ません','ました','ましょう','ますか','ます','ませ','まして',
    'ない','なかった','なければ','なくて','なくちゃ','なきゃ','ねば','ぬ','ん',
    'たい','たかった','たくない','たがる',
    'だった','でした','だろう','でしょう','です','だ','である','でござる',
    'れる','られる','せる','させる','させられる','しめる',
    'そう','すぎる','すぎた','まい','ず','ぬ','べし','べき',
    'え','えよ','ろ','な','なさい','ください','くれ','たまえ',
    'はじめる','だす','つづける','おわる','かける','あう','こむ','きる','ぬく',
    // Sıfat çekimleri
    'くて','かった','ければ','かろう','く','き','くない','くなかった',
    'だった','ではなかった','じゃなかった','で','に','な'
  ];

  // ----- BİLEŞİK İFADELER (Öncelikli) -----
  const COMPOUNDS = [
    'しなければならない','しなければいけない','しなきゃならない',
    'することができる','することができない','することがある',
    'してもいい','してはいけない','しなくてもいい',
    'かもしれない','にちがいない','はずがない','はずだ',
    'ことができる','ことがある','ことになる','ことにする',
    'ようになる','ようにする','ようだ','みたいだ',
    'てしまった','てしまう','ておいた','ておく',
    'てみた','てみる','てあげる','てもらう','てくれる',
    'なければならない','なければいけない','なくてはいけない',
    'わけではない','わけにはいかない','ほかはない',
    'にきまっている','にそういない','といってもいい',
    'どころか','ばかりか','のみならず'
  ];

  // Sıralı listeler (performans için)
  const SORTED_PARTICLES = [...PARTICLES].sort((a,b) => b.length - a.length);
  const SORTED_SUFFIXES = [...INFLECTION_SUFFIXES].sort((a,b) => b.length - a.length);
  const SORTED_COMPOUNDS = [...COMPOUNDS].sort((a,b) => b.length - a.length);

  // ----- Karakter Türü Analizi -----
  function charType(ch) {
    const code = ch.charCodeAt(0);
    if (code >= 0x3040 && code <= 0x309F) return 'HIRA';
    if (code >= 0x30A0 && code <= 0x30FF) return 'KATA';
    if (code >= 0x4E00 && code <= 0x9FFF) return 'KANJI';
    if (code >= 0xFF65 && code <= 0xFF9F) return 'KATA';
    if ((code >= 0x41 && code <= 0x5A) || (code >= 0x61 && code <= 0x7A)) return 'LATIN';
    if (code >= 0x30 && code <= 0x39) return 'NUM';
    if (code >= 0x3000 && code <= 0x303F) return 'PUNCT';
    return 'OTHER';
  }

  function splitByCharType(text) {
    const segments = [];
    let cur = '', curType = null;
    for (const ch of text) {
      const t = charType(ch);
      if (t === 'PUNCT' || t === 'OTHER') {
        if (cur) segments.push(cur);
        if (ch.trim()) segments.push(ch);
        cur = ''; curType = null;
      } else if (curType === null) {
        cur = ch; curType = t;
      } else if (t === curType) {
        cur += ch;
      } else if ((curType === 'KANJI' && t === 'HIRA') || (curType === 'HIRA' && t === 'KANJI') || (curType === 'KATA' && t === 'HIRA')) {
        cur += ch; curType = t;
      } else {
        segments.push(cur);
        cur = ch; curType = t;
      }
    }
    if (cur) segments.push(cur);
    return segments;
  }

  // ----- Ana Segmentasyon (Rekürsif) -----
  function splitSegment(seg, depth = 0) {
    if (!seg || depth > 10) return [seg];

    // 1. Bileşik ifade kontrolü
    for (const comp of SORTED_COMPOUNDS) {
      if (seg === comp) return [comp];
      if (seg.endsWith(comp) && seg.length > comp.length) {
        const root = seg.slice(0, -comp.length);
        return [...splitSegment(root, depth+1), comp];
      }
    }

    // 2. Partikül ise direkt dön
    if (PARTICLES.has(seg)) return [seg];

    // 3. Fiil/sıfat çekim eki kontrolü
    for (const suff of SORTED_SUFFIXES) {
      if (seg.endsWith(suff) && seg.length > suff.length) {
        const root = seg.slice(0, -suff.length);
        if (root.length >= 1) {
          return [...splitSegment(root, depth+1), suff];
        }
      }
    }

    // 4. Uzun segmentlerde partikül taraması
    if (seg.length >= 3) {
      for (const p of SORTED_PARTICLES) {
        const idx = seg.indexOf(p);
        if (idx > 0 && idx + p.length < seg.length) {
          const before = seg.slice(0, idx);
          const after = seg.slice(idx + p.length);
          return [...splitSegment(before, depth+1), p, ...splitSegment(after, depth+1)];
        }
      }
    }

    // 5. する fiili özel durumu
    if (seg.endsWith('する') && seg.length > 2) {
      return [...splitSegment(seg.slice(0, -2), depth+1), 'する'];
    }

    return [seg];
  }

  // ----- Cache Mekanizması -----
  const tokenCache = new Map();
  const MAX_CACHE = 500;

  function tokenize(text) {
    if (!text) return [];
    const key = text;
    if (tokenCache.has(key)) return tokenCache.get(key);
    const trimmed = text.trim();
    if (!trimmed) return [];

    const rawSegments = splitByCharType(trimmed);
    const tokens = [];
    for (const seg of rawSegments) {
      tokens.push(...splitSegment(seg));
    }

    const filtered = tokens.filter(t => t.length > 0);
    if (tokenCache.size >= MAX_CACHE) {
      tokenCache.delete(tokenCache.keys().next().value);
    }
    tokenCache.set(key, filtered);
    return filtered;
  }

  // ----- Geçersiz sözlük değeri filtresi -----
  function isInvalidDictValue(val) {
    if (typeof val !== 'string') return true;
    // Parantezli açıklamalar (örn: "(nesne belirteci)")
    if (val.includes('(') || val.includes(')')) return true;
    // Tek başına anlamsız kısa kelimeler
    if (val.length <= 2 && /^[a-zçğıöşü]+$/i.test(val)) {
      const meaningless = ['diş', 'de', 'da', 've', 'ise', 'ama', 'gibi', 'ile', 'için', 'bir'];
      if (meaningless.includes(val.toLowerCase())) return true;
    }
    return false;
  }

  // ----- Çift Sözlüklü Çeviri -----
  function translateWithDict(text, mainDict, secondaryDict = {}) {
    const trimmed = text.trim();
    
    // Tam eşleşme ara (ana sözlük)
    const mainExact = mainDict[trimmed];
    if (mainExact && !isInvalidDictValue(mainExact)) return mainExact;
    
    // Tam eşleşme ara (ikincil sözlük)
    const secExact = secondaryDict[trimmed];
    if (secExact && !isInvalidDictValue(secExact)) return secExact;

    const tokens = tokenize(trimmed);
    if (!tokens.length) return null;

    const parts = [];
    let i = 0, anyFound = false;

    while (i < tokens.length) {
      let matched = false;
      // En uzun eşleşme (max 5 token)
      for (let len = Math.min(5, tokens.length - i); len >= 1; len--) {
        const chunk = tokens.slice(i, i + len).join('');
        
        let val = mainDict[chunk];
        if (!val || isInvalidDictValue(val)) {
          val = secondaryDict[chunk];
        }
        
        if (val && !isInvalidDictValue(val)) {
          parts.push(val);
          i += len;
          matched = anyFound = true;
          break;
        }
      }
      if (!matched) {
        const tok = tokens[i];
        const isJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/.test(tok);
        // Japonca ve partikülleri atla, Latin karakterleri ekle
        if (!isJapanese && !PARTICLES.has(tok)) {
          parts.push(tok);
        }
        i++;
      }
    }

    return anyFound ? parts.join(' ').replace(/\s+/g, ' ').trim() : null;
  }

  function clearCache() { tokenCache.clear(); }

  return { tokenize, translateWithDict, clearCache, PARTICLES };
})();

/* ============================================================
   Translator — Profesyonel Çeviri Motoru (Çift Sözlük Desteği)
   ============================================================ */
const Translator = (() => {
  let sozlukMain = null;      // Ana sözlük (ja_tr.json)
  let sozlukSecondary = null; // İkincil sözlük (isteğe bağlı)
  let activeMode = 'auto';
  let lastProvider = '-';
  const cache = new Map();

  const KEYS = {
    groq:       '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',
    openai:     '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',
    openrouter: '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'
  };

  const SYSTEM = (lang) => `You are a professional anime and manga translator. Translate ${lang} to natural, fluent Turkish as if you were a human translator.
- Keep honorifics: -san, -sama, -kun, -chan, -senpai, -sensei
- Keep sound effects (e.g. ドン, ガン) as is
- Match the tone: angry → sert, sad → duygulu, funny → esprili
- Translate meaning, not word-for-word
- Output ONLY the translated lines, same number as input.`;

  function getIsOnline()     { return navigator.onLine; }
  function isModelsReady()   { return sozlukMain !== null; }
  function getMode()         { return activeMode; }
  function setMode(mode)     { activeMode = mode; }
  function getLastProvider() { return lastProvider; }

  // Sözlük yükleme (çift sözlük desteği)
  async function loadDictionaries() {
    if (sozlukMain) return;
    try {
      const res = await fetch('./ja_tr.json');
      sozlukMain = await res.json();
    } catch(e) { sozlukMain = {}; }
    
    // Opsiyonel ikincil sözlük (varsa)
    try {
      const res = await fetch('./ja_tr_anime.json');
      sozlukSecondary = await res.json();
    } catch(e) { sozlukSecondary = {}; }
  }

  async function callAPI(url, key, model, system, userMsg) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
        body: JSON.stringify({ model, messages: [{ role: 'system', content: system }, { role: 'user', content: userMsg }], temperature: 0.15, max_tokens: 2048 }),
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
    { name: 'Groq',       call: (s, m) => callAPI('https://api.groq.com/openai/v1/chat/completions', KEYS.groq, 'llama-3.3-70b-versatile', s, m) },
    { name: 'OpenRouter', call: (s, m) => callAPI('https://openrouter.ai/api/v1/chat/completions', KEYS.openrouter, 'meta-llama/llama-3.3-70b-instruct:free', s, m) },
    { name: 'GPT-4o-mini',call: (s, m) => callAPI('https://api.openai.com/v1/chat/completions', KEYS.openai, 'gpt-4o-mini', s, m) }
  ];

  async function googleTranslate(text, lang) {
    const params = new URLSearchParams({ client: 'gtx', sl: lang, tl: 'tr', dt: 't', q: text });
    const res = await fetch('https://translate.googleapis.com/translate_a/single?' + params);
    if (!res.ok) throw new Error(res.status);
    const data = await res.json();
    return data[0].filter(i => i && i[0]).map(i => i[0]).join('');
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
    t = t.replace(/\n{3,}/g, '\n\n');
    return t.trim();
  }

  function getCached(key) { return cache.get(key); }
  function setCached(key, val) {
    if (cache.size > 1000) cache.delete(cache.keys().next().value);
    cache.set(key, val);
  }

  async function offlineTranslate(text, lang) {
    if (lang !== 'ja') return postProcess(text);
    await loadDictionaries();
    const trimmed = text.trim();
    const result = JapaneseTokenizer.translateWithDict(trimmed, sozlukMain, sozlukSecondary);
    return result ? postProcess(result) : postProcess(trimmed);
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
      lastProvider = '📴 Offline';
      const results = await Promise.all(blocks.map(b => b.trim() ? offlineTranslate(b, lang) : Promise.resolve(b)));
      return results.join(isSRT ? sep : '\n');
    }

    const cacheKey = `${lang}:${text.substring(0, 150)}`;
    const cached = getCached(cacheKey);
    if (cached) { lastProvider = '⚡ Cache'; return cached; }

    if (!isSRT && blocks.length === 1) {
      await loadDictionaries();
      const exact = JapaneseTokenizer.translateWithDict(text.trim(), sozlukMain, sozlukSecondary);
      if (exact) {
        const result = postProcess(exact);
        lastProvider = '📖 Sözlük';
        setCached(cacheKey, result);
        return result;
      }
    }

    const BATCH = 6;
    const results = new Array(blocks.length);
    for (let i = 0; i < blocks.length; i += BATCH) {
      const batch = blocks.slice(i, i + BATCH);
      const toTranslate = batch.filter(b => b.trim());
      if (!toTranslate.length) {
        batch.forEach((b, j) => { results[i + j] = b; });
        continue;
      }
      const aiTranslated = await translateBatch(toTranslate, lang);
      let aiIdx = 0;
      batch.forEach((b, j) => {
        if (!b.trim()) results[i + j] = b;
        else results[i + j] = aiTranslated[aiIdx++] || b;
      });
      if (i + BATCH < blocks.length) await new Promise(r => setTimeout(r, 100));
    }

    const finalResult = results.join(isSRT ? sep : '\n');
    setCached(cacheKey, finalResult);
    return finalResult;
  }

  async function preloadModel() { await loadDictionaries(); }

  return {
    translate, getIsOnline, preloadModel, isModelsReady,
    getMode, setMode, getLastProvider
  };
})();
