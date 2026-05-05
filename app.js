// ===============================
// Freight PRD POC - app.js
// ===============================

// ✅ Your Supabase config (SAFE in browser: publishable/anon key)
const SUPABASE_URL = "https://quzputmmabgcfmegarvd.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_UG9E0FbUzetadkz8TQN2fg_pIWx3LTO";

// Create client
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// UI elements
const authMsg = document.getElementById("authMsg");
const jobMsg = document.getElementById("jobMsg");

const appCard = document.getElementById("appCard");
const branchLabel = document.getElementById("branchLabel");
const userLabel = document.getElementById("userLabel");
const jobTable = document.getElementById("jobTable");

const emailEl = document.getElementById("email");
const passwordEl = document.getElementById("password");

const btnLogin = document.getElementById("btnLogin");
const btnLogout = document.getElementById("btnLogout");
const btnCreate = document.getElementById("btnCreate");
const btnRefresh = document.getElementById("btnRefresh");
const jobNoEl = document.getElementById("jobNo");

let currentBranch = null;

// Helpers
function setAuthStatus(msg) {
  authMsg.textContent = msg || "";
}

function setJobStatus(msg) {
  jobMsg.textContent = msg || "";
}

function renderJobs(rows) {
  jobTable.innerHTML = "";
  (rows || []).forEach((r) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${r.job_no ?? ""}</td>
      <td>${r.branch_code ?? ""}</td>
      <td>${r.status ?? ""}</td>
      <td>${r.created_at ? new Date(r.created_at).toLocaleString() : ""}</td>
    `;
    jobTable.appendChild(tr);
  });
}

async function loadProfileAndJobs() {
  setJobStatus("Loading profile + jobs...");

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr) {
    setJobStatus("Failed to get user: " + userErr.message);
    return;
  }

  const user = userData?.user;
  if (!user) {
    setJobStatus("No active user session.");
    return;
  }

  userLabel.textContent = user.email ? `Logged in as: ${user.email}` : `User ID: ${user.id}`;

  // Load profile (branch + role)
  const { data: profile, error: pErr } = await supabase
    .from("profiles")
    .select("branch_code, role")
    .eq("id", user.id)
    .single();

  if (pErr) {
    currentBranch = null;
    branchLabel.textContent = "-";
    setJobStatus(
      "Profile not found. Create your profiles row in Supabase. Error: " + pErr.message
    );
    return;
  }

  currentBranch = profile.branch_code;
  branchLabel.textContent = `${profile.branch_code} (${profile.role})`;

  // Load jobs (RLS should filter by branch)
  const { data: jobs, error: jErr } = await supabase
    .from("jobs")
    .select("job_no, branch_code, status, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  if (jErr) {
    setJobStatus("Failed to load jobs: " + jErr.message);
    return;
  }

  renderJobs(jobs);
  setJobStatus(`Loaded ${jobs.length} jobs (RLS filtered).`);
}

async function refreshUI() {
  const { data: sessionData, error: sErr } = await supabase.auth.getSession();
  if (sErr) {
    setAuthStatus("Failed to get session: " + sErr.message);
    return;
  }

  const session = sessionData?.session;

  if (session) {
    btnLogin.style.display = "none";
    btnLogout.style.display = "inline-block";
    appCard.style.display = "block";
    setAuthStatus("Session active.");
    await loadProfileAndJobs();
  } else {
    btnLogin.style.display = "inline-block";
    btnLogout.style.display = "none";
    appCard.style.display = "none";
    branchLabel.textContent = "-";
    userLabel.textContent = "-";
    currentBranch = null;
    setAuthStatus("Not logged in.");
    setJobStatus("");
    jobTable.innerHTML = "";
  }
}

// Events
btnLogin.addEventListener("click", async () => {
  setAuthStatus("Logging in...");

  const email = (emailEl.value || "").trim();
  const password = passwordEl.value || "";

  if (!email || !password) {
    setAuthStatus("Please enter email + password.");
    return;
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    setAuthStatus("Login failed: " + error.message);
    return;
  }

  setAuthStatus("Login success.");
  await refreshUI();
});

btnLogout.addEventListener("click", async () => {
  const { error } = await supabase.auth.signOut();
  if (error) {
    setAuthStatus("Logout failed: " + error.message);
    return;
  }
  setAuthStatus("Logged out.");
  await refreshUI();
});

btnCreate.addEventListener("click", async () => {
  setJobStatus("");

  if (!currentBranch) {
    setJobStatus("No branch found. Insert your profiles row first.");
    return;
  }

  const jobNo = (jobNoEl.value || "").trim();
  if (!jobNo) {
    setJobStatus("Please enter a Job No.");
    return;
  }

  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;

  const { error } = await supabase.from("jobs").insert([
    {
      job_no: jobNo,
      branch_code: currentBranch, // branch locked to profile
      status: "CREATED",
      created_by: user?.id
    }
  ]);

  if (error) {
    setJobStatus("Create failed (RLS may block): " + error.message);
    return;
  }

  setJobStatus("Job created: " + jobNo);
  jobNoEl.value = "";
  await loadProfileAndJobs();
});

btnRefresh.addEventListener("click", loadProfileAndJobs);

// Listen for auth changes
supabase.auth.onAuthStateChange(() => {
  refreshUI();
});

// Init
refreshUI();
