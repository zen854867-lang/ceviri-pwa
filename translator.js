/* ============================================================
   JapaneseTokenizer — Önbellekli, gelişmiş Japonca tokenizasyon
   Fiil ekleri, partiküller, sıfat çekimlerini tanır.
   ============================================================ */
const JapaneseTokenizer = (() => {
  // ----- PARTİKÜL LİSTESİ -----
  const PARTICLES = new Set([
    'は','が','を','に','で','と','も','の','から','まで','より','へ',
    'や','か','な','ね','よ','わ','ぞ','ぜ','さ','など','とか','って','て',
    'には','では','とは','のは','からは','までは','よりは',
    'ので','のに','けど','けれど','けれども','し','たり','ながら','ば',
    'たら','なら','ても','でも','とも','ては','では','ちゃ','じゃ',
    'かい','だい','かいな','かな','かしら','さえ','すら','こそ',
    'だけ','のみ','ばかり','くらい','ぐらい','ほど','までに','うちに',
    'として','にとって','において','によって','に対して','に関して'
  ]);

  // ----- FİİL ÇEKİM EKLERİ -----
  const VERB_ENDINGS = [
    'ている','ていた','ています','ていました','てる','てた',
    'てある','ておく','てみる','てしまう','てしまった',
    'てあげる','てもらう','てくれる','てやる',
    'ません','ました','ましょう','ますか','ます','ませ','まして',
    'ない','なかった','なければ','なくて','なくちゃ','なきゃ',
    'たい','たかった','たくない','たがる',
    'だった','でした','だろう','でしょう','です','だ',
    'れる','られる','せる','させる','させられる',
    'そう','すぎる','すぎた','まい','ず','ぬ','ん',
    'え','えよ','ろ','な','なさい','ください','くれ'
  ];

  // ----- BİLEŞİK İFADELER -----
  const COMPOUNDS = [
    'しなければならない','しなければいけない','することができる',
    'してもいい','してはいけない','しなくてもいい',
    'かもしれない','にちがいない','はずがない','はずだ',
    'ことができる','ことがある','ことになる','ことにする',
    'ようになる','ようにする','ようだ','みたいだ',
    'てしまった','てしまう','ておいた','ておく',
    'てみた','てみる','てあげる','てもらう','てくれる',
    'なければならない','なければいけない','なくてはいけない'
  ];

  // ----- SIFAT ÇEKİMLERİ -----
  const ADJ_ENDINGS = [
    'くて','かった','ければ','かろう','く','き',
    'だった','ではなかった','じゃなかった','で','に','な'
  ];

  const ALL_ENDINGS = [...VERB_ENDINGS, ...ADJ_ENDINGS].sort((a,b) => b.length - a.length);
  const SORTED_PARTICLES = [...PARTICLES].sort((a,b) => b.length - a.length);

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
    const result = [];
    let cur = '', curType = null;
    for (const ch of text) {
      const t = charType(ch);
      if (t === 'PUNCT' || t === 'OTHER') {
        if (cur) result.push(cur);
        if (ch.trim()) result.push(ch);
        cur = ''; curType = null;
      } else if (curType === null) {
        cur = ch; curType = t;
      } else if (t === curType) {
        cur += ch;
      } else if ((curType === 'KANJI' && t === 'HIRA') || (curType === 'HIRA' && t === 'KANJI') || (curType === 'KATA' && t === 'HIRA')) {
        cur += ch; curType = t;
      } else {
        result.push(cur);
        cur = ch; curType = t;
      }
    }
    if (cur) result.push(cur);
    return result;
  }

  function splitSegment(seg, depth = 0) {
    if (!seg || depth > 10) return [seg];
    for (const c of COMPOUNDS) {
      if (seg === c) return [seg];
      if (seg.endsWith(c) && seg.length > c.length) {
        return [...splitSegment(seg.slice(0, -c.length), depth+1), c];
      }
    }
    if (PARTICLES.has(seg)) return [seg];
    for (const ending of ALL_ENDINGS) {
      if (seg.endsWith(ending) && seg.length > ending.length) {
        return [...splitSegment(seg.slice(0, -ending.length), depth+1), ending];
      }
    }
    if (seg.length >= 3) {
      for (const p of SORTED_PARTICLES) {
        const idx = seg.indexOf(p);
        if (idx > 0 && idx + p.length < seg.length) {
          const before = seg.slice(0, idx), after = seg.slice(idx + p.length);
          return [...splitSegment(before, depth+1), p, ...splitSegment(after, depth+1)];
        }
      }
    }
    if (seg.endsWith('する') && seg.length > 2) {
      return [...splitSegment(seg.slice(0, -2), depth+1), 'する'];
    }
    return [seg];
  }

  // ----- ÖNBELLEKLİ TOKENİZASYON -----
  const tokenCache = new Map();
  const MAX_CACHE = 500;

  function tokenizeRaw(text) {
    if (!text) return [];
    const trimmed = text.trim();
    if (!trimmed) return [];
    const segments = splitByCharType(trimmed);
    const tokens = [];
    for (const seg of segments) tokens.push(...splitSegment(seg));
    return tokens.filter(t => t.length > 0);
  }

  function tokenize(text) {
    if (!text) return [];
    const key = text;
    if (tokenCache.has(key)) return tokenCache.get(key);
    const tokens = tokenizeRaw(text);
    if (tokenCache.size >= MAX_CACHE) tokenCache.delete(tokenCache.keys().next().value);
    tokenCache.set(key, tokens);
    return tokens;
  }

  function clearCache() { tokenCache.clear(); }

  function translateWithDict(text, dict, options = {}) {
    const trimmed = text.trim();
    if (dict[trimmed]) return dict[trimmed];
    const tokens = tokenize(trimmed);
    if (!tokens.length) return null;
    const parts = [];
    let i = 0, anyFound = false;
    const maxChunk = options.maxChunk || 5;
    while (i < tokens.length) {
      let matched = false;
      for (let len = Math.min(maxChunk, tokens.length - i); len >= 1; len--) {
        const chunk = tokens.slice(i, i + len).join('');
        if (dict[chunk]) { parts.push(dict[chunk]); i += len; matched = anyFound = true; break; }
      }
      if (!matched) {
        const tok = tokens[i];
        if (options.includeParticles && PARTICLES.has(tok)) parts.push(dict[tok] || tok);
        else if (!PARTICLES.has(tok) || options.keepParticles) {
          if (!/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/.test(tok)) parts.push(tok);
        }
        i++;
      }
    }
    return anyFound ? parts.join(' ').trim() : null;
  }

  return { tokenize, tokenizeRaw, translateWithDict, clearCache };
})();

/* ============================================================
   Translator — Ana çeviri modülü (JapaneseTokenizer entegre)
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
- Translate naturally and in context, not word by word
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

    // JAPONCA SİLME KAPATILDI (çeviri başarısızsa orijinal metin kalsın)
    // if (JP_REGEX.test(t)) {
    //   t = t.replace(/[\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\uFF00-\uFFEF]+/g, '');
    //   t = t.replace(/  +/g, ' ').trim();
    // }

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

  /* ============================================================
     OFFLINE ÇEVİRİ — JapaneseTokenizer ile gelişmiş eşleşme
     ============================================================ */
  async function offlineTranslate(text, lang) {
    if (lang !== 'ja') return postProcess(text);
    const d = await loadSozluk();
    const trimmed = text.trim();

    // 1. Tam eşleşme
    if (d[trimmed]) return postProcess(d[trimmed]);

    // 2. JapaneseTokenizer ile kök/ek ayırarak eşleşme
    if (typeof JapaneseTokenizer !== 'undefined') {
      const result = JapaneseTokenizer.translateWithDict(trimmed, d);
      if (result) return postProcess(result);
    }

    // 3. Hiçbir şey bulunamazsa orijinal metni olduğu gibi gönder
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
        const parsed = raw.split('\n')
          .map(l => l.replace(/^\d+\.\s*/, '').trim())
          .filter(l => l.length > 0);
        if (parsed.length >= lines.length * 0.8) {
          return lines.map((orig, i) => postProcess(parsed[i] || orig));
        }
      } catch(e) {
        console.warn(p.name + ':', e.message);
      }
    }

    lastProvider = 'Google';
    const out = await Promise.all(lines.map(l => l.trim() ? googleTranslate(l, lang) : Promise.resolve(l)));
    return out.map(postProcess);
  }

  async function translate(text, lang) {
    if (!text || !text.trim()) throw new Error('Metin boş.');
    if (!['en', 'ja'].includes(lang)) throw new Error('Desteklenmeyen dil.');

    const sep = '\n|||SEP|||\n';
    const isSRT = text.includes('|||SEP|||');
    const blocks = isSRT ? text.split(sep) : text.split('\n');
    const useOffline = !navigator.onLine;

    if (useOffline) {
      lastProvider = '📴 Sözlük';
      const results = await Promise.all(
        blocks.map(b => b.trim() ? offlineTranslate(b, lang) : Promise.resolve(b))
      );
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
      if (needsAI.length > 0) {
        aiTranslated = await translateBatch(needsAI, lang);
      }

      let aiIdx = 0, trIdx = 0;
      batch.forEach((b, j) => {
        if (!b.trim()) {
          results[i + j] = b;
        } else {
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
  async function preloadModel() { try { await loadSozluk(); } catch(e) {} }

  return { translate, getIsOnline, checkModelExists, preloadModel, isModelsReady, getMode, setMode, getLastProvider };
})();
