const SUPABASE_URL = "https://quzputmmabgcfmegarvd.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_UG9E0FbUzetadkz8TQN2fg_pIWx3LTO";

const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;

function setStatus(msg) {
  const el = document.getElementById("loginStatus");
  if (el) el.textContent = msg;
}

// Connection test
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

window.addEventListener("load", () => pingSupabase());

// LOGIN
async function login() {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  const ok = await pingSupabase();
  if (!ok) {
    alert("Login blocked: browser cannot reach Supabase (Failed to fetch).");
    return;
  }

  const { data, error } = await client.auth.signInWithPassword({ email, password });

  if (error) {
    alert("Login failed: " + error.message);
    return;
  }

  currentUser = data.user;
  alert("Login success: " + currentUser.email);
  loadJobs();
}

// CREATE JOB
async function createJob() {
  if (!currentUser) return alert("Login first");

  const customer = document.getElementById("customer").value.trim();
  const origin = document.getElementById("origin").value.trim();
  const destination = document.getElementById("destination").value.trim();
  const mode = document.getElementById("mode").value;
  const incoterm = document.getElementById("incoterm").value;

  const { error } = await client.from("jobs").insert([{
    customer_name: customer,
    origin_country: origin,
    destination_country: destination,
    mode,
    incoterm,
    created_by: currentUser.id
  }]);

  if (error) return alert("Create job failed: " + error.message);

  alert("Job created successfully");
  loadJobs();
}

// LOAD JOBS
async function loadJobs() {
  const { data, error } = await client
    .from("jobs")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return alert("Load jobs failed: " + error.message);

  const list = document.getElementById("jobsList");
  list.innerHTML = "";

  data.forEach(job => {
    const li = document.createElement("li");
    li.textContent = `JOB-${job.job_no} | ${job.customer_name || ""} | ${job.origin_country || ""} → ${job.destination_country || ""} | ${job.mode || ""}`;
    list.appendChild(li);
  });
}
