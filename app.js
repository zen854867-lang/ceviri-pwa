(async () => {
  const $ = id => document.getElementById(id);
  
  // UI Elementleri
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
  
  // YENİ UI Elementleri
  const offlineToggle = $('offline-toggle');
  const offlineLabel = $('offline-label');
  const providerSelect = $('provider-select');
  const providerSelector = $('provider-selector');
  const footerStatus = $('footer-status');

  let selectedLang  = 'en';
  let currentFile   = null;
  let lastOutput    = '';
  let lastSRTBlocks = null;
  
  // localStorage anahtarları
  const STORAGE_KEYS = {
    offline: 'translator_offline_mode',
    provider: 'translator_provider'
  };

  /* ---------- localStorage Yönetimi ---------- */
  function loadSettings() {
    // Offline mod tercihi
    const savedOffline = localStorage.getItem(STORAGE_KEYS.offline);
    if (savedOffline !== null) {
      offlineToggle.checked = savedOffline === 'true';
    }
    
    // Sağlayıcı tercihi
    const savedProvider = localStorage.getItem(STORAGE_KEYS.provider);
    if (savedProvider) {
      providerSelect.value = savedProvider;
    }
    
    // Ayarları uygula
    applyMode();
  }

  function saveSettings() {
    localStorage.setItem(STORAGE_KEYS.offline, offlineToggle.checked);
    localStorage.setItem(STORAGE_KEYS.provider, providerSelect.value);
  }

  /* ---------- Mod Uygulama ---------- */
  function applyMode() {
    const isOffline = offlineToggle.checked;
    const provider = providerSelect.value;
    
    // Translator modunu ayarla
    if (isOffline) {
      Translator.setMode('offline');
    } else {
      Translator.setMode(provider);
    }
    
    // UI güncelle
    updateUIForMode(isOffline, provider);
    updateStatus();
    
    // Ayarları kaydet
    saveSettings();
  }

  function updateUIForMode(isOffline, provider) {
    // Offline etiketi
    offlineLabel.textContent = isOffline ? '📴 Offline Mod Aktif' : '🌐 Online Mod Aktif';
    
    // Sağlayıcı seçici (offline'da devre dışı)
    if (providerSelector) {
      providerSelector.style.opacity = isOffline ? '0.5' : '1';
      providerSelect.disabled = isOffline;
    }
    
    // Mode badge
    if (isOffline) {
      modeBadge.className = 'mode-badge offline';
      modeText.textContent = '📴 Offline';
    } else {
      modeBadge.className = 'mode-badge online';
      const providerNames = {
        'auto': '⚡ Otomatik',
        'groq': '🚀 Groq',
        'openai': '🧠 GPT-4o-mini',
        'openrouter': '🌐 OpenRouter',
        'google': '🔤 Google'
      };
      modeText.textContent = providerNames[provider] || provider;
    }
    
    // Footer durumu
    if (footerStatus) {
      if (isOffline) {
        footerStatus.textContent = '📴 Offline mod · Sadece yerel sözlük kullanılıyor';
      } else {
        const providerName = providerSelect.options[providerSelect.selectedIndex]?.text || provider;
        footerStatus.textContent = `🌐 Online mod · Sağlayıcı: ${providerName}`;
      }
    }
  }

  /* ---------- Durum Güncelleme (Bağlantı + Mod) ---------- */
  function updateStatus() {
    const online = navigator.onLine;
    const isOfflineMode = offlineToggle.checked;
    const provider = Translator.getLastProvider();
    
    // Bağlantı noktası
    statusDot.className = `dot dot--${online ? 'online' : 'offline'}`;
    
    // Durum metni
    if (!online) {
      statusText.textContent = 'Offline — İnternet bağlantısı yok';
    } else if (isOfflineMode) {
      statusText.textContent = 'Offline Mod — Yerel Sözlük Kullanılıyor';
    } else {
      statusText.textContent = `Online — ${provider !== '-' ? provider : 'Hazır'}`;
    }
  }

  /* ---------- Event Listeners ---------- */
  // Offline toggle
  offlineToggle.addEventListener('change', () => {
    applyMode();
    updateStatus();
  });
  
  // Sağlayıcı seçimi
  providerSelect.addEventListener('change', () => {
    if (!offlineToggle.checked) {
      applyMode();
      updateStatus();
    }
  });
  
  // Online/offline bağlantı değişimi
  window.addEventListener('online', () => {
    updateStatus();
    // İnternet geri geldiyse offline modu otomatik kapatma (kullanıcı tercihine saygı)
  });
  window.addEventListener('offline', updateStatus);
  
  // Periyodik durum güncelleme (son sağlayıcıyı göstermek için)
  setInterval(updateStatus, 1000);

  /* ---------- Dil Seçimi ---------- */
  function setLang(lang) {
    selectedLang = lang;
    btnEn.classList.toggle('selected', lang === 'en');
    btnJa.classList.toggle('selected', lang === 'ja');
    inputText.placeholder = lang === 'ja' ? 'Japonca metin buraya...' : 'İngilizce metin buraya...';
  }
  btnEn.addEventListener('click', () => setLang('en'));
  btnJa.addEventListener('click', () => setLang('ja'));
  setLang('en');

  /* ---------- Metin İşlemleri ---------- */
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

  /* ---------- Dosya İşlemleri ---------- */
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
    
    // Offline modda internet yoksa uyarı (ama çeviriye izin ver)
    if (offlineToggle.checked && !navigator.onLine) {
      // Bu durum normal, sadece bilgi ver
      console.log('Offline mod: İnternet yok, yerel sözlük kullanılacak.');
    }
    
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
      updateStatus(); // Sağlayıcı bilgisi güncellensin
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

  /* ---------- Yardımcı Fonksiyonlar ---------- */
  function setLoading(active) {
    btnTranslate.disabled = active;
    loader.classList.toggle('hidden', !active);
    btnTranslate.querySelector('.btn-text').textContent = active ? 'Çevriliyor...' : 'Çevir';
  }

  function showError(msg) { 
    errorMsg.textContent = msg; 
    errorBox.classList.remove('hidden'); 
  }
  
  function hideError() { 
    errorBox.classList.add('hidden'); 
    errorMsg.textContent = ''; 
  }

  /* ---------- Başlangıç ---------- */
  // Ayarları yükle ve uygula
  loadSettings();
  updateStatus();
  
  // Modelleri ön yükle (sözlük)
  Translator.preloadModel();
})();
