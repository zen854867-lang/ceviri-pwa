const Translator = (() => {
  let isOnline = navigator.onLine;
  let pipelineJaEn = null;
  let pipelineEnTr = null;

  window.addEventListener('online',  () => { isOnline = true; });
  window.addEventListener('offline', () => { isOnline = false; });
  function getIsOnline() { return isOnline; }

  async function loadTransformers() {
    if (window.transformersPipeline) return window.transformersPipeline;
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.type = 'module';
      s.textContent = `
        import { pipeline } from 'https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2';
        window.transformersPipeline = pipeline;
        window.dispatchEvent(new Event('transformers-ready'));
      `;
      document.head.appendChild(s);
      window.addEventListener('transformers-ready', () => resolve(window.transformersPipeline), { once: true });
      setTimeout(() => reject(new Error('Transformers yuklenemedi')), 30000);
    });
  }

  async function loadModels() {
    const pipeline = await loadTransformers();
    if (!pipelineJaEn) pipelineJaEn = await pipeline('translation', 'Xenova/opus-mt-ja-en');
    if (!pipelineEnTr) pipelineEnTr = await pipeline('translation', 'Xenova/opus-mt-en-tr');
  }

  async function offlineTranslate(text, sourceLang) {
    await loadModels();
    if (sourceLang === 'ja') {
      const enResult = await pipelineJaEn(text, { max_new_tokens: 512 });
      const enText = enResult[0].translation_text;
      const trResult = await pipelineEnTr(enText, { max_new_tokens: 512 });
      return trResult[0].translation_text;
    } else {
      const result = await pipelineEnTr(text, { max_new_tokens: 512 });
      return result[0].translation_text;
    }
  }

  async function googleTranslate(text, sourceLang) {
    if (!text || !text.trim()) return text;
    const params = new URLSearchParams({
      client: 'gtx', sl: sourceLang, tl: 'tr', dt: 't', q: text
    });
    const res = await fetch('https://translate.googleapis.com/translate_a/single?' + params);
    if (!res.ok) throw new Error('Ceviri hatasi: ' + res.status);
    const data = await res.json();
    if (!data || !data[0]) return text;
    return data[0].filter(i => i && i[0]).map(i => i[0]).join('');
  }

  async function translateBlocks(blocks, sourceLang, useOffline) {
    const results = new Array(blocks.length);
    const BATCH = 5;
    for (let i = 0; i < blocks.length; i += BATCH) {
      const batch = blocks.slice(i, i + BATCH);
      const out = await Promise.all(batch.map(async b => {
        if (!b.trim()) return b;
        if (useOffline) return await offlineTranslate(b, sourceLang);
        return await googleTranslate(b, sourceLang);
      }));
      out.forEach((r, j) => { results[i + j] = r; });
      if (i + BATCH < blocks.length) await new Promise(r => setTimeout(r, 100));
    }
    return results;
  }

  async function translate(text, sourceLang) {
    if (!text || !text.trim()) throw new Error('Metin bos.');
    if (!['en', 'ja'].includes(sourceLang)) throw new Error('Desteklenmeyen dil.');
    const useOffline = !isOnline;
    const sep = '\n|||SEP|||\n';
    const blocks = text.includes('|||SEP|||') ? text.split(sep) : text.split('\n');
    const translated = await translateBlocks(blocks, sourceLang, useOffline);
    return translated.join(text.includes('|||SEP|||') ? sep : '\n');
  }

  async function checkModelExists() { return false; }

  return { translate, getIsOnline, checkModelExists };
})();
