/**
 * ============================================================================
 * 臺灣正體中文 識字比賽播放系統 - 核心控制程式
 * 嚴格規範：所有介面與字詞皆使用臺灣正體中文
 * ============================================================================
 */

(function () {
  'use strict';

  // 儲存鍵值
  const STORAGE_KEY = 'tacsfl_word_comp_config_v1';

  // 預設比賽系統設定
  const defaultSettings = {
    competitionTitle: '2026 TACSFL 識字比賽',
    competitionSubtitle: '線上螢幕分享播放專用 ‧ 臺灣教育部標準標楷體',
    activeLevelId: 'level1',
    theme: 'default',
    showTimerBar: true,
    enableSounds: true,
    countdownReady: true,
    shuffle: true,          // 預設勾選題目隨機順序出題
    limitWordCount: 50,     // 預設抽考 50 題 (針對 Level 3/4 等大題庫)
    enableLimitCount: true, // 預設啟用抽考題數限制
    fontFamily: 'iansui',
    fontSizeScale: 100,
    fontWeight: '600',
    levels: {}
  };

  // 狀態管理物件
  let state = {
    config: null,
    currentLevelWords: [],
    activePlaylist: [],
    currentIndex: 0,
    currentStudentName: '',
    isPlaying: false,
    isPaused: false,
    displaySeconds: 2.5,
    timerRemaining: 0,
    timerTotal: 2500,
    animationFrameId: null,
    lastTickTime: null,
    totalElapsedMs: 0,
    countdownInterval: null,
    idleTimer: null,
    customFontFace: null
  };

  // Web Audio 音效產生器 (無需外部檔案，零依賴)
  const soundFx = {
    ctx: null,
    init() {
      if (!this.ctx) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (AudioContext) {
          this.ctx = new AudioContext();
        }
      }
    },
    beep(freq = 440, duration = 0.1, type = 'sine') {
      if (!state.config.enableSounds) return;
      try {
        this.init();
        if (!this.ctx) return;
        if (this.ctx.state === 'suspended') {
          this.ctx.resume();
        }
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        gain.gain.setValueAtTime(0.12, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
      } catch (e) {
        console.warn('音效播放失敗:', e);
      }
    },
    countdownTick() {
      this.beep(520, 0.12, 'triangle');
    },
    countdownGo() {
      this.beep(880, 0.28, 'sine');
    },
    wordNext() {
      this.beep(660, 0.08, 'sine');
    },
    finish() {
      this.beep(523.25, 0.15);
      setTimeout(() => this.beep(659.25, 0.15), 120);
      setTimeout(() => this.beep(783.99, 0.35), 240);
    }
  };

  // DOM 元素快取
  const dom = {
    // 頂部導覽列
    navTitle: document.getElementById('navTitle'),
    navLevelBadge: document.getElementById('navLevelBadge'),
    navSpeedVal: document.getElementById('navSpeedVal'),
    navSpeedMinus: document.getElementById('navSpeedMinus'),
    navSpeedPlus: document.getElementById('navSpeedPlus'),
    navRandomToggle: document.getElementById('navRandomToggle'),
    navRandomIcon: document.getElementById('navRandomIcon'),
    navRandomText: document.getElementById('navRandomText'),
    navSoundToggle: document.getElementById('navSoundToggle'),
    navSoundIcon: document.getElementById('navSoundIcon'),
    navFullscreenBtn: document.getElementById('navFullscreenBtn'),
    openSettingsBtn: document.getElementById('openSettingsBtn'),
    topNavbar: document.getElementById('topNavbar'),

    // 視圖區域
    coverView: document.getElementById('coverView'),
    countdownView: document.getElementById('countdownView'),
    playView: document.getElementById('playView'),
    resultView: document.getElementById('resultView'),

    // 封面視圖
    coverBadgeYear: document.getElementById('coverBadgeYear'),
    coverDisplayTitle: document.getElementById('coverDisplayTitle'),
    coverDisplaySubtitle: document.getElementById('coverDisplaySubtitle'),
    coverLevelSelect: document.getElementById('coverLevelSelect'),
    coverStudentName: document.getElementById('coverStudentName'),
    coverWordLimitInput: document.getElementById('coverWordLimitInput'),
    coverAllWordsCheck: document.getElementById('coverAllWordsCheck'),
    coverWordCountText: document.getElementById('coverWordCountText'),
    coverSpeedInput: document.getElementById('coverSpeedInput'),
    coverCountdownCheck: document.getElementById('coverCountdownCheck'),
    coverShuffleCheck: document.getElementById('coverShuffleCheck'),
    startCompetitionBtn: document.getElementById('startCompetitionBtn'),

    // 倒數視圖
    countdownNum: document.getElementById('countdownNum'),
    countdownLabel: document.getElementById('countdownLabel'),

    // 播放視圖
    playStudentBadge: document.getElementById('playStudentBadge'),
    playLevelBadge: document.getElementById('playLevelBadge'),
    playCounter: document.getElementById('playCounter'),
    playExitBtn: document.getElementById('playExitBtn'),
    wordStage: document.getElementById('wordStage'),
    activeWordText: document.getElementById('activeWordText'),
    pauseIndicator: document.getElementById('pauseIndicator'),
    timerBarContainer: document.getElementById('timerBarContainer'),
    timerBarFill: document.getElementById('timerBarFill'),
    playControlBar: document.getElementById('playControlBar'),
    btnPrevWord: document.getElementById('btnPrevWord'),
    btnPlayPause: document.getElementById('btnPlayPause'),
    btnNextWord: document.getElementById('btnNextWord'),
    btnReplayWord: document.getElementById('btnReplayWord'),
    playSpeedVal: document.getElementById('playSpeedVal'),
    playSpeedMinus: document.getElementById('playSpeedMinus'),
    playSpeedPlus: document.getElementById('playSpeedPlus'),
    btnPlayFullscreen: document.getElementById('btnPlayFullscreen'),

    // 結束視圖
    resultPlayerText: document.getElementById('resultPlayerText'),
    resultLevelText: document.getElementById('resultLevelText'),
    resultTotalWords: document.getElementById('resultTotalWords'),
    resultTotalTime: document.getElementById('resultTotalTime'),
    btnRestartSamePlayer: document.getElementById('btnRestartSamePlayer'),
    btnNextStudent: document.getElementById('btnNextStudent'),

    // 設定視窗
    settingsModal: document.getElementById('settingsModal'),
    closeSettingsBtn: document.getElementById('closeSettingsBtn'),
    btnSaveSettings: document.getElementById('btnSaveSettings'),
    cfgCompetitionTitle: document.getElementById('cfgCompetitionTitle'),
    cfgCompetitionSubtitle: document.getElementById('cfgCompetitionSubtitle'),
    cfgLimitCountInput: document.getElementById('cfgLimitCountInput'),
    cfgEnableLimitCheck: document.getElementById('cfgEnableLimitCheck'),
    cfgThemeSelect: document.getElementById('cfgThemeSelect'),
    cfgShowTimerBar: document.getElementById('cfgShowTimerBar'),
    cfgEnableSounds: document.getElementById('cfgEnableSounds'),

    // 題庫設定
    bankLevelSelect: document.getElementById('bankLevelSelect'),
    btnAddNewLevel: document.getElementById('btnAddNewLevel'),
    btnDeleteLevel: document.getElementById('btnDeleteLevel'),
    btnCleanBankFormat: document.getElementById('btnCleanBankFormat'),
    bankLevelNameInput: document.getElementById('bankLevelNameInput'),
    bankDefaultSecondsInput: document.getElementById('bankDefaultSecondsInput'),
    bankWordsTextarea: document.getElementById('bankWordsTextarea'),
    bankWordStats: document.getElementById('bankWordStats'),
    btnExportBankJson: document.getElementById('btnExportBankJson'),
    btnImportBankJson: document.getElementById('btnImportBankJson'),
    importJsonFileInput: document.getElementById('importJsonFileInput'),
    btnResetDefaultBank: document.getElementById('btnResetDefaultBank'),

    // 字型設定
    cfgFontFamilySelect: document.getElementById('cfgFontFamilySelect'),
    dropFontBox: document.getElementById('dropFontBox'),
    fontFileInput: document.getElementById('fontFileInput'),
    loadedFontNameText: document.getElementById('loadedFontNameText'),
    cfgFontSizeRange: document.getElementById('cfgFontSizeRange'),
    cfgFontSizeLabel: document.getElementById('cfgFontSizeLabel'),
    cfgFontWeightSelect: document.getElementById('cfgFontWeightSelect'),
    fontPreviewBox: document.getElementById('fontPreviewBox'),

    // 提示 Toast
    toastMsg: document.getElementById('toastMsg')
  };

  /**
   * 初始化系統設定與題庫
   */
  function initData() {
    let savedConfig = null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        savedConfig = JSON.parse(raw);
      }
    } catch (e) {
      console.error('載入本機設定失敗:', e);
    }

    // 若無儲存資料，從預設值與 default_bank.js 初始化
    state.config = Object.assign({}, defaultSettings);
    if (window.DEFAULT_VOCAB_BANK) {
      state.config.levels = JSON.parse(JSON.stringify(window.DEFAULT_VOCAB_BANK));
    }

    if (savedConfig) {
      // 合併已存設定
      Object.assign(state.config, savedConfig);
      if (savedConfig.levels && Object.keys(savedConfig.levels).length > 0) {
        state.config.levels = savedConfig.levels;
      }
      // 若原先儲存的是 2024 年標題，自動平滑升級為 2026 年標題
      if (state.config.competitionTitle === '2024 TACSFL 識字比賽') {
        state.config.competitionTitle = '2026 TACSFL 識字比賽';
      }
    }

    // 確保抽考設定完整
    if (state.config.limitWordCount === undefined) {
      state.config.limitWordCount = 50;
    }
    if (state.config.enableLimitCount === undefined) {
      state.config.enableLimitCount = true;
    }

    // 確保當前級別存在
    const levelIds = Object.keys(state.config.levels);
    if (levelIds.length === 0) {
      // 防呆：建立預設 Level 1
      state.config.levels['level1'] = {
        id: 'level1',
        name: '第一級 (Level 1)',
        defaultSeconds: 2.5,
        words: ['星期二', '你', '四', '五', '星期六']
      };
    }

    if (!state.config.levels[state.config.activeLevelId]) {
      state.config.activeLevelId = Object.keys(state.config.levels)[0];
    }

    saveConfig();
    applySystemConfig();
  }

  /**
   * 儲存設定至 LocalStorage
   */
  function saveConfig() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state.config));
    } catch (e) {
      console.error('儲存設定失敗:', e);
    }
  }

  /**
   * 套用全站系統設定
   */
  function applySystemConfig() {
    const activeLevel = state.config.levels[state.config.activeLevelId];
    if (activeLevel) {
      state.displaySeconds = parseFloat(activeLevel.defaultSeconds) || 2.5;
    }

    // 更新標題
    document.title = `${state.config.competitionTitle} - 識字比賽播放工具`;
    dom.navTitle.textContent = state.config.competitionTitle;
    dom.coverDisplayTitle.textContent = state.config.competitionTitle;
    dom.coverDisplaySubtitle.textContent = state.config.competitionSubtitle || '線上螢幕分享播放專用 ‧ 臺灣教育部標準標楷體';

    // 更新等級徽章
    if (activeLevel) {
      dom.navLevelBadge.textContent = activeLevel.name;
    }

    // 更新主題
    document.body.setAttribute('data-theme', state.config.theme);

    // 套用字型族系
    applyFontFamily(state.config.fontFamily);

    // 套用字型粗細
    document.documentElement.style.setProperty('--font-weight-custom', state.config.fontWeight);

    // 套用字體縮放比例
    applyFontSizeScale();

    // 更新秒數顯示
    updateSpeedDisplay();

    // 更新隨機開關圖示
    updateRandomIcon();

    // 更新音效圖示
    updateSoundIcon();

    // 更新封面級別選單
    populateCoverLevelSelect();

    // 計時條顯示
    dom.timerBarContainer.style.display = state.config.showTimerBar ? 'block' : 'none';
  }

  /**
   * 套用字型族系
   */
  function applyFontFamily(fontKey) {
    let fontCss = '';
    switch (fontKey) {
      case 'iansui':
        // 臺灣教育部標準標楷體 (本地開源芫荽字型，100% 確保美國電腦與離線環境正確)
        fontCss = '"IansuiLocal", "Iansui", "BiauKai", "DFKai-SB", "TW-Kai", "Kaiti TC", "KaiTi", "標楷體", "全字庫正楷體", serif';
        break;
      case 'system-kai':
        // 系統內建標楷體優先
        fontCss = '"BiauKai", "DFKai-SB", "TW-Kai", "Kaiti TC", "KaiTi", "標楷體", serif';
        break;
      case 'custom':
        // 使用者載入的本地字型
        fontCss = '"UserCustomKai", "IansuiLocal", "Iansui", "BiauKai", "DFKai-SB", serif';
        break;
      case 'heiti':
        // 微軟正黑體 / 繁體黑體
        fontCss = '"Microsoft JhengHei", "微軟正黑體", "PingFang TC", "Noto Sans TC", sans-serif';
        break;
      case 'songti':
        // 新細明體 / 繁體宋體
        fontCss = '"PMingLiU", "新細明體", "MingLiU", "Noto Serif TC", serif';
        break;
      default:
        fontCss = '"IansuiLocal", "Iansui", "BiauKai", "DFKai-SB", serif';
    }
    document.documentElement.style.setProperty('--font-kai', fontCss);
  }

  /**
   * 計算並設定大字體尺寸 (自適應字數，防止折行)
   */
  function calculateWordFontSize(wordText) {
    const scale = (state.config.fontSizeScale || 100) / 100;
    const len = wordText ? wordText.length : 2;
    let baseVw = 16;
    if (len <= 1) {
      baseVw = 23;
    } else if (len === 2) {
      baseVw = 18;
    } else if (len === 3) {
      baseVw = 13.5;
    } else if (len === 4) {
      baseVw = 11;
    } else {
      baseVw = Math.max(7, 10 - (len - 4) * 1.5);
    }
    const finalVw = (baseVw * scale).toFixed(2);
    document.documentElement.style.setProperty('--word-font-size', `${finalVw}vw`);
  }

  function applyFontSizeScale() {
    if (state.isPlaying && state.activePlaylist.length > 0) {
      const curWord = state.activePlaylist[state.currentIndex] || '';
      calculateWordFontSize(curWord);
    }
  }

  /**
   * 更新導覽列與各處秒數指示
   */
  function updateSpeedDisplay() {
    const formatted = `${state.displaySeconds.toFixed(1)} 秒`;
    dom.navSpeedVal.textContent = formatted;
    dom.coverSpeedInput.value = state.displaySeconds;
    dom.playSpeedVal.textContent = `${state.displaySeconds.toFixed(1)}s`;
  }

  function updateRandomIcon() {
    if (state.config.shuffle) {
      dom.navRandomIcon.textContent = '🔀';
      dom.navRandomText.textContent = '隨機中';
      dom.navRandomToggle.style.color = '#2b6cb0';
      dom.navRandomToggle.style.borderColor = '#3182ce';
    } else {
      dom.navRandomIcon.textContent = '➡️';
      dom.navRandomText.textContent = '循序出題';
      dom.navRandomToggle.style.color = 'inherit';
      dom.navRandomToggle.style.borderColor = 'var(--border-color)';
    }
    dom.coverShuffleCheck.checked = state.config.shuffle;
  }

  function updateSoundIcon() {
    dom.navSoundIcon.textContent = state.config.enableSounds ? '🔊' : '🔇';
  }

  /**
   * 填入封面等級下拉選單
   */
  function populateCoverLevelSelect() {
    dom.coverLevelSelect.innerHTML = '';
    const levels = state.config.levels;
    for (const id in levels) {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = `${levels[id].name} (共 ${levels[id].words.length} 題)`;
      if (id === state.config.activeLevelId) {
        opt.selected = true;
      }
      dom.coverLevelSelect.appendChild(opt);
    }
    updateCoverWordCount();
  }

  function updateCoverWordCount() {
    const activeLevel = state.config.levels[state.config.activeLevelId];
    if (activeLevel) {
      const totalWords = (activeLevel.words || []).length;
      state.displaySeconds = parseFloat(activeLevel.defaultSeconds) || 2.5;
      updateSpeedDisplay();

      const isLimitEnabled = state.config.enableLimitCount !== false;
      const limitVal = state.config.limitWordCount || 50;

      dom.coverWordLimitInput.value = limitVal;
      dom.coverAllWordsCheck.checked = !isLimitEnabled;
      dom.coverWordLimitInput.disabled = !isLimitEnabled;

      if (!isLimitEnabled || limitVal >= totalWords) {
        dom.coverWordCountText.textContent = `題庫共 ${totalWords} 題，將出題全部 ${totalWords} 題`;
      } else {
        dom.coverWordCountText.textContent = `題庫共 ${totalWords} 題，將抽考 ${limitVal} 題`;
      }
    }
  }

  /**
   * 切換畫面檢視
   */
  function switchView(viewName) {
    [dom.coverView, dom.countdownView, dom.playView, dom.resultView].forEach(v => v.classList.remove('active'));
    if (viewName === 'cover') {
      dom.coverView.classList.add('active');
      document.body.classList.remove('fullscreen-playing');
      dom.topNavbar.style.opacity = '1';
      dom.topNavbar.style.pointerEvents = 'auto';
    } else if (viewName === 'countdown') {
      dom.countdownView.classList.add('active');
    } else if (viewName === 'play') {
      dom.playView.classList.add('active');
      document.body.classList.add('fullscreen-playing');
    } else if (viewName === 'result') {
      dom.resultView.classList.add('active');
      document.body.classList.remove('fullscreen-playing');
      dom.topNavbar.style.opacity = '1';
      dom.topNavbar.style.pointerEvents = 'auto';
    }
  }

  /**
   * 顯示浮動 Toast 提示
   */
  function showToast(msg) {
    dom.toastMsg.textContent = msg;
    dom.toastMsg.classList.add('show');
    setTimeout(() => {
      dom.toastMsg.classList.remove('show');
    }, 2200);
  }

  /**
   * 洗牌演算法 (Fisher-Yates)
   */
  function shuffleArray(array) {
    const copy = array.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  // =========================================================================
  // 比賽流程控制 (開始、倒數、播放、換題、暫停、結束)
  // =========================================================================

  /**
   * 準備開始比賽
   */
  function startCompetition() {
    const activeLevel = state.config.levels[state.config.activeLevelId];
    if (!activeLevel || !activeLevel.words || activeLevel.words.length === 0) {
      alert('目前選定的級別題庫沒有任何詞彙，請先進入設定輸入題目！');
      return;
    }

    // 取得封面設定
    state.currentStudentName = dom.coverStudentName.value.trim();
    state.config.countdownReady = dom.coverCountdownCheck.checked;
    state.config.shuffle = dom.coverShuffleCheck.checked;
    state.config.enableLimitCount = !dom.coverAllWordsCheck.checked;
    state.config.limitWordCount = Math.max(1, parseInt(dom.coverWordLimitInput.value, 10) || 50);
    state.displaySeconds = Math.max(0.5, parseFloat(dom.coverSpeedInput.value) || 2.5);
    updateSpeedDisplay();
    saveConfig();

    // 準備候選題目清單
    let candidateList = activeLevel.words.slice();
    if (state.config.shuffle) {
      candidateList = shuffleArray(candidateList);
    }

    // 套用抽考題數限制 (特別針對 Level 3 與 Level 4 大題庫，預設抽考 50 題)
    if (state.config.enableLimitCount && state.config.limitWordCount > 0) {
      const count = Math.min(candidateList.length, state.config.limitWordCount);
      state.activePlaylist = candidateList.slice(0, count);
    } else {
      state.activePlaylist = candidateList;
    }

    state.currentIndex = 0;
    state.totalElapsedMs = 0;

    // 是否需要倒數緩衝 (防洩題與心理準備)
    if (state.config.countdownReady) {
      runCountdown(() => {
        beginPlayback();
      });
    } else {
      beginPlayback();
    }
  }

  /**
   * 3... 2... 1... 倒數流程
   */
  function runCountdown(callback) {
    switchView('countdown');
    let count = 3;
    dom.countdownNum.textContent = count;
    dom.countdownLabel.textContent = '參賽選手請準備...';
    soundFx.countdownTick();

    if (state.countdownInterval) clearInterval(state.countdownInterval);

    state.countdownInterval = setInterval(() => {
      count--;
      if (count > 0) {
        dom.countdownNum.textContent = count;
        soundFx.countdownTick();
      } else if (count === 0) {
        dom.countdownNum.textContent = '開始！';
        dom.countdownLabel.textContent = '請清晰朗讀詞彙';
        soundFx.countdownGo();
      } else {
        clearInterval(state.countdownInterval);
        state.countdownInterval = null;
        callback();
      }
    }, 950);
  }

  /**
   * 正式進入詞彙播放
   */
  function beginPlayback() {
    switchView('play');
    state.isPlaying = true;
    state.isPaused = false;
    dom.pauseIndicator.classList.remove('show');
    dom.btnPlayPause.textContent = '⏸';

    // 更新選手姓名標籤
    if (state.currentStudentName) {
      dom.playStudentBadge.textContent = `選手：${state.currentStudentName}`;
      dom.playStudentBadge.style.display = 'inline-block';
    } else {
      dom.playStudentBadge.style.display = 'none';
    }

    const activeLevel = state.config.levels[state.config.activeLevelId];
    dom.playLevelBadge.textContent = activeLevel ? activeLevel.name : '';

    renderCurrentWord();
    resetWordTimer();
    startTimerLoop();
  }

  /**
   * 渲染當前題詞
   */
  function renderCurrentWord() {
    const total = state.activePlaylist.length;
    const currentWord = state.activePlaylist[state.currentIndex] || '';

    // 計算大字體尺寸
    calculateWordFontSize(currentWord);

    dom.activeWordText.textContent = currentWord;
    dom.playCounter.textContent = `第 ${state.currentIndex + 1} / ${total} 題`;

    // 輕巧換題音效
    if (state.currentIndex > 0) {
      soundFx.wordNext();
    }
  }

  /**
   * 重置當前詞彙計時
   */
  function resetWordTimer() {
    state.timerTotal = state.displaySeconds * 1000;
    state.timerRemaining = state.timerTotal;
    updateTimerBarVisual(1);
    state.lastTickTime = performance.now();
  }

  /**
   * 更新進度條視覺
   */
  function updateTimerBarVisual(ratio) {
    if (!state.config.showTimerBar) return;
    const clamped = Math.max(0, Math.min(1, ratio));
    dom.timerBarFill.style.transform = `scaleX(${clamped})`;
  }

  /**
   * 主計時迴圈 (使用 requestAnimationFrame 確保極致流暢)
   */
  function startTimerLoop() {
    if (state.animationFrameId) cancelAnimationFrame(state.animationFrameId);

    function tick(now) {
      if (!state.isPlaying) return;

      if (!state.isPaused) {
        if (state.lastTickTime) {
          const delta = now - state.lastTickTime;
          state.timerRemaining -= delta;
          state.totalElapsedMs += delta;

          const ratio = state.timerRemaining / state.timerTotal;
          updateTimerBarVisual(ratio);

          if (state.timerRemaining <= 0) {
            // 時間到，自動切換下一題
            goToNextWord();
            return;
          }
        }
        state.lastTickTime = now;
      } else {
        state.lastTickTime = now;
      }

      state.animationFrameId = requestAnimationFrame(tick);
    }

    state.lastTickTime = performance.now();
    state.animationFrameId = requestAnimationFrame(tick);
  }

  /**
   * 切換到下一題
   */
  function goToNextWord() {
    if (!state.isPlaying) return;

    if (state.currentIndex + 1 < state.activePlaylist.length) {
      state.currentIndex++;
      renderCurrentWord();
      resetWordTimer();
      startTimerLoop();
    } else {
      // 比賽全部結束
      finishCompetition();
    }
  }

  /**
   * 切換到上一題
   */
  function goToPrevWord() {
    if (!state.isPlaying) return;
    if (state.currentIndex > 0) {
      state.currentIndex--;
      renderCurrentWord();
      resetWordTimer();
      startTimerLoop();
    } else {
      showToast('已經是第一題了！');
    }
  }

  /**
   * 重播當前題詞秒數
   */
  function replayCurrentWord() {
    if (!state.isPlaying) return;
    resetWordTimer();
    showToast('重播當前詞彙計時');
  }

  /**
   * 暫停 / 繼續切換
   */
  function togglePlayPause() {
    if (!state.isPlaying) return;
    state.isPaused = !state.isPaused;

    if (state.isPaused) {
      dom.pauseIndicator.classList.add('show');
      dom.btnPlayPause.textContent = '▶';
      showToast('比賽已暫停');
    } else {
      dom.pauseIndicator.classList.remove('show');
      dom.btnPlayPause.textContent = '⏸';
      state.lastTickTime = performance.now();
      showToast('繼續播放');
    }
  }

  /**
   * 比賽完成
   */
  function finishCompetition() {
    state.isPlaying = false;
    if (state.animationFrameId) cancelAnimationFrame(state.animationFrameId);

    soundFx.finish();
    switchView('result');

    const totalSeconds = Math.round(state.totalElapsedMs / 1000);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    const timeFormatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    const activeLevel = state.config.levels[state.config.activeLevelId];
    dom.resultLevelText.textContent = activeLevel ? activeLevel.name : '';
    const isSampled = state.config.enableLimitCount && activeLevel && state.activePlaylist.length < activeLevel.words.length;
    dom.resultTotalWords.textContent = isSampled 
      ? `${state.activePlaylist.length} 題 (抽考)` 
      : `${state.activePlaylist.length} 題`;
    dom.resultTotalTime.textContent = timeFormatted;

    if (state.currentStudentName) {
      dom.resultPlayerText.textContent = `選手【${state.currentStudentName}】完成全部挑戰，表現優異！`;
    } else {
      dom.resultPlayerText.textContent = '全組詞彙挑戰順利完成！';
    }
  }

  /**
   * 退出播放返回封面
   */
  function exitToCover() {
    state.isPlaying = false;
    if (state.animationFrameId) cancelAnimationFrame(state.animationFrameId);
    if (state.countdownInterval) clearInterval(state.countdownInterval);
    switchView('cover');
  }

  /**
   * 調整當前顯示秒數 (支援小數點，例如 2.5s, 2.0s, 1.5s)
   */
  function adjustSpeed(delta) {
    let current = state.displaySeconds;
    current = Math.round((current + delta) * 10) / 10;
    if (current < 0.5) current = 0.5;
    if (current > 10.0) current = 10.0;
    state.displaySeconds = current;

    // 若在設定中，同步更新當前級別的預設秒數
    const activeLevel = state.config.levels[state.config.activeLevelId];
    if (activeLevel) {
      activeLevel.defaultSeconds = state.displaySeconds;
      saveConfig();
    }

    updateSpeedDisplay();
    if (state.isPlaying) {
      resetWordTimer();
      showToast(`每題間距設定為 ${state.displaySeconds} 秒`);
    }
  }

  // =========================================================================
  // 全螢幕與滑鼠閒置自動隱藏控制列
  // =========================================================================
  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.warn('無法開啟全螢幕模式:', err);
      });
    } else {
      if (document.exitFullscreen) {
        document.exitFullscreen();
      }
    }
  }

  function handleMouseMove() {
    document.body.classList.remove('hide-cursor');
    if (state.idleTimer) clearTimeout(state.idleTimer);

    if (state.isPlaying && !state.isPaused) {
      state.idleTimer = setTimeout(() => {
        document.body.classList.add('hide-cursor');
      }, 2400);
    }
  }

  // =========================================================================
  // 設定與題庫管理視窗 (Modal)
  // =========================================================================

  function openSettingsModal() {
    // 載入基本設定
    dom.cfgCompetitionTitle.value = state.config.competitionTitle;
    dom.cfgCompetitionSubtitle.value = state.config.competitionSubtitle;
    dom.cfgLimitCountInput.value = state.config.limitWordCount || 50;
    dom.cfgEnableLimitCheck.checked = state.config.enableLimitCount !== false;
    dom.cfgLimitCountInput.disabled = !dom.cfgEnableLimitCheck.checked;
    dom.cfgThemeSelect.value = state.config.theme;
    dom.cfgShowTimerBar.checked = state.config.showTimerBar;
    dom.cfgEnableSounds.checked = state.config.enableSounds;

    // 載入字型設定
    dom.cfgFontFamilySelect.value = state.config.fontFamily;
    dom.cfgFontSizeRange.value = state.config.fontSizeScale || 100;
    dom.cfgFontSizeLabel.textContent = `${dom.cfgFontSizeRange.value}%`;
    dom.cfgFontWeightSelect.value = state.config.fontWeight || '600';

    // 載入題庫設定
    populateBankLevelSelect();
    loadBankEditorForLevel(state.config.activeLevelId);

    // 顯示視窗
    dom.settingsModal.classList.add('show');
  }

  function closeSettingsModal() {
    dom.settingsModal.classList.remove('show');
  }

  function populateBankLevelSelect() {
    dom.bankLevelSelect.innerHTML = '';
    const levels = state.config.levels;
    for (const id in levels) {
      const opt = document.createElement('option');
      opt.value = id;
      opt.textContent = levels[id].name;
      if (id === state.config.activeLevelId) {
        opt.selected = true;
      }
      dom.bankLevelSelect.appendChild(opt);
    }
  }

  function loadBankEditorForLevel(levelId) {
    const level = state.config.levels[levelId];
    if (!level) return;

    dom.bankLevelNameInput.value = level.name;
    dom.bankDefaultSecondsInput.value = level.defaultSeconds || 2.0;
    dom.bankWordsTextarea.value = (level.words || []).join('\n');
    updateBankEditorStats();
  }

  function updateBankEditorStats() {
    const lines = dom.bankWordsTextarea.value
      .split('\n')
      .map(s => s.trim())
      .filter(s => s.length > 0);
    dom.bankWordStats.textContent = `目前共 ${lines.length} 題`;
  }

  /**
   * 自動整理文字框格式 (去除首尾空格、排除空行、修正全形空格)
   */
  function cleanWordsFormat() {
    const raw = dom.bankWordsTextarea.value;
    const lines = raw
      .split('\n')
      .map(s => s.replace(/\s+/g, ' ').trim())
      .filter(s => s.length > 0);

    // 繁簡標準更正對應表
    const fixMap = {
      '没有': '沒有',
      '等ㄧ下': '等一下',
      'ㄧ定': '一定'
    };

    const cleanLines = lines.map(w => fixMap[w] || w);
    dom.bankWordsTextarea.value = cleanLines.join('\n');
    updateBankEditorStats();
    showToast(`格式整理完成，共 ${cleanLines.length} 題`);
  }

  /**
   * 儲存設定視窗之所有更更
   */
  function saveAllSettings() {
    // 儲存基本設定
    state.config.competitionTitle = dom.cfgCompetitionTitle.value.trim() || '2026 TACSFL 識字比賽';
    state.config.competitionSubtitle = dom.cfgCompetitionSubtitle.value.trim();
    state.config.limitWordCount = Math.max(1, parseInt(dom.cfgLimitCountInput.value, 10) || 50);
    state.config.enableLimitCount = dom.cfgEnableLimitCheck.checked;
    state.config.theme = dom.cfgThemeSelect.value;
    state.config.showTimerBar = dom.cfgShowTimerBar.checked;
    state.config.enableSounds = dom.cfgEnableSounds.checked;

    // 儲存字型設定
    state.config.fontFamily = dom.cfgFontFamilySelect.value;
    state.config.fontSizeScale = parseInt(dom.cfgFontSizeRange.value, 10) || 100;
    state.config.fontWeight = dom.cfgFontWeightSelect.value;

    // 儲存當前編輯之級別題庫
    const currentLevelId = dom.bankLevelSelect.value;
    if (currentLevelId && state.config.levels[currentLevelId]) {
      const level = state.config.levels[currentLevelId];
      level.name = dom.bankLevelNameInput.value.trim() || level.name;
      level.defaultSeconds = Math.max(0.5, parseFloat(dom.bankDefaultSecondsInput.value) || 2.0);

      const words = dom.bankWordsTextarea.value
        .split('\n')
        .map(s => s.trim())
        .filter(s => s.length > 0);
      level.words = words;
    }

    saveConfig();
    applySystemConfig();
    closeSettingsModal();
    showToast('所有設定與題庫已成功儲存！');
  }

  /**
   * 新增自訂級別
   */
  function addNewLevel() {
    const newName = prompt('請輸入新級別名稱（例如：第五級 (Level 5) 或 幼兒組）：', '新自訂級別');
    if (!newName || !newName.trim()) return;

    const newId = 'custom_' + Date.now();
    state.config.levels[newId] = {
      id: newId,
      name: newName.trim(),
      defaultSeconds: 2.0,
      words: ['學校', '老師', '同學', '朋友']
    };

    state.config.activeLevelId = newId;
    saveConfig();
    populateBankLevelSelect();
    dom.bankLevelSelect.value = newId;
    loadBankEditorForLevel(newId);
    showToast(`已新增級別：${newName.trim()}`);
  }

  /**
   * 刪除自訂級別
   */
  function deleteCurrentLevel() {
    const curId = dom.bankLevelSelect.value;
    const levelCount = Object.keys(state.config.levels).length;
    if (levelCount <= 1) {
      alert('至少需要保留一個級別，無法全部刪除！');
      return;
    }

    const level = state.config.levels[curId];
    if (!confirm(`確定要刪除「${level.name}」嗎？此動作將刪除該級別全部題目！`)) {
      return;
    }

    delete state.config.levels[curId];
    state.config.activeLevelId = Object.keys(state.config.levels)[0];
    saveConfig();
    populateBankLevelSelect();
    loadBankEditorForLevel(state.config.activeLevelId);
    showToast('已刪除級別');
  }

  /**
   * 匯出題庫為 JSON 檔案
   */
  function exportBankJson() {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(state.config, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    const dateStr = new Date().toISOString().slice(0, 10);
    downloadAnchor.setAttribute('download', `識字比賽題庫備份_${dateStr}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
    showToast('題庫備份檔案已匯出！');
  }

  /**
   * 匯入題庫 JSON 檔案
   */
  function handleImportJsonFile(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function (evt) {
      try {
        const imported = JSON.parse(evt.target.result);
        if (imported.levels && typeof imported.levels === 'object') {
          if (confirm('確定要匯入此題庫檔案嗎？現有題庫將被檔案內容更新！')) {
            state.config = Object.assign(state.config, imported);
            saveConfig();
            populateBankLevelSelect();
            loadBankEditorForLevel(state.config.activeLevelId);
            applySystemConfig();
            showToast('題庫檔案匯入成功！');
          }
        } else {
          alert('匯入失敗：檔案格式不正確，未包含有效之 levels 題庫資料！');
        }
      } catch (err) {
        alert('匯入解析失敗：請確認檔案為正確的 JSON 格式！');
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // 重置 input
  }

  /**
   * 恢復官方預設題庫 (2024 Level 1~4)
   */
  function resetToDefaultBank() {
    if (confirm('確定要將所有題庫還原為官方 2024 年預設題庫嗎？這將覆蓋自訂的題庫修改！')) {
      if (window.DEFAULT_VOCAB_BANK) {
        state.config.levels = JSON.parse(JSON.stringify(window.DEFAULT_VOCAB_BANK));
        state.config.activeLevelId = 'level1';
        saveConfig();
        populateBankLevelSelect();
        loadBankEditorForLevel('level1');
        applySystemConfig();
        showToast('已成功還原為 2024 年官方題庫！');
      }
    }
  }

  /**
   * 處理本地字型檔案上傳 (FontFace API)
   */
  function handleCustomFontUpload(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (e) {
      try {
        const fontData = e.target.result;
        const fontFace = new FontFace('UserCustomKai', fontData);
        fontFace.load().then(loadedFace => {
          document.fonts.add(loadedFace);
          state.customFontFace = loadedFace;
          dom.cfgFontFamilySelect.value = 'custom';
          dom.loadedFontNameText.textContent = `已成功載入字型：${file.name}`;
          applyFontFamily('custom');
          showToast(`已載入本機字型：${file.name}`);
        }).catch(err => {
          alert(`載入字型失敗: ${err.message}`);
        });
      } catch (err) {
        alert('解析字型檔案失敗！');
      }
    };
    reader.readAsArrayBuffer(file);
  }

  // =========================================================================
  // 事件監聽綁定
  // =========================================================================
  function bindEvents() {
    // 頂部導覽列按鈕
    dom.navSpeedMinus.addEventListener('click', () => adjustSpeed(-0.5));
    dom.navSpeedPlus.addEventListener('click', () => adjustSpeed(0.5));
    dom.playSpeedMinus.addEventListener('click', () => adjustSpeed(-0.5));
    dom.playSpeedPlus.addEventListener('click', () => adjustSpeed(0.5));

    // 隨機開關
    dom.navRandomToggle.addEventListener('click', () => {
      state.config.shuffle = !state.config.shuffle;
      updateRandomIcon();
      saveConfig();
      showToast(state.config.shuffle ? '已開啟隨機出題' : '已切換為循序出題');
    });

    // 音效開關
    dom.navSoundToggle.addEventListener('click', () => {
      state.config.enableSounds = !state.config.enableSounds;
      updateSoundIcon();
      saveConfig();
      showToast(state.config.enableSounds ? '提示音已開啟' : '提示音已靜音');
    });

    // 全螢幕切換
    dom.navFullscreenBtn.addEventListener('click', toggleFullscreen);
    dom.btnPlayFullscreen.addEventListener('click', toggleFullscreen);

    // 開啟設定
    dom.openSettingsBtn.addEventListener('click', openSettingsModal);
    dom.closeSettingsBtn.addEventListener('click', closeSettingsModal);
    dom.btnSaveSettings.addEventListener('click', saveAllSettings);

    // 封面頁事件
    dom.coverLevelSelect.addEventListener('change', (e) => {
      state.config.activeLevelId = e.target.value;
      saveConfig();
      applySystemConfig();
    });

    dom.coverWordLimitInput.addEventListener('change', (e) => {
      state.config.limitWordCount = Math.max(1, parseInt(e.target.value, 10) || 50);
      saveConfig();
      updateCoverWordCount();
    });

    dom.coverAllWordsCheck.addEventListener('change', (e) => {
      state.config.enableLimitCount = !e.target.checked;
      saveConfig();
      updateCoverWordCount();
    });

    dom.cfgEnableLimitCheck.addEventListener('change', (e) => {
      dom.cfgLimitCountInput.disabled = !e.target.checked;
    });

    dom.coverSpeedInput.addEventListener('change', (e) => {
      state.displaySeconds = Math.max(0.5, parseFloat(e.target.value) || 2.5);
      const activeLevel = state.config.levels[state.config.activeLevelId];
      if (activeLevel) {
        activeLevel.defaultSeconds = state.displaySeconds;
        saveConfig();
      }
      updateSpeedDisplay();
    });

    dom.startCompetitionBtn.addEventListener('click', startCompetition);

    // 播放頁控制
    dom.btnPlayPause.addEventListener('click', togglePlayPause);
    dom.btnNextWord.addEventListener('click', goToNextWord);
    dom.btnPrevWord.addEventListener('click', goToPrevWord);
    dom.btnReplayWord.addEventListener('click', replayCurrentWord);
    dom.playExitBtn.addEventListener('click', exitToCover);

    // 完賽頁按鈕
    dom.btnRestartSamePlayer.addEventListener('click', startCompetition);
    dom.btnNextStudent.addEventListener('click', () => {
      dom.coverStudentName.value = '';
      exitToCover();
    });

    // 設定視窗分頁切換
    const tabBtns = document.querySelectorAll('.tab-btn');
    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        tabBtns.forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        const targetId = btn.getAttribute('data-tab');
        const targetPane = document.getElementById(targetId);
        if (targetPane) targetPane.classList.add('active');
      });
    });

    // 題庫管理事件
    dom.bankLevelSelect.addEventListener('change', (e) => {
      loadBankEditorForLevel(e.target.value);
    });

    dom.bankWordsTextarea.addEventListener('input', updateBankEditorStats);
    dom.btnCleanBankFormat.addEventListener('click', cleanWordsFormat);
    dom.btnAddNewLevel.addEventListener('click', addNewLevel);
    dom.btnDeleteLevel.addEventListener('click', deleteCurrentLevel);

    dom.btnExportBankJson.addEventListener('click', exportBankJson);
    dom.btnImportBankJson.addEventListener('click', () => dom.importJsonFileInput.click());
    dom.importJsonFileInput.addEventListener('change', handleImportJsonFile);
    dom.btnResetDefaultBank.addEventListener('click', resetToDefaultBank);

    // 字型設定事件
    dom.cfgFontFamilySelect.addEventListener('change', (e) => {
      applyFontFamily(e.target.value);
    });

    dom.cfgFontSizeRange.addEventListener('input', (e) => {
      dom.cfgFontSizeLabel.textContent = `${e.target.value}%`;
      state.config.fontSizeScale = parseInt(e.target.value, 10);
      applyFontSizeScale();
    });

    dom.cfgFontWeightSelect.addEventListener('change', (e) => {
      document.documentElement.style.setProperty('--font-weight-custom', e.target.value);
    });

    dom.fontFileInput.addEventListener('change', (e) => {
      if (e.target.files && e.target.files[0]) {
        handleCustomFontUpload(e.target.files[0]);
      }
    });

    // 拖曳字型檔案支援
    dom.dropFontBox.addEventListener('dragover', (e) => {
      e.preventDefault();
      dom.dropFontBox.style.borderColor = 'var(--primary-color)';
    });
    dom.dropFontBox.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dom.dropFontBox.style.borderColor = 'var(--border-color)';
    });
    dom.dropFontBox.addEventListener('drop', (e) => {
      e.preventDefault();
      dom.dropFontBox.style.borderColor = 'var(--border-color)';
      if (e.dataTransfer.files && e.dataTransfer.files[0]) {
        handleCustomFontUpload(e.dataTransfer.files[0]);
      }
    });

    // 滑鼠移動重置閒置計時
    window.addEventListener('mousemove', handleMouseMove);

    // 鍵盤快速鍵全域監聽
    window.addEventListener('keydown', handleGlobalKeydown);
  }

  /**
   * 鍵盤快速鍵處理
   */
  function handleGlobalKeydown(e) {
    // 若在輸入框內打字則不干擾快速鍵
    const tag = e.target.tagName.toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') {
      if (e.key === 'Escape' && dom.settingsModal.classList.contains('show')) {
        closeSettingsModal();
      }
      return;
    }

    handleMouseMove();

    switch (e.code) {
      case 'Space':
        e.preventDefault();
        if (state.isPlaying) {
          togglePlayPause();
        } else if (dom.coverView.classList.contains('active')) {
          startCompetition();
        }
        break;

      case 'ArrowRight':
      case 'PageDown':
        e.preventDefault();
        if (state.isPlaying) {
          goToNextWord();
        }
        break;

      case 'ArrowLeft':
      case 'PageUp':
        e.preventDefault();
        if (state.isPlaying) {
          goToPrevWord();
        }
        break;

      case 'KeyR':
        if (state.isPlaying) {
          e.preventDefault();
          replayCurrentWord();
        }
        break;

      case 'KeyF':
        e.preventDefault();
        toggleFullscreen();
        break;

      case 'Escape':
        if (dom.settingsModal.classList.contains('show')) {
          closeSettingsModal();
        } else if (state.isPlaying) {
          exitToCover();
        }
        break;

      case 'Enter':
        if (dom.coverView.classList.contains('active')) {
          startCompetition();
        }
        break;
    }
  }

  // 程式啟動
  window.addEventListener('DOMContentLoaded', () => {
    initData();
    bindEvents();
    console.log('臺灣正體中文識字比賽播放系統已就緒');
  });

})();
