/* ============================================================
   file_handler.js
   .txt ve .srt dosyalarını okur, çıktıyı indirir
   ============================================================ */

const FileHandler = (() => {

  /* ---------- Dosya tipi tespiti ---------- */
  function getFileType(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    if (ext === 'srt') return 'srt';
    if (ext === 'txt') return 'txt';
    return null;
  }

  /* ---------- Dosyayı oku ---------- */
  function readFile(file) {
    return new Promise((resolve, reject) => {
      if (!file) return reject(new Error('Dosya seçilmedi.'));

      const type = getFileType(file.name);
      if (!type) return reject(new Error('Sadece .txt ve .srt dosyaları desteklenir.'));

      const reader = new FileReader();

      reader.onload = e => {
        const raw = e.target.result;
        resolve({ raw, type, name: file.name });
      };

      reader.onerror = () => reject(new Error('Dosya okunamadı.'));
      reader.readAsText(file, 'UTF-8');
    });
  }

  /* ============================================================
     SRT PARSER
     Her bloğu: { index, time, lines[] } şeklinde ayırır
     ============================================================ */
  function parseSRT(raw) {
    const blocks = [];
    // Satır sonlarını normalize et
    const normalized = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const parts = normalized.trim().split(/\n\s*\n/);

    for (const part of parts) {
      const lines = part.trim().split('\n');
      if (lines.length < 2) continue;

      const index = lines[0].trim();
      const time  = lines[1].trim();
      const text  = lines.slice(2).join('\n').trim();

      // Geçerli SRT bloğu kontrolü
      if (!time.includes('-->') || !text) continue;

      // HTML taglarını temizle (<i>, <b>, <font> vs)
      const cleanText = text.replace(/<[^>]+>/g, '').trim();
      if (!cleanText) continue;

      blocks.push({ index, time, text: cleanText });
    }

    return blocks;
  }

  /* ---------- SRT bloklarını düz metne çevir (çeviri için) ---------- */
  function srtToPlainLines(blocks) {
    // Her bloğun metnini |||SEP||| ile ayır — çeviriden sonra geri böleceğiz
    return blocks.map(b => b.text).join('\n|||SEP|||\n');
  }

  /* ---------- Çevrilen metni SRT bloklarına geri yaz ---------- */
  function applyTranslationToSRT(blocks, translatedText) {
    const parts = translatedText.split(/\|\|\|SEP\|\|\|/);
    return blocks.map((block, i) => ({
      ...block,
      translated: (parts[i] || '').trim()
    }));
  }

  /* ---------- SRT çıktısı oluştur ---------- */
  function buildSRT(translatedBlocks) {
    return translatedBlocks.map(b =>
      `${b.index}\n${b.time}\n${b.translated}`
    ).join('\n\n');
  }

  /* ---------- TXT dosyasını işle ---------- */
  function processTXT(raw) {
    // Boş satırları koru ama başta/sonda whitespace temizle
    return raw.trim();
  }

  /* ---------- Dosyayı indir ---------- */
  function downloadFile(content, originalName, suffix = '_tr') {
    const ext  = originalName.includes('.') ? '.' + originalName.split('.').pop() : '.txt';
    const base = originalName.replace(/\.[^.]+$/, '');
    const filename = `${base}${suffix}${ext}`;

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url  = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href     = url;
    a.download = filename;
    a.click();

    // Bellek temizliği
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  /* ---------- Metni TXT olarak indir ---------- */
  function downloadTXT(content, filename = 'ceviri_tr.txt') {
    downloadFile(content, filename);
  }

  /* ---------- Public API ---------- */
  return {
    readFile,
    getFileType,
    parseSRT,
    srtToPlainLines,
    applyTranslationToSRT,
    buildSRT,
    processTXT,
    downloadFile,
    downloadTXT
  };

})();
