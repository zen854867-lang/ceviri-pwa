(async () => {
  const $ = id => document.getElementById(id);
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

  let selectedLang  = 'en';
  let currentFile   = null;
  let lastOutput    = '';
  let lastSRTBlocks = null;

  /* ---------- Durum ---------- */
   function updateStatus() {
    const online = navigator.onLine;
    statusDot.className = `dot dot--${online ? 'online' : 'offline'}`;
    statusText.textContent = online ? `Online — ${Translator.getLastProvider()}` : 'Offline — Yerel Sözlük ✅';
    modeBadge.className = `mode-badge ${online ? 'online' : 'offline'}`;
    modeText.textContent = online ? `🤖 ${Translator.getLastProvider()}` : '📴 Offline';
  }

  window.addEventListener('online',  updateStatus);
  window.addEventListener('offline', updateStatus);
  setInterval(updateStatus, 1000);
  updateStatus();

  /* ---------- Dil ---------- */
  function setLang(lang) {
    selectedLang = lang;
    btnEn.classList.toggle('selected', lang === 'en');
    btnJa.classList.toggle('selected', lang === 'ja');
    inputText.placeholder = lang === 'ja' ? 'Japonca metin buraya...' : 'İngilizce metin buraya...';
  }
  btnEn.addEventListener('click', () => setLang('en'));
  btnJa.addEventListener('click', () => setLang('ja'));
  setLang('en');

  /* ---------- Metin ---------- */
  inputText.addEventListener('input', () => {
    charCount.textContent = inputText.value.length;
    hideError();
  });

  btnPaste.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      inputText.value = text;
      charCount.textContent = text.length;
      hideError();
    } catch { showError('Pano erişimi reddedildi.'); }
  });

  btnClear.addEventListener('click', () => {
    inputText.value = '';
    charCount.textContent = 0;
    currentFile = null;
    lastSRTBlocks = null;
    fileInfo.textContent = '';
    fileInfo.classList.add('hidden');
    outputPanel.classList.add('hidden');
    hideError();
  });

  /* ---------- Dosya ---------- */
  fileInput.addEventListener('change', e => { if (e.target.files[0]) handleFile(e.target.files[0]); });
  fileZone.addEventListener('dragover', e => { e.preventDefault(); fileZone.classList.add('drag-over'); });
  fileZone.addEventListener('dragleave', () => fileZone.classList.remove('drag-over'));
  fileZone.addEventListener('drop', e => {
    e.preventDefault();
    fileZone.classList.remove('drag-over');
    if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
  });

  async function handleFile(file) {
    hideError();
    try {
      const result = await FileHandler.readFile(file);
      currentFile = result;
      lastSRTBlocks = null;
      const isSRT = result.type === 'srt' || result.raw.match(/^\d+\s*\n\d{2}:\d{2}:\d{2}/m);
      if (isSRT) {
        const blocks = FileHandler.parseSRT(result.raw);
        if (!blocks.length) throw new Error('SRT dosyasında geçerli blok bulunamadı.');
        lastSRTBlocks = blocks;
        inputText.value = FileHandler.srtToPlainLines(blocks);
        charCount.textContent = inputText.value.length;
        showFileInfo(`📄 ${file.name} — ${blocks.length} altyazı bloğu yüklendi`);
      } else {
        inputText.value = FileHandler.processTXT(result.raw);
        charCount.textContent = inputText.value.length;
        showFileInfo(`📄 ${file.name} yüklendi`);
      }
    } catch (err) { showError(err.message); }
  }

  function showFileInfo(msg) {
    fileInfo.textContent = msg;
    fileInfo.classList.remove('hidden');
  }

  /* ---------- Çeviri ---------- */
  btnTranslate.addEventListener('click', async () => {
    const text = inputText.value.trim();
    if (!text) { showError('Metin gir.'); return; }
    setLoading(true);
    hideError();
    outputPanel.classList.add('hidden');
    try {
      const translated = await Translator.translate(text, selectedLang);
      if (lastSRTBlocks) {
        const tb = FileHandler.applyTranslationToSRT(lastSRTBlocks, translated);
        lastOutput = FileHandler.buildSRT(tb);
        outputText.innerHTML = tb.map(b => `
          <div class="srt-block">
            <div class="srt-index">#${b.index}</div>
            <div class="srt-time">${b.time}</div>
            <div class="srt-text">${b.translated.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
          </div>`).join('');
      } else {
        lastOutput = translated;
        outputText.textContent = translated;
      }
      outputPanel.classList.remove('hidden');
    } catch (err) {
      showError(`Çeviri başarısız: ${err.message}`);
    } finally {
      setLoading(false);
    }
  });

  /* ---------- Kopyala / İndir ---------- */
  btnCopy.addEventListener('click', async () => {
    if (!lastOutput) return;
    try {
      await navigator.clipboard.writeText(lastOutput);
      btnCopy.textContent = '✅';
      setTimeout(() => { btnCopy.textContent = '📄'; }, 1500);
    } catch { showError('Kopyalama başarısız.'); }
  });

  btnDownload.addEventListener('click', () => {
    if (!lastOutput) return;
    FileHandler.downloadFile(lastOutput, currentFile ? currentFile.name : 'ceviri.txt', '_tr');
  });

  /* ---------- Yardımcı ---------- */
  function setLoading(active) {
    btnTranslate.disabled = active;
    loader.classList.toggle('hidden', !active);
    btnTranslate.querySelector('.btn-text').textContent = active ? 'Çevriliyor...' : 'Çevir';
  }

  function showError(msg) { errorMsg.textContent = msg; errorBox.classList.remove('hidden'); }
  function hideError() { errorBox.classList.add('hidden'); errorMsg.textContent = ''; }

  // Sözlüğü arka planda yükle
  Translator.preloadModel();

})();
    
