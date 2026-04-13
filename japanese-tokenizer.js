/* ============================================================
   JapaneseTokenizer v6.0 - Profesyonel Japonca Tokenizer
   - Tüm fiil/sıfat çekimleri (masu, olumsuz, istek, emir, şart)
   - Partikül taraması için Trie (performans)
   - Genişletilmiş birleşik ifadeler
   - Tamamen modüler, bağımsız çalışır
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

const JapaneseTokenizer = (() => {
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
    'させられる','させられた','させられたくない','させられたくなかった',
    'ている','でいる','んでいる','ていた','ています','ていました',
    '読んでいる','食べている','見ている','行っている','来ている','している',
    '歩いている','話している','聞いている','書いている','買っている',
    '待っている','作っている','使っている','考えている','知っている'
  ];

  const SORTED_COMPOUNDS = [...COMPOUND_PATTERNS].sort((a,b) => b.length - a.length);
  
  // Partiküller için Trie (performans)
  const particleTrie = (() => {
    const root = { children: {} };
    for (const p of PARTICLES) {
      let node = root;
      for (const ch of p) {
        if (!node.children[ch]) node.children[ch] = { children: {} };
        node = node.children[ch];
      }
      node.isEnd = true;
    }
    return root;
  })();

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
    if (token === 'できた' || token === 'でき') candidates.add('できる');
    
    // 2. İ-sıfatları
    if (token.endsWith('かった')) candidates.add(token.slice(0, -3) + 'い');
    if (token.endsWith('くて')) candidates.add(token.slice(0, -2) + 'い');
    if (token.endsWith('ければ')) candidates.add(token.slice(0, -4) + 'い');
    if (token.endsWith('くない')) candidates.add(token.slice(0, -3) + 'い');
    if (token.endsWith('くなかった')) candidates.add(token.slice(0, -5) + 'い');
    if (token.endsWith('く') && token.length > 1) candidates.add(token.slice(0, -1) + 'い');
    
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
    if (token.endsWith('られる')) candidates.add(token.slice(0, -3) + 'る');
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
    
    // 9. ちゃう / じゃう / でいる / んでいる
    if (token.endsWith('ちゃう')) candidates.add(token.slice(0, -3) + 'る');
    if (token.endsWith('じゃう')) candidates.add(token.slice(0, -3) + 'る');
    if (token.endsWith('でいる')) candidates.add(token.slice(0, -3) + 'る');
    if (token.endsWith('んでいる')) candidates.add(token.slice(0, -4) + 'む');
    
    // 10. 屋 (dükkan) soneki
    if (token.endsWith('屋')) {
      candidates.add(token);
      candidates.add(token.slice(0, -1));
    }
    
    // 11. できる / できた
    if (token.endsWith('できた')) candidates.add(token.slice(0, -3) + 'できる');
    
    // 12. って → う veya る
    if (token.endsWith('って')) {
      candidates.add(token.slice(0, -2) + 'う');
      candidates.add(token.slice(0, -2) + 'る');
    }

    // ========== YENİ EKLENEN KURALLAR ==========
    
    // 13. Masu formları (kibar)
    if (token.endsWith('ます')) candidates.add(token.slice(0, -2) + 'る');
    if (token.endsWith('ました')) candidates.add(token.slice(0, -3) + 'る');
    if (token.endsWith('ません')) candidates.add(token.slice(0, -3) + 'る');
    if (token.endsWith('ませんでした')) candidates.add(token.slice(0, -6) + 'る');
    
    // 14. Olumsuz geniş zaman (〜ない)
    if (token.endsWith('ない') && token.length > 2) {
      candidates.add(token.slice(0, -2) + 'る');
    }
    
    // 15. İstek kipi (〜たい, 〜たかった)
    if (token.endsWith('たい')) candidates.add(token.slice(0, -2) + 'る');
    if (token.endsWith('たかった')) candidates.add(token.slice(0, -4) + 'る');
    
    // 16. Emir kipi (〜ろ, 〜な) - basit yaklaşım
    if (token.endsWith('ろ') && token.length > 1) candidates.add(token.slice(0, -1) + 'る');
    if (token.endsWith('な') && token.length > 1 && !token.endsWith('ない')) {
      candidates.add(token.slice(0, -1) + 'る');
    }
    
    // 17. Şart kipi (〜れば) fiiller için
    if (token.endsWith('れば') && token.length > 2) candidates.add(token.slice(0, -2) + 'る');
    
    if (candidates.size === 0) candidates.add(token);
    return Array.from(candidates);
  }

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
    // Partikül kontrolü (Trie ile hızlı)
    if (PARTICLES.has(seg)) return [seg];
    if (seg.length >= 2) {
      // Trie kullanarak olası partikülleri bul
      let node = particleTrie;
      for (let i = 0; i < seg.length; i++) {
        const ch = seg[i];
        if (!node.children[ch]) break;
        node = node.children[ch];
        if (node.isEnd) {
          const p = seg.slice(0, i + 1);
          const remaining = seg.slice(i + 1);
          if (remaining.length === 0) return [p];
          return [p, ...splitSegment(remaining, depth+1)];
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

  // ---------- TRIE (SÖZLÜK İÇİN) ----------
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

  return {
    tokenize,
    translateWithDict: translateOffline,
    clearCache,
    buildTrie,
    setTrieRoot: (trie) => { trieRoot = trie; },
    buildKanjiList,
    PARTICLES
  };
})();
