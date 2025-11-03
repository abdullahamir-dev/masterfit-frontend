/* main.js
   Resource × Time Grid (vanilla JS)
   - Uses two GET APIs:
     GET /MasterFit_Calender_Get_Appt_Resource_Nutration?Customer_Id={id}
     GET /MasterFit_APP_GetAppointment/Calender?Customer_Id={id}&Date={yyyy-mm-dd}&Resource_Id={id}
   - Renders a grid: columns = resources, rows = time slots (slot duration configurable).
   - Light green = available slot, Dark green = registered (for current user).
   - Register & Update actions are MOCKED (placeholders included for real API calls).
*/

/* =========================
   CONFIG - update these
   ========================= */
const CONFIG = {
  API_BASE: 'http://66.94.119.235/Masterfit_Api/api', // <- set your base
  CUSTOMER_ID: 1,    // default/hardcoded user id if not provided
  SLOT_MIN_TIME: 8,  // grid start hour (8 => 8:00)
  SLOT_MAX_TIME: 17, // grid end hour (17 => 17:00)
  SLOT_DURATION_MIN: 30, // minutes per row
  // NEW: whether to respect server-provided Register_Id on initial load.
  // Set to false to avoid slots being pre-registered on page load (recommended).
  RESPECT_SERVER_REGISTERED: false
};

/* =========================
   State
   ========================= */
let MODE = localStorage.getItem('mode') || 'live'; // 'live' or 'mock'
let resources = [];    // array of resource objects from API
let slotsMap = {};     // map: resourceId -> array of slot objects for selected date
let registeredSlot = null; // { Appoitment_Id, Resource_Id, TimeFrom, TimeTo } - current user's registered slot (mocked)
const $ = sel => document.querySelector(sel);

/* ===============
   Helpers
   =============== */
function setStatus(msg, isError = false) {
  const el = $('#status');
  el.textContent = msg;
  el.style.background = isError ? '#fff0ef' : '#fff';
  el.style.color = isError ? '#8b0000' : '#222';
}

/* format hh:mm from ISO */
function fmtTime(iso) {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
  } catch (e) { return iso; }
}

/* create date string yyyy-mm-dd */
function isoDateString(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth()+1).padStart(2,'0');
  const dd = String(d.getDate()).padStart(2,'0');
  return `${yyyy}-${mm}-${dd}`;
}

/* generate row times (array of Date objects for the given date) */
function generateRowTimes(dateStr) {
  const rows = [];
  const [y,m,d] = dateStr.split('-').map(s => parseInt(s,10));
  for (let h = CONFIG.SLOT_MIN_TIME; h <= CONFIG.SLOT_MAX_TIME; h++) {
    // step by slot duration
    const step = CONFIG.SLOT_DURATION_MIN;
    for (let mins = 0; mins < 60; mins += step) {
      const dt = new Date(y, m-1, d, h, mins, 0);
      rows.push(dt);
    }
  }
  return rows;
}

/* ====================
   Mock data (fallback)
   ==================== */
const MOCK = {
  resources: [
    { ID: '1', Name_En: 'Conference Rooms' },
    { ID: '2', Name_En: 'Board Room A' },
    { ID: '3', Name_En: 'Meeting Room B' },
    { ID: '4', Name_En: 'Personnel' }
  ],
  // map key: `${customerId}|${date}|${resourceId}`
  slots: {
    // sample: resource 1 has some slots
    '1|2025-11-03|1': [
      { Appoitment_Id: 7909, Date:'2025-11-03', TimeFrom:'2025-11-03T09:00:00', TimeTo:'2025-11-03T09:30:00', Status:1, Description_En:'Available' },
      { Appoitment_Id: 7910, Date:'2025-11-03', TimeFrom:'2025-11-03T10:00:00', TimeTo:'2025-11-03T10:30:00', Status:2, Description_En:'Available' }
    ],
    '1|2025-11-03|2': [
      { Appoitment_Id: 7920, Date:'2025-11-03', TimeFrom:'2025-11-03T09:00:00', TimeTo:'2025-11-03T09:30:00', Status:1, Description_En:'Available' },
      // NOTE: mock contains a Register_Id here — previously this meant a pre-registered slot on load.
      // With RESPECT_SERVER_REGISTERED=false (default) the UI will NOT mark this as registered on initial load.
      { Appoitment_Id: 7921, Date:'2025-11-03', TimeFrom:'2025-11-03T11:00:00', TimeTo:'2025-11-03T11:30:00', Status:1, Description_En:'Available', Register_Id: CONFIG.CUSTOMER_ID }
    ]
  }
};

/* ====================
   API wrappers
   ==================== */
async function apiGet(path) {
  const url = `${CONFIG.API_BASE}${path}`;
  if (MODE === 'mock') throw new Error('mock-mode');
  const r = await fetch(url);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

/* GET resources (first API) */
async function fetchResources(customerId) {
  const path = `/MasterFit_Calender_Get_Appt_Resource_Nutration?Customer_Id=${customerId}`;
  try {
    const data = await apiGet(path);
    return data;
  } catch (err) {
    console.warn('fetchResources failed, fallback to mock', err);
    MODE = 'mock';
    localStorage.setItem('mode', MODE);
    return MOCK.resources;
  }
}

/* GET slots for a resource (second API) */
async function fetchSlotsForResource(customerId, dateStr, resourceId) {
  const path = `/MasterFit_APP_GetAppointment/Calender?Customer_Id=${customerId}&Date=${dateStr}&Resource_Id=${resourceId}`;
  try {
    const data = await apiGet(path);
    // if server returns {"result":"failed"} treat as empty/error
    if (data && data.result === 'failed') throw new Error(data.msg_en || 'Invalid Data');
    return data;
  } catch (err) {
    console.warn('fetchSlotsForResource failed, fallback to mock', err);
    MODE = 'mock';
    localStorage.setItem('mode', MODE);
    const key = `${customerId}|${dateStr}|${resourceId}`;
    return MOCK.slots[key] || [];
  }
}

/* ====================
   Render grid
   ==================== */
function clearGrid() {
  $('#gridHeader').innerHTML = '';
  $('#gridBody').innerHTML = '';
}

/* main render function */
function renderGrid(dateStr) {
  const header = $('#gridHeader');
  const body = $('#gridBody');
  clearGrid();

  if (!resources || resources.length === 0) {
    $('#gridWrap').hidden = true;
    $('#noData').hidden = false;
    setStatus('No resources available', true);
    return;
  }

  $('#noData').hidden = true;
  $('#gridWrap').hidden = false;

  // header: time col + resource columns
  const timeCol = document.createElement('div');
  timeCol.className = 'time-col';
  timeCol.textContent = ''; // top-left blank
  header.appendChild(timeCol);

  resources.forEach(r => {
    const rc = document.createElement('div');
    rc.className = 'resource-col';
    rc.dataset.resourceId = String(r.ID);
    rc.textContent = r.Name_En || r.Name || `Res ${r.ID}`;
    header.appendChild(rc);
  });

  // compute rows
  const rows = generateRowTimes(dateStr); // array of Date
  rows.forEach(dt => {
    const rowEl = document.createElement('div');
    rowEl.className = 'row';

    const timeCol = document.createElement('div');
    timeCol.className = 'time-col';
    timeCol.textContent = dt.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
    rowEl.appendChild(timeCol);

    // resource columns
    resources.forEach(r => {
      const col = document.createElement('div');
      col.className = 'resource-col';
      col.dataset.resourceId = String(r.ID);

      // find a slot in slotsMap[r.ID] that starts exactly at dt (or within same minute)
      const slots = slotsMap[String(r.ID)] || [];
      const matched = slots.find(s => {
        const sDT = new Date(s.TimeFrom);
        // compare by minute
        return sDT.getFullYear() === dt.getFullYear()
          && sDT.getMonth() === dt.getMonth()
          && sDT.getDate() === dt.getDate()
          && sDT.getHours() === dt.getHours()
          && sDT.getMinutes() === dt.getMinutes();
      });

      if (matched) {
        const slotEl = document.createElement('div');
        // Determine status: registered (by current user) or available or booked
        // IMPORTANT CHANGE:
        // - Only treat a slot as "registered" if registeredSlot matches it (i.e. user action in this session),
        //   OR if RESPECT_SERVER_REGISTERED is true and the server-provided Register_Id matches current customer.
        const custId = Number($('#customerInput').value || CONFIG.CUSTOMER_ID);
        const serverRegistered = matched.Register_Id && Number(matched.Register_Id) === custId;
        const isRegistered = (registeredSlot && registeredSlot.Appoitment_Id && registeredSlot.Appoitment_Id === matched.Appoitment_Id)
                              || (CONFIG.RESPECT_SERVER_REGISTERED && serverRegistered);

        if (isRegistered) {
          slotEl.className = 'slot registered';
        } else if (matched.Status === 1 || /available/i.test(matched.Description_En || '')) {
          slotEl.className = 'slot available';
        } else {
          slotEl.className = 'slot booked';
        }

        // store meta on element
        slotEl.dataset.resourceId = String(r.ID);
        slotEl.dataset.appId = String(matched.Appoitment_Id || '');
        slotEl.dataset.timeFrom = matched.TimeFrom;
        slotEl.dataset.timeTo = matched.TimeTo;

        slotEl.innerHTML = `<div>${fmtTime(matched.TimeFrom)}</div><small>${matched.Description_En || ''}</small>`;
        // click behavior
        slotEl.addEventListener('click', () => onSlotClick(matched, r));
        col.appendChild(slotEl);
      } else {
        // empty cell — optionally show nothing or a small placeholder
        // leave empty for clean look
      }

      rowEl.appendChild(col);
    });

    body.appendChild(rowEl);
  });

  setStatus(`Grid loaded — ${resources.length} resources`);
}

/* ====================
   Slot click logic
   ==================== */
function onSlotClick(slotObj, resource) {
  const custId = Number($('#customerInput').value || CONFIG.CUSTOMER_ID);
  // IMPORTANT: now isRegistered only considers registeredSlot (user action) OR server if allowed by flag
  const serverRegistered = slotObj.Register_Id && Number(slotObj.Register_Id) === custId;
  const isRegistered = (registeredSlot && registeredSlot.Appoitment_Id === slotObj.Appoitment_Id)
                       || (CONFIG.RESPECT_SERVER_REGISTERED && serverRegistered);

  if (isRegistered) {
    // already registered by this user
    alert('This slot is already registered for you.');
    return;
  }

  // If user has no current registration -> Register flow
  if (!registeredSlot) {
    openModal('register', { slot: slotObj, resource, customerId: custId });
    return;
  }

  // User has a registered slot already -> Update flow (move)
  openModal('update', { old: registeredSlot, slot: slotObj, resource, customerId: custId });
}

/* ====================
   Modal logic (one modal handles both register & update)
   ==================== */
const modalEl = $('#modal');
const modalTitle = $('#modalTitle');
const modalBody = $('#modalBody');
const modalConfirm = $('#modalConfirm');
const modalCancel = $('#modalCancel');
const modalClose = $('#modalClose');

let modalContext = null; // store context for confirm handler

function openModal(mode, ctx) {
  modalContext = { mode, ctx };
  modalEl.setAttribute('aria-hidden','false');
  modalEl.style.visibility = 'visible';
  modalEl.style.opacity = '1';

  if (mode === 'register') {
    modalTitle.textContent = 'Register Appointment (mock)';
    modalBody.innerHTML = `
      <p>Resource: <strong>${ctx.resource.Name_En}</strong> (ID: ${ctx.resource.ID})</p>
      <p>Slot time: <strong>${fmtTime(ctx.slot.TimeFrom)} — ${fmtTime(ctx.slot.TimeTo)}</strong></p>
      <p>Customer ID: <strong>${ctx.customerId}</strong></p>
      <p>Action: This will <strong>mark this slot as registered</strong> (mock). Placeholder included for real API POST.</p>
    `;
    modalConfirm.textContent = 'Register';
  } else if (mode === 'update') {
    // ctx.old must include { Appoitment_Id, resourceId } or a minimal shape
    modalTitle.textContent = 'Update Appointment (mock)';
    const oldTime = (ctx.old && ctx.old.TimeFrom) ? fmtTime(ctx.old.TimeFrom) + ' — ' + fmtTime(ctx.old.TimeTo) : '(current registration)';
    modalBody.innerHTML = `
      <p>Current registration: <strong>${oldTime}</strong> (mock)</p>
      <p>New slot: <strong>${fmtTime(ctx.slot.TimeFrom)} — ${fmtTime(ctx.slot.TimeTo)}</strong></p>
      <p>Resource: <strong>${ctx.resource.Name_En}</strong> (ID: ${ctx.resource.ID})</p>
      <p>Customer ID: <strong>${ctx.customerId}</strong></p>
      <p>Action: This will <strong>move your registration</strong> to the new slot (mock). Placeholder included for real API PUT.</p>
    `;
    modalConfirm.textContent = 'Confirm update';
  }
}

function closeModal() {
  modalContext = null;
  modalEl.setAttribute('aria-hidden','true');
  modalEl.style.visibility = 'hidden';
  modalEl.style.opacity = '0';
}

/* Confirm handler (register or update in mock) */
modalConfirm.addEventListener('click', async () => {
  if (!modalContext) return;
  const { mode, ctx } = modalContext;
  try {
    if (mode === 'register') {
      // MOCK register:
      // Placeholder: here you would POST to AddAppointment endpoint.
      // Example:
      // POST /MasterFit_APP_AddAppointment
      // body: { Customer_Id, Resource_Id, TimeFrom, TimeTo, Description_En }
      //
      // After successful post, set registeredSlot and update UI.

      // simulate server response
      const newId = Date.now(); // mock ID
      registeredSlot = {
        Appoitment_Id: newId,
        Resource_Id: ctx.resource.ID,
        TimeFrom: ctx.slot.TimeFrom,
        TimeTo: ctx.slot.TimeTo
      };
      // update mocked slot object so render reflects registered state
      ctx.slot.Register_Id = ctx.customerId;
      ctx.slot.Appoitment_Id = newId;
      setStatus('Registered (mock): slot marked as dark green');
      closeModal();
      // re-render grid to reflect change
      renderGrid($('#datePicker').value || isoDateString(new Date()));
      alert('Appointment registered (mock).');
    } else if (mode === 'update') {
      // MOCK update (move):
      // Placeholder: here you would PUT to UpdateAppointment endpoint.
      // Example:
      // PUT /MasterFit_APP_UpdateAppointment
      // body: { Appoitment_Id, Customer_Id, NewTimeFrom, NewTimeTo, Resource_Id }
      //
      // After success: mark new slot registered and previous slot un-registered.

      // find old and new slot objects in slotsMap and update flags
      const old = ctx.old;   // expected shape { Appoitment_Id, Resource_Id, TimeFrom, TimeTo }
      const newSlot = ctx.slot;
      // un-register previous in slotsMap if present
      if (old && old.Appoitment_Id) {
        // find resource array and unset register marker where Appoitment_Id matches
        const prevResSlots = slotsMap[String(old.Resource_Id)] || [];
        const prevObj = prevResSlots.find(s => s.Appoitment_Id === old.Appoitment_Id);
        if (prevObj) {
          delete prevObj.Register_Id;
        }
      }
      // mark new slot as registered
      newSlot.Register_Id = ctx.customerId;
      registeredSlot = {
        Appoitment_Id: newSlot.Appoitment_Id,
        Resource_Id: ctx.resource.ID,
        TimeFrom: newSlot.TimeFrom,
        TimeTo: newSlot.TimeTo
      };
      setStatus('Updated (mock): registration moved to new slot');
      closeModal();
      renderGrid($('#datePicker').value || isoDateString(new Date()));
      alert('Appointment updated (mock).');
    }
  } catch (err) {
    console.error(err);
    setStatus('Failed to register/update (mock)', true);
    alert('Failed to register/update (see console).');
  }
});

/* Cancel & Close */
modalCancel.addEventListener('click', closeModal);
modalClose.addEventListener('click', closeModal);

/* ====================
   Main load flow
   ==================== */
document.addEventListener('DOMContentLoaded', () => {
  // init inputs
  $('#modeSelect').value = MODE;
  $('#customerInput').value = CONFIG.CUSTOMER_ID;
  const today = isoDateString(new Date());
  $('#datePicker').value = today;

  // event listeners
  $('#loadBtn').addEventListener('click', async () => {
    const dateStr = $('#datePicker').value || isoDateString(new Date());
    const custId = Number($('#customerInput').value || CONFIG.CUSTOMER_ID);
    await loadAndRender(dateStr, custId);
  });

  $('#modeSelect').addEventListener('change', (e) => {
    MODE = e.target.value;
    localStorage.setItem('mode', MODE);
    setStatus(`Mode: ${MODE}`, MODE === 'mock');
  });

  // initial load
  (async () => { await $('#loadBtn').click(); })();
});

/* load resources and all slots for selected date */
async function loadAndRender(dateStr, customerId) {
  try {
    setStatus('Loading resources...');
    resources = await fetchResources(customerId);
    // normalize resource IDs to string
    resources = (resources || []).map(r => ({ ...r, ID: String(r.ID) }));
    if (!resources || resources.length === 0) {
      setStatus('No resources returned', true);
      $('#gridWrap').hidden = true;
      $('#noData').hidden = false;
      return;
    }

    // IMPORTANT CHANGE: Clear any session-registered slot on initial load.
    // This prevents showing a pre-registered slot that blocks the register modal.
    registeredSlot = null;

    // load slots for each resource concurrently
    setStatus('Loading slots for all resources...');
    slotsMap = {};
    const promises = resources.map(async (r) => {
      const arr = await fetchSlotsForResource(customerId, dateStr, r.ID);
      // normalize array
      slotsMap[String(r.ID)] = (arr || []).map(s => ({ ...s }));
      // NOTE:
      // Previously we auto-set registeredSlot from server-provided Register_Id here.
      // That caused a pre-registered slot on load. To avoid that UX issue we now
      // only set registeredSlot when the user registers during this session.
      //
      // If you want to respect server-registered slots on load, set CONFIG.RESPECT_SERVER_REGISTERED = true,
      // and uncomment the block below (or keep the flag true to enable it).
      if (CONFIG.RESPECT_SERVER_REGISTERED) {
        (slotsMap[String(r.ID)] || []).forEach(s => {
          if (s.Register_Id && Number(s.Register_Id) === Number(customerId)) {
            registeredSlot = { Appoitment_Id: s.Appoitment_Id, Resource_Id: r.ID, TimeFrom: s.TimeFrom, TimeTo: s.TimeTo };
          }
        });
      }
    });

    await Promise.all(promises);

    // render UI
    renderGrid(dateStr);
  } catch (err) {
    console.error(err);
    setStatus('Failed to load grid', true);
    $('#gridWrap').hidden = true;
    $('#noData').hidden = false;
  }
}

/* ====================
   Notes for Integration:
   - Add appointment (POST): implement in modalConfirm 'register' block (replace mock).
   - Update appointment (PUT): implement in modalConfirm 'update' block (replace mock).
   - When server endpoints available, call fetch() to POST/PUT and then refresh grid or apply returned state.
   - Example placeholders are commented above where register/update occur.
   ==================== */
