const SUPABASE_URL = "https://quzputmmabgcfmegarvd.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_UG9E0FbUzetadkz8TQN2fg_pIWx3LTO";

const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let currentUser = null;

function setStatus(msg) {
  const el = document.getElementById("loginStatus");
  if (el) el.textContent = msg;
}

async function pingSupabase() {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
      headers: { apikey: SUPABASE_ANON_KEY }
    });
    if (!res.ok) {
      setStatus(`Supabase reachable but health check HTTP ${res.status}`);
      return false;
    }
    setStatus("Supabase reachable ✅");
    return true;
  } catch (e) {
    setStatus("Supabase NOT reachable ❌ (Failed to fetch)");
    return false;
  }
}

window.addEventListener("load", () => {
  pingSupabase();
});

async function login() {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  const ok = await pingSupabase();
  if (!ok) return alert("Cannot reach Supabase");

  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) return alert("Login failed: " + error.message);

  currentUser = data.user;
  alert("Login success: " + currentUser.email);
  loadJobs();
}

async function createJob() {
  if (!currentUser) return alert("Login first");

  const branchKey = document.getElementById("branchKey").value;
  const mode = document.getElementById("mode").value;            // SEA/AIR/LAND/INTEGRATED
  const jobType = document.getElementById("jobType").value;      // EXPORT/IMPORT
  const incoterm = document.getElementById("incoterm").value;

  const customer = document.getElementById("customer").value.trim();
  const origin = document.getElementById("origin").value.trim();
  const destination = document.getElementById("destination").value.trim();

  if (!customer || !origin || !destination) {
    return alert("Please fill Customer / Origin / Destination");
  }

  // DB generates CargoWise job_no safely
  const { data, error } = await client.rpc("create_job", {
    p_branch_key: branchKey,
    p_transport_mode: mode,
    p_job_type: jobType,
    p_customer_name: customer,
    p_origin_country: origin,
    p_destination_country: destination,
    p_incoterm: incoterm
  });

  if (error) return alert("Create job failed: " + error.message);

  alert("Job created: " + data.job_no);
  loadJobs();
}

async function loadJobs() {
  const { data, error } = await client
    .from("jobs")
    .select("job_no, customer_name, origin_country, destination_country, transport_mode, job_type, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return alert("Load jobs failed: " + error.message);

  const list = document.getElementById("jobsList");
  list.innerHTML = "";

  data.forEach(job => {
    const li = document.createElement("li");
    li.textContent =
      `${job.job_no} | ${job.customer_name} | ${job.origin_country} → ${job.destination_country} | ${job.transport_mode}${job.job_type}`;
    list.appendChild(li);
  });
}
