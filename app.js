// ===============================
// Freight PRD POC - app.js (NO CDN)
// Uses REST directly: /auth/v1 + /rest/v1
// ===============================

// Your Supabase config
const SUPABASE_URL = "https://quzputmmabgcfmegarvd.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_UG9E0FbUzetadkz8TQN2fg_pIWx3LTO";

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

// Storage keys
const LS_ACCESS = "sb_access_token";
const LS_REFRESH = "sb_refresh_token";
const LS_USER = "sb_user_json";
const LS_PROFILE = "sb_profile_json";

let currentProfile = null;

function setAuthStatus(msg) { authMsg.textContent = msg || ""; }
function setAuthError(msg)  { authErr.textContent = msg || ""; }
function setJobStatus(msg)  { jobMsg.textContent = msg || ""; }
function setJobError(msg)   { jobErr.textContent = msg || ""; }

function getAccessToken() { return localStorage.getItem(LS_ACCESS) || ""; }
function getRefreshToken() { return localStorage.getItem(LS_REFRESH) || ""; }
function getUser() {
  try { return JSON.parse(localStorage.getItem(LS_USER) || "null"); } catch { return null; }
}
function setSession({ access_token, refresh_token, user }) {
  localStorage.setItem(LS_ACCESS, access_token || "");
  localStorage.setItem(LS_REFRESH, refresh_token || "");
  localStorage.setItem(LS_USER, JSON.stringify(user || null));
}
function clearSession() {
  localStorage.removeItem(LS_ACCESS);
  localStorage.removeItem(LS_REFRESH);
  localStorage.removeItem(LS_USER);
  localStorage.removeItem(LS_PROFILE);
  currentProfile = null;
}

async function apiFetch(path, { method = "GET", token = "", headers = {}, body = null } = {}) {
  const url = `${SUPABASE_URL}${path}`;
  const h = {
    "apikey": SUPABASE_ANON_KEY,
    ...headers,
  };
  if (token) h["Authorization"] = `Bearer ${token}`;

  const res = await fetch(url, {
    method,
    headers: h,
    body: body ? JSON.stringify(body) : null,
  });

  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }

  if (!res.ok) {
    const msg = (json && (json.error_description || json.msg || json.message || json.error)) || text || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return json;
}

// Auth: password login via REST (/auth/v1) 【4-05ab6a】【5-0ba29c】
async function loginWithPassword(email, password) {
  // GoTrue password grant
  return apiFetch(`/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: { email, password },
  });
}

async function refreshAccessTokenIfNeeded() {
  const access = getAccessToken();
  if (access) return access;

  const refresh = getRefreshToken();
  if (!refresh) return "";

  // refresh_token grant
  const data = await apiFetch(`/auth/v1/token?grant_type=refresh_token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: { refresh_token: refresh },
  });

  setSession({
    access_token: data.access_token,
    refresh_token: data.refresh_token,
    user: data.user,
  });

  return data.access_token || "";
}

// Data REST API (/rest/v1) 【3-5b3461】【1-78001c】
async function loadProfile() {
  const user = getUser();
  if (!user?.id) throw new Error("No user in session.");

  const token = await refreshAccessTokenIfNeeded();
  if (!token) throw new Error("No access token.");

  const rows = await apiFetch(`/rest/v1/profiles?id=eq.${encodeURIComponent(user.id)}&select=branch_code,role`, {
    method: "GET",
    token,
    headers: { "Accept": "application/json" },
  });

  if (!rows || rows.length === 0) {
    throw new Error(`Profile not found for user id: ${user.id}`);
  }

  currentProfile = rows[0];
  localStorage.setItem(LS_PROFILE, JSON.stringify(currentProfile));
  return currentProfile;
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

async function loadJobs() {
  setJobError("");
  setJobStatus("Loading jobs...");

  const token = await refreshAccessTokenIfNeeded();
  if (!token) throw new Error("No access token.");

  const rows = await apiFetch(`/rest/v1/jobs?select=job_no,branch_code,status,created_at&order=created_at.desc&limit=50`, {
    method: "GET",
    token,
    headers: { "Accept": "application/json" },
  });

  renderJobs(rows);
  setJobStatus(`Loaded ${rows.length} jobs.`);
}

async function createJob(jobNo) {
  const user = getUser();
  const token = await refreshAccessTokenIfNeeded();
  if (!token) throw new Error("No access token.");

  if (!currentProfile?.branch_code) throw new Error("No branch in profile.");

  await apiFetch(`/rest/v1/jobs`, {
    method: "POST",
    token,
    headers: {
      "Content-Type": "application/json",
      "Prefer": "return=representation",
    },
    body: [{
      job_no: jobNo,
      branch_code: currentProfile.branch_code,
      status: "CREATED",
      created_by: user?.id || null,
    }],
  });
}

async function refreshUI() {
  setAuthError("");
  setJobError("");

  const user = getUser();
  const token = await refreshAccessTokenIfNeeded();

  if (user && token) {
    // Logged in
    btnLogin.style.display = "none";
    btnLogout.style.display = "inline-block";
    appCard.style.display = "block";

    setAuthStatus("Session active.");
    userLabel.textContent = user.email ? `Logged in as: ${user.email}` : `User ID: ${user.id}`;

    try {
      const profile = await loadProfile();
      branchLabel.textContent = `${profile.branch_code} (${profile.role})`;
      await loadJobs();
    } catch (e) {
      branchLabel.textContent = "-";
      setJobStatus("");
      setJobError(String(e.message || e));
    }
  } else {
    // Logged out
    btnLogin.style.display = "inline-block";
    btnLogout.style.display = "none";
    appCard.style.display = "none";

    branchLabel.textContent = "-";
    userLabel.textContent = "-";
    setAuthStatus("Not logged in.");
    setJobStatus("");
    jobTable.innerHTML = "";
  }
}

// Events
btnLogin.addEventListener("click", async () => {
  setAuthError("");
  setAuthStatus("Logging in...");

  const email = (emailEl.value || "").trim();
  const password = passwordEl.value || "";

  if (!email || !password) {
    setAuthStatus("");
    setAuthError("Please enter email + password.");
    return;
  }

  try {
    const data = await loginWithPassword(email, password);
    setSession({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      user: data.user,
    });
    setAuthStatus("Login success.");
    await refreshUI();
  } catch (e) {
    setAuthStatus("");
    setAuthError("Login failed: " + String(e.message || e));
  }
});

btnLogout.addEventListener("click", async () => {
  clearSession();
  setAuthStatus("Logged out.");
  await refreshUI();
});

btnRefresh.addEventListener("click", async () => {
  try { await loadJobs(); } catch (e) { setJobError(String(e.message || e)); }
});

btnCreate.addEventListener("click", async () => {
  setJobError("");
  setJobStatus("");

  const jobNo = (jobNoEl.value || "").trim();
  if (!jobNo) { setJobError("Please enter a Job No."); return; }

  try {
    await createJob(jobNo);
    setJobStatus("Job created: " + jobNo);
    jobNoEl.value = "";
    await loadJobs();
  } catch (e) {
    setJobError(String(e.message || e));
  }
});

// Init
(async () => {
  setAuthStatus("App loaded.");
  await refreshUI();
})();
