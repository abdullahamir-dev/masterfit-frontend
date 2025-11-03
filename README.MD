
## 🗓️ MasterFit Appointment Booking (Frontend)

### Overview

This module implements the **frontend of the MasterFit appointment system**, built using **HTML5, CSS3, and Vanilla JavaScript** — without any front-end frameworks.
It currently supports **two live API integrations** and **mock-based appointment registration/update logic**, designed for easy future API expansion.

---

### 🚀 Features Implemented

#### ✅ Phase 1 – Completed

1. **Get Resources / Services**

   * Uses live API endpoint:

     ```
     http://66.94.119.235/Masterfit_Api/api/MasterFit_Calender_Get_Appt_Resource_Nutration?Customer_Id={id}
     ```
   * Dynamically fetches and lists all available resources for a given customer.

2. **Get Appointment Slots**

   * Uses live API endpoint:

     ```
     http://66.94.119.235/Masterfit_Api/api/MasterFit_APP_GetAppointment/Calender?Customer_Id={id}&Date={yyyy-mm-dd}&Resource_Id={id}
     ```
   * Populates all slots in the **resource-slot grid** for the selected date.

3. **Interactive Calendar Grid (Modern UI)**

   * Resource-wise slot grid layout.
   * Light green boxes = available slots.
   * Dark green box = registered slot (mock behavior).
   * Responsive and modern CSS styling.

4. **Mock Appointment Flow**

   * **Register Slot (Mock):**
     Click on a light green slot → opens registration modal → confirms booking → slot turns dark green.
   * **Update Slot (Mock):**
     If user already registered, clicking a new slot opens update modal → confirm update → new slot turns dark green, old reverts to light green.
   * **Already Registered Alert:**
     Clicking again on the same dark green slot shows:
     `"This slot is already registered for you."`

---

### 🧩 Future API Integration (Placeholders)

These placeholders are pre-configured in `main.js` for easy plug-in once the backend APIs are ready.

| Feature            | Placeholder                                         | Description                                    |
| ------------------ | --------------------------------------------------- | ---------------------------------------------- |
| Add Appointment    | `// TODO: Add API POST for register appointment`    | Replace mock register logic with live POST API |
| Update Appointment | `// TODO: Add API PUT/PATCH for update appointment` | Replace mock update logic with live update API |

Once provided, just replace the mock logic with `fetch()` calls using your real endpoints — no major code restructuring required.

---

### 🛠️ File Structure

```
/project-root
│
├── index.html          # Main HTML structure (Calendar UI & modals)
├── styles.css          # Professional, responsive styling
├── main.js             # Logic, API calls, and mock update/register
└── README.md           # Project documentation (this file)
```

---

### ⚙️ Setup Instructions

1. **Open `index.html` in browser**
   No server setup required — all runs locally using `fetch()` with live GET endpoints.
2. **Configure API Base URL (if changed)**
   Edit `main.js` → update the variable:

   ```js
   const API_BASE = "http://66.94.119.235/Masterfit_Api/api";
   ```
3. **Change Customer ID for Testing**

   ```js
   const CUSTOMER_ID = 26; // Replace with your test user
   ```

---

### 💡 Notes

* The system currently simulates booking behavior via mock logic until live endpoints for:

  * **Add Appointment**
  * **Update Appointment**
    are provided.
* Once those APIs are live, integration requires only 2–3 lines of `fetch()` logic inside the placeholders.
* UI and grid are fully ready for real-time sync and validation.

---

### 🎨 Credits

Developed with 💚 using:

* **HTML5**, **CSS3**, and **Vanilla JavaScript**
* **No external frameworks or dependencies**
* Fully responsive, professional-grade grid layout and interaction design

---

 
