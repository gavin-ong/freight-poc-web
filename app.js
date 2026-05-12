const SUPABASE_URL = "https://quzputmmabgcfmegarvd.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_UG9E0FbUzetadkz8TQN2fg_pIWx3LTO";

const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;

function setStatus(msg) {
  const el = document.getElementById("loginStatus");
  if (el) el.textContent = msg;
}

// TEST CONNECTION
async function pingSupabase() {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
      headers: { apikey: SUPABASE_ANON_KEY }
    });

    if (!res.ok) {
      setStatus("Supabase reachable but returned HTTP " + res.status);
      return false;
    }

    setStatus("Supabase reachable ✅");
    return true;

  } catch (e) {
    setStatus("Supabase NOT reachable ❌");
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
    alert("Cannot reach Supabase");
    return;
  }

  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });

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
  if (!currentUser) {
    alert("Login first");
    return;
  }

  const customer = document.getElementById("customer").value;
  const origin = document.getElementById("origin").value;
  const destination = document.getElementById("destination").value;
  const mode = document.getElementById("mode").value;
  const incoterm = document.getElementById("incoterm").value;

  const { error } = await client.from("jobs").insert([{
    customer_name: customer,
    origin_country: origin,
    destination_country: destination,
    mode: mode,
    incoterm: incoterm,
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
    alert(error.message);
    return;
  }

  const list = document.getElementById("jobsList");
  list.innerHTML = "";

  data.forEach(job => {
    const li = document.createElement("li");
    li.innerText =
      "JOB-" + job.job_no +
      " | " + job.customer_name +
      " | " + job.origin_country + " → " + job.destination_country +
      " | " + job.mode;

    list.appendChild(li);
  });
}
