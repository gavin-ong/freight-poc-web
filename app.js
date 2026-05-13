/* =========================================================
   CW-MVP app.js v2026-05-13e (MATCHED TO PROVIDED index.html)
   - Supabase URL + key embedded
   - Login/logout works with Menlo/SafeView (pointerdown capture)
   - UI toggle loginCard/appCard
   - Branches + public.users profile + Jobs + Charges wired
   ========================================================= */

(function () {
  const SUPABASE_URL = "https://quzputmmabgcfmegarvd.supabase.co";
  const SUPABASE_KEY = "sb_publishable_UG9E0FbUzetadkz8TQN2fg_pIWx3LTO";
  const SUPABASE_CDN = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
  const APP_VERSION = "app.js v2026-05-13e";

  let supabaseClient = null;
  let currentUser = null;
  let currentJobId = null;
  let currentJobNo = null;

  const byId = (id) => document.getElementById(id);

  function setStatus(msg, isError = false, sticky = false) {
    const el = byId("status");
    if (el) {
      el.textContent = msg;
      el.style.color = isError ? "#ff7b7b" : "#9fffb0";
      el.dataset.sticky = sticky ? "1" : "0";
    } else {
      (isError ? console.error : console.log)(msg);
    }
  }

  function isStickyStatus() {
    const el = byId("status");
    return !!(el && el.dataset.sticky === "1");
  }

  function setBadge(msg, ok = true) {
    const el = byId("loggedInBadge");
    if (!el) return;
    el.textContent = msg;
    el.style.color = ok ? "#9fffb0" : "#ff7b7b";
  }

  function toggleUI(isLoggedIn) {
    const loginCard = byId("loginCard");
    const appCard = byId("appCard");
    const btnLogin = byId("btnLogin");
    const btnLogout = byId("btnLogout");
    const btnSignOut = byId("btnSignOut");

    if (loginCard) loginCard.style.display = isLoggedIn ? "none" : "";
    if (appCard) appCard.style.display = isLoggedIn ? "" : "none";
    if (btnLogin) btnLogin.classList.toggle("hidden", isLoggedIn);
    if (btnLogout) btnLogout.classList.toggle("hidden", !isLoggedIn);
    if (btnSignOut) btnSignOut.classList.toggle("hidden", !isLoggedIn);
  }

  function setCurrentJob(job) {
    currentJobId = job?.job_id ?? job?.id ?? null;
    currentJobNo = job?.job_no ?? null;
    const chip = byId("currentJobNo");
    if (chip) chip.textContent = currentJobNo || "None";
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
    return {
      email: (byId("email")?.value || "").trim(),
      password: byId("password")?.value || ""
    };
  }

  async function initSupabase() {
    if (!window.supabase || !window.supabase.createClient) {
      setStatus("Loading Supabase library...");
      await loadScript(SUPABASE_CDN);
    }
    if (!window.supabase || !window.supabase.createClient) {
      setStatus("Supabase library failed to load.", true, true);
      throw new Error("Supabase createClient missing");
    }

    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    window.supabaseClient = supabaseClient; // debug
    console.log(APP_VERSION);
    if (!isStickyStatus()) setStatus("Ready.");
  }

  // -------------------------------
  // AUTH
  // -------------------------------
  async function signIn() {
    const { email, password } = getEmailPassword();
    if (!email || !password) {
      setStatus("Email and password required.", true, true);
      setBadge("❌ Missing email/password", false);
      return;
    }

    setStatus("Signing in...");

    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) {
      setStatus("Login failed: " + error.message, true, true);
      setBadge("❌ Login failed: " + error.message, false);
      return;
    }

    const s = await supabaseClient.auth.getSession();
    const sessionUser = s?.data?.session?.user || data?.user || null;

    if (!sessionUser) {
      setStatus("Login did not create a session (key/auth settings issue).", true, true);
      setBadge("❌ No session created after login", false);
      return;
    }

    currentUser = sessionUser;
    setBadge("✅ Logged in as: " + (currentUser.email || "(unknown)"), true);
    toggleUI(true);

    await afterLogin();
  }

  async function signOut() {
    setStatus("Signing out...");
    const { error } = await supabaseClient.auth.signOut();
    if (error) {
      setStatus("Logout failed: " + error.message, true, true);
      setBadge("❌ Logout failed: " + error.message, false);
      return;
    }
    currentUser = null;
    setCurrentJob(null);
    toggleUI(false);
    setStatus("Signed out.", false, true);
    setBadge("Signed out.", true);
  }

  async function restoreSession() {
    setStatus("Checking session...");
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) {
      setStatus("Session error: " + error.message, true, true);
      setBadge("❌ Session error: " + error.message, false);
      toggleUI(false);
      return;
    }

    if (data?.session?.user) {
      currentUser = data.session.user;
      setBadge("✅ Logged in as: " + (currentUser.email || "(unknown)"), true);
      toggleUI(true);
      await afterLogin();
      return;
    }

    currentUser = null;
    toggleUI(false);
    if (!isStickyStatus()) setStatus("Ready.");
  }

  // -------------------------------
  // DATA LOADERS
  // -------------------------------
  async function loadBranches() {
    const ddl = byId("branch");
    if (!ddl) return { ok: true };

    const { data, error } = await supabaseClient
      .from("branches")
      .select("country_code, branch_code")
      .order("country_code", { ascending: true })
      .order("branch_code", { ascending: true });

    if (error) return { ok: false, msg: "branches: " + error.message };

    ddl.innerHTML = "";
    (data || []).forEach((b) => {
      const opt = document.createElement("option");
      opt.value = b.branch_code;
      opt.textContent = `${b.country_code} - ${b.branch_code}`;
      ddl.appendChild(opt);
    });

    return { ok: true };
  }

  async function loadUserProfileDefaultBranch() {
    if (!currentUser) return { ok: false, msg: "No user" };

    const { data, error } = await supabaseClient
      .from("users") // public.users
      .select("branch_code, role")
      .eq("id", currentUser.id)
      .single();

    if (error) return { ok: false, msg: "users: " + error.message };

    const ddl = byId("branch");
    if (ddl && data?.branch_code) ddl.value = data.branch_code;

    return { ok: true };
  }

  async function loadJobs() {
    const tbody = byId("jobsTableBody");
    if (!tbody) return { ok: false, msg: "UI missing jobsTableBody (index.html not updated)" };

    const { data, error } = await supabaseClient
      .from("jobs")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) return { ok: false, msg: "jobs: " + error.message };

    tbody.innerHTML = "";
    (data || []).forEach((job) => {
      const tr = document.createElement("tr");
      tr.dataset.jobId = job.job_id ?? job.id ?? "";
      tr.dataset.jobNo = job.job_no ?? "";
      tr.innerHTML = `
        <td>${job.job_no ?? ""}</td>
        <td>${job.country_code ?? ""}</td>
        <td>${job.branch_code ?? ""}</td>
        <td>${job.transport_mode ?? ""}</td>
        <td>${job.job_type ?? ""}</td>
        <td>${job.customer_name ?? ""}</td>
      `;

      tr.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        setCurrentJob(job);
        loadChargesForCurrentJob();
      }, true);

      tbody.appendChild(tr);
    });

    return { ok: true };
  }

  async function createJob() {
    const country = (byId("country")?.value || "").trim();
    const branch = (byId("branch")?.value || "").trim();
    const transport = (byId("transport_mode")?.value || "").trim();
    const jobType = (byId("job_type")?.value || "").trim();
    const customer = (byId("customer")?.value || "").trim();

    setStatus("Creating job...");

    const { data, error } = await supabaseClient.rpc("create_job", {
      p_country_code: country,
      p_branch_code: branch,
      p_transport_mode: transport,
      p_job_type: jobType,
      p_customer_name: customer
    });

    if (error) {
      setStatus("Create job failed: " + error.message, true, true);
      return;
    }

    setStatus("Job created: " + (data?.job_no || "OK"));
    await loadJobs();
  }

  async function loadChargesForCurrentJob() {
    const tbody = byId("chargesTableBody");
    if (!tbody) return;

    if (!currentJobId) {
      tbody.innerHTML = "";
      setStatus("Select a job first to load charges.", true, true);
      return;
    }

    setStatus("Loading charges...");

    const { data, error } = await supabaseClient
      .from("charges")
      .select("*")
      .eq("job_id", currentJobId)
      .order("created_at", { ascending: false });

    if (error) {
      setStatus("Charges load failed: " + error.message, true, true);
      return;
    }

    tbody.innerHTML = "";
    (data || []).forEach((c) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${c.charge_code ?? ""}</td>
        <td>${c.amount ?? ""}</td>
        <td>${c.currency ?? ""}</td>
        <td>${c.type ?? ""}</td>
      `;
      tbody.appendChild(tr);
    });

    setStatus("Charges loaded.");
  }

  async function addCharge() {
    if (!currentJobId) {
      setStatus("Select a job first before adding charge.", true, true);
      return;
    }

    const chargeCode = (byId("charge_code")?.value || "").trim();
    const amountRaw = (byId("amount")?.value || "").trim();
    const currency = (byId("currency")?.value || "").trim();
    const type = (byId("charge_type")?.value || "").trim();

    const amount = parseFloat(amountRaw);
    if (!chargeCode || !currency || !type || !Number.isFinite(amount)) {
      setStatus("Charge fields invalid (code/amount/currency/type).", true, true);
      return;
    }

    setStatus("Adding charge...");

    const { error } = await supabaseClient.from("charges").insert([{
      job_id: currentJobId,
      charge_code: chargeCode,
      amount,
      currency,
      type
    }]);

    if (error) {
      setStatus("Add charge failed: " + error.message, true, true);
      return;
    }

    setStatus("Charge added.");
    await loadChargesForCurrentJob();
  }

  async function afterLogin() {
    setStatus("Loading data...");

    const r1 = await loadBranches();
    if (!r1.ok) { setStatus("✅ Logged in, but " + r1.msg, true, true); return; }

    const r2 = await loadUserProfileDefaultBranch();
    if (!r2.ok) { setStatus("✅ Logged in, but " + r2.msg, true, true); return; }

    const r3 = await loadJobs();
    if (!r3.ok) { setStatus("✅ Logged in, but " + r3.msg, true, true); return; }

    setStatus("✅ Logged in and data loaded.");
  }

  // -------------------------------
  // EVENT WIRING (Menlo/SafeView proof)
  // -------------------------------
  function wireEvents() {
    document.addEventListener("pointerdown", (e) => {
      const btn = e.target?.closest ? e.target.closest("button") : null;
      if (!btn) return;

      const id = btn.id || "";
      if (id === "btnLogin") { e.preventDefault(); signIn(); }
      if (id === "btnLogout" || id === "btnSignOut") { e.preventDefault(); signOut(); }

      if (id === "btnCreateJob") { e.preventDefault(); createJob(); }
      if (id === "btnRefreshJobs") { e.preventDefault(); loadJobs(); }
      if (id === "btnRefreshCharges") { e.preventDefault(); loadChargesForCurrentJob(); }
      if (id === "btnAddCharge") { e.preventDefault(); addCharge(); }

      // placeholders
      if (id === "btnDraftInvoice") { e.preventDefault(); setStatus("Invoice draft: next module (not wired yet).", true, true); }
      if (id === "btnRefreshProfit") { e.preventDefault(); setStatus("Profit: next module (not wired yet).", true, true); }
      if (id === "btnAddMilestone") { e.preventDefault(); setStatus("Milestones: next module (not wired yet).", true, true); }
    }, true);

    document.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !currentUser) {
        e.preventDefault();
        signIn();
      }
    });

    // Debug helpers
    window.__cw_login = signIn;
    window.__cw_logout = signOut;
    window.__cw_session = async () => {
      const r = await supabaseClient.auth.getSession();
      console.log("SESSION:", r.data.session);
      console.log("EMAIL:", r.data.session?.user?.email);
      return r;
    };
  }

  async function init() {
    await initSupabase();
    wireEvents();
    await restoreSession();
  }

  document.addEventListener("DOMContentLoaded", () => {
    init().catch((e) => {
      console.error(e);
      setStatus("Init failed: " + (e.message || e), true, true);
      setBadge("❌ Init failed: " + (e.message || e), false);
      toggleUI(false);
    });
  });
})();
