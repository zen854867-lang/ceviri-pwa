/* ============================================================
   Professional Japanese Translator v5.0
   Gelişmiş Kök Bulma, Akıllı Segmentasyon, Çift Sözlük Desteği
   Tamamen Yeniden Yazıldı - Tüm Eksikler Giderildi
   ============================================================ */

// ---------- KARAKTER TÜRÜ ----------
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

// ---------- PARTİKÜLLER ----------
const PARTICLES = new Set([
  'は','が','を','に','で','と','も','の','から','まで','より','へ','や','か','な','ね','よ','わ','ぞ','ぜ','さ',
  'など','とか','って','て','には','では','とは','のは','からは','までは','よりは','へは','ので','のに','けど',
  'けれど','けれども','し','たり','ながら','ば','たら','なら','ても','でも','とも','ては','ちゃ','じゃ',
  'きゃ','ぎゃ','かい','だい','かな','かしら','さえ','すら','こそ','だけ','のみ','ばかり','くらい','ぐらい',
  'ほど','までに','うちに','として','にとって','において','によって','に対して','に関して','にて','をもって'
]);

// ---------- BİLEŞİK İFADELER ----------
const COMPOUND_PATTERNS = [
  'しなければならない','しなければいけない','しなきゃならない','しなきゃいけない',
  'しなくてはならない','しなくてはいけない','せねばならない','せざるを得ない',
  'することができる','することができない','することがある','できるようになる',
  'してもいい','してはいけない','しなくてもいい','してもかまわない',
  'かもしれない','にちがいない','はずがない','はずだ','ようだ','みたいだ',
  'らしい','っぽい','そうだ','そうもない',
  'ことになる','ことにする','ようになる','ようにする',
  'ずっと前から','ずっと昔から','今まで','これから','それから','あれから',
  'そのうち','いつから','いつまで','いつの間にか',
  'てしまった','てしまう','ちゃった','じゃった',
  'ておいた','ておく','といた','とく',
  'てみた','てみる','てみたい',
  'てあげる','てもらう','てくれる',
  'なければならない','なければいけない','なくてはいけない',
  'わけではない','わけにはいかない','ほかはない',
  'にきまっている','にそういない','といってもいい',
  'どころか','ばかりか','のみならず',
  'としても','としたって','にしても',
  'からといって','からには','以上',
  'たびに','おかげで','せいで','くせに',
  'なければよかった','てもいいですか','たほうがいい',
  'させられる','させられた','させられたくない','させられたくなかった'
];

const SORTED_COMPOUNDS = [...COMPOUND_PATTERNS].sort((a,b) => b.length - a.length);
const SORTED_PARTICLES = [...PARTICLES].sort((a,b) => b.length - a.length);

// ---------- SAYAÇLAR ----------
const COUNTERS = ['匹','本','枚','台','回','歳','円','時','分','日','月','年','人','個','冊','杯','階','件'];
function handleCounters(token) {
  const match = token.match(/^([一二三四五六七八九十百千万０-９\d]+)([匹本枚台回歳円時分日月年人個冊杯階件])$/);
  if (match) return [match[1], match[2]];
  return [token];
}

// ---------- GELİŞMİŞ KÖK BULMA (STEMMING) ----------
function getStemCandidates(token) {
  const candidates = new Set();
  
  // 1. Özel fiiller
  if (token === 'した' || token === 'し' || token === 'せ' || token === 'さ' || token === 'する') candidates.add('する');
  if (token === '来た' || token === 'き' || token === 'こ' || token === 'くる') candidates.add('来る');
  if (token === '行った') candidates.add('行く');
  if (token === '言った') candidates.add('言う');
  if (token === 'やった') candidates.add('やる');
  if (token === 'できた') candidates.add('できる');
  
  // 2. İ-sıfatları
  if (token.endsWith('かった')) candidates.add(token.slice(0, -3) + 'い');
  if (token.endsWith('くて')) candidates.add(token.slice(0, -2) + 'い');
  if (token.endsWith('ければ')) candidates.add(token.slice(0, -4) + 'い');
  if (token.endsWith('くない')) candidates.add(token.slice(0, -3) + 'い');
  if (token.endsWith('くなかった')) candidates.add(token.slice(0, -5) + 'い');
  
  // 3. Na-sıfatları
  if (token.endsWith('だった')) candidates.add(token.slice(0, -3) + 'だ');
  if (token.endsWith('ではなかった')) candidates.add(token.slice(0, -6) + 'だ');
  
  // 4. Ichidan fiiller
  if (token.endsWith('る') && token.length > 1) {
    const prev = token.slice(-2, -1);
    if (/[いきしちにひみりぎじぢびぴえけせてねへめれげぜでべぺ]/.test(prev)) {
      candidates.add(token);
    }
  }
  
  // 5. Godan fiiller - grup bazlı
  const godanGroups = {
    'う': ['わ','い','え','お','って','った'],
    'く': ['か','き','け','こ','いて','いた'],
    'ぐ': ['が','ぎ','げ','ご','いで','いだ'],
    'す': ['さ','し','せ','そ','して','した'],
    'つ': ['た','ち','て','と','って','った'],
    'ぬ': ['な','に','ね','の','んで','んだ'],
    'ぶ': ['ば','び','べ','ぼ','んで','んだ'],
    'む': ['ま','み','め','も','んで','んだ'],
    'る': ['ら','り','れ','ろ','って','った']
  };
  
  for (const [base, suffixes] of Object.entries(godanGroups)) {
    for (const suff of suffixes) {
      if (token.endsWith(suff) && token.length > suff.length) {
        candidates.add(token.slice(0, -suff.length) + base);
      }
    }
  }
  
  // 6. Edilgen / ettirgen / edilgen-ettirgen
  if (token.endsWith('られる')) {
    candidates.add(token.slice(0, -3) + 'る');
  }
  if (token.endsWith('させる')) candidates.add(token.slice(0, -3) + 'る');
  if (token.endsWith('される')) candidates.add(token.slice(0, -3) + 'する');
  if (token.endsWith('させられる')) {
    candidates.add(token.slice(0, -5) + 'る');
    candidates.add(token.slice(0, -5) + 'する');
  }
  
  // 7. たく (istek eki) ve なかった (olumsuz geçmiş)
  if (token.endsWith('たくなかった')) {
    const stem = token.slice(0, -6);
    candidates.add(stem + 'る');
    candidates.add(stem + 'い');
  } else if (token.endsWith('なかった')) {
    const stem = token.slice(0, -4);
    candidates.add(stem + 'る');
    candidates.add(stem + 'い');
  } else if (token.endsWith('たく')) {
    const stem = token.slice(0, -2);
    candidates.add(stem + 'る');
  }
  
  // 8. て形 ve た形 genel
  const teTaMap = {
    'って':'う', 'った':'う', 'いて':'く', 'いた':'く', 'いで':'ぐ', 'いだ':'ぐ',
    'して':'す', 'した':'す', 'て':'つ', 'た':'つ', 'んで':'ぬ', 'んだ':'ぬ',
    'って':'る', 'った':'る', 'んで':'ぶ', 'んだ':'ぶ', 'んで':'む', 'んだ':'む'
  };
  for (const [suff, repl] of Object.entries(teTaMap)) {
    if (token.endsWith(suff) && token.length > suff.length) {
      candidates.add(token.slice(0, -suff.length) + repl);
    }
  }
  
  // 9. ちゃう / じゃう
  if (token.endsWith('ちゃう')) candidates.add(token.slice(0, -3) + 'る');
  if (token.endsWith('じゃう')) candidates.add(token.slice(0, -3) + 'る');
  
  if (candidates.size === 0) candidates.add(token);
  return Array.from(candidates);
}

// Sözlükteki ilk geçerli anlamı döndür
function getBestStem(token, dict) {
  const candidates = getStemCandidates(token);
  for (const cand of candidates) {
    if (dict[cand] && isValidMeaning(dict[cand])) return cand;
  }
  return token;
}

// ---------- BİLEŞİK İSİM BÖLÜCÜ ----------
let kanjiCandidateList = [];
function buildKanjiList(dict) {
  kanjiCandidateList = Object.keys(dict).filter(k => /^[\u4E00-\u9FFF]+$/.test(k) && isValidMeaning(dict[k]));
  kanjiCandidateList.sort((a,b) => b.length - a.length);
}

function splitCompoundNoun(kanjiWord, dict) {
  const parts = [];
  let remaining = kanjiWord;
  while (remaining.length > 0) {
    let matched = false;
    for (const cand of kanjiCandidateList) {
      if (remaining.startsWith(cand)) {
        parts.push(cand);
        remaining = remaining.slice(cand.length);
        matched = true;
        break;
      }
    }
    if (!matched) {
      parts.push(remaining[0]);
      remaining = remaining.slice(1);
    }
  }
  return parts;
}

// ---------- TOKENİZASYON ----------
function splitByCharType(text) {
  const segments = [];
  let cur = '', curType = null;
  for (const ch of text) {
    const t = charType(ch);
    if (t === 'PUNCT' || t === 'OTHER') {
      if (cur) segments.push(cur);
      if (ch === ' ' || ch === '\t' || ch === '\n') {
        segments.push(ch);
      } else if (ch.trim()) {
        segments.push(ch);
      }
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

function splitSegment(seg, depth = 0) {
  if (!seg || depth > 10) return [seg];
  for (const comp of SORTED_COMPOUNDS) {
    if (seg === comp) return [comp];
    if (seg.endsWith(comp) && seg.length > comp.length) {
      return [...splitSegment(seg.slice(0, -comp.length), depth+1), comp];
    }
  }
  if (PARTICLES.has(seg)) return [seg];
  if (seg.length >= 2) {
    for (const p of SORTED_PARTICLES) {
      const idx = seg.indexOf(p);
      if (idx !== -1) {
        if (idx === 0) return [p, ...splitSegment(seg.slice(p.length), depth+1)];
        if (idx + p.length === seg.length) return [...splitSegment(seg.slice(0, idx), depth+1), p];
        if (idx > 0 && idx + p.length < seg.length) {
          return [...splitSegment(seg.slice(0, idx), depth+1), p, ...splitSegment(seg.slice(idx + p.length), depth+1)];
        }
      }
    }
  }
  if (seg.endsWith('する') && seg.length > 2) {
    return [...splitSegment(seg.slice(0, -2), depth+1), 'する'];
  }
  return [seg];
}

const tokenCache = new Map();
function tokenize(text) {
  if (!text) return [];
  if (tokenCache.has(text)) return tokenCache.get(text);
  const trimmed = text.trim();
  if (!trimmed) return [];
  const rawSegments = splitByCharType(trimmed);
  let tokens = [];
  for (const seg of rawSegments) {
    tokens.push(...splitSegment(seg));
  }
  const finalTokens = [];
  for (const tok of tokens) {
    finalTokens.push(...handleCounters(tok));
  }
  const filtered = finalTokens.filter(t => t.length > 0);
  if (tokenCache.size > 500) tokenCache.delete(tokenCache.keys().next().value);
  tokenCache.set(text, filtered);
  return filtered;
}

// ---------- SÖZLÜK DEĞER GEÇERLİLİK ----------
function isValidMeaning(val) {
  if (typeof val !== 'string' || val.length === 0) return false;
  let cleaned = val.replace(/\([^)]*\)/g, '').trim();
  if (cleaned.length === 0) cleaned = val.replace(/[()]/g, '').trim();
  if (cleaned.length === 0) return false;
  if (/^[\s.,!?;:]+$/.test(cleaned)) return false;
  const lower = cleaned.toLowerCase();
  const stop = ['de','da','ve','ise','ama','gibi','ile','için','bir','bu','şu','o','diş'];
  if (stop.includes(lower) && lower.length <= 3) return false;
  if (/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/.test(cleaned)) return false;
  return true;
}

// ---------- TRIE ----------
let trieRoot = { children: {}, isEnd: false, value: null };
function buildTrie(dict) {
  const root = { children: {}, isEnd: false, value: null };
  for (const [key, val] of Object.entries(dict)) {
    if (!isValidMeaning(val)) continue;
    let node = root;
    for (const ch of key) {
      if (!node.children[ch]) node.children[ch] = { children: {}, isEnd: false };
      node = node.children[ch];
    }
    node.isEnd = true;
    node.value = val;
  }
  return root;
}
function longestMatch(tokens, startIdx, trie) {
  let node = trie;
  let lastVal = null;
  let matchLen = 0;
  for (let i = startIdx; i < tokens.length; i++) {
    const tok = tokens[i];
    for (const ch of tok) {
      if (!node.children[ch]) return lastVal ? { val: lastVal, len: matchLen } : null;
      node = node.children[ch];
    }
    if (node.isEnd) {
      lastVal = node.value;
      matchLen = i - startIdx + 1;
    }
  }
  return lastVal ? { val: lastVal, len: matchLen } : null;
}

// ---------- OFFLINE ÇEVİRİ ----------
function translateOffline(text, dict) {
  const trimmed = text.trim();
  if (!trimmed) return '';
  if (!PARTICLES.has(trimmed)) {
    const exact = dict[trimmed];
    if (exact && isValidMeaning(exact)) return exact;
  }
  const tokens = tokenize(trimmed);
  if (!tokens.length) return trimmed;
  
  const resultParts = [];
  let i = 0;
  while (i < tokens.length) {
    const tok = tokens[i];
    if (PARTICLES.has(tok)) { i++; continue; }
    
    const match = longestMatch(tokens, i, trieRoot);
    if (match && match.len > 0) {
      resultParts.push(match.val);
      i += match.len;
      continue;
    }
    
    const bestStem = getBestStem(tok, dict);
    if (bestStem !== tok) {
      const stemMeaning = dict[bestStem];
      if (stemMeaning && isValidMeaning(stemMeaning)) {
        resultParts.push(stemMeaning);
        i++;
        continue;
      }
    }
    
    if (/^[\u4E00-\u9FFF]+$/.test(tok) && tok.length > 1) {
      const subParts = splitCompoundNoun(tok, dict);
      if (subParts.length > 1) {
        const translated = subParts.map(p => dict[p] || `[?${p}]`).filter(x => !x.startsWith('[?')).join(' ');
        if (translated.trim()) {
          resultParts.push(translated);
          i++;
          continue;
        }
      }
    }
    
    const isJapanese = /[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/.test(tok);
    if (!isJapanese && !PARTICLES.has(tok)) resultParts.push(tok);
    else if (isJapanese && !PARTICLES.has(tok)) resultParts.push(`[?${tok}]`);
    i++;
  }
  
  const final = resultParts.length > 0 ? resultParts.join(' ').replace(/\s+/g, ' ').trim() : trimmed;
  if (final.replace(/\[\?[^\]]+\]/g, '').trim().length === 0) return trimmed;
  return final;
}

function clearCache() { tokenCache.clear(); }

// ---------- GLOBAL API ----------
const JapaneseTokenizer = {
  tokenize,
  translateWithDict: translateOffline,
  clearCache,
  buildTrie,
  setTrieRoot: (trie) => { trieRoot = trie; },
  buildKanjiList,
  PARTICLES
};
/* ============================================================
   Translator — Ana Çeviri Motoru
   ============================================================ */
const Translator = (() => {
  let dictMain = {};
  let activeMode = 'auto';
  let lastProvider = '-';
  const cache = new Map();
  
  // UYARI: API anahtarları client-side açıktır. Güvenlik riski taşır.
  // Gerçek projede sunucu tarafı proxy kullanılması önerilir.
  const KEYS = {
    groq: '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',
    openai: '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',
    openrouter: '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',
    gemini: '' // İsteğe bağlı: Gemini API anahtarı
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
      // Trie ve Kanji listesini bir kere kur
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
