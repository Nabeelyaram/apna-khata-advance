// ==============================================================================
// Apna Khata Advance - Main Application Logic
// ==============================================================================

(function () {
  "use strict";

  const config = window.APP_CONFIG || {};
  const SESSION_KEY = "apna_khata_session_token";
  const USER_KEY = "apna_khata_user_info";

  const state = {
    user: null,
    token: localStorage.getItem(SESSION_KEY) || "",
    currentTab: "dashboard",
    khataEntries: [],
    committees: [],
    finances: []
  };

  // Helper selectors
  const $ = (id) => document.getElementById(id);

  // Formatting helpers
  const money = (val) => "Rs " + Number(val || 0).toLocaleString("en-PK");
  const formatDate = (isoStr) => {
    if (!isoStr) return "";
    return new Intl.DateTimeFormat("en-PK", {
      dateStyle: "medium",
      timeZone: "Asia/Karachi"
    }).format(new Date(isoStr));
  };
  const formatDateTime = (isoStr) => {
    if (!isoStr) return "";
    return new Intl.DateTimeFormat("en-PK", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "Asia/Karachi"
    }).format(new Date(isoStr));
  };

  function toast(message) {
    const el = $("toastNotice");
    if (!el) return;
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.remove("show"), 2800);
  }

  // Supabase Fetch Wrapper
  async function api(path, options = {}) {
    const headers = {
      apikey: config.supabaseAnonKey,
      Authorization: `Bearer ${config.supabaseAnonKey}`,
      "Content-Type": "application/json",
      ...(options.headers || {})
    };
    if (state.token) {
      headers["X-App-Session"] = state.token;
    }

    const response = await fetch(`${config.supabaseUrl}/rest/v1/${path}`, {
      ...options,
      headers
    });

    const text = await response.text();
    if (!response.ok) {
      let errMsg = `Request failed (${response.status})`;
      try {
        const json = JSON.parse(text);
        errMsg = json.message || json.error || errMsg;
      } catch (_) {}
      throw new Error(errMsg);
    }
    return text ? JSON.parse(text) : null;
  }

  // ----------------------------------------------------------------------------
  // AUTHENTICATION
  // ----------------------------------------------------------------------------

  function checkExistingSession() {
    if (!state.token) {
      showAuth();
      return;
    }
    api("rpc/app_restore_session", { method: "POST", body: "{}" })
      .then((res) => {
        if (res && res.authenticated && res.user) {
          state.user = res.user;
          localStorage.setItem(USER_KEY, JSON.stringify(res.user));
          showApp();
          loadAllData();
        } else {
          logout();
        }
      })
      .catch(() => {
        // Fallback to local storage if offline
        const cached = localStorage.getItem(USER_KEY);
        if (cached) {
          try {
            state.user = JSON.parse(cached);
            showApp();
            return;
          } catch (_) {}
        }
        showAuth();
      });
  }

  async function handleLogin(e) {
    e.preventDefault();
    const phone = $("loginPhone").value.trim();
    const password = $("loginPassword").value;
    const btn = $("loginSubmitBtn");

    try {
      btn.disabled = true;
      btn.textContent = "Checking...";
      const res = await api("rpc/app_login", {
        method: "POST",
        body: JSON.stringify({ input_phone: phone, input_password: password })
      });

      if (!res || !res.success) {
        throw new Error(res?.error || "Login fail ho gaya");
      }

      state.token = res.session_token;
      state.user = res.user;
      localStorage.setItem(SESSION_KEY, state.token);
      localStorage.setItem(USER_KEY, JSON.stringify(state.user));

      toast(`Khushamdeed ${state.user.name}!`);
      showApp();
      loadAllData();
    } catch (err) {
      alert(err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = "Khata Kholein";
    }
  }

  async function handleRegister(e) {
    e.preventDefault();
    const name = $("regName").value.trim();
    const phone = $("regPhone").value.trim();
    const password = $("regPassword").value;
    const btn = $("regSubmitBtn");

    try {
      btn.disabled = true;
      btn.textContent = "Profile ban rahi hai...";
      const res = await api("rpc/app_register", {
        method: "POST",
        body: JSON.stringify({ input_phone: phone, input_name: name, input_password: password })
      });

      if (!res || !res.success) {
        throw new Error(res?.error || "Registration fail ho gayi");
      }

      state.token = res.session_token;
      state.user = res.user;
      localStorage.setItem(SESSION_KEY, state.token);
      localStorage.setItem(USER_KEY, JSON.stringify(state.user));

      toast(`Profile ban gayi! Khushamdeed ${state.user.name}`);
      showApp();
      loadAllData();
    } catch (err) {
      alert(err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = "Profile Banayein & Shuru Karein";
    }
  }

  async function logout() {
    try {
      if (state.token) {
        await api("rpc/app_logout", { method: "POST", body: "{}" });
      }
    } catch (_) {}
    state.token = "";
    state.user = null;
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(USER_KEY);
    showAuth();
  }

  function showAuth() {
    $("authScreen").style.display = "flex";
    $("mainApp").style.display = "none";
  }

  function showApp() {
    $("authScreen").style.display = "none";
    $("mainApp").style.display = "flex";

    if (state.user) {
      $("userDisplayName").textContent = state.user.name;
      $("userAvatarChar").textContent = state.user.name.charAt(0).toUpperCase();
    }
    $("todayDateStr").textContent = new Intl.DateTimeFormat("en-PK", {
      dateStyle: "full",
      timeZone: "Asia/Karachi"
    }).format(new Date());
  }

  // ----------------------------------------------------------------------------
  // DATA LOADING & RENDERING
  // ----------------------------------------------------------------------------

  async function loadAllData() {
    try {
      await Promise.all([
        loadKhata(),
        loadCommittees(),
        loadFinances()
      ]);
      renderDashboard();
    } catch (err) {
      console.error(err);
      toast("Data load karne me masla aaya");
    }
  }

  async function loadKhata() {
    state.khataEntries = await api("khata_entries?select=*&order=entry_date.desc") || [];
    renderKhata();
  }

  async function loadCommittees() {
    state.committees = await api("committees?select=*&order=created_at.desc") || [];
    renderCommittees();
  }

  async function loadFinances() {
    state.finances = await api("household_finance?select=*&order=entry_date.desc") || [];
    renderFinances();
  }

  // ----------------------------------------------------------------------------
  // KHATA LOGIC
  // ----------------------------------------------------------------------------

  function khataSummary() {
    let receivable = 0; // Maine lene hain
    let payable = 0;    // Maine dene hain

    state.khataEntries.forEach((r) => {
      const amt = Number(r.amount || 0);
      if (r.entry_type === "receivable") receivable += amt;
      else if (r.entry_type === "payable") payable += amt;
      else if (r.entry_type === "settlement_received") receivable -= amt;
      else if (r.entry_type === "settlement_paid") payable -= amt;
    });

    return {
      receivable: Math.max(0, receivable),
      payable: Math.max(0, payable)
    };
  }

  function renderKhata() {
    const list = $("khataList");
    if (!list) return;

    const sum = khataSummary();
    $("khataTotalReceivable").textContent = money(sum.receivable);
    $("khataTotalPayable").textContent = money(sum.payable);

    if (!state.khataEntries.length) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🤝</div>
          <p>Abhi koi Khata entry nahi hai. "+ Nayi Entry Karein" par click karein.</p>
        </div>`;
      return;
    }

    const typeLabels = {
      receivable: { text: "Maine diye (Lene hain)", cls: "amount-receivable", dot: "receivable" },
      payable: { text: "Is ne diye (Dene hain)", cls: "amount-payable", dot: "payable" },
      settlement_received: { text: "Is ne wapas diye (Khata Wapsi)", cls: "amount-neutral", dot: "settlement" },
      settlement_paid: { text: "Maine wapas diye (Adaigi)", cls: "amount-neutral", dot: "settlement" }
    };

    list.innerHTML = state.khataEntries.map((row) => {
      const info = typeLabels[row.entry_type] || { text: "Khata", cls: "amount-neutral", dot: "settlement" };
      return `
        <div class="item-card">
          <div class="item-left">
            <div class="type-indicator ${info.dot}"></div>
            <div class="item-main">
              <h4>${escapeHtml(row.person_name)} ${row.person_phone ? `<span style="font-size:12px;opacity:0.8;">(${row.person_phone})</span>` : ""}</h4>
              <span>${info.text} · ${formatDateTime(row.entry_date)}</span>
              ${row.note ? `<div style="font-size:12px;color:var(--text-muted);margin-top:2px;">"${escapeHtml(row.note)}"</div>` : ""}
            </div>
          </div>
          <div class="item-right">
            <span class="item-amount ${info.cls}">${money(row.amount)}</span>
            <button type="button" class="btn-del" data-del-khata="${row.id}" title="Delete entry">🗑️</button>
          </div>
        </div>`;
    }).join("");

    list.querySelectorAll("[data-del-khata]").forEach((btn) => {
      btn.addEventListener("click", () => deleteKhata(btn.dataset.delKhata));
    });
  }

  async function handleAddKhata(e) {
    e.preventDefault();
    const person = $("khataPerson").value.trim();
    const phone = $("khataPhone").value.trim();
    const type = $("khataType").value;
    const amount = Number($("khataAmount").value);
    const note = $("khataNote").value.trim();

    try {
      await api("khata_entries", {
        method: "POST",
        body: JSON.stringify({
          user_id: state.user.id,
          person_name: person,
          person_phone: phone || null,
          entry_type: type,
          amount,
          note: note || null
        })
      });
      closeModal("khataModal");
      $("khataForm").reset();
      toast("Khata entry save ho gayi!");
      await loadKhata();
      renderDashboard();
    } catch (err) {
      alert("Save fail: " + err.message);
    }
  }

  async function deleteKhata(id) {
    if (!confirm("Kya aap yeh entry delete karna chahte hain?")) return;
    try {
      await api(`khata_entries?id=eq.${id}`, { method: "DELETE" });
      toast("Entry delete ho gayi");
      await loadKhata();
      renderDashboard();
    } catch (err) {
      alert(err.message);
    }
  }

  // ----------------------------------------------------------------------------
  // KAMETI / COMMITTEE LOGIC
  // ----------------------------------------------------------------------------

  function renderCommittees() {
    const list = $("kametiList");
    if (!list) return;

    if (!state.committees.length) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">👥</div>
          <p>Abhi koi committee/kameti record nahi hai. "+ Nayi Kameti Shuru Karein" par click karein.</p>
        </div>`;
      return;
    }

    list.innerHTML = state.committees.map((com) => {
      return `
        <div class="item-card">
          <div class="item-left">
            <div class="type-indicator" style="background:#38bdf8;"></div>
            <div class="item-main">
              <h4>${escapeHtml(com.name)}</h4>
              <span>Shuru: ${formatDate(com.start_date)} · Duration: ${com.total_months} Mahinay</span>
              <div style="font-size:12px;color:var(--text-muted);margin-top:3px;">
                Maahana Qist: <strong>${money(com.monthly_amount)}</strong> | Meri Baari: ${com.my_turn_month ? `Mahina ${com.my_turn_month}` : "Mukarrar nahi"}
              </div>
            </div>
          </div>
          <div class="item-right">
            <div>
              <div style="font-size:11px;color:var(--text-muted);">KUL RAQAM</div>
              <span class="item-amount" style="color:#38bdf8;">${money(com.total_amount)}</span>
            </div>
            <button type="button" class="btn-del" data-del-kameti="${com.id}" title="Delete kameti">🗑️</button>
          </div>
        </div>`;
    }).join("");

    list.querySelectorAll("[data-del-kameti]").forEach((btn) => {
      btn.addEventListener("click", () => deleteCommittee(btn.dataset.delKameti));
    });
  }

  async function handleAddCommittee(e) {
    e.preventDefault();
    const name = $("kametiName").value.trim();
    const total = Number($("kametiTotal").value);
    const monthly = Number($("kametiMonthly").value);
    const months = Number($("kametiMonths").value);
    const turn = $("kametiTurn").value ? Number($("kametiTurn").value) : null;
    const startDate = $("kametiStart").value;
    const note = $("kametiNote").value.trim();

    try {
      await api("committees", {
        method: "POST",
        body: JSON.stringify({
          user_id: state.user.id,
          name,
          total_amount: total,
          monthly_amount: monthly,
          total_months: months,
          my_turn_month: turn,
          start_date: startDate,
          note: note || null
        })
      });
      closeModal("kametiModal");
      $("kametiForm").reset();
      toast("Kameti record save ho gaya!");
      await loadCommittees();
      renderDashboard();
    } catch (err) {
      alert("Save fail: " + err.message);
    }
  }

  async function deleteCommittee(id) {
    if (!confirm("Kya aap yeh committee record delete karna chahte hain?")) return;
    try {
      await api(`committees?id=eq.${id}`, { method: "DELETE" });
      toast("Kameti delete ho gayi");
      await loadCommittees();
      renderDashboard();
    } catch (err) {
      alert(err.message);
    }
  }

  // ----------------------------------------------------------------------------
  // HOUSEHOLD FINANCE LOGIC (AAMDAN & KHARCH)
  // ----------------------------------------------------------------------------

  function financeMonthlySummary() {
    const currentMonthPrefix = new Date().toISOString().slice(0, 7);
    let income = 0;
    let expense = 0;

    state.finances.forEach((row) => {
      if (row.entry_date && row.entry_date.startsWith(currentMonthPrefix)) {
        const amt = Number(row.amount || 0);
        if (row.finance_type === "income") income += amt;
        else expense += amt;
      }
    });

    return {
      income,
      expense,
      savings: income - expense
    };
  }

  function renderFinances() {
    const list = $("financeList");
    if (!list) return;

    const summary = financeMonthlySummary();
    $("financeTotalIncome").textContent = money(summary.income);
    $("financeTotalExpense").textContent = money(summary.expense);
    $("financeNetSavings").textContent = money(summary.savings);

    if (!state.finances.length) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🏠</div>
          <p>Abhi aamdan ya kharch ka record nahi hai. "+ Aamdan ya Kharch Likhein" par click karein.</p>
        </div>`;
      return;
    }

    list.innerHTML = state.finances.map((row) => {
      const isInc = row.finance_type === "income";
      return `
        <div class="item-card">
          <div class="item-left">
            <div class="type-indicator" style="background:${isInc ? "var(--success)" : "var(--danger)"};"></div>
            <div class="item-main">
              <h4>${escapeHtml(row.category)}</h4>
              <span>${isInc ? "Aamdan (Income)" : "Kharch (Expense)"} · ${formatDateTime(row.entry_date)}</span>
              ${row.note ? `<div style="font-size:12px;color:var(--text-muted);margin-top:2px;">"${escapeHtml(row.note)}"</div>` : ""}
            </div>
          </div>
          <div class="item-right">
            <span class="item-amount ${isInc ? "amount-receivable" : "amount-payable"}">
              ${isInc ? "+" : "-"}${money(row.amount)}
            </span>
            <button type="button" class="btn-del" data-del-fin="${row.id}" title="Delete record">🗑️</button>
          </div>
        </div>`;
    }).join("");

    list.querySelectorAll("[data-del-fin]").forEach((btn) => {
      btn.addEventListener("click", () => deleteFinance(btn.dataset.delFin));
    });
  }

  async function handleAddFinance(e) {
    e.preventDefault();
    const type = $("finType").value;
    const cat = $("finCategory").value.trim();
    const amount = Number($("finAmount").value);
    const note = $("finNote").value.trim();

    try {
      await api("household_finance", {
        method: "POST",
        body: JSON.stringify({
          user_id: state.user.id,
          finance_type: type,
          category: cat,
          amount,
          note: note || null
        })
      });
      closeModal("financeModal");
      $("financeForm").reset();
      toast("Record save ho gaya!");
      await loadFinances();
      renderDashboard();
    } catch (err) {
      alert("Save fail: " + err.message);
    }
  }

  async function deleteFinance(id) {
    if (!confirm("Kya aap yeh entry delete karna chahte hain?")) return;
    try {
      await api(`household_finance?id=eq.${id}`, { method: "DELETE" });
      toast("Entry delete ho gayi");
      await loadFinances();
      renderDashboard();
    } catch (err) {
      alert(err.message);
    }
  }

  // ----------------------------------------------------------------------------
  // DASHBOARD VIEW
  // ----------------------------------------------------------------------------

  function renderDashboard() {
    const kSum = khataSummary();
    const fSum = financeMonthlySummary();

    let kametiTotal = 0;
    state.committees.forEach((c) => {
      kametiTotal += Number(c.total_amount || 0);
    });

    $("dashReceivable").textContent = money(kSum.receivable);
    $("dashPayable").textContent = money(kSum.payable);
    $("dashKametiTotal").textContent = money(kametiTotal);
    $("dashMonthBalance").textContent = (fSum.savings >= 0 ? "+" : "") + money(fSum.savings);

    const recent = $("recentActivityList");
    if (!recent) return;

    // Combine recent items
    const combined = [
      ...state.khataEntries.map((k) => ({
        type: "Khata",
        title: `${k.person_name} (${k.entry_type})`,
        amount: k.amount,
        date: k.entry_date,
        isPositive: k.entry_type === "receivable" || k.entry_type === "settlement_paid"
      })),
      ...state.finances.map((f) => ({
        type: f.finance_type === "income" ? "Aamdan" : "Kharch",
        title: f.category,
        amount: f.amount,
        date: f.entry_date,
        isPositive: f.finance_type === "income"
      }))
    ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 6);

    if (!combined.length) {
      recent.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📊</div>
          <p>Koi haliyah activity nahi hai.</p>
        </div>`;
      return;
    }

    recent.innerHTML = combined.map((item) => `
      <div class="item-card">
        <div class="item-left">
          <div class="item-main">
            <h4>${escapeHtml(item.title)}</h4>
            <span>${item.type} · ${formatDateTime(item.date)}</span>
          </div>
        </div>
        <div class="item-right">
          <span class="item-amount ${item.isPositive ? "amount-receivable" : "amount-payable"}">
            ${money(item.amount)}
          </span>
        </div>
      </div>
    `).join("");
  }

  // ----------------------------------------------------------------------------
  // UI & NAVIGATION HELPERS
  // ----------------------------------------------------------------------------

  function switchTab(tabId) {
    state.currentTab = tabId;
    document.querySelectorAll(".nav-tab-btn").forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tab === tabId);
    });
    document.querySelectorAll(".view-section").forEach((sec) => {
      sec.classList.remove("active");
    });
    const target = $("view" + tabId.charAt(0).toUpperCase() + tabId.slice(1));
    if (target) target.classList.add("active");
  }

  function openModal(id) {
    const el = $(id);
    if (el) el.classList.add("active");
  }

  function closeModal(id) {
    const el = $(id);
    if (el) el.classList.remove("active");
  }

  function escapeHtml(text) {
    return String(text || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // ----------------------------------------------------------------------------
  // EVENT LISTENERS
  // ----------------------------------------------------------------------------

  function bindEvents() {
    // Auth Tab toggle
    $("tabLoginBtn").addEventListener("click", () => {
      $("tabLoginBtn").classList.add("active");
      $("tabRegisterBtn").classList.remove("active");
      $("loginForm").style.display = "block";
      $("registerForm").style.display = "none";
    });
    $("tabRegisterBtn").addEventListener("click", () => {
      $("tabRegisterBtn").classList.add("active");
      $("tabLoginBtn").classList.remove("active");
      $("registerForm").style.display = "block";
      $("loginForm").style.display = "none";
    });

    // Password view toggles
    document.querySelectorAll(".btn-toggle-pwd").forEach((btn) => {
      btn.addEventListener("click", () => {
        const inp = $(btn.dataset.target);
        if (!inp) return;
        const isPwd = inp.type === "password";
        inp.type = isPwd ? "text" : "password";
        btn.textContent = isPwd ? "Hide" : "Show";
      });
    });

    // Form Submissions
    $("loginForm").addEventListener("submit", handleLogin);
    $("registerForm").addEventListener("submit", handleRegister);
    $("logoutBtn").addEventListener("click", logout);

    // Nav Tabs
    document.querySelectorAll(".nav-tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => switchTab(btn.dataset.tab));
    });

    // Modals Open
    $("openKhataModalBtn")?.addEventListener("click", () => openModal("khataModal"));
    $("openKametiModalBtn")?.addEventListener("click", () => openModal("kametiModal"));
    $("openFinanceModalBtn")?.addEventListener("click", () => openModal("financeModal"));

    // Modals Close
    document.querySelectorAll("[data-close]").forEach((btn) => {
      btn.addEventListener("click", () => closeModal(btn.dataset.close));
    });
    document.querySelectorAll(".modal-overlay").forEach((modal) => {
      modal.addEventListener("click", (e) => {
        if (e.target === modal) closeModal(modal.id);
      });
    });

    // Data Form Submissions
    $("khataForm").addEventListener("submit", handleAddKhata);
    $("kametiForm").addEventListener("submit", handleAddCommittee);
    $("financeForm").addEventListener("submit", handleAddFinance);

    // Set default date for Kameti
    if ($("kametiStart")) {
      $("kametiStart").value = new Date().toISOString().slice(0, 10);
    }
  }

  // Initialization
  bindEvents();
  checkExistingSession();

})();
