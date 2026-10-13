// ==============================================================================
// Apna Khata Advance - Luxury Financial Management Logic
// ==============================================================================

(function () {
  "use strict";

  const config = window.APP_CONFIG || {};
  const SESSION_KEY = "apna_khata_session_token";
  const USER_KEY = "apna_khata_user_info";
  const THEME_KEY = "apna_khata_theme_choice";

  let deferredInstallPrompt = null;

  // Selected Month for filtering (Default: Current Month YYYY-MM)
  const now = new Date();
  let selectedYear = now.getFullYear();
  let selectedMonth = now.getMonth(); // 0-indexed
  let isAllTime = false;

  const state = {
    user: null,
    token: localStorage.getItem(SESSION_KEY) || "",
    currentTab: "dashboard",
    familyMembers: [],
    khataEntries: [],
    committees: [],
    finances: [],
    rollovers: []
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
  // THEME TOGGLE (DARK vs LIGHT)
  // ----------------------------------------------------------------------------
  function initTheme() {
    const savedTheme = localStorage.getItem(THEME_KEY) || "dark";
    applyTheme(savedTheme);
  }

  function applyTheme(theme) {
    if (theme === "light") {
      document.body.classList.add("light-theme");
      $("themeIcon").textContent = "🌙";
      $("themeLabel").textContent = "Dark";
    } else {
      document.body.classList.remove("light-theme");
      $("themeIcon").textContent = "☀️";
      $("themeLabel").textContent = "Light";
    }
    localStorage.setItem(THEME_KEY, theme);
  }

  function toggleTheme() {
    const isLight = document.body.classList.contains("light-theme");
    applyTheme(isLight ? "dark" : "light");
  }

  // ----------------------------------------------------------------------------
  // PWA INSTALL PROMPT
  // ----------------------------------------------------------------------------
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    const banner = $("installBanner");
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

  if (window.matchMedia("(display-mode: standalone)").matches) {
    const banner = $("installBanner");
    if (banner) banner.style.display = "none";
  }

  // ----------------------------------------------------------------------------
  // MONTH NAVIGATION LOGIC
  // ----------------------------------------------------------------------------
  function updateMonthDisplay() {
    if (isAllTime) {
      $("currentMonthDisplay").textContent = "All Time (Mukammal)";
      return;
    }
    const d = new Date(selectedYear, selectedMonth, 1);
    $("currentMonthDisplay").textContent = new Intl.DateTimeFormat("en-PK", {
      month: "long",
      year: "numeric"
    }).format(d);
  }

  function getMonthPrefix() {
    if (isAllTime) return "";
    const m = String(selectedMonth + 1).padStart(2, "0");
    return `${selectedYear}-${m}`;
  }

  function changeMonth(delta) {
    isAllTime = false;
    selectedMonth += delta;
    if (selectedMonth > 11) {
      selectedMonth = 0;
      selectedYear++;
    } else if (selectedMonth < 0) {
      selectedMonth = 11;
      selectedYear--;
    }
    updateMonthDisplay();
    renderAllViews();
  }

  // ----------------------------------------------------------------------------
  // REST API
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
  // AUTH & SESSIONS
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

  async function handleDeleteProfile() {
    if (!confirm("Khabardaar! Kya aap waqai apni profile mukammal tor par DELETE karna chahte hain? Yeh amal wapas nahi ho sakta.")) return;
    try {
      const res = await api("rpc/app_delete_profile", { method: "POST", body: "{}" });
      if (res && res.success) {
        alert("Aap ki profile delete ho gayi hai.");
        logout();
      } else {
        alert(res?.error || "Delete fail");
      }
    } catch (err) {
      alert(err.message);
    }
  }

  async function handleSwitchFamily(e) {
    e.preventDefault();
    const code = $("switchFamilyCode").value.trim();
    try {
      const res = await api("rpc/app_join_family", {
        method: "POST",
        body: JSON.stringify({ input_code: code })
      });
      if (res && res.success) {
        toast("Family change ho gayi: " + res.family_name);
        closeModal("switchFamilyModal");
        state.user.family_name = res.family_name;
        state.user.invite_code = res.invite_code;
        showApp();
        loadAllData();
      } else {
        alert(res?.error || "Join fail");
      }
    } catch (err) {
      alert(err.message);
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
      $("userAvatarChar").textContent = state.user.name.charAt(0).toUpperCase();
      $("headerFamilyName").textContent = "👨‍👩‍👧‍👦 " + (state.user.family_name || "Family");
      $("headerInviteCode").textContent = state.user.invite_code || "------";

      // Settings screen details
      $("settingsUserName").textContent = state.user.name;
      $("settingsUserPhone").textContent = state.user.phone;
      $("settingsUserRole").textContent = state.user.role || "Member";
      $("settingsFamilyName").textContent = state.user.family_name || "Family";
    }
    updateMonthDisplay();
  }

  // ----------------------------------------------------------------------------
  // DATA LOAD & RENDERING
  // ----------------------------------------------------------------------------
  async function loadAllData() {
    try {
      await Promise.all([
        loadFamilyMembers(),
        loadKhata(),
        loadCommittees(),
        loadFinances(),
        loadRollovers()
      ]);
      renderAllViews();
      checkRolloverPrompt();
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
  }

  async function loadCommittees() {
    state.committees = await api("committees?select=*&order=created_at.desc") || [];
  }

  async function loadFinances() {
    state.finances = await api("household_finance?select=*&order=entry_date.desc") || [];
  }

  async function loadRollovers() {
    state.rollovers = await api("month_rollovers?select=*") || [];
  }

  function renderAllViews() {
    renderDashboard();
    renderKhata();
    renderCommittees();
    renderFinances();
  }

  // ----------------------------------------------------------------------------
  // MONTH FILTERING HELPER
  // ----------------------------------------------------------------------------
  function filterByMonth(rows, dateField = "entry_date") {
    const prefix = getMonthPrefix();
    if (!prefix) return rows;
    return rows.filter((r) => r[dateField] && r[dateField].startsWith(prefix));
  }

  // ----------------------------------------------------------------------------
  // MONTHLY ROLLOVER PROMPT CHECK
  // ----------------------------------------------------------------------------
  function checkRolloverPrompt() {
    const curPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    
    // Check if current month already has a rollover
    const hasCurrentRollover = state.rollovers.some((r) => r.month_str === curPrefix);
    if (hasCurrentRollover) {
      $("rolloverBanner").style.display = "none";
      return;
    }

    // Calculate previous month savings
    let pYear = now.getFullYear();
    let pMonth = now.getMonth() - 1;
    if (pMonth < 0) { pMonth = 11; pYear--; }
    const prevPrefix = `${pYear}-${String(pMonth + 1).padStart(2, "0")}`;

    let pInc = 0, pExp = 0;
    state.finances.forEach((r) => {
      if (r.entry_date && r.entry_date.startsWith(prevPrefix)) {
        if (r.finance_type === "income") pInc += Number(r.amount || 0);
        else pExp += Number(r.amount || 0);
      }
    });

    const prevSavings = pInc - pExp;
    if (prevSavings > 0) {
      $("rolloverPrevSavings").textContent = money(prevSavings);
      $("rolloverBanner").style.display = "flex";
      $("btnAcceptRollover").onclick = () => acceptRollover(curPrefix, prevSavings);
    } else {
      $("rolloverBanner").style.display = "none";
    }
  }

  async function acceptRollover(monthStr, amount) {
    try {
      // 1. Insert rollover record
      await api("month_rollovers", {
        method: "POST",
        body: JSON.stringify({
          user_id: state.user.id,
          family_id: state.user.family_id,
          month_str: monthStr,
          carried_forward_savings: amount,
          note: "Pichle maheenay ki bachat forward ki gayi"
        })
      });

      // 2. Add as income entry in household finance for this month
      await api("household_finance", {
        method: "POST",
        body: JSON.stringify({
          user_id: state.user.id,
          family_id: state.user.family_id,
          finance_type: "income",
          category: "Pichle Maah Ki Bachat (Rollover)",
          amount: amount,
          note: "Carried forward from previous month"
        })
      });

      $("rolloverBanner").style.display = "none";
      toast("Pichli bachat naye maah me shamil kar di gayi!");
      await loadFinances();
      await loadRollovers();
      renderAllViews();
    } catch (err) {
      alert("Rollover fail: " + err.message);
    }
  }

  // ----------------------------------------------------------------------------
  // DASHBOARD & ANIMATED CHART
  // ----------------------------------------------------------------------------
  function renderDashboard() {
    const curFinances = filterByMonth(state.finances);
    let inc = 0, exp = 0;

    curFinances.forEach((r) => {
      const amt = Number(r.amount || 0);
      if (r.finance_type === "income") inc += amt;
      else exp += amt;
    });

    const savings = inc - exp;
    $("dashMonthIncome").textContent = money(inc);
    $("dashMonthExpense").textContent = money(exp);
    $("dashMonthSavings").textContent = (savings >= 0 ? "+" : "") + money(savings);

    // Chart Values
    $("chartIncomeVal").textContent = money(inc);
    $("chartExpenseVal").textContent = money(exp);
    $("chartSavingsVal").textContent = money(Math.max(0, savings));

    // Animated Bar Calculations
    const maxVal = Math.max(inc, exp, 1);
    const incWidth = Math.min(100, Math.round((inc / maxVal) * 100));
    const expWidth = Math.min(100, Math.round((exp / maxVal) * 100));
    const savWidth = Math.min(100, Math.round((Math.max(0, savings) / maxVal) * 100));

    // Smooth Bar width animation
    setTimeout(() => {
      $("barIncome").style.width = incWidth + "%";
      $("barExpense").style.width = expWidth + "%";
      $("barSavings").style.width = savWidth + "%";
    }, 50);

    // Private Khata Totals
    let privRec = 0;
    filterByMonth(state.khataEntries).filter((r) => r.is_private).forEach((r) => {
      if (r.entry_type === "receivable") privRec += Number(r.amount || 0);
      else if (r.entry_type === "settlement_received") privRec -= Number(r.amount || 0);
    });
    $("dashReceivable").textContent = money(Math.max(0, privRec));

    // Recent Activity
    const recent = $("recentActivityList");
    if (!recent) return;

    const filteredK = filterByMonth(state.khataEntries);
    const combined = [
      ...filteredK.map((k) => ({
        type: k.is_private ? "🔒 Zaati Khata" : "👨‍👩‍👧 Family Khata",
        title: `${k.person_name} (${k.entry_type})`,
        amount: k.amount,
        date: k.entry_date,
        isPositive: k.entry_type === "receivable" || k.entry_type === "settlement_paid"
      })),
      ...curFinances.map((f) => ({
        type: f.finance_type === "income" ? "Aamdan" : "Kharch",
        title: f.category,
        amount: f.amount,
        date: f.entry_date,
        isPositive: f.finance_type === "income"
      }))
    ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 6);

    if (!combined.length) {
      recent.innerHTML = `<div class="empty-state"><p>Is period me koi activity nahi hai.</p></div>`;
      return;
    }

    recent.innerHTML = combined.map((item) => `
      <div class="item-card">
        <div style="display:flex; align-items:center; gap:12px;">
          <div>
            <h4 style="font-size:15px; font-weight:800;">${escapeHtml(item.title)}</h4>
            <span style="font-size:12px; color:var(--text-muted);">${item.type} · ${formatDateTime(item.date)}</span>
          </div>
        </div>
        <span class="item-amount ${item.isPositive ? "amount-receivable" : "amount-payable"}">
          ${item.isPositive ? "+" : "-"}${money(item.amount)}
        </span>
      </div>
    `).join("");
  }

  // ----------------------------------------------------------------------------
  // FAMILY TREE & MEMBER DIRECTORY
  // ----------------------------------------------------------------------------
  function renderFamilyMembers() {
    const list = $("familyMemberList");
    if (!list) return;

    if (!state.familyMembers.length) {
      list.innerHTML = `<div class="empty-state" style="grid-column: 1 / -1;"><p>Abhi koi doosra member shamil nahi hai. Apne ghar walon ko Family Code share karein.</p></div>`;
      return;
    }

    list.innerHTML = state.familyMembers.map((m) => {
      const isMe = m.id === state.user.id;
      const joinedStr = m.joined_at ? formatDate(m.joined_at) : "";
      return `
        <div class="stat-card" style="padding:16px; border-left: 4px solid var(--primary);">
          <div class="user-avatar" style="width:48px; height:48px; font-size:20px; flex-shrink: 0;">
            ${m.name.charAt(0).toUpperCase()}
          </div>
          <div style="flex: 1; min-width: 0;">
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px;">
              <h4 style="font-size:15px; font-weight:800; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                ${escapeHtml(m.name)}
              </h4>
              ${isMe ? `<span style="font-size:10px; background:var(--primary-glow); color:var(--primary); padding:2px 8px; border-radius:10px; font-weight:800;">Aap</span>` : ""}
            </div>
            <div style="font-size:12px; color:var(--text-muted); margin-top:2px;">
              Rishta: <strong style="color:var(--text-main);">${escapeHtml(m.role || "Member")}</strong>
            </div>
            <div style="display: flex; justify-content: space-between; font-size:11px; color:var(--text-muted); margin-top:4px;">
              <span>📱 ${m.phone}</span>
              ${joinedStr ? `<span>Shamil: ${joinedStr}</span>` : ""}
            </div>
          </div>
        </div>`;
    }).join("");
  }

  // ----------------------------------------------------------------------------
  // KHATA VIEWS
  // ----------------------------------------------------------------------------
  function renderKhata() {
    const privList = $("privateKhataList");
    const sharedList = $("sharedKhataList");

    const filtered = filterByMonth(state.khataEntries);
    const privEntries = filtered.filter((r) => r.is_private);
    const sharedEntries = filtered.filter((r) => !r.is_private);

    // Render Person Summaries (Maqsood Other Khata Style)
    renderPersonSummary("privatePersonSummaryList", privEntries);
    renderPersonSummary("sharedPersonSummaryList", sharedEntries);

    if (privList) {
      if (!privEntries.length) {
        privList.innerHTML = `<div class="empty-state"><p>Is period me koi Zaati Private entry nahi hai.</p></div>`;
      } else {
        privList.innerHTML = privEntries.map((row) => renderKhataCard(row, true)).join("");
      }
    }

    if (sharedList) {
      if (!sharedEntries.length) {
        sharedList.innerHTML = `<div class="empty-state"><p>Is period me koi Family Shared entry nahi hai.</p></div>`;
      } else {
        sharedList.innerHTML = sharedEntries.map((row) => renderKhataCard(row, false)).join("");
      }
    }

    document.querySelectorAll("[data-del-khata]").forEach((btn) => {
      btn.addEventListener("click", () => deleteKhata(btn.dataset.delKhata));
    });
  }

  function renderPersonSummary(containerId, entries) {
    const container = $(containerId);
    if (!container) return;

    if (!entries.length) {
      container.innerHTML = `<p style="font-size:12px; color:var(--text-muted); grid-column:1/-1;">Koi record mojood nahi.</p>`;
      return;
    }

    // Group by person_name
    const map = {};
    entries.forEach((r) => {
      const name = r.person_name.trim();
      if (!map[name]) map[name] = { name, receivable: 0, payable: 0, count: 0 };
      const amt = Number(r.amount || 0);
      map[name].count++;
      if (r.entry_type === "receivable") map[name].receivable += amt;
      else if (r.entry_type === "payable") map[name].payable += amt;
      else if (r.entry_type === "settlement_received") map[name].receivable -= amt;
      else if (r.entry_type === "settlement_paid") map[name].payable -= amt;
    });

    const persons = Object.values(map);
    container.innerHTML = persons.map((p) => {
      const net = p.receivable - p.payable;
      let statusHtml = "";
      if (net > 0) {
        statusHtml = `<span style="color:var(--success); font-weight:800;">Lene hain: ${money(net)}</span>`;
      } else if (net < 0) {
        statusHtml = `<span style="color:var(--danger); font-weight:800;">Dene hain: ${money(Math.abs(net))}</span>`;
      } else {
        statusHtml = `<span style="color:var(--text-muted); font-weight:700;">Hisaab Barabar (Rs 0)</span>`;
      }

      return `
        <div style="background:var(--bg-card-subtle); border:1px solid var(--border); border-radius:var(--radius-sm); padding:12px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
            <strong style="font-size:14px; color:var(--text-main);">${escapeHtml(p.name)}</strong>
            <span style="font-size:11px; color:var(--text-muted);">${p.count} entries</span>
          </div>
          <div style="font-size:12px; margin-top:2px;">
            ${statusHtml}
          </div>
        </div>`;
    }).join("");
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
        <div>
          <h4>
            ${escapeHtml(row.person_name)}
            <span class="${isPrivate ? "tag-private" : "tag-family"}">${isPrivate ? "🔒 Zaati" : "👨‍👩‍👧 Family"}</span>
          </h4>
          <span style="font-size:12px; color:var(--text-muted);">${info.text} · ${formatDateTime(row.entry_date)}</span>
          ${row.user_name ? `<span style="font-size:11px; color:var(--primary); margin-left:6px;">(By ${escapeHtml(row.user_name)})</span>` : ""}
          ${row.note ? `<div style="font-size:12px; color:var(--text-muted); margin-top:2px;">"${escapeHtml(row.note)}"</div>` : ""}
        </div>
        <div style="display:flex; align-items:center; gap:14px;">
          <span class="item-amount ${info.cls}">${money(row.amount)}</span>
          ${canDelete ? `<button type="button" style="background:transparent; border:none; font-size:16px; cursor:pointer;" data-del-khata="${row.id}" title="Delete">🗑️</button>` : ""}
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
    const syncBudget = $("syncWithBudget")?.checked;

    try {
      await api("khata_entries", {
        method: "POST",
        body: JSON.stringify({
          user_id: state.user.id,
          user_name: state.user.name,
          user_role: state.user.role || "Member",
          family_id: state.user.family_id,
          is_private: isPrivate,
          person_name: person,
          person_phone: phone || null,
          entry_type: type,
          amount,
          note: note || null
        })
      });

      // AUTO ADJUST WITH HOUSEHOLD INCOME / EXPENSE IF USER CONFIRMED
      if (!isPrivate && syncBudget) {
        const isIncome = type === "payable" || type === "settlement_received"; // Pese mile hain
        await api("household_finance", {
          method: "POST",
          body: JSON.stringify({
            user_id: state.user.id,
            user_name: state.user.name,
            user_role: state.user.role || "Member",
            family_id: state.user.family_id,
            finance_type: isIncome ? "income" : "expense",
            category: `Khata Adjustment (${person})`,
            amount: amount,
            note: `Auto-sync: ${type === "payable" ? "Pese liye" : "Pese diye"}`
          })
        });
        await loadFinances();
      }

      closeModal("khataModal");
      $("khataForm").reset();
      $("budgetImpactBox").style.display = "none";
      toast(isPrivate ? "Zaati khata save ho gaya!" : "Family khata save ho gaya!");
      await loadKhata();
      renderAllViews();
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
      renderAllViews();
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

    if (!state.committees.length) {
      list.innerHTML = `<div class="empty-state"><p>Abhi koi committee record nahi hai.</p></div>`;
      return;
    }

    list.innerHTML = state.committees.map((com) => {
      const canDelete = com.user_id === state.user.id;
      return `
        <div class="item-card">
          <div>
            <h4 style="font-size:16px; font-weight:800;">${escapeHtml(com.name)}</h4>
            <span style="font-size:12px; color:var(--text-muted);">Shuru: ${formatDate(com.start_date)} · Duration: ${com.total_months} Mahinay</span>
            <div style="font-size:12px; color:var(--text-muted); margin-top:3px;">
              Maahana Qist: <strong style="color:var(--text-main);">${money(com.monthly_amount)}</strong> | Meri Baari: ${com.my_turn_month ? `Mahina ${com.my_turn_month}` : "Mukarrar nahi"}
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:14px;">
            <span class="item-amount" style="color:var(--accent);">${money(com.total_amount)}</span>
            ${canDelete ? `<button type="button" style="background:transparent; border:none; font-size:16px; cursor:pointer;" data-del-kameti="${com.id}" title="Delete">🗑️</button>` : ""}
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
          user_name: state.user.name,
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
      renderAllViews();
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
      renderAllViews();
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

    const filtered = filterByMonth(state.finances);
    if (!filtered.length) {
      list.innerHTML = `<div class="empty-state"><p>Is period me koi aamdan ya kharch nahi hai.</p></div>`;
      return;
    }

    list.innerHTML = filtered.map((row) => {
      const isInc = row.finance_type === "income";
      const canDelete = row.user_id === state.user.id;
      return `
        <div class="item-card">
          <div>
            <h4 style="font-size:16px; font-weight:800;">${escapeHtml(row.category)}</h4>
            <span style="font-size:12px; color:var(--text-muted);">${isInc ? "Aamdan (Income)" : "Kharch (Expense)"} · ${formatDateTime(row.entry_date)}</span>
            ${row.note ? `<div style="font-size:12px; color:var(--text-muted); margin-top:2px;">"${escapeHtml(row.note)}"</div>` : ""}
          </div>
          <div style="display:flex; align-items:center; gap:14px;">
            <span class="item-amount ${isInc ? "amount-receivable" : "amount-payable"}">
              ${isInc ? "+" : "-"}${money(row.amount)}
            </span>
            ${canDelete ? `<button type="button" style="background:transparent; border:none; font-size:16px; cursor:pointer;" data-del-fin="${row.id}" title="Delete">🗑️</button>` : ""}
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
          user_name: state.user.name,
          user_role: state.user.role || "Member",
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
      renderAllViews();
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
      renderAllViews();
    } catch (err) {
      alert(err.message);
    }
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
    // Theme Switcher
    $("themeToggleBtn")?.addEventListener("click", toggleTheme);

    // Month Navigation
    $("prevMonthBtn")?.addEventListener("click", () => changeMonth(-1));
    $("nextMonthBtn")?.addEventListener("click", () => changeMonth(1));
    $("allTimeBtn")?.addEventListener("click", () => {
      isAllTime = !isAllTime;
      $("allTimeBtn").style.background = isAllTime ? "var(--primary)" : "transparent";
      $("allTimeBtn").style.color = isAllTime ? "#fff" : "var(--text-main)";
      updateMonthDisplay();
      renderAllViews();
    });

    // Install Banner
    $("btnInstallApp")?.addEventListener("click", async () => {
      if (deferredInstallPrompt) {
        deferredInstallPrompt.prompt();
        const choice = await deferredInstallPrompt.userChoice;
        if (choice.outcome === "accepted") {
          $("installBanner").style.display = "none";
        }
        deferredInstallPrompt = null;
      } else {
        alert("Mobile ya Laptop browser menu se 'Install App' ya 'Add to Home Screen' select karein.");
      }
    });
    $("btnCloseInstallBanner")?.addEventListener("click", () => {
      $("installBanner").style.display = "none";
    });

    // Copy invite code on click
    $("headerInviteCode")?.addEventListener("click", () => {
      const code = $("headerInviteCode").textContent;
      if (code && code !== "------") {
        navigator.clipboard.writeText(code).then(() => toast("Family Code copy ho gaya: " + code)).catch(() => {});
      }
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

    // Toggle Password
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
    $("btnDeleteProfile")?.addEventListener("click", handleDeleteProfile);
    $("switchFamilyForm")?.addEventListener("submit", handleSwitchFamily);

    // Nav Tabs
    document.querySelectorAll(".nav-tab-btn").forEach((btn) => {
      btn.addEventListener("click", () => switchTab(btn.dataset.tab));
    });
    $("userAvatarChar")?.addEventListener("click", () => switchTab("settings"));

    // Khata Modals
    $("openPrivateKhataBtn")?.addEventListener("click", () => {
      $("khataIsPrivate").value = "true";
      $("khataModalTitle").textContent = "🔒 Nayi Zaati Private Entry";
      openModal("khataModal");
    });
    $("openSharedKhataBtn")?.addEventListener("click", () => {
      $("khataIsPrivate").value = "false";
      $("khataModalTitle").textContent = "👨‍👩‍👧 Nayi Family Shared Entry";
      openModal("khataModal");
    });

    $("openKametiModalBtn")?.addEventListener("click", () => openModal("kametiModal"));
    $("openFinanceModalBtn")?.addEventListener("click", () => openModal("financeModal"));
    $("btnSwitchFamilyModal")?.addEventListener("click", () => openModal("switchFamilyModal"));

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

    // Offline Mobile Backup Downloads
    $("btnDownloadBackupPdf")?.addEventListener("click", downloadBackupPdf);
    $("btnDownloadBackupExcel")?.addEventListener("click", downloadBackupExcel);
    $("btnDownloadBackupJson")?.addEventListener("click", downloadBackupJson);

    // Dynamic prompt on Khata type change
    $("khataType")?.addEventListener("change", updateKhataBudgetPrompt);

    if ($("kametiStart")) {
      $("kametiStart").value = new Date().toISOString().slice(0, 10);
    }
  }

  function updateKhataBudgetPrompt() {
    const isPrivate = $("khataIsPrivate").value === "true";
    const box = $("budgetImpactBox");
    if (!box) return;

    if (isPrivate) {
      box.style.display = "none";
      return;
    }

    const type = $("khataType").value;
    box.style.display = "block";
    const txt = $("syncBudgetText");
    const desc = $("syncBudgetDesc");

    if (type === "receivable") {
      txt.textContent = "Ghar ke Kharch (Expenses) mein add karein?";
      desc.textContent = "Kyunke aap ne ghar ke peson se kisi ko diye hain.";
    } else if (type === "payable") {
      txt.textContent = "Ghar ki Aamdan (Income) mein add karein?";
      desc.textContent = "Kyunke kisi ne ghar ke liye pese diye hain.";
    } else if (type === "settlement_received") {
      txt.textContent = "Ghar ki Aamdan (Khata Wapsi) mein add karein?";
      desc.textContent = "Pese wapas mile hain to balance mein jama honge.";
    } else {
      txt.textContent = "Ghar ke Kharch (Khata Adaigi) mein add karein?";
      desc.textContent = "Wapas ada kiye hain to balance se minus honge.";
    }
  }

  // ----------------------------------------------------------------------------
  // OFFLINE MOBILE BACKUP GENERATORS (PDF & EXCEL WORKBOOK)
  // ----------------------------------------------------------------------------
  function downloadBackupPdf() {
    const clean = (val) => String(val || "").normalize("NFKD").replace(/[^\x20-\x7E]/g, "?").replace(/([\\()])/g, "\\$1");
    const lines = [
      "Apna Khata Advance - Complete Family & Khata Report",
      `Generated: ${new Date().toLocaleString("en-PK", { timeZone: "Asia/Karachi" })}`,
      `Family: ${state.user?.family_name || "Family"} | Code: ${state.user?.invite_code || "-"}`,
      "",
      "--- KHATA ENTRIES (LENA-DENA) ---",
      ...state.khataEntries.map((k) => `${formatDate(k.entry_date)} | ${k.person_name} | ${k.is_private ? "[Zaati]" : "[Family]"} | ${money(k.amount)} | ${k.entry_type} | By: ${k.user_name || "Member"}`),
      "",
      "--- GHAR KA BUDGET (AAMDAN & KHARCH) ---",
      ...state.finances.map((f) => `${formatDate(f.entry_date)} | ${f.category} | ${f.finance_type === "income" ? "+Income" : "-Expense"} | ${money(f.amount)} | By: ${f.user_name || "Member"}`),
      "",
      "--- COMMITTEES / KAMETI ---",
      ...state.committees.map((c) => `${c.name} | Total: ${money(c.total_amount)} | Monthly: ${money(c.monthly_amount)} | Duration: ${c.total_months} months`)
    ];

    const wrapped = lines.flatMap((line) => {
      const text = clean(line);
      const parts = [];
      for (let i = 0; i < text.length; i += 90) parts.push(text.slice(i, i + 90));
      return parts.length ? parts : [""];
    });

    const pages = [];
    for (let i = 0; i < wrapped.length; i += 46) pages.push(wrapped.slice(i, i + 46));
    if (!pages.length) pages.push([""]);

    const objects = ["", "<< /Type /Catalog /Pages 2 0 R >>", ""];
    const fontId = 3 + pages.length * 2;
    const pageIds = [];

    pages.forEach((page, index) => {
      const pageId = 3 + index * 2;
      const contentId = pageId + 1;
      pageIds.push(`${pageId} 0 R`);
      const commands = `BT /F1 9 Tf 36 805 Td 11 TL ${page.map((line, lIdx) => `${lIdx ? "T* " : ""}(${line}) Tj`).join(" ")} ET`;
      objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`;
      objects[contentId] = `<< /Length ${commands.length} >>\nstream\n${commands}\nendstream`;
    });

    objects[2] = `<< /Type /Pages /Kids [${pageIds.join(" ")}] /Count ${pages.length} >>`;
    objects[fontId] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

    let pdf = "%PDF-1.4\n";
    const offsets = [0];
    for (let id = 1; id < objects.length; id++) {
      offsets[id] = pdf.length;
      pdf += `${id} 0 obj\n${objects[id]}\nendobj\n`;
    }
    const xref = pdf.length;
    pdf += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
    for (let id = 1; id < objects.length; id++) pdf += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
    pdf += `trailer << /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;

    const blob = new Blob([pdf], { type: "application/pdf" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Apna-Khata-Report-${new Date().toISOString().slice(0, 10)}.pdf`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    toast("PDF Report mobile mein save ho gayi!");
  }

  function downloadBackupExcel() {
    const xml = (v) => escapeHtml(v).replace(/'/g, "&apos;");

    // Khata Sheet
    const khataRows = state.khataEntries.map((k) =>
      `<Row><Cell><Data ss:Type="String">${xml(k.is_private ? "Zaati" : "Family")}</Data></Cell><Cell><Data ss:Type="String">${xml(formatDateTime(k.entry_date))}</Data></Cell><Cell><Data ss:Type="String">${xml(k.person_name)}</Data></Cell><Cell><Data ss:Type="Number">${Number(k.amount)}</Data></Cell><Cell><Data ss:Type="String">${xml(k.entry_type)}</Data></Cell><Cell><Data ss:Type="String">${xml(k.user_name || "Member")}</Data></Cell><Cell><Data ss:Type="String">${xml(k.note || "")}</Data></Cell></Row>`
    ).join("");
    const khataSheet = `<Worksheet ss:Name="Khata Lena-Dena"><Table><Row><Cell><Data ss:Type="String">Qisam</Data></Cell><Cell><Data ss:Type="String">Tareekh</Data></Cell><Cell><Data ss:Type="String">Shakhs</Data></Cell><Cell><Data ss:Type="String">Raqam</Data></Cell><Cell><Data ss:Type="String">Type</Data></Cell><Cell><Data ss:Type="String">By</Data></Cell><Cell><Data ss:Type="String">Note</Data></Cell></Row>${khataRows}</Table></Worksheet>`;

    // Budget Sheet
    const budgetRows = state.finances.map((f) =>
      `<Row><Cell><Data ss:Type="String">${xml(f.finance_type === "income" ? "Aamdan" : "Kharch")}</Data></Cell><Cell><Data ss:Type="String">${xml(formatDateTime(f.entry_date))}</Data></Cell><Cell><Data ss:Type="String">${xml(f.category)}</Data></Cell><Cell><Data ss:Type="Number">${Number(f.amount)}</Data></Cell><Cell><Data ss:Type="String">${xml(f.user_name || "Member")}</Data></Cell><Cell><Data ss:Type="String">${xml(f.note || "")}</Data></Cell></Row>`
    ).join("");
    const budgetSheet = `<Worksheet ss:Name="Ghar Ka Budget"><Table><Row><Cell><Data ss:Type="String">Qisam</Data></Cell><Cell><Data ss:Type="String">Tareekh</Data></Cell><Cell><Data ss:Type="String">Category</Data></Cell><Cell><Data ss:Type="String">Raqam</Data></Cell><Cell><Data ss:Type="String">By</Data></Cell><Cell><Data ss:Type="String">Note</Data></Cell></Row>${budgetRows}</Table></Worksheet>`;

    // Committee Sheet
    const comRows = state.committees.map((c) =>
      `<Row><Cell><Data ss:Type="String">${xml(c.name)}</Data></Cell><Cell><Data ss:Type="Number">${Number(c.total_amount)}</Data></Cell><Cell><Data ss:Type="Number">${Number(c.monthly_amount)}</Data></Cell><Cell><Data ss:Type="Number">${c.total_months}</Data></Cell><Cell><Data ss:Type="String">${xml(c.start_date)}</Data></Cell></Row>`
    ).join("");
    const comSheet = `<Worksheet ss:Name="Committees"><Table><Row><Cell><Data ss:Type="String">Naam</Data></Cell><Cell><Data ss:Type="String">Total Pool</Data></Cell><Cell><Data ss:Type="String">Monthly</Data></Cell><Cell><Data ss:Type="String">Months</Data></Cell><Cell><Data ss:Type="String">Start Date</Data></Cell></Row>${comRows}</Table></Worksheet>`;

    const workbookXml = `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">${khataSheet}${budgetSheet}${comSheet}</Workbook>`;

    const blob = new Blob([workbookXml], { type: "application/vnd.ms-excel" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Apna-Khata-Workbook-${new Date().toISOString().slice(0, 10)}.xls`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    toast("Excel Workbook mobile mein save ho gaya!");
  }

  function downloadBackupJson() {
    const backupData = {
      appName: "Apna Khata Advance",
      exportedAt: new Date().toISOString(),
      user: state.user,
      familyMembers: state.familyMembers,
      khataEntries: state.khataEntries,
      committees: state.committees,
      finances: state.finances,
      rollovers: state.rollovers
    };

    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: "application/json" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `Apna-Khata-Backup-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
    toast("JSON Data Backup download ho gaya!");
  }

  initTheme();
  bindEvents();
  checkExistingSession();

})();
