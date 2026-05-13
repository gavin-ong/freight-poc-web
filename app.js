// ===============================
// SUPABASE CONFIG (YOUR KEYS)
// ===============================
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm";

const supabaseUrl = "https://quzputmmabgcfmegarvd.supabase.co";
const supabaseKey = "sb_publishable_UG9E0FbUzetadkz8TQN2fg_pIWx3LTO";
const supabase = createClient(supabaseUrl, supabaseKey);

// ===============================
// GLOBAL STATE
// ===============================
let currentUser = null;
let userBranch = null;

// ===============================
// AUTH - GET CURRENT USER
// ===============================
async function getCurrentUser() {
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    console.error("Auth error:", error);
    return null;
  }
  return data.user;
}

// ===============================
// LOAD USER PROFILE (branch, role)
// ===============================
async function loadUserProfile() {
  currentUser = await getCurrentUser();
  if (!currentUser) return;

  const { data, error } = await supabase
    .from("users")
    .select("branch_code, role")
    .eq("id", currentUser.id)
    .single();

  if (error) {
    console.error("User profile error:", error);
    return;
  }

  userBranch = data.branch_code;

  // set default branch dropdown
  const branchDropdown = document.getElementById("branch");
  if (branchDropdown && userBranch) {
    branchDropdown.value = userBranch;
  }
}

// ===============================
// LOAD BRANCHES (AUTOLOAD + SORT)
// ===============================
async function loadBranches() {
  const { data, error } = await supabase
    .from("branches")
    .select("country_code, branch_code")
    .order("country_code", { ascending: true })
    .order("branch_code", { ascending: true });

  if (error) {
    console.error("Branch load error:", error);
    return;
  }

  const dropdown = document.getElementById("branch");
  if (!dropdown) return;

  dropdown.innerHTML = "";

  data.forEach((b) => {
    const option = document.createElement("option");
    option.value = b.branch_code;
    option.textContent = `${b.country_code} - ${b.branch_code}`;
    dropdown.appendChild(option);
  });
}

// ===============================
// LOAD JOBS
// ===============================
async function loadJobs() {
  const { data, error } = await supabase
    .from("jobs")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Jobs load error:", error);
    return;
  }

  const table = document.getElementById("jobsTableBody");
  if (!table) return;

  table.innerHTML = "";

  data.forEach((job) => {
    const row = document.createElement("tr");

    row.innerHTML = `
      <td>${job.job_no}</td>
      <td>${job.country_code}</td>
      <td>${job.branch_code}</td>
      <td>${job.transport_mode}</td>
      <td>${job.job_type}</td>
      <td>${job.customer_name || ""}</td>
    `;

    table.appendChild(row);
  });
}

// ===============================
// CREATE JOB (RPC)
// ===============================
async function createJob() {
  const country = document.getElementById("country").value;
  const branch = document.getElementById("branch").value;
  const transport = document.getElementById("transport_mode").value;
  const jobType = document.getElementById("job_type").value;
  const customer = document.getElementById("customer").value;

  const { data, error } = await supabase.rpc("create_job", {
    p_country_code: country,
    p_branch_code: branch,
    p_transport_mode: transport,
    p_job_type: jobType,
    p_customer_name: customer
  });

  if (error) {
    alert("Create job failed: " + error.message);
    console.error(error);
    return;
  }

  alert("Job Created: " + data.job_no);
  loadJobs();
}

// ===============================
// LOAD CHARGES (BY JOB)
// ===============================
async function loadCharges(job_id) {
  const { data, error } = await supabase
    .from("charges")
    .select("*")
    .eq("job_id", job_id);

  if (error) {
    console.error("Charges load error:", error);
    return;
  }

  const table = document.getElementById("chargesTableBody");
  if (!table) return;

  table.innerHTML = "";

  data.forEach((c) => {
    const row = document.createElement("tr");

    row.innerHTML = `
      <td>${c.charge_code}</td>
      <td>${c.amount}</td>
      <td>${c.currency}</td>
      <td>${c.type}</td>
    `;

    table.appendChild(row);
  });
}

// ===============================
// ADD CHARGE (MULTI CURRENCY SAFE)
// ===============================
async function addCharge(job_id) {
  const chargeCode = document.getElementById("charge_code").value;
  const amount = parseFloat(document.getElementById("amount").value);
  const currency = document.getElementById("currency").value;
  const type = document.getElementById("charge_type").value;

  const { error } = await supabase.from("charges").insert([
    {
      job_id: job_id,
      charge_code: chargeCode,
      amount: amount,
      currency: currency,
      type: type
    }
  ]);

  if (error) {
    alert("Charge insert failed: " + error.message);
    console.error(error);
    return;
  }

  loadCharges(job_id);
}

// ===============================
// INIT APP
// ===============================
async function init() {
  await loadBranches();
  await loadUserProfile();
  await loadJobs();
}

init();

// ===============================
// EXPOSE FUNCTIONS TO HTML
// ===============================
window.createJob = createJob;
window.addCharge = addCharge;
``
