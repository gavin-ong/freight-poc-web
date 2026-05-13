/* =========================================
   CargoWise-ish MVP - app.js (ROBUST LOGIN BINDING)
   - No module imports
   - Auto loads Supabase JS if missing
   - Works regardless of button IDs (auto-detects Login button)
   - Handles form submit + button click
   ========================================= */

(function () {
  // -------------------------------
  // CONFIG (YOUR URL + KEY)
  // -------------------------------
  const SUPABASE_URL = "https://quzputmmabgcfmegarvd.supabase.co";
  const SUPABASE_KEY = "sb_publishable_UG9E0FbUzetadkz8TQN2fg_pIWx3LTO";
  const SUPABASE_CDN = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";

  let supabase = null;
  let currentUser = null;
  let userBranch = null;

  // -------------------------------
  // HELPERS
  // -------------------------------
  function $(id) {
    return document.getElementById(id);
  }

  function setStatus(msg, isError = false) {
    let el = $("status");
    if (!el) return;
    el.textContent = msg;
    el.style.color = isError ? "#ff7b7b" : "#9fffb0";
  }

  function ensureStatusElementExists() {
    if ($("status")) return;

    // Put status under the login button area if possible
    const loginBtn =
      $("loginBtn") ||
      document.querySelector('button[type="submit"], button') ||
      null;

    if (!loginBtn || !loginBtn.parentElement) return;

    const status = document.createElement("div");
    status.id = "status";
    status.style.marginTop = "10px";
    status.style.fontSize = "12px";
    status.style.opacity = "0.95";
    status.style.wordBreak = "break-word";
    loginBtn.parentElement.appendChild(status);
  }

  function show(el) {
    if (el) el.style.display = "";
  }
  function hide(el) {
    if (el) el.style.display = "none";
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

  // -------------------------------
  // SUPABASE INIT
  // -------------------------------
  async function initSupabaseClient() {
    ensureStatusElementExists();

    if (!window.supabase) {
      setStatus("Loading Supabase library...");
      await loadScript(SUPABASE_CDN);
    }
    if (!window.supabase || !window.supabase.createClient) {
      setStatus("Supabase library failed to initialize.", true);
      throw new Error("Supabase createClient missing");
    }

    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    setStatus("Ready.");
  }

  // -------------------------------
  // AUTH
  // -------------------------------
  async function signIn() {
    const emailEl = $("email") || document.querySelector('input[type="email"]');
    const passEl = $("password") || document.querySelector('input[type="password"]');

    const email = emailEl ? emailEl.value.trim() : "";
    const password = passEl ? passEl.value : "";

    if (!email || !password) {
      setStatus("Email and password required.", true);
      return;
    }

    setStatus("Signing in...");

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setStatus("Login failed: " + error.message, true);
      console.error("Auth error:", error);

      // Helpful hint if key is wrong
      console.warn(
        "If error mentions JWT/unauthorized/permission, you may be using the wrong key. Use anon public key (usually starts with eyJ...)."
      );
      return;
    }

    currentUser = data.user;
    setStatus("Login success.");
    await afterLogin();
  }

  async function signOut() {
    setStatus("Signing out...");
    const { error } = await supabase.auth.signOut();
    if (error) {
      setStatus("Logout failed: " + error.message, true);
      return;
    }
    currentUser = null;
    userBranch = null;
    setStatus("Signed out.");
    renderAuthState(false);
  }

  async function restoreSession() {
    setStatus("Checking session...");
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      setStatus("Session error: " + error.message, true);
      return;
    }
    if (data?.session?.user) {
      currentUser = data.session.user;
      await afterLogin();
    } else {
      setStatus("Ready.");
      renderAuthState(false);
    }
  }

  function renderAuthState(isLoggedIn) {
    // Optional containers (won't break if missing)
    const loginCard = $("loginCard");
    const appCard = $("appCard");

    if (isLoggedIn) {
      hide(loginCard);
      show(appCard);
    } else {
      show(loginCard);
      hide(appCard);
    }
  }

  // -------------------------------
  // DATA LOADERS
  // -------------------------------
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

    const branchDropdown = $("branch");
    if (branchDropdown && userBranch) branchDropdown.value = userBranch;
  }

  async function loadBranches() {
    const dropdown = $("branch");
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

  async function loadJobs() {
    const tbody = $("jobsTableBody");
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

  async function createJob() {
    const country = $("country") ? $("country").value : "";
    const branch = $("branch") ? $("branch").value : "";
    const transport = $("transport_mode") ? $("transport_mode").value : "";
    const jobType = $("job_type") ? $("job_type").value : "";
    const customer = $("customer") ? $("customer").value : "";

    setStatus("Creating job...");

    const { data, error } = await supabase.rpc("create_job", {
      p_country_code: country,
      p_branch_code: branch,
      p_transport_mode: transport,
      p_job_type: jobType,
      p_customer_name: customer,
    });

    if (error) {
      setStatus("Create job failed: " + error.message, true);
      console.error(error);
      return;
    }

    setStatus("Job created: " + (data?.job_no || "OK"));
    await loadJobs();
  }

  // -------------------------------
  // AFTER LOGIN
  // -------------------------------
  async function afterLogin() {
    renderAuthState(true);
    await loadBranches();
    await loadUserProfile();
    await loadJobs();
    setStatus("Ready.");
  }

  // -------------------------------
  // ROBUST EVENT BINDING (THE FIX)
  // -------------------------------
  function bindLoginHandlers() {
    // 1) If there is a form, capture submit
    const form =
      document.querySelector("form") ||
      $("loginForm") ||
      null;

    if (form) {
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        e.stopPropagation();
        signIn();
      });
    }

    // 2) Try common IDs
    const loginBtnById = $("loginBtn");
    if (loginBtnById) {
      loginBtnById.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        signIn();
      });
      return;
    }

    // 3) Auto-detect the login button by text content
    const buttons = Array.from(document.querySelectorAll("button"));
    const loginBtn = buttons.find((b) => (b.textContent || "").trim().toLowerCase() === "login");

    if (loginBtn) {
      loginBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        signIn();
      });
    }

    // Expose for inline onclick="login()"
    window.login = signIn;
  }

  function bindOtherHandlers() {
    const logoutBtn = $("logoutBtn");
    if (logoutBtn) logoutBtn.addEventListener("click", signOut);

    const createJobBtn = $("createJobBtn");
    if (createJobBtn) createJobBtn.addEventListener("click", createJob);

    window.logout = signOut;
    window.createJob = createJob;
  }

  // -------------------------------
  // INIT
  // -------------------------------
  async function init() {
    await initSupabaseClient();

    // Bind handlers AFTER DOM exists
    bindLoginHandlers();
    bindOtherHandlers();

    // Helpful to see auth state changes
    supabase.auth.onAuthStateChange((event) => {
      console.log("Auth event:", event);
    });

    await restoreSession();
  }

  document.addEventListener("DOMContentLoaded", () => {
    init().catch((e) => {
      console.error(e);
      setStatus("Init failed: " + (e.message || e), true);
    });
  });
})();
