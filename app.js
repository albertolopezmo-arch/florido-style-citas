const CONFIG = window.FLORIDO_CONFIG || {};
const welcomeSplash = document.querySelector("#welcome-splash");
let welcomeTimer;

function closeWelcome() {
  if (!welcomeSplash || welcomeSplash.classList.contains("closing")) return;
  clearTimeout(welcomeTimer);
  welcomeSplash.classList.add("closing");
  setTimeout(() => welcomeSplash.remove(), 600);
}

if (welcomeSplash) {
  welcomeTimer = setTimeout(closeWelcome, 5000);
}
const SLOTS = ["10:00", "11:00", "12:00", "13:00", "16:00", "17:00", "18:00"];
const form = document.querySelector("#booking-form");
const dateInput = document.querySelector("#booking-date");
const slotsNode = document.querySelector("#slots");
const submitButton = document.querySelector("#submit-button");
const dialog = document.querySelector("#confirmation-dialog");
const calendarDays = document.querySelector("#calendar-days");
const calendarMonth = document.querySelector("#calendar-month");
const calendarPrev = document.querySelector("#calendar-prev");
const calendarNext = document.querySelector("#calendar-next");
let selectedSlot = "";

const isConnected = Boolean(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY);
const localKey = "florido-style-demo-bookings";
const today = new Date();
const localToday = new Date(today.getTime() - today.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
let calendarCursor = new Date(today.getFullYear(), today.getMonth(), 1);

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function selectedService() {
  return form.elements.service.value;
}

function isWeekday(dateValue) {
  const day = new Date(`${dateValue}T12:00:00`).getDay();
  return day >= 1 && day <= 5;
}

function formatDate(dateValue) {
  return new Intl.DateTimeFormat("es-ES", { weekday: "long", day: "numeric", month: "long" })
    .format(new Date(`${dateValue}T12:00:00`));
}

async function supabaseRpc(name, payload) {
  const response = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: CONFIG.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${CONFIG.SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
  const body = await response.text();
  if (!response.ok) throw new Error(body || "No se pudo completar la operación.");
  return body ? JSON.parse(body) : null;
}

function demoAvailableSlots(dateValue) {
  const bookings = JSON.parse(localStorage.getItem(localKey) || "[]");
  const occupied = new Set(bookings.filter(item => item.date === dateValue).map(item => item.time));
  return SLOTS.filter(slot => !occupied.has(slot));
}

async function getAvailableSlots(dateValue) {
  if (!isConnected) return demoAvailableSlots(dateValue);
  const rows = await supabaseRpc("get_available_slots", { p_date: dateValue });
  return rows.map(row => String(row.slot_time).slice(0, 5));
}

async function getBlockedDays(start, end) {
  if (!isConnected) return [];
  try {
    const rows = await supabaseRpc("get_blocked_days", { p_start: start, p_end: end });
    return rows.map(row => row.block_date);
  } catch {
    const startDate = new Date(`${start}T12:00:00`);
    const endDate = new Date(`${end}T12:00:00`);
    const weekdays = [];
    for (let date = new Date(startDate); date <= endDate; date.setDate(date.getDate() + 1)) {
      const key = dateKey(date);
      if (key >= localToday && date.getDay() !== 0 && date.getDay() !== 6) weekdays.push(key);
    }
    const availability = await Promise.all(weekdays.map(async key => {
      try { return (await getAvailableSlots(key)).length ? null : key; }
      catch { return null; }
    }));
    return availability.filter(Boolean);
  }
}

async function renderCalendar() {
  const year = calendarCursor.getFullYear();
  const month = calendarCursor.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const blockedDays = new Set(await getBlockedDays(dateKey(firstDay), dateKey(lastDay)));
  calendarMonth.textContent = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric" }).format(firstDay);
  calendarDays.innerHTML = "";
  const leadingBlanks = (firstDay.getDay() + 6) % 7;
  for (let i = 0; i < leadingBlanks; i += 1) {
    const blank = document.createElement("span");
    blank.className = "calendar-blank";
    calendarDays.appendChild(blank);
  }
  for (let day = 1; day <= lastDay.getDate(); day += 1) {
    const date = new Date(year, month, day);
    const key = dateKey(date);
    const weekend = date.getDay() === 0 || date.getDay() === 6;
    const unavailable = key < localToday || weekend || blockedDays.has(key);
    const button = document.createElement("button");
    button.type = "button";
    button.className = `calendar-day${blockedDays.has(key) ? " blocked" : ""}${dateInput.value === key ? " selected" : ""}`;
    button.textContent = day;
    button.disabled = unavailable;
    button.setAttribute("aria-label", unavailable ? `${formatDate(key)}, no disponible` : formatDate(key));
    button.addEventListener("click", () => {
      dateInput.value = key;
      calendarDays.querySelectorAll(".calendar-day").forEach(item => item.classList.remove("selected"));
      button.classList.add("selected");
      refreshSlots();
    });
    calendarDays.appendChild(button);
  }
  const currentMonth = today.getFullYear() * 12 + today.getMonth();
  const shownMonth = year * 12 + month;
  calendarPrev.disabled = shownMonth <= currentMonth;
}

function updateSummary() {
  document.querySelector("#summary-service").textContent = selectedService();
  document.querySelector("#summary-when").textContent = dateInput.value && selectedSlot
    ? `${formatDate(dateInput.value)} · ${selectedSlot}`
    : "Selecciona día y hora";
}

function renderSlots(slots) {
  slotsNode.innerHTML = "";
  if (!slots.length) {
    slotsNode.innerHTML = '<p class="empty-state">Ese día ya no tiene horas disponibles. Prueba con otra fecha.</p>';
    return;
  }
  slots.forEach(slot => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "slot";
    button.textContent = slot;
    button.addEventListener("click", () => {
      selectedSlot = slot;
      document.querySelectorAll(".slot").forEach(item => item.classList.remove("selected"));
      button.classList.add("selected");
      document.querySelector("#slot-error").textContent = "";
      updateSummary();
    });
    slotsNode.appendChild(button);
  });
}

async function refreshSlots() {
  selectedSlot = "";
  updateSummary();
  document.querySelector("#date-error").textContent = "";
  if (!dateInput.value) return;
  if (!isWeekday(dateInput.value)) {
    slotsNode.innerHTML = '<p class="empty-state">Los sábados y domingos estamos cerrados.</p>';
    document.querySelector("#date-error").textContent = "Elige un día de lunes a viernes.";
    return;
  }
  slotsNode.innerHTML = '<p class="empty-state">Consultando horas disponibles…</p>';
  try {
    renderSlots(await getAvailableSlots(dateInput.value));
  } catch {
    slotsNode.innerHTML = '<p class="empty-state">No hemos podido consultar la agenda. Inténtalo de nuevo.</p>';
  }
}

async function createBooking(booking) {
  if (isConnected) {
    return supabaseRpc("create_booking", {
      p_customer_name: booking.name,
      p_phone: booking.phone,
      p_service: booking.service,
      p_date: booking.date,
      p_time: `${booking.time}:00`
    });
  }
  const bookings = JSON.parse(localStorage.getItem(localKey) || "[]");
  if (bookings.some(item => item.date === booking.date && item.time === booking.time)) {
    throw new Error("Esta hora acaba de ser reservada.");
  }
  bookings.push({ ...booking, id: crypto.randomUUID() });
  localStorage.setItem(localKey, JSON.stringify(bookings));
}

dateInput.addEventListener("change", refreshSlots);
calendarPrev.addEventListener("click", () => {
  calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() - 1, 1);
  renderCalendar();
});
calendarNext.addEventListener("click", () => {
  calendarCursor = new Date(calendarCursor.getFullYear(), calendarCursor.getMonth() + 1, 1);
  renderCalendar();
});
form.elements.service.forEach(input => input.addEventListener("change", updateSummary));
document.querySelector("#close-dialog").addEventListener("click", () => dialog.close());

form.addEventListener("submit", async event => {
  event.preventDefault();
  const errorNode = document.querySelector("#form-error");
  errorNode.textContent = "";
  if (!dateInput.value || !isWeekday(dateInput.value)) {
    document.querySelector("#date-error").textContent = "Elige un día válido de lunes a viernes.";
    dateInput.focus();
    return;
  }
  if (!selectedSlot) {
    document.querySelector("#slot-error").textContent = "Elige una hora disponible.";
    slotsNode.scrollIntoView({ behavior: "smooth", block: "center" });
    return;
  }
  if (!form.reportValidity()) return;

  const booking = {
    service: selectedService(),
    date: dateInput.value,
    time: selectedSlot,
    name: document.querySelector("#customer-name").value.trim(),
    phone: document.querySelector("#customer-phone").value.trim()
  };
  submitButton.disabled = true;
  submitButton.textContent = "Confirmando…";
  try {
    await createBooking(booking);
    document.querySelector("#confirmation-text").textContent =
      `${booking.name}, tu ${booking.service.toLowerCase()} está reservado para el ${formatDate(booking.date)} a las ${booking.time}.`;
    dialog.showModal();
    form.reset();
    form.elements.service[0].checked = true;
    selectedSlot = "";
    slotsNode.innerHTML = '<p class="empty-state">Selecciona primero un día para consultar las horas disponibles.</p>';
    updateSummary();
    renderCalendar();
  } catch {
    errorNode.textContent = "Esa hora ya no está disponible o no hemos podido guardar la cita. Elige otra hora.";
    await refreshSlots();
  } finally {
    submitButton.disabled = false;
    submitButton.innerHTML = 'Confirmar cita <span>→</span>';
  }
});

updateSummary();
renderCalendar();

function registerBookingTool() {
  const context = document.modelContext;
  if (!context?.registerTool) return;
  const allowedServices = ["Corte de pelo", "Corte de pelo y barba"];
  Promise.resolve(context.registerTool({
    name: "create_florido_style_booking",
    title: "Reservar cita en Florido Style",
    description: "Crea una cita real de una hora en Florido Style para un servicio, fecha y hora disponibles.",
    inputSchema: {
      type: "object",
      properties: {
        customerName: { type: "string", minLength: 2, maxLength: 60 },
        phone: { type: "string", minLength: 6, maxLength: 20 },
        service: { type: "string", enum: allowedServices },
        date: { type: "string", pattern: "^\\d{4}-\\d{2}-\\d{2}$" },
        time: { type: "string", enum: SLOTS }
      },
      required: ["customerName", "phone", "service", "date", "time"],
      additionalProperties: false
    },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    async execute(input) {
      if (!allowedServices.includes(input.service) || !isWeekday(input.date) || !SLOTS.includes(input.time)) {
        throw new Error("Servicio, fecha u hora no válidos.");
      }
      const available = await getAvailableSlots(input.date);
      if (!available.includes(input.time)) throw new Error("La hora seleccionada ya no está disponible.");
      const booking = {
        name: input.customerName.trim(), phone: input.phone.trim(), service: input.service,
        date: input.date, time: input.time
      };
      await createBooking(booking);
      document.querySelector("#confirmation-text").textContent =
        `${booking.name}, tu ${booking.service.toLowerCase()} está reservado para el ${formatDate(booking.date)} a las ${booking.time}.`;
      dialog.showModal();
      return { status: "confirmed", service: booking.service, date: booking.date, time: booking.time };
    }
  })).catch(() => {});
}

registerBookingTool();
