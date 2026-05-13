/* =========================================================
   CargoWise-ish MVP - app.js (ULTRA ROBUST LOGIN)
   Fixes: "Login button click does nothing"
   - Capture-phase click delegation (beats stopPropagation)
   - MutationObserver rebind (beats re-rendered buttons)
   - Exposes __cw_login() for manual trigger testing
   ========================================================= */

(function () {
  // -------------------------------
  // CONFIG (YOUR URL + KEY)
  // -------------------------------
  const SUPABASE_URL = "https://quzputmmabgcfmegarvd.supabase.co";
  const SUPABASE_KEY = "sb_publishable_UG9E0FbUzetadkz8TQN2fg_pIWx3LTO";
  const SUPABASE_CDN = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
  const APP_VERSION = "app.js v2026-05-13b (ultra login capture+observer)";

  let supabase = null;
  let currentUser = null;
  let userBranch = null;

  // -------------------------------
  // HELPERS
  // -------------------------------
  const byId = (id) => document.getElementById(id);

  function setStatus(msg, isError = false) {
    const el =
      byId("status") ||
      byId("statusText") ||
      byId("lblStatus") ||
      byId("txtStatus");

    if (el) {
      el.textContent = msg;
      el.style.color = isError ? "#ff7b7b" : "#9fffb0";
    } else {
      // fallback
      (isError ? console.error : console.log)(msg);
    }
  }

  function ensureStatusElementExists() {
    if (byId("status") || byId("statusText")) return;

    const loginBtn = byId("btnLogin") || document.querySelector("button");
    if (!loginBtn || !loginBtn.parentElement) return;

    const status = document.createElement("div");
    status.id = "status";
    status.style.marginTop = "10px";
    status.style.fontSize = "12px";
    status.style.opacity = "0.95";
    status.style.wordBreak = "break-word";
    loginBtn.parentElement.appendChild(status);
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
  // SUPABASE INIT
  // -------------------------------
  async function initSupabase() {
    ensureStatusElementExists();

    if (!window.supabase || !window.supabase.createClient) {
      setStatus("Loading Supabase library...");
      await loadScript(SUPABASE_CDN);
    }

    if (!window.supabase || !window.supabase.createClient) {
      setStatus("Supabase library failed to load.", true);
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
        setStatus("Email and password required.", true);
        return;
      }

      setStatus("Signing in...");
      console.log("signIn() called:", email);

      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        setStatus("Login failed: " + error.message, true);
        console.error("Auth error:", error);
        return;
      }

      currentUser = data.user;
      setStatus("Login success.");
      await afterLogin();
    } catch (e) {
      setStatus("Login crashed: " + (e.message || e), true);
      console.error(e);
    }
  }

  async function signOut() {
    setStatus("Signing out...");
    const { error } = await supabase.auth.signOut();
    if (error) {
      setStatus("Logout failed: " + error.message, true);
      console.error(error);
      return;
    }
    currentUser = null;
    userBranch = null;
    setStatus("Signed out.");
  }

  async function restoreSession() {
    setStatus("Checking session...");
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      setStatus("Session error: " + error.message, true);
      console.error(error);
      return;
    }
    if (data?.session?.user) {
      currentUser = data.session.user;
      await afterLogin();
    } else {
      setStatus("Ready.");
    }
  }

  // -------------------------------
  // AFTER LOGIN: LOAD DATA (keep minimal for now)
  // -------------------------------
  async function loadBranches() {
    const dropdown = byId("branch") || byId("ddlBranch");
    if (!dropdown) return;

    const { data, error } = await supabase
      .from("branches")
      .select("country_code, branch_code")
      .order("country_code", { ascending: true })
      .order("branch_code", { ascending: true });

    if (error) {
      setStatus("Branch load error: " + error.message, true);
      console.error(error);
      return;
    }

    dropdown.innerHTML = "";
    (data || []).forEach((b) => {
      const opt = document.createElement("option");
      opt.value = b.branch_code;
      opt.textContent = `${b.country_code} - ${b.branch_code}`;
      dropdown.appendChild(opt);
    });
  }

  async function loadUserProfile() {
    if (!currentUser) return;

    const { data, error } = await supabase
      .from("users")
      .select("branch_code, role")
      .eq("id", currentUser.id)
      .single();

    if (error) {
      setStatus("User profile error: " + error.message, true);
      console.error(error);
      return;
    }

    userBranch = data?.branch_code || null;
    const dropdown = byId("branch") || byId("ddlBranch");
    if (dropdown && userBranch) dropdown.value = userBranch;
  }

  async function loadJobs() {
    const tbody = byId("jobsTableBody");
    if (!tbody) return;

    const { data, error } = await supabase
      .from("jobs")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      setStatus("Jobs load error: " + error.message, true);
      console.error(error);
      return;
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
  }

  async function afterLogin() {
    setStatus("Loading data...");
    await loadBranches();
    await loadUserProfile();
    await loadJobs();
    setStatus("Ready.");
  }

  // -------------------------------
  // CLICK FIX: CAPTURE-PHASE DELEGATION
  // -------------------------------
  function installGlobalClickCapture() {
    document.addEventListener(
      "click",
      (e) => {
        const btn = e.target && (e.target.closest ? e.target.closest("button") : null);
        if (!btn) return;

        const id = (btn.id || "").trim();
        const text = (btn.textContent || "").trim().toLowerCase();

        // Catch ALL variants of login buttons
        if (id === "btnLogin" || text === "login") {
          // capture-phase: we run before bubble-phase handlers
          console.log("Captured login click (global capture)", { id, text });
          setStatus("Login clicked...");
          e.preventDefault();
          signIn();
        }
      },
      true // <-- CAPTURE MODE (critical)
    );
  }

  // -------------------------------
  // REBIND FIX: MUTATION OBSERVER
  // -------------------------------
  function installMutationObserver() {
    const obs = new MutationObserver(() => {
      // If UI framework replaces the login button, ensure status exists again
      ensureStatusElementExists();
    });

    obs.observe(document.documentElement, { childList: true, subtree: true });
  }

  // -------------------------------
  // OPTIONAL: ALSO BIND DIRECT IDs (nice to have)
  // -------------------------------
  function bindDirectButtons() {
    const btnLogin = byId("btnLogin");
    if (btnLogin) {
      btnLogin.addEventListener("click", (e) => {
        console.log("btnLogin direct handler fired");
        setStatus("Login clicked...");
        e.preventDefault();
        signIn();
      });
    }

    const btnLogout = byId("btnLogout");
    if (btnLogout) btnLogout.addEventListener("click", signOut);

    const btnSignOut = byId("btnSignOut");
    if (btnSignOut) btnSignOut.addEventListener("click", signOut);

    // expose manual trigger for testing (no clicking needed)
    window.__cw_login = signIn;
  }

  // -------------------------------
  // INIT
  // -------------------------------
  async function init() {
    await initSupabase();

    installGlobalClickCapture(); // <-- main fix
    installMutationObserver();   // <-- main fix
    bindDirectButtons();         // <-- extra

    await restoreSession();
  }

  document.addEventListener("DOMContentLoaded", () => {
    init().catch((e) => {
      console.error(e);
      setStatus("Init failed: " + (e.message || e), true);
    });
  });
})();
