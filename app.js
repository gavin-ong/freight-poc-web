/* =========================================================
   CargoWise-ish MVP - app.js (LOGIN WORKING + UI TOGGLE + RLS DIAG)
   - Works without ES module import
   - Handles Menlo/SafeView weird clicks (pointerdown + capture + Enter)
   - Forces UI flip after login (so you can SEE you are logged in)
   - Keeps errors visible (no instant overwrite to "Ready")
   ========================================================= */

(function () {
  // -------------------------------
  // CONFIG (YOUR URL + KEY)
  // -------------------------------
  const SUPABASE_URL = "https://quzputmmabgcfmegarvd.supabase.co";
  const SUPABASE_KEY = "sb_publishable_UG9E0FbUzetadkz8TQN2fg_pIWx3LTO";
  const SUPABASE_CDN = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
  const APP_VERSION = "app.js v2026-05-13c (ui-toggle + pointerdown + rls-diag)";

  let supabase = null;
  let currentUser = null;

  // -------------------------------
  // HELPERS
  // -------------------------------
  const byId = (id) => document.getElementById(id);

  function safeText(el) {
    return (el && el.textContent ? el.textContent : "").trim();
  }

  function setStatus(msg, isError = false, sticky = false) {
    // sticky=true means don't overwrite later unless explicitly set again
    const el =
      byId("status") ||
      byId("statusText") ||
      byId("lblStatus") ||
      byId("txtStatus");

    if (el) {
      el.textContent = msg;
      el.style.color = isError ? "#ff7b7b" : "#9fffb0";
      if (sticky) el.dataset.sticky = "1";
      if (!sticky) el.dataset.sticky = "0";
    } else {
      (isError ? console.error : console.log)(msg);
    }
  }

  function getStatusSticky() {
    const el =
      byId("status") ||
      byId("statusText") ||
      byId("lblStatus") ||
      byId("txtStatus");
    return el && el.dataset.sticky === "1";
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

  function injectLoggedInBadge(email) {
    let badge = byId("loggedInBadge");
    if (!badge) {
      badge = document.createElement("div");
      badge.id = "loggedInBadge";
      badge.style.marginTop = "10px";
      badge.style.fontSize = "12px";
      badge.style.color = "#9fffb0";
      badge.style.opacity = "0.95";
      // insert near status if possible
      const statusEl = byId("status") || byId("statusText");
      if (statusEl && statusEl.parentElement) statusEl.parentElement.appendChild(badge);
      else document.body.appendChild(badge);
    }
    badge.textContent = `✅ Logged in as: ${email || "(unknown)"}`;
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
  // UI TOGGLE (SO YOU CAN SEE LOGIN WORKED)
  // -------------------------------
  function toggleUI(isLoggedIn) {
    // 1) Common containers if you have them
    const loginCard = byId("loginCard") || byId("loginContainer") || byId("authCard") || byId("authContainer");
    const appCard = byId("appCard") || byId("appContainer") || byId("mainApp") || byId("appMain");

    if (loginCard) loginCard.style.display = isLoggedIn ? "none" : "";
    if (appCard) appCard.style.display = isLoggedIn ? "" : "none";

    // 2) Your known buttons from console:
    const btnLogout = byId("btnLogout");
    const btnSignOut = byId("btnSignOut");
    const btnLogin = byId("btnLogin");

    if (btnLogout) btnLogout.style.display = isLoggedIn ? "" : "none";
    if (btnSignOut) btnSignOut.style.display = isLoggedIn ? "" : "none";
    if (btnLogin) btnLogin.style.display = isLoggedIn ? "none" : "";

    // 3) If you don’t have containers, hide the card that contains "Sign in"
    //    (safe fallback: only hides if we can find a clear header)
    const headings = Array.from(document.querySelectorAll("h1,h2,h3,div,label"));
    const signInEl = headings.find((el) => safeText(el).toLowerCase() === "sign in");
    if (signInEl) {
      const card =
        signInEl.closest(".card") ||
        signInEl.closest(".panel") ||
        signInEl.closest("section") ||
        signInEl.closest("div");
      if (card && !loginCard) card.style.display = isLoggedIn ? "none" : "";
    }
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

    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log(APP_VERSION);
    setStatus("Ready.");
  }

  // -------------------------------
  // AUTH
  // -------------------------------
  async function signIn() {
    try {
      const { email, password } = getEmailPassword();

      if (!email || !password) {
        setStatus("Email and password required.", true, true);
        return;
      }

      setStatus("Signing in...");

      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        setStatus("Login failed: " + error.message, true, true);
        console.error("Auth error:", error);
        return;
      }

      // Some setups return user but session may be null; verify session
      const sessionCheck = await supabase.auth.getSession();
      const sessionUser = sessionCheck?.data?.session?.user || data?.user || null;

      if (!sessionUser) {
        setStatus("Login did not create a session (check auth settings / API key).", true, true);
        console.error("No session user after signIn", { data, sessionCheck });
        return;
      }

      currentUser = sessionUser;

      injectLoggedInBadge(currentUser.email);
      toggleUI(true);

      await afterLogin();

    } catch (e) {
      setStatus("Login crashed: " + (e.message || e), true, true);
      console.error(e);
    }
  }

  async function signOut() {
    setStatus("Signing out...");
    const { error } = await supabase.auth.signOut();
    if (error) {
      setStatus("Logout failed: " + error.message, true, true);
      console.error(error);
      return;
    }
    currentUser = null;
    toggleUI(false);
    setStatus("Signed out.", false, true);
  }

  async function restoreSession() {
    setStatus("Checking session...");
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      setStatus("Session error: " + error.message, true, true);
      console.error(error);
      return;
    }

    if (data?.session?.user) {
      currentUser = data.session.user;
      injectLoggedInBadge(currentUser.email);
      toggleUI(true);
      await afterLogin();
      return;
    }

    toggleUI(false);
    setStatus("Ready.");
  }

  // -------------------------------
  // DATA LOADERS (WITH RLS DIAG)
  // -------------------------------
  async function loadUserProfile() {
    if (!currentUser) return { ok: false, msg: "No user" };

    const { data, error } = await supabase
      .from("users")
      .select("branch_code, role")
      .eq("id", currentUser.id)
      .single();

    if (error) {
      console.error("users table error:", error);
      return { ok: false, msg: "users: " + error.message };
    }

    // default branch dropdown if exists
    const branchDropdown = byId("branch") || byId("ddlBranch");
    if (branchDropdown && data?.branch_code) {
      branchDropdown.value = data.branch_code;
    }

    return { ok: true };
  }

  async function loadBranches() {
    const dropdown = byId("branch") || byId("ddlBranch");
    if (!dropdown) return { ok: true }; // no dropdown = no problem

    const { data, error } = await supabase
      .from("branches")
      .select("country_code, branch_code")
      .order("country_code", { ascending: true })
      .order("branch_code", { ascending: true });

    if (error) {
      console.error("branches table error:", error);
      return { ok: false, msg: "branches: " + error.message };
    }

    dropdown.innerHTML = "";
    (data || []).forEach((b) => {
      const opt = document.createElement("option");
      opt.value = b.branch_code;
      opt.textContent = `${b.country_code} - ${b.branch_code}`;
      dropdown.appendChild(opt);
    });

    return { ok: true };
  }

  async function loadJobs() {
    const tbody = byId("jobsTableBody");
    if (!tbody) return { ok: true }; // no table = no problem

    const { data, error } = await supabase
      .from("jobs")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("jobs table error:", error);
      return { ok: false, msg: "jobs: " + error.message };
    }

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
      // Important: keep the error visible (sticky) so you know it's RLS or table issue
      setStatus(
        "✅ Logged in, but data blocked: " + bad.msg + " (RLS/policy/table).",
        true,
        true
      );
      return;
    }

    setStatus("✅ Logged in and data loaded.");
  }

  // -------------------------------
  // EVENT CAPTURE (MENLO/SafeView CLICK WEIRDNESS)
  // -------------------------------
  function installLoginTriggers() {
    // 1) Capture phase click
    document.addEventListener(
      "click",
      (e) => {
        const btn = e.target && e.target.closest ? e.target.closest("button") : null;
        if (!btn) return;

        const id = (btn.id || "").trim();
        const text = (btn.textContent || "").trim().toLowerCase();

        if (id === "btnLogin" || text === "login") {
          e.preventDefault();
          setStatus("Signing in...");
          signIn();
        }
      },
      true
    );

    // 2) pointerdown (often works when click is swallowed)
    document.addEventListener(
      "pointerdown",
      (e) => {
        const btn = e.target && e.target.closest ? e.target.closest("button") : null;
        if (!btn) return;

        const id = (btn.id || "").trim();
        const text = (btn.textContent || "").trim().toLowerCase();

        if (id === "btnLogin" || text === "login") {
          e.preventDefault();
          setStatus("Signing in...");
          signIn();
        }
      },
      true
    );

    // 3) Enter key triggers login
    document.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        // If user is on login screen, use Enter to login
        const hasEmail = !!(byId("email") || document.querySelector('input[type="email"]'));
        const hasPass = !!(byId("password") || document.querySelector('input[type="password"]'));
        if (hasEmail && hasPass && !currentUser) {
          e.preventDefault();
          setStatus("Signing in...");
          signIn();
        }
      }
    });

    // 4) Bind logout buttons if present
    const btnLogout = byId("btnLogout");
    if (btnLogout) btnLogout.addEventListener("pointerdown", (e) => { e.preventDefault(); signOut(); }, true);

    const btnSignOut = byId("btnSignOut");
    if (btnSignOut) btnSignOut.addEventListener("pointerdown", (e) => { e.preventDefault(); signOut(); }, true);

    // Manual trigger (kept)
    window.__cw_login = signIn;
  }

  // -------------------------------
  // INIT
  // -------------------------------
  async function init() {
    await initSupabase();
    installLoginTriggers();
    await restoreSession();
  }

  document.addEventListener("DOMContentLoaded", () => {
    init().catch((e) => {
      console.error(e);
      setStatus("Init failed: " + (e.message || e), true, true);
    });
  });
})();
