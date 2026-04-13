/* ============================================================
   Professional Japanese Translator v2.0
   Tokenizer + Dictionary + Offline/Online Engine
   Optimized for anime/manga context
   ============================================================ */

// ---------- PART OF SPEECH TAGS ----------
const POS = {
  PARTICLE: 1,
  VERB_AUX: 2,
  ADJ_AUX: 3,
  SUFFIX: 4,
  PUNCT: 5,
  UNKNOWN: 0
};

// ---------- JAPONCA KARAKTER SINIFLANDIRMA ----------
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

// ---------- PARTİKÜL LİSTESİ (KAPSAMLI) ----------
const PARTICLES = new Set([
  'は','が','を','に','で','と','も','の','から','まで','より','へ','や','か','な','ね','よ','わ','ぞ','ぜ','さ',
  'など','とか','って','て','には','では','とは','のは','からは','までは','よりは','へは','ので','のに','けど',
  'けれど','けれども','し','たり','ながら','ば','たら','なら','ても','でも','とも','ては','ちゃ','じゃ',
  'きゃ','ぎゃ','かい','だい','かな','かしら','さえ','すら','こそ','だけ','のみ','ばかり','くらい','ぐらい',
  'ほど','までに','うちに','として','にとって','において','によって','に対して','に関して','にて','をもって'
]);

// ---------- FİİL / SIFAT ÇEKİM EKLERİ (KÖK BULMA İÇİN) ----------
const INFLECTION_MAP = {
  // Fiil çekim ekleri -> kök dönüşüm kuralları
  'ている': { remove: 'ている', add: 'る' },
  'ていた': { remove: 'ていた', add: 'る' },
  'ています': { remove: 'ています', add: 'る' },
  'ていました': { remove: 'ていました', add: 'る' },
  'てる': { remove: 'てる', add: 'る' },
  'てた': { remove: 'てた', add: 'る' },
  'てある': { remove: 'てある', add: 'る' },
  'ておく': { remove: 'ておく', add: 'る' },
  'てみる': { remove: 'てみる', add: 'る' },
  'てしまう': { remove: 'てしまう', add: 'る' },
  'てしまった': { remove: 'てしまった', add: 'る' },
  'ちゃう': { remove: 'ちゃう', add: 'る' },
  'じゃう': { remove: 'じゃう', add: 'る' },
  'てあげる': { remove: 'てあげる', add: 'る' },
  'てもらう': { remove: 'てもらう', add: 'る' },
  'てくれる': { remove: 'てくれる', add: 'る' },
  'ません': { remove: 'ません', add: 'る' },
  'ました': { remove: 'ました', add: 'る' },
  'ましょう': { remove: 'ましょう', add: 'る' },
  'ます': { remove: 'ます', add: 'る' },
  'ない': { remove: 'ない', add: 'る' },
  'なかった': { remove: 'なかった', add: 'る' },
  'なければ': { remove: 'なければ', add: 'る' },
  'なくて': { remove: 'なくて', add: 'る' },
  'なきゃ': { remove: 'なきゃ', add: 'る' },
  'たい': { remove: 'たい', add: 'る' },
  'たかった': { remove: 'たかった', add: 'る' },
  'たくない': { remove: 'たくない', add: 'る' },
  'れる': { remove: 'れる', add: 'る' },
  'られる': { remove: 'られる', add: 'る' },
  'せる': { remove: 'せる', add: 'る' },
  'させる': { remove: 'させる', add: 'る' },
  'させられる': { remove: 'させられる', add: 'る' },
  'そう': { remove: 'そう', add: 'る' },
  'すぎる': { remove: 'すぎる', add: 'る' },
  'すぎた': { remove: 'すぎた', add: 'る' },
  'なさい': { remove: 'なさい', add: 'る' },
  'ください': { remove: 'ください', add: 'る' },
  'くれ': { remove: 'くれ', add: 'る' },
  // Sıfat çekimleri
  'くて': { remove: 'くて', add: 'い' },
  'かった': { remove: 'かった', add: 'い' },
  'ければ': { remove: 'ければ', add: 'い' },
  'く': { remove: 'く', add: 'い' },
  'くない': { remove: 'くない', add: 'い' },
  'くなかった': { remove: 'くなかった', add: 'い' },
  // Kopula
  'だった': { remove: 'だった', add: 'だ' },
  'でした': { remove: 'でした', add: 'です' },
  'だろう': { remove: 'だろう', add: 'だ' },
  'でしょう': { remove: 'でしょう', add: 'です' }
};

// Sıralı ek listesi (en uzun önce)
const SORTED_INFLECTIONS = Object.keys(INFLECTION_MAP).sort((a,b) => b.length - a.length);

// ---------- BİLEŞİK İFADELER (KALIPLAR) ----------
const COMPOUND_PATTERNS = [
  'しなければならない', 'しなければいけない', 'しなきゃならない',
  'することができる', 'することができない', 'することがある',
  'してもいい', 'してはいけない', 'しなくてもいい',
  'かもしれない', 'にちがいない', 'はずがない', 'はずだ',
  'ことができる', 'ことがある', 'ことになる', 'ことにする',
  'ようになる', 'ようにする', 'ようだ', 'みたいだ',
  'なければならない', 'なければいけない', 'なくてはいけない',
  'わけではない', 'わけにはいかない', 'ほかはない'
];

// ---------- TOKENIZER ÇEKİRDEĞİ ----------
const tokenCache = new Map();
const MAX_CACHE = 500;

function tokenize(text) {
  if (!text) return [];
  const key = text;
  if (tokenCache.has(key)) return tokenCache.get(key);
  
  const trimmed = text.trim();
  if (!trimmed) return [];
  
  // 1. Karakter türüne göre ilk ayrıştırma
  const rawSegments = [];
  let cur = '', curType = null;
  for (const ch of trimmed) {
    const t = charType(ch);
    if (t === 'PUNCT' || t === 'OTHER') {
      if (cur) rawSegments.push(cur);
      if (ch.trim()) rawSegments.push(ch);
      cur = ''; curType = null;
    } else if (curType === null) {
      cur = ch; curType = t;
    } else if (t === curType) {
      cur += ch;
    } else if ((curType === 'KANJI' && t === 'HIRA') || (curType === 'HIRA' && t === 'KANJI') || (curType === 'KATA' && t === 'HIRA')) {
      cur += ch; curType = t;
    } else {
      rawSegments.push(cur);
      cur = ch; curType = t;
    }
  }
  if (cur) rawSegments.push(cur);
  
  // 2. Her segmenti daha da parçala
  const tokens = [];
  for (const seg of rawSegments) {
    tokens.push(...splitSegment(seg));
  }
  
  const filtered = tokens.filter(t => t.length > 0);
  if (tokenCache.size >= MAX_CACHE) tokenCache.delete(tokenCache.keys().next().value);
  tokenCache.set(key, filtered);
  return filtered;
}

function splitSegment(seg, depth = 0) {
  if (!seg || depth > 10) return [seg];
  
  // Bileşik ifade kontrolü
  for (const comp of COMPOUND_PATTERNS) {
    if (seg === comp) return [comp];
    if (seg.endsWith(comp) && seg.length > comp.length) {
      return [...splitSegment(seg.slice(0, -comp.length), depth+1), comp];
    }
  }
  
  // Partikül ise direkt döndür (ama ileride kullanılmayacak)
  if (PARTICLES.has(seg)) return [seg];
  
  // Çekim eki kontrolü
  for (const infl of SORTED_INFLECTIONS) {
    if (seg.endsWith(infl) && seg.length > infl.length) {
      return [...splitSegment(seg.slice(0, -infl.length), depth+1), infl];
    }
  }
  
  // İçeride partikül ara
  if (seg.length >= 3) {
    const sortedParts = [...PARTICLES].sort((a,b) => b.length - a.length);
    for (const p of sortedParts) {
      const idx = seg.indexOf(p);
      if (idx > 0 && idx + p.length < seg.length) {
        const before = seg.slice(0, idx);
        const after = seg.slice(idx + p.length);
        return [...splitSegment(before, depth+1), p, ...splitSegment(after, depth+1)];
      }
    }
  }
  
  // する fiili
  if (seg.endsWith('する') && seg.length > 2) {
    return [...splitSegment(seg.slice(0, -2), depth+1), 'する'];
  }
  
  return [seg];
}

// ---------- KÖK BULMA (STEMMING) ----------
function getStem(token) {
  for (const infl of SORTED_INFLECTIONS) {
    if (token.endsWith(infl)) {
      const rule = INFLECTION_MAP[infl];
      const stem = token.slice(0, -infl.length) + rule.add;
      return stem;
    }
  }
  return token;
}

// ---------- SÖZLÜK DEĞERİ GEÇERLİLİK KONTROLÜ ----------
function isValidMeaning(val) {
  if (typeof val !== 'string') return false;
  if (val.length === 0) return false;
  // Parantezli açıklamalar (örn: "(nesne belirteci)")
  if (val.startsWith('(') || val.includes(')')) return false;
  // Sadece boşluk/noktalama
  if (/^[\s.,!?;:]+$/.test(val)) return false;
  // Çok kısa ve anlamsız kelimeler
  const lower = val.toLowerCase().trim();
  const stopWords = ['de', 'da', 've', 'ise', 'ama', 'gibi', 'ile', 'için', 'bir', 'bu', 'şu', 'o', 'diş'];
  if (stopWords.includes(lower) && lower.length <= 3) return false;
  // Japonca karakter içeriyorsa (çeviri değil)
  if (/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/.test(val)) return false;
  return true;
}

// ---------- ÇEVİRİ (OFFLINE) ----------
function translateOffline(text, mainDict, secondDict = {}) {
  const trimmed = text.trim();
  if (!trimmed) return '';
  
  // 1. Tam eşleşme (partikül değilse)
  if (!PARTICLES.has(trimmed)) {
    const exact = mainDict[trimmed] || secondDict[trimmed];
    if (exact && isValidMeaning(exact)) return exact;
  }
  
  const tokens = tokenize(trimmed);
  if (!tokens.length) return trimmed;
  
  const resultParts = [];
  let i = 0;
  
  while (i < tokens.length) {
    const tok = tokens[i];
    
    // Partikül ise tamamen atla
    if (PARTICLES.has(tok)) {
      i++;
      continue;
    }
    
    // En uzun eşleşme dene (max 4 token birleşimi)
    let matched = false;
    for (let len = Math.min(4, tokens.length - i); len >= 1; len--) {
      const chunk = tokens.slice(i, i + len).join('');
      if (PARTICLES.has(chunk)) continue;
      
      let meaning = mainDict[chunk];
      if (!meaning || !isValidMeaning(meaning)) {
        meaning = secondDict[chunk];
      }
      if (meaning && isValidMeaning(meaning)) {
        resultParts.push(meaning);
        i += len;
        matched = true;
        break;
      }
    }
    
    if (!matched) {
      // Kökü dene
      const stem = getStem(tok);
      if (stem !== tok) {
        const stemMeaning = mainDict[stem] || secondDict[stem];
        if (stemMeaning && isValidMeaning(stemMeaning)) {
          resultParts.push(stemMeaning);
          i++;
          continue;
        }
      }
      
      // Japonca değilse ve partikül değilse ekle (Latin karakter vs.)
      const isJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/.test(tok);
      if (!isJapanese && !PARTICLES.has(tok)) {
        resultParts.push(tok);
      }
      i++;
    }
  }
  
  return resultParts.length > 0 ? resultParts.join(' ').replace(/\s+/g, ' ').trim() : trimmed;
}

// ---------- TRANSLATOR ANA MODÜL ----------
const Translator = (() => {
  let dictMain = {};
  let dictSecond = {};
  let activeMode = 'auto';
  let lastProvider = '-';
  const cache = new Map();
  
  const KEYS = {
    groq: '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',
    openai: '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',
    openrouter: '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'
  };
  
  const SYSTEM_PROMPT = (lang) => `You are a professional anime translator. Translate ${lang} to natural Turkish.
Rules:
- Keep honorifics: -san, -sama, -kun, -chan, -senpai, -sensei
- Keep sound effects (ドン, ガン) as is
- Use natural Turkish expressions, not word-for-word
- Match tone: angry→sert, sad→duygulu, funny→esprili
- Output ONLY the translated lines, same number as input.`;

  async function loadDicts() {
    if (Object.keys(dictMain).length) return;
    try {
      const res = await fetch('./ja_tr.json');
      dictMain = await res.json();
    } catch(e) { dictMain = {}; }
    try {
      const res = await fetch('./ja_tr_anime.json');
      dictSecond = await res.json();
    } catch(e) { dictSecond = {}; }
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
    await loadDicts();
    return postProcess(translateOffline(text, dictMain, dictSecond));
  }
  
  async function translateBatch(lines, lang) {
    const system = SYSTEM_PROMPT(lang === 'ja' ? 'Japanese' : 'English');
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
          return lines.map((_, i) => postProcess(parsed[i] || ''));
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
      await loadDicts();
      const exact = translateOffline(text, dictMain, dictSecond);
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
    preloadModel: loadDicts
  };
})();

// Dışa aktar (global)
const JapaneseTokenizer = { tokenize, translateWithDict: translateOffline };
