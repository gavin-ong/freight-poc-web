// app.js (ESM) - Production-grade MVP: Jobs + Charges (RPC-only writes)
// Requires index.html contains: <div id="app"></div>
// and window.SUPABASE_URL / window.SUPABASE_ANON_KEY set.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/** =========================
 *  Config
 *  ========================= */
const SUPABASE_URL = window.SUPABASE_URL || "https://quzputmmabgcfmegarvd.supabase.co";
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY || "sb_publishable_UG9E0FbUzetadkz8TQN2fg_pIWx3LTO";

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.error("Missing SUPABASE_URL / SUPABASE_ANON_KEY on window.");
  alert(
    "Missing Supabase config. Set window.SUPABASE_URL and window.SUPABASE_ANON_KEY in index.html."
  );
}

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

// Tables (as per your schema)
const T = Object.freeze({
  branches: "branches",
  user_profiles: "user_profiles",
  jobs: "jobs",
  job_charges: "job_charges",
});

// RPC functions (as per your DB)
const RPC = Object.freeze({
  create_job: "create_job",
  add_charge_to_job: "add_charge_to_job",
});

/** =========================
 *  Utilities
 *  ========================= */
const $ = (sel, root = document) => root.querySelector(sel);

function esc(s) {
  // Proper HTML escaping
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function toUpperTrim(s) {
  return String(s ?? "").trim().toUpperCase();
}

function parseBranchKey(branchKey) {
  // branchKey like "SGSIN" (country 2 + branch rest)
  const v = toUpperTrim(branchKey);
  if (v.length < 4) return { country_code: "", branch_code: "" };
  return { country_code: v.slice(0, 2), branch_code: v.slice(2) };
}

function defaultCurrencyForBranchKey(branchKey) {
  const { country_code } = parseBranchKey(branchKey);
  // Branch-based default currency mapping (MVP; adjust anytime)
  switch (country_code) {
    case "SG":
      return "USD";
    case "MY":
      return "MYR";
    case "CN":
      return "CNY";
    case "BJ":
      return "XOF";
    case "TG":
      return "XOF";
    default:
      return "USD";
  }
}

function numOr(v, fallback = 0) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function moneyAmount(charge) {
  // Prefer DB computed amount; else fallback qty * unit_price
  const amt = charge?.amount;
  if (amt !== null && amt !== undefined) return numOr(amt, 0);
  return numOr(charge?.qty, 0) * numOr(charge?.unit_price, 0);
}

function fmt(n) {
  const x = numOr(n, 0);
  return x.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function nowISO() {
  return new Date().toISOString();
}

function sanitizeCountry2(s) {
  const v = toUpperTrim(s).replace(/[^A-Z]/g, "");
  return v.slice(0, 2);
}

function safeMsg(err) {
  return err?.message || String(err || "Unknown error");
}

async function callRpcWithFallback(fnName, payloadVariants) {
  // Try multiple payload shapes to handle rpc arg naming differences
  let lastError = null;

  for (const payload of payloadVariants) {
    const { data, error } = await supabase.rpc(fnName, payload);
    if (!error) return { data, usedPayload: payload, error: null };

    lastError = error;

    // If error is "function ... does not exist" -> stop immediately
    // If error is "parameter ... not found" -> try next variant
    const msg = (error.message || "").toLowerCase();
    const retryable =
      msg.includes("unknown") ||
      msg.includes("argument") ||
      msg.includes("parameter") ||
      msg.includes("named") ||
      msg.includes("does not exist") ||
      msg.includes("not found");

    // Some "does not exist" errors may be from arg mismatch (named param),
    // still allow fallback, but only if we have variants remaining.
    if (!retryable) break;
  }

  return { data: null, usedPayload: null, error: lastError };
}

/** =========================
 *  App State
 *  ========================= */
const state = {
  session: null,
  user: null,
  profile: null, // from user_profiles
  branches: [],
  selectedBranchKey: "",

  jobs: [],
  selectedJob: null,
  charges: [],
};

const root = $("#app") || document.body;

/** =========================
 *  UI Rendering (single page, 2 views toggle)
 *  ========================= */
function renderShell() {
  root.innerHTML = `
    <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial; padding: 16px; max-width: 1100px; margin: 0 auto;">
      <div style="display:flex; align-items:center; justify-content:space-between; gap:12px;">
        <div>
          <div style="font-size:18px; font-weight:700;">Freight MVP — Jobs + Charges</div>
          <div id="subline" style="color:#666; font-size:12px; margin-top:2px;"></div>
        </div>
        <div style="display:flex; gap:8px; align-items:center;">
          <span id="whoami" style="font-size:12px; color:#444;"></span>
          <button id="btnLogout" style="padding:8px 10px; cursor:pointer;">Logout</button>
        </div>
      </div>

      <hr style="margin:14px 0;" />

      <div id="banner" style="display:none; padding:10px 12px; border-radius:8px; margin-bottom:12px;"></div>

      <!-- Top controls -->
      <div style="display:flex; flex-wrap:wrap; gap:12px; align-items:end; margin-bottom: 10px;">
        <div style="min-width:260px;">
          <label style="display:block; font-size:12px; color:#555; margin-bottom:6px;">Branch</label>
          <select id="branchSelect" style="width:100%; padding:8px;"></select>
        </div>

        <div style="display:flex; gap:8px;">
          <button id="btnRefreshJobs" style="padding:8px 10px; cursor:pointer;">Refresh Jobs</button>
          <button id="btnGoJobs" style="padding:8px 10px; cursor:pointer; display:none;">Back to Jobs</button>
        </div>
      </div>

      <!-- Views -->
      <div id="viewJobs" style="display:block;">
        <div style="display:grid; grid-template-columns: 1.2fr 0.8fr; gap:14px;">
          <!-- Jobs list -->
          <div style="border:1px solid #eee; border-radius:10px; padding:12px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
              <div style="font-weight:700;">Jobs</div>
              <div style="font-size:12px; color:#666;">Showing latest</div>
            </div>
            <div id="jobsList"></div>
          </div>

          <!-- Create job -->
          <div style="border:1px solid #eee; border-radius:10px; padding:12px;">
            <div style="font-weight:700; margin-bottom:10px;">Create Job (RPC)</div>

            <div style="display:grid; gap:10px;">
              <div>
                <label style="display:block; font-size:12px; color:#555; margin-bottom:6px;">Transport Mode</label>
                <select id="inpMode" style="width:100%; padding:8px;">
                  <option value="SEA">SEA</option>
                  <option value="AIR">AIR</option>
                  <option value="LAND">LAND</option>
                  <option value="INTEGRATED">INTEGRATED</option>
                </select>
              </div>

              <div>
                <label style="display:block; font-size:12px; color:#555; margin-bottom:6px;">Job Type</label>
                <select id="inpType" style="width:100%; padding:8px;">
                  <option value="EXPORT">EXPORT</option>
                  <option value="IMPORT">IMPORT</option>
                </select>
              </div>

              <div>
                <label style="display:block; font-size:12px; color:#555; margin-bottom:6px;">Customer Name</label>
                <input id="inpCustomer" style="width:100%; padding:8px;" placeholder="e.g. TEST CUSTOMER" />
              </div>

              <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
                <div>
                  <label style="display:block; font-size:12px; color:#555; margin-bottom:6px;">Origin Country</label>
                  <input id="inpOrigin" style="width:100%; padding:8px;" placeholder="e.g. CN" maxlength="2" />
                </div>
                <div>
                  <label style="display:block; font-size:12px; color:#555; margin-bottom:6px;">Destination Country</label>
                  <input id="inpDest" style="width:100%; padding:8px;" placeholder="e.g. SG" maxlength="2" />
                </div>
              </div>

              <div>
                <label style="display:block; font-size:12px; color:#555; margin-bottom:6px;">Incoterm</label>
                <input id="inpIncoterm" style="width:100%; padding:8px;" placeholder="e.g. FOB" />
              </div>

              <button id="btnCreateJob" style="padding:10px 12px; cursor:pointer; font-weight:700;">Create</button>
              <div style="font-size:12px; color:#666;">Job No generation: DB via <code>${esc(
                RPC.create_job
              )}</code></div>
            </div>
          </div>
        </div>
      </div>

      <div id="viewJobDetail" style="display:none;">
        <div style="border:1px solid #eee; border-radius:10px; padding:12px; margin-bottom:12px;">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
            <div>
              <div id="jobTitle" style="font-weight:800; font-size:16px;">Job</div>
              <div id="jobMeta" style="font-size:12px; color:#666;"></div>
            </div>
            <div style="display:flex; gap:8px; align-items:center;">
              <button id="btnRefreshCharges" style="padding:8px 10px; cursor:pointer;">Refresh Charges</button>
            </div>
          </div>
        </div>

        <div style="display:grid; grid-template-columns: 1.2fr 0.8fr; gap:14px;">
          <!-- Charges List -->
          <div style="border:1px solid #eee; border-radius:10px; padding:12px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
              <div style="font-weight:700;">Charges</div>
              <div id="chargeTotals" style="font-size:12px; color:#666;"></div>
            </div>
            <div id="chargesList"></div>
          </div>

          <!-- Add charge -->
          <div style="border:1px solid #eee; border-radius:10px; padding:12px;">
            <div style="font-weight:700; margin-bottom:10px;">Add Charge (RPC)</div>

            <div style="display:grid; gap:10px;">
              <div>
                <label style="display:block; font-size:12px; color:#555; margin-bottom:6px;">Side</label>
                <select id="inpSide" style="width:100%; padding:8px;">
                  <option value="SELL">SELL</option>
                  <option value="BUY">BUY</option>
                </select>
              </div>

              <div>
                <label style="display:block; font-size:12px; color:#555; margin-bottom:6px;">Charge Code (optional)</label>
                <input id="inpChargeCode" style="width:100%; padding:8px;" placeholder="e.g. FREIGHT" />
              </div>

              <div>
                <label style="display:block; font-size:12px; color:#555; margin-bottom:6px;">Description</label>
                <input id="inpDesc" style="width:100%; padding:8px;" placeholder="e.g. Ocean Freight" />
              </div>

              <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px;">
                <div>
                  <label style="display:block; font-size:12px; color:#555; margin-bottom:6px;">Qty</label>
                  <input id="inpQty" type="number" step="0.01" style="width:100%; padding:8px;" value="1" />
                </div>
                <div>
                  <label style="display:block; font-size:12px; color:#555; margin-bottom:6px;">Unit Price</label>
                  <input id="inpUnit" type="number" step="0.01" style="width:100%; padding:8px;" value="0" />
                </div>
              </div>

              <div>
                <label style="display:block; font-size:12px; color:#555; margin-bottom:6px;">Currency</label>
                <input id="inpCcy" style="width:100%; padding:8px;" />
                <div style="font-size:12px; color:#666; margin-top:6px;">Default: branch-based currency mapping (MVP)</div>
              </div>

              <button id="btnAddCharge" style="padding:10px 12px; cursor:pointer; font-weight:700;">Add</button>
              <div style="font-size:12px; color:#666;">Insert: DB via <code>${esc(
                RPC.add_charge_to_job
              )}</code></div>
            </div>
          </div>
        </div>
      </div>

      <hr style="margin:14px 0;" />
      <div style="font-size:12px; color:#777;">
        <div><b>Status</b>: <span id="statusLine">Initializing...</span></div>
        <div style="margin-top:4px;">Client time: <code>${esc(nowISO())}</code></div>
      </div>
    </div>
  `;

  $("#btnLogout").addEventListener("click", logout);
  $("#btnRefreshJobs").addEventListener("click", () => loadJobs());
  $("#btnGoJobs").addEventListener("click", () => showJobsView());
  $("#btnCreateJob").addEventListener("click", createJobFromForm);

  $("#branchSelect").addEventListener("change", async (e) => {
    state.selectedBranchKey = toUpperTrim(e.target.value);
    localStorage.setItem("selectedBranchKey", state.selectedBranchKey);
    setBanner("info", `Branch selected: ${state.selectedBranchKey}`);
    await loadJobs();

    // Update default charge currency if already on detail view
    const ccy = defaultCurrencyForBranchKey(state.selectedBranchKey);
    const ccyInp = $("#inpCcy");
    if (ccyInp) ccyInp.value = ccy;
  });

  $("#btnRefreshCharges").addEventListener("click", () =>
    loadChargesForSelectedJob()
  );
  $("#btnAddCharge").addEventListener("click", addChargeFromForm);
}

function renderLogin() {
  root.innerHTML = `
    <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial; padding: 16px; max-width: 520px; margin: 0 auto;">
      <div style="font-size:18px; font-weight:800; margin-bottom:8px;">Login</div>
      <div style="font-size:12px; color:#666; margin-bottom:14px;">Supabase Auth (email + password)</div>

      <div id="banner" style="display:none; padding:10px 12px; border-radius:8px; margin-bottom:12px;"></div>

      <div style="display:grid; gap:10px;">
        <div>
          <label style="display:block; font-size:12px; color:#555; margin-bottom:6px;">Email</label>
          <input id="loginEmail" style="width:100%; padding:10px;" placeholder="name@company.com" />
        </div>
        <div>
          <label style="display:block; font-size:12px; color:#555; margin-bottom:6px;">Password</label>
          <input id="loginPass" type="password" style="width:100%; padding:10px;" placeholder="••••••••" />
        </div>
        <button id="btnLogin" style="padding:10px 12px; cursor:pointer; font-weight:700;">Sign in</button>
      </div>

      <div style="margin-top:10px; font-size:12px; color:#777;">
        <div><b>Note:</b> Your RLS policies control what you can read/write.</div>
      </div>
    </div>
  `;

  $("#btnLogin").addEventListener("click", login);
  $("#loginPass").addEventListener("keydown", (e) => {
    if (e.key === "Enter") login();
  });
}

function setBanner(type, msg) {
  const el = $("#banner");
  if (!el) return;
  el.style.display = "block";

  const styles =
    {
      ok: { bg: "#e8fff3", bd: "#b7f1d4", fg: "#0b5" },
      info: { bg: "#eef6ff", bd: "#c9defa", fg: "#237" },
      warn: { bg: "#fff7e6", bd: "#ffe1a3", fg: "#a60" },
      err: { bg: "#ffecec", bd: "#ffc5c5", fg: "#b00" },
    }[type] || { bg: "#eef6ff", bd: "#c9defa", fg: "#237" };

  el.style.background = styles.bg;
  el.style.border = `1px solid ${styles.bd}`;
  el.style.color = styles.fg;
  el.innerHTML = esc(msg);
}

function setStatus(msg) {
  const el = $("#statusLine");
  if (el) el.textContent = msg;
}

/** =========================
 *  Auth
 *  ========================= */
async function login() {
  const email = $("#loginEmail")?.value?.trim();
  const password = $("#loginPass")?.value;

  if (!email || !password) {
    setBanner("warn", "Email and password required.");
    return;
  }

  setBanner("info", "Signing in...");
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    console.error(error);
    setBanner("err", `Login failed: ${safeMsg(error)}`);
    return;
  }

  state.session = data.session;
  state.user = data.session?.user || null;
  setBanner("ok", "Signed in.");
  await bootstrapAfterLogin();
}

async function logout() {
  await supabase.auth.signOut();
  state.session = null;
  state.user = null;
  state.profile = null;
  state.branches = [];
  state.jobs = [];
  state.selectedJob = null;
  state.charges = [];
  renderLogin();
}

supabase.auth.onAuthStateChange(async (_event, session) => {
  state.session = session;
  state.user = session?.user || null;

  if (!state.user) {
    renderLogin();
    return;
  }

  // If already signed in (page refresh), bootstrap
  await bootstrapAfterLogin();
});

/** =========================
 *  Data loading
 *  ========================= */
async function loadProfile() {
  const uid = state.user?.id;
  if (!uid) return null;

  // user_profiles table columns: user_id, email, default_branch_code (branch_key), role, etc.
  const { data, error } = await supabase
    .from(T.user_profiles)
    .select("user_id, email, default_branch_code, role")
    .eq("user_id", uid)
    .maybeSingle();

  if (error) {
    console.error(error);
    setBanner("err", `Failed to load profile (user_profiles): ${safeMsg(error)}`);
    return null;
  }
  return data;
}

async function loadBranches() {
  const { data, error } = await supabase
    .from(T.branches)
    .select(
      "branch_key, country_code, branch_code, branch_name, time_zone, is_active"
    )
    .eq("is_active", true)
    .order("country_code", { ascending: true })
    .order("branch_code", { ascending: true });

  if (error) {
    console.error(error);
    setBanner("err", `Failed to load branches: ${safeMsg(error)}`);
    return [];
  }
  return data || [];
}

async function loadJobs() {
  if (!state.selectedBranchKey) {
    const jl = $("#jobsList");
    if (jl)
      jl.innerHTML = `<div style="color:#666; font-size:12px;">Select a branch to load jobs.</div>`;
    return;
  }

  setStatus("Loading jobs...");
  const { country_code, branch_code } = parseBranchKey(state.selectedBranchKey);

  // Filter by branch in query (even if RLS also filters) - better UX and fewer rows
  const { data, error } = await supabase
    .from(T.jobs)
    .select(
      "job_id, job_no, country_code, branch_code, transport_mode, job_type, customer_name, origin_country, destination_country, incoterm, yymm, running_no, created_at"
    )
    .eq("country_code", country_code)
    .eq("branch_code", branch_code)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    console.error(error);
    setBanner("err", `Failed to load jobs: ${safeMsg(error)}`);
    setStatus("Jobs load failed.");
    return;
  }

  state.jobs = data || [];
  renderJobsList();
  setStatus(`Jobs loaded: ${state.jobs.length}`);
}

async function loadChargesForSelectedJob() {
  const job = state.selectedJob;
  if (!job?.job_id) return;

  setStatus("Loading charges...");
  const { data, error } = await supabase
    .from(T.job_charges)
    .select(
      "charge_id, job_id, side, charge_code, description, qty, unit_price, currency, tax_rate, amount, is_invoiced, invoice_id, created_at"
    )
    .eq("job_id", job.job_id)
    .order("created_at", { ascending: false })
    .limit(300);

  if (error) {
    console.error(error);
    setBanner("err", `Failed to load charges: ${safeMsg(error)}`);
    setStatus("Charges load failed.");
    return;
  }

  state.charges = data || [];
  renderChargesList();
  setStatus(`Charges loaded: ${state.charges.length}`);
}

/** =========================
 *  Rendering lists
 *  ========================= */
function renderBranchesDropdown() {
  const sel = $("#branchSelect");
  if (!sel) return;

  const options = state.branches.map((b) => {
    const label = `${b.country_code}${b.branch_code} — ${b.branch_name || ""}`.trim();
    return `<option value="${esc(b.branch_key)}">${esc(label)}</option>`;
  });

  sel.innerHTML = options.join("");

  // Prefer: user_profiles.default_branch_code (branch_key like SGSIN)
  // Fallback: localStorage selection
  const saved = toUpperTrim(localStorage.getItem("selectedBranchKey"));
  const preferred = toUpperTrim(state.profile?.default_branch_code) || saved;

  const exists = state.branches.some(
    (b) => toUpperTrim(b.branch_key) === preferred
  );
  state.selectedBranchKey = exists
    ? preferred
    : state.branches[0]?.branch_key || "";

  sel.value = state.selectedBranchKey;

  // Set default currency for charge form based on selected branch
  const ccy = defaultCurrencyForBranchKey(state.selectedBranchKey);
  const ccyInp = $("#inpCcy");
  if (ccyInp) ccyInp.value = ccy;

  // Subline / branch timezone
  const sb = $("#subline");
  const b = state.branches.find(
    (x) => toUpperTrim(x.branch_key) === toUpperTrim(state.selectedBranchKey)
  );
  if (sb) {
    sb.textContent = b
      ? `Branch: ${b.branch_key} • TZ: ${b.time_zone || "n/a"}`
      : `Branch: ${state.selectedBranchKey}`;
  }
}

function renderJobsList() {
  const el = $("#jobsList");
  if (!el) return;

  if (!state.jobs.length) {
    el.innerHTML = `<div style="color:#666; font-size:12px;">No jobs found for selected branch.</div>`;
    return;
  }

  el.innerHTML = `
    <div style="display:grid; gap:8px;">
      ${state.jobs
        .map(
          (j) => `
        <div data-jobid="${esc(j.job_id)}"
             class="jobRow"
             style="border:1px solid #f0f0f0; border-radius:10px; padding:10px; cursor:pointer;">
          <div style="display:flex; justify-content:space-between; gap:10px;">
            <div style="font-weight:800;">${esc(j.job_no)}</div>
            <div style="font-size:12px; color:#666;">${esc(
              String(j.created_at || "").slice(0, 19).replace("T", " ")
            )}</div>
          </div>
          <div style="font-size:12px; color:#555; margin-top:6px;">
            <b>${esc(j.customer_name || "")}</b> • ${esc(j.origin_country || "")} → ${esc(
            j.destination_country || ""
          )} • ${esc(j.incoterm || "")}
          </div>
          <div style="font-size:12px; color:#777; margin-top:4px;">
            ${esc(j.country_code)}${esc(j.branch_code)} • ${esc(
            j.transport_mode
          )}${esc(j.job_type)} • YYMM ${esc(j.yymm)} • Run ${esc(j.running_no)}
          </div>
        </div>
      `
        )
        .join("")}
    </div>
  `;

  el.querySelectorAll(".jobRow").forEach((row) => {
    row.addEventListener("click", async () => {
      const jobId = row.getAttribute("data-jobid");
      const job = state.jobs.find((x) => x.job_id === jobId);
      if (!job) return;
      await openJobDetail(job);
    });
  });
}

function renderChargesList() {
  const el = $("#chargesList");
  if (!el) return;

  if (!state.charges.length) {
    el.innerHTML = `<div style="color:#666; font-size:12px;">No charges for this job yet.</div>`;
  } else {
    el.innerHTML = `
      <div style="display:grid; gap:8px;">
        ${state.charges
          .map(
            (c) => `
          <div style="border:1px solid #f0f0f0; border-radius:10px; padding:10px;">
            <div style="display:flex; justify-content:space-between; gap:10px;">
              <div style="font-weight:800;">
                ${esc(c.side)} ${c.charge_code ? `• ${esc(c.charge_code)}` : ""}
              </div>
              <div style="font-size:12px; color:#666;">${esc(
                String(c.created_at || "").slice(0, 19).replace("T", " ")
              )}</div>
            </div>
            <div style="font-size:12px; color:#555; margin-top:6px;">
              ${esc(c.description || "")}
            </div>
            <div style="font-size:12px; color:#777; margin-top:6px; display:flex; justify-content:space-between;">
              <div>
                Qty ${esc(c.qty)} × Unit ${esc(c.unit_price)} ${esc(c.currency)}
              </div>
              <div style="font-weight:800;">
                ${esc(c.currency)} ${esc(fmt(moneyAmount(c)))}
              </div>
            </div>
            <div style="font-size:12px; color:#777; margin-top:4px;">
              Invoiced: ${c.is_invoiced ? "YES" : "NO"}
            </div>
          </div>
        `
          )
          .join("")}
      </div>
    `;
  }

  // Totals (NOTE: multi-currency totals are NOT valid in real accounting;
  // MVP display only, using the currently selected currency input as label.)
  const totals = state.charges.reduce(
    (acc, c) => {
      const side = toUpperTrim(c.side);
      const amt = moneyAmount(c);
      if (side === "SELL") acc.sell += amt;
      else if (side === "BUY") acc.buy += amt;
      return acc;
    },
    { sell: 0, buy: 0 }
  );

  const margin = totals.sell - totals.buy;
  const tEl = $("#chargeTotals");
  if (tEl) {
    const ccy = $("#inpCcy")?.value || "CCY";
    tEl.textContent = `SELL ${ccy} ${fmt(totals.sell)} • BUY ${ccy} ${fmt(
      totals.buy
    )} • MARGIN ${ccy} ${fmt(margin)}`;
  }
}

/** =========================
 *  View switching
 *  ========================= */
function showJobsView() {
  $("#viewJobs").style.display = "block";
  $("#viewJobDetail").style.display = "none";
  $("#btnGoJobs").style.display = "none";
  state.selectedJob = null;
  state.charges = [];
  setStatus("Jobs view.");
}

function showJobDetailView() {
  $("#viewJobs").style.display = "none";
  $("#viewJobDetail").style.display = "block";
  $("#btnGoJobs").style.display = "inline-block";
  setStatus("Job detail view.");
}

async function openJobDetail(job) {
  state.selectedJob = job;

  $("#jobTitle").textContent = `Job ${job.job_no}`;
  $("#jobMeta").textContent = `${job.country_code}${job.branch_code} • ${
    job.transport_mode
  }${job.job_type} • ${job.origin_country} → ${job.destination_country} • ${
    job.incoterm || ""
  }`;

  // Default currency for charge form based on selected branch
  const ccyInp = $("#inpCcy");
  if (ccyInp) ccyInp.value = defaultCurrencyForBranchKey(state.selectedBranchKey);

  showJobDetailView();
  await loadChargesForSelectedJob();
}

/** =========================
 *  Actions (RPC)
 *  ========================= */
function buildCreateJobPayloadVariants(v) {
  // v: {country_code, branch_code, transport_mode, job_type, customer_name, origin_country, destination_country, incoterm}
  return [
    // common "p_" style args
    {
      p_country_code: v.country_code,
      p_branch_code: v.branch_code,
      p_transport_mode: v.transport_mode,
      p_job_type: v.job_type,
      p_customer_name: v.customer_name,
      p_origin_country: v.origin_country,
      p_destination_country: v.destination_country,
      p_incoterm: v.incoterm,
    },
    // plain column style args
    {
      country_code: v.country_code,
      branch_code: v.branch_code,
      transport_mode: v.transport_mode,
      job_type: v.job_type,
      customer_name: v.customer_name,
      origin_country: v.origin_country,
      destination_country: v.destination_country,
      incoterm: v.incoterm,
    },
    // underscore prefix variant
    {
      _country_code: v.country_code,
      _branch_code: v.branch_code,
      _transport_mode: v.transport_mode,
      _job_type: v.job_type,
      _customer_name: v.customer_name,
      _origin_country: v.origin_country,
      _destination_country: v.destination_country,
      _incoterm: v.incoterm,
    },
  ];
}

function buildAddChargePayloadVariants(v) {
  // v: {job_id, side, charge_code, description, qty, unit_price, currency, tax_rate}
  return [
    {
      p_job_id: v.job_id,
      p_side: v.side,
      p_charge_code: v.charge_code,
      p_description: v.description,
      p_qty: v.qty,
      p_unit_price: v.unit_price,
      p_currency: v.currency,
      p_tax_rate: v.tax_rate,
    },
    {
      job_id: v.job_id,
      side: v.side,
      charge_code: v.charge_code,
      description: v.description,
      qty: v.qty,
      unit_price: v.unit_price,
      currency: v.currency,
      tax_rate: v.tax_rate,
    },
    {
      _job_id: v.job_id,
      _side: v.side,
      _charge_code: v.charge_code,
      _description: v.description,
      _qty: v.qty,
      _unit_price: v.unit_price,
      _currency: v.currency,
      _tax_rate: v.tax_rate,
    },
  ];
}

function normalizeSingleRow(data) {
  // Supabase RPC may return: object | array | scalar
  if (Array.isArray(data)) return data[0] ?? null;
  if (data && typeof data === "object") return data;
  return data ?? null;
}

async function createJobFromForm() {
  if (!state.selectedBranchKey) {
    setBanner("warn", "Select a branch first.");
    return;
  }

  const { country_code, branch_code } = parseBranchKey(state.selectedBranchKey);

  const transport_mode = toUpperTrim($("#inpMode")?.value || "SEA");
  const job_type = toUpperTrim($("#inpType")?.value || "EXPORT");
  const customer_name = toUpperTrim($("#inpCustomer")?.value || "");
  const origin_country = sanitizeCountry2($("#inpOrigin")?.value || "");
  const destination_country = sanitizeCountry2($("#inpDest")?.value || "");
  const incoterm = toUpperTrim($("#inpIncoterm")?.value || "");

  if (!customer_name) {
    setBanner("warn", "Customer Name is required.");
    return;
  }
  if (!origin_country || origin_country.length !== 2) {
    setBanner("warn", "Origin Country must be 2 letters (e.g. CN).");
    return;
  }
  if (!destination_country || destination_country.length !== 2) {
    setBanner("warn", "Destination Country must be 2 letters (e.g. SG).");
    return;
  }

  const v = {
    country_code,
    branch_code,
    transport_mode,
    job_type,
    customer_name,
    origin_country,
    destination_country,
    incoterm,
  };

  setBanner("info", "Creating job (RPC)...");
  setStatus("Creating job...");

  const variants = buildCreateJobPayloadVariants(v);
  const { data, error } = await callRpcWithFallback(RPC.create_job, variants);

  if (error) {
    console.error(error);
    setBanner(
      "err",
      `Create job failed: ${safeMsg(error)} (Check RPC signature + RLS)`
    );
    setStatus("Create job failed.");
    return;
  }

  const row = normalizeSingleRow(data);
  const newJobId = row?.job_id || row?.id || null;
  const newJobNo = row?.job_no || null;

  setBanner("ok", `Job created${newJobNo ? `: ${newJobNo}` : ""}. Refreshing...`);
  setStatus("Job created. Reloading jobs...");

  await loadJobs();

  // Open the newly created job automatically if we can locate it
  let createdJob = null;
  if (newJobId) {
    createdJob = state.jobs.find((j) => j.job_id === newJobId) || null;
  }
  if (!createdJob && newJobNo) {
    createdJob = state.jobs.find((j) => j.job_no === newJobNo) || null;
  }
  if (!createdJob) {
    // fallback: newest job matching branch
    createdJob = state.jobs[0] || null;
  }

  if (createdJob) await openJobDetail(createdJob);
}

async function addChargeFromForm() {
  const job = state.selectedJob;
  if (!job?.job_id) {
    setBanner("warn", "Select a job first.");
    return;
  }

  const side = toUpperTrim($("#inpSide")?.value || "SELL");
  const charge_code = toUpperTrim($("#inpChargeCode")?.value || "");
  const description = ($("#inpDesc")?.value || "").trim();
  const qty = numOr($("#inpQty")?.value, 1);
  const unit_price = numOr($("#inpUnit")?.value, 0);
  const currency = toUpperTrim($("#inpCcy")?.value || defaultCurrencyForBranchKey(state.selectedBranchKey));
  const tax_rate = 0; // MVP default

  if (!description) {
    setBanner("warn", "Description is required.");
    return;
  }
  if (!currency || currency.length < 3) {
    setBanner("warn", "Currency is required (e.g. USD, MYR, CNY).");
    return;
  }

  const v = {
    job_id: job.job_id,
    side,
    charge_code: charge_code || null,
    description,
    qty,
    unit_price,
    currency,
    tax_rate,
  };

  setBanner("info", "Adding charge (RPC)...");
  setStatus("Adding charge...");

  const variants = buildAddChargePayloadVariants(v);
  const { data, error } = await callRpcWithFallback(RPC.add_charge_to_job, variants);

  if (error) {
    console.error(error);
    setBanner(
      "err",
      `Add charge failed: ${safeMsg(error)} (Check RPC signature + RLS)`
    );
    setStatus("Add charge failed.");
    return;
  }

  const row = normalizeSingleRow(data);
  setBanner(
    "ok",
    `Charge added${row?.charge_id ? ` (ID ${row.charge_id})` : ""}. Reloading...`
  );

  // Clear minimal inputs but keep currency
  $("#inpChargeCode").value = "";
  $("#inpDesc").value = "";
  $("#inpQty").value = "1";
  $("#inpUnit").value = "0";

  await loadChargesForSelectedJob();
  setStatus("Charge added.");
}

/** =========================
 *  Bootstrap
 *  ========================= */
async function bootstrapAfterLogin() {
  renderShell();

  // whoami
  const who = $("#whoami");
  if (who) who.textContent = `Signed in: ${state.user?.email || ""}`;

  setStatus("Loading profile + branches...");

  state.profile = await loadProfile();
  state.branches = await loadBranches();

  renderBranchesDropdown();

  // Update whoami with role & default branch
  if (who) {
    const role = state.profile?.role ? ` • role: ${state.profile.role}` : "";
    const defb = state.profile?.default_branch_code
      ? ` • default: ${state.profile.default_branch_code}`
      : "";
    who.textContent = `Signed in: ${state.user?.email || ""}${role}${defb}`;
  }

  // If no branches -> stop
  if (!state.branches.length) {
    setBanner("warn", "No active branches found. Check branches table / RLS.");
    setStatus("No branches.");
    return;
  }

  // Set default charge currency based on selected branch
  const ccyInp = $("#inpCcy");
  if (ccyInp) ccyInp.value = defaultCurrencyForBranchKey(state.selectedBranchKey);

  await loadJobs();
  showJobsView();
}

/** =========================
 *  Initial load
 *  ========================= */
(async function init() {
  // Try existing session first
  const { data } = await supabase.auth.getSession();
  state.session = data?.session || null;
  state.user = data?.session?.user || null;

  if (!state.user) {
    renderLogin();
  } else {
    await bootstrapAfterLogin();
  }
})();
