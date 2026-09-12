(function () {
  "use strict";

  const STORAGE_KEY = "planner.betawilwang.v1";

  const state = load();

  let viewYear, viewMonth; // 0-indexed month for the visible calendar page
  let selectedDate = toKey(new Date());
  const selectedRecurDays = new Set();

  const els = {
    monthLabel: document.getElementById("monthLabel"),
    calGrid: document.getElementById("calGrid"),
    prevMonth: document.getElementById("prevMonth"),
    nextMonth: document.getElementById("nextMonth"),
    todayBtn: document.getElementById("todayBtn"),
    todayPill: document.getElementById("todayPill"),
    selectedDateLabel: document.getElementById("selectedDateLabel"),

    eventForm: document.getElementById("eventForm"),
    eventTitle: document.getElementById("eventTitle"),
    eventTime: document.getElementById("eventTime"),
    eventList: document.getElementById("eventList"),
    eventEmptyHint: document.getElementById("eventEmptyHint"),

    taskForm: document.getElementById("taskForm"),
    taskTitle: document.getElementById("taskTitle"),
    taskTime: document.getElementById("taskTime"),
    taskList: document.getElementById("taskList"),
    taskEmptyHint: document.getElementById("taskEmptyHint"),
    taskProgressRow: document.getElementById("taskProgressRow"),
    taskProgressFill: document.getElementById("taskProgressFill"),
    taskProgressLabel: document.getElementById("taskProgressLabel"),

    checklistForm: document.getElementById("checklistForm"),
    checklistTitle: document.getElementById("checklistTitle"),
    checklistList: document.getElementById("checklistList"),
    checklistEmptyHint: document.getElementById("checklistEmptyHint"),
    checklistProgressRow: document.getElementById("checklistProgressRow"),
    checklistProgressFill: document.getElementById("checklistProgressFill"),
    checklistProgressLabel: document.getElementById("checklistProgressLabel"),

    recurringForm: document.getElementById("recurringForm"),
    recurringTitle: document.getElementById("recurringTitle"),
    recurringTime: document.getElementById("recurringTime"),
    recurringList: document.getElementById("recurringList"),
    recurringEmptyHint: document.getElementById("recurringEmptyHint"),
    weekdayPicker: document.getElementById("weekdayPicker"),

    refreshNewsBtn: document.getElementById("refreshNewsBtn"),
    watchlistForm: document.getElementById("watchlistForm"),
    tickerInput: document.getElementById("tickerInput"),
    watchlistGrid: document.getElementById("watchlistGrid"),
    watchlistEmptyHint: document.getElementById("watchlistEmptyHint"),
    apiKeyForm: document.getElementById("apiKeyForm"),
    apiKeyInput: document.getElementById("apiKeyInput"),
    apiKeyStatus: document.getElementById("apiKeyStatus"),
  };

  init();

  function init() {
    const now = new Date();
    viewYear = now.getFullYear();
    viewMonth = now.getMonth();

    els.todayPill.textContent = now.toLocaleDateString(undefined, {
      weekday: "long", month: "long", day: "numeric", year: "numeric",
    });

    els.prevMonth.addEventListener("click", () => shiftMonth(-1));
    els.nextMonth.addEventListener("click", () => shiftMonth(1));
    els.todayBtn.addEventListener("click", () => {
      const today = new Date();
      viewYear = today.getFullYear();
      viewMonth = today.getMonth();
      selectDate(toKey(today));
    });

    els.eventForm.addEventListener("submit", onAddEvent);
    els.taskForm.addEventListener("submit", onAddTask);
    els.checklistForm.addEventListener("submit", onAddChecklistItem);
    els.recurringForm.addEventListener("submit", onAddRecurringTask);

    els.weekdayPicker.querySelectorAll(".wd-chip").forEach((chip) => {
      chip.addEventListener("click", () => {
        const day = Number(chip.dataset.day);
        if (selectedRecurDays.has(day)) {
          selectedRecurDays.delete(day);
          chip.classList.remove("active");
        } else {
          selectedRecurDays.add(day);
          chip.classList.add("active");
        }
      });
    });

    els.watchlistForm.addEventListener("submit", onAddTicker);
    els.apiKeyForm.addEventListener("submit", onSaveApiKey);
    els.refreshNewsBtn.addEventListener("click", () => loadAllNews());
    els.apiKeyInput.value = state.finnhubApiKey || "";

    renderCalendar();
    renderSelectedDay();
    renderRecurringList();
    renderWatchlist();
    loadAllNews();
  }

  // ---------- persistence ----------

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return Object.assign({
          events: {}, tasks: {}, checklistItems: [], checklistDone: {},
          recurringTasks: [], recurringDone: {},
          stockWatchlist: [], finnhubApiKey: "",
        }, parsed);
      }
    } catch (e) {
      console.warn("Failed to load planner data", e);
    }
    return {
      events: {}, tasks: {}, checklistItems: [], checklistDone: {},
      recurringTasks: [], recurringDone: {},
      stockWatchlist: [], finnhubApiKey: "",
    };
  }

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.warn("Failed to save planner data", e);
    }
  }

  // ---------- helpers ----------

  function toKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function uid() {
    return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }

  function formatTime12(t) {
    if (!t) return "";
    const [h, m] = t.split(":").map(Number);
    const period = h >= 12 ? "PM" : "AM";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${String(m).padStart(2, "0")} ${period}`;
  }

  function keyToDate(key) {
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y, m - 1, d);
  }

  // Tasks visible on a given date = one-off tasks stored for that date,
  // plus recurring tasks whose weekday set includes that date's weekday.
  // Sorted so timed tasks appear in chronological order, untimed tasks last.
  function getDayTaskItems(dateKey) {
    const weekday = keyToDate(dateKey).getDay();
    const manual = (state.tasks[dateKey] || []).map((t) => ({
      id: t.id, title: t.title, done: t.done, time: t.time || "", recurring: false,
    }));
    const recurDoneSet = new Set(state.recurringDone[dateKey] || []);
    const recurring = state.recurringTasks
      .filter((t) => t.days.includes(weekday))
      .map((t) => ({ id: t.id, title: t.title, done: recurDoneSet.has(t.id), time: t.time || "", recurring: true }));
    return manual.concat(recurring).sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99"));
  }

  function getDayTaskStats(dateKey) {
    const items = getDayTaskItems(dateKey);
    const done = items.filter((i) => i.done).length;
    return { total: items.length, done };
  }

  function toggleRecurringDone(dateKey, id) {
    const arr = state.recurringDone[dateKey] || [];
    const idx = arr.indexOf(id);
    if (idx === -1) arr.push(id); else arr.splice(idx, 1);
    state.recurringDone[dateKey] = arr;
    save();
  }

  // ---------- calendar rendering ----------

  function shiftMonth(delta) {
    viewMonth += delta;
    if (viewMonth < 0) { viewMonth = 11; viewYear--; }
    if (viewMonth > 11) { viewMonth = 0; viewYear++; }
    renderCalendar();
  }

  function renderCalendar() {
    const monthNames = ["January","February","March","April","May","June",
      "July","August","September","October","November","December"];
    els.monthLabel.textContent = `${monthNames[viewMonth]} ${viewYear}`;

    els.calGrid.innerHTML = "";

    const firstOfMonth = new Date(viewYear, viewMonth, 1);
    const startOffset = firstOfMonth.getDay(); // 0 = Sun
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const daysInPrevMonth = new Date(viewYear, viewMonth, 0).getDate();

    const todayKey = toKey(new Date());

    const totalCells = 42; // 6 weeks, fixed grid for smooth stable layout
    const cells = [];

    for (let i = 0; i < startOffset; i++) {
      const dayNum = daysInPrevMonth - startOffset + i + 1;
      const d = new Date(viewYear, viewMonth - 1, dayNum);
      cells.push({ date: d, outside: true });
    }
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({ date: new Date(viewYear, viewMonth, d), outside: false });
    }
    while (cells.length < totalCells) {
      const nextIndex = cells.length - startOffset - daysInMonth + 1;
      cells.push({ date: new Date(viewYear, viewMonth + 1, nextIndex), outside: true });
    }

    const frag = document.createDocumentFragment();

    cells.forEach(({ date, outside }) => {
      const key = toKey(date);
      const cell = document.createElement("div");
      cell.className = "day-cell";
      if (outside) cell.classList.add("outside");
      if (key === todayKey) cell.classList.add("today");
      if (key === selectedDate) cell.classList.add("selected");

      const num = document.createElement("div");
      num.className = "day-num";
      num.textContent = date.getDate();
      cell.appendChild(num);

      const dayEvents = state.events[key] || [];
      if (dayEvents.length) {
        const dots = document.createElement("div");
        dots.className = "day-dots";
        const count = Math.min(dayEvents.length, 4);
        for (let i = 0; i < count; i++) {
          const dot = document.createElement("span");
          dot.className = "day-dot";
          dots.appendChild(dot);
        }
        cell.appendChild(dots);
      }

      const stats = getDayTaskStats(key);
      if (stats.total > 0) {
        const track = document.createElement("div");
        track.className = "day-progress";
        const fill = document.createElement("div");
        fill.className = "day-progress-fill";
        fill.style.width = Math.round((stats.done / stats.total) * 100) + "%";
        track.appendChild(fill);
        cell.appendChild(track);
      }

      cell.addEventListener("click", () => {
        if (outside) {
          viewYear = date.getFullYear();
          viewMonth = date.getMonth();
        }
        selectDate(key);
      });

      frag.appendChild(cell);
    });

    els.calGrid.appendChild(frag);
  }

  function selectDate(key) {
    selectedDate = key;
    renderCalendar();
    renderSelectedDay();
  }

  function renderSelectedDay() {
    const [y, m, d] = selectedDate.split("-").map(Number);
    const date = new Date(y, m - 1, d);
    const todayKey = toKey(new Date());
    const label = date.toLocaleDateString(undefined, {
      weekday: "long", month: "long", day: "numeric",
    });
    els.selectedDateLabel.textContent = selectedDate === todayKey ? `Today · ${label}` : label;

    renderEvents();
    renderTasks();
    renderChecklist();
  }

  // ---------- events ----------

  function onAddEvent(e) {
    e.preventDefault();
    const title = els.eventTitle.value.trim();
    if (!title) return;
    const time = els.eventTime.value;

    if (!state.events[selectedDate]) state.events[selectedDate] = [];
    state.events[selectedDate].push({ id: uid(), title, time });
    state.events[selectedDate].sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99"));

    els.eventTitle.value = "";
    els.eventTime.value = "";
    save();
    renderEvents();
    renderCalendar();
  }

  function renderEvents() {
    const items = state.events[selectedDate] || [];
    els.eventList.innerHTML = "";
    els.eventEmptyHint.hidden = items.length > 0;

    items.forEach((item) => {
      const li = document.createElement("li");
      li.className = "item-row";

      if (item.time) {
        const t = document.createElement("span");
        t.className = "item-time";
        t.textContent = formatTime12(item.time);
        li.appendChild(t);
      }

      const title = document.createElement("span");
      title.className = "item-title";
      title.textContent = item.title;
      li.appendChild(title);

      const del = document.createElement("button");
      del.className = "item-delete";
      del.innerHTML = "&times;";
      del.setAttribute("aria-label", "Remove event");
      del.addEventListener("click", () => removeItem("events", item.id, li));
      li.appendChild(del);

      els.eventList.appendChild(li);
    });
  }

  // ---------- daily tasks ----------

  function onAddTask(e) {
    e.preventDefault();
    const title = els.taskTitle.value.trim();
    if (!title) return;
    const time = els.taskTime.value;

    if (!state.tasks[selectedDate]) state.tasks[selectedDate] = [];
    state.tasks[selectedDate].push({ id: uid(), title, done: false, time });

    els.taskTitle.value = "";
    els.taskTime.value = "";
    save();
    renderTasks();
    renderCalendar();
  }

  function renderTasks() {
    const items = getDayTaskItems(selectedDate);
    els.taskList.innerHTML = "";
    els.taskEmptyHint.hidden = items.length > 0;

    items.forEach((item) => {
      els.taskList.appendChild(buildChecklistRow({
        title: item.title,
        done: item.done,
        time: item.time,
        recurring: item.recurring,
        onToggle: () => {
          if (item.recurring) {
            toggleRecurringDone(selectedDate, item.id);
          } else {
            const list = state.tasks[selectedDate] || [];
            const t = list.find((x) => x.id === item.id);
            if (t) { t.done = !t.done; save(); }
          }
          renderTasks();
          renderCalendar();
        },
        onDelete: item.recurring ? null : (li) => removeItem("tasks", item.id, li),
      }));
    });

    updateProgress(items, els.taskProgressRow, els.taskProgressFill, els.taskProgressLabel);
  }

  function removeItem(kind, id, li) {
    const list = state[kind][selectedDate] || [];
    const idx = list.findIndex((i) => i.id === id);
    if (idx === -1) return;

    if (li) {
      li.classList.add("removing");
      setTimeout(() => {
        list.splice(idx, 1);
        save();
        if (kind === "events") renderEvents(); else renderTasks();
        renderCalendar();
      }, 180);
    } else {
      list.splice(idx, 1);
      save();
      renderCalendar();
    }
  }

  // ---------- daily checklist (recurring) ----------

  function onAddChecklistItem(e) {
    e.preventDefault();
    const title = els.checklistTitle.value.trim();
    if (!title) return;

    state.checklistItems.push({ id: uid(), title });
    els.checklistTitle.value = "";
    save();
    renderChecklist();
  }

  function renderChecklist() {
    const items = state.checklistItems;
    const doneSet = new Set(state.checklistDone[selectedDate] || []);

    els.checklistList.innerHTML = "";
    els.checklistEmptyHint.hidden = items.length > 0;

    items.forEach((item) => {
      const isDone = doneSet.has(item.id);
      els.checklistList.appendChild(buildChecklistRow({
        title: item.title,
        done: isDone,
        onToggle: () => {
          const arr = state.checklistDone[selectedDate] || [];
          const idx = arr.indexOf(item.id);
          if (idx === -1) arr.push(item.id); else arr.splice(idx, 1);
          state.checklistDone[selectedDate] = arr;
          save();
          renderChecklist();
        },
        onDelete: (li) => {
          li.classList.add("removing");
          setTimeout(() => {
            const idx = state.checklistItems.findIndex((i) => i.id === item.id);
            if (idx !== -1) state.checklistItems.splice(idx, 1);
            Object.keys(state.checklistDone).forEach((dateKey) => {
              state.checklistDone[dateKey] = state.checklistDone[dateKey].filter((x) => x !== item.id);
            });
            save();
            renderChecklist();
          }, 180);
        },
      }));
    });

    const asDoneArray = items.map((i) => ({ done: doneSet.has(i.id) }));
    updateProgress(asDoneArray, els.checklistProgressRow, els.checklistProgressFill, els.checklistProgressLabel);
  }

  // ---------- recurring tasks ----------

  function onAddRecurringTask(e) {
    e.preventDefault();
    const title = els.recurringTitle.value.trim();
    if (!title) return;
    const time = els.recurringTime.value;

    // No days picked = repeats every day of the week.
    const days = selectedRecurDays.size ? Array.from(selectedRecurDays).sort() : [0, 1, 2, 3, 4, 5, 6];
    state.recurringTasks.push({ id: uid(), title, days, time });

    els.recurringTitle.value = "";
    els.recurringTime.value = "";
    selectedRecurDays.clear();
    els.weekdayPicker.querySelectorAll(".wd-chip.active").forEach((chip) => chip.classList.remove("active"));

    save();
    renderRecurringList();
    renderTasks();
    renderCalendar();
  }

  function renderRecurringList() {
    const items = state.recurringTasks;
    const dayLabels = ["S", "M", "T", "W", "T", "F", "S"];

    els.recurringList.innerHTML = "";
    els.recurringEmptyHint.hidden = items.length > 0;

    items.forEach((item) => {
      const li = document.createElement("li");
      li.className = "item-row";

      const icon = document.createElement("span");
      icon.className = "recur-icon";
      icon.title = "Recurring task";
      icon.innerHTML = '<svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2 8a6 6 0 0 1 10.2-4.2M14 8a6 6 0 0 1-10.2 4.2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M11 2.2v3.2h-3.2M5 13.8v-3.2h3.2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      li.appendChild(icon);

      if (item.time) {
        const t = document.createElement("span");
        t.className = "item-time";
        t.textContent = formatTime12(item.time);
        li.appendChild(t);
      }

      const titleEl = document.createElement("span");
      titleEl.className = "item-title";
      titleEl.textContent = item.title;
      li.appendChild(titleEl);

      const daysWrap = document.createElement("span");
      daysWrap.className = "recur-days";
      dayLabels.forEach((label, idx) => {
        const tag = document.createElement("span");
        tag.className = "recur-day-tag" + (item.days.includes(idx) ? " active" : "");
        tag.textContent = label;
        daysWrap.appendChild(tag);
      });
      li.appendChild(daysWrap);

      const del = document.createElement("button");
      del.className = "item-delete";
      del.innerHTML = "&times;";
      del.setAttribute("aria-label", "Remove recurring task");
      del.addEventListener("click", () => {
        li.classList.add("removing");
        setTimeout(() => {
          const idx = state.recurringTasks.findIndex((t) => t.id === item.id);
          if (idx !== -1) state.recurringTasks.splice(idx, 1);
          Object.keys(state.recurringDone).forEach((dateKey) => {
            state.recurringDone[dateKey] = state.recurringDone[dateKey].filter((x) => x !== item.id);
          });
          save();
          renderRecurringList();
          renderTasks();
          renderCalendar();
        }, 180);
      });
      li.appendChild(del);

      els.recurringList.appendChild(li);
    });
  }

  // ---------- shared row builder ----------

  function buildChecklistRow({ title, done, onToggle, onDelete, recurring, time }) {
    const li = document.createElement("li");
    li.className = "item-row" + (done ? " done" : "");

    const circle = document.createElement("span");
    circle.className = "check-circle";
    circle.innerHTML = '<svg viewBox="0 0 16 16" fill="none"><path d="M3 8.5L6.2 12 13 4" stroke="#0d0e10" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    li.appendChild(circle);

    if (time) {
      const t = document.createElement("span");
      t.className = "item-time";
      t.textContent = formatTime12(time);
      li.appendChild(t);
    }

    if (recurring) {
      const icon = document.createElement("span");
      icon.className = "recur-icon";
      icon.title = "Recurring task";
      icon.innerHTML = '<svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2 8a6 6 0 0 1 10.2-4.2M14 8a6 6 0 0 1-10.2 4.2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><path d="M11 2.2v3.2h-3.2M5 13.8v-3.2h3.2" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      li.appendChild(icon);
    }

    const titleEl = document.createElement("span");
    titleEl.className = "item-title";
    titleEl.textContent = title;
    li.appendChild(titleEl);

    if (onDelete) {
      const del = document.createElement("button");
      del.className = "item-delete";
      del.innerHTML = "&times;";
      del.setAttribute("aria-label", "Remove item");
      del.addEventListener("click", (evt) => {
        evt.stopPropagation();
        onDelete(li);
      });
      li.appendChild(del);
    }

    li.addEventListener("click", onToggle);

    return li;
  }

  function updateProgress(items, row, fill, label) {
    if (!items.length) {
      row.hidden = true;
      return;
    }
    row.hidden = false;
    const doneCount = items.filter((i) => i.done).length;
    const pct = Math.round((doneCount / items.length) * 100);
    fill.style.width = pct + "%";
    label.textContent = `${doneCount}/${items.length}`;
  }

  // ---------- stock news tracker ----------

  function normalizeSymbol(raw) {
    return raw.trim().toUpperCase().replace(/[^A-Z0-9.\-]/g, "");
  }

  function onAddTicker(e) {
    e.preventDefault();
    const symbol = normalizeSymbol(els.tickerInput.value);
    els.tickerInput.value = "";
    if (!symbol || state.stockWatchlist.includes(symbol)) return;

    state.stockWatchlist.push(symbol);
    save();
    renderWatchlist();
    loadAllNews();
  }

  function removeTicker(symbol, card) {
    card.classList.add("removing");
    setTimeout(() => {
      state.stockWatchlist = state.stockWatchlist.filter((s) => s !== symbol);
      save();
      renderWatchlist();
      loadAllNews();
    }, 180);
  }

  function onSaveApiKey(e) {
    e.preventDefault();
    const key = els.apiKeyInput.value.trim();
    state.finnhubApiKey = key;
    save();

    els.apiKeyStatus.hidden = false;
    els.apiKeyStatus.classList.remove("error");
    els.apiKeyStatus.textContent = key
      ? "Saved — fetching live headlines…"
      : "Key cleared — showing quick links only.";

    loadAllNews();
  }

  function quickLinks(symbol) {
    const sym = encodeURIComponent(symbol);
    return [
      { label: "Yahoo", url: `https://finance.yahoo.com/quote/${sym}/news` },
      { label: "Google", url: `https://www.google.com/finance/quote/${sym}:NASDAQ` },
      { label: "MarketWatch", url: `https://www.marketwatch.com/investing/stock/${sym.toLowerCase()}` },
    ];
  }

  function relativeTime(unixSeconds) {
    const diffMs = Date.now() - unixSeconds * 1000;
    const mins = Math.round(diffMs / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.round(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.round(hours / 24);
    return `${days}d ago`;
  }

  function buildTickerCard(symbol) {
    const card = document.createElement("div");
    card.className = "ticker-card";
    card.dataset.symbol = symbol;

    const head = document.createElement("div");
    head.className = "ticker-card-head";

    const badge = document.createElement("span");
    badge.className = "ticker-symbol";
    badge.textContent = symbol;
    head.appendChild(badge);

    const links = document.createElement("div");
    links.className = "ticker-quick-links";
    quickLinks(symbol).forEach(({ label, url }) => {
      const a = document.createElement("a");
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = label;
      links.appendChild(a);
    });
    head.appendChild(links);

    const del = document.createElement("button");
    del.className = "item-delete";
    del.innerHTML = "&times;";
    del.setAttribute("aria-label", `Stop tracking ${symbol}`);
    del.addEventListener("click", () => removeTicker(symbol, card));
    head.appendChild(del);

    card.appendChild(head);

    const headlines = document.createElement("ul");
    headlines.className = "news-headlines";
    card.appendChild(headlines);

    const status = document.createElement("p");
    status.className = "news-status";
    card.appendChild(status);

    return card;
  }

  function renderWatchlist() {
    els.watchlistGrid.innerHTML = "";
    els.watchlistEmptyHint.hidden = state.stockWatchlist.length > 0;

    state.stockWatchlist.forEach((symbol) => {
      els.watchlistGrid.appendChild(buildTickerCard(symbol));
    });
  }

  async function fetchNewsForTicker(symbol) {
    const card = els.watchlistGrid.querySelector(`.ticker-card[data-symbol="${CSS.escape(symbol)}"]`);
    if (!card) return;
    const headlines = card.querySelector(".news-headlines");
    const status = card.querySelector(".news-status");

    if (!state.finnhubApiKey) {
      headlines.innerHTML = "";
      status.className = "news-status";
      status.textContent = "Add a Finnhub API key above for live headlines.";
      return;
    }

    status.className = "news-status loading";
    status.textContent = "Loading headlines";

    try {
      const to = new Date();
      const from = new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);
      const fmt = (d) => d.toISOString().slice(0, 10);
      const url = `https://finnhub.io/api/v1/company-news?symbol=${encodeURIComponent(symbol)}&from=${fmt(from)}&to=${fmt(to)}&token=${encodeURIComponent(state.finnhubApiKey)}`;

      const res = await fetch(url);
      const data = await res.json();

      if (!res.ok || !Array.isArray(data)) {
        const message = (data && data.error) || `HTTP ${res.status}`;
        throw new Error(message);
      }

      const top = data
        .slice()
        .sort((a, b) => b.datetime - a.datetime)
        .slice(0, 5);

      headlines.innerHTML = "";
      if (!top.length) {
        status.className = "news-status";
        status.textContent = "No recent headlines found — try the quick links above.";
        return;
      }

      top.forEach((item) => {
        const li = document.createElement("li");
        const a = document.createElement("a");
        a.href = item.url;
        a.target = "_blank";
        a.rel = "noopener";
        a.textContent = item.headline;
        li.appendChild(a);

        const meta = document.createElement("span");
        meta.className = "news-meta";
        meta.textContent = `${item.source || "Unknown source"} · ${relativeTime(item.datetime)}`;
        li.appendChild(meta);

        headlines.appendChild(li);
      });

      status.className = "news-status";
      status.textContent = `Updated ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    } catch (err) {
      headlines.innerHTML = "";
      status.className = "news-status error";
      status.textContent = `Couldn't load live headlines (${err.message}). Use the quick links above.`;
    }
  }

  function loadAllNews() {
    state.stockWatchlist.forEach((symbol, i) => {
      setTimeout(() => fetchNewsForTicker(symbol), i * 250);
    });
  }

})();
