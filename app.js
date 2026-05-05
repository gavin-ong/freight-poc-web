// ===============================
// Freight PRD POC - app.js (FULL)
// ===============================

const SUPABASE_URL = "https://quzputmmabgcfmegarvd.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_UG9E0FbUzetadkz8TQN2fg_pIWx3LTO";

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// UI elements
const authMsg = document.getElementById("authMsg");
const authErr = document.getElementById("authErr");
const jobMsg  = document.getElementById("jobMsg");
const jobErr  = document.getElementById("jobErr");

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

function setAuthStatus(msg) { authMsg.textContent = msg || ""; }
function setAuthError(msg)  { authErr.textContent = msg || ""; }
function setJobStatus(msg)  { jobMsg.textContent = msg || ""; }
function setJobError(msg)   { jobErr.textContent = msg || ""; }

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
  setJobError("");
  setJobStatus("Loading profile + jobs...");

  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr) { setJobError("Failed to get user: " + userErr.message); return; }
  const user = userData?.user;
  if (!user) { setJobError("No active user session."); return; }

  userLabel.textContent = user.email ? `Logged in as: ${user.email}` : `User ID: ${user.id}`;

  const { data: profile, error: pErr } = await supabase
    .from("profiles")
    .select("branch_code, role")
    .eq("id", user.id)
    .single();

  if (pErr) {
    currentBranch = null;
    branchLabel.textContent = "-";
    setJobStatus("");
    setJobError("Profile not found. Create profiles row.\nError: " + pErr.message + "\nUser ID: " + user.id);
    return;
  }

  currentBranch = profile.branch_code;
  branchLabel.textContent = `${profile.branch_code} (${profile.role})`;

  const { data: jobs, error: jErr } = await supabase
    .from("jobs")
    .select("job_no, branch_code, status, created_at")
    .order("created_at", { ascending: false })
    .limit(50);

  if (jErr) { setJobError("Failed to load jobs: " + jErr.message); setJobStatus(""); return; }

  renderJobs(jobs);
  setJobStatus(`Loaded ${jobs.length} jobs.`);
}

async function refreshUI() {
  setAuthError("");
  setJobError("");

  const { data: sessionData, error: sErr } = await supabase.auth.getSession();
  if (sErr) { setAuthError("Failed to get session: " + sErr.message); return; }

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

btnLogin.addEventListener("click", async () => {
  setAuthError("");
  setAuthStatus("Logging in...");

  const email = (emailEl.value || "").trim();
  const password = passwordEl.value || "";
  if (!email || !password) { setAuthStatus(""); setAuthError("Please enter email + password."); return; }

  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) { setAuthStatus(""); setAuthError("Login failed: " + error.message); return; }

  setAuthStatus("Login success.");
  await refreshUI();
});

btnLogout.addEventListener("click", async () => {
  const { error } = await supabase.auth.signOut();
  if (error) { setAuthError("Logout failed: " + error.message); return; }
  setAuthStatus("Logged out.");
  await refreshUI();
});

btnCreate.addEventListener("click", async () => {
  setJobError("");
  setJobStatus("");

  if (!currentBranch) { setJobError("No branch found. Insert profiles row first."); return; }

  const jobNo = (jobNoEl.value || "").trim();
  if (!jobNo) { setJobError("Please enter a Job No."); return; }

  const { data: userData } = await supabase.auth.getUser();
  const user = userData?.user;

  const { error } = await supabase.from("jobs").insert([{
    job_no: jobNo,
    branch_code: currentBranch,
    status: "CREATED",
    created_by: user?.id
  }]);

  if (error) { setJobError("Create failed: " + error.message); return; }

  setJobStatus("Job created: " + jobNo);
  jobNoEl.value = "";
  await loadProfileAndJobs();
});

btnRefresh.addEventListener("click", loadProfileAndJobs);

supabase.auth.onAuthStateChange(() => {
  refreshUI();
});

(async () => {
  await refreshUI();
})();
