/* ============================================================
   file_handler.js
   .txt ve .srt dosyalarını okur, çıktıyı indirir
   ============================================================ */

const FileHandler = (() => {

  function getFileType(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    if (ext === 'srt') return 'srt';
    if (ext === 'txt') return 'txt';
    if (raw && raw.match(/^\d+\s*\n\d{2}:\d{2}:\d{2}/m)) return 'srt';
 return 'txt';
  }

  function readFile(file) {
    return new Promise((resolve, reject) => {
      if (!file) return reject(new Error('Dosya seçilmedi.'));
      const reader = new FileReader();
      reader.onload = e => {
        const raw = e.target.result;
        const type = getFileType(file.name);
        resolve({ raw, type, name: file.name });
      };
      reader.onerror = () => reject(new Error('Dosya okunamadı.'));
      reader.readAsText(file, 'UTF-8');
    });
  }

  function parseSRT(raw) {
    const blocks = [];
    const normalized = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const parts = normalized.trim().split(/\n\s*\n/);
    for (const part of parts) {
      const lines = part.trim().split('\n');
      if (lines.length < 2) continue;
      const index = lines[0].trim();
      const time  = lines[1].trim();
      const text  = lines.slice(2).join('\n').trim();
      if (!time.includes('-->') || !text) continue;
      const cleanText = text.replace(/<[^>]+>/g, '').trim();
      if (!cleanText) continue;
      blocks.push({ index, time, text: cleanText });
    }
    return blocks;
  }

  function srtToPlainLines(blocks) {
    return blocks.map(b => b.text).join('\n|||SEP|||\n');
  }

  function applyTranslationToSRT(blocks, translatedText) {
    const parts = translatedText.split(/\|\|\|SEP\|\|\|/);
    return blocks.map((block, i) => ({
      ...block,
      translated: (parts[i] || '').trim()
    }));
  }

  function buildSRT(translatedBlocks) {
    return translatedBlocks.map(b =>
      `${b.index}\n${b.time}\n${b.translated}`
    ).join('\n\n');
  }

  function processTXT(raw) {
    return raw.trim();
  }

  function downloadFile(content, originalName, suffix = '_tr') {
    const ext  = originalName.includes('.') ? '.' + originalName.split('.').pop() : '.txt';
    const base = originalName.replace(/\.[^.]+$/, '');
    const filename = `${base}${suffix}${ext}`;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url  = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function downloadTXT(content, filename = 'ceviri_tr.txt') {
    downloadFile(content, filename);
  }

  return {
    readFile, getFileType, parseSRT, srtToPlainLines,
    applyTranslationToSRT, buildSRT, processTXT,
    downloadFile, downloadTXT
  };
})();