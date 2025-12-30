document.addEventListener("DOMContentLoaded", () => {
  // =========================
  // 1) FOOTER YEAR
  // =========================
  const yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // =========================
  // 2) HERO PREVIEW (onglets)
  // =========================
  const buttons = document.querySelectorAll(".switch-btn");
  const panels = document.querySelectorAll(".preview-panel");

  buttons.forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.dataset.preview;

      buttons.forEach(b => {
        b.classList.remove("active");
        b.setAttribute("aria-selected", "false");
      });
      btn.classList.add("active");
      btn.setAttribute("aria-selected", "true");

      panels.forEach(p => p.classList.remove("active"));
      const panel = document.getElementById(id);
      if (panel) panel.classList.add("active");
    });
  });

  // =========================
  // 3) THEME TOGGLE
  // =========================
  const THEME_KEY = "taskbell_theme";
  const themeToggle = document.getElementById("theme-toggle");

  const updateIcon = () => {
    const isDark = document.body.classList.contains("dark");
    if (themeToggle) themeToggle.textContent = isDark ? "☀️" : "🌙";
  };

  const saved = localStorage.getItem(THEME_KEY);
  if (saved === "dark") document.body.classList.add("dark");
  updateIcon();

  if (themeToggle) {
    themeToggle.addEventListener("click", () => {
      document.body.classList.toggle("dark");
      localStorage.setItem(THEME_KEY, document.body.classList.contains("dark") ? "dark" : "light");
      updateIcon();
    });
  }

  // =========================
  // 4) CONTACT (Formspree réel)
  // =========================
  const contactForm = document.getElementById("contact-form");
  const contactStatus = document.getElementById("contact-status");

  if (contactForm && contactStatus) {
    contactForm.addEventListener("submit", async (e) => {
      e.preventDefault();

      // ✅ plus safe : détecte aussi TON_ID_ICI
      if (!contactForm.action || contactForm.action.includes("XXXXXXX") || contactForm.action.includes("TON_ID_ICI")) {
        contactStatus.className = "form-status err";
        contactStatus.textContent = "⚠️ Ajoute ton lien Formspree réel dans action=\"...\"";
        return;
      }

      contactStatus.className = "form-status ok";
      contactStatus.textContent = "Envoi en cours…";

      try {
        const res = await fetch(contactForm.action, {
          method: "POST",
          body: new FormData(contactForm),
          headers: { "Accept": "application/json" }
        });

        // ✅ lire json si possible (Formspree renvoie des erreurs détaillées)
        const data = await res.json().catch(() => null);

        if (res.ok) {
          contactStatus.className = "form-status ok";
          contactStatus.textContent = "✅ Message envoyé ! Merci 🙂";
          contactForm.reset();
        } else {
          const msg = data?.errors?.[0]?.message;
          contactStatus.className = "form-status err";
          contactStatus.textContent = msg ? `❌ ${msg}` : "❌ Erreur : envoi impossible. Réessaie.";
        }
      } catch {
        contactStatus.className = "form-status err";
        contactStatus.textContent = "❌ Erreur réseau. Vérifie ta connexion.";
      }
    });
  }

  // =========================
  // 5) TASKBELL (To-Do + rappels)
  // =========================
  const STORAGE_KEY = "taskbell_tasks_fixed";
  const CHECK_EVERY = 15000;
  const GRACE = 2 * 60 * 1000;

  const STATUS = { TODO: "todo", PENDING: "pending", DONE: "done" };

  const el = (id) => document.getElementById(id);

  // Form
  const form = el("task-form");
  const titleEl = el("task-title");
  const categoryEl = el("task-category");
  const priorityEl = el("task-priority");
  const dueEl = el("task-due");
  const tagsEl = el("task-tags");
  const reminderEl = el("task-reminder");
  const noteEl = el("task-note");
  const subtasksEl = el("task-subtasks");
  const taskList = el("task-list");

  // Toolbar
  const filterStatusEl = el("filter-status");
  const filterPriorityEl = el("filter-priority");
  const filterCategoryEl = el("filter-category");
  const searchEl = el("search");
  const sortEl = el("sort");

  // Buttons
  const addDemoBtn = el("add-demo");
  const clearAllBtn = el("clear-all");
  const clearCompletedBtn = el("clear-completed");
  const focusModeBtn = el("focus-mode");

  // Side notif
  const notifEnabled = el("notif-enabled");
  const soundStyleEl = el("sound-style");
  const soundPreviewBtn = el("sound-preview");
  const notifTestBtn = el("notif-test-btn");
  const toastEl = el("notif-toast");

  // Stats
  const statTotalEl = el("stat-total");
  const statTodoEl = el("stat-todo");
  const statDoneEl = el("stat-done");
  const progressFillEl = el("progress-fill");
  const progressTextEl = el("progress-text");

  // Details panel
  const detailsEmpty = el("task-details-empty");
  const detailsBox = el("task-details");
  const playTaskSoundBtn = el("play-task-sound");

  // ---- State UI
  const view = {
    selectedId: null,
    filters: { status: "all", priority: "all", category: "all" },
    search: "",
    sort: "created_desc"
  };

  // =========================
  // Utils
  // =========================
  const loadTasks = () => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
    catch { return []; }
  };
  const saveTasks = (tasks) => localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));

  const escapeHTML = (str) => String(str || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

  const parseTags = (txt) => (txt || "").split(",").map(s => s.trim()).filter(Boolean).slice(0, 10);
  const parseSubtasks = (txt) => (txt || "").split("\n").map(s => s.replace(/^-+\s?/, "").trim()).filter(Boolean).slice(0, 15);

  const normalizeStatus = (t) => {
    if (!t.status) t.status = t.done ? STATUS.DONE : STATUS.TODO;
    if (t.status === STATUS.DONE) t.done = true;
    if (t.status === STATUS.TODO) t.done = false;
    return t;
  };

  const statusLabel = (s) => s === STATUS.DONE ? "Terminée" : (s === STATUS.PENDING ? "En attente" : "À faire");

  const statusBadgeClass = (s) => {
    if (s === STATUS.DONE) return "badge-mini purple";
    if (s === STATUS.PENDING) return "badge-mini pink";
    return "badge-mini blue";
  };

  const formatDue = (dueISO) => {
    if (!dueISO) return "Sans échéance";
    const d = new Date(dueISO);
    if (isNaN(d.getTime())) return "Sans échéance";
    return d.toLocaleString("fr-FR", { dateStyle: "medium", timeStyle: "short" });
  };

  const dueMs = (iso) => {
    if (!iso) return Infinity;
    const ms = new Date(iso).getTime();
    return Number.isFinite(ms) ? ms : Infinity;
  };

  const priorityRank = (p) => {
    if (p === "Urgente") return 4;
    if (p === "Haute") return 3;
    if (p === "Normale") return 2;
    if (p === "Basse") return 1;
    return 0;
  };

  const toast = (msg) => {
    if (!toastEl) return;
    toastEl.textContent = msg;
    toastEl.style.display = "block";
    clearTimeout(toast._t);
    toast._t = setTimeout(() => (toastEl.style.display = "none"), 2600);
  };

  // =========================
  // Audio
  // =========================
  let audioUnlocked = false;
  window.addEventListener("pointerdown", () => {
    if (audioUnlocked) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      const ctx = new AC();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.01);
      setTimeout(() => ctx.close?.(), 30);
      audioUnlocked = true;
    } catch {}
  }, { once: true });

  const playSound = (style = "beep") => {
    if (!notifEnabled || !notifEnabled.checked) return;

    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (style === "chime") {
      osc.type = "triangle";
      osc.frequency.value = 988;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.45);
      osc.start();
      osc.stop(ctx.currentTime + 0.48);
      setTimeout(() => ctx.close?.(), 650);
      return;
    }

    if (style === "soft") {
      osc.type = "sine";
      osc.frequency.value = 660;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.18, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
      osc.start();
      osc.stop(ctx.currentTime + 0.36);
      setTimeout(() => ctx.close?.(), 550);
      return;
    }

    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.22, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.28);
    osc.start();
    osc.stop(ctx.currentTime + 0.30);
    setTimeout(() => ctx.close?.(), 500);
  };

  // =========================
  // Progress/stats
  // =========================
  const updateProgress = (tasks) => {
    if (!statTotalEl || !statTodoEl || !statDoneEl || !progressFillEl || !progressTextEl) return;

    tasks.forEach(normalizeStatus);

    const total = tasks.length;
    const done = tasks.filter(t => t.status === STATUS.DONE).length;
    const pending = tasks.filter(t => t.status === STATUS.PENDING).length;
    const todo = total - done - pending;

    statTotalEl.textContent = total;
    statTodoEl.textContent = todo;
    statDoneEl.textContent = done;

    const pct = total === 0 ? 0 : Math.round((done / total) * 100);
    progressFillEl.style.width = pct + "%";
    progressTextEl.textContent = `${pct}% terminé`;
  };

  // =========================
  // Filters/search/sort (view)
  // =========================
  const applyView = (tasks) => {
    let out = tasks.slice().map(normalizeStatus);

    if (view.filters.status !== "all") out = out.filter(t => t.status === view.filters.status);
    if (view.filters.priority !== "all") out = out.filter(t => t.priority === view.filters.priority);
    if (view.filters.category !== "all") out = out.filter(t => t.category === view.filters.category);

    const q = view.search.trim().toLowerCase();
    if (q) {
      out = out.filter(t => {
        const hay = [t.title, t.note, ...(t.tags || [])].join(" ").toLowerCase();
        return hay.includes(q);
      });
    }

    const s = view.sort;
    out.sort((a, b) => {
      if (s === "created_asc") return (a.createdAt || 0) - (b.createdAt || 0);
      if (s === "created_desc") return (b.createdAt || 0) - (a.createdAt || 0);
      if (s === "due_asc") return dueMs(a.due) - dueMs(b.due);
      if (s === "due_desc") return dueMs(b.due) - dueMs(a.due);
      if (s === "priority_desc") return priorityRank(b.priority) - priorityRank(a.priority);
      return (b.createdAt || 0) - (a.createdAt || 0);
    });

    return out;
  };

  // =========================
  // Details panel (✅ FIX: ne dépend plus du bouton)
  // =========================
  const renderDetails = (task) => {
    if (!detailsBox || !detailsEmpty) return;

    // si bouton absent, on continue quand même
    if (!task) {
      detailsEmpty.style.display = "block";
      detailsBox.innerHTML = "";
      if (playTaskSoundBtn) {
        playTaskSoundBtn.disabled = true;
        playTaskSoundBtn.dataset.id = "";
      }
      return;
    }

    detailsEmpty.style.display = "none";

    const tags = (task.tags || []).map(t => `<span class="details-tag">#${escapeHTML(t)}</span>`).join("");
    const subtasks = (task.subtasks || []).map(s => `<div class="subtask"><span>•</span><span>${escapeHTML(s)}</span></div>`).join("");

    detailsBox.innerHTML = `
      <div class="details-grid">
        <div class="details-row"><span>Titre</span><b>${escapeHTML(task.title)}</b></div>
        <div class="details-row"><span>Statut</span><b>${escapeHTML(statusLabel(task.status))}</b></div>
        <div class="details-row"><span>Catégorie</span><b>${escapeHTML(task.category)}</b></div>
        <div class="details-row"><span>Priorité</span><b>${escapeHTML(task.priority)}</b></div>
        <div class="details-row"><span>Échéance</span><b>${escapeHTML(formatDue(task.due))}</b></div>
        <div class="details-row"><span>Rappel</span><b>${task.reminderMin > 0 ? `-${task.reminderMin} min` : "Aucun"}</b></div>
      </div>

      ${task.note ? `<div class="details-row"><span>Note</span><b>${escapeHTML(task.note)}</b></div>` : ""}

      ${(task.tags && task.tags.length) ? `<div class="details-row"><span>Tags</span><b></b></div><div class="details-tags">${tags}</div>` : ""}

      ${(task.subtasks && task.subtasks.length) ? `<div class="details-row"><span>Sous-tâches</span><b></b></div><div class="subtasks">${subtasks}</div>` : ""}
    `;

    if (playTaskSoundBtn) {
      playTaskSoundBtn.disabled = false;
      playTaskSoundBtn.dataset.id = task.id;
    }
  };

  // =========================
  // Render list
  // =========================
  const render = () => {
    if (!taskList) return;

    const tasks = loadTasks();
    updateProgress(tasks);

    const visible = applyView(tasks);
    taskList.innerHTML = "";

    if (visible.length === 0) {
      const li = document.createElement("li");
      li.className = "task-item";
      li.innerHTML = `
        <div class="task-meta">
          <div class="task-title">Aucune tâche</div>
          <div class="task-note">Ajoute une tâche via le formulaire, ou change les filtres.</div>
        </div>`;
      taskList.appendChild(li);

      // ✅ si selectedId existe encore dans tasks, on garde, sinon null
      const cur = tasks.find(x => x.id === view.selectedId);
      renderDetails(cur || null);
      return;
    }

    visible.forEach(t => {
      const subtasksHTML = (t.subtasks && t.subtasks.length)
        ? `<div class="subtasks">
            ${t.subtasks.map(s => `<div class="subtask"><span>•</span><span>${escapeHTML(s)}</span></div>`).join("")}
           </div>`
        : "";

      const li = document.createElement("li");
      li.className = `task-item ${t.done ? "done" : ""} ${view.selectedId === t.id ? "is-selected" : ""}`;
      li.dataset.id = t.id;

      li.innerHTML = `
        <div class="task-left">
          <input type="checkbox" data-check="${t.id}" ${t.done ? "checked" : ""} aria-label="Cocher la tâche">
          <div class="task-meta">
            <div class="task-title">${escapeHTML(t.title)}</div>
            <div class="task-sub">
              <span class="${statusBadgeClass(t.status)}">${escapeHTML(statusLabel(t.status))}</span>
              <span class="badge-mini blue">${escapeHTML(t.category)}</span>
              <span class="badge-mini purple">${escapeHTML(t.priority)}</span>
              <span class="badge-mini purple">${escapeHTML(formatDue(t.due))}</span>
              ${t.reminderMin > 0 ? `<span class="badge-mini pink">Rappel: -${t.reminderMin} min</span>` : ""}
            </div>

            ${t.note ? `<div class="task-note">${escapeHTML(t.note)}</div>` : ""}
            ${subtasksHTML}
          </div>
        </div>

        <div class="task-actions">
          <button class="icon-btn" data-action="status" data-id="${t.id}" type="button">🟡 Statut</button>
          <button class="icon-btn" data-action="remind" data-id="${t.id}" type="button">🔔 Rappel</button>
          <button class="icon-btn delete" data-action="delete" data-id="${t.id}" type="button">🗑 Suppr.</button>
        </div>
      `;

      taskList.appendChild(li);
    });

    // ✅ rend les détails depuis tasks (pas re-load inutile)
    const current = tasks.find(x => x.id === view.selectedId);
    renderDetails(current || null);
  };

  // =========================
  // Reminders auto
  // =========================
  const checkReminders = () => {
    const tasks = loadTasks();
    const now = Date.now();
    let changed = false;

    for (const t of tasks) {
      normalizeStatus(t);

      if (t.status === STATUS.DONE) continue;
      if (!t.due || !t.reminderMin) continue;
      if (t.remindedAt) continue;

      const dueMsVal = new Date(t.due).getTime();
      if (!isFinite(dueMsVal)) continue;

      const remindAt = dueMsVal - (t.reminderMin * 60_000);

      if (now >= remindAt && now <= remindAt + GRACE) {
        t.remindedAt = now;
        changed = true;
        toast(`🔔 Rappel : ${t.title}`);
        playSound(soundStyleEl ? soundStyleEl.value : "beep");
      }
    }

    if (changed) saveTasks(tasks);
  };

  // =========================
  // Actions tasks
  // =========================
  const addTask = () => {
    const title = (titleEl?.value || "").trim();
    if (!title) { toast("⚠️ Écris un titre de tâche"); return; }

    const tasks = loadTasks();
    const t = {
      id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now())),
      title,
      category: categoryEl?.value || "Études",
      priority: priorityEl?.value || "Normale",
      due: dueEl?.value || "",
      tags: parseTags(tagsEl?.value || ""),
      reminderMin: Number(reminderEl?.value || 0),
      note: (noteEl?.value || "").trim(),
      subtasks: parseSubtasks(subtasksEl?.value || ""),
      done: false,
      status: STATUS.TODO,
      createdAt: Date.now(),
      remindedAt: null
    };

    tasks.push(t);
    saveTasks(tasks);

    // ✅ sélection automatique + détails
    view.selectedId = t.id;

    render();
    toast("✅ Tâche ajoutée et sauvegardée !");
    checkReminders();

    form?.reset();
    if (priorityEl) priorityEl.value = "Normale";
    if (categoryEl) categoryEl.value = "Études";
    if (reminderEl) reminderEl.value = "0";
  };

  const deleteTask = (id) => {
    let tasks = loadTasks();
    tasks = tasks.filter(x => x.id !== id);
    saveTasks(tasks);
    if (view.selectedId === id) view.selectedId = null;
    render();
    toast("🗑 Tâche supprimée");
  };

  const cycleStatus = (id) => {
    const tasks = loadTasks();
    const t = tasks.find(x => x.id === id);
    if (!t) return;

    normalizeStatus(t);

    if (t.status === STATUS.TODO) t.status = STATUS.PENDING;
    else if (t.status === STATUS.PENDING) t.status = STATUS.DONE;
    else t.status = STATUS.TODO;

    t.done = (t.status === STATUS.DONE);
    if (t.status !== STATUS.DONE && t.reminderMin > 0 && t.due) t.remindedAt = null;

    saveTasks(tasks);
    render();
    toast("Statut → " + statusLabel(t.status));
  };

  const toggleDone = (id, checked) => {
    const tasks = loadTasks();
    const t = tasks.find(x => x.id === id);
    if (!t) return;

    t.done = !!checked;
    t.status = t.done ? STATUS.DONE : STATUS.TODO;

    if (!t.done && t.reminderMin > 0 && t.due) t.remindedAt = null;

    saveTasks(tasks);
    render();
  };

  // =========================
  // Events
  // =========================
  if (form) {
    form.addEventListener("submit", (e) => {
      e.preventDefault();
      addTask();
    });
  }

  // Click list: buttons + selection
  if (taskList) {
    taskList.addEventListener("click", (e) => {
      const btn = e.target.closest("button[data-action]");
      if (btn) {
        const id = btn.getAttribute("data-id");
        const action = btn.getAttribute("data-action");

        if (action === "delete") return deleteTask(id);
        if (action === "remind") {
          const tasks = loadTasks();
          const t = tasks.find(x => x.id === id);
          if (!t) return;
          toast("🔔 Rappel : " + t.title);
          playSound(soundStyleEl ? soundStyleEl.value : "beep");
          return;
        }
        if (action === "status") return cycleStatus(id);
        return;
      }

      // selection (click on li)
      const li = e.target.closest("li.task-item");
      if (!li || !li.dataset.id) return;

      // éviter sélection si on clique sur checkbox
      if (e.target.closest("input[type='checkbox']")) return;

      view.selectedId = li.dataset.id;
      render();
    });

    taskList.addEventListener("change", (e) => {
      const c = e.target.closest("input[data-check]");
      if (!c) return;
      const id = c.getAttribute("data-check");
      toggleDone(id, c.checked);
    });
  }

  // Toolbar events
  const rerenderOnChange = () => render();

  if (filterStatusEl) filterStatusEl.addEventListener("change", () => {
    view.filters.status = filterStatusEl.value;
    rerenderOnChange();
  });

  if (filterPriorityEl) filterPriorityEl.addEventListener("change", () => {
    view.filters.priority = filterPriorityEl.value;
    rerenderOnChange();
  });

  if (filterCategoryEl) filterCategoryEl.addEventListener("change", () => {
    view.filters.category = filterCategoryEl.value;
    rerenderOnChange();
  });

  if (sortEl) sortEl.addEventListener("change", () => {
    view.sort = sortEl.value;
    rerenderOnChange();
  });

  if (searchEl) {
    let t;
    searchEl.addEventListener("input", () => {
      clearTimeout(t);
      t = setTimeout(() => {
        view.search = searchEl.value || "";
        rerenderOnChange();
      }, 120);
    });
  }

  // Buttons: demo, clear, focus
  if (addDemoBtn) {
    addDemoBtn.addEventListener("click", () => {
      const tasks = loadTasks();
      const now = Date.now();

      const demo1 = {
        id: (crypto.randomUUID ? crypto.randomUUID() : String(now + 1)),
        title: "Révision – analyse de projet",
        category: "Études",
        priority: "Haute",
        due: "",
        tags: ["révision", "unistra"],
        reminderMin: 0,
        note: "Faire un plan + exemples",
        subtasks: ["analyse de projet", "communication", "wordpress"],
        done: false,
        status: STATUS.TODO,
        createdAt: now + 1,
        remindedAt: null
      };

      const demo2 = {
        id: (crypto.randomUUID ? crypto.randomUUID() : String(now + 2)),
        title: "Préparer feedback (contact)",
        category: "Admin",
        priority: "Normale",
        due: "",
        tags: ["feedback", "ui"],
        reminderMin: 0,
        note: "Vérifier texte 24–48h",
        subtasks: ["relire", "tester", "publier"],
        done: false,
        status: STATUS.PENDING,
        createdAt: now + 2,
        remindedAt: null
      };

      tasks.push(demo1, demo2);
      saveTasks(tasks);
      view.selectedId = demo1.id;
      render();
      toast("✅ 2 exemples ajoutés !");
    });
  }

  if (clearAllBtn) {
    clearAllBtn.addEventListener("click", () => {
      saveTasks([]);
      view.selectedId = null;
      render();
      toast("🧹 Tout supprimé");
    });
  }

  if (clearCompletedBtn) {
    clearCompletedBtn.addEventListener("click", () => {
      const tasks = loadTasks().map(normalizeStatus);
      const keep = tasks.filter(t => t.status !== STATUS.DONE);
      saveTasks(keep);
      if (view.selectedId && !keep.find(x => x.id === view.selectedId)) view.selectedId = null;
      render();
      toast("✅ Terminées supprimées");
    });
  }

  if (focusModeBtn) {
    focusModeBtn.addEventListener("click", () => {
      document.body.classList.toggle("focus");
      toast(document.body.classList.contains("focus") ? "🎯 Mode focus activé" : "🎯 Mode focus désactivé");
    });
  }

  // Side buttons
  if (soundPreviewBtn) {
    soundPreviewBtn.addEventListener("click", () => {
      toast("🔊 Aperçu du son");
      playSound(soundStyleEl ? soundStyleEl.value : "beep");
    });
  }

  if (notifTestBtn) {
    notifTestBtn.addEventListener("click", () => {
      toast("🔔 Test notification");
      playSound(soundStyleEl ? soundStyleEl.value : "beep");
    });
  }

  if (playTaskSoundBtn) {
    playTaskSoundBtn.addEventListener("click", () => {
      const id = playTaskSoundBtn.dataset.id;
      if (!id) return;
      const tasks = loadTasks();
      const t = tasks.find(x => x.id === id);
      if (!t) return;
      toast(`🔔 Rappel : ${t.title}`);
      playSound(soundStyleEl ? soundStyleEl.value : "beep");
    });
  }

  // INIT
  render();
  checkReminders();
  setInterval(checkReminders, CHECK_EVERY);
});

// =========================
// NAV ACTIVE (garde en dehors du DOMContentLoaded comme tu l’avais)
// =========================
const navLinks = document.querySelectorAll(".main-nav a");

const setActive = () => {
  const y = window.scrollY + 120;
  const sections = ["accueil","appli","contact"].map(id => document.getElementById(id)).filter(Boolean);

  let current = "accueil";
  sections.forEach(sec => {
    if (sec.offsetTop <= y) current = sec.id;
  });

  navLinks.forEach(a => {
    a.classList.toggle("active", a.getAttribute("href") === `#${current}`);
  });
};

window.addEventListener("scroll", setActive);
setActive();
