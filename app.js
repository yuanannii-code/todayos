/* ============================================================
   TodayOS — app.js
   正式／個人測試版：不建立任何 Demo、Sample、Mock、Fake Data。
   第一次開啟時，所有資料結構皆為空，畫面以 Empty State 呈現，
   所有內容皆由使用者自行新增。

   模組化架構：
   - 工具函式        日期格式化、天數計算等共用邏輯
   - StorageModule   封裝 LocalStorage 讀寫
   - BootstrapModule 首次開啟時，僅建立「空的」資料結構（無任何內容）
   - EventsModule    事件資料的完整 CRUD（新增／查詢／更新／刪除）
   - DataModule      提供 Dashboard 所需資料，無資料時回傳 isEmpty 標記
   - DashboardModule 依 isEmpty 決定渲染「內容」或「空狀態」
   - CalendarModule  月視圖渲染與月份切換（Apple Calendar 風格）
   - CalendarDetailModule 月曆下方固定日期詳情區（取代原本的 Bottom Sheet）
   - SheetModule     新增／編輯事件的 Bottom Sheet
   - ViewModule      切換「首頁」與「月曆」畫面，不做頁面跳轉
   - ToastModule     輕量提示訊息，取代瀏覽器原生 alert()
   - InteractionModule 綁定所有使用者互動
   - App             進入點，初始化所有模組
============================================================ */

/* ------------------------------------------------------------
   共用工具函式（function 宣告以確保 hoisting）
------------------------------------------------------------ */

/** 將 Date 物件格式化為 "YYYY-MM-DD" */
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

/** 將 Date 物件格式化為「Tue, Jul 14, 2026」樣式，供月曆詳情區標題使用 */
function formatFullDateDisplay(date) {
  const weekdayShort = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][date.getDay()];
  const monthShort = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
  ][date.getMonth()];
  return `${weekdayShort}, ${monthShort} ${date.getDate()}, ${date.getFullYear()}`;
}

/** 事件分類的顯示標籤 */
const CATEGORY_LABELS = {
  activity: "活動",
  race: "賽事",
  reminder: "提醒",
  other: "其他",
};

/* ------------------------------------------------------------
   StorageModule
   統一的 LocalStorage 存取層，所有模組讀寫資料都透過這裡。
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
   BootstrapModule（正式版）
   第一次開啟時，僅建立「空的」資料結構，不寫入任何內容：
   events / countdowns / expenses / foods / cycles = []
   settings = {}
   若某個 key 已存在（代表非首次開啟，或使用者已有資料），
   則完全不動，避免覆蓋既有資料。
------------------------------------------------------------ */
const BootstrapModule = (() => {
  const EMPTY_ARRAY_KEYS = ["events", "countdowns", "expenses", "foods", "cycles"];

  function initEmptyStorageIfNeeded() {
    EMPTY_ARRAY_KEYS.forEach((key) => {
      if (StorageModule.get(key) === null) {
        StorageModule.set(key, []);
      }
    });
    if (StorageModule.get("settings") === null) {
      StorageModule.set("settings", {});
    }
  }

  return { initEmptyStorageIfNeeded };
})();

/* ------------------------------------------------------------
   EventsModule
   事件資料的唯一資料來源（今日行程／TODAY 倒數／月曆皆讀這裡）。
   完全不含任何範例資料產生邏輯。

   事件資料結構：
   {
     id, title, date("YYYY-MM-DD"), time("HH:mm"|null),
     category("activity"|"race"|"reminder"|"other"),
     note, createdAt, updatedAt
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

  function getById(id) {
    return getAll().find((e) => e.id === id) || null;
  }

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

  function remove(id) {
    saveAll(getAll().filter((e) => e.id !== id));
  }

  function getByDate(dateStr) {
    return getAll()
      .filter((e) => e.date === dateStr)
      .sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99"));
  }

  function getUpcoming(fromDateStr, limit = 5) {
    return getAll()
      .filter((e) => e.date > fromDateStr)
      .sort((a, b) => a.date.localeCompare(b.date))
      .slice(0, limit);
  }

  function getNextByCategory(category, fromDateStr) {
    const matches = getAll()
      .filter((e) => e.category === category && e.date >= fromDateStr)
      .sort((a, b) => a.date.localeCompare(b.date));
    return matches[0] || null;
  }

  function hasEventsOnDate(dateStr) {
    return getAll().some((e) => e.date === dateStr);
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
  };
})();

/* ------------------------------------------------------------
   DataModule
   Dashboard 卡片所需的資料來源。每個函式在沒有資料時
   回傳 { isEmpty: true }，由 DashboardModule 決定顯示空狀態。
   TODAY 倒數／今日行程讀取真實事件資料（EventsModule）；
   經期／飲食／支出目前尚無對應的新增功能，因此永遠讀到空陣列，
   誠實顯示空狀態，不補上任何假數字。
------------------------------------------------------------ */
const DataModule = (() => {
  // 倒數進度條的視覺參考窗口（非精確總天數，僅用於呈現進度感）
  const COUNTDOWN_WINDOW_DAYS = 90;

  function getToday() {
    const todayStr = formatDateISO(new Date());
    const nextRace = EventsModule.getNextByCategory("race", todayStr);

    if (!nextRace) return { isEmpty: true };

    const daysLeft = diffInDays(todayStr, nextRace.date);
    const percent = Math.max(
      0,
      Math.min(100, ((COUNTDOWN_WINDOW_DAYS - daysLeft) / COUNTDOWN_WINDOW_DAYS) * 100)
    );

    return { isEmpty: false, daysLeft, eventName: nextRace.title, percent };
  }

  /** 回傳裝置的實際日期與星期；天氣尚無真實資料來源，固定回傳 null */
  function getDate() {
    const now = new Date();
    const weekdayLabelsEn = [
      "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
    ];
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    return {
      dateLabel: `${mm} / ${dd}`,
      weekday: weekdayLabelsEn[now.getDay()],
      // 之後串接真實天氣 API 時，改成回傳 { temp: "28°C", condition: "Sunny" }，
      // renderDate() 會自動顯示，不需要再改任何畫面邏輯。
      weather: null,
    };
  }

  function getCycle() {
    const cycles = StorageModule.get("cycles") || [];
    if (cycles.length === 0) return { isEmpty: true };
    // 保留欄位供未來經期功能開發時使用
    const latest = cycles[cycles.length - 1];
    return { isEmpty: false, ...latest };
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
    const foods = StorageModule.get("foods") || [];
    if (foods.length === 0) return { isEmpty: true };
    return { isEmpty: false, ...foods[foods.length - 1] };
  }

  function getExpense() {
    const expenses = StorageModule.get("expenses") || [];
    if (expenses.length === 0) return { isEmpty: true };
    return { isEmpty: false, ...expenses[expenses.length - 1] };
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
   每個 render 函式依 isEmpty 切換「內容區塊」與「空狀態區塊」，
   空狀態時不放入任何假資料，只有提示文字與新增按鈕。
------------------------------------------------------------ */
const DashboardModule = (() => {
  function setProgressBar(fillElId, wrapElId, percent) {
    const fillEl = document.getElementById(fillElId);
    const wrapEl = document.getElementById(wrapElId);
    const clamped = Math.max(0, Math.min(100, percent));
    if (fillEl) fillEl.style.width = `${clamped}%`;
    if (wrapEl) wrapEl.setAttribute("aria-valuenow", String(Math.round(clamped)));
  }

  /** ① TODAY 卡 */
  function renderToday() {
    const data = DataModule.getToday();
    const contentEl = document.getElementById("today-content");
    const emptyEl = document.getElementById("today-empty");

    if (data.isEmpty) {
      contentEl.hidden = true;
      emptyEl.hidden = false;
      return;
    }

    contentEl.hidden = false;
    emptyEl.hidden = true;
    document.getElementById("today-days-left").textContent = data.daysLeft;
    document.getElementById("today-event-name").textContent = data.eventName;
    setProgressBar("today-progress-fill", "today-progress", data.percent);
  }

  /** ② 日期／天氣（併入 TODAY 卡右側）：日期永遠有值，天氣尚無資料來源前維持隱藏 */
  function renderDate() {
    const data = DataModule.getDate();
    document.getElementById("date-number").textContent = data.dateLabel;
    document.getElementById("date-weekday").textContent = data.weekday;

    const weatherEl = document.getElementById("date-weather");
    if (data.weather) {
      weatherEl.hidden = false;
      document.getElementById("weather-temp").textContent = data.weather.temp;
      document.getElementById("weather-condition").textContent = data.weather.condition;
    } else {
      weatherEl.hidden = true;
    }
  }

  /** ③ 經期卡 */
  function renderCycle() {
    const data = DataModule.getCycle();
    const contentEl = document.getElementById("cycle-content");
    const emptyEl = document.getElementById("cycle-empty");

    if (data.isEmpty) {
      contentEl.hidden = true;
      emptyEl.hidden = false;
      return;
    }

    contentEl.hidden = false;
    emptyEl.hidden = true;
    // 欄位保留供未來經期功能開發時串接，目前不會執行到（無新增入口）
    document.getElementById("cycle-day").textContent = `Day ${data.currentDay ?? "-"}`;
    document.getElementById("cycle-next").textContent = data.daysUntilNext
      ? `距離下次還有 ${data.daysUntilNext} 天`
      : "";
  }

  /** ④ 今日行程 */
  function renderSchedule() {
    const items = DataModule.getSchedule();
    const listEl = document.getElementById("schedule-list");
    if (!listEl) return;

    listEl.innerHTML = "";

    if (items.length === 0) {
      const li = document.createElement("li");
      li.className = "schedule-empty";
      li.innerHTML = `
        <p class="schedule-empty__text">尚未新增任何行程</p>
        <button class="empty-state__action" id="schedule-add-btn" type="button">＋ 新增</button>
      `;
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

  /** ⑤ 今日飲食 */
  function renderDiet() {
    const data = DataModule.getDiet();
    const contentEl = document.getElementById("diet-content");
    const emptyEl = document.getElementById("diet-empty");

    if (data.isEmpty) {
      contentEl.hidden = true;
      emptyEl.hidden = false;
      return;
    }

    contentEl.hidden = false;
    emptyEl.hidden = true;
    document.getElementById("diet-current").textContent = data.current ?? 0;
    document.getElementById("diet-goal").textContent = data.goal ?? 0;
    setProgressBar("diet-progress-fill", "diet-progress", data.goal ? (data.current / data.goal) * 100 : 0);
  }

  /** ⑥ 本月支出 */
  function renderExpense() {
    const data = DataModule.getExpense();
    const contentEl = document.getElementById("expense-content");
    const emptyEl = document.getElementById("expense-empty");

    if (data.isEmpty) {
      contentEl.hidden = true;
      emptyEl.hidden = false;
      return;
    }

    contentEl.hidden = false;
    emptyEl.hidden = true;
    document.getElementById("expense-amount").textContent = `NT$${(data.amount ?? 0).toLocaleString()}`;
    document.getElementById("expense-budget").textContent = (data.budget ?? 0).toLocaleString();
    document.getElementById("expense-remaining").textContent = (data.remaining ?? 0).toLocaleString();
    setProgressBar("expense-progress-fill", "expense-progress", data.budget ? (data.amount / data.budget) * 100 : 0);
  }

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
   CalendarModule
   月視圖狀態管理與渲染（Apple Calendar 風格重新設計）：
   - 週一為首（M T W T F S S）
   - 標頭顯示年份＋超大月份縮寫
   - 月曆格子不使用格線／方框，事件僅以最多三個小圓點表示
   - 支援左右滑動切換月份（觸控），沒有事件的日期不加任何標記
------------------------------------------------------------ */
const CalendarModule = (() => {
  const WEEKDAY_LABELS = ["M", "T", "W", "T", "F", "S", "S"]; // 週一為首
  const MONTH_LABELS = [
    "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
    "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
  ];
  const MAX_DOTS = 3; // 事件最多顯示三個小圓點
  const SWIPE_THRESHOLD_PX = 40; // 判定為左右滑動的最小水平位移

  const state = {
    year: new Date().getFullYear(),
    month: new Date().getMonth(),
    selectedDate: formatDateISO(new Date()),
  };

  /** 週一為首的星期索引（Monday=0 ... Sunday=6） */
  function mondayFirstIndex(jsDay) {
    return (jsDay + 6) % 7;
  }

  function buildMonthMatrix(year, month) {
    const firstDay = new Date(year, month, 1);
    const startWeekday = mondayFirstIndex(firstDay.getDay());
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
    if (!el || el.children.length > 0) return;
    WEEKDAY_LABELS.forEach((label) => {
      const span = document.createElement("span");
      span.textContent = label;
      el.appendChild(span);
    });
  }

  function renderHeader() {
    const yearEl = document.getElementById("calendar-year");
    const monthEl = document.getElementById("calendar-month");
    if (yearEl) yearEl.textContent = String(state.year);
    if (monthEl) monthEl.textContent = MONTH_LABELS[state.month];
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
      const dotCount = Math.min(EventsModule.getByDate(dateStr).length, MAX_DOTS);

      const cellBtn = document.createElement("button");
      cellBtn.type = "button";
      cellBtn.className = "cal-day";
      if (!isCurrentMonth) cellBtn.classList.add("is-other-month");
      if (isToday) cellBtn.classList.add("is-today");
      if (isSelected) cellBtn.classList.add("is-selected");
      cellBtn.dataset.date = dateStr;
      cellBtn.setAttribute("role", "gridcell");
      cellBtn.setAttribute("aria-label", dateStr);

      const dotsHtml = dotCount > 0
        ? `<span class="cal-day__dots" aria-hidden="true">${'<span class="cal-day__dot"></span>'.repeat(dotCount)}</span>`
        : '<span class="cal-day__dots" aria-hidden="true"></span>';

      cellBtn.innerHTML = `
        <span class="cal-day__number">${cellDate.getDate()}</span>
        ${dotsHtml}
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

  /** 回到今天所在月份，並選取今天 */
  function goToToday() {
    const now = new Date();
    state.year = now.getFullYear();
    state.month = now.getMonth();
    state.selectedDate = formatDateISO(now);
    render();
    CalendarDetailModule.render(state.selectedDate);
  }

  function selectDate(dateStr) {
    state.selectedDate = dateStr;
    render();
  }

  function getSelectedDate() {
    return state.selectedDate;
  }

  /** 綁定月曆格子區域的左右滑動手勢，切換上一個／下一個月 */
  function bindSwipeGesture() {
    const gridEl = document.getElementById("calendar-grid");
    if (!gridEl) return;

    let startX = 0;
    let startY = 0;
    let tracking = false;

    gridEl.addEventListener("touchstart", (event) => {
      if (event.touches.length !== 1) return;
      startX = event.touches[0].clientX;
      startY = event.touches[0].clientY;
      tracking = true;
    }, { passive: true });

    gridEl.addEventListener("touchend", (event) => {
      if (!tracking) return;
      tracking = false;
      const endX = event.changedTouches[0].clientX;
      const endY = event.changedTouches[0].clientY;
      const deltaX = endX - startX;
      const deltaY = endY - startY;

      // 水平位移明顯大於垂直位移，才視為切換月份的滑動手勢，
      // 避免與一般垂直捲動頁面互相干擾。
      if (Math.abs(deltaX) > SWIPE_THRESHOLD_PX && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
        if (deltaX < 0) {
          goToNextMonth();
        } else {
          goToPrevMonth();
        }
      }
    }, { passive: true });
  }

  function init() {
    renderWeekdayHeader();
    render();
    bindSwipeGesture();
  }

  return {
    init,
    render,
    goToPrevMonth,
    goToNextMonth,
    goToToday,
    selectDate,
    getSelectedDate,
  };
})();

/* ------------------------------------------------------------
   CalendarDetailModule
   月曆下方固定的日期詳情區（取代原本的 Bottom Sheet）。
   隨頁面正常捲動，不使用彈出遮罩，選取日期變更時直接更新內容。
------------------------------------------------------------ */
const CalendarDetailModule = (() => {
  function render(dateStr) {
    const dateObj = new Date(`${dateStr}T00:00:00`);
    const dateEl = document.getElementById("calendar-detail-date");
    if (dateEl) dateEl.textContent = formatFullDateDisplay(dateObj);

    renderTodayEvents(dateStr);
    renderUpcomingEvents(dateStr);
  }

  function renderTodayEvents(dateStr) {
    const events = EventsModule.getByDate(dateStr);
    const listEl = document.getElementById("calendar-detail-events");
    const emptyEl = document.getElementById("calendar-detail-empty");
    if (!listEl || !emptyEl) return;

    listEl.innerHTML = "";

    if (events.length === 0) {
      listEl.hidden = true;
      emptyEl.hidden = false;
      return;
    }

    listEl.hidden = false;
    emptyEl.hidden = true;

    events.forEach((event) => {
      listEl.appendChild(buildEventRow(event));
    });
  }

  function renderUpcomingEvents(dateStr) {
    const groupEl = document.getElementById("calendar-detail-upcoming-group");
    const listEl = document.getElementById("calendar-detail-upcoming");
    if (!groupEl || !listEl) return;

    const upcoming = EventsModule.getUpcoming(dateStr, 5);
    listEl.innerHTML = "";

    if (upcoming.length === 0) {
      groupEl.hidden = true;
      return;
    }

    groupEl.hidden = false;
    upcoming.forEach((event) => {
      listEl.appendChild(buildEventRow(event, dateStr));
    });
  }

  /** 建立單一事件列（時間＋標題，近期事件額外附上倒數天數），點擊可編輯 */
  function buildEventRow(event, countdownFromDateStr = null) {
    const li = document.createElement("li");
    li.className = "cal-detail__event";
    li.dataset.id = event.id;
    li.tabIndex = 0;
    li.setAttribute("role", "button");
    li.setAttribute("aria-label", `編輯事件：${event.title}`);

    const countdownHtml = countdownFromDateStr
      ? `<span class="cal-detail__event-countdown">${diffInDays(countdownFromDateStr, event.date)}天後</span>`
      : "";

    li.innerHTML = `
      <span class="cal-detail__event-time">${event.time || "全天"}</span>
      <span class="cal-detail__event-title">${event.title}</span>
      ${countdownHtml}
    `;
    return li;
  }

  return { render };
})();

/* ------------------------------------------------------------
   SheetModule
   新增／編輯事件的 Bottom Sheet（日期詳情已改為固定資訊區，
   不再使用彈出式 Sheet，相關邏輯移至 CalendarDetailModule）。
------------------------------------------------------------ */
const SheetModule = (() => {
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
    if (!confirmEl) return;
    confirmEl.hidden = false;
    confirmEl.scrollIntoView({ behavior: "smooth", block: "nearest" });
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
    openEventForm,
    closeEventForm,
    setActiveCategoryChip,
    getActiveCategory,
    showDeleteConfirm,
    hideDeleteConfirm,
  };
})();

/* ------------------------------------------------------------
   ViewModule
   在「首頁」與「月曆」兩個 view 之間切換，不做頁面跳轉。
------------------------------------------------------------ */
const ViewModule = (() => {
  function showView(viewName) {
    document.querySelectorAll(".view").forEach((view) => {
      view.hidden = view.dataset.view !== viewName;
    });
    if (viewName === "calendar") {
      CalendarModule.render();
      CalendarDetailModule.render(CalendarModule.getSelectedDate());
    }
  }

  return { showView };
})();

/* ------------------------------------------------------------
   ToastModule
   輕量提示訊息，取代瀏覽器原生 alert()，用於尚未開放的功能
   （記帳／飲食／經期／分析／更多目前僅有介面雛形，無實際資料流程）。
------------------------------------------------------------ */
const ToastModule = (() => {
  let hideTimer = null;

  function show(message) {
    const el = document.getElementById("toast");
    if (!el) return;

    el.textContent = message;
    el.hidden = false;

    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      el.hidden = true;
    }, 2200);
  }

  return { show };
})();

/* ------------------------------------------------------------
   InteractionModule
   綁定所有使用者互動。
------------------------------------------------------------ */
const InteractionModule = (() => {
  /** 今日行程項目點擊／今日行程空狀態的新增按鈕（事件委派，因清單內容會重新渲染） */
  function bindScheduleItems() {
    const listEl = document.getElementById("schedule-list");
    if (!listEl) return;

    listEl.addEventListener("click", (event) => {
      const addBtn = event.target.closest("#schedule-add-btn");
      if (addBtn) {
        SheetModule.openEventForm(formatDateISO(new Date()));
        return;
      }
      const item = event.target.closest(".schedule-item");
      if (!item) return;
      const eventData = EventsModule.getById(item.dataset.id);
      if (!eventData) return;
      SheetModule.openEventForm(eventData.date, eventData);
    });

    listEl.addEventListener("keydown", (event) => {
      const item = event.target.closest(".schedule-item");
      if (!item) return;
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        const eventData = EventsModule.getById(item.dataset.id);
        if (eventData) SheetModule.openEventForm(eventData.date, eventData);
      }
    });
  }

  /** TODAY 卡空狀態的「新增倒數」按鈕：直接開表單並預選「賽事」分類 */
  function bindTodayEmptyAction() {
    document.getElementById("today-add-btn")?.addEventListener("click", () => {
      SheetModule.openEventForm(formatDateISO(new Date()));
      SheetModule.setActiveCategoryChip("race");
    });
  }

  /** 經期／飲食／支出卡的「＋ 新增」：目前尚無對應資料流程，提示尚未開放 */
  function bindPlaceholderCardActions() {
    document.getElementById("cycle-add-btn")?.addEventListener("click", () => {
      ToastModule.show("經期功能尚未開放");
    });
    document.getElementById("diet-add-btn")?.addEventListener("click", () => {
      ToastModule.show("飲食紀錄功能尚未開放");
    });
    document.getElementById("expense-add-btn")?.addEventListener("click", () => {
      ToastModule.show("記帳功能尚未開放");
    });
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
    } else if (action === "expense") {
      ToastModule.show("記帳功能尚未開放");
    } else if (action === "diet") {
      ToastModule.show("飲食紀錄功能尚未開放");
    } else if (action === "cycle") {
      ToastModule.show("經期功能尚未開放");
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
    } else if (tab === "analytics") {
      ToastModule.show("分析功能尚未開放");
    } else if (tab === "more") {
      ToastModule.show("更多功能尚未開放");
    }
  }

  /** 月曆標頭：Today（回到今天）／搜尋／設定（後兩者尚未開放功能，僅提示） */
  function bindCalendarHeaderActions() {
    document.getElementById("calendar-today-btn")?.addEventListener("click", () => {
      CalendarModule.goToToday();
    });
    document.getElementById("calendar-search-btn")?.addEventListener("click", () => {
      ToastModule.show("搜尋功能尚未開放");
    });
    document.getElementById("calendar-settings-btn")?.addEventListener("click", () => {
      ToastModule.show("設定功能尚未開放");
    });
  }

  /** 點擊月曆日期：選取該日並同步更新下方固定詳情區（不再彈出 Bottom Sheet） */
  function bindCalendarGrid() {
    const gridEl = document.getElementById("calendar-grid");
    if (!gridEl) return;

    gridEl.addEventListener("click", (event) => {
      const dayBtn = event.target.closest(".cal-day");
      if (!dayBtn) return;
      const dateStr = dayBtn.dataset.date;
      CalendarModule.selectDate(dateStr);
      CalendarDetailModule.render(dateStr);
    });
  }

  /** 固定日期詳情區：點擊事件列開啟編輯、點「＋ 新增事件」開啟新增表單 */
  function bindCalendarDetail() {
    const detailEl = document.getElementById("calendar-detail");
    if (!detailEl) return;

    const openEditor = (target) => {
      const item = target.closest(".cal-detail__event");
      if (!item || !item.dataset.id) return;
      const eventData = EventsModule.getById(item.dataset.id);
      if (eventData) SheetModule.openEventForm(eventData.date, eventData);
    };

    detailEl.addEventListener("click", (event) => {
      if (event.target.closest("#calendar-add-event-btn")) {
        SheetModule.openEventForm(CalendarModule.getSelectedDate());
        return;
      }
      openEditor(event.target);
    });

    detailEl.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        if (event.target.closest(".cal-detail__event")) {
          event.preventDefault();
          openEditor(event.target);
        }
      }
    });
  }

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

      if (!title || !date) return;

      if (id) {
        EventsModule.update(id, { title, date, time, category, note });
      } else {
        EventsModule.add({ title, date, time, category, note });
      }
      SheetModule.closeEventForm();

      DashboardModule.renderAll();
      CalendarModule.render();
      CalendarDetailModule.render(CalendarModule.getSelectedDate());
    });

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
      CalendarDetailModule.render(CalendarModule.getSelectedDate());
    });
  }

  function bindAll() {
    bindScheduleItems();
    bindTodayEmptyAction();
    bindPlaceholderCardActions();
    bindQuickActions();
    bindBottomTab();
    bindCalendarHeaderActions();
    bindCalendarGrid();
    bindCalendarDetail();
    bindEventForm();
  }

  return { bindAll };
})();

/* ------------------------------------------------------------
   App
   進入點：僅初始化「空的」資料結構（不含任何範例內容）、
   渲染畫面、綁定互動，並註冊 Service Worker。
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
    BootstrapModule.initEmptyStorageIfNeeded(); // 僅建立空結構，不寫入任何範例資料
    DashboardModule.renderAll();
    CalendarModule.init();
    CalendarDetailModule.render(CalendarModule.getSelectedDate());
    InteractionModule.bindAll();
    registerServiceWorker();
  }

  return { init };
})();

// DOM 就緒後啟動 App
document.addEventListener("DOMContentLoaded", App.init);
