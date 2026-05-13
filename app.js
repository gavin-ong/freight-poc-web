/* =========================================
   CargoWise-ish MVP - app.js (NO MODULE IMPORTS)
   - Auto loads Supabase JS if missing
   - Login / Logout / Session restore
   - After login: load branches, user profile, jobs
   ========================================= */

(function () {
  // -------------------------------
  // CONFIG (YOUR URL + KEY)
  // -------------------------------
  const SUPABASE_URL = "https://quzputmmabgcfmegarvd.supabase.co";
  const SUPABASE_KEY = "sb_publishable_UG9E0FbUzetadkz8TQN2fg_pIWx3LTO"; // may need anon key (eyJ...)
  const SUPABASE_CDN = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";

  let supabase = null;
  let currentUser = null;
  let userBranch = null;

  // -------------------------------
  // HELPERS (UI)
  // -------------------------------
  function $(id) {
    return document.getElementById(id);
  }

  function setStatus(msg, isError = false) {
    const el = $("status");
    if (!el) {
      // fallback to alert if no status element exists
      if (isError) console.error(msg);
      return;
    }
    el.textContent = msg;
    el.style.color = isError ? "#ff7b7b" : "#9fffb0";
  }

  function show(el) {
    if (el) el.style.display = "";
  }

  function hide(el) {
    if (el) el.style.display = "none";
  }

  function ensureStatusElementExists() {
    // If your HTML doesn't have <div id="status"></div>, we inject one under the login button
    if ($("status")) return;

    const loginBtn = $("loginBtn") || document.querySelector('button[type="button"], button');
    if (!loginBtn) return;

    const status = document.createElement("div");
    status.id = "status";
    status.style.marginTop = "10px";
    status.style.fontSize = "12px";
    status.style.opacity = "0.95";
    status.style.wordBreak = "break-word";
    loginBtn.parentElement.appendChild(status);
  }

  // -------------------------------
  // LOAD SUPABASE LIB IF NEEDED
  // -------------------------------
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

  async function initSupabaseClient() {
    ensureStatusElementExists();

    if (!window.supabase) {
      setStatus("Loading Supabase library...");
      try {
        await loadScript(SUPABASE_CDN);
      } catch (e) {
        setStatus("Failed to load Supabase JS library. Check internet/CDN.", true);
        throw e;
      }
    }

    if (!window.supabase || !window.supabase.createClient) {
      setStatus("Supabase library loaded but createClient is missing.", true);
      throw new Error("Supabase createClient missing");
    }

    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    setStatus("Supabase client ready.");
  }

  // -------------------------------
  // AUTH
  // -------------------------------
  async function signIn() {
    const emailEl = $("email");
    const passEl = $("password");

    const email = emailEl ? emailEl.value.trim() : "";
    const password = passEl ? passEl.value : "";

    if (!email || !password) {
      setStatus("Email and password required.", true);
      return;
    }

    setStatus("Signing in...");

    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      // Most useful message you can see immediately
      setStatus("Login failed: " + error.message, true);

      // Strong hint if key is wrong
      if (
        String(error.message || "").toLowerCase().includes("invalid") ||
        String(error.message || "").toLowerCase().includes("jwt") ||
        String(error.message || "").toLowerCase().includes("unauthorized") ||
        String(error.message || "").toLowerCase().includes("permission")
      ) {
        console.warn("Possible wrong API key. Many projects require anon/public key (often starts with eyJ...).");
      }

      console.error("Auth error:", error);
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
    setStatus("Restoring session...");
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      setStatus("Session restore error: " + error.message, true);
      return;
    }

    if (data && data.session && data.session.user) {
      currentUser = data.session.user;
      setStatus("Session restored.");
      await afterLogin();
    } else {
      setStatus("No session. Please login.");
      renderAuthState(false);
    }
  }

  function renderAuthState(isLoggedIn) {
    // These containers depend on your index.html ids.
    // If your HTML doesn't have them, nothing breaks.
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
  // LOAD USER PROFILE (branch, role)
  // -------------------------------
  async function loadUserProfile() {
    if (!currentUser) return;

    // You said you have a "users" table with id, branch_code, role
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

    userBranch = data.branch_code || null;

    // default branch dropdown
    const branchDropdown = $("branch");
    if (branchDropdown && userBranch) {
      branchDropdown.value = userBranch;
    }
  }

  // -------------------------------
  // LOAD BRANCHES
  // -------------------------------
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

  // -------------------------------
  // JOBS
  // -------------------------------
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

    setStatus("Job created: " + (data && data.job_no ? data.job_no : "OK"));
    await loadJobs();
  }

  // -------------------------------
  // AFTER LOGIN
  // -------------------------------
  async function afterLogin() {
    renderAuthState(true);

    // Load in correct order
    await loadBranches();
    await loadUserProfile(); // sets default branch
    await loadJobs();

    setStatus("Ready.");
  }

  // -------------------------------
  // WIRE BUTTONS
  // -------------------------------
  function wireEvents() {
    // If your login button has id="loginBtn", we hook it.
    const loginBtn = $("loginBtn");
    if (loginBtn) loginBtn.addEventListener("click", signIn);

    const logoutBtn = $("logoutBtn");
    if (logoutBtn) logoutBtn.addEventListener("click", signOut);

    const createJobBtn = $("createJobBtn");
    if (createJobBtn) createJobBtn.addEventListener("click", createJob);

    // Also expose for inline onclick="..."
    window.login = signIn;
    window.logout = signOut;
    window.createJob = createJob;
  }

  // -------------------------------
  // INIT
  // -------------------------------
  async function init() {
    await initSupabaseClient();
    wireEvents();

    // listen auth changes
    supabase.auth.onAuthStateChange((event, session) => {
      // Useful during testing:
      console.log("Auth event:", event);
      if (session && session.user) {
        currentUser = session.user;
      } else {
        currentUser = null;
      }
    });

    await restoreSession();
  }

  // Start
  document.addEventListener("DOMContentLoaded", () => {
    init().catch((e) => {
      console.error(e);
      setStatus("Init failed: " + (e.message || e), true);
    });
  });
})();
