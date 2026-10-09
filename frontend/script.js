
"use strict";

// ============================================
// MEDIVAULT FRONTEND CONFIGURATION
// ============================================

const API_BASE_URL = "http://localhost:5000/api";

// Keep the token in memory instead of localStorage.
// Reloading the page will require logging in again.
let authToken = "";
let currentUser = null;
let medicines = [];
let toastTimer = null;

// ============================================
// DOM ELEMENTS
// ============================================

const loginSection = document.getElementById("loginSection");
const dashboardSection = document.getElementById("dashboardSection");

const loginForm = document.getElementById("loginForm");
const loginMessage = document.getElementById("loginMessage");

const userName = document.getElementById("userName");
const userRole = document.getElementById("userRole");

const totalMedicines = document.getElementById("totalMedicines");
const totalUnits = document.getElementById("totalUnits");
const lowStockCount = document.getElementById("lowStockCount");
const nearExpiryCount = document.getElementById("nearExpiryCount");

const medicineTableBody = document.getElementById("medicineTableBody");
const tableCount = document.getElementById("tableCount");

const searchInput = document.getElementById("searchInput");
const categoryFilter = document.getElementById("categoryFilter");
const statusFilter = document.getElementById("statusFilter");

const lowStockList = document.getElementById("lowStockList");
const nearExpiryList = document.getElementById("nearExpiryList");

const medicineModal = document.getElementById("medicineModal");
const medicineForm = document.getElementById("medicineForm");
const medicineFormMessage = document.getElementById("medicineFormMessage");

const modalTitle = document.getElementById("modalTitle");
const medicineIdInput = document.getElementById("medicineId");

const toast = document.getElementById("toast");

// ============================================
// HELPER FUNCTIONS
// ============================================

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => {
        const replacements = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        };

        return replacements[character];
    });
}

function showToast(message, isError = false) {
    toast.textContent = message;
    toast.classList.toggle("toast-error", isError);
    toast.classList.add("show");

    clearTimeout(toastTimer);

    toastTimer = setTimeout(() => {
        toast.classList.remove("show");
    }, 3500);
}

function setMessage(element, message, type = "") {
    element.textContent = message;
    element.className = "message";

    if (type) {
        element.classList.add(type);
    }
}

function formatCurrency(value) {
    return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 2
    }).format(Number(value) || 0);
}

function formatDate(value) {
    if (!value) return "—";

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "Invalid date";
    }

    return date.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "UTC"
    });
}

function isLowStock(medicine) {
    return Number(medicine.quantity) <= Number(medicine.reorderLevel);
}

function isNearExpiry(medicine) {
    if (!medicine.expiryDate) return false;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const expiry = new Date(medicine.expiryDate);
    expiry.setHours(0, 0, 0, 0);

    const daysRemaining = Math.floor(
        (expiry.getTime() - today.getTime()) / 86400000
    );

    return daysRemaining >= 0 && daysRemaining <= 90;
}

// ============================================
// API REQUEST HELPER
// ============================================

async function apiRequest(path, options = {}) {
    const headers = {
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {})
    };

    if (authToken) {
        headers.Authorization = `Bearer ${authToken}`;
    }

    let response;

    try {
        response = await fetch(`${API_BASE_URL}${path}`, {
            ...options,
            headers
        });
    } catch (error) {
        throw new Error(
            "Cannot connect to the MediVault server. Check that your backend is running."
        );
    }

    let data;

    try {
        data = await response.json();
    } catch {
        data = {};
    }

    if (response.status === 401 && authToken) {
        logout(false);
        throw new Error(
            "Your session has expired. Please log in again."
        );
    }

    if (!response.ok) {
        throw new Error(
            data.message || `Request failed with status ${response.status}.`
        );
    }

    return data;
}

// ============================================
// LOGIN
// ============================================

loginForm.addEventListener("submit", async event => {
    event.preventDefault();

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    const submitButton = loginForm.querySelector(
        'button[type="submit"]'
    );

    submitButton.disabled = true;
    setMessage(loginMessage, "Logging in...");

    try {
        const data = await apiRequest("/auth/login", {
            method: "POST",
            body: JSON.stringify({
                email,
                password
            })
        });

        if (!data.token || !data.user) {
            throw new Error("The login response is missing user or token information.");
        }

        authToken = data.token;
        currentUser = data.user;

        userName.textContent = currentUser.name || currentUser.email;
        userRole.textContent = currentUser.role || "user";

        loginSection.hidden = true;
        dashboardSection.hidden = false;

        loginForm.reset();

        await refreshDashboard();

        showToast("Welcome to MediVault!");

    } catch (error) {
        authToken = "";
        currentUser = null;

        loginSection.hidden = false;
        dashboardSection.hidden = true;

        setMessage(loginMessage, error.message, "error");
    } finally {
        submitButton.disabled = false;
    }
});

// ============================================
// LOGOUT
// ============================================

function logout(showMessage = true) {
    authToken = "";
    currentUser = null;
    medicines = [];

    loginSection.hidden = false;
    dashboardSection.hidden = true;

    userName.textContent = "Pharmacy User";
    userRole.textContent = "Not logged in";

    loginForm.reset();
    medicineForm.reset();

    medicineTableBody.replaceChildren();

    totalMedicines.textContent = "—";
    totalUnits.textContent = "—";
    lowStockCount.textContent = "—";
    nearExpiryCount.textContent = "—";

    lowStockList.replaceChildren();
    nearExpiryList.replaceChildren();

    if (showMessage) {
        setMessage(loginMessage, "You have logged out.", "success");
    }
}

document.getElementById("logoutBtn").addEventListener("click", () => {
    logout();
});

// ============================================
// LOAD DASHBOARD DATA
// ============================================

async function refreshDashboard() {
    if (!authToken) return;

    try {
        await loadMedicines();
        await loadAlerts();
    } catch (error) {
        showToast(error.message, true);
        throw error;
    }
}

document.getElementById("refreshBtn").addEventListener("click", async () => {
    try {
        await refreshDashboard();
        showToast("Dashboard refreshed successfully.");
    } catch {
        // The API helper already displays the error.
    }
});

// ============================================
// LOAD MEDICINES
// ============================================

async function loadMedicines() {
    const params = new URLSearchParams();

    const search = searchInput.value.trim();
    const category = categoryFilter.value;
    const status = statusFilter.value;

    if (search) params.set("search", search);
    if (category) params.set("category", category);
    if (status) params.set("status", status);

    const query = params.toString();

    const data = await apiRequest(
        `/medicines${query ? `?${query}` : ""}`
    );

    medicines = data.medicines || [];

    renderMedicineTable(medicines);
    updateStatistics(medicines);
    updateCategoryFilter(medicines);
}

// ============================================
// RENDER MEDICINE TABLE
// ============================================

function renderMedicineTable(list) {
    medicineTableBody.replaceChildren();

    if (list.length === 0) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");

        cell.colSpan = 7;
        cell.className = "empty-state";
        cell.textContent = "No medicines found.";

        row.appendChild(cell);
        medicineTableBody.appendChild(row);
    }

    for (const medicine of list) {
        const row = document.createElement("tr");

        const stockClass = isLowStock(medicine)
            ? "stock-low"
            : "stock-normal";

        const statusClass = medicine.status === "active"
            ? "status-active"
            : "status-inactive";

        const cells = [
            `
                <div class="medicine-name">${escapeHTML(medicine.medicineName)}</div>
                <div class="medicine-generic">${escapeHTML(medicine.genericName || "No generic name")}</div>
            `,
            escapeHTML(medicine.batchNumber),
            `<span class="price-value">${formatCurrency(medicine.sellingPrice)}</span>`,
            `<span class="stock-value ${stockClass}">${escapeHTML(medicine.quantity)}</span>`,
            escapeHTML(formatDate(medicine.expiryDate)),
            `<span class="status-badge ${statusClass}">${escapeHTML(medicine.status)}</span>`,
            `
                <div class="row-actions">
                    <button class="action-btn" data-action="edit" data-id="${escapeHTML(medicine._id)}">Edit</button>
                    ${
                        currentUser?.role === "admin"
                            ? `<button class="action-btn delete-btn" data-action="delete" data-id="${escapeHTML(medicine._id)}">Delete</button>`
                            : ""
                    }
                </div>
            `
        ];

        for (const content of cells) {
            const cell = document.createElement("td");
            cell.innerHTML = content;
            row.appendChild(cell);
        }

        medicineTableBody.appendChild(row);
    }

    tableCount.textContent =
        `${list.length} ${list.length === 1 ? "medicine" : "medicines"}`;
}

// ============================================
// UPDATE STATISTICS
// ============================================

function updateStatistics(list) {
    totalMedicines.textContent = list.length;

    const units = list.reduce(
        (total, medicine) => total + Number(medicine.quantity || 0),
        0
    );

    totalUnits.textContent = units.toLocaleString("en-IN");

    lowStockCount.textContent = list.filter(
        medicine =>
            medicine.status === "active" && isLowStock(medicine)
    ).length;

    nearExpiryCount.textContent = list.filter(
        medicine =>
            medicine.status === "active" && isNearExpiry(medicine)
    ).length;
}

// ============================================
// CATEGORY FILTER
// ============================================

function updateCategoryFilter(list) {
    const selectedCategory = categoryFilter.value;

    const categories = [
        ...new Set(
            list
                .map(medicine => medicine.category)
                .filter(Boolean)
        )
    ].sort((a, b) => a.localeCompare(b));

    categoryFilter.replaceChildren();

    const allOption = document.createElement("option");
    allOption.value = "";
    allOption.textContent = "All categories";
    categoryFilter.appendChild(allOption);

    for (const category of categories) {
        const option = document.createElement("option");
        option.value = category;
        option.textContent = category;
        categoryFilter.appendChild(option);
    }

    if (categories.includes(selectedCategory)) {
        categoryFilter.value = selectedCategory;
    }
}

// ============================================
// SEARCH AND FILTER EVENTS
// ============================================

let searchTimer;

searchInput.addEventListener("input", () => {
    clearTimeout(searchTimer);

    searchTimer = setTimeout(async () => {
        try {
            await loadMedicines();
        } catch (error) {
            showToast(error.message, true);
        }
    }, 300);
});

categoryFilter.addEventListener("change", async () => {
    try {
        await loadMedicines();
    } catch (error) {
        showToast(error.message, true);
    }
});

statusFilter.addEventListener("change", async () => {
    try {
        await loadMedicines();
    } catch (error) {
        showToast(error.message, true);
    }
});

// ============================================
// LOAD LOW-STOCK AND NEAR-EXPIRY ALERTS
// ============================================

async function loadAlerts() {
    const [lowData, expiryData] = await Promise.all([
        apiRequest("/medicines/alerts/low-stock"),
        apiRequest("/medicines/alerts/near-expiry?days=90")
    ]);

    lowStockCount.textContent = lowData.count ?? 0;
    nearExpiryCount.textContent = expiryData.count ?? 0;

    renderAlertList(
        lowStockList,
        lowData.medicines || [],
        "No low-stock medicines."
    );

    renderAlertList(
        nearExpiryList,
        expiryData.medicines || [],
        "No medicines nearing expiry.",
        true
    );
}

function renderAlertList(container, list, emptyMessage, showExpiry = false) {
    container.replaceChildren();

    if (list.length === 0) {
        const item = document.createElement("li");
        item.textContent = emptyMessage;
        container.appendChild(item);
        return;
    }

    for (const medicine of list.slice(0, 5)) {
        const item = document.createElement("li");

        const title = document.createElement("strong");
        title.textContent = medicine.medicineName;

        const detail = document.createElement("span");

        if (showExpiry) {
            detail.textContent =
                `Batch ${medicine.batchNumber} · Expires ${formatDate(medicine.expiryDate)}`;
        } else {
            detail.textContent =
                `Stock: ${medicine.quantity} · Reorder at ${medicine.reorderLevel}`;
        }

        item.append(title, detail);
        container.appendChild(item);
    }
}

// ============================================
// OPEN AND CLOSE MEDICINE FORM
// ============================================

function openMedicineModal(medicine = null) {
    if (
        !currentUser ||
        !["admin", "pharmacist", "storekeeper"].includes(currentUser.role)
    ) {
        showToast("You do not have permission to manage medicines.", true);
        return;
    }

    medicineForm.reset();
    medicineIdInput.value = "";

    document.getElementById("gstPercentage").value = "0";
    document.getElementById("reorderLevel").value = "10";
    document.getElementById("prescriptionRequired").value = "false";
    document.getElementById("medicineStatus").value = "active";

    setMessage(medicineFormMessage, "");

    if (medicine) {
        modalTitle.textContent = "Edit Medicine";
        medicineIdInput.value = medicine._id;

        document.getElementById("medicineName").value =
            medicine.medicineName || "";

        document.getElementById("genericName").value =
            medicine.genericName || "";

        document.getElementById("category").value =
            medicine.category || "";

        document.getElementById("batchNumber").value =
            medicine.batchNumber || "";

        document.getElementById("manufacturer").value =
            medicine.manufacturer || "";

        document.getElementById("barcode").value =
            medicine.barcode || "";

        document.getElementById("purchasePrice").value =
            medicine.purchasePrice ?? 0;

        document.getElementById("sellingPrice").value =
            medicine.sellingPrice ?? 0;

        document.getElementById("gstPercentage").value =
            medicine.gstPercentage ?? 0;

        document.getElementById("quantity").value =
            medicine.quantity ?? 0;

        document.getElementById("reorderLevel").value =
            medicine.reorderLevel ?? 10;

        document.getElementById("expiryDate").value =
            medicine.expiryDate
                ? new Date(medicine.expiryDate).toISOString().slice(0, 10)
                : "";

        document.getElementById("prescriptionRequired").value =
            String(Boolean(medicine.prescriptionRequired));

        document.getElementById("medicineStatus").value =
            medicine.status || "active";
    } else {
        modalTitle.textContent = "Add Medicine";
    }

    medicineModal.hidden = false;
}

function closeMedicineModal() {
    medicineModal.hidden = true;
    medicineForm.reset();
    setMessage(medicineFormMessage, "");
}

document.getElementById("addMedicineBtn").addEventListener("click", () => {
    openMedicineModal();
});

document.getElementById("closeModalBtn").addEventListener(
    "click",
    closeMedicineModal
);

document.getElementById("cancelModalBtn").addEventListener(
    "click",
    closeMedicineModal
);

medicineModal.addEventListener("click", event => {
    if (event.target === medicineModal) {
        closeMedicineModal();
    }
});

document.addEventListener("keydown", event => {
    if (event.key === "Escape" && !medicineModal.hidden) {
        closeMedicineModal();
    }
});

// ============================================
// ADD OR UPDATE MEDICINE
// ============================================

medicineForm.addEventListener("submit", async event => {
    event.preventDefault();

    const id = medicineIdInput.value;

    const medicine = {
        medicineName: document.getElementById("medicineName").value.trim(),
        genericName: document.getElementById("genericName").value.trim(),
        category: document.getElementById("category").value.trim(),
        batchNumber: document.getElementById("batchNumber").value.trim(),
        manufacturer: document.getElementById("manufacturer").value.trim(),
        barcode: document.getElementById("barcode").value.trim(),
        purchasePrice: Number(document.getElementById("purchasePrice").value),
        sellingPrice: Number(document.getElementById("sellingPrice").value),
        gstPercentage: Number(document.getElementById("gstPercentage").value),
        quantity: Number(document.getElementById("quantity").value),
        reorderLevel: Number(document.getElementById("reorderLevel").value),
        expiryDate: document.getElementById("expiryDate").value,
        prescriptionRequired:
            document.getElementById("prescriptionRequired").value === "true",
        status: document.getElementById("medicineStatus").value
    };

    const integerFields = ["quantity", "reorderLevel"];

    for (const field of integerFields) {
        if (!Number.isInteger(medicine[field]) || medicine[field] < 0) {
            setMessage(
                medicineFormMessage,
                `${field} must be a non-negative whole number.`,
                "error"
            );
            return;
        }
    }

    if (
        medicine.purchasePrice < 0 ||
        medicine.sellingPrice < 0 ||
        medicine.gstPercentage < 0 ||
        medicine.gstPercentage > 100
    ) {
        setMessage(
            medicineFormMessage,
            "Check the prices and GST percentage.",
            "error"
        );
        return;
    }

    const submitButton = medicineForm.querySelector(
        'button[type="submit"]'
    );

    submitButton.disabled = true;
    setMessage(medicineFormMessage, "Saving medicine...");

    try {
        const data = await apiRequest(
            id ? `/medicines/${encodeURIComponent(id)}` : "/medicines",
            {
                method: id ? "PUT" : "POST",
                body: JSON.stringify(medicine)
            }
        );

        closeMedicineModal();

        await refreshDashboard();

        showToast(data.message || "Medicine saved successfully.");
    } catch (error) {
        setMessage(medicineFormMessage, error.message, "error");
    } finally {
        submitButton.disabled = false;
    }
});

// ============================================
// EDIT AND DELETE ACTIONS
// ============================================

medicineTableBody.addEventListener("click", async event => {
    const button = event.target.closest("button[data-action]");

    if (!button) return;

    const id = button.dataset.id;
    const action = button.dataset.action;

    const medicine = medicines.find(item => item._id === id);

    if (!medicine) {
        showToast("Medicine not found in the current list. Refresh and try again.", true);
        return;
    }

    if (action === "edit") {
        openMedicineModal(medicine);
        return;
    }

    if (action === "delete") {
        if (currentUser?.role !== "admin") {
            showToast("Only admins can delete medicines.", true);
            return;
        }

        const confirmed = window.confirm(
            `Are you sure you want to delete ${medicine.medicineName}, batch ${medicine.batchNumber}?`
        );

        if (!confirmed) return;

        try {
            const data = await apiRequest(
                `/medicines/${encodeURIComponent(id)}`,
                { method: "DELETE" }
            );

            await refreshDashboard();

            showToast(data.message || "Medicine deleted successfully.");
        } catch (error) {
            showToast(error.message, true);
        }
    }
});

// ============================================
// NAVIGATION
// ============================================

document.querySelectorAll(".nav-link").forEach(link => {
    link.addEventListener("click", () => {
        document.querySelectorAll(".nav-link").forEach(item => {
            item.classList.remove("active");
        });

        link.classList.add("active");

        const target = link.getAttribute("href");

        const pageTitle = document.getElementById("pageTitle");

        if (target === "#inventory") {
            pageTitle.textContent = "Inventory";
        } else if (target === "#alerts") {
            pageTitle.textContent = "Stock Alerts";
        } else {
            pageTitle.textContent = "Dashboard";
        }
    });
});

// ============================================
// INITIAL PAGE STATE
// ============================================

loginSection.hidden = false;
dashboardSection.hidden = true;
medicineModal.hidden = true;

console.log("MediVault frontend loaded successfully.");
