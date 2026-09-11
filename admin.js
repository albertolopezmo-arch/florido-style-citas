const CFG = window.FLORIDO_CONFIG;
const apiBase = `${CFG.SUPABASE_URL}/rest/v1`;
const authBase = `${CFG.SUPABASE_URL}/auth/v1`;
const publicHeaders = { apikey: CFG.SUPABASE_ANON_KEY, "Content-Type": "application/json" };
const todayValue = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const dateField = document.querySelector("#admin-date");
let session = JSON.parse(sessionStorage.getItem("florido-admin-session") || "null");
let pendingCancellation = null;

function authHeaders(extra = {}) {
  return { ...publicHeaders, Authorization: `Bearer ${session?.access_token || ""}`, ...extra };
}

async function request(url, options = {}) {
  const response = await fetch(url, options);
  if (response.status === 401 || response.status === 403) {
    logout();
    throw new Error("Sesión no autorizada");
  }
  const text = await response.text();
  if (!response.ok) throw new Error(text || "Operación no disponible");
  return text ? JSON.parse(text) : null;
}

function showDashboard() {
  document.querySelector("#login-view").hidden = true;
  document.querySelector("#dashboard-view").hidden = false;
  document.querySelector("#logout-button").hidden = false;
  dateField.value = todayValue;
  loadDay();
}

function logout() {
  session = null;
  sessionStorage.removeItem("florido-admin-session");
  document.querySelector("#login-view").hidden = false;
  document.querySelector("#dashboard-view").hidden = true;
  document.querySelector("#logout-button").hidden = true;
}

document.querySelector("#login-form").addEventListener("submit", async event => {
  event.preventDefault();
  const error = document.querySelector("#login-error");
  error.textContent = "";
  const button = event.submitter;
  button.disabled = true;
  try {
    session = await request(`${authBase}/token?grant_type=password`, {
      method: "POST",
      headers: publicHeaders,
      body: JSON.stringify({
        email: document.querySelector("#admin-email").value.trim(),
        password: document.querySelector("#admin-password").value
      })
    });
    const isAdmin = await request(`${apiBase}/rpc/is_florido_admin`, {
      method: "POST",
      headers: authHeaders(),
      body: "{}"
    });
    if (isAdmin !== true) {
      session = null;
      throw new Error("Usuario sin permiso de administrador");
    }
    sessionStorage.setItem("florido-admin-session", JSON.stringify(session));
    showDashboard();
  } catch {
    error.textContent = "Correo, contraseña o permisos incorrectos.";
  } finally {
    button.disabled = false;
  }
});

function prettyDate(value) {
  return new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" })
    .format(new Date(`${value}T12:00:00`));
}

async function loadDay() {
  const date = dateField.value || todayValue;
  document.querySelector("#day-label").textContent = prettyDate(date);
  document.querySelector("#appointments-list").innerHTML = '<p class="empty-admin">Cargando citas…</p>';
  try {
    const [appointments, blocks, slots] = await Promise.all([
      request(`${apiBase}/appointments?select=id,customer_name,phone,service,appointment_time,status&appointment_date=eq.${date}&status=eq.confirmed&order=appointment_time.asc`, { headers: authHeaders() }),
      request(`${apiBase}/blocked_slots?select=id,block_time,reason&block_date=eq.${date}&order=block_time.asc.nullsfirst`, { headers: authHeaders() }),
      request(`${apiBase}/rpc/get_available_slots`, { method: "POST", headers: authHeaders(), body: JSON.stringify({ p_date: date }) })
    ]);
    renderAppointments(appointments || []);
    renderBlocks(blocks || []);
    document.querySelector("#confirmed-count").textContent = appointments.length;
    document.querySelector("#available-count").textContent = slots.length;
    document.querySelector("#revenue-count").textContent = `${appointments.length * 15} €`;
  } catch {
    document.querySelector("#appointments-list").innerHTML = '<p class="empty-admin">No se pudo cargar la agenda. Comprueba la sesión.</p>';
  }
}

function renderAppointments(items) {
  const list = document.querySelector("#appointments-list");
  if (!items.length) {
    list.innerHTML = '<p class="empty-admin">No hay citas confirmadas para este día.</p>';
    return;
  }
  list.innerHTML = "";
  items.forEach(item => {
    const row = document.createElement("article");
    row.className = "appointment";
    row.innerHTML = `<div class="appointment-time">${item.appointment_time.slice(0,5)}</div><div><strong></strong><span></span><span></span></div><button class="cancel-button" type="button">Cancelar cita</button>`;
    row.querySelector("strong").textContent = item.customer_name;
    row.querySelectorAll("span")[0].textContent = item.service;
    row.querySelectorAll("span")[1].textContent = item.phone;
    row.querySelector("button").addEventListener("click", () => askCancel(item));
    list.appendChild(row);
  });
}

function askCancel(item) {
  pendingCancellation = item;
  document.querySelector("#cancel-text").textContent = `${item.customer_name} · ${item.appointment_time.slice(0,5)} · ${item.service}`;
  document.querySelector("#cancel-dialog").showModal();
}

document.querySelector("#dismiss-cancel").addEventListener("click", () => document.querySelector("#cancel-dialog").close());
document.querySelector("#confirm-cancel").addEventListener("click", async () => {
  if (!pendingCancellation) return;
  const button = document.querySelector("#confirm-cancel");
  button.disabled = true;
  try {
    await request(`${apiBase}/appointments?id=eq.${pendingCancellation.id}`, {
      method: "PATCH", headers: authHeaders({ Prefer: "return=minimal" }), body: JSON.stringify({ status: "cancelled" })
    });
    document.querySelector("#cancel-dialog").close();
    pendingCancellation = null;
    await loadDay();
  } finally { button.disabled = false; }
});

document.querySelector("#block-form").addEventListener("submit", async event => {
  event.preventDefault();
  const error = document.querySelector("#block-error");
  error.textContent = "";
  const time = document.querySelector("#block-time").value;
  try {
    await request(`${apiBase}/blocked_slots`, {
      method: "POST",
      headers: authHeaders({ Prefer: "return=minimal" }),
      body: JSON.stringify({ block_date: dateField.value, block_time: time ? `${time}:00` : null, reason: document.querySelector("#block-reason").value.trim() || null })
    });
    event.target.reset();
    await loadDay();
  } catch { error.textContent = "Ese día o esa hora ya están bloqueados."; }
});

const manualDialog = document.querySelector("#manual-booking-dialog");
const manualForm = document.querySelector("#manual-booking-form");
const manualTime = document.querySelector("#manual-time");
const saveManual = document.querySelector("#save-manual");

document.querySelector("#open-manual-booking").addEventListener("click", async () => {
  const date = dateField.value || todayValue;
  document.querySelector("#manual-date-label").textContent = `Cita para el ${prettyDate(date)}`;
  document.querySelector("#manual-error").textContent = "";
  manualForm.reset();
  manualTime.innerHTML = '<option value="">Consultando horas…</option>';
  manualTime.disabled = true;
  saveManual.disabled = true;
  manualDialog.showModal();
  try {
    const slots = await request(`${apiBase}/rpc/get_available_slots`, {
      method: "POST", headers: authHeaders(), body: JSON.stringify({ p_date: date })
    });
    manualTime.innerHTML = "";
    if (!slots.length) {
      manualTime.innerHTML = '<option value="">No quedan horas disponibles</option>';
      document.querySelector("#manual-error").textContent = "Elige otro día antes de añadir la cita.";
      return;
    }
    slots.forEach(item => {
      const time = String(item.slot_time).slice(0, 5);
      const option = document.createElement("option");
      option.value = `${time}:00`;
      option.textContent = time;
      manualTime.appendChild(option);
    });
    manualTime.disabled = false;
    saveManual.disabled = false;
  } catch {
    manualTime.innerHTML = '<option value="">No se pudieron consultar las horas</option>';
    document.querySelector("#manual-error").textContent = "Actualiza la agenda e inténtalo otra vez.";
  }
});

document.querySelector("#dismiss-manual").addEventListener("click", () => manualDialog.close());

manualForm.addEventListener("submit", async event => {
  event.preventDefault();
  const error = document.querySelector("#manual-error");
  error.textContent = "";
  const name = document.querySelector("#manual-name").value.trim();
  const phone = document.querySelector("#manual-phone").value.trim() || "Sin teléfono";
  if (name.length < 2 || !manualTime.value) return;
  saveManual.disabled = true;
  try {
    await request(`${apiBase}/appointments`, {
      method: "POST",
      headers: authHeaders({ Prefer: "return=minimal" }),
      body: JSON.stringify({
        customer_name: name,
        phone,
        service: document.querySelector("#manual-service").value,
        appointment_date: dateField.value,
        appointment_time: manualTime.value,
        price_eur: 15,
        status: "confirmed"
      })
    });
    manualDialog.close();
    await loadDay();
  } catch {
    error.textContent = "No se pudo guardar. Comprueba que la hora siga libre y que el nombre sea correcto.";
  } finally {
    saveManual.disabled = false;
  }
});

function renderBlocks(items) {
  const list = document.querySelector("#blocks-list");
  if (!items.length) { list.innerHTML = '<p class="hint">No hay bloqueos.</p>'; return; }
  list.innerHTML = "";
  items.forEach(item => {
    const row = document.createElement("div");
    row.className = "block-row";
    const label = item.block_time ? `${item.block_time.slice(0,5)}${item.reason ? ` · ${item.reason}` : ""}` : `Día completo${item.reason ? ` · ${item.reason}` : ""}`;
    row.innerHTML = '<span></span><button class="unblock-button" type="button">Volver a abrir</button>';
    row.querySelector("span").textContent = label;
    row.querySelector("button").addEventListener("click", async () => {
      await request(`${apiBase}/blocked_slots?id=eq.${item.id}`, { method: "DELETE", headers: authHeaders() });
      await loadDay();
    });
    list.appendChild(row);
  });
}

dateField.addEventListener("change", loadDay);
document.querySelector("#refresh-button").addEventListener("click", loadDay);
document.querySelector("#logout-button").addEventListener("click", logout);
if (session?.access_token) showDashboard();
