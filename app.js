(async () => {
  const $ = id => document.getElementById(id);
  const statusDot = $('status-dot'), statusText = $('status-text');
  const btnEn = $('btn-en'), btnJa = $('btn-ja'), inputText = $('input-text'), charCount = $('char-count');
  const btnPaste = $('btn-paste'), btnClear = $('btn-clear');
  const fileInput = $('file-input'), fileZone = $('file-zone'), fileInfo = $('file-info');
  const btnTranslate = $('btn-translate'), offlineToggle = $('offline-toggle'), offlineLabel = $('offline-label');
  const loader = $('loader'), outputPanel = $('output-panel'), outputText = $('output-text');
  const btnCopy = $('btn-copy'), btnDownload = $('btn-download');
  const errorBox = $('error-box'), errorMsg = $('error-msg');
  const footerStatus = $('footer-status');

  let selectedLang = 'ja';
  let currentFile = null, lastOutput = '', lastSRTBlocks = null;

  function updateUI() {
    const online = navigator.onLine;
    const offlineActive = offlineToggle.checked;
    const mode = offlineActive ? 'offline' : 'auto';
    Translator.setMode(mode);
    
    statusDot.className = `dot dot--${online ? 'online' : 'offline'}`;
    statusText.textContent = offlineActive ? '📴 Offline Mod Aktif' : (online ? `🌐 Online · ${Translator.getLastProvider()}` : '📴 Offline (Bağlantı yok)');
    offlineLabel.textContent = offlineActive ? '📴 Offline' : '🌐 Online';
    footerStatus.textContent = offlineActive ? '📴 Offline mod · Yerel sözlük kullanılıyor' : '🌐 Online mod · AI çeviri aktif';
  }

  offlineToggle.addEventListener('change', updateUI);
  window.addEventListener('online', updateUI);
  window.addEventListener('offline', updateUI);
  setInterval(() => { if (!offlineToggle.checked) statusText.textContent = `🌐 Online · ${Translator.getLastProvider()}`; }, 1000);
  
  btnEn.addEventListener('click', () => { selectedLang = 'en'; btnEn.classList.add('active'); btnJa.classList.remove('active'); inputText.placeholder = 'İngilizce metin buraya...'; });
  btnJa.addEventListener('click', () => { selectedLang = 'ja'; btnJa.classList.add('active'); btnEn.classList.remove('active'); inputText.placeholder = 'Japonca metin buraya...'; });
  inputText.addEventListener('input', () => { charCount.textContent = inputText.value.length; errorBox.classList.add('hidden'); });
  btnPaste.addEventListener('click', async () => { try { const t = await navigator.clipboard.readText(); inputText.value = t; charCount.textContent = t.length; } catch { errorMsg.textContent = 'Pano erişimi reddedildi.'; errorBox.classList.remove('hidden'); } });
  btnClear.addEventListener('click', () => { inputText.value = ''; charCount.textContent = 0; currentFile = null; lastSRTBlocks = null; fileInfo.classList.add('hidden'); outputPanel.classList.add('hidden'); errorBox.classList.add('hidden'); });
  fileInput.addEventListener('change', e => { if (e.target.files[0]) handleFile(e.target.files[0]); });
  fileZone.addEventListener('dragover', e => { e.preventDefault(); fileZone.classList.add('drag-over'); });
  fileZone.addEventListener('dragleave', () => fileZone.classList.remove('drag-over'));
  fileZone.addEventListener('drop', e => { e.preventDefault(); fileZone.classList.remove('drag-over'); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); });

  async function handleFile(file) {
    try {
      const res = await FileHandler.readFile(file);
      currentFile = res;
      const isSRT = res.type === 'srt' || res.raw.match(/^\d+\s*\n\d{2}:\d{2}:\d{2}/m);
      if (isSRT) {
        lastSRTBlocks = FileHandler.parseSRT(res.raw);
        inputText.value = FileHandler.srtToPlainLines(lastSRTBlocks);
      } else inputText.value = FileHandler.processTXT(res.raw);
      charCount.textContent = inputText.value.length;
      fileInfo.textContent = `📄 ${file.name}`;
      fileInfo.classList.remove('hidden');
    } catch (e) { errorMsg.textContent = e.message; errorBox.classList.remove('hidden'); }
  }

  btnTranslate.addEventListener('click', async () => {
    const text = inputText.value.trim();
    if (!text) return showError('Metin gir.');
    loader.classList.remove('hidden'); btnTranslate.disabled = true;
    outputPanel.classList.add('hidden'); errorBox.classList.add('hidden');
    try {
      const translated = await Translator.translate(text, selectedLang);
      if (lastSRTBlocks) {
        const tb = FileHandler.applyTranslationToSRT(lastSRTBlocks, translated);
        lastOutput = FileHandler.buildSRT(tb);
        outputText.innerHTML = tb.map(b => `<div class="srt-block"><div class="srt-index">#${b.index}</div><div class="srt-time">${b.time}</div><div class="srt-text">${b.translated}</div></div>`).join('');
      } else { lastOutput = translated; outputText.textContent = translated; }
      outputPanel.classList.remove('hidden');
      updateUI();
    } catch (e) { showError(e.message); }
    finally { loader.classList.add('hidden'); btnTranslate.disabled = false; }
  });

  btnCopy.addEventListener('click', async () => {
    if (!lastOutput) return;
    try { await navigator.clipboard.writeText(lastOutput); btnCopy.textContent = '✅'; setTimeout(() => btnCopy.textContent = '📄', 1500); }
    catch { showError('Kopyalama başarısız.'); }
  });
  btnDownload.addEventListener('click', () => { if (lastOutput) FileHandler.downloadFile(lastOutput, currentFile?.name || 'ceviri.txt', '_tr'); });
  function showError(m) { errorMsg.textContent = m; errorBox.classList.remove('hidden'); }
  Translator.preloadModel();
  updateUI();
})();
