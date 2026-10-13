// ==============================================================================
// Apna Khata Advance - Family Tree & Private Khata Logic
// ==============================================================================

(function () {
  "use strict";

  const config = window.APP_CONFIG || {};
  const SESSION_KEY = "apna_khata_session_token";
  const USER_KEY = "apna_khata_user_info";

  let deferredInstallPrompt = null;

  const state = {
    user: null,
    token: localStorage.getItem(SESSION_KEY) || "",
    currentTab: "dashboard",
    familyMembers: [],
    khataEntries: [],
    committees: [],
    finances: []
  };

  const $ = (id) => document.getElementById(id);

  const money = (val) => "Rs " + Number(val || 0).toLocaleString("en-PK");
  const formatDate = (isoStr) => {
    if (!isoStr) return "";
    return new Intl.DateTimeFormat("en-PK", { dateStyle: "medium", timeZone: "Asia/Karachi" }).format(new Date(isoStr));
  };
  const formatDateTime = (isoStr) => {
    if (!isoStr) return "";
    return new Intl.DateTimeFormat("en-PK", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Karachi" }).format(new Date(isoStr));
  };

  function toast(message) {
    const el = $("toastNotice");
    if (!el) return;
    el.textContent = message;
    el.classList.add("show");
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.remove("show"), 2800);
  }

  // ----------------------------------------------------------------------------
  // INSTALL APP BANNER LOGIC (PWA Install Button)
  // ----------------------------------------------------------------------------
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    const banner = $("installBanner");
    // Show banner if app is not already installed in standalone mode
    if (banner && !window.matchMedia("(display-mode: standalone)").matches) {
      banner.style.display = "flex";
    }
  });

  window.addEventListener("appinstalled", () => {
    deferredInstallPrompt = null;
    const banner = $("installBanner");
    if (banner) banner.style.display = "none";
    toast("App install ho gayi hai!");
  });

  // Check standalone mode on load
  if (window.matchMedia("(display-mode: standalone)").matches) {
    const banner = $("installBanner");
    if (banner) banner.style.display = "none";
  }

  // ----------------------------------------------------------------------------
  // SUPABASE REST API
  // ----------------------------------------------------------------------------
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
    const role = $("regRole").value;
    const phone = $("regPhone").value.trim();
    const password = $("regPassword").value;
    const familyName = $("regFamilyName").value.trim();
    const joinCode = $("regJoinCode").value.trim();
    const btn = $("regSubmitBtn");

    try {
      btn.disabled = true;
      btn.textContent = "Profile ban rahi hai...";
      const res = await api("rpc/app_register", {
        method: "POST",
        body: JSON.stringify({
          input_phone: phone,
          input_name: name,
          input_password: password,
          input_family_name: familyName || null,
          input_join_code: joinCode || null,
          input_role: role
        })
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
      $("userRoleBadge").textContent = state.user.role || "Member";
      $("userAvatarChar").textContent = state.user.name.charAt(0).toUpperCase();
      $("headerFamilyName").textContent = "👨‍👩‍👧‍👦 " + (state.user.family_name || "Family Group");
      $("headerInviteCode").textContent = state.user.invite_code || "------";
      $("shareInviteCode").textContent = state.user.invite_code || "------";
    }
  }

  // ----------------------------------------------------------------------------
  // DATA LOADING
  // ----------------------------------------------------------------------------
  async function loadAllData() {
    try {
      await Promise.all([
        loadFamilyMembers(),
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

  async function loadFamilyMembers() {
    state.familyMembers = await api("rpc/get_family_members", { method: "POST", body: "{}" }) || [];
    renderFamilyMembers();
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
  // FAMILY TREE RENDERING
  // ----------------------------------------------------------------------------
  function renderFamilyMembers() {
    const list = $("familyMemberList");
    if (!list) return;

    $("dashFamilyCount").textContent = state.familyMembers.length || "1";

    if (!state.familyMembers.length) {
      list.innerHTML = `<p class="empty-state">Koi family member shamil nahi hai.</p>`;
      return;
    }

    list.innerHTML = state.familyMembers.map((m) => {
      const isMe = m.id === state.user.id;
      return `
        <div class="family-card">
          <div class="family-member-avatar">${m.name.charAt(0).toUpperCase()}</div>
          <div style="flex: 1;">
            <h4 style="font-size: 15px; font-weight: 700;">
              ${escapeHtml(m.name)} ${isMe ? `<span style="font-size: 11px; color: var(--primary);">(Aap)</span>` : ""}
            </h4>
            <div style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">
              Role: <strong style="color: #fff;">${escapeHtml(m.role || "Member")}</strong>
            </div>
            <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">
              Phone: ${m.phone}
            </div>
          </div>
        </div>`;
    }).join("");
  }

  // ----------------------------------------------------------------------------
  // KHATA RENDERING (PRIVATE VS SHARED)
  // ----------------------------------------------------------------------------
  function renderKhata() {
    const privList = $("privateKhataList");
    const sharedList = $("sharedKhataList");

    const privEntries = state.khataEntries.filter((r) => r.is_private);
    const sharedEntries = state.khataEntries.filter((r) => !r.is_private);

    // Private totals (User only)
    let privRec = 0, privPay = 0;
    privEntries.forEach((r) => {
      const amt = Number(r.amount || 0);
      if (r.entry_type === "receivable") privRec += amt;
      else if (r.entry_type === "payable") privPay += amt;
      else if (r.entry_type === "settlement_received") privRec -= amt;
      else if (r.entry_type === "settlement_paid") privPay -= amt;
    });

    $("dashReceivable").textContent = money(Math.max(0, privRec));
    $("dashPayable").textContent = money(Math.max(0, privPay));

    // Render Private Khata
    if (privList) {
      if (!privEntries.length) {
        privList.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">🔒</div>
            <p>Abhi koi Zaati Private entry nahi hai. "+ Zaati Entry Likhein" par click karein.</p>
          </div>`;
      } else {
        privList.innerHTML = privEntries.map((row) => renderKhataCard(row, true)).join("");
      }
    }

    // Render Shared Family Khata
    if (sharedList) {
      if (!sharedEntries.length) {
        sharedList.innerHTML = `
          <div class="empty-state">
            <div class="empty-state-icon">👨‍👩‍👧</div>
            <p>Abhi koi Family Shared entry nahi hai. "+ Family Khata Entry" par click karein.</p>
          </div>`;
      } else {
        sharedList.innerHTML = sharedEntries.map((row) => renderKhataCard(row, false)).join("");
      }
    }

    document.querySelectorAll("[data-del-khata]").forEach((btn) => {
      btn.addEventListener("click", () => deleteKhata(btn.dataset.delKhata));
    });
  }

  function renderKhataCard(row, isPrivate) {
    const typeLabels = {
      receivable: { text: "Maine diye (Lene hain)", cls: "amount-receivable" },
      payable: { text: "Is ne diye (Dene hain)", cls: "amount-payable" },
      settlement_received: { text: "Wapas mile (Khata Wapsi)", cls: "amount-neutral" },
      settlement_paid: { text: "Wapas diye (Adaigi)", cls: "amount-neutral" }
    };
    const info = typeLabels[row.entry_type] || { text: "Khata", cls: "amount-neutral" };
    const canDelete = row.user_id === state.user.id;

    return `
      <div class="item-card">
        <div class="item-left">
          <div class="item-main">
            <h4>
              ${escapeHtml(row.person_name)}
              <span class="${isPrivate ? "tag-private" : "tag-family"}">${isPrivate ? "🔒 Zaati Private" : "👨‍👩‍👧 Family Shared"}</span>
            </h4>
            <span>${info.text} · ${formatDateTime(row.entry_date)}</span>
            ${row.note ? `<div style="font-size:12px;color:var(--text-muted);margin-top:2px;">"${escapeHtml(row.note)}"</div>` : ""}
          </div>
        </div>
        <div class="item-right">
          <span class="item-amount ${info.cls}">${money(row.amount)}</span>
          ${canDelete ? `<button type="button" class="btn-del" data-del-khata="${row.id}" title="Delete">🗑️</button>` : ""}
        </div>
      </div>`;
  }

  async function handleAddKhata(e) {
    e.preventDefault();
    const isPrivate = $("khataIsPrivate").value === "true";
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
          family_id: state.user.family_id,
          is_private: isPrivate,
          person_name: person,
          person_phone: phone || null,
          entry_type: type,
          amount,
          note: note || null
        })
      });
      closeModal("khataModal");
      $("khataForm").reset();
      toast(isPrivate ? "Zaati khata save ho gaya!" : "Family khata save ho gaya!");
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
  // KAMETI / COMMITTEE
  // ----------------------------------------------------------------------------
  function renderCommittees() {
    const list = $("kametiList");
    if (!list) return;

    let totalPool = 0;
    state.committees.forEach((c) => totalPool += Number(c.total_amount || 0));
    $("dashKametiTotal").textContent = money(totalPool);

    if (!state.committees.length) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">👥</div>
          <p>Abhi koi committee/kameti record nahi hai. "+ Nayi Kameti Shuru Karein" par click karein.</p>
        </div>`;
      return;
    }

    list.innerHTML = state.committees.map((com) => {
      const canDelete = com.user_id === state.user.id;
      return `
        <div class="item-card">
          <div class="item-left">
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
              <span class="item-amount" style="color:var(--primary);">${money(com.total_amount)}</span>
            </div>
            ${canDelete ? `<button type="button" class="btn-del" data-del-kameti="${com.id}" title="Delete">🗑️</button>` : ""}
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
          family_id: state.user.family_id,
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
    if (!confirm("Kya aap yeh committee delete karna chahte hain?")) return;
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
  // HOUSEHOLD FINANCE
  // ----------------------------------------------------------------------------
  function renderFinances() {
    const list = $("financeList");
    if (!list) return;

    let inc = 0, exp = 0;
    state.finances.forEach((r) => {
      const amt = Number(r.amount || 0);
      if (r.finance_type === "income") inc += amt;
      else exp += amt;
    });

    $("financeTotalIncome").textContent = money(inc);
    $("financeTotalExpense").textContent = money(exp);
    $("financeNetSavings").textContent = money(inc - exp);

    if (!state.finances.length) {
      list.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">🏠</div>
          <p>Abhi aamdan ya kharch ka record nahi hai. "+ Aamdan / Kharch Likhein" par click karein.</p>
        </div>`;
      return;
    }

    list.innerHTML = state.finances.map((row) => {
      const isInc = row.finance_type === "income";
      const canDelete = row.user_id === state.user.id;
      return `
        <div class="item-card">
          <div class="item-left">
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
            ${canDelete ? `<button type="button" class="btn-del" data-del-fin="${row.id}" title="Delete">🗑️</button>` : ""}
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
          family_id: state.user.family_id,
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
  // DASHBOARD
  // ----------------------------------------------------------------------------
  function renderDashboard() {
    const recent = $("recentActivityList");
    if (!recent) return;

    const combined = [
      ...state.khataEntries.map((k) => ({
        type: k.is_private ? "🔒 Zaati Khata" : "👨‍👩‍👧 Family Khata",
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
      recent.innerHTML = `<div class="empty-state"><p>Koi haliyah activity nahi hai.</p></div>`;
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
  // UI & NAVIGATION
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
  // EVENT BINDINGS
  // ----------------------------------------------------------------------------
  function bindEvents() {
    // Install Banner Actions
    $("btnInstallApp")?.addEventListener("click", async () => {
      if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        const choice = await deferredInstallPrompt.userChoice;
        if (choice.outcome === "accepted") {
          $("installBanner").style.display = "none";
        }
        deferredInstallPrompt = null;
      } else {
        alert("Mobile ya laptop browser ke 3 dots menu se 'Install App' ya 'Add to Home Screen' select karein.");
      }
    });

    $("btnCloseInstallBanner")?.addEventListener("click", () => {
      $("installBanner").style.display = "none";
    });

    // Auth Tabs
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

    // Forms
    $("loginForm").addEventListener("submit", handleLogin);
    $("registerForm").addEventListener("submit", handleRegister);
    $("logoutBtn").addEventListener("click", logout);

    // Nav Tabs
    document.querySelectorAll(".nav-tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => switchTab(btn.dataset.tab));
    });

    // Khata Modals (Private vs Shared distinction)
    $("openPrivateKhataBtn")?.addEventListener("click", () => {
      $("khataIsPrivate").value = "true";
      $("khataModalTitle").textContent = "🔒 Nayi Zaati Private Entry (Sirf Aap Dekh Sakte Hain)";
      openModal("khataModal");
    });

    $("openSharedKhataBtn")?.addEventListener("click", () => {
      $("khataIsPrivate").value = "false";
      $("khataModalTitle").textContent = "👨‍👩‍👧 Nayi Family Shared Entry (Family Tree Me Sab Dekh Sakte Hain)";
      openModal("khataModal");
    });

    $("openKametiModalBtn")?.addEventListener("click", () => openModal("kametiModal"));
    $("openFinanceModalBtn")?.addEventListener("click", () => openModal("financeModal"));

    document.querySelectorAll("[data-close]").forEach((btn) => {
      btn.addEventListener("click", () => closeModal(btn.dataset.close));
    });
    document.querySelectorAll(".modal-overlay").forEach((modal) => {
      modal.addEventListener("click", (e) => {
        if (e.target === modal) closeModal(modal.id);
      });
    });

    $("khataForm").addEventListener("submit", handleAddKhata);
    $("kametiForm").addEventListener("submit", handleAddCommittee);
    $("financeForm").addEventListener("submit", handleAddFinance);

    if ($("kametiStart")) {
      $("kametiStart").value = new Date().toISOString().slice(0, 10);
    }
  }

  bindEvents();
  checkExistingSession();

})();
