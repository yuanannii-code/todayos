/* ============================================================
   TodayOS — app.js
   模組化架構：
   - 工具函式        日期格式化、天數計算等共用邏輯
   - StorageModule   封裝 LocalStorage 讀寫
   - EventsModule    月曆事件的資料存取（CRUD），Phase 2 新增
   - DataModule      提供 Dashboard 所需的資料
                      （今日行程／倒數已改為讀取 EventsModule）
   - DashboardModule 負責把資料渲染進 DOM（首頁 7 張卡片）
   - CalendarModule  月視圖渲染與月份切換，Phase 2 新增
   - SheetModule     日期詳情 / 新增事件 兩個 Bottom Sheet，Phase 2 新增
   - ViewModule      切換「首頁」與「月曆」畫面，Phase 2 新增
   - InteractionModule 綁定所有使用者互動
   - App             進入點，初始化所有模組
============================================================ */

/* ------------------------------------------------------------
   共用工具函式
   使用 function 宣告（而非 const 箭頭函式）以確保 hoisting，
   讓其他模組不需在意這些函式在檔案中的實體位置。
------------------------------------------------------------ */

/** 將 Date 物件格式化為 "YYYY-MM-DD"，作為事件與比對的標準格式 */
function formatDateISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** 計算兩個 "YYYY-MM-DD" 字串之間相差的天數（to - from） */
function diffInDays(fromStr, toStr) {
  const from = new Date(`${fromStr}T00:00:00`);
  const to = new Date(`${toStr}T00:00:00`);
  return Math.round((to - from) / (1000 * 60 * 60 * 24));
}

/** 將 Date 物件格式化為「7月14日」樣式，供 Bottom Sheet 顯示 */
function formatDateDisplay(date) {
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

/** 將 Date 物件轉為中文星期，供 Bottom Sheet 顯示 */
function formatWeekdayDisplay(date) {
  const labels = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
  return labels[date.getDay()];
}

/** 事件分類的顯示標籤，供新增/未來擴充（賽事、活動、提醒、其他）沿用 */
const CATEGORY_LABELS = {
  activity: "活動",
  race: "賽事",
  reminder: "提醒",
  other: "其他",
};

/* ------------------------------------------------------------
   StorageModule
   統一的 LocalStorage 存取層。所有模組讀寫資料
   都應透過這裡，不直接呼叫 localStorage.*，
   方便日後替換儲存方式（例如改成雲端同步）而不動到業務邏輯。
------------------------------------------------------------ */
const StorageModule = (() => {
  const NAMESPACE = "todayos";

  function get(key) {
    try {
      const raw = localStorage.getItem(`${NAMESPACE}.${key}`);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      console.error(`[StorageModule] 讀取 ${key} 失敗`, err);
      return null;
    }
  }

  function set(key, value) {
    try {
      localStorage.setItem(`${NAMESPACE}.${key}`, JSON.stringify(value));
    } catch (err) {
      console.error(`[StorageModule] 寫入 ${key} 失敗`, err);
    }
  }

  return { get, set };
})();

/* ------------------------------------------------------------
   EventsModule（Phase 2 新增）
   月曆事件的唯一資料來源。所有讀取事件的地方
   （Dashboard、Calendar、Bottom Sheet）都透過這裡存取，
   確保「今日行程」「倒數」與月曆看到的是同一份資料。

   事件資料結構（為未來擴充經期／活動／賽事保留彈性）：
   {
     id: "evt_xxxxx",
     title: "字串",
     date: "YYYY-MM-DD",
     time: "HH:mm" | null,
     category: "activity" | "race" | "reminder" | "other",
     note: "字串" | null,
     createdAt: ISOString,
     updatedAt: ISOString
   }
------------------------------------------------------------ */
const EventsModule = (() => {
  const STORAGE_KEY = "events";

  function generateId() {
    return `evt_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  }

  function getAll() {
    return StorageModule.get(STORAGE_KEY) || [];
  }

  function saveAll(events) {
    StorageModule.set(STORAGE_KEY, events);
  }

  /** 新增一筆事件，回傳完整事件物件（含自動產生的 id / 時間戳） */
  function add(event) {
    const events = getAll();
    const now = new Date().toISOString();
    const newEvent = {
      id: generateId(),
      title: event.title,
      date: event.date,
      time: event.time || null,
      category: event.category || "other",
      note: event.note || null,
      createdAt: now,
      updatedAt: now,
    };
    events.push(newEvent);
    saveAll(events);
    return newEvent;
  }

  /** 依 id 取得單一事件 */
  function getById(id) {
    return getAll().find((e) => e.id === id) || null;
  }

  /** 更新指定 id 的事件（部分欄位），回傳更新後的完整事件物件 */
  function update(id, changes) {
    const events = getAll();
    const index = events.findIndex((e) => e.id === id);
    if (index === -1) return null;

    events[index] = {
      ...events[index],
      ...changes,
      updatedAt: new Date().toISOString(),
    };
    saveAll(events);
    return events[index];
  }

  /** 刪除指定 id 的事件 */
  function remove(id) {
    saveAll(getAll().filter((e) => e.id !== id));
  }

  /** 取得某一天的所有事件，依時間排序（無時間者排最後） */
  function getByDate(dateStr) {
    return getAll()
      .filter((e) => e.date === dateStr)
      .sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99"));
  }

  /** 取得某天之後（不含當天）最近的 N 筆事件，依日期排序 */
  function getUpcoming(fromDateStr, limit = 5) {
    return getAll()
      .filter((e) => e.date > fromDateStr)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, limit);
  }

  /** 取得某分類中，日期 >= 指定日期的最近一筆事件（用於 TODAY 倒數卡） */
  function getNextByCategory(category, fromDateStr) {
    const matches = getAll()
      .filter((e) => e.category === category && e.date >= fromDateStr)
      .sort((a, b) => a.date.localeCompare(b.date));
    return matches[0] || null;
  }

  /** 某一天是否有任何事件（供月曆小圓點使用） */
  function hasEventsOnDate(dateStr) {
    return getAll().some((e) => e.date === dateStr);
  }

  /**
   * 首次使用時寫入示範資料，方便立即測試：
   * - 3 筆今日行程（今天的會議／午餐／健身）
   * - 2 筆以上倒數事件（東京馬拉松、健康檢查等未來事件）
   * - 數筆本月範例事件，讓月曆一開始就能看到日期圓點
   */
  function seedIfEmpty() {
    if (getAll().length > 0) return;

    const today = new Date();
    const nowIso = today.toISOString();

    /** 以「今天 + offsetDays」計算日期字串的小工具 */
    function dateWithOffset(offsetDays) {
      const d = new Date(today);
      d.setDate(d.getDate() + offsetDays);
      return formatDateISO(d);
    }

    function buildEvent({ title, offsetDays, time, category, note }) {
      return {
        id: generateId(),
        title,
        date: dateWithOffset(offsetDays),
        time: time || null,
        category,
        note: note || null,
        createdAt: nowIso,
        updatedAt: nowIso,
      };
    }

    saveAll([
      // 今日行程（3 筆）
      buildEvent({ title: "專案會議", offsetDays: 0, time: "09:00", category: "activity" }),
      buildEvent({ title: "午餐約會", offsetDays: 0, time: "12:30", category: "activity" }),
      buildEvent({ title: "健身", offsetDays: 0, time: "18:30", category: "activity" }),

      // 倒數事件（2 筆以上，供 TODAY 卡與倒數事件區塊測試）
      buildEvent({ title: "東京馬拉松", offsetDays: 24, category: "race" }),
      buildEvent({ title: "健康檢查", offsetDays: 10, time: "10:00", category: "reminder" }),

      // 本月範例事件，讓月曆一開始就能看到多個日期圓點
      buildEvent({ title: "朋友聚餐", offsetDays: 5, time: "19:00", category: "activity" }),
      buildEvent({ title: "繳交報告", offsetDays: 2, category: "reminder" }),
      buildEvent({ title: "月初回顧", offsetDays: -3, category: "other", note: "示範用的過去事件" }),
    ]);
  }

  return {
    getAll,
    add,
    getById,
    update,
    remove,
    getByDate,
    getUpcoming,
    getNextByCategory,
    hasEventsOnDate,
    seedIfEmpty,
  };
})();

/* ------------------------------------------------------------
   DataModule
   Dashboard 卡片所需的資料來源。
   getToday() 與 getSchedule() 已改為讀取 EventsModule，
   其餘（日期天氣／經期／飲食／支出）維持 Phase 1 假資料，
   待對應功能模組開發後比照 EventsModule 的方式串接。
------------------------------------------------------------ */
const DataModule = (() => {
  // 倒數進度條的視覺參考窗口（非精確總天數，僅用於呈現進度感）
  const COUNTDOWN_WINDOW_DAYS = 90;

  function getToday() {
    const todayStr = formatDateISO(new Date());
    const nextRace = EventsModule.getNextByCategory("race", todayStr);

    if (!nextRace) {
      return { daysLeft: 0, eventName: "尚未設定倒數目標", percent: 0 };
    }

    const daysLeft = diffInDays(todayStr, nextRace.date);
    const percent = Math.max(
      0,
      Math.min(100, ((COUNTDOWN_WINDOW_DAYS - daysLeft) / COUNTDOWN_WINDOW_DAYS) * 100)
    );

    return { daysLeft, eventName: nextRace.title, percent };
  }

  function getDate() {
    // 之後可改為讀取系統時間 + 天氣 API 快取結果
    return {
      dateLabel: "07 / 14",
      weekday: "Tuesday",
      temp: "28°C",
      condition: "Sunny",
    };
  }

  function getCycle() {
    // 之後可改為: return StorageModule.get("cycle");
    return {
      currentDay: 12,
      cycleLength: 28,
      daysUntilNext: 6,
    };
  }

  function getSchedule() {
    const todayStr = formatDateISO(new Date());
    return EventsModule.getByDate(todayStr).map((e) => ({
      id: e.id,
      time: e.time || "全天",
      title: e.title,
    }));
  }

  function getDiet() {
    // 之後可改為: return StorageModule.get("diet");
    return { current: 1450, goal: 1800 };
  }

  function getExpense() {
    // 之後可改為: return StorageModule.get("expense");
    return { amount: 12850, budget: 20000, remaining: 7150 };
  }

  return {
    getToday,
    getDate,
    getCycle,
    getSchedule,
    getDiet,
    getExpense,
  };
})();

/* ------------------------------------------------------------
   DashboardModule
   負責把 DataModule 提供的資料渲染進對應的 DOM 元素。
   每個 render 函式只處理「一張卡片」，職責單一。
------------------------------------------------------------ */
const DashboardModule = (() => {
  /** 將百分比套用到水平進度條 */
  function setProgressBar(fillElId, wrapElId, percent) {
    const fillEl = document.getElementById(fillElId);
    const wrapEl = document.getElementById(wrapElId);
    const clamped = Math.max(0, Math.min(100, percent));
    if (fillEl) fillEl.style.width = `${clamped}%`;
    if (wrapEl) wrapEl.setAttribute("aria-valuenow", String(Math.round(clamped)));
  }

  /** 渲染 ① TODAY 卡（資料來源已改為 EventsModule 中最近的賽事） */
  function renderToday() {
    const data = DataModule.getToday();
    document.getElementById("today-days-left").textContent = data.daysLeft;
    document.getElementById("today-event-name").textContent = data.eventName;
    setProgressBar("today-progress-fill", "today-progress", data.percent);
  }

  /** 渲染 ② 日期卡 */
  function renderDate() {
    const data = DataModule.getDate();
    document.getElementById("date-number").textContent = data.dateLabel;
    document.getElementById("date-weekday").textContent = data.weekday;
    document.getElementById("weather-temp").textContent = data.temp;
    document.getElementById("weather-condition").textContent = data.condition;
  }

  /** 渲染 ③ 經期卡（圓形進度） */
  function renderCycle() {
    const data = DataModule.getCycle();
    document.getElementById("cycle-day").textContent = `Day ${data.currentDay}`;
    document.getElementById("cycle-next").textContent = `距離下次還有 ${data.daysUntilNext} 天`;

    const ring = document.getElementById("cycle-ring-progress");
    if (!ring) return;
    const radius = 52;
    const circumference = 2 * Math.PI * radius;
    const percent = data.currentDay / data.cycleLength;

    ring.style.strokeDasharray = `${circumference}`;
    ring.style.strokeDashoffset = `${circumference * (1 - percent)}`;
  }

  /** 渲染 ④ 今日行程（資料來源已改為 EventsModule 當天事件） */
  function renderSchedule() {
    const items = DataModule.getSchedule();
    const listEl = document.getElementById("schedule-list");
    if (!listEl) return;

    listEl.innerHTML = "";

    if (items.length === 0) {
      const li = document.createElement("li");
      li.className = "schedule-empty";
      li.textContent = "今天沒有安排";
      listEl.appendChild(li);
      return;
    }

    items.forEach((item) => {
      const li = document.createElement("li");
      li.className = "schedule-item";
      li.dataset.id = item.id;
      li.tabIndex = 0;
      li.setAttribute("role", "button");
      li.innerHTML = `
        <span class="schedule-item__time">${item.time}</span>
        <span class="schedule-item__title">${item.title}</span>
      `;
      listEl.appendChild(li);
    });
  }

  /** 渲染 ⑤ 今日飲食 */
  function renderDiet() {
    const data = DataModule.getDiet();
    document.getElementById("diet-current").textContent = data.current;
    document.getElementById("diet-goal").textContent = data.goal;
    setProgressBar("diet-progress-fill", "diet-progress", (data.current / data.goal) * 100);
  }

  /** 渲染 ⑥ 本月支出 */
  function renderExpense() {
    const data = DataModule.getExpense();
    document.getElementById("expense-amount").textContent = `NT$${data.amount.toLocaleString()}`;
    document.getElementById("expense-budget").textContent = data.budget.toLocaleString();
    document.getElementById("expense-remaining").textContent = data.remaining.toLocaleString();
    setProgressBar("expense-progress-fill", "expense-progress", (data.amount / data.budget) * 100);
  }

  /** 依序渲染所有卡片 */
  function renderAll() {
    renderToday();
    renderDate();
    renderCycle();
    renderSchedule();
    renderDiet();
    renderExpense();
  }

  return { renderAll };
})();

/* ------------------------------------------------------------
   CalendarModule（Phase 2 新增）
   負責月視圖的狀態（目前顯示年月、選取日期）與渲染。
   不處理跳轉頁面，選取日期後交由 SheetModule 顯示詳情。
------------------------------------------------------------ */
const CalendarModule = (() => {
  const WEEKDAY_LABELS = ["日", "一", "二", "三", "四", "五", "六"];

  const state = {
    year: new Date().getFullYear(),
    month: new Date().getMonth(), // 0-indexed
    selectedDate: formatDateISO(new Date()),
  };

  /** 產生月視圖需要的完整格子（含前後月補齊的日期），維持 7 欄整除 */
  function buildMonthMatrix(year, month) {
    const firstDay = new Date(year, month, 1);
    const startWeekday = firstDay.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const totalCells = Math.ceil((startWeekday + daysInMonth) / 7) * 7;

    const cells = [];
    for (let i = 0; i < totalCells; i++) {
      cells.push(new Date(year, month, 1 - startWeekday + i));
    }
    return cells;
  }

  function renderWeekdayHeader() {
    const el = document.getElementById("calendar-weekdays");
    if (!el || el.children.length > 0) return; // 星期標頭只需渲染一次
    WEEKDAY_LABELS.forEach((label) => {
      const span = document.createElement("span");
      span.textContent = label;
      el.appendChild(span);
    });
  }

  function renderHeader() {
    const titleEl = document.getElementById("calendar-title");
    if (titleEl) titleEl.textContent = `${state.year}年${state.month + 1}月`;
  }

  function renderGrid() {
    const gridEl = document.getElementById("calendar-grid");
    if (!gridEl) return;
    gridEl.innerHTML = "";

    const todayStr = formatDateISO(new Date());
    const cells = buildMonthMatrix(state.year, state.month);

    cells.forEach((cellDate) => {
      const dateStr = formatDateISO(cellDate);
      const isCurrentMonth = cellDate.getMonth() === state.month;
      const isToday = dateStr === todayStr;
      const isSelected = dateStr === state.selectedDate;
      const hasEvents = EventsModule.hasEventsOnDate(dateStr);

      const cellBtn = document.createElement("button");
      cellBtn.type = "button";
      cellBtn.className = "calendar-day";
      if (!isCurrentMonth) cellBtn.classList.add("is-other-month");
      if (isToday) cellBtn.classList.add("is-today");
      if (isSelected) cellBtn.classList.add("is-selected");
      cellBtn.dataset.date = dateStr;
      cellBtn.setAttribute("role", "gridcell");
      cellBtn.setAttribute("aria-label", dateStr);

      cellBtn.innerHTML = `
        <span class="calendar-day__number">${cellDate.getDate()}</span>
        ${hasEvents ? '<span class="calendar-day__dot" aria-hidden="true"></span>' : ""}
      `;
      gridEl.appendChild(cellBtn);
    });
  }

  function render() {
    renderHeader();
    renderGrid();
  }

  function goToPrevMonth() {
    state.month -= 1;
    if (state.month < 0) {
      state.month = 11;
      state.year -= 1;
    }
    render();
  }

  function goToNextMonth() {
    state.month += 1;
    if (state.month > 11) {
      state.month = 0;
      state.year += 1;
    }
    render();
  }

  function selectDate(dateStr) {
    state.selectedDate = dateStr;
    render();
  }

  function getSelectedDate() {
    return state.selectedDate;
  }

  function init() {
    renderWeekdayHeader();
    render();
  }

  return { init, render, goToPrevMonth, goToNextMonth, selectDate, getSelectedDate };
})();

/* ------------------------------------------------------------
   SheetModule（Phase 2 新增）
   管理兩個 Bottom Sheet：
   1. 日期詳情（點擊日期後顯示，含今日事件／倒數事件）
   2. 新增事件表單
   兩者皆不跳轉頁面，僅切換 overlay 的顯示狀態。
------------------------------------------------------------ */
const SheetModule = (() => {
  /** 開啟日期詳情 Sheet 並填入該日資料 */
  function openDateSheet(dateStr) {
    const overlay = document.getElementById("date-sheet-overlay");
    if (!overlay) return;

    const dateObj = new Date(`${dateStr}T00:00:00`);
    document.getElementById("sheet-date").textContent = formatDateDisplay(dateObj);
    document.getElementById("sheet-weekday").textContent = formatWeekdayDisplay(dateObj);

    renderEventList("sheet-events", EventsModule.getByDate(dateStr), "今天沒有事件");

    const upcoming = EventsModule.getUpcoming(dateStr, 5);
    renderEventList("sheet-countdown-events", upcoming, "近期沒有其他事件", dateStr);

    overlay.hidden = false;
    overlay.dataset.date = dateStr;
  }

  /**
   * 渲染事件清單，共用於「今日事件」與「倒數事件」兩個區塊。
   * @param {string} listElId - 目標 <ul> 的 id
   * @param {Array} events - 事件陣列
   * @param {string} emptyText - 無資料時顯示的文字
   * @param {string|null} countdownFromDateStr - 若提供，會顯示距離該日期的天數（用於倒數事件）
   */
  function renderEventList(listElId, events, emptyText, countdownFromDateStr = null) {
    const listEl = document.getElementById(listElId);
    if (!listEl) return;
    listEl.innerHTML = "";

    if (events.length === 0) {
      const li = document.createElement("li");
      li.className = "sheet-event-empty";
      li.textContent = emptyText;
      listEl.appendChild(li);
      return;
    }

    events.forEach((event) => {
      const li = document.createElement("li");
      li.className = "sheet-event-item";
      li.dataset.id = event.id;
      li.tabIndex = 0;
      li.setAttribute("role", "button");
      li.setAttribute("aria-label", `編輯事件：${event.title}`);

      const countdownHtml = countdownFromDateStr
        ? `<span class="sheet-event-item__countdown">還有 ${diffInDays(countdownFromDateStr, event.date)} 天</span>`
        : "";

      li.innerHTML = `
        <span class="sheet-event-item__category">${CATEGORY_LABELS[event.category] || "其他"}</span>
        <span class="sheet-event-item__title">${event.title}</span>
        <span class="sheet-event-item__time">${event.time || ""}</span>
        ${countdownHtml}
      `;
      listEl.appendChild(li);
    });
  }

  function closeDateSheet() {
    const overlay = document.getElementById("date-sheet-overlay");
    if (overlay) overlay.hidden = true;
  }

  /**
   * 開啟新增／編輯事件表單。
   * @param {string} prefillDateStr - 預設帶入的日期（新增模式使用）
   * @param {object|null} editEvent - 若提供，表單進入編輯模式並預填此事件資料
   */
  function openEventForm(prefillDateStr, editEvent = null) {
    const overlay = document.getElementById("event-form-overlay");
    const form = document.getElementById("event-form");
    if (!overlay || !form) return;

    form.reset();
    hideDeleteConfirm();

    const titleEl = document.getElementById("event-form-title");
    const submitEl = document.getElementById("event-form-submit");
    const deleteEl = document.getElementById("event-form-delete");

    if (editEvent) {
      titleEl.textContent = "編輯事件";
      submitEl.textContent = "更新";
      deleteEl.hidden = false;
      document.getElementById("event-id").value = editEvent.id;
      document.getElementById("event-title").value = editEvent.title;
      document.getElementById("event-date").value = editEvent.date;
      document.getElementById("event-time").value = editEvent.time || "";
      document.getElementById("event-note").value = editEvent.note || "";
      setActiveCategoryChip(editEvent.category);
    } else {
      titleEl.textContent = "新增事件";
      submitEl.textContent = "儲存";
      deleteEl.hidden = true;
      document.getElementById("event-id").value = "";
      document.getElementById("event-date").value = prefillDateStr || CalendarModule.getSelectedDate();
      setActiveCategoryChip("activity");
    }

    overlay.hidden = false;
  }

  function closeEventForm() {
    const overlay = document.getElementById("event-form-overlay");
    if (overlay) overlay.hidden = true;
    hideDeleteConfirm();
  }

  function showDeleteConfirm() {
    const confirmEl = document.getElementById("event-delete-confirm");
    if (confirmEl) confirmEl.hidden = false;
  }

  function hideDeleteConfirm() {
    const confirmEl = document.getElementById("event-delete-confirm");
    if (confirmEl) confirmEl.hidden = true;
  }

  function setActiveCategoryChip(category) {
    document.querySelectorAll(".category-chip").forEach((chip) => {
      chip.classList.toggle("is-active", chip.dataset.category === category);
    });
  }

  function getActiveCategory() {
    const active = document.querySelector(".category-chip.is-active");
    return active ? active.dataset.category : "activity";
  }

  return {
    openDateSheet,
    closeDateSheet,
    openEventForm,
    closeEventForm,
    setActiveCategoryChip,
    getActiveCategory,
    showDeleteConfirm,
    hideDeleteConfirm,
  };
})();

/* ------------------------------------------------------------
   ViewModule（Phase 2 新增）
   在「首頁」與「月曆」兩個 view 之間切換，
   不使用路由或頁面跳轉，僅切換 DOM 顯示狀態。
------------------------------------------------------------ */
const ViewModule = (() => {
  function showView(viewName) {
    document.querySelectorAll(".view").forEach((view) => {
      view.hidden = view.dataset.view !== viewName;
    });
    // 切換到月曆時重新渲染，確保顯示最新的選取狀態與事件圓點
    if (viewName === "calendar") {
      CalendarModule.render();
    }
  }

  return { showView };
})();

/* ------------------------------------------------------------
   InteractionModule
   綁定所有使用者互動：行程點擊、快捷功能、底部導覽、
   月曆導覽與日期點擊、兩個 Bottom Sheet 的互動。
------------------------------------------------------------ */
const InteractionModule = (() => {
  /** 今日行程項目點擊（Dashboard） */
  function bindScheduleItems() {
    const listEl = document.getElementById("schedule-list");
    if (!listEl) return;

    listEl.addEventListener("click", (event) => {
      const item = event.target.closest(".schedule-item");
      if (!item) return;
      handleScheduleItemClick(item.dataset.id);
    });

    listEl.addEventListener("keydown", (event) => {
      const item = event.target.closest(".schedule-item");
      if (!item) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        handleScheduleItemClick(item.dataset.id);
      }
    });
  }

  function handleScheduleItemClick(eventId) {
    // TODO(Phase 3): 導向事件詳情 / 行內展開編輯表單
    console.log(`[InteractionModule] 點擊行程項目：${eventId}`);
  }

  /** 快捷功能按鈕點擊（Dashboard） */
  function bindQuickActions() {
    const cardEl = document.getElementById("card-quick-actions");
    if (!cardEl) return;

    cardEl.addEventListener("click", (event) => {
      const btn = event.target.closest(".quick-action");
      if (!btn) return;
      handleQuickAction(btn.dataset.action);
    });
  }

  function handleQuickAction(action) {
    if (action === "add") {
      SheetModule.openEventForm(formatDateISO(new Date()));
    } else if (action === "calendar") {
      ViewModule.showView("calendar");
      setActiveTabByName("calendar");
    } else {
      // TODO(Phase 3+): 記帳 / 飲食 / 經期功能尚未開發
      console.log(`[InteractionModule] 快捷功能尚未開放：${action}`);
    }
  }

  /** 底部導覽點擊 */
  function bindBottomTab() {
    const navEl = document.querySelector(".bottom-tab");
    if (!navEl) return;

    navEl.addEventListener("click", (event) => {
      const btn = event.target.closest(".bottom-tab__item");
      if (!btn) return;
      handleTabChange(btn.dataset.tab);
    });
  }

  /** 依 tab 名稱同步底部導覽的 active 樣式（中央＋按鈕不參與） */
  function setActiveTabByName(tabName) {
    document.querySelectorAll(".bottom-tab__item").forEach((btn) => {
      const isAddButton = btn.classList.contains("bottom-tab__item--add");
      btn.classList.toggle("is-active", !isAddButton && btn.dataset.tab === tabName);
    });
  }

  function handleTabChange(tab) {
    if (tab === "home") {
      ViewModule.showView("home");
      setActiveTabByName("home");
    } else if (tab === "calendar") {
      ViewModule.showView("calendar");
      setActiveTabByName("calendar");
    } else if (tab === "add") {
      SheetModule.openEventForm(formatDateISO(new Date()));
    } else {
      // TODO(Phase 3+): 分析 / 更多 尚未開發
      console.log(`[InteractionModule] 分頁尚未開放：${tab}`);
    }
  }

  /** 月曆上一頁／下一頁按鈕 */
  function bindCalendarNav() {
    document.getElementById("calendar-prev")?.addEventListener("click", () => {
      CalendarModule.goToPrevMonth();
    });
    document.getElementById("calendar-next")?.addEventListener("click", () => {
      CalendarModule.goToNextMonth();
    });
  }

  /** 月曆日期格子點擊：選取日期並開啟日期詳情 Sheet */
  function bindCalendarGrid() {
    const gridEl = document.getElementById("calendar-grid");
    if (!gridEl) return;

    gridEl.addEventListener("click", (event) => {
      const dayBtn = event.target.closest(".calendar-day");
      if (!dayBtn) return;
      const dateStr = dayBtn.dataset.date;
      CalendarModule.selectDate(dateStr);
      SheetModule.openDateSheet(dateStr);
    });
  }

  /** 日期詳情 Sheet：關閉按鈕、點擊遮罩關閉、新增事件按鈕 */
  function bindDateSheet() {
    const overlay = document.getElementById("date-sheet-overlay");
    if (!overlay) return;

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) SheetModule.closeDateSheet();
    });

    document.getElementById("date-sheet-close")?.addEventListener("click", () => {
      SheetModule.closeDateSheet();
    });

    document.getElementById("sheet-add-event-btn")?.addEventListener("click", () => {
      const dateStr = overlay.dataset.date;
      SheetModule.closeDateSheet();
      SheetModule.openEventForm(dateStr);
    });
  }

  /** 日期詳情 Sheet 內的事件清單：點擊項目開啟編輯表單 */
  function bindSheetEventLists() {
    ["sheet-events", "sheet-countdown-events"].forEach((listId) => {
      const listEl = document.getElementById(listId);
      if (!listEl) return;

      const openEditor = (target) => {
        const item = target.closest(".sheet-event-item");
        if (!item || !item.dataset.id) return;
        const eventData = EventsModule.getById(item.dataset.id);
        if (!eventData) return;
        SheetModule.closeDateSheet();
        SheetModule.openEventForm(eventData.date, eventData);
      };

      listEl.addEventListener("click", (event) => openEditor(event.target));
      listEl.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openEditor(event.target);
        }
      });
    });
  }

  /** 新增事件表單：關閉、分類選取、送出儲存 */
  function bindEventForm() {
    const overlay = document.getElementById("event-form-overlay");
    if (!overlay) return;

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) SheetModule.closeEventForm();
    });

    document.getElementById("event-form-cancel")?.addEventListener("click", () => {
      SheetModule.closeEventForm();
    });

    document.getElementById("event-form-close")?.addEventListener("click", () => {
      SheetModule.closeEventForm();
    });

    document.getElementById("event-category-select")?.addEventListener("click", (event) => {
      const chip = event.target.closest(".category-chip");
      if (!chip) return;
      SheetModule.setActiveCategoryChip(chip.dataset.category);
    });

    document.getElementById("event-form")?.addEventListener("submit", (event) => {
      event.preventDefault();

      const id = document.getElementById("event-id").value;
      const title = document.getElementById("event-title").value.trim();
      const date = document.getElementById("event-date").value;
      const time = document.getElementById("event-time").value || null;
      const note = document.getElementById("event-note").value.trim() || null;
      const category = SheetModule.getActiveCategory();

      if (!title || !date) return; // required 屬性已擋大部分情況，此為雙重保護

      if (id) {
        EventsModule.update(id, { title, date, time, category, note });
      } else {
        EventsModule.add({ title, date, time, category, note });
      }
      SheetModule.closeEventForm();

      // 新增／更新可能影響 Dashboard（今日行程／倒數）與月曆（圓點／選取日詳情）
      DashboardModule.renderAll();
      CalendarModule.render();
    });

    // 刪除入口：先展開 App 內建確認列，不使用瀏覽器原生 confirm()
    document.getElementById("event-form-delete")?.addEventListener("click", () => {
      SheetModule.showDeleteConfirm();
    });

    document.getElementById("event-delete-cancel")?.addEventListener("click", () => {
      SheetModule.hideDeleteConfirm();
    });

    document.getElementById("event-delete-confirm-btn")?.addEventListener("click", () => {
      const id = document.getElementById("event-id").value;
      if (id) EventsModule.remove(id);
      SheetModule.closeEventForm();

      DashboardModule.renderAll();
      CalendarModule.render();
    });
  }

  function bindAll() {
    bindScheduleItems();
    bindQuickActions();
    bindBottomTab();
    bindCalendarNav();
    bindCalendarGrid();
    bindDateSheet();
    bindSheetEventLists();
    bindEventForm();
  }

  return { bindAll };
})();

/* ------------------------------------------------------------
   App
   進入點：DOM 就緒後準備資料、渲染畫面、綁定互動，
   並註冊 Service Worker 以支援離線與 PWA。
------------------------------------------------------------ */
const App = (() => {
  function registerServiceWorker() {
    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => {
        navigator.serviceWorker
          .register("service-worker.js")
          .catch((err) => console.error("[App] Service Worker 註冊失敗", err));
      });
    }
  }

  function init() {
    EventsModule.seedIfEmpty(); // 首次使用時寫入示範事件
    DashboardModule.renderAll();
    CalendarModule.init();
    InteractionModule.bindAll();
    registerServiceWorker();
  }

  return { init };
})();

// DOM 就緒後啟動 App
document.addEventListener("DOMContentLoaded", App.init);
