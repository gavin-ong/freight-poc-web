(function () {
  const SUPABASE_URL = "https://quzputmmabgcfmegarvd.supabase.co";
  const SUPABASE_KEY = "sb_publishable_UG9E0FbUzetadkz8TQN2fg_pIWx3LTO";
  const SUPABASE_CDN = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
  const BUILD = "BUILD: RECOVERY-3 (JS)";

  let client = null;
  let user = null;
  let currentJobId = null;

  const $ = (id) => document.getElementById(id);

  function status(msg, isErr = false) {
    const el = $("status");
    if (!el) return;
    el.textContent = msg;
    el.style.color = isErr ? "#ff7b7b" : "#9fffb0";
  }

  function badge(msg, ok = true) {
    const el = $("badge");
    if (!el) return;
    el.textContent = msg;
    el.style.color = ok ? "#9fffb0" : "#ff7b7b";
  }

  function showApp(loggedIn) {
    const loginCard = $("loginCard");
    const appCard = $("appCard");
    const btnLogin = $("btnLogin");
    const btnLogout = $("btnLogout");

    if (loginCard) loginCard.style.display = loggedIn ? "none" : "";
    if (appCard) appCard.style.display = loggedIn ? "" : "none";
    if (btnLogin) btnLogin.classList.toggle("hidden", loggedIn);
    if (btnLogout) btnLogout.classList.toggle("hidden", !loggedIn);
  }

  function setCurrentJob(jobNo) {
    const el = $("currentJobNo");
    if (el) el.textContent = jobNo || "None";
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

  async function initSupabase() {
    status("Loading Supabase JS...");
    if (!window.supabase || !window.supabase.createClient) {
      await loadScript(SUPABASE_CDN);
    }
    if (!window.supabase || !window.supabase.createClient) {
      status("Supabase CDN blocked / failed to load.", true);
      return;
    }
    client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    window.supabaseClient = client;
    console.log(BUILD);
    status("Ready.");
  }

  function creds() {
    return {
      email: ($("email")?.value || "").trim(),
      password: $("password")?.value || ""
    };
  }

  async function signIn() {
    const { email, password } = creds();
    if (!email || !password) return status("Email/password required.", true);

    status("Signing in...");
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) return status("Login failed: " + error.message, true);

    const s = await client.auth.getSession();
    user = s?.data?.session?.user || data?.user || null;
    if (!user) return status("Signed in but no session.", true);

    badge("✅ Logged in as: " + (user.email || "(unknown)"));
    showApp(true);
    await afterLogin();
  }

  async function signOut() {
    status("Signing out...");
    const { error } = await client.auth.signOut();
    if (error) return status("Logout failed: " + error.message, true);
    user = null;
    currentJobId = null;
    setCurrentJob(null);
    badge("Signed out.", true);
    showApp(false);
    status("Ready.");
  }

  async function restoreSession() {
    status("Checking session...");
    const { data } = await client.auth.getSession();
    if (data?.session?.user) {
      user = data.session.user;
      badge("✅ Logged in as: " + (user.email || "(unknown)"));
      showApp(true);
      await afterLogin();
    } else {
      showApp(false);
      status("Ready.");
    }
  }

  async function loadBranches() {
    const ddl = $("branch");
    if (!ddl) return status("UI missing #branch (wrong index.html).", true);

    const { data, error } = await client
      .from("branches")
      .select("country_code, branch_code")
      .order("country_code", { ascending: true })
      .order("branch_code", { ascending: true });

    if (error) return status("branches blocked: " + error.message, true);

    ddl.innerHTML = "";
    (data || []).forEach(b => {
      const opt = document.createElement("option");
      opt.value = b.branch_code;
      opt.textContent = `${b.country_code} - ${b.branch_code}`;
      ddl.appendChild(opt);
    });
  }

  async function loadDefaultBranchFromProfile() {
    const { data, error } = await client
      .from("users")
      .select("branch_code")
      .eq("id", user.id)
      .single();

    if (error) return status("users blocked: " + error.message, true);

    const ddl = $("branch");
    if (ddl && data?.branch_code) ddl.value = data.branch_code;
  }

  async function loadJobs() {
    const tbody = $("jobsTableBody");
    if (!tbody) return status("UI missing #jobsTableBody (wrong index.html).", true);

    const { data, error } = await client
      .from("jobs")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) return status("jobs blocked: " + error.message, true);

    tbody.innerHTML = "";
    (data || []).forEach(job => {
      const tr = document.createElement("tr");
      const jid = job.job_id ?? job.id ?? null;
      const jno = job.job_no ?? "";

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
        currentJobId = jid;
        setCurrentJob(jno);
        loadCharges();
      }, true);

      tbody.appendChild(tr);
    });
  }

  async function createJob() {
    status("Creating job...");
    const payload = {
      p_country_code: ($("country")?.value || "").trim(),
      p_branch_code: ($("branch")?.value || "").trim(),
      p_transport_mode: ($("transport_mode")?.value || "").trim(),
      p_job_type: ($("job_type")?.value || "").trim(),
      p_customer_name: ($("customer")?.value || "").trim()
    };

    const { data, error } = await client.rpc("create_job", payload);
    if (error) return status("Create job failed: " + error.message, true);

    status("Job created: " + (data?.job_no || "OK"));
    await loadJobs();
  }

  async function loadCharges() {
    const tbody = $("chargesTableBody");
    if (!tbody) return;

    if (!currentJobId) {
      tbody.innerHTML = "";
      return status("Select a job to load charges.", true);
    }

    status("Loading charges...");
    const { data, error } = await client
      .from("charges")
      .select("*")
      .eq("job_id", currentJobId)
      .order("created_at", { ascending: false });

    if (error) return status("Charges blocked: " + error.message, true);

    tbody.innerHTML = "";
    (data || []).forEach(c => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${c.charge_code ?? ""}</td>
        <td>${c.amount ?? ""}</td>
        <td>${c.currency ?? ""}</td>
        <td>${c.type ?? ""}</td>
      `;
      tbody.appendChild(tr);
    });

    status("Charges loaded.");
  }

  async function addCharge() {
    if (!currentJobId) return status("Select a job first.", true);

    const charge_code = ($("charge_code")?.value || "").trim();
    const amount = parseFloat(($("amount")?.value || "").trim());
    const currency = ($("currency")?.value || "").trim();
    const type = ($("charge_type")?.value || "").trim();

    if (!charge_code || !currency || !type || !Number.isFinite(amount)) {
      return status("Invalid charge fields.", true);
    }

    status("Adding charge...");
    const { error } = await client.from("charges").insert([{
      job_id: currentJobId, charge_code, amount, currency, type
    }]);

    if (error) return status("Add charge failed: " + error.message, true);

    status("Charge added.");
    await loadCharges();
  }

  async function afterLogin() {
    status("Loading data...");
    await loadBranches();
    await loadDefaultBranchFromProfile();
    await loadJobs();
    status("✅ Logged in and data loaded.");
  }

  function wire() {
    // Menlo/SafeView proof: pointerdown capture
    document.addEventListener("pointerdown", (e) => {
      const btn = e.target?.closest ? e.target.closest("button") : null;
      if (!btn) return;

      switch (btn.id) {
        case "btnLogin": e.preventDefault(); signIn(); break;
        case "btnLogout": e.preventDefault(); signOut(); break;
        case "btnCreateJob": e.preventDefault(); createJob(); break;
        case "btnRefreshJobs": e.preventDefault(); loadJobs(); break;
        case "btnRefreshCharges": e.preventDefault(); loadCharges(); break;
        case "btnAddCharge": e.preventDefault(); addCharge(); break;
      }
    }, true);

    document.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !user) { e.preventDefault(); signIn(); }
    });

    // Debug helpers
    window.__cw_ping = () => console.log(BUILD);
    window.__cw_session = async () => client.auth.getSession().then(r => (console.log(r.data.session), r));
  }

  document.addEventListener("DOMContentLoaded", async () => {
    await initSupabase();
    if (!client) return;
    wire();
    await restoreSession();
  });
})();
