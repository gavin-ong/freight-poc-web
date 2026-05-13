(function () {
  const SUPABASE_URL = "https://quzputmmabgcfmegarvd.supabase.co";
  const SUPABASE_KEY = "sb_publishable_UG9E0FbUzetadkz8TQN2fg_pIWx3LTO";
  const SUPABASE_CDN = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
  const BUILD = "BUILD: FREIGHT-MVP-7 (JS) charges extended cols";

  let client = null;
  let user = null;
  let currentJobId = null; // HARD-LOCK: jobs PK is job_id UUID

  const $ = (id) => document.getElementById(id);

  // ---------- OPS STATUS ----------
  function ensureOpsStatus() {
    const appCard = $("appCard");
    if (!appCard) return;
    const body = appCard.querySelector(".body") || appCard;

    if (!$("opsStatus")) {
      const s = document.createElement("div");
      s.id = "opsStatus";
      s.style.margin = "10px 0";
      s.style.padding = "10px 12px";
      s.style.borderRadius = "12px";
      s.style.border = "1px solid rgba(255,255,255,.12)";
      s.style.background = "rgba(255,255,255,.06)";
      s.style.fontSize = "12px";
      s.style.wordBreak = "break-word";
      s.style.color = "#9fffb0";
      body.insertBefore(s, body.firstChild);
      s.textContent = "Ready.";
    }
  }

  function status(msg, isErr = false) {
    ensureOpsStatus();
    const el = $("opsStatus");
    if (el) {
      el.textContent = msg;
      el.style.color = isErr ? "#ff7b7b" : "#9fffb0";
    }
    console.log(msg);
  }

  function hardError(msg, errObj) {
    status("❌ " + msg, true);
    alert("❌ " + msg);
    if (errObj) console.error(errObj);
  }

  // ---------- UI ----------
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

  // ---------- Load Supabase ----------
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

  // ---------- Auth ----------
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
    showApp(false);
    status("Ready.");
  }

  async function restoreSession() {
    status("Checking session...");
    const { data, error } = await client.auth.getSession();
    if (error) return hardError("Session error: " + error.message, error);

    if (data?.session?.user) {
      user = data.session.user;
      showApp(true);
      await afterLogin();
    } else {
      showApp(false);
      status("Ready.");
    }
  }

  // ---------- Branches ----------
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
      const country = (b.country_code || "").trim().toUpperCase();
      const branch = (b.branch_code || "").trim().toUpperCase();

      const opt = document.createElement("option");
      opt.value = branch; // SIN / KUL etc (as per your definition)
      opt.dataset.country = country;
      opt.textContent = `${country} - ${branch}`;
      ddl.appendChild(opt);
    });
  }

  // If user profile stores SGSIN, map to SIN
  async function loadDefaultBranchFromProfile() {
    const { data, error } = await client
      .from("users")
      .select("branch_code")
      .eq("id", user.id)
      .single();

    if (error) return hardError("users blocked: " + error.message, error);

    const ddl = $("branch");
    if (!ddl || !data?.branch_code) return;

    const saved = String(data.branch_code).toUpperCase().trim();
    ddl.value = saved.length > 3 ? saved.slice(-3) : saved;
  }

  function getBranchContext() {
    const ddl = $("branch");
    const opt = ddl?.options?.[ddl.selectedIndex];
    return {
      branch_key: (ddl?.value || "").trim().toUpperCase(),                 // SIN / KUL...
      country_code: (opt?.dataset?.country || "SG").trim().toUpperCase()   // SG / MY...
    };
  }

  // ---------- Jobs ----------
  async function loadJobs() {
    const tbody = $("jobsTableBody");
    if (!tbody) return hardError("UI missing jobsTableBody.");

    status("Loading jobs...");
    const { data, error } = await client
      .from("jobs")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) return hardError("jobs blocked: " + error.message, error);

    tbody.innerHTML = "";
    (data || []).forEach(job => {
      // HARD-LOCK: job_id exists
      const jid = job.job_id;
      if (!jid) return;

      const tr = document.createElement("tr");
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
        setCurrentJob(job.job_no ?? "");
        loadCharges();
      }, true);

      tbody.appendChild(tr);
    });

    status(`Jobs loaded (${(data || []).length}).`);
  }

  // Your RPC signature:
  // create_job(p_branch_key, p_transport_mode, p_job_type, p_customer_name, p_origin_country, p_destination_country, p_incoterm)
  async function createJob() {
    if (!user) return hardError("Not logged in.");

    const ctx = getBranchContext();
    const transportMode = ($("transport_mode")?.value || "").trim();
    const jobType = ($("job_type")?.value || "").trim();
    const customerName = ($("customer")?.value || "").trim();

    const originCountry = (($("country")?.value || "").trim().toUpperCase().slice(0, 2)) || ctx.country_code;
    const destinationCountry = "SG";
    const incoterm = "FOB";

    status(`Creating job... (branch_key=${ctx.branch_key}, origin=${originCountry})`);

    const { error } = await client.rpc("create_job", {
      p_branch_key: ctx.branch_key,
      p_transport_mode: transportMode,
      p_job_type: jobType,
      p_customer_name: customerName,
      p_origin_country: originCountry,
      p_destination_country: destinationCountry,
      p_incoterm: incoterm
    });

    if (error) return hardError("Create job failed: " + error.message, error);

    status("✅ Job created. Refreshing jobs...");
    await loadJobs();
  }

  // ---------- Charges ----------
  async function loadCharges() {
    const tbody = $("chargesTableBody");
    if (!tbody) return;

    if (!currentJobId) {
      tbody.innerHTML = "";
      return hardError("Select a job row first (Current Job must not be None).");
    }

    status("Loading charges...");
    const { data, error } = await client
      .from("charges")
      .select("*")
      .eq("job_id", currentJobId) // confirmed correct
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

    status(`Charges loaded (${(data || []).length}).`);
  }

  async function addCharge() {
    if (!currentJobId) return hardError("Select a job row first (Current Job must not be None).");

    const charge_code = ($("charge_code")?.value || "").trim();
    const amount = parseFloat(($("amount")?.value || "").trim());
    const currency = ($("currency")?.value || "").trim().toUpperCase();
    const type = ($("charge_type")?.value || "").trim().toUpperCase();

    // Optional extended fields if you later add UI inputs (won't break if missing)
    const description = ($("description")?.value || "").trim(); // optional input id="description"
    const qty = parseFloat(($("qty")?.value || "1").trim());     // optional input id="qty"
    const uom = ($("uom")?.value || "EA").trim().toUpperCase();  // optional input id="uom"
    const rate = parseFloat(($("rate")?.value || "").trim());    // optional input id="rate"

    if (!charge_code || !currency || !type || !Number.isFinite(amount)) {
      return hardError("Invalid charge fields (code/amount/currency/type).");
    }

    // Defaults for extended columns if no UI fields supplied
    const finalQty = Number.isFinite(qty) && qty > 0 ? qty : 1;
    const finalRate = Number.isFinite(rate) ? rate : amount; // MVP default

    status("Adding charge...");

    const { error } = await client.from("charges").insert([{
      job_id: currentJobId,
      charge_code,
      amount,
      currency,
      type,
      description: description || "",
      qty: finalQty,
      uom: uom || "EA",
      rate: finalRate
    }]);

    if (error) return hardError("Add charge failed: " + error.message, error);

    status("✅ Charge added. Refreshing charges...");
    await loadCharges();
  }

  // ---------- After Login ----------
  async function afterLogin() {
    ensureOpsStatus();
    status("Loading data...");
    await loadBranches();
    await loadDefaultBranchFromProfile();
    await loadJobs();
    status("✅ Logged in and data loaded.");
  }

  // ---------- Wiring ----------
  function bindHard(id, fn) {
    const el = $(id);
    if (!el || !el.parentNode) return;
    const clone = el.cloneNode(true);
    el.parentNode.replaceChild(clone, el);
    clone.addEventListener("pointerdown", (e) => { e.preventDefault(); fn(); }, true);
    clone.addEventListener("click", (e) => { e.preventDefault(); fn(); }, true);
  }

  function wire() {
    bindHard("btnLogin", signIn);
    bindHard("btnLogout", signOut);
    bindHard("btnCreateJob", createJob);
    bindHard("btnRefreshJobs", loadJobs);
    bindHard("btnAddCharge", addCharge);
    bindHard("btnRefreshCharges", loadCharges);
  }

  // ---------- Init ----------
  document.addEventListener("DOMContentLoaded", async () => {
    ensureOpsStatus();
    await initSupabase();
    if (!client) return;
    wire();
    await restoreSession();
  });
})();
