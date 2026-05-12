// ✅ Replace these 2 values with your Supabase Project URL + anon key
const SUPABASE_URL = "https://YOUR_PROJECT_ID.supabase.co";
const SUPABASE_ANON_KEY = "YOUR_ANON_KEY";

// Basic validation - if you forgot to replace, it will scream immediately
if (!SUPABASE_URL.includes("supabase.co") || SUPABASE_ANON_KEY === "YOUR_ANON_KEY") {
  alert("Supabase URL / ANON KEY not set in app.js. Update SUPABASE_URL and SUPABASE_ANON_KEY.");
}

const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;

function setStatus(msg) {
  const el = document.getElementById("loginStatus");
  if (el) el.textContent = msg;
}

// ✅ Connectivity test so you immediately know if Supabase is reachable
async function pingSupabase() {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
      headers: {
        apikey: SUPABASE_ANON_KEY
      }
    });

    if (!res.ok) {
      setStatus(`Supabase reachable but health check failed: HTTP ${res.status}`);
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

// LOGIN
async function login() {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  // First check if browser can reach Supabase at all
  const ok = await pingSupabase();
  if (!ok) {
    alert("Login failed: Failed to fetch (browser cannot reach Supabase). Fix URL/key/CORS/network.");
    return;
  }

  try {
    const { data, error } = await client.auth.signInWithPassword({ email, password });

    if (error) {
      alert("Login failed: " + error.message);
      return;
    }

    currentUser = data.user;
    alert("Login success: " + currentUser.email);
    loadJobs();

  } catch (e) {
    // This catches true Fetch/CORS/network failures
    alert("Login failed: Failed to fetch");
  }
}

// CREATE JOB
async function createJob() {
  if (!currentUser) {
    alert("Login first");
    return;
  }

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

  if (error) {
    alert("Create job failed: " + error.message);
    return;
  }

  alert("Job created successfully");
  loadJobs();
}

// LOAD JOBS
async function loadJobs() {
  const { data, error } = await client
    .from("jobs")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    alert("Load jobs failed: " + error.message);
    return;
  }

  const list = document.getElementById("jobsList");
  list.innerHTML = "";

  data.forEach(job => {
    const li = document.createElement("li");
    li.textContent = `JOB-${job.job_no} | ${job.customer_name || ""} | ${job.origin_country || ""} → ${job.destination_country || ""} | ${job.mode || ""}`;
    list.appendChild(li);
  });
}
