(function () {

  const SUPABASE_URL = "https://quzputmmabgcfmegarvd.supabase.co";
  const SUPABASE_KEY = "sb_publishable_UG9E0FbUzetadkz8TQN2fg_pIWx3LTO";
  const SUPABASE_CDN = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
  const BUILD = "BUILD: FREIGHT-STEP2 (JS)";

  let client = null;
  let user = null;
  let currentJobId = null;

  const $ = (id) => document.getElementById(id);

  function status(msg, isErr = false) {
    console.log(msg);
  }

  function hardError(msg, err) {
    alert(msg);
    console.error(err);
  }

  function setCurrentJob(jobNo) {
    $("currentJobNo").textContent = jobNo || "None";
  }

  function showApp(loggedIn) {
    $("loginCard").classList.toggle("hidden", loggedIn);
    $("appCard").classList.toggle("hidden", !loggedIn);
  }

  function loadScript(src) {
    return new Promise((res) => {
      const s = document.createElement("script");
      s.src = src;
      s.onload = res;
      document.head.appendChild(s);
    });
  }

  async function initSupabase() {
    if (!window.supabase) await loadScript(SUPABASE_CDN);
    client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  }

  async function signIn() {
    const { data, error } = await client.auth.signInWithPassword({
      email: $("email").value,
      password: $("password").value
    });

    if (error) return hardError(error.message);

    user = data.user;
    showApp(true);
    await afterLogin();
  }

  async function restoreSession() {
    const { data } = await client.auth.getSession();
    if (data.session) {
      user = data.session.user;
      showApp(true);
      await afterLogin();
    }
  }

  async function loadBranches() {
    const { data } = await client.from("branches").select("*");
    const ddl = $("branch");
    ddl.innerHTML = "";
    data.forEach(b => {
      const opt = document.createElement("option");
      opt.value = b.branch_code;
      opt.dataset.country = b.country_code;
      opt.textContent = `${b.country_code} - ${b.branch_code}`;
      ddl.appendChild(opt);
    });
  }

  function getBranchContext() {
    const ddl = $("branch");
    const opt = ddl.options[ddl.selectedIndex];
    return {
      branch_key: ddl.value,
      country_code: opt.dataset.country
    };
  }

  async function loadJobs() {
    const { data } = await client.from("jobs").select("*").order("created_at", { ascending: false });

    const tbody = $("jobsTableBody");
    tbody.innerHTML = "";

    data.forEach(job => {
      const tr = document.createElement("tr");

      tr.innerHTML = `
        <td>${job.job_no}</td>
        <td>${job.origin_country || ""}</td>
        <td>${job.branch_code || ""}</td>
        <td>${job.transport_mode}</td>
        <td>${job.job_type}</td>
        <td>${job.customer_name}</td>
      `;

      tr.addEventListener("click", async () => {
        currentJobId = job.job_id;
        setCurrentJob(job.job_no);

        await loadCharges();
        await loadJobDetails(job.job_id); // ✅ NEW
      });

      tbody.appendChild(tr);
    });
  }

  async function createJob() {
    const ctx = getBranchContext();

    await client.rpc("create_job", {
      p_branch_key: ctx.branch_key,
      p_transport_mode: $("transport_mode").value,
      p_job_type: $("job_type").value,
      p_customer_name: $("customer").value,
      p_origin_country: $("country").value || ctx.country_code,
      p_destination_country: "SG",
      p_incoterm: "FOB"
    });

    await loadJobs();
  }

  // =========================
  // ✅ NEW: LOAD JOB DETAILS
  // =========================
  async function loadJobDetails(jobId) {

    const { data, error } = await client
      .from("jobs")
      .select("*")
      .eq("job_id", jobId)
      .single();

    if (error) return hardError("Load job details failed", error);

    $("pol").value = data.pol || "";
    $("pod").value = data.pod || "";
    $("shipper_name").value = data.shipper_name || "";
    $("consignee_name").value = data.consignee_name || "";
    $("incoterm").value = data.incoterm || "";
    $("origin_country").value = data.origin_country || "";
    $("destination_country").value = data.destination_country || "";

  }

  // =========================
  // ✅ NEW: SAVE JOB DETAILS
  // =========================
  async function saveJobDetails() {

    if (!currentJobId) return hardError("No job selected");

    const payload = {
      pol: $("pol").value,
      pod: $("pod").value,
      shipper_name: $("shipper_name").value,
      consignee_name: $("consignee_name").value,
      incoterm: $("incoterm").value,
      origin_country: $("origin_country").value,
      destination_country: $("destination_country").value
    };

    const { error } = await client
      .from("jobs")
      .update(payload)
      .eq("job_id", currentJobId);

    if (error) return hardError("Update failed", error);

    alert("✅ Job updated");

  }

  async function loadCharges() {
    if (!currentJobId) return;

    const { data } = await client
      .from("charges")
      .select("*")
      .eq("job_id", currentJobId);

    const tbody = $("chargesTableBody");
    tbody.innerHTML = "";

    data.forEach(c => {
      const tr = document.createElement("tr");

      tr.innerHTML = `
        <td>${c.charge_code}</td>
        <td>${c.description}</td>
        <td>${c.qty}</td>
        <td>${c.uom}</td>
        <td>${c.rate}</td>
        <td>${c.amount}</td>
        <td>${c.currency}</td>
        <td>${c.type}</td>
      `;

      tbody.appendChild(tr);
    });
  }

  async function addCharge() {

    const qty = parseFloat($("qty").value || 1);
    const rate = parseFloat($("rate").value || 0);
    const amount = rate ? qty * rate : parseFloat($("amount").value);

    await client.from("charges").insert([{
      job_id: currentJobId,
      charge_code: $("charge_code").value,
      description: $("description").value,
      qty,
      uom: $("uom").value,
      rate,
      amount,
      currency: $("currency").value,
      type: $("charge_type").value
    }]);

    await loadCharges();
  }

  function wire() {
    $("btnLogin").onclick = signIn;
    $("btnCreateJob").onclick = createJob;
    $("btnRefreshJobs").onclick = loadJobs;
    $("btnAddCharge").onclick = addCharge;
    $("btnRefreshCharges").onclick = loadCharges;

    // ✅ NEW BUTTON
    $("btnSaveJob").onclick = saveJobDetails;
  }

  async function afterLogin() {
    await loadBranches();
    await loadJobs();
  }

  document.addEventListener("DOMContentLoaded", async () => {
    await initSupabase();
    wire();
    await restoreSession();
  });

})();
