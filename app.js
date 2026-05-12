// KEEP YOUR EXISTING SUPABASE CONFIG
const SUPABASE_URL = "https://quzputmmabgcfmegarvd.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_UG9E0FbUzetadkz8TQN2fg_pIWx3LTO";

const client = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null;

async function login() {
  const email = document.getElementById("email").value;
  const password = document.getElementById("password").value;

  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) return alert(error.message);

  currentUser = data.user;
  alert("Login success");

  loadJobs();
}

// ==========================
// LOAD JOBS + SHIPMENTS
// ==========================
async function loadJobs() {
  const { data: jobs } = await client.from("jobs")
    .select("*")
    .order("created_at", { ascending: false });

  const list = document.getElementById("jobsList");
  list.innerHTML = "";

  for (const job of jobs) {
    const li = document.createElement("li");

    li.innerHTML = `
      <b>${job.job_no}</b> | ${job.customer_name}
      <button onclick="addShipment('${job.job_id}')">+ Shipment</button>
      <ul id="ship-${job.job_id}"></ul>
    `;

    list.appendChild(li);

    loadShipments(job.job_id);
  }
}

// ==========================
// LOAD SHIPMENTS
// ==========================
async function loadShipments(job_id) {
  const { data: shipments } = await client
    .from("shipments")
    .select("*")
    .eq("job_id", job_id);

  const ul = document.getElementById(`ship-${job_id}`);
  ul.innerHTML = "";

  for (const s of shipments) {
    const li = document.createElement("li");

    li.innerHTML = `
      🚢 ${s.pol || ""} → ${s.pod || ""} | ${s.carrier || ""} 
      <button onclick="addEvent('${s.shipment_id}')">+ Event</button>
      <ul id="event-${s.shipment_id}"></ul>
    `;

    ul.appendChild(li);

    loadEvents(s.shipment_id);
  }
}

// ==========================
// LOAD EVENTS
// ==========================
async function loadEvents(shipment_id) {
  const { data: events } = await client
    .from("shipment_events")
    .select("*")
    .eq("shipment_id", shipment_id);

  const ul = document.getElementById(`event-${shipment_id}`);
  ul.innerHTML = "";

  for (const e of events) {
    const li = document.createElement("li");
    li.textContent = `${e.event_name} - ${new Date(e.event_time).toLocaleString()}`;
    ul.appendChild(li);
  }
}

// ==========================
// CREATE SHIPMENT
// ==========================
async function addShipment(job_id) {
  const pol = prompt("POL?");
  const pod = prompt("POD?");
  const carrier = prompt("Carrier?");

  const { error } = await client.from("shipments").insert([{
    job_id,
    pol,
    pod,
    carrier
  }]);

  if (error) return alert(error.message);

  loadJobs();
}

// ==========================
// CREATE EVENT
// ==========================
async function addEvent(shipment_id) {
  const event_name = prompt("Event name? (e.g. LOADED, DEPARTED)");
  const time = new Date().toISOString();

  const { error } = await client.from("shipment_events").insert([{
    shipment_id,
    event_name,
    event_time: time
  }]);

  if (error) return alert(error.message);

  loadJobs();
}
