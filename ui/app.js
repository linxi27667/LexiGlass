/**
 * 琉璃记 (LexiGlass) — 前端状态机与 Rust Tauri v2 双模桥接引擎
 * - 支持在 Tauri v2 原生 Rust 宿主中调用后端 IPC 命令
 * - 支持直接双击启动时通过 localStorage + BroadcastChannel 实时多窗口同步
 */
(function () {
  const STORAGE_KEY = "LEXIGLASS_STATE_V1";
  const syncChannel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel("lexiglass_sync") : null;
  const isTauri = Boolean(window.__TAURI__ && window.__TAURI__.core);

  const DEFAULT_DECKS = [
    { id: "cet6-core", name: "CET-6 六级核心必考 1000 词", subtitle: "50组完整版 · 含真题搭配与亮点词 ★", icon: "🎓", category: "vocab" },
    { id: "cet4-core", name: "CET-4 四级高频核心词库", subtitle: "27组共 528 词 · 夯实四级词汇基础", icon: "📘", category: "vocab" },
    { id: "tech-notes", name: "嵌入式 Linux & C语言 & 架构卡", subtitle: "记命令、记指针考点、记Rust/运维规则", icon: "⚡", category: "tech" },
    { id: "quick-jot-deck", name: "随手记 · 生词与灵感收件箱", subtitle: "大屏角落气泡窗随手录入的词条与笔记", icon: "🫧", category: "custom" }
  ];

  function createInitialState() {
    const builtin = (window.LEXIGLASS_BUILTIN_CARDS || []).map(c => ({ ...c }));
    const initialJots = [
      { id: "jot-init-1", content: "unprecedented", translation: "adj. 史无前例的；空前的（六级作文首段高频词）", pos: "adj.", tag: "#六级生词", created_at: "刚刚" },
      { id: "jot-init-2", content: "address the climate crisis", translation: "熟词僻义：address 作动词意为「应对、着手解决」而非地址", pos: "v.", tag: "#熟词僻义", created_at: "刚刚" },
      { id: "jot-init-3", content: "ss -tulpn | grep :8090", translation: "Linux 快速查看端口监听与对应进程 PID", pos: "Linux", tag: "#Linux与C语言", created_at: "刚刚" }
    ];
    return {
      decks: DEFAULT_DECKS,
      cards: builtin,
      quick_jots: initialJots,
      daily_reviewed_count: 0,
      streak_days: 1,
      last_study_date: new Date().toISOString().slice(0, 10)
    };
  }

  function loadAppState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.cards) && parsed.cards.length >= 1000) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn("读取本地缓存状态失败，使用内置词库初始化:", e);
    }
    const fresh = createInitialState();
    saveAppState(fresh, false);
    return fresh;
  }

  function saveAppState(nextState, broadcast = true) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextState));
      if (broadcast && syncChannel) {
        syncChannel.postMessage({ type: "sync" });
      }
    } catch (e) {
      console.error("保存状态失败:", e);
    }
  }

  let appState = loadAppState();
  let currentDeckId = "cet6-core";
  let currentGroup = "第1组";
  let currentFilter = "all";
  let currentMode = "flashcard";
  let currentIndex = 0;
  let isFlipped = false;
  let maskMeaning = false;
  let maskWord = false;
  let tickerIndex = 0;

  // 获取当前筛选后的卡片列表
  function getFilteredCards() {
    if (currentDeckId === "quick-jot-deck") {
      const jotCards = appState.cards.filter(c => c.deck_id === "quick-jot-deck");
      const virtualFromJots = (appState.quick_jots || []).map((j, idx) => ({
        id: j.id,
        deck_id: "quick-jot-deck",
        group_name: j.tag || "随手记",
        kind: "note",
        front: j.content,
        back: j.translation,
        pos: j.pos || j.tag || "随手记",
        starred: true,
        status: "new",
        interval: 0,
        note: "记录时间：" + (j.created_at || "今日")
      }));
      return [...jotCards, ...virtualFromJots];
    }

    return appState.cards.filter(c => {
      if (c.deck_id !== currentDeckId) return false;
      if (currentGroup !== "all" && c.group_name !== currentGroup) return false;
      if (currentFilter === "starred" && !c.starred) return false;
      if (currentFilter === "learning" && c.status !== "learning") return false;
      if (currentFilter === "mastered" && c.status !== "mastered") return false;
      return true;
    });
  }

  // 语音朗读 (Web Speech API)
  function speakWord(text) {
    if (!("speechSynthesis" in window) || !text) return;
    window.speechSynthesis.cancel();
    const clean = text.replace(/★/g, "").trim();
    const utter = new SpeechSynthesisUtterance(clean);
    utter.lang = /^[a-zA-Z0-9\s\-\.,'\/]+$/.test(clean) ? "en-US" : "zh-CN";
    utter.rate = 0.94;
    window.speechSynthesis.speak(utter);
  }

  // 渲染左侧卡组与统计
  function renderSidebar() {
    const container = document.getElementById("deckListContainer");
    container.innerHTML = appState.decks.map(d => {
      const count = d.id === "quick-jot-deck"
        ? (appState.quick_jots.length + appState.cards.filter(c => c.deck_id === d.id).length)
        : appState.cards.filter(c => c.deck_id === d.id).length;
      const activeCls = d.id === currentDeckId ? "active" : "";
      return `
        <div class="deck-item ${activeCls}" data-deck="${d.id}">
          <div class="deck-icon">${d.icon}</div>
          <div class="deck-info">
            <div class="deck-name">${d.name}</div>
            <div class="deck-meta">${count} 张卡片 · ${d.subtitle}</div>
          </div>
        </div>
      `;
    }).join("");

    container.querySelectorAll(".deck-item").forEach(el => {
      el.addEventListener("click", () => {
        currentDeckId = el.dataset.deck;
        currentIndex = 0;
        isFlipped = false;
        populateGroupSelect();
        renderAll();
      });
    });

    // 更新统计面板
    document.getElementById("statTodayCount").textContent = appState.daily_reviewed_count || 0;
    document.getElementById("statMasteredCount").textContent = appState.cards.filter(c => c.status === "mastered").length;
    document.getElementById("statStarredCount").textContent = appState.cards.filter(c => c.starred).length;
    document.getElementById("statJotCount").textContent = (appState.quick_jots || []).length;
  }

  // 填充组别下拉框（如 第1组 ～ 第50组）
  function populateGroupSelect() {
    const select = document.getElementById("groupSelect");
    const deckCards = appState.cards.filter(c => c.deck_id === currentDeckId);
    const groups = [];
    deckCards.forEach(c => {
      if (c.group_name && !groups.includes(c.group_name)) {
        groups.push(c.group_name);
      }
    });

    const optionsHtml = [
      `<option value="all">全部组别 (${deckCards.length})</option>`,
      ...groups.map(g => {
        const cnt = deckCards.filter(c => c.group_name === g).length;
        return `<option value="${g}">${g} (${cnt}词)</option>`;
      })
    ].join("");
    select.innerHTML = optionsHtml;

    if (groups.length > 0 && currentDeckId === "cet6-core" && groups.includes("第1组")) {
      currentGroup = "第1组";
      select.value = "第1组";
    } else {
      currentGroup = "all";
      select.value = "all";
    }
  }

  // 渲染 3D 琉璃闪卡
  function renderFlashcard() {
    const list = getFilteredCards();
    const cardEl = document.getElementById("mainFlashcard");
    cardEl.classList.toggle("is-flipped", isFlipped);

    if (list.length === 0) {
      document.getElementById("cardFrontText").textContent = "当前筛选下暂无卡片";
      document.getElementById("cardBackWord").textContent = "暂无卡片";
      document.getElementById("cardBackMeaning").textContent = "请切换组别或点击右上角「➕ 新建记忆卡」";
      document.getElementById("cardProgressText").textContent = "0 / 0";
      return;
    }

    if (currentIndex >= list.length) currentIndex = 0;
    if (currentIndex < 0) currentIndex = list.length - 1;

    const card = list[currentIndex];
    document.getElementById("cardGroupBadge").textContent = card.group_name || "默认组";
    document.getElementById("cardPosBadge").textContent = card.pos || "card";
    document.getElementById("cardBackPosBadge").textContent = card.pos || "card";

    const starBadge = document.getElementById("cardStarBadge");
    starBadge.style.display = card.starred ? "inline-block" : "none";

    const frontText = document.getElementById("cardFrontText");
    frontText.textContent = card.front;
    frontText.classList.toggle("starred", Boolean(card.starred));

    document.getElementById("cardBackWord").textContent = card.front + (card.starred ? " ★" : "");
    document.getElementById("cardBackMeaning").textContent = card.back;

    const noteEl = document.getElementById("cardBackNote");
    if (card.note) {
      noteEl.style.display = "block";
      noteEl.textContent = "💡 笔记/扩展：" + card.note;
    } else {
      noteEl.style.display = "none";
    }

    const statusMap = { new: "新卡片", learning: "🔥 待强化复习", review: "⏳ 复习巩固中", mastered: "✅ 已熟记掌握" };
    document.getElementById("cardProgressText").textContent = `${currentIndex + 1} / ${list.length}`;
    document.getElementById("cardStatusText").textContent = statusMap[card.status] || "新卡片";
    document.getElementById("cardIntervalBadge").textContent = card.interval > 0 ? `下次复习: ${card.interval}天后` : "今日首次学习";
  }

  // 渲染听写模式
  function renderDictation() {
    const list = getFilteredCards();
    if (!list.length) return;
    const card = list[currentIndex % list.length];
    document.getElementById("dictPosBadge").textContent = `${card.group_name || ""} · ${card.pos || ""}`;
    document.getElementById("dictMeaningText").textContent = card.back;
    document.getElementById("dictFeedback").innerHTML = "";
  }

  // 渲染瀑布流词表模式
  function renderGridTable() {
    const list = getFilteredCards();
    const tbody = document.getElementById("vocabTableBody");
    tbody.innerHTML = list.slice(0, 200).map((c, idx) => {
      const statusBadge = c.status === "mastered"
        ? `<span style="color:var(--accent-emerald);">✅ 已掌握</span>`
        : c.status === "learning"
        ? `<span style="color:var(--accent-rose);">🔥 待复习</span>`
        : `<span style="color:var(--text-muted);">未背</span>`;
      return `
        <tr>
          <td style="font-family:var(--font-mono); color:var(--text-muted);">${idx + 1}</td>
          <td class="${maskWord ? "masked-cell" : ""}" style="font-weight:700; color:#fff; cursor:pointer;" onclick="window.__speakCard('${c.front.replace(/'/g, "")}')">
            ${c.front} ${c.starred ? '<span style="color:var(--accent-amber);">★</span>' : ""}
          </td>
          <td><span class="pill-badge pos">${c.pos || "-"}</span></td>
          <td class="${maskMeaning ? "masked-cell" : ""}" style="color:var(--accent-cyan);">${c.back}</td>
          <td>${statusBadge}</td>
        </tr>
      `;
    }).join("");
  }

  window.__speakCard = speakWord;

  // 渲染右下角内嵌「随手记」气泡组件
  function renderCornerBubble() {
    const jots = appState.quick_jots || [];
    document.getElementById("jotTotalBadge").textContent = `${jots.length} 条记录`;
    const listEl = document.getElementById("jotListContainer");
    listEl.innerHTML = jots.map(j => `
      <div class="jot-card">
        <div class="jot-card-main">
          <div class="jot-card-word">${j.content} <span class="pill-badge" style="font-size:10px; padding:1px 6px;">${j.tag || "#随手记"}</span></div>
          <div class="jot-card-trans">${j.translation}</div>
        </div>
        <div style="display:flex; gap:5px;">
          <button class="glass-btn" style="height:24px; padding:0 7px; font-size:11px;" title="朗读" onclick="window.__speakCard('${j.content.replace(/'/g, "")}')">🔊</button>
          <button class="glass-btn" style="height:24px; padding:0 7px; font-size:11px;" title="转为正式记忆闪卡" onclick="window.__promoteJot('${j.id}')">➕闪卡</button>
          <button class="glass-btn" style="height:24px; padding:0 7px; font-size:11px;" title="删除" onclick="window.__deleteJot('${j.id}')">✕</button>
        </div>
      </div>
    `).join("");

    // 更新胶囊轮播词
    const pool = appState.cards.filter(c => c.starred);
    if (pool.length > 0) {
      const item = pool[tickerIndex % pool.length];
      document.getElementById("tickerWord").textContent = `${item.front} ★`;
      document.getElementById("tickerMeaning").textContent = `${item.pos ? item.pos + " " : ""}${item.back}`;
    }
  }

  window.__deleteJot = function (jotId) {
    appState.quick_jots = (appState.quick_jots || []).filter(j => j.id !== jotId);
    saveAppState(appState);
    renderSidebar();
    renderCornerBubble();
  };

  window.__promoteJot = function (jotId) {
    const jot = (appState.quick_jots || []).find(j => j.id === jotId);
    if (!jot) return;
    appState.cards.unshift({
      id: "promoted-" + Date.now(),
      deck_id: "quick-jot-deck",
      group_name: "随手记精选",
      kind: "note",
      front: jot.content,
      back: jot.translation,
      pos: jot.tag || "随手记",
      starred: true,
      status: "new",
      interval: 0,
      ease_factor: 2.5,
      repetitions: 0
    });
    saveAppState(appState);
    renderAll();
  };

  function renderAll() {
    renderSidebar();
    renderFlashcard();
    renderDictation();
    renderGridTable();
    renderCornerBubble();
  }

  // 艾宾浩斯评分处理
  function handleRateCard(grade) {
    const list = getFilteredCards();
    if (!list.length) return;
    const current = list[currentIndex];
    const target = appState.cards.find(c => c.id === current.id);
    if (target) {
      if (grade === 1) {
        target.status = "learning";
        target.interval = 0;
        target.repetitions = 0;
      } else if (grade === 2) {
        target.status = "learning";
        target.interval = 1;
      } else if (grade === 3) {
        target.status = "review";
        target.repetitions = (target.repetitions || 0) + 1;
        target.interval = target.repetitions === 1 ? 3 : 7;
      } else if (grade === 4) {
        target.status = "mastered";
        target.interval = 15;
      }
      appState.daily_reviewed_count = (appState.daily_reviewed_count || 0) + 1;
      saveAppState(appState);
    }
    isFlipped = false;
    currentIndex = (currentIndex + 1) % list.length;
    renderAll();
  }

  // 绑定主界面事件
  function bindEvents() {
    // 翻转卡片
    document.getElementById("mainFlashcard").addEventListener("click", (e) => {
      if (e.target.closest("button")) return;
      isFlipped = !isFlipped;
      renderFlashcard();
    });

    // 发音与标星
    document.getElementById("speakWordBtn").addEventListener("click", (e) => {
      e.stopPropagation();
      const list = getFilteredCards();
      if (list[currentIndex]) speakWord(list[currentIndex].front);
    });
    document.getElementById("speakWordBackBtn").addEventListener("click", (e) => {
      e.stopPropagation();
      const list = getFilteredCards();
      if (list[currentIndex]) speakWord(list[currentIndex].front);
    });
    document.getElementById("toggleStarBtn").addEventListener("click", (e) => {
      e.stopPropagation();
      const list = getFilteredCards();
      if (!list[currentIndex]) return;
      const target = appState.cards.find(c => c.id === list[currentIndex].id);
      if (target) {
        target.starred = !target.starred;
        saveAppState(appState);
        renderAll();
      }
    });

    // 上一张 / 下一张 / 评分按钮
    document.getElementById("prevCardBtn").addEventListener("click", () => {
      const list = getFilteredCards();
      if (!list.length) return;
      isFlipped = false;
      currentIndex = (currentIndex - 1 + list.length) % list.length;
      renderFlashcard();
    });
    document.getElementById("nextCardBtn").addEventListener("click", () => {
      const list = getFilteredCards();
      if (!list.length) return;
      isFlipped = false;
      currentIndex = (currentIndex + 1) % list.length;
      renderFlashcard();
    });
    document.querySelectorAll(".rate-btn").forEach(btn => {
      btn.addEventListener("click", () => handleRateCard(Number(btn.dataset.grade)));
    });

    // 模式切换 (3D闪卡 / 听写 / 词表)
    document.querySelectorAll(".mode-tab").forEach(tab => {
      tab.addEventListener("click", () => {
        document.querySelectorAll(".mode-tab").forEach(t => t.classList.remove("active"));
        tab.classList.add("active");
        currentMode = tab.dataset.mode;
        document.getElementById("flashcardPanel").style.display = currentMode === "flashcard" ? "flex" : "none";
        document.getElementById("dictationPanel").classList.toggle("active", currentMode === "dictation");
        document.getElementById("gridPanel").classList.toggle("active", currentMode === "grid");
        renderAll();
      });
    });

    // 组别与过滤切换
    document.getElementById("groupSelect").addEventListener("change", (e) => {
      currentGroup = e.target.value;
      currentIndex = 0;
      isFlipped = false;
      renderAll();
    });
    document.getElementById("filterSelect").addEventListener("change", (e) => {
      currentFilter = e.target.value;
      currentIndex = 0;
      isFlipped = false;
      renderAll();
    });
    document.getElementById("shuffleCardsBtn").addEventListener("click", () => {
      const list = getFilteredCards();
      if (list.length > 1) {
        currentIndex = Math.floor(Math.random() * list.length);
        isFlipped = false;
        renderFlashcard();
      }
    });

    // 听写拼写模式校验
    document.getElementById("dictSpeakBtn").addEventListener("click", () => {
      const list = getFilteredCards();
      if (list[currentIndex]) speakWord(list[currentIndex].front);
    });
    document.getElementById("dictHintBtn").addEventListener("click", () => {
      const list = getFilteredCards();
      if (!list[currentIndex]) return;
      const w = list[currentIndex].front;
      document.getElementById("dictInput").value = w.slice(0, Math.min(3, w.length));
      document.getElementById("dictInput").focus();
    });
    document.getElementById("dictInput").addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      const list = getFilteredCards();
      if (!list[currentIndex]) return;
      const targetWord = list[currentIndex].front.trim();
      const userVal = e.target.value.trim();
      const fb = document.getElementById("dictFeedback");
      if (userVal.toLowerCase() === targetWord.toLowerCase()) {
        fb.innerHTML = `<span style="color:var(--accent-emerald); font-weight:700;">✅ 拼写完全正确！(${targetWord}) — 正在进入下一词...</span>`;
        speakWord(targetWord);
        setTimeout(() => {
          e.target.value = "";
          currentIndex = (currentIndex + 1) % list.length;
          renderDictation();
        }, 900);
      } else {
        fb.innerHTML = `<span style="color:var(--accent-rose);">❌ 拼写有出入，正确答案：<strong style="color:#fff;">${targetWord}</strong></span>`;
        speakWord(targetWord);
      }
    });

    // 词表遮挡自测
    document.getElementById("maskMeaningBtn").addEventListener("click", () => {
      maskMeaning = !maskMeaning;
      renderGridTable();
    });
    document.getElementById("maskWordBtn").addEventListener("click", () => {
      maskWord = !maskWord;
      renderGridTable();
    });

    // 角落「随手记」气泡交互
    const popover = document.getElementById("bubblePopover");
    document.getElementById("toggleJotPopoverBtn").addEventListener("click", (e) => {
      e.stopPropagation();
      popover.classList.toggle("open");
      if (popover.classList.contains("open")) {
        document.getElementById("jotWordInput").focus();
      }
    });
    document.getElementById("closePopoverBtn").addEventListener("click", () => {
      popover.classList.remove("open");
    });
    document.getElementById("bubbleTickerArea").addEventListener("click", () => {
      const pool = appState.cards.filter(c => c.starred);
      if (pool.length) {
        const item = pool[tickerIndex % pool.length];
        speakWord(item.front);
        tickerIndex = (tickerIndex + 1) % pool.length;
        renderCornerBubble();
      }
    });

    // 随手记输入时自动匹配四六级词库释义
    document.getElementById("jotWordInput").addEventListener("input", (e) => {
      const val = e.target.value.trim().toLowerCase();
      if (!val) return;
      const found = appState.cards.find(c => c.front.toLowerCase() === val);
      if (found) {
        document.getElementById("jotTransInput").value = `${found.pos ? found.pos + " " : ""}${found.back}`;
      }
    });

    function submitQuickJot() {
      const wEl = document.getElementById("jotWordInput");
      const tEl = document.getElementById("jotTransInput");
      const tagEl = document.getElementById("jotTagSelect");
      const content = wEl.value.trim();
      if (!content) return;
      let trans = tEl.value.trim();
      if (!trans) {
        const found = appState.cards.find(c => c.front.toLowerCase() === content.toLowerCase());
        trans = found ? `${found.pos || ""} ${found.back}` : "随手记便签";
      }
      appState.quick_jots.unshift({
        id: "jot-" + Date.now(),
        content,
        translation: trans,
        pos: tagEl.value,
        tag: tagEl.value,
        created_at: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      });
      saveAppState(appState);
      wEl.value = "";
      tEl.value = "";
      renderSidebar();
      renderCornerBubble();
    }

    document.getElementById("saveJotBtn").addEventListener("click", submitQuickJot);
    document.getElementById("jotWordInput").addEventListener("keydown", e => { if (e.key === "Enter") submitQuickJot(); });
    document.getElementById("jotTransInput").addEventListener("keydown", e => { if (e.key === "Enter") submitQuickJot(); });

    // 弹出大屏右下角独立「随手记」气泡窗口
    function openStandaloneCornerBubble() {
      if (isTauri) {
        window.__TAURI__.core.invoke("toggle_bubble_window").catch(() => {});
        return;
      }
      const w = 365;
      const h = 450;
      const left = Math.max(0, window.screen.availWidth - w - 24);
      const top = Math.max(0, window.screen.availHeight - h - 48);
      window.open(
        "bubble.html",
        "LexiGlassCornerBubble",
        `width=${w},height=${h},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no,resizable=yes`
      );
    }

    document.getElementById("popoutBubbleWinBtn").addEventListener("click", openStandaloneCornerBubble);
    document.getElementById("openStandaloneBubbleBtn").addEventListener("click", openStandaloneCornerBubble);

    // Ctrl + K 全局搜索模态框
    const cmdModal = document.getElementById("cmdModal");
    const cmdInput = document.getElementById("cmdSearchInput");
    function openCmdPalette() {
      cmdModal.classList.add("show");
      cmdInput.value = "";
      cmdInput.focus();
      renderCmdResults("");
    }
    function renderCmdResults(q) {
      const kw = q.trim().toLowerCase();
      const matched = kw
        ? appState.cards.filter(c => c.front.toLowerCase().includes(kw) || c.back.toLowerCase().includes(kw)).slice(0, 30)
        : appState.cards.slice(0, 15);
      document.getElementById("cmdSearchResults").innerHTML = matched.map(c => `
        <div class="jot-card" style="cursor:pointer;" onclick="window.__jumpToCard('${c.id}')">
          <div class="jot-card-main">
            <div class="jot-card-word">${c.front} ${c.starred ? "★" : ""} <span class="pill-badge pos">${c.pos || ""}</span> <span class="pill-badge">${c.group_name || ""}</span></div>
            <div class="jot-card-trans">${c.back}</div>
          </div>
          <button class="glass-btn" style="height:26px;" onclick="event.stopPropagation(); window.__speakCard('${c.front.replace(/'/g, "")}')">🔊</button>
        </div>
      `).join("");
    }
    window.__jumpToCard = function (cardId) {
      const target = appState.cards.find(c => c.id === cardId);
      if (!target) return;
      currentDeckId = target.deck_id;
      populateGroupSelect();
      currentGroup = "all";
      document.getElementById("groupSelect").value = "all";
      currentFilter = "all";
      document.getElementById("filterSelect").value = "all";
      const list = getFilteredCards();
      currentIndex = Math.max(0, list.findIndex(c => c.id === cardId));
      isFlipped = false;
      cmdModal.classList.remove("show");
      renderAll();
    };
    document.getElementById("openCmdPaletteBtn").addEventListener("click", openCmdPalette);
    document.getElementById("closeCmdModalBtn").addEventListener("click", () => cmdModal.classList.remove("show"));
    cmdInput.addEventListener("input", e => renderCmdResults(e.target.value));

    // 新建任意记忆卡片模态框
    const addModal = document.getElementById("addCardModal");
    document.getElementById("openAddCardModalBtn").addEventListener("click", () => {
      const sel = document.getElementById("newCardDeckSelect");
      sel.innerHTML = appState.decks.map(d => `<option value="${d.id}">${d.icon} ${d.name}</option>`).join("");
      sel.value = currentDeckId;
      addModal.classList.add("show");
    });
    document.getElementById("closeAddCardModalBtn").addEventListener("click", () => addModal.classList.remove("show"));
    document.getElementById("confirmAddCardBtn").addEventListener("click", () => {
      const deckId = document.getElementById("newCardDeckSelect").value;
      const front = document.getElementById("newCardFront").value.trim();
      const pos = document.getElementById("newCardPos").value.trim() || "自定义";
      const back = document.getElementById("newCardBack").value.trim();
      const note = document.getElementById("newCardNote").value.trim();
      if (!front || !back) return;
      appState.cards.unshift({
        id: "user-" + Date.now(),
        deck_id: deckId,
        group_name: "自建卡片",
        kind: "note",
        front,
        back,
        pos,
        note: note || undefined,
        starred: true,
        status: "new",
        interval: 0,
        ease_factor: 2.5,
        repetitions: 0
      });
      saveAppState(appState);
      document.getElementById("newCardFront").value = "";
      document.getElementById("newCardBack").value = "";
      document.getElementById("newCardNote").value = "";
      addModal.classList.remove("show");
      currentDeckId = deckId;
      populateGroupSelect();
      renderAll();
    });

    // 全局键盘流快捷键
    window.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openCmdPalette();
        return;
      }
      if (e.altKey && e.key.toLowerCase() === "b") {
        e.preventDefault();
        popover.classList.toggle("open");
        return;
      }
      if (e.key === "Escape") {
        cmdModal.classList.remove("show");
        addModal.classList.remove("show");
        popover.classList.remove("open");
        return;
      }
      if (["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement.tagName)) return;

      if (e.code === "Space") {
        e.preventDefault();
        isFlipped = !isFlipped;
        renderFlashcard();
      } else if (e.key === "ArrowRight") {
        document.getElementById("nextCardBtn").click();
      } else if (e.key === "ArrowLeft") {
        document.getElementById("prevCardBtn").click();
      } else if (["1", "2", "3", "4"].includes(e.key)) {
        handleRateCard(Number(e.key));
      } else if (e.key.toLowerCase() === "v") {
        document.getElementById("speakWordBtn").click();
      } else if (e.key.toLowerCase() === "s") {
        document.getElementById("toggleStarBtn").click();
      }
    });

    // 角落胶囊每 10 秒温和轮播一个重点词
    setInterval(() => {
      tickerIndex++;
      renderCornerBubble();
    }, 10000);

    if (syncChannel) {
      syncChannel.onmessage = () => {
        appState = loadAppState();
        renderAll();
      };
    }
    window.addEventListener("storage", () => {
      appState = loadAppState();
      renderAll();
    });
  }

  populateGroupSelect();
  bindEvents();
  renderAll();
})();
