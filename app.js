(function () {
  "use strict";

  const STORAGE_KEY = "planner.betawilwang.v1";

  const state = load();

  let viewYear, viewMonth; // 0-indexed month for the visible calendar page
  let selectedDate = toKey(new Date());

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

    renderCalendar();
    renderSelectedDay();
  }

  // ---------- persistence ----------

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return Object.assign({ events: {}, tasks: {}, checklistItems: [], checklistDone: {} }, parsed);
      }
    } catch (e) {
      console.warn("Failed to load planner data", e);
    }
    return { events: {}, tasks: {}, checklistItems: [], checklistDone: {} };
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
      const dayTasks = state.tasks[key] || [];
      if (dayEvents.length || dayTasks.length) {
        const dots = document.createElement("div");
        dots.className = "day-dots";
        const count = Math.min(dayEvents.length + dayTasks.length, 4);
        for (let i = 0; i < count; i++) {
          const dot = document.createElement("span");
          dot.className = "day-dot";
          dots.appendChild(dot);
        }
        cell.appendChild(dots);
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

    if (!state.tasks[selectedDate]) state.tasks[selectedDate] = [];
    state.tasks[selectedDate].push({ id: uid(), title, done: false });

    els.taskTitle.value = "";
    save();
    renderTasks();
    renderCalendar();
  }

  function renderTasks() {
    const items = state.tasks[selectedDate] || [];
    els.taskList.innerHTML = "";
    els.taskEmptyHint.hidden = items.length > 0;

    items.forEach((item) => {
      els.taskList.appendChild(buildChecklistRow({
        title: item.title,
        done: item.done,
        onToggle: () => {
          item.done = !item.done;
          save();
          renderTasks();
        },
        onDelete: (li) => removeItem("tasks", item.id, li),
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

  // ---------- shared row builder ----------

  function buildChecklistRow({ title, done, onToggle, onDelete }) {
    const li = document.createElement("li");
    li.className = "item-row" + (done ? " done" : "");

    const circle = document.createElement("span");
    circle.className = "check-circle";
    circle.innerHTML = '<svg viewBox="0 0 16 16" fill="none"><path d="M3 8.5L6.2 12 13 4" stroke="#0d0e10" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    li.appendChild(circle);

    const titleEl = document.createElement("span");
    titleEl.className = "item-title";
    titleEl.textContent = title;
    li.appendChild(titleEl);

    const del = document.createElement("button");
    del.className = "item-delete";
    del.innerHTML = "&times;";
    del.setAttribute("aria-label", "Remove item");
    del.addEventListener("click", (evt) => {
      evt.stopPropagation();
      onDelete(li);
    });
    li.appendChild(del);

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

})();
