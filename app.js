(function () {
  // ================= // SUPABASE CONFIG (YOUR VALUES)  // ===============================
  // ===============================
  const SUPABASE_URL = "https://quzputmmabgcfmegarvd.supabase.co";
  const SUPABASE_KEY = "sb_publishable_UG9E0FbUzetadkz8TQN2fg_pIWx3LTO";
  const SUPABASE_CDN = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
  const BUILD = "BUILD: FREIGHT-MVP-2 (JS)";

  let client = null;
  let user = null;
  let currentJobId = null;

  const $ = (id) => document.getElementById(id);

  // ===============================
  // UI HELPERS (VISIBLE IN OPS)
  // ===============================
  function ensureOpsStatus() {
    // ensure there's a status box inside appCard, so you can SEE errors after login
    const appCard = $("appCard");
    if (!appCard) return;

    if (!$("opsStatus")) {
      const div = document.createElement("div");
      div.id = "opsStatus";
      div.style.marginTop = "10px";
      div.style.fontSize = "12px";
      div.style.opacity = "0.95";
      div.style.wordBreak = "break-word";
      div.style.color = "#9fffb0";

      // insert near top of appCard body
      const body = appCard.querySelector(".body") || appCard;
      body.insertBefore(div, body.firstChild);
      div.textContent = "Ready.";
    }
  }

  function status(msg, isErr = false) {
    // show in login card if present
    const loginStatus = $("status");
    if (loginStatus) {
      loginStatus.textContent = msg;
      loginStatus.style.color = isErr ? "#ff7b7b" : "#9fffb0";
    }

    // show in ops too
    ensureOpsStatus();
    const ops = $("opsStatus");
    if (ops) {
      ops.textContent = msg;
      ops.style.color = isErr ? "#ff7b7b" : "#9fffb0";
    }

    // also console for you (but you said no console reliance)
    console.log(msg);
  }

  function hardError(msg, errObj) {
    status(msg, true);
    alert(msg);
    if (errObj) console.error(errObj);
  }

  function badge(msg, ok = true) {
    const el = $("badge");
    if (!el) return;
    el.textContent = msg;
    el.style.color = ok ? "#9fffb0" : "#ff7b7b";
  }

  function showApp(loggedIn) {
    $("loginCard")?.classList.toggle("hidden", loggedIn);
    $("appCard")?.classList.toggle("hidden", !loggedIn);
    $("btnLogin")?.classList.toggle("hidden", loggedIn);
    $("btnLogout")?.classList.toggle("hidden", !loggedIn);
  }

  function setCurrentJob(jobNo) {
    const el = $("currentJobNo");
    if (el) el.textContent = jobNo || "None";
  }

  // ===============================
  // LOAD SUPABASE LIB
  // ===============================
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
    try {
      console.log(BUILD);
      status("Loading Supabase JS...");
      if (!window.supabase || !window.supabase.createClient) {
        await loadScript(SUPABASE_CDN);
      }
      if (!window.supabase || !window.supabase.createClient) {
        hardError("Supabase library failed to load (CDN blocked).");
        return;
      }
      client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
      status("Ready.");
    } catch (e) {
      hardError("Init crashed: " + (e.message || e), e);
    }
  }

  // ===============================
  // AUTH
  // ===============================
  function creds() {
    return {
      email: ($("email")?.value || "").trim(),
      password: $("password")?.value || ""
    };
  }

  async function signIn() {
    if (!client) return hardError("Supabase not ready yet.");
    const { email, password } = creds();
    if (!email || !password) return hardError("Email/password required.");

    status("Signing in...");
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (error) return hardError("Login failed: " + error.message, error);

    const s = await client.auth.getSession();
    user = s?.data?.session?.user || data?.user || null;
    if (!user) return hardError("Signed in but no session created.");

    badge("✅ Logged in as: " + (user.email || "(unknown)"), true);
    showApp(true);
    await afterLogin();
  }

  async function signOut() {
    status("Signing out...");
    const { error } = await client.auth.signOut();
    if (error) return hardError("Logout failed: " + error.message, error);

    user = null;
    currentJobId = null;
    setCurrentJob(null);
    badge("Signed out.", true);
    showApp(false);
    status("Ready.");
  }

  async function restoreSession() {
    status("Checking session...");
    const { data, error } = await client.auth.getSession();
    if (error) return hardError("Session error: " + error.message, error);

    if (data?.session?.user) {
      user = data.session.user;
      badge("✅ Logged in as: " + (user.email || "(unknown)"), true);
      showApp(true);
      await afterLogin();
    } else {
      showApp(false);
      status("Ready.");
    }
  }

  // ===============================
  // LOAD BRANCHES
  // ===============================
  async function loadBranches() {
    const ddl = $("branch");
    if (!ddl) return hardError("UI missing branch dropdown.");

    const { data, error } = await client
      .from("branches")
      .select("country_code, branch_code")
      .order("country_code", { ascending: true })
      .order("branch_code", { ascending: true });

    if (error) return hardError("branches blocked: " + error.message, error);

    ddl.innerHTML = "";
    (data || []).forEach(b => {
      const opt = document.createElement("option");
      opt.value = b.branch_code; // we will pass this as p_branch_key for now
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

    if (error) return hardError("users blocked: " + error.message, error);

    const ddl = $("branch");
    if (ddl && data?.branch_code) ddl.value = data.branch_code;
  }

  // ===============================
  // JOBS
  // ===============================
  async function loadJobs() {
    const tbody = $("jobsTableBody");
    if (!tbody) return hardError("UI missing jobs table body.");

    const { data, error } = await client
      .from("jobs")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) return hardError("jobs blocked: " + error.message, error);

    tbody.innerHTML = "";
    (data || []).forEach(job => {
      const tr = document.createElement("tr");
      const jid = job.job_id ?? job.id ?? null;
      const jno = job.job_no ?? "";

      tr.innerHTML = `
        <td>${job.job_no ?? ""}</td>
        <td>${job.country_code ?? job.origin_country ?? ""}</td>
        <td>${job.branch_code ?? job.branch_key ?? ""}</td>
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

  // ✅ FIXED: call create_job with your REAL signature/args
  async function createJob() {
    if (!user) return hardError("Not logged in.");

    const branchKey = ($("branch")?.value || "").trim();           // maps to p_branch_key
    const transportMode = ($("transport_mode")?.value || "").trim(); // maps to p_transport_mode
    const jobType = ($("job_type")?.value || "").trim();             // maps to p_job_type
    const customerName = ($("customer")?.value || "").trim();        // maps to p_customer_name
    const originCountry = ($("country")?.value || "").trim() || "SG"; // maps to p_origin_country

    // For MVP, we’ll set destination_country + incoterm default values.
    // Later we add UI fields for them.
    const destinationCountry = "SG";    // default placeholder
    const incoterm = "FOB";             // default placeholder

    if (!branchKey) return hardError("Branch must be selected.");
    if (!transportMode) return hardError("Transport Mode required.");
    if (!jobType) return hardError("Job Type required.");

    status("Creating job...");

    const { data, error } = await client.rpc("create_job", {
      p_branch_key: branchKey,
      p_transport_mode: transportMode,
      p_job_type: jobType,
      p_customer_name: customerName,
      p_origin_country: originCountry,
      p_destination_country: destinationCountry,
      p_incoterm: incoterm
    });

    if (error) return hardError("Create job failed: " + error.message, error);

    status("✅ Job created. Refreshing list...");
    await loadJobs();
  }

  // ===============================
  // CHARGES (public.charges)
  // ===============================
  async function loadCharges() {
    const tbody = $("chargesTableBody");
    if (!tbody) return;

    if (!currentJobId) {
      tbody.innerHTML = "";
      return status("Select a job first to load charges.", true);
    }

    status("Loading charges...");
    const { data, error } = await client
      .from("charges")
      .select("*")
      .eq("job_id", currentJobId)
      .order("created_at", { ascending: false });

    if (error) return hardError("Charges load failed: " + error.message, error);

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
    if (!currentJobId) return hardError("Select a job first.");

    const charge_code = ($("charge_code")?.value || "").trim();
    const amount = parseFloat(($("amount")?.value || "").trim());
    const currency = ($("currency")?.value || "").trim();
    const type = ($("charge_type")?.value || "").trim();

    if (!charge_code || !currency || !type || !Number.isFinite(amount)) {
      return hardError("Invalid charge fields (code/amount/currency/type).");
    }

    status("Adding charge...");
    const { error } = await client.from("charges").insert([{
      job_id: currentJobId,
      charge_code,
      amount,
      currency,
      type
    }]);

    if (error) return hardError("Add charge failed: " + error.message, error);

    status("✅ Charge added.");
    await loadCharges();
  }

  // ===============================
  // AFTER LOGIN
  // ===============================
  async function afterLogin() {
    ensureOpsStatus();
    status("Loading data...");
    await loadBranches();
    await loadDefaultBranchFromProfile();
    await loadJobs();
    status("✅ Logged in and data loaded.");
  }

  // ===============================
  // WIRE BUTTONS (pointerdown capture)
  // ===============================
  function wire() {
    document.addEventListener("pointerdown", (e) => {
      const btn = e.target?.closest ? e.target.closest("button") : null;
      if (!btn) return;

      switch (btn.id) {
        case "btnLogin": e.preventDefault(); signIn(); break;
        case "btnLogout": e.preventDefault(); signOut(); break;

        case "btnCreateJob": e.preventDefault(); createJob(); break;
        case "btnRefreshJobs": e.preventDefault(); loadJobs(); break;

        case "btnAddCharge": e.preventDefault(); addCharge(); break;
        case "btnRefreshCharges": e.preventDefault(); loadCharges(); break;
      }
    }, true);

    document.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !user) {
        e.preventDefault();
        signIn();
      }
    });
  }

  document.addEventListener("DOMContentLoaded", async () => {
    await initSupabase();
    if (!client) return;
    wire();
    await restoreSession();
  });
})();
