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
  // whether to respect server-provided Register_Id on initial load.
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
    '1|2025-11-03|1': [
      { Appoitment_Id: 7909, Date:'2025-11-03', TimeFrom:'2025-11-03T09:00:00', TimeTo:'2025-11-03T09:30:00', Status:1, Description_En:'Available' },
      { Appoitment_Id: 7910, Date:'2025-11-03', TimeFrom:'2025-11-03T10:00:00', TimeTo:'2025-11-03T10:30:00', Status:2, Description_En:'Available' }
    ],
    '1|2025-11-03|2': [
      { Appoitment_Id: 7920, Date:'2025-11-03', TimeFrom:'2025-11-03T09:00:00', TimeTo:'2025-11-03T09:30:00', Status:1, Description_En:'Available' },
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
   View / Details support
   ==================== */

/**
 * Fetch appointment details for a specific appointment or resource/date.
 * If `appId` provided, try to find exact appointment in server response (or slotsMap).
 * If slotObj provided directly, uses that immediately.
 * Returns a slot-like object or null.
 */
async function fetchAppointmentDetails({ customerId, dateStr, resourceId, appId = null, slotObj = null }) {
  // if slot object provided, use it directly (fast path)
  if (slotObj) {
    return slotObj;
  }

  // try to look in in-memory slotsMap first
  if (slotsMap[String(resourceId)]) {
    const found = (slotsMap[String(resourceId)] || []).find(s => {
      if (appId && s.Appoitment_Id) return String(s.Appoitment_Id) === String(appId);
      return false;
    });
    if (found) return found;
  }

  // otherwise fetch from API (same endpoint)
  try {
    const arr = await fetchSlotsForResource(customerId, dateStr, resourceId);
    if (!arr || arr.length === 0) return null;
    if (appId) {
      const f = arr.find(s => String(s.Appoitment_Id) === String(appId));
      if (f) return f;
    }
    // fallback: return first slot (if no appId)
    return arr[0] || null;
  } catch (err) {
    console.warn('fetchAppointmentDetails error', err);
    return null;
  }
}

/* Render view modal table from a slot-like object */
function openViewModal(slotObj) {
  const viewModal = $('#viewModal');
  const wrap = $('#viewTableWrap');
  if (!slotObj) {
    wrap.innerHTML = `<div style="padding:12px;color:var(--muted)">No details available for this selection.</div>`;
  } else {
    // Map API fields to display fields
    const rows = [
      ['Appointment No', slotObj.Appoitment_Id ?? '—'],
      ['Resource ID', slotObj.Resource_Id ?? slotObj.ResourceId ?? '—'],
      ['Appointment Date', slotObj.Date ?? (slotObj.TimeFrom ? slotObj.TimeFrom.split('T')[0] : '—')],
      ['Time From', slotObj.TimeFrom ? fmtTime(slotObj.TimeFrom) : '—'],
      ['Time To', slotObj.TimeTo ? fmtTime(slotObj.TimeTo) : '—'],
      ['Status', slotObj.Description_En ?? (slotObj.Status === 1 ? 'Available' : slotObj.Status) ?? '—'],
      ['Registered User ID', slotObj.Register_Id ?? '—'],
      ['Register Subscribe No', slotObj.Register_Subscribe_Number ?? '—'],
      ['Full Name', slotObj.Full_Name ?? '—'],
      ['Phone', slotObj.Phone ?? '—'],
      ['Birth Date', slotObj.Birth_Date ?? '—'],
      ['Color', slotObj.Color ?? '—'],
      ['Notes', slotObj.Description_Ar ?? '—']
    ];

    // build table HTML
    let html = `<div class="view-table-wrap"><table class="view-table">`;
    rows.forEach(([k,v]) => {
      html += `<tr><th>${k}</th><td>${v}</td></tr>`;
    });
    html += `</table></div>`;
    wrap.innerHTML = html;
  }

  // show modal
  viewModal.setAttribute('aria-hidden','false');
  viewModal.style.visibility = 'visible';
  viewModal.style.opacity = '1';
}

/* Close view modal */
function closeViewModal() {
  const viewModal = $('#viewModal');
  $('#viewTableWrap').innerHTML = '';
  viewModal.setAttribute('aria-hidden','true');
  viewModal.style.visibility = 'hidden';
  viewModal.style.opacity = '0';
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
        slotEl.addEventListener('click', () => onSlotClick(matched, r));
        col.appendChild(slotEl);
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
  const serverRegistered = slotObj.Register_Id && Number(slotObj.Register_Id) === custId;
  const isRegistered = (registeredSlot && registeredSlot.Appoitment_Id === slotObj.Appoitment_Id)
                       || (CONFIG.RESPECT_SERVER_REGISTERED && serverRegistered);

  if (isRegistered) {
    alert('This slot is already registered for you.');
    return;
  }

  if (!registeredSlot) {
    openModal('register', { slot: slotObj, resource, customerId: custId });
    return;
  }

  openModal('update', { old: registeredSlot, slot: slotObj, resource, customerId: custId });
}

/* ====================
   Modal logic (one modal handles both register & update)
   ==================== */
const modalEl = $('#modal');
const modalTitle = $('#modalTitle');
const modalBody = $('#modalBody');
const modalActions = $('#modalActions');
const modalConfirm = $('#modalConfirm');
const modalCancel = $('#modalCancel');
const modalClose = $('#modalClose');

let modalContext = null; // store context for confirm handler

function openModal(mode, ctx) {
  modalContext = { mode, ctx };
  modalEl.setAttribute('aria-hidden','false');
  modalEl.style.visibility = 'visible';
  modalEl.style.opacity = '1';

  // common cancel button exists
  // we will rebuild modal-actions to include view buttons conditionally
  modalBody.innerHTML = '';
  modalActions.innerHTML = '';

  if (mode === 'register') {
    modalTitle.textContent = 'Register Appointment (mock)';
    modalBody.innerHTML = `
      <p>Resource: <strong>${ctx.resource.Name_En}</strong> (ID: ${ctx.resource.ID})</p>
      <p>Slot time: <strong>${fmtTime(ctx.slot.TimeFrom)} — ${fmtTime(ctx.slot.TimeTo)}</strong></p>
      <p>Customer ID: <strong>${ctx.customerId}</strong></p>
      <p>Action: This will <strong>mark this slot as registered</strong> (mock). Placeholder included for real API POST.</p>
    `;
    // Add View Details button (register modal only)
    const viewBtn = document.createElement('button');
    viewBtn.className = 'btn';
    viewBtn.textContent = 'View Details';
    viewBtn.addEventListener('click', async () => {
      // open view modal using slot object directly (fast)
      const slot = await fetchAppointmentDetails({ customerId: ctx.customerId, dateStr: $('#datePicker').value, resourceId: ctx.resource.ID, slotObj: ctx.slot });
      openViewModal(slot);
    });
    modalActions.appendChild(viewBtn);

    // Confirm button
    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'btn primary';
    confirmBtn.id = 'modalConfirm';
    confirmBtn.textContent = 'Register';
    confirmBtn.addEventListener('click', () => handleModalConfirm('register', ctx));
    modalActions.appendChild(confirmBtn);

    // Cancel
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn';
    cancelBtn.id = 'modalCancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', closeModal);
    modalActions.appendChild(cancelBtn);

  } else if (mode === 'update') {
    modalTitle.textContent = 'Update Appointment (mock)';
    const oldTime = (ctx.old && ctx.old.TimeFrom) ? fmtTime(ctx.old.TimeFrom) + ' — ' + fmtTime(ctx.old.TimeTo) : '(current registration)';
    modalBody.innerHTML = `
      <p>Current registration: <strong>${oldTime}</strong> (mock)</p>
      <p>New slot: <strong>${fmtTime(ctx.slot.TimeFrom)} — ${fmtTime(ctx.slot.TimeTo)}</strong></p>
      <p>Resource: <strong>${ctx.resource.Name_En}</strong> (ID: ${ctx.resource.ID})</p>
      <p>Customer ID: <strong>${ctx.customerId}</strong></p>
      <p>Action: This will <strong>move your registration</strong> to the new slot (mock). Placeholder included for real API PUT.</p>
    `;

    // View Current button
    const viewCurrent = document.createElement('button');
    viewCurrent.className = 'btn';
    viewCurrent.textContent = 'View Current';
    viewCurrent.addEventListener('click', async () => {
      // use registeredSlot or ctx.old to fetch details
      const current = ctx.old && ctx.old.Appoitment_Id ? ctx.old : registeredSlot;
      if (!current) {
        alert('No current registration available.');
        return;
      }
      // try find details by Appoitment_Id
      const slot = await fetchAppointmentDetails({ customerId: ctx.customerId, dateStr: $('#datePicker').value, resourceId: current.Resource_Id || ctx.resource.ID, appId: current.Appoitment_Id });
      openViewModal(slot);
    });
    modalActions.appendChild(viewCurrent);

    // View Updating button (show new slot details)
    const viewUpdating = document.createElement('button');
    viewUpdating.className = 'btn';
    viewUpdating.textContent = 'View Updating';
    viewUpdating.addEventListener('click', async () => {
      const slot = await fetchAppointmentDetails({ customerId: ctx.customerId, dateStr: $('#datePicker').value, resourceId: ctx.resource.ID, slotObj: ctx.slot });
      openViewModal(slot);
    });
    modalActions.appendChild(viewUpdating);

    // Confirm update button
    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'btn primary';
    confirmBtn.id = 'modalConfirm';
    confirmBtn.textContent = 'Confirm update';
    confirmBtn.addEventListener('click', () => handleModalConfirm('update', ctx));
    modalActions.appendChild(confirmBtn);

    // Cancel
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn';
    cancelBtn.id = 'modalCancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', closeModal);
    modalActions.appendChild(cancelBtn);
  }
}

function closeModal() {
  modalContext = null;
  modalEl.setAttribute('aria-hidden','true');
  modalEl.style.visibility = 'hidden';
  modalEl.style.opacity = '0';
}

/* Centralized confirm handler used by register/update buttons */
async function handleModalConfirm(mode, ctx) {
  try {
    if (mode === 'register') {
      // MOCK register
      const newId = Date.now();
      registeredSlot = {
        Appoitment_Id: newId,
        Resource_Id: ctx.resource.ID,
        TimeFrom: ctx.slot.TimeFrom,
        TimeTo: ctx.slot.TimeTo
      };
      ctx.slot.Register_Id = ctx.customerId;
      ctx.slot.Appoitment_Id = newId;
      setStatus('Registered (mock): slot marked as dark green');
      closeModal();
      renderGrid($('#datePicker').value || isoDateString(new Date()));
      alert('Appointment registered (mock).');
    } else if (mode === 'update') {
      const old = ctx.old;
      const newSlot = ctx.slot;
      if (old && old.Appoitment_Id) {
        const prevResSlots = slotsMap[String(old.Resource_Id)] || [];
        const prevObj = prevResSlots.find(s => s.Appoitment_Id === old.Appoitment_Id);
        if (prevObj) {
          delete prevObj.Register_Id;
        }
      }
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
}

/* Cancel & Close handlers for modal close buttons */
document.addEventListener('click', (e) => {
  if (e.target && e.target.id === 'modalClose') closeModal();
});

/* ====================
   View modal close handlers
   ==================== */
document.addEventListener('click', (e) => {
  if (e.target && e.target.id === 'viewModalClose') closeViewModal();
  if (e.target && e.target.id === 'viewCloseBtn') closeViewModal();
});

/* ====================
   Main load flow
   ==================== */
document.addEventListener('DOMContentLoaded', () => {
  $('#modeSelect').value = MODE;
  $('#customerInput').value = CONFIG.CUSTOMER_ID;
  const today = isoDateString(new Date());
  $('#datePicker').value = today;

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
    resources = (resources || []).map(r => ({ ...r, ID: String(r.ID) }));
    if (!resources || resources.length === 0) {
      setStatus('No resources returned', true);
      $('#gridWrap').hidden = true;
      $('#noData').hidden = false;
      return;
    }

    // Clear any session-registered slot on initial load
    registeredSlot = null;

    // load slots for each resource concurrently
    setStatus('Loading slots for all resources...');
    slotsMap = {};
    const promises = resources.map(async (r) => {
      const arr = await fetchSlotsForResource(customerId, dateStr, r.ID);
      slotsMap[String(r.ID)] = (arr || []).map(s => ({ ...s }));
      if (CONFIG.RESPECT_SERVER_REGISTERED) {
        (slotsMap[String(r.ID)] || []).forEach(s => {
          if (s.Register_Id && Number(s.Register_Id) === Number(customerId)) {
            registeredSlot = { Appoitment_Id: s.Appoitment_Id, Resource_Id: r.ID, TimeFrom: s.TimeFrom, TimeTo: s.TimeTo };
          }
        });
      }
    });

    await Promise.all(promises);
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
   - Add appointment (POST): implement in handleModalConfirm register block.
   - Update appointment (PUT): implement in handleModalConfirm update block.
   - fetchAppointmentDetails uses the same GetAppointment endpoint to populate view table.
   ==================== */
