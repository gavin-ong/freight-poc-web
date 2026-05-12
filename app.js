const SUPABASE_URL = "https://quzputmmabgcfmegarvd.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_UG9E0FbUzetadkz8TQN2fg_pIWx3LTO";

const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;

// branch_key -> { name, tz }
let branchMap = {};

// current selection
let selectedJob = null;
let selectedShipmentId = null;

function $(id) { return document.getElementById(id); }

function setStatus(msg) {
  const el = $("loginStatus");
  if (el) el.textContent = msg;
}

async function pingSupabase() {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/health`, { headers: { apikey: SUPABASE_ANON_KEY } });
    if (!res.ok) { setStatus(`Supabase reachable but health check HTTP ${res.status}`); return false; }
    setStatus("Supabase reachable ✅");
    return true;
  } catch {
    setStatus("Supabase NOT reachable ❌ (Failed to fetch)");
    return false;
  }
}

function formatInTimezone(isoUtc, tz) {
  try {
    return new Date(isoUtc).toLocaleString("en-SG", {
      timeZone: tz,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      hour12: false
    });
  } catch {
    return new Date(isoUtc).toLocaleString("en-SG");
  }
}

function setSelectDisabled(selectId, disabled, placeholderText) {
  const sel = $(selectId);
  sel.innerHTML = "";
  const opt = document.createElement("option");
  opt.value = "";
  opt.textContent = placeholderText;
  sel.appendChild(opt);
  sel.disabled = disabled;
}

// ---------- BRANCHES ----------
function populateBranchDropdown() {
  const ddl = $("branchKey");
  ddl.innerHTML = "";

  const keys = Object.keys(branchMap).sort((a, b) => a.localeCompare(b)); // country+branch order
  if (keys.length === 0) return setSelectDisabled("branchKey", true, "No active branches found");

  for (const k of keys) {
    const info = branchMap[k] || {};
    const opt = document.createElement("option");
    opt.value = k;
    opt.textContent = info.name ? `${k} (${info.name})` : k;
    ddl.appendChild(opt);
  }
  ddl.disabled = false;
}

async function loadBranchesFromDb() {
  const { data, error } = await client
    .from("branches")
    .select("country_code, branch_code, branch_name, time_zone, is_active")
    .eq("is_active", true);

  if (error) {
    console.error("branches select failed:", error);
    branchMap = {
      "SGSIN": { name: "Singapore", tz: "Asia/Singapore" },
      "MYKUL": { name: "Kuala Lumpur", tz: "Asia/Kuala_Lumpur" },
      "VNHCM": { name: "Ho Chi Minh", tz: "Asia/Ho_Chi_Minh" },
      "THBKK": { name: "Bangkok", tz: "Asia/Bangkok" }
    };
    populateBranchDropdown();
    return;
  }

  const map = {};
  for (const b of data || []) {
    const key = `${(b.country_code || "").toUpperCase()}${(b.branch_code || "").toUpperCase()}`;
    map[key] = { name: b.branch_name || "", tz: b.time_zone || "Asia/Singapore" };
  }
  branchMap = map;
  populateBranchDropdown();
}

async function loadUserDefaultBranchKey() {
  if (!currentUser) return null;
  const { data, error } = await client
    .from("profiles")
    .select("default_branch_key")
    .eq("id", currentUser.id)
    .single();
  if (error) return null;
  return (data?.default_branch_key || "").toUpperCase().trim() || null;
}

function applyDefaultBranch(defaultKey) {
  const ddl = $("branchKey");
  const fallback = "SGSIN";
  const target = (defaultKey || fallback).toUpperCase();

  const exists = Array.from(ddl.options).some(o => (o.value || "").toUpperCase() === target);
  ddl.value = exists ? target : (Array.from(ddl.options).some(o => o.value === fallback) ? fallback : ddl.value);
}

// ---------- JOBS ----------
async function fetchJobs() {
  const { data, error } = await client
    .from("jobs")
    .select("job_id, job_no, customer_name, country_code, branch_code, created_at")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return data || [];
}

function populateJobDropdown(jobs) {
  const ddl = $("jobSelect");
  ddl.innerHTML = "";

  if (!jobs.length) return setSelectDisabled("jobSelect", true, "No jobs found");

  for (const j of jobs) {
    const opt = document.createElement("option");
    opt.value = j.job_id;
    opt.textContent = `${j.job_no} | ${j.customer_name || ""}`;
    ddl.appendChild(opt);
  }
  ddl.disabled = false;
}

function renderJobsList(jobs) {
  const ul = $("jobsList");
  ul.innerHTML = "";
  for (const j of jobs) {
    const li = document.createElement("li");
    li.innerHTML = `<b>${j.job_no}</b> | ${j.customer_name || ""}`;
    ul.appendChild(li);
  }
}

async function reloadJobs() {
  if (!currentUser) return alert("Login first");

  const jobs = await fetchJobs();
  populateJobDropdown(jobs);
  renderJobsList(jobs);

  $("jobSelect").selectedIndex = 0;
  await onJobChanged();
}

async function loadJobsList() { return reloadJobs(); }

async function onJobChanged() {
  const jobId = $("jobSelect").value;
  if (!jobId) {
    selectedJob = null;
    selectedShipmentId = null;
    setSelectDisabled("shipmentSelect", true, "Select a job first...");
    $("shipmentsArea").textContent = "Select a job to view shipments.";
    return;
  }

  const { data, error } = await client
    .from("jobs")
    .select("job_id, job_no, customer_name, country_code, branch_code, created_at")
    .eq("job_id", jobId)
    .single();
  if (error) return alert("Failed to load job: " + error.message);

  selectedJob = data;

  await reloadShipments();
  await renderSelectedJobShipmentsArea();
}

// ---------- CREATE JOB (RPC) ----------
async function createJob() {
  if (!currentUser) return alert("Login first");

  const branchKey = $("branchKey").value;
  const mode = $("mode").value;
  const jobType = $("jobType").value;
  const incoterm = $("incoterm").value;

  const customer = $("customer").value.trim();
  const origin = $("origin").value.trim();
  const destination = $("destination").value.trim();

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
  await reloadJobs();
}

// ---------- SHIPMENTS ----------
async function fetchShipments(jobId) {
  const { data, error } = await client
    .from("shipments")
    .select("shipment_id, job_id, pol, pod, carrier, vessel, voyage, booking_no, bl_awb_no, etd, eta, atd, ata, created_at")
    .eq("job_id", jobId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data || [];
}

function populateShipmentDropdown(shipments) {
  const ddl = $("shipmentSelect");
  ddl.innerHTML = "";

  if (!shipments.length) {
    setSelectDisabled("shipmentSelect", true, "No shipments yet (create one)...");
    selectedShipmentId = null;
    return;
  }

  for (const s of shipments) {
    const opt = document.createElement("option");
    opt.value = s.shipment_id;
    const lane = `${s.pol || ""} → ${s.pod || ""}`.trim();
    const label = `${lane} | ${s.carrier || ""} | ${s.booking_no || ""}`.trim();
    opt.textContent = label;
    ddl.appendChild(opt);
  }

  ddl.disabled = false;
  ddl.selectedIndex = 0;
  selectedShipmentId = ddl.value;
}

async function reloadShipments() {
  if (!currentUser) return alert("Login first");
  const jobId = $("jobSelect").value;
  if (!jobId) return;

  const shipments = await fetchShipments(jobId);
  populateShipmentDropdown(shipments);
}

async function createShipment() {
  if (!currentUser) return alert("Login first");

  const jobId = $("jobSelect").value;
  if (!jobId) return alert("Select a job first");

  const pol = $("pol").value.trim();
  const pod = $("pod").value.trim();
  const carrier = $("carrier").value.trim();
  const vessel = $("vessel").value.trim();
  const voyage = $("voyage").value.trim();
  const booking_no = $("bookingNo").value.trim();
  const bl_awb_no = $("blAwbNo").value.trim();

  const { error } = await client.from("shipments").insert([{
    job_id: jobId,
    pol, pod, carrier, vessel, voyage, booking_no, bl_awb_no
  }]);

  if (error) return alert("Create shipment failed: " + error.message);

  alert("Shipment created");
  await reloadShipments();
  await renderSelectedJobShipmentsArea();
}

async function onShipmentChanged() {
  selectedShipmentId = $("shipmentSelect").value || null;
  await renderSelectedJobShipmentsArea();
}

// ---------- EVENTS ----------
async function fetchEvents(shipmentId) {
  const { data, error } = await client
    .from("shipment_events")
    .select("event_id, shipment_id, event_code, event_name, event_time, location, remarks, created_at")
    .eq("shipment_id", shipmentId)
    .order("event_time", { ascending: true });
  if (error) throw error;
  return data || [];
}

/**
 * B2: Event time input is treated as the SELECTED JOB’s branch-local time.
 * We send local string + branch tz to DB RPC add_shipment_event(),
 * DB converts to UTC correctly and triggers roll-up into shipments.* fields.
 */
async function addEvent() {
  if (!currentUser) return alert("Login first");
  if (!selectedShipmentId) return alert("Select a shipment first");
  if (!selectedJob) return alert("Select a job first");

  const event_code = $("eventName").value;           // ETD/ETA/ATD/ATA...
  const eventTimeLocal = $("eventTime").value;       // datetime-local string
  const location = $("eventLocation").value.trim();
  const remarks = $("eventRemarks").value.trim();

  if (!eventTimeLocal) return alert("Select event time");

  const branchKey = `${(selectedJob.country_code || "").toUpperCase()}${(selectedJob.branch_code || "").toUpperCase()}`;
  const tz = branchMap[branchKey]?.tz || "Asia/Singapore";

  // ✅ Use DB RPC for branch-local time conversion + roll-up trigger
  const { error } = await client.rpc("add_shipment_event", {
    p_shipment_id: selectedShipmentId,
    p_event_code: event_code,
    p_event_time_local: eventTimeLocal,
    p_time_zone: tz,
    p_location: location || null,
    p_remarks: remarks || null
  });

  if (error) return alert("Add event failed: " + error.message);

  alert("Event added");
  await renderSelectedJobShipmentsArea();
}

// ---------- RENDER SELECTED JOB SHIPMENTS ----------
async function renderSelectedJobShipmentsArea() {
  const area = $("shipmentsArea");
  if (!selectedJob) {
    area.textContent = "Select a job to view shipments.";
    return;
  }

  const branchKey = `${(selectedJob.country_code || "").toUpperCase()}${(selectedJob.branch_code || "").toUpperCase()}`;
  const tz = branchMap[branchKey]?.tz || "Asia/Singapore";

  const shipments = await fetchShipments(selectedJob.job_id);

  if (!shipments.length) {
    area.innerHTML = `<div class="muted">No shipments for <b>${selectedJob.job_no}</b> yet.</div>`;
    return;
  }

  let html = `<div><b>${selectedJob.job_no}</b> | ${selectedJob.customer_name || ""} <span class="muted">(${tz})</span></div>`;
  html += `<ul>`;

  for (const s of shipments) {
    // ✅ roll-up fields now available
    const etd = s.etd ? formatInTimezone(s.etd, tz) : "-";
    const eta = s.eta ? formatInTimezone(s.eta, tz) : "-";
    const atd = s.atd ? formatInTimezone(s.atd, tz) : "-";
    const ata = s.ata ? formatInTimezone(s.ata, tz) : "-";

    html += `<li>
      <b>${(s.pol || "")} → ${(s.pod || "")}</b> | ${(s.carrier || "")} | ${(s.vessel || "")} ${(s.voyage || "")}
      <div class="muted">Booking: ${(s.booking_no || "-")} | BL/AWB: ${(s.bl_awb_no || "-")}</div>
      <div class="muted">ETD: ${etd} | ATD: ${atd} | ETA: ${eta} | ATA: ${ata}</div>
    `;

    const events = await fetchEvents(s.shipment_id);
    if (!events.length) {
      html += `<div class="muted">No events yet</div>`;
    } else {
      html += `<ul>`;
      for (const e of events) {
        const t = e.event_time ? formatInTimezone(e.event_time, tz) : "-";
        const code = (e.event_code || e.event_name || "").toUpperCase();
        html += `<li>${code} | ${t}${e.location ? " | " + e.location : ""}${e.remarks ? " | " + e.remarks : ""}</li>`;
      }
      html += `</ul>`;
    }
    html += `</li>`;
  }

  html += `</ul>`;
  area.innerHTML = html;
}

// ---------- LOGIN ----------
async function login() {
  const email = $("email").value.trim();
  const password = $("password").value;

  const ok = await pingSupabase();
  if (!ok) return alert("Cannot reach Supabase");

  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) return alert("Login failed: " + error.message);

  currentUser = data.user;

  setSelectDisabled("branchKey", true, "Loading branches...");
  await loadBranchesFromDb();

  const defaultBranch = await loadUserDefaultBranchKey();
  applyDefaultBranch(defaultBranch);

  setSelectDisabled("jobSelect", true, "Loading jobs...");
  await reloadJobs();

  alert("Login success: " + currentUser.email);
}

// ---------- WIRING ----------
window.addEventListener("load", async () => {
  await pingSupabase();
  setSelectDisabled("branchKey", true, "Login to load branches...");
  setSelectDisabled("jobSelect", true, "Login to load jobs...");
  setSelectDisabled("shipmentSelect", true, "Select a job first...");

  $("jobSelect").addEventListener("change", onJobChanged);
  $("shipmentSelect").addEventListener("change", onShipmentChanged);
});
