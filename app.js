/* ============================================================
   app.js
   UI olaylarını bağlar, çeviri akışını yönetir
   ============================================================ */

(async () => {

  /* ---------- DOM referansları ---------- */
  const $  = id => document.getElementById(id);
  const statusDot    = $('status-dot');
  const statusText   = $('status-text');
  const btnEn        = $('btn-en');
  const btnJa        = $('btn-ja');
  const inputText    = $('input-text');
  const charCount    = $('char-count');
  const btnPaste     = $('btn-paste');
  const btnClear     = $('btn-clear');
  const fileInput    = $('file-input');
  const fileZone     = $('file-zone');
  const fileInfo     = $('file-info');
  const btnTranslate = $('btn-translate');
  const modeBadge    = $('mode-badge');
  const modeText     = $('mode-text');
  const loader       = $('loader');
  const outputPanel  = $('output-panel');
  const outputText   = $('output-text');
  const btnCopy      = $('btn-copy');
  const btnDownload  = $('btn-download');
  const errorBox     = $('error-box');
  const errorMsg     = $('error-msg');

  /* ---------- Durum ---------- */
  let selectedLang   = 'en';    // 'en' veya 'ja'
  let currentFile    = null;    // { raw, type, name }
  let lastOutput     = '';      // son çeviri sonucu (indirme için)
  let lastSRTBlocks  = null;    // SRT bloklarını sakla

  /* ============================================================
     ONLINE / OFFLINE DURUM GÖSTERGESİ
     ============================================================ */

  function updateStatus() {
    const online = Translator.getIsOnline();

    statusDot.className  = `dot dot--${online ? 'online' : 'offline'}`;
    statusText.textContent = online ? 'Online — Google Translate' : 'Offline — Yerel Model';
    modeBadge.className  = `mode-badge ${online ? 'online' : 'offline'}`;
    modeText.textContent = online ? '🌐 Online mod' : '📴 Offline mod';
  }

  window.addEventListener('online',  updateStatus);
  window.addEventListener('offline', updateStatus);
  updateStatus();

  /* ============================================================
     DİL SEÇİMİ
     ============================================================ */

  function setLang(lang) {
    selectedLang = lang;
    btnEn.classList.toggle('selected', lang === 'en');
    btnJa.classList.toggle('selected', lang === 'ja');

    // Placeholder güncelle
    inputText.placeholder = lang === 'ja'
      ? 'Japonca metin buraya... (例: こんにちは)'
      : 'İngilizce metin buraya...';
  }

  btnEn.addEventListener('click', () => setLang('en'));
  btnJa.addEventListener('click', () => setLang('ja'));
  setLang('en'); // varsayılan

  /* ============================================================
     METİN GİRİŞİ
     ============================================================ */

  inputText.addEventListener('input', () => {
    charCount.textContent = inputText.value.length;
    // Metin yazılınca dosya bilgisini sıfırla
    if (currentFile && inputText.value !== currentFile.raw) {
      currentFile = null;
      fileInfo.textContent = '';
      fileInfo.classList.add('hidden');
    }
    hideError();
  });

  /* ---------- Panodan yapıştır ---------- */
  btnPaste.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      inputText.value = text;
      charCount.textContent = text.length;
      currentFile = null;
      hideError();
    } catch {
      showError('Pano erişimi reddedildi. Tarayıcı izni gerekiyor.');
    }
  });

  /* ---------- Temizle ---------- */
  btnClear.addEventListener('click', () => {
    inputText.value       = '';
    charCount.textContent = 0;
    currentFile           = null;
    lastSRTBlocks         = null;
    fileInfo.textContent  = '';
    fileInfo.classList.add('hidden');
    outputPanel.classList.add('hidden');
    hideError();
  });

  /* ============================================================
     DOSYA YÜKLEMESİ
     ============================================================ */

  fileInput.addEventListener('change', e => {
    if (e.target.files[0]) handleFile(e.target.files[0]);
  });

  // Sürükle - bırak
  fileZone.addEventListener('dragover', e => {
    e.preventDefault();
    fileZone.classList.add('drag-over');
  });

  fileZone.addEventListener('dragleave', () => {
    fileZone.classList.remove('drag-over');
  });

  fileZone.addEventListener('drop', e => {
    e.preventDefault();
    fileZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  });

  async function handleFile(file) {
    hideError();
    try {
      const result = await FileHandler.readFile(file);
      currentFile   = result;
      lastSRTBlocks = null;

      if (result.type === 'srt') {
        // SRT: bloklara ayır, düz metin göster
        const blocks = FileHandler.parseSRT(result.raw);
        if (blocks.length === 0) throw new Error('SRT dosyasında geçerli blok bulunamadı.');
        lastSRTBlocks   = blocks;
        const plainText = FileHandler.srtToPlainLines(blocks);
        inputText.value = plainText;
        charCount.textContent = plainText.length;
        showFileInfo(`📄 ${file.name} — ${blocks.length} altyazı bloğu yüklendi`);
      } else {
        // TXT
        const text = FileHandler.processTXT(result.raw);
        inputText.value = text;
        charCount.textContent = text.length;
        showFileInfo(`📄 ${file.name} yüklendi`);
      }
    } catch (err) {
      showError(err.message);
    }
  }

  function showFileInfo(msg) {
    fileInfo.textContent = msg;
    fileInfo.classList.remove('hidden');
  }

  /* ============================================================
     ÇEVİRİ
     ============================================================ */

  btnTranslate.addEventListener('click', startTranslation);

  async function startTranslation() {
    const text = inputText.value.trim();
    if (!text) { showError('Lütfen çevirmek istediğin metni gir.'); return; }

    // UI kilitle
    setLoading(true);
    hideError();
    outputPanel.classList.add('hidden');

    try {
      const translated = await Translator.translate(text, selectedLang);

      if (lastSRTBlocks) {
        // SRT modu: bloklara geri uygula ve göster
        const translatedBlocks = FileHandler.applyTranslationToSRT(lastSRTBlocks, translated);
        lastOutput = FileHandler.buildSRT(translatedBlocks);
        renderSRT(translatedBlocks);
      } else {
        // Düz metin modu
        lastOutput = translated;
        outputText.textContent = translated;
      }

      outputPanel.classList.remove('hidden');
    } catch (err) {
      showError(`Çeviri başarısız: ${err.message}`);
    } finally {
      setLoading(false);
    }
  }

  /* ---------- SRT render ---------- */
  function renderSRT(blocks) {
    outputText.innerHTML = blocks.map(b => `
      <div class="srt-block">
        <div class="srt-index">#${b.index}</div>
        <div class="srt-time">${b.time}</div>
        <div class="srt-text">${escapeHTML(b.translated)}</div>
      </div>
    `).join('');
  }

  function escapeHTML(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /* ============================================================
     KOPYALA / İNDİR
     ============================================================ */

  btnCopy.addEventListener('click', async () => {
    if (!lastOutput) return;
    try {
      await navigator.clipboard.writeText(lastOutput);
      btnCopy.textContent = '✅';
      setTimeout(() => { btnCopy.textContent = '📄'; }, 1500);
    } catch {
      showError('Kopyalama başarısız. Tarayıcı izni gerekiyor.');
    }
  });

  btnDownload.addEventListener('click', () => {
    if (!lastOutput) return;
    const filename = currentFile ? currentFile.name : 'ceviri.txt';
    FileHandler.downloadFile(lastOutput, filename, '_tr');
  });

  /* ============================================================
     YARDIMCI FONKSİYONLAR
     ============================================================ */

  function setLoading(active) {
    btnTranslate.disabled = active;
    loader.classList.toggle('hidden', !active);
    if (active) {
      btnTranslate.querySelector('.btn-text').textContent = 'Çevriliyor...';
    } else {
      btnTranslate.querySelector('.btn-text').textContent = 'Çevir';
    }
  }

  function showError(msg) {
    errorMsg.textContent = msg;
    errorBox.classList.remove('hidden');
  }

  function hideError() {
    errorBox.classList.add('hidden');
    errorMsg.textContent = '';
  }

  /* ---------- Model durumunu kontrol et ---------- */
  async function checkModels() {
    if (Translator.getIsOnline()) {
      showError('📥 Offline model arka planda indiriliyor...');
      try {
        await Translator.preloadModel('en');
        await Translator.preloadModel('ja');
        hideError();
        showError('✅ Offline model hazır!');
        setTimeout(hideError, 3000);
      } catch(e) {
        hideError();
      }
    }
  }

  checkModels();

})();
