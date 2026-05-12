const SUPABASE_URL = "https://quzputmmabgcfmegarvd.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_UG9E0FbUzetadkz8TQN2fg_pIWx3LTO";

const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;

// branch_key -> { name, tz }
let branchMap = {};

function setStatus(msg) {
  const el = document.getElementById("loginStatus");
  if (el) el.textContent = msg;
}

/** Health check */
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

/** Safe timezone formatter */
function formatInTimezone(isoUtc, tz) {
  try {
    return new Date(isoUtc).toLocaleString("en-SG", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false
    });
  } catch (e) {
    return new Date(isoUtc).toLocaleString("en-SG");
  }
}

function setBranchDropdownState(text, disabled = true) {
  const ddl = document.getElementById("branchKey");
  ddl.innerHTML = "";
  const opt = document.createElement("option");
  opt.value = "";
  opt.textContent = text;
  ddl.appendChild(opt);
  ddl.disabled = disabled;
}

/** Sort dropdown by Country+Branch (branch_key) */
function populateBranchDropdown() {
  const ddl = document.getElementById("branchKey");
  ddl.innerHTML = "";

  const keys = Object.keys(branchMap).sort((a, b) => {
    const ak = (a || "").toUpperCase();
    const bk = (b || "").toUpperCase();
    if (ak < bk) return -1;
    if (ak > bk) return 1;

    const an = (branchMap[a]?.name || "").toUpperCase();
    const bn = (branchMap[b]?.name || "").toUpperCase();
    if (an < bn) return -1;
    if (an > bn) return 1;
    return 0;
  });

  if (keys.length === 0) {
    setBranchDropdownState("No active branches found", true);
    return;
  }

  for (const k of keys) {
    const info = branchMap[k] || {};
    const opt = document.createElement("option");
    opt.value = k;
    opt.textContent = info.name ? `${k} (${info.name})` : k; // keep current style
    ddl.appendChild(opt);
  }

  ddl.disabled = false;
}

/** Load branches from DB */
async function loadBranchesFromDb() {
  const { data, error } = await client
    .from("branches")
    .select("country_code, branch_code, branch_name, time_zone, is_active")
    .eq("is_active", true);

  if (error) {
    console.error("Failed to load branches from DB:", error);

    // fallback
    branchMap = {
      "SGSIN": { name: "Singapore", tz: "Asia/Singapore" },
      "MYKUL": { name: "Kuala Lumpur", tz: "Asia/Kuala_Lumpur" },
      "VNHCM": { name: "Ho Chi Minh", tz: "Asia/Ho_Chi_Minh" }
    };
    populateBranchDropdown();
    return;
  }

  const map = {};
  for (const b of data || []) {
    const key = `${b.country_code || ""}${b.branch_code || ""}`.toUpperCase();
    map[key] = {
      name: b.branch_name || "",
      tz: b.time_zone || "Asia/Singapore"
    };
  }

  branchMap = map;
  populateBranchDropdown();
}

/** Load default branch from profiles for current user */
async function loadUserDefaultBranchKey() {
  if (!currentUser) return null;

  const { data, error } = await client
    .from("profiles")
    .select("default_branch_key")
    .eq("id", currentUser.id)
    .single();

  if (error) {
    console.warn("No profile/default branch found (using fallback SGSIN):", error.message);
    return null;
  }

  const key = (data?.default_branch_key || "").toUpperCase().trim();
  return key || null;
}

/** Apply default branch to dropdown, fallback to SGSIN per your choice (Q2=A) */
function applyDefaultBranchToDropdown(defaultKey) {
  const ddl = document.getElementById("branchKey");
  if (!ddl) return;

  const fallback = "SGSIN";
  const target = (defaultKey || fallback).toUpperCase();

  // Set only if option exists; otherwise fallback to first option (or SGSIN if present)
  const exists = Array.from(ddl.options).some(o => (o.value || "").toUpperCase() === target);

  if (exists) {
    ddl.value = target;
    return;
  }

  // Try fallback SGSIN if default not found
  const hasFallback = Array.from(ddl.options).some(o => (o.value || "").toUpperCase() === fallback);
  if (hasFallback) {
    ddl.value = fallback;
    return;
  }

  // Otherwise just pick first
  if (ddl.options.length > 0) ddl.selectedIndex = 0;
}

window.addEventListener("load", async () => {
  await pingSupabase();
  setBranchDropdownState("Login to load branches…", true);
});

// LOGIN
async function login() {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  const ok = await pingSupabase();
  if (!ok) return alert("Cannot reach Supabase");

  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) return alert("Login failed: " + error.message);

  currentUser = data.user;

  // Load branches
  setBranchDropdownState("Loading branches…", true);
  await loadBranchesFromDb();

  // Apply user default branch from DB
  const defaultBranchKey = await loadUserDefaultBranchKey();
  applyDefaultBranchToDropdown(defaultBranchKey);

  alert("Login success: " + currentUser.email);
  await loadJobs();
}

// CREATE JOB (uses your DB RPC)
async function createJob() {
  if (!currentUser) return alert("Login first");

  const branchKey = document.getElementById("branchKey").value;
  const mode = document.getElementById("mode").value;       // SEA/AIR/LAND/INTEGRATED
  const jobType = document.getElementById("jobType").value; // EXPORT/IMPORT
  const incoterm = document.getElementById("incoterm").value;

  const customer = document.getElementById("customer").value.trim();
  const origin = document.getElementById("origin").value.trim();
  const destination = document.getElementById("destination").value.trim();

  if (!branchKey) return alert("Please select branch");
  if (!customer || !origin || !destination) return alert("Please fill Customer / Origin / Destination");

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
  await loadJobs();
}

// LOAD JOBS
async function loadJobs() {
  const { data, error } = await client
    .from("jobs")
    .select("job_no, customer_name, origin_country, destination_country, transport_mode, job_type, country_code, branch_code, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return alert("Load jobs failed: " + error.message);

  const list = document.getElementById("jobsList");
  list.innerHTML = "";

  for (const job of data || []) {
    const bkey = `${job.country_code || ""}${job.branch_code || ""}`.toUpperCase();
    const tz = (branchMap[bkey] && branchMap[bkey].tz) ? branchMap[bkey].tz : "Asia/Singapore";
    const localTime = formatInTimezone(job.created_at, tz);

    const li = document.createElement("li");
    li.textContent =
      `${job.job_no} | ${job.customer_name} | ${job.origin_country} → ${job.destination_country} | ` +
      `${job.transport_mode}${job.job_type} | Created: ${localTime} (${tz})`;

    list.appendChild(li);
  }
}
