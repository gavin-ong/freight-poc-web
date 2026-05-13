/* =========================================================
   CargoWise-ish MVP - app.js (GLOBAL DEBUG + REAL LOGIN STATE)
   Fixes:
   - Console can’t see supabase -> expose window.supabaseClient
   - “Feels like not logged in” -> show badge + sticky status
   - Menlo/SafeView click weirdness -> pointerdown capture
   ========================================================= */

(function () {
  // -------------------------------
  // CONFIG (YOUR URL + KEY)
  // -------------------------------
  const SUPABASE_URL = "https://quzputmmabgcfmegarvd.supabase.co";
  const SUPABASE_KEY = "sb_publishable_UG9E0FbUzetadkz8TQN2fg_pIWx3LTO";
  const SUPABASE_CDN = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
  const APP_VERSION = "app.js v2026-05-13d (expose client + badge + sticky errors)";

  let supabaseClient = null;
  let currentUser = null;

  // -------------------------------
  // HELPERS
  // -------------------------------
  const byId = (id) => document.getElementById(id);

  function setStatus(msg, isError = false, sticky = false) {
    const el =
      byId("status") ||
      byId("statusText") ||
      byId("lblStatus") ||
      byId("txtStatus");

    if (el) {
      el.textContent = msg;
      el.style.color = isError ? "#ff7b7b" : "#9fffb0";
      el.dataset.sticky = sticky ? "1" : "0";
    } else {
      (isError ? console.error : console.log)(msg);
    }
  }

  function isStickyStatus() {
    const el =
      byId("status") ||
      byId("statusText") ||
      byId("lblStatus") ||
      byId("txtStatus");
    return !!(el && el.dataset.sticky === "1");
  }

  function ensureStatusElementExists() {
    if (byId("status") || byId("statusText")) return;

    const anchor = byId("btnLogin") || document.querySelector("button");
    if (!anchor || !anchor.parentElement) return;

    const status = document.createElement("div");
    status.id = "status";
    status.style.marginTop = "10px";
    status.style.fontSize = "12px";
    status.style.opacity = "0.95";
    status.style.wordBreak = "break-word";
    anchor.parentElement.appendChild(status);
  }

  function upsertBadge(text, ok = true) {
    let badge = byId("loggedInBadge");
    if (!badge) {
      badge = document.createElement("div");
      badge.id = "loggedInBadge";
      badge.style.marginTop = "10px";
      badge.style.fontSize = "12px";
      badge.style.opacity = "0.95";
      badge.style.wordBreak = "break-word";

      const statusEl = byId("status") || byId("statusText");
      if (statusEl && statusEl.parentElement) statusEl.parentElement.appendChild(badge);
      else document.body.appendChild(badge);
    }
    badge.style.color = ok ? "#9fffb0" : "#ff7b7b";
    badge.textContent = text;
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  function getEmailPassword() {
    const emailEl =
      byId("email") ||
      byId("txtEmail") ||
      byId("inpEmail") ||
      document.querySelector('input[type="email"]') ||
      document.querySelector('input[name="email"]');

    const passEl =
      byId("password") ||
      byId("txtPassword") ||
      byId("inpPassword") ||
      document.querySelector('input[type="password"]') ||
      document.querySelector('input[name="password"]');

    return {
      email: emailEl ? emailEl.value.trim() : "",
      password: passEl ? passEl.value : ""
    };
  }

  // -------------------------------
  // OPTIONAL UI TOGGLE (best effort)
  // -------------------------------
  function toggleUI(isLoggedIn) {
    // If you have containers, great. If not, we still show badge + status.
    const loginCard =
      byId("loginCard") || byId("loginContainer") || byId("authCard") || byId("authContainer");
    const appCard =
      byId("appCard") || byId("appContainer") || byId("mainApp") || byId("appMain");

    if (loginCard) loginCard.style.display = isLoggedIn ? "none" : "";
    if (appCard) appCard.style.display = isLoggedIn ? "" : "none";

    const btnLogin = byId("btnLogin");
    const btnLogout = byId("btnLogout");
    const btnSignOut = byId("btnSignOut");

    if (btnLogin) btnLogin.style.display = isLoggedIn ? "none" : "";
    if (btnLogout) btnLogout.style.display = isLoggedIn ? "" : "none";
    if (btnSignOut) btnSignOut.style.display = isLoggedIn ? "" : "none";
  }

  // -------------------------------
  // SUPABASE INIT
  // -------------------------------
  async function initSupabase() {
    ensureStatusElementExists();

    if (!window.supabase || !window.supabase.createClient) {
      setStatus("Loading Supabase library...");
      await loadScript(SUPABASE_CDN);
    }

    if (!window.supabase || !window.supabase.createClient) {
      setStatus("Supabase library failed to load.", true, true);
      throw new Error("Supabase createClient missing");
    }

    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

    // EXPOSE FOR DEBUGGING IN DEVTOOLS
    window.supabaseClient = supabaseClient;

    console.log(APP_VERSION);
    if (!isStickyStatus()) setStatus("Ready.");
  }

  // -------------------------------
  // AUTH
  // -------------------------------
  async function signIn() {
    try {
      const { email, password } = getEmailPassword();

      if (!email || !password) {
        setStatus("Email and password required.", true, true);
        upsertBadge("❌ Missing email/password", false);
        return;
      }

      setStatus("Signing in...");

      const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });

      if (error) {
        setStatus("Login failed: " + error.message, true, true);
        upsertBadge("❌ Login failed: " + error.message, false);
        console.error("Auth error:", error);
        return;
      }

      // Confirm session exists (this is the REAL truth)
      const s = await supabaseClient.auth.getSession();
      const sessionUser = s?.data?.session?.user || data?.user || null;

      if (!sessionUser) {
        setStatus("Login did not create a session (key/auth settings issue).", true, true);
        upsertBadge("❌ No session created after login", false);
        console.error("No session after signIn", { data, session: s });
        return;
      }

      currentUser = sessionUser;
      upsertBadge("✅ Logged in as: " + (currentUser.email || "(unknown)"), true);
      toggleUI(true);

      await afterLogin();

    } catch (e) {
      setStatus("Login crashed: " + (e.message || e), true, true);
      upsertBadge("❌ Login crashed: " + (e.message || e), false);
      console.error(e);
    }
  }

  async function signOut() {
    setStatus("Signing out...");
    const { error } = await supabaseClient.auth.signOut();
    if (error) {
      setStatus("Logout failed: " + error.message, true, true);
      upsertBadge("❌ Logout failed: " + error.message, false);
      return;
    }
    currentUser = null;
    toggleUI(false);
    setStatus("Signed out.", false, true);
    upsertBadge("Signed out.", true);
  }

  async function restoreSession() {
    setStatus("Checking session...");
    const { data, error } = await supabaseClient.auth.getSession();

    if (error) {
      setStatus("Session error: " + error.message, true, true);
      upsertBadge("❌ Session error: " + error.message, false);
      return;
    }

    if (data?.session?.user) {
      currentUser = data.session.user;
      upsertBadge("✅ Logged in as: " + (currentUser.email || "(unknown)"), true);
      toggleUI(true);
      await afterLogin();
      return;
    }

    currentUser = null;
    toggleUI(false);
    if (!isStickyStatus()) setStatus("Ready.");
  }

  // -------------------------------
  // DATA LOADERS (RLS DIAG)
  // -------------------------------
  async function loadBranches() {
    const dropdown = byId("branch") || byId("ddlBranch");
    if (!dropdown) return { ok: true };

    const { data, error } = await supabaseClient
      .from("branches")
      .select("country_code, branch_code")
      .order("country_code", { ascending: true })
      .order("branch_code", { ascending: true });

    if (error) return { ok: false, msg: "branches: " + error.message };

    dropdown.innerHTML = "";
    (data || []).forEach((b) => {
      const opt = document.createElement("option");
      opt.value = b.branch_code;
      opt.textContent = `${b.country_code} - ${b.branch_code}`;
      dropdown.appendChild(opt);
    });

    return { ok: true };
  }

  async function loadUserProfile() {
    if (!currentUser) return { ok: false, msg: "No user" };

    const { data, error } = await supabaseClient
      .from("users")
      .select("branch_code, role")
      .eq("id", currentUser.id)
      .single();

    if (error) return { ok: false, msg: "users: " + error.message };

    const dropdown = byId("branch") || byId("ddlBranch");
    if (dropdown && data?.branch_code) dropdown.value = data.branch_code;

    return { ok: true };
  }

  async function loadJobs() {
    const tbody = byId("jobsTableBody");
    if (!tbody) return { ok: true };

    const { data, error } = await supabaseClient
      .from("jobs")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) return { ok: false, msg: "jobs: " + error.message };

    tbody.innerHTML = "";
    (data || []).forEach((job) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${job.job_no ?? ""}</td>
        <td>${job.country_code ?? ""}</td>
        <td>${job.branch_code ?? ""}</td>
        <td>${job.transport_mode ?? ""}</td>
        <td>${job.job_type ?? ""}</td>
        <td>${job.customer_name ?? ""}</td>
      `;
      tbody.appendChild(tr);
    });

    return { ok: true };
  }

  async function afterLogin() {
    setStatus("Loading data...");

    const results = await Promise.all([loadBranches(), loadUserProfile(), loadJobs()]);
    const bad = results.find((r) => r && r.ok === false);

    if (bad) {
      setStatus("✅ Logged in, but data blocked: " + bad.msg, true, true);
      upsertBadge("✅ Logged in as: " + (currentUser?.email || "(unknown)") + " | ⚠ Data blocked: " + bad.msg, false);
      console.warn("Data blocked (RLS/policies):", bad.msg);
      return;
    }

    setStatus("✅ Logged in and data loaded.");
  }

  // -------------------------------
  // EVENT BINDING (Menlo/SafeView proof)
  // -------------------------------
  function installTriggers() {
    // pointerdown capture catches most “click swallowed” cases
    document.addEventListener(
      "pointerdown",
      (e) => {
        const btn = e.target?.closest ? e.target.closest("button") : null;
        if (!btn) return;

        const id = (btn.id || "").trim();
        const text = (btn.textContent || "").trim().toLowerCase();

        if (id === "btnLogin" || text === "login") {
          e.preventDefault();
          signIn();
        }
        if (id === "btnLogout" || id === "btnSignOut" || text === "logout" || text === "sign out") {
          e.preventDefault();
          signOut();
        }
      },
      true
    );

    // Enter key triggers login
    document.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !currentUser) {
        const hasEmail = !!(byId("email") || document.querySelector('input[type="email"]'));
        const hasPass = !!(byId("password") || document.querySelector('input[type="password"]'));
        if (hasEmail && hasPass) {
          e.preventDefault();
          signIn();
        }
      }
    });

    // Expose debug helpers (so you can test without clicking)
    window.__cw_login = signIn;
    window.__cw_logout = signOut;
    window.__cw_session = async () => {
      const r = await supabaseClient.auth.getSession();
      console.log("SESSION:", r.data.session);
      console.log("EMAIL:", r.data.session?.user?.email);
      return r;
    };
  }

  // -------------------------------
  // INIT
  // -------------------------------
  async function init() {
    await initSupabase();
    installTriggers();
    await restoreSession();
  }

  document.addEventListener("DOMContentLoaded", () => {
    init().catch((e) => {
      console.error(e);
      setStatus("Init failed: " + (e.message || e), true, true);
      upsertBadge("❌ Init failed: " + (e.message || e), false);
    });
  });
})();
``
