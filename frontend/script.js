
"use strict";

// ============================================
// MEDIVAULT FRONTEND CONFIGURATION
// ============================================

const API_BASE_URL = "http://localhost:5000/api";

let authToken = "";
let currentUser = null;
let medicines = [];
let allSaleMedicines = [];
let sales = [];
let saleCart = [];
let toastTimer = null;
let searchTimer = null;

// ============================================
// DOM ELEMENTS
// ============================================

const $ = id => document.getElementById(id);

const loginSection = $("loginSection");
const appSections = $("appSections");
const dashboardSection = $("dashboardSection");
const salesSection = $("salesSection");
const newSaleSection = $("newSaleSection");

const loginForm = $("loginForm");
const loginMessage = $("loginMessage");
const userName = $("userName");
const userRole = $("userRole");

const totalMedicines = $("totalMedicines");
const totalUnits = $("totalUnits");
const lowStockCount = $("lowStockCount");
const nearExpiryCount = $("nearExpiryCount");
const expiredMedicinesCount = $("expiredMedicinesCount");
const todaySalesCount = $("todaySalesCount");
const todayRevenue = $("todayRevenue");

const medicineTableBody = $("medicineTableBody");
const tableCount = $("tableCount");
const searchInput = $("searchInput");
const categoryFilter = $("categoryFilter");
const statusFilter = $("statusFilter");

const lowStockList = $("lowStockList");
const nearExpiryList = $("nearExpiryList");
const expiredMedicinesList = $("expiredMedicinesList");

const medicineModal = $("medicineModal");
const medicineForm = $("medicineForm");
const medicineFormMessage = $("medicineFormMessage");
const modalTitle = $("modalTitle");
const medicineIdInput = $("medicineId");
const toast = $("toast");

const salesTableBody = $("salesTableBody");
const salesSearchInput = $("salesSearchInput");
const salesPaymentFilter = $("salesPaymentFilter");
const totalSalesCount = $("totalSalesCount");
const totalSalesValue = $("totalSalesValue");
const salesTableCount = $("salesTableCount");
const salesMessage = $("salesMessage");

const saleMedicineSelect = $("saleMedicineSelect");
const saleQuantityInput = $("saleQuantityInput");
const addSaleItemBtn = $("addSaleItemBtn");
const saleStockInfo = $("saleStockInfo");
const saleCartTableBody = $("saleCartTableBody");
const salePaymentMethod = $("salePaymentMethod");
const saleSubtotal = $("saleSubtotal");
const saleGST = $("saleGST");
const saleGrandTotal = $("saleGrandTotal");
const saleMessage = $("saleMessage");
const clearSaleBtn = $("clearSaleBtn");
const completeSaleBtn = $("completeSaleBtn");
const saleInvoiceResult = $("saleInvoiceResult");
const completedInvoiceNumber = $("completedInvoiceNumber");
const completedInvoiceTotal = $("completedInvoiceTotal");
const printInvoiceBtn = $("printInvoiceBtn");
const newSaleBtn = $("newSaleBtn");

// ============================================
// HELPER FUNCTIONS
// ============================================

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}

function showToast(message, isError = false) {
    if (!toast) return;

    toast.textContent = message;
    toast.classList.toggle("toast-error", isError);
    toast.classList.add("show");

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
        toast.classList.remove("show");
    }, 3500);
}

function setMessage(element, message, type = "") {
    if (!element) return;

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

function getLocalDateKey(value) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
        return "";
    }

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

// ============================================
// EXPIRY AND STOCK CHECKING
// ============================================

// MongoDB expiry dates use YYYY-MM-DD.
// Compare calendar dates to avoid timezone errors.
function getExpiryDateKey(medicine) {
    if (!medicine.expiryDate) return "";

    const key = String(medicine.expiryDate).slice(0, 10);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) {
        return "";
    }

    return key;
}

function isExpired(medicine) {
    const expiryKey = getExpiryDateKey(medicine);

    if (!expiryKey) return true;

    return expiryKey < getLocalDateKey(new Date());
}

function isLowStock(medicine) {
    return Number(medicine.quantity) <=
        Number(medicine.reorderLevel);
}

function isNearExpiry(medicine) {
    const expiryKey = getExpiryDateKey(medicine);

    if (!expiryKey) return false;

    const todayKey = getLocalDateKey(new Date());

    if (expiryKey < todayKey) {
        return false;
    }

    const expiryDate = new Date(`${expiryKey}T00:00:00Z`);
    const todayDate = new Date(`${todayKey}T00:00:00Z`);

    const days = Math.round(
        (expiryDate.getTime() - todayDate.getTime()) / 86400000
    );

    return days >= 0 && days <= 90;
}

// ============================================
// API REQUEST HELPER
// ============================================

async function apiRequest(path, options = {}) {
    const headers = {
        ...(options.body ? {
            "Content-Type": "application/json"
        } : {}),
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
    } catch {
        throw new Error(
            "Cannot connect to MediVault. Check that your backend is running."
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
            data.message ||
            `Request failed with status ${response.status}.`
        );
    }

    return data;
}

// ============================================
// PAGE NAVIGATION
// ============================================

function showPage(page) {
    if (!authToken) return;

    const pageTitle = $("pageTitle");
    const inventorySection = $("inventory");
    const alertsSection = $("alerts");

    const statsGrid = dashboardSection?.querySelector(
        ":scope > .stats-grid"
    );

    if (appSections) {
        appSections.hidden = false;
    }

    if (dashboardSection) {
        dashboardSection.hidden =
            page === "sales" || page === "new-sale";
    }

    if (salesSection) {
        salesSection.hidden = page !== "sales";
    }

    if (newSaleSection) {
        newSaleSection.hidden = page !== "new-sale";
    }

    if (statsGrid) {
        statsGrid.hidden = page !== "dashboard";
    }

    if (inventorySection) {
        inventorySection.hidden = page !== "inventory";
    }

    if (alertsSection) {
        alertsSection.hidden = page !== "alerts";
    }

    const titles = {
        dashboard: "Dashboard",
        inventory: "Inventory",
        alerts: "Stock Alerts",
        sales: "Sales History",
        "new-sale": "New Sale / Billing"
    };

    if (pageTitle) {
        pageTitle.textContent = titles[page] || "Dashboard";
    }

    document.querySelectorAll(".nav-link").forEach(link => {
        const linkPage = link.dataset.page ||
            (link.getAttribute("href") || "").replace("#", "");

        link.classList.toggle("active", linkPage === page);
    });

    if (page === "sales") {
        loadSales();
    }

    if (page === "new-sale") {
        loadSaleMedicines();
    }
}

document.querySelectorAll(".nav-link").forEach(link => {
    link.addEventListener("click", event => {
        event.preventDefault();

        const page = link.dataset.page ||
            (link.getAttribute("href") || "#dashboard")
                .replace("#", "");

        showPage(page);
    });
});

// ============================================
// LOGIN
// ============================================

if (loginForm) {
    loginForm.addEventListener("submit", async event => {
        event.preventDefault();

        const email = $("email").value.trim();
        const password = $("password").value;

        const submitButton = loginForm.querySelector(
            'button[type="submit"]'
        );

        submitButton.disabled = true;
        setMessage(loginMessage, "Logging in...");

        try {
            const data = await apiRequest("/auth/login", {
                method: "POST",
                body: JSON.stringify({ email, password })
            });

            if (!data.token || !data.user) {
                throw new Error(
                    "Login response is missing user or token information."
                );
            }

            authToken = data.token;
            currentUser = data.user;

            userName.textContent =
                currentUser.name || currentUser.email;

            userRole.textContent =
                currentUser.role || "user";

            loginSection.hidden = true;

            if (appSections) {
                appSections.hidden = false;
            }

            loginForm.reset();

            await refreshDashboard();
            showPage("dashboard");

            setMessage(loginMessage, "");
            showToast("Welcome to MediVault!");

        } catch (error) {
            authToken = "";
            currentUser = null;

            loginSection.hidden = false;

            if (appSections) {
                appSections.hidden = true;
            }

            setMessage(
                loginMessage,
                error.message,
                "error"
            );
        } finally {
            submitButton.disabled = false;
        }
    });
}

// ============================================
// LOGOUT
// ============================================

function logout(showMessage = true) {
    authToken = "";
    currentUser = null;
    medicines = [];
    allSaleMedicines = [];
    sales = [];
    saleCart = [];

    loginSection.hidden = false;

    if (appSections) appSections.hidden = true;
    if (dashboardSection) dashboardSection.hidden = true;
    if (salesSection) salesSection.hidden = true;
    if (newSaleSection) newSaleSection.hidden = true;

    userName.textContent = "Pharmacy User";
    userRole.textContent = "Not logged in";

    loginForm?.reset();
    medicineForm?.reset();
    medicineTableBody?.replaceChildren();
    salesTableBody?.replaceChildren();
    saleCartTableBody?.replaceChildren();

    for (const id of [
        "totalMedicines",
        "totalUnits",
        "lowStockCount",
        "nearExpiryCount",
        "expiredMedicinesCount",
        "todaySalesCount",
        "todayRevenue",
        "totalSalesCount",
        "totalSalesValue"
    ]) {
        if ($(id)) {
            $(id).textContent = "—";
        }
    }

    if (tableCount) tableCount.textContent = "0 medicines";
    if (salesTableCount) salesTableCount.textContent = "0 sales";

    lowStockList?.replaceChildren();
    nearExpiryList?.replaceChildren();
    expiredMedicinesList?.replaceChildren();

    setMessage(salesMessage, "");
    setMessage(saleMessage, "");

    document.querySelectorAll(".nav-link").forEach(link => {
        link.classList.remove("active");
    });

    renderSaleCart();

    if (showMessage) {
        setMessage(
            loginMessage,
            "You have logged out.",
            "success"
        );
    }
}

$("logoutBtn")?.addEventListener("click", () => logout());

// ============================================
// DASHBOARD DATA
// ============================================

async function loadTodaySales() {
    if (!authToken) return;

    try {
        const data = await apiRequest("/sales");
        const allSales = data.sales || [];

        const today = getLocalDateKey(new Date());

        const completedToday = allSales.filter(sale =>
            sale.status === "completed" &&
            getLocalDateKey(sale.createdAt) === today
        );

        const revenue = completedToday.reduce(
            (total, sale) =>
                total + Number(sale.grandTotal || 0),
            0
        );

        if (todaySalesCount) {
            todaySalesCount.textContent =
                completedToday.length;
        }

        if (todayRevenue) {
            todayRevenue.textContent =
                formatCurrency(revenue);
        }

    } catch (error) {
        if (todaySalesCount) {
            todaySalesCount.textContent = "—";
        }

        if (todayRevenue) {
            todayRevenue.textContent = "—";
        }

        console.error(
            "Unable to load today's sales:",
            error.message
        );
    }
}

// ============================================
// NEW: LOAD EXPIRED MEDICINES
// ============================================

async function loadExpiredMedicines() {
    if (!authToken) return;

    try {
        // Fetch unfiltered inventory for an accurate count.
        const data = await apiRequest("/medicines");

        const expired = (data.medicines || []).filter(
            medicine => medicine.expiryDate && isExpired(medicine)
        );

        if (expiredMedicinesCount) {
            expiredMedicinesCount.textContent =
                String(expired.length);
        }

        renderAlertList(
            expiredMedicinesList,
            expired,
            "No expired medicines.",
            true
        );

    } catch (error) {
        if (expiredMedicinesCount) {
            expiredMedicinesCount.textContent = "—";
        }

        if (expiredMedicinesList) {
            expiredMedicinesList.replaceChildren();

            const item = document.createElement("li");
            item.textContent =
                "Unable to load expired medicines.";

            expiredMedicinesList.appendChild(item);
        }

        console.error(
            "Unable to load expired medicines:",
            error.message
        );
    }
}

async function refreshDashboard() {
    if (!authToken) return;

    try {
        await loadMedicines();
        await loadAlerts();
        await loadExpiredMedicines();
        await loadTodaySales();

    } catch (error) {
        showToast(error.message, true);
        throw error;
    }
}

$("refreshBtn")?.addEventListener("click", async () => {
    try {
        await refreshDashboard();

        showToast(
            "Dashboard refreshed successfully."
        );
    } catch {
        // Error is already displayed.
    }
});

// ============================================
// LOAD MEDICINES
// ============================================

async function loadMedicines() {
    const params = new URLSearchParams();

    const search = searchInput?.value.trim() || "";
    const category = categoryFilter?.value || "";
    const status = statusFilter?.value || "";

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
// INVENTORY TABLE
// ============================================

function renderMedicineTable(list) {
    if (!medicineTableBody) return;

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

        const expired = isExpired(medicine);

        if (expired) {
            row.classList.add("expired-medicine-row");
        }

        const stockClass = isLowStock(medicine)
            ? "stock-low"
            : "stock-normal";

        const statusClass = expired
            ? "status-inactive"
            : medicine.status === "active"
                ? "status-active"
                : "status-inactive";

        const displayStatus = expired
            ? "Expired"
            : medicine.status;

        const expiryCell = expired
            ? `${escapeHTML(formatDate(medicine.expiryDate))}
               <span class="status-badge status-inactive">
                   Expired
               </span>`
            : escapeHTML(formatDate(medicine.expiryDate));

        const cells = [
            `<div class="medicine-name">
                ${escapeHTML(medicine.medicineName)}
             </div>
             <div class="medicine-generic">
                ${escapeHTML(
                    medicine.genericName || "No generic name"
                )}
             </div>`,

            escapeHTML(medicine.batchNumber),

            `<span class="price-value">
                ${formatCurrency(medicine.sellingPrice)}
             </span>`,

            `<span class="stock-value ${stockClass}">
                ${escapeHTML(medicine.quantity)}
             </span>`,

            expiryCell,

            `<span class="status-badge ${statusClass}">
                ${escapeHTML(displayStatus)}
             </span>`,

            `<div class="row-actions">
                <button
                    class="action-btn"
                    data-action="edit"
                    data-id="${escapeHTML(medicine._id)}"
                >
                    Edit
                </button>

                ${currentUser?.role === "admin"
                    ? `<button
                        class="action-btn delete-btn"
                        data-action="delete"
                        data-id="${escapeHTML(medicine._id)}"
                    >
                        Delete
                    </button>`
                    : ""}
             </div>`
        ];

        for (const content of cells) {
            const cell = document.createElement("td");
            cell.innerHTML = content;
            row.appendChild(cell);
        }

        medicineTableBody.appendChild(row);
    }

    if (tableCount) {
        tableCount.textContent =
            `${list.length} ${
                list.length === 1 ? "medicine" : "medicines"
            }`;
    }
}

// ============================================
// INVENTORY STATISTICS
// ============================================

function updateStatistics(list) {
    if (totalMedicines) {
        totalMedicines.textContent = list.length;
    }

    const units = list.reduce(
        (total, medicine) =>
            total + Number(medicine.quantity || 0),
        0
    );

    if (totalUnits) {
        totalUnits.textContent =
            units.toLocaleString("en-IN");
    }

    if (lowStockCount) {
        lowStockCount.textContent = list.filter(
            medicine =>
                medicine.status === "active" &&
                isLowStock(medicine)
        ).length;
    }

    if (nearExpiryCount) {
        nearExpiryCount.textContent = list.filter(
            medicine =>
                medicine.status === "active" &&
                isNearExpiry(medicine)
        ).length;
    }
}

function updateCategoryFilter(list) {
    if (!categoryFilter) return;

    const selectedCategory = categoryFilter.value;

    const categories = [...new Set(
        list.map(medicine => medicine.category)
            .filter(Boolean)
    )].sort((a, b) => a.localeCompare(b));

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
// INVENTORY FILTERS
// ============================================

searchInput?.addEventListener("input", () => {
    clearTimeout(searchTimer);

    searchTimer = setTimeout(async () => {
        try {
            await loadMedicines();
        } catch (error) {
            showToast(error.message, true);
        }
    }, 300);
});

categoryFilter?.addEventListener("change", async () => {
    try {
        await loadMedicines();
    } catch (error) {
        showToast(error.message, true);
    }
});

statusFilter?.addEventListener("change", async () => {
    try {
        await loadMedicines();
    } catch (error) {
        showToast(error.message, true);
    }
});

// ============================================
// STOCK ALERTS
// ============================================

async function loadAlerts() {
    const [lowData, expiryData] = await Promise.all([
        apiRequest("/medicines/alerts/low-stock"),
        apiRequest("/medicines/alerts/near-expiry?days=90")
    ]);

    if (lowStockCount) {
        lowStockCount.textContent = lowData.count ?? 0;
    }

    if (nearExpiryCount) {
        nearExpiryCount.textContent =
            expiryData.count ?? 0;
    }

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

function renderAlertList(
    container,
    list,
    emptyMessage,
    showExpiry = false
) {
    if (!container) return;

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
        const detail = document.createElement("span");

        title.textContent = medicine.medicineName;

        detail.textContent = showExpiry
            ? `Batch ${medicine.batchNumber} · Expires ${
                formatDate(medicine.expiryDate)
            }`
            : `Stock: ${medicine.quantity} · Reorder at ${
                medicine.reorderLevel
            }`;

        item.append(title, detail);
        container.appendChild(item);
    }
}

// ============================================
// MEDICINE FORM
// ============================================

function openMedicineModal(medicine = null) {
    if (
        !currentUser ||
        !["admin", "pharmacist", "storekeeper"]
            .includes(currentUser.role)
    ) {
        showToast(
            "You do not have permission to manage medicines.",
            true
        );
        return;
    }

    medicineForm.reset();
    medicineIdInput.value = "";

    $("gstPercentage").value = "0";
    $("reorderLevel").value = "10";
    $("prescriptionRequired").value = "false";
    $("medicineStatus").value = "active";

    setMessage(medicineFormMessage, "");

    if (medicine) {
        modalTitle.textContent = "Edit Medicine";
        medicineIdInput.value = medicine._id;

        const fields = [
            "medicineName",
            "genericName",
            "category",
            "batchNumber",
            "manufacturer",
            "barcode",
            "purchasePrice",
            "sellingPrice",
            "gstPercentage",
            "quantity",
            "reorderLevel"
        ];

        for (const field of fields) {
            $(field).value = medicine[field] ?? "";
        }

        $("expiryDate").value = medicine.expiryDate
            ? new Date(medicine.expiryDate)
                .toISOString()
                .slice(0, 10)
            : "";

        $("prescriptionRequired").value =
            String(Boolean(medicine.prescriptionRequired));

        $("medicineStatus").value =
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

$("addMedicineBtn")?.addEventListener(
    "click",
    () => openMedicineModal()
);

$("closeModalBtn")?.addEventListener(
    "click",
    closeMedicineModal
);

$("cancelModalBtn")?.addEventListener(
    "click",
    closeMedicineModal
);

medicineModal?.addEventListener("click", event => {
    if (event.target === medicineModal) {
        closeMedicineModal();
    }
});

document.addEventListener("keydown", event => {
    if (
        event.key === "Escape" &&
        medicineModal &&
        !medicineModal.hidden
    ) {
        closeMedicineModal();
    }
});

// ============================================
// SAVE MEDICINE
// ============================================

medicineForm?.addEventListener("submit", async event => {
    event.preventDefault();

    const id = medicineIdInput.value;

    const medicine = {
        medicineName: $("medicineName").value.trim(),
        genericName: $("genericName").value.trim(),
        category: $("category").value.trim(),
        batchNumber: $("batchNumber").value.trim(),
        manufacturer: $("manufacturer").value.trim(),
        barcode: $("barcode").value.trim(),
        purchasePrice: Number($("purchasePrice").value),
        sellingPrice: Number($("sellingPrice").value),
        gstPercentage: Number($("gstPercentage").value),
        quantity: Number($("quantity").value),
        reorderLevel: Number($("reorderLevel").value),
        expiryDate: $("expiryDate").value,
        prescriptionRequired:
            $("prescriptionRequired").value === "true",
        status: $("medicineStatus").value
    };

    for (const field of ["quantity", "reorderLevel"]) {
        if (
            !Number.isInteger(medicine[field]) ||
            medicine[field] < 0
        ) {
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

    if (!medicine.expiryDate) {
        setMessage(
            medicineFormMessage,
            "Please enter the medicine expiry date.",
            "error"
        );
        return;
    }

    const submitButton = medicineForm.querySelector(
        'button[type="submit"]'
    );

    submitButton.disabled = true;

    setMessage(
        medicineFormMessage,
        "Saving medicine..."
    );

    try {
        const data = await apiRequest(
            id
                ? `/medicines/${encodeURIComponent(id)}`
                : "/medicines",
            {
                method: id ? "PUT" : "POST",
                body: JSON.stringify(medicine)
            }
        );

        closeMedicineModal();
        await refreshDashboard();

        showToast(
            data.message || "Medicine saved successfully."
        );

    } catch (error) {
        setMessage(
            medicineFormMessage,
            error.message,
            "error"
        );
    } finally {
        submitButton.disabled = false;
    }
});

// ============================================
// EDIT AND DELETE MEDICINES
// ============================================

medicineTableBody?.addEventListener(
    "click",
    async event => {
        const button = event.target.closest(
            "button[data-action]"
        );

        if (!button) return;

        const id = button.dataset.id;
        const action = button.dataset.action;

        const medicine = medicines.find(
            item => item._id === id
        );

        if (!medicine) {
            showToast(
                "Medicine not found. Refresh and try again.",
                true
            );
            return;
        }

        if (action === "edit") {
            openMedicineModal(medicine);
            return;
        }

        if (action === "delete") {
            if (currentUser?.role !== "admin") {
                showToast(
                    "Only admins can delete medicines.",
                    true
                );
                return;
            }

            if (!window.confirm(
                `Delete ${medicine.medicineName}, batch ${
                    medicine.batchNumber
                }?`
            )) {
                return;
            }

            try {
                const data = await apiRequest(
                    `/medicines/${encodeURIComponent(id)}`,
                    { method: "DELETE" }
                );

                await refreshDashboard();

                showToast(
                    data.message ||
                    "Medicine deleted successfully."
                );

            } catch (error) {
                showToast(error.message, true);
            }
        }
    }
);

// ============================================
// NEW SALE: LOAD SELLABLE MEDICINES
// ============================================

async function loadSaleMedicines() {
    if (!authToken || !saleMedicineSelect) return;

    setMessage(
        saleMessage,
        "Loading available medicines..."
    );

    try {
        const data = await apiRequest("/medicines");

        allSaleMedicines = (data.medicines || [])
            .filter(medicine =>
                medicine.status === "active" &&
                Number(medicine.quantity) > 0 &&
                !isExpired(medicine)
            );

        saleMedicineSelect.replaceChildren();

        const placeholder = document.createElement(
            "option"
        );

        placeholder.value = "";
        placeholder.textContent = "Select a medicine";

        saleMedicineSelect.appendChild(placeholder);

        for (const medicine of allSaleMedicines) {
            const option = document.createElement(
                "option"
            );

            option.value = medicine._id;

            option.textContent =
                `${medicine.medicineName} · ` +
                `Batch ${medicine.batchNumber} · ` +
                `${formatCurrency(medicine.sellingPrice)} · ` +
                `Stock ${medicine.quantity}`;

            saleMedicineSelect.appendChild(option);
        }

        updateSaleStockInfo();

        setMessage(
            saleMessage,
            allSaleMedicines.length
                ? ""
                : "No active, unexpired medicines with stock are available."
        );

    } catch (error) {
        setMessage(
            saleMessage,
            error.message,
            "error"
        );
    }
}

function updateSaleStockInfo() {
    if (!saleStockInfo) return;

    const medicine = allSaleMedicines.find(
        item => item._id === saleMedicineSelect?.value
    );

    if (!medicine) {
        saleStockInfo.textContent = "";
        return;
    }

    saleStockInfo.textContent =
        `Available stock: ${medicine.quantity} · ` +
        `Price: ${formatCurrency(medicine.sellingPrice)} · ` +
        `GST: ${Number(medicine.gstPercentage || 0)}%`;

    if (saleQuantityInput) {
        saleQuantityInput.max =
            String(medicine.quantity);

        saleQuantityInput.value = "1";
    }
}

saleMedicineSelect?.addEventListener(
    "change",
    updateSaleStockInfo
);

// ============================================
// ADD MEDICINE TO BILL
// ============================================

addSaleItemBtn?.addEventListener("click", () => {
    setMessage(saleMessage, "");

    const medicineId = saleMedicineSelect?.value;
    const quantity = Number(saleQuantityInput?.value);

    const medicine = allSaleMedicines.find(
        item => item._id === medicineId
    );

    if (!medicine) {
        setMessage(
            saleMessage,
            "Please select a valid medicine.",
            "error"
        );
        return;
    }

    if (
        !Number.isInteger(quantity) ||
        quantity < 1
    ) {
        setMessage(
            saleMessage,
            "Quantity must be a positive whole number.",
            "error"
        );
        return;
    }

    if (
        isExpired(medicine) ||
        medicine.status !== "active"
    ) {
        setMessage(
            saleMessage,
            "This medicine cannot be sold.",
            "error"
        );
        return;
    }

    const existing = saleCart.find(
        item => item.medicineId === medicineId
    );

    const alreadyInCart = existing
        ? existing.quantity
        : 0;

    if (
        alreadyInCart + quantity >
        Number(medicine.quantity)
    ) {
        setMessage(
            saleMessage,
            `Only ${medicine.quantity} unit(s) are currently available.`,
            "error"
        );
        return;
    }

    if (existing) {
        existing.quantity += quantity;
    } else {
        saleCart.push({
            medicineId: medicine._id,
            medicineName: medicine.medicineName,
            batchNumber: medicine.batchNumber,
            sellingPrice:
                Number(medicine.sellingPrice),
            gstPercentage:
                Number(medicine.gstPercentage || 0),
            quantity,
            availableStock:
                Number(medicine.quantity)
        });
    }

    renderSaleCart();

    setMessage(
        saleMessage,
        "Medicine added to bill.",
        "success"
    );
});

// ============================================
// BILL TOTALS
// ============================================

function getSaleTotals() {
    let subtotal = 0;
    let gst = 0;

    for (const item of saleCart) {
        const lineSubtotal =
            item.sellingPrice * item.quantity;

        subtotal += lineSubtotal;

        gst +=
            lineSubtotal * item.gstPercentage / 100;
    }

    return {
        subtotal: Number(subtotal.toFixed(2)),
        gst: Number(gst.toFixed(2)),
        grandTotal:
            Number((subtotal + gst).toFixed(2))
    };
}

// ============================================
// RENDER BILLING CART
// ============================================

function renderSaleCart() {
    if (!saleCartTableBody) return;

    saleCartTableBody.replaceChildren();

    if (saleCart.length === 0) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");

        cell.colSpan = 8;
        cell.className = "empty-state";

        cell.textContent =
            "Your bill is empty. Add a medicine to begin.";

        row.appendChild(cell);
        saleCartTableBody.appendChild(row);
    }

    saleCart.forEach((item, index) => {
        const lineSubtotal =
            item.sellingPrice * item.quantity;

        const lineGST =
            lineSubtotal * item.gstPercentage / 100;

        const row = document.createElement("tr");

        const cells = [
            escapeHTML(item.medicineName),

            formatCurrency(item.sellingPrice),

            `${item.gstPercentage}%`,

            String(item.quantity),

            formatCurrency(lineSubtotal),

            formatCurrency(lineGST),

            formatCurrency(lineSubtotal + lineGST),

            `<button
                type="button"
                class="action-btn delete-btn"
                data-cart-remove="${index}"
            >
                Remove
             </button>`
        ];

        for (const content of cells) {
            const cell = document.createElement("td");

            cell.innerHTML = content;
            row.appendChild(cell);
        }

        saleCartTableBody.appendChild(row);
    });

    const totals = getSaleTotals();

    if (saleSubtotal) {
        saleSubtotal.textContent =
            formatCurrency(totals.subtotal);
    }

    if (saleGST) {
        saleGST.textContent =
            formatCurrency(totals.gst);
    }

    if (saleGrandTotal) {
        saleGrandTotal.textContent =
            formatCurrency(totals.grandTotal);
    }

    if (completeSaleBtn) {
        completeSaleBtn.disabled =
            saleCart.length === 0;
    }
}

// ============================================
// REMOVE ITEM FROM BILL
// ============================================

saleCartTableBody?.addEventListener(
    "click",
    event => {
        const button = event.target.closest(
            "[data-cart-remove]"
        );

        if (!button) return;

        const index = Number(
            button.dataset.cartRemove
        );

        if (
            Number.isInteger(index) &&
            index >= 0 &&
            index < saleCart.length
        ) {
            saleCart.splice(index, 1);
            renderSaleCart();

            setMessage(
                saleMessage,
                "Item removed from bill."
            );
        }
    }
);

// ============================================
// CLEAR CURRENT BILL
// ============================================

function clearCurrentSale() {
    saleCart = [];

    renderSaleCart();
    setMessage(saleMessage, "");

    if (saleInvoiceResult) {
        saleInvoiceResult.hidden = true;
    }
}

clearSaleBtn?.addEventListener("click", () => {
    if (
        saleCart.length &&
        !window.confirm(
            "Clear all items from this bill?"
        )
    ) {
        return;
    }

    clearCurrentSale();
});

// ============================================
// COMPLETE SALE
// ============================================

completeSaleBtn?.addEventListener(
    "click",
    async () => {
        if (!authToken) {
            setMessage(
                saleMessage,
                "Please log in before billing.",
                "error"
            );
            return;
        }

        if (saleCart.length === 0) {
            setMessage(
                saleMessage,
                "Add at least one medicine to the bill.",
                "error"
            );
            return;
        }

        for (const item of saleCart) {
            const medicine = allSaleMedicines.find(
                entry =>
                    entry._id === item.medicineId
            );

            if (
                !medicine ||
                medicine.status !== "active" ||
                isExpired(medicine) ||
                Number(medicine.quantity) <
                    item.quantity
            ) {
                setMessage(
                    saleMessage,
                    `${item.medicineName} is expired, unavailable, or has insufficient stock. Reload available medicines.`,
                    "error"
                );

                await loadSaleMedicines();
                return;
            }
        }

        const paymentMethod =
            salePaymentMethod?.value || "cash";

        if (
            !["cash", "upi", "card"]
                .includes(paymentMethod)
        ) {
            setMessage(
                saleMessage,
                "Please select a valid payment method.",
                "error"
            );
            return;
        }

        completeSaleBtn.disabled = true;

        setMessage(
            saleMessage,
            "Processing sale..."
        );

        try {
            const payload = {
                items: saleCart.map(item => ({
                    medicineId: item.medicineId,
                    quantity: item.quantity
                })),
                paymentMethod
            };

            const data = await apiRequest(
                "/sales",
                {
                    method: "POST",
                    body: JSON.stringify(payload)
                }
            );

            const sale = data.sale || data;

            const invoiceNumber =
                sale.invoiceNumber ||
                "Invoice created";

            const grandTotal = Number(
                sale.grandTotal ??
                getSaleTotals().grandTotal
            );

            if (completedInvoiceNumber) {
                completedInvoiceNumber.textContent =
                    invoiceNumber;
            }

            if (completedInvoiceTotal) {
                completedInvoiceTotal.textContent =
                    formatCurrency(grandTotal);
            }

            if (saleInvoiceResult) {
                saleInvoiceResult.hidden = false;
            }

            saleCart = [];
            renderSaleCart();

            await refreshDashboard();
            await loadSaleMedicines();

            setMessage(
                saleMessage,
                data.message ||
                "Sale completed successfully.",
                "success"
            );

            showToast(
                "Sale completed successfully."
            );

        } catch (error) {
            setMessage(
                saleMessage,
                error.message,
                "error"
            );
        } finally {
            completeSaleBtn.disabled =
                saleCart.length === 0;
        }
    }
);

// ============================================
// PRINT INVOICE
// ============================================

printInvoiceBtn?.addEventListener("click", () => {
    window.print();
});

newSaleBtn?.addEventListener(
    "click",
    async () => {
        clearCurrentSale();

        if (salePaymentMethod) {
            salePaymentMethod.value = "cash";
        }

        await loadSaleMedicines();
    }
);

// ============================================
// SALES HISTORY
// ============================================

async function loadSales() {
    if (!authToken || !salesTableBody) return;

    setMessage(
        salesMessage,
        "Loading sales history..."
    );

    if (salesTableCount) {
        salesTableCount.textContent = "Loading...";
    }

    try {
        const data = await apiRequest("/sales");

        sales = data.sales || [];

        renderSalesTable();
        setMessage(salesMessage, "");

    } catch (error) {
        salesTableBody.replaceChildren();

        const row = document.createElement("tr");
        const cell = document.createElement("td");

        cell.colSpan = 8;
        cell.className = "empty-state";
        cell.textContent = error.message;

        row.appendChild(cell);
        salesTableBody.appendChild(row);

        setMessage(
            salesMessage,
            `Unable to load sales: ${error.message}`,
            "error"
        );

        if (salesTableCount) {
            salesTableCount.textContent =
                "Unable to load sales";
        }
    }
}

// ============================================
// RENDER SALES HISTORY
// ============================================

function renderSalesTable() {
    if (!salesTableBody) return;

    salesTableBody.replaceChildren();

    const searchTerm =
        salesSearchInput?.value
            .trim()
            .toLowerCase() || "";

    const paymentMethod =
        salesPaymentFilter?.value || "";

    const filteredSales = sales.filter(sale => {
        const invoice = String(
            sale.invoiceNumber || ""
        ).toLowerCase();

        const medicineNames = (sale.items || [])
            .map(item => item.medicineName || "")
            .join(" ")
            .toLowerCase();

        return (
            (!searchTerm ||
                invoice.includes(searchTerm) ||
                medicineNames.includes(searchTerm)) &&
            (!paymentMethod ||
                sale.paymentMethod === paymentMethod)
        );
    });

    const completedSales = sales.filter(
        sale => sale.status === "completed"
    );

    if (totalSalesCount) {
        totalSalesCount.textContent =
            completedSales.length;
    }

    if (totalSalesValue) {
        const total = completedSales.reduce(
            (sum, sale) =>
                sum + Number(sale.grandTotal || 0),
            0
        );

        totalSalesValue.textContent =
            formatCurrency(total);
    }

    if (salesTableCount) {
        salesTableCount.textContent =
            `${filteredSales.length} ${
                filteredSales.length === 1
                    ? "sale"
                    : "sales"
            }`;
    }

    if (filteredSales.length === 0) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");

        cell.colSpan = 8;
        cell.className = "empty-state";

        cell.textContent = sales.length === 0
            ? "No sales recorded yet."
            : "No sales match your search.";

        row.appendChild(cell);
        salesTableBody.appendChild(row);

        return;
    }

    for (const sale of filteredSales) {
        const row = document.createElement("tr");

        const medicineSummary = (sale.items || [])
            .map(item =>
                `${escapeHTML(item.medicineName)} × ${
                    Number(item.quantity)
                }`
            )
            .join(", ");

        const statusClass =
            sale.status === "completed"
                ? "status-active"
                : "status-inactive";

        const cells = [
            `<strong>
                ${escapeHTML(sale.invoiceNumber || "—")}
             </strong>`,

            medicineSummary || "—",

            formatCurrency(sale.subtotal),

            formatCurrency(sale.totalGST),

            `<strong>
                ${formatCurrency(sale.grandTotal)}
             </strong>`,

            escapeHTML(
                sale.paymentMethod?.toUpperCase() ||
                "CASH"
            ),

            formatDate(sale.createdAt),

            `<span class="status-badge ${statusClass}">
                ${escapeHTML(
                    sale.status || "completed"
                )}
             </span>`
        ];

        for (const content of cells) {
            const cell = document.createElement("td");

            cell.innerHTML = content;
            row.appendChild(cell);
        }

        salesTableBody.appendChild(row);
    }
}

salesSearchInput?.addEventListener(
    "input",
    renderSalesTable
);

salesPaymentFilter?.addEventListener(
    "change",
    renderSalesTable
);

$("refreshSalesBtn")?.addEventListener(
    "click",
    async () => {
        await loadSales();

        showToast(
            "Sales history refreshed."
        );
    }
);

// ============================================
// INITIAL PAGE STATE
// ============================================

if (loginSection) loginSection.hidden = false;
if (appSections) appSections.hidden = true;
if (dashboardSection) dashboardSection.hidden = true;
if (salesSection) salesSection.hidden = true;
if (newSaleSection) newSaleSection.hidden = true;
if (medicineModal) medicineModal.hidden = true;
if (saleInvoiceResult) saleInvoiceResult.hidden = true;

renderSaleCart();

console.log(
    "MediVault frontend loaded successfully."
);

/* ============================================
   SUPPLIER MANAGEMENT MODULE
============================================ */

let suppliers = [];

const suppliersSection = $("suppliersSection");
const supplierTableBody = $("supplierTableBody");
const supplierTableCount = $("supplierTableCount");
const supplierSearchInput = $("supplierSearchInput");
const supplierStatusFilter = $("supplierStatusFilter");
const supplierMessage = $("supplierMessage");

const supplierModal = $("supplierModal");
const supplierForm = $("supplierForm");
const supplierFormMessage = $("supplierFormMessage");
const supplierModalTitle = $("supplierModalTitle");
const supplierIdInput = $("supplierId");
const saveSupplierBtn = $("saveSupplierBtn");

// ============================================
// SUPPLIER PAGE NAVIGATION
// ============================================

// Preserve the existing navigation functionality.
const originalShowPage = showPage;

showPage = function(page) {
    if (!authToken) return;

    if (suppliersSection) {
        suppliersSection.hidden = page !== "suppliers";
    }

    if (page === "suppliers") {
        originalShowPage("dashboard");

        if (dashboardSection) {
            dashboardSection.hidden = true;
        }

        $("pageTitle").textContent = "Supplier Management";

        document.querySelectorAll(".nav-link").forEach(link => {
            link.classList.toggle(
                "active",
                link.dataset.page === "suppliers"
            );
        });

        loadSuppliers();
        return;
    }

    originalShowPage(page);
};

// ============================================
// LOAD SUPPLIERS
// ============================================

async function loadSuppliers() {
    if (!authToken || !supplierTableBody) return;

    setMessage(supplierMessage, "Loading suppliers...");

    try {
        const data = await apiRequest("/suppliers");

        suppliers = data.suppliers || [];

        renderSupplierTable();

        setMessage(supplierMessage, "");

    } catch (error) {
        suppliers = [];
        renderSupplierTable();

        setMessage(
            supplierMessage,
            error.message,
            "error"
        );

        showToast(error.message, true);
    }
}

// ============================================
// RENDER SUPPLIER TABLE
// ============================================

function renderSupplierTable() {
    if (!supplierTableBody) return;

    supplierTableBody.replaceChildren();

    const search = (
        supplierSearchInput?.value || ""
    ).trim().toLowerCase();

    const status = supplierStatusFilter?.value || "";

    const filtered = suppliers.filter(supplier => {
        const searchable = [
            supplier.supplierName,
            supplier.contactPerson,
            supplier.phone,
            supplier.email,
            supplier.address
        ].join(" ").toLowerCase();

        return (
            (!search || searchable.includes(search)) &&
            (!status || supplier.status === status)
        );
    });

    if (supplierTableCount) {
        supplierTableCount.textContent =
            `${filtered.length} supplier(s)`;
    }

    if (filtered.length === 0) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");

        cell.colSpan = 7;
        cell.className = "empty-state";
        cell.textContent = suppliers.length
            ? "No suppliers match your filters."
            : "No suppliers found. Add your first supplier.";

        row.appendChild(cell);
        supplierTableBody.appendChild(row);
        return;
    }

    for (const supplier of filtered) {
        const row = document.createElement("tr");

        const statusClass =
            supplier.status === "active"
                ? "status-active"
                : "status-inactive";

        const cells = [
            `<strong>${escapeHTML(supplier.supplierName)}</strong>`,
            escapeHTML(supplier.contactPerson || "—"),
            escapeHTML(supplier.phone || "—"),
            escapeHTML(supplier.email || "—"),
            escapeHTML(supplier.address || "—"),
            `<span class="status-badge ${statusClass}">
                ${escapeHTML(supplier.status || "active")}
             </span>`,
            currentUser?.role === "admin"
                ? `<div class="row-actions">
                    <button
                        type="button"
                        class="action-btn"
                        data-supplier-action="edit"
                        data-id="${escapeHTML(supplier._id)}"
                    >
                        Edit
                    </button>
                    <button
                        type="button"
                        class="action-btn delete-btn"
                        data-supplier-action="delete"
                        data-id="${escapeHTML(supplier._id)}"
                    >
                        Delete
                    </button>
                   </div>`
                : "View only"
        ];

        for (const content of cells) {
            const cell = document.createElement("td");
            cell.innerHTML = content;
            row.appendChild(cell);
        }

        supplierTableBody.appendChild(row);
    }
}

// ============================================
// OPEN ADD / EDIT SUPPLIER FORM
// ============================================

function openSupplierModal(supplier = null) {
    if (currentUser?.role !== "admin") {
        showToast(
            "Only admins can manage suppliers.",
            true
        );
        return;
    }

    supplierForm.reset();
    supplierIdInput.value = "";
    $("supplierStatus").value = "active";

    setMessage(supplierFormMessage, "");

    if (supplier) {
        supplierModalTitle.textContent = "Edit Supplier";
        supplierIdInput.value = supplier._id;

        $("supplierName").value =
            supplier.supplierName || "";

        $("supplierContactPerson").value =
            supplier.contactPerson || "";

        $("supplierPhone").value =
            supplier.phone || "";

        $("supplierEmail").value =
            supplier.email || "";

        $("supplierAddress").value =
            supplier.address || "";

        $("supplierStatus").value =
            supplier.status || "active";

    } else {
        supplierModalTitle.textContent = "Add Supplier";
    }

    supplierModal.hidden = false;
}

// ============================================
// CLOSE SUPPLIER FORM
// ============================================

function closeSupplierModal() {
    if (!supplierModal) return;

    supplierModal.hidden = true;
    supplierForm?.reset();

    setMessage(supplierFormMessage, "");
}

// ============================================
// SUPPLIER MODAL BUTTONS
// ============================================

$("addSupplierBtn")?.addEventListener("click", () => {
    openSupplierModal();
});

$("closeSupplierModalBtn")?.addEventListener(
    "click",
    closeSupplierModal
);

$("cancelSupplierModalBtn")?.addEventListener(
    "click",
    closeSupplierModal
);

supplierModal?.addEventListener("click", event => {
    if (event.target === supplierModal) {
        closeSupplierModal();
    }
});

document.addEventListener("keydown", event => {
    if (
        event.key === "Escape" &&
        supplierModal &&
        !supplierModal.hidden
    ) {
        closeSupplierModal();
    }
});

// ============================================
// SAVE SUPPLIER
// ============================================

supplierForm?.addEventListener("submit", async event => {
    event.preventDefault();

    if (currentUser?.role !== "admin") {
        setMessage(
            supplierFormMessage,
            "Only admins can save suppliers.",
            "error"
        );
        return;
    }

    const id = supplierIdInput.value;

    const supplier = {
        supplierName: $("supplierName").value.trim(),
        contactPerson:
            $("supplierContactPerson").value.trim(),
        phone: $("supplierPhone").value.trim(),
        email: $("supplierEmail").value.trim(),
        address: $("supplierAddress").value.trim(),
        status: $("supplierStatus").value
    };

    if (
        !supplier.supplierName ||
        !supplier.contactPerson ||
        !supplier.phone
    ) {
        setMessage(
            supplierFormMessage,
            "Supplier name, contact person and phone are required.",
            "error"
        );
        return;
    }

    saveSupplierBtn.disabled = true;

    setMessage(
        supplierFormMessage,
        "Saving supplier..."
    );

    try {
        const data = await apiRequest(
            id
                ? `/suppliers/${encodeURIComponent(id)}`
                : "/suppliers",
            {
                method: id ? "PUT" : "POST",
                body: JSON.stringify(supplier)
            }
        );

        closeSupplierModal();

        await loadSuppliers();

        showToast(
            data.message || "Supplier saved successfully."
        );

    } catch (error) {
        setMessage(
            supplierFormMessage,
            error.message,
            "error"
        );

    } finally {
        saveSupplierBtn.disabled = false;
    }
});

// ============================================
// EDIT / DELETE SUPPLIER
// ============================================

supplierTableBody?.addEventListener(
    "click",
    async event => {
        const button = event.target.closest(
            "button[data-supplier-action]"
        );

        if (!button) return;

        if (currentUser?.role !== "admin") {
            showToast(
                "Only admins can manage suppliers.",
                true
            );
            return;
        }

        const id = button.dataset.id;
        const action = button.dataset.supplierAction;

        const supplier = suppliers.find(
            item => item._id === id
        );

        if (!supplier) {
            showToast(
                "Supplier not found. Refresh and try again.",
                true
            );
            return;
        }

        if (action === "edit") {
            openSupplierModal(supplier);
            return;
        }

        if (action === "delete") {
            const confirmed = window.confirm(
                `Delete supplier "${supplier.supplierName}"?`
            );

            if (!confirmed) return;

            button.disabled = true;

            try {
                const data = await apiRequest(
                    `/suppliers/${encodeURIComponent(id)}`,
                    {
                        method: "DELETE"
                    }
                );

                await loadSuppliers();

                showToast(
                    data.message ||
                    "Supplier deleted successfully."
                );

            } catch (error) {
                button.disabled = false;
                showToast(error.message, true);
            }
        }
    }
);

// ============================================
// SEARCH AND FILTER
// ============================================

supplierSearchInput?.addEventListener(
    "input",
    renderSupplierTable
);

supplierStatusFilter?.addEventListener(
    "change",
    renderSupplierTable
);

// ============================================
// REFRESH SUPPLIERS
// ============================================

$("refreshSuppliersBtn")?.addEventListener(
    "click",
    async () => {
        await loadSuppliers();
    }
);

// ============================================
// SUPPLIER INITIAL STATE
// ============================================

if (suppliersSection) {
    suppliersSection.hidden = true;
}

if (supplierModal) {
    supplierModal.hidden = true;
}

// Hide supplier add controls for non-admin users
// whenever a user successfully navigates.
const supplierNavigation = showPage;

showPage = function(page) {
    if ($("addSupplierBtn")) {
        $("addSupplierBtn").hidden =
            currentUser?.role !== "admin";
    }

    supplierNavigation(page);
};

console.log("Supplier Management module loaded.");
