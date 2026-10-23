
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
            if (data.user.mustChangePassword) {
                $("passwordChangeSection").hidden = false;
                if (appSections) appSections.hidden = true;
                return;
            }
            applyRoleNavigation();

            if (appSections) {
                appSections.hidden = false;
            }

            loginForm.reset();

            if (currentUser.role === "supplier") {
                document.querySelector('[data-page="supplier-portal"]')?.click();
            } else {
                await refreshDashboard();
                showPage("dashboard");
            }

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

        // One choice per medicine; checkout allocates its batches by FEFO.
        const groups = new Map();
        for (const medicine of allSaleMedicines) {
            const key = medicine.medicineName.trim().toLowerCase();
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(medicine);
        }
        for (const group of groups.values()) {
            group.sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));
            const first = group[0];
            const option = document.createElement("option");
            option.value = first._id;
            option.textContent = first.medicineName + " · FEFO · Total stock " +
                group.reduce((sum, m) => sum + Number(m.quantity), 0);
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

    const groupStock = allSaleMedicines.filter(m => m.medicineName.trim().toLowerCase() === medicine.medicineName.trim().toLowerCase()).reduce((sum, m) => sum + Number(m.quantity), 0);
    saleStockInfo.textContent =
        `Available across batches: ${groupStock} · FEFO · ` +
        `Price: ${formatCurrency(medicine.sellingPrice)} · ` +
        `GST: ${Number(medicine.gstPercentage || 0)}%`;

    if (saleQuantityInput) {
        saleQuantityInput.max =
            String(groupStock);

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

    const combinedStock = allSaleMedicines.filter(m => m.medicineName.trim().toLowerCase() === medicine.medicineName.trim().toLowerCase()).reduce((sum, m) => sum + Number(m.quantity), 0);
    if (
        alreadyInCart + quantity > combinedStock
    ) {
        setMessage(
            saleMessage,
            `Only ${combinedStock} unit(s) are currently available across batches.`,
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
            batchNumber: "FEFO (automatic)",
            sellingPrice:
                Number(medicine.sellingPrice),
            gstPercentage:
                Number(medicine.gstPercentage || 0),
            quantity,
            availableStock:
                combinedStock
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
            escapeHTML(item.medicineName) + " (FEFO)",

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
                allSaleMedicines.filter(m => m.medicineName.trim().toLowerCase() === item.medicineName.trim().toLowerCase()).reduce((sum, m) => sum + Number(m.quantity), 0) <
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
                let detail = $("saleBatchBreakdown");
                if (!detail) {
                    detail = document.createElement("div");
                    detail.id = "saleBatchBreakdown";
                    saleInvoiceResult.appendChild(detail);
                }
                detail.replaceChildren();
                const title = document.createElement("h3");
                title.textContent = "Batch-wise items (FEFO)";
                detail.appendChild(title);
                const table = document.createElement("table");
                const head = document.createElement("thead");
                const headerRow = document.createElement("tr");
                ["Medicine", "Batch", "Expiry", "Qty", "Price", "Total"].forEach(label => {
                    const th = document.createElement("th");
                    th.textContent = label;
                    headerRow.appendChild(th);
                });
                head.appendChild(headerRow);
                table.appendChild(head);
                const body = document.createElement("tbody");
                (sale.items || []).forEach(item => {
                    const tr = document.createElement("tr");
                    [item.medicineName, item.batchNumber || "—", formatDate(item.expiryDate),
                     item.quantity, formatCurrency(item.unitPrice), formatCurrency(item.total)].forEach(value => {
                        const td = document.createElement("td");
                        td.textContent = String(value);
                        tr.appendChild(td);
                    });
                    body.appendChild(tr);
                });
                table.appendChild(body);
                detail.appendChild(table);
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
                    <button type="button" class="action-btn" data-supplier-action="toggle" data-id="${escapeHTML(supplier._id)}">${supplier.status === "active" ? "Deactivate" : "Activate"}</button>
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
    $("supplierStatus").value = "inactive";

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

        if (action === "toggle") {
            const next = supplier.status === "active" ? "inactive" : "active";
            if (!window.confirm((next === "active" ? "Activate" : "Deactivate") + ' supplier "' + supplier.supplierName + '"?')) return;
            button.disabled = true;
            try {
                await apiRequest("/suppliers/" + encodeURIComponent(id) + "/status", {
                    method: "PATCH", body: JSON.stringify({ status: next })
                });
                await loadSuppliers();
                showToast("Supplier " + (next === "active" ? "activated." : "deactivated."));
            } catch (error) {
                showToast(error.message, true);
                button.disabled = false;
            }
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


/* ============================================
   PURCHASE MANAGEMENT MODULE
============================================ */
let purchaseSuppliers = [];
let purchaseMedicines = [];
let purchaseRequestId = null;
const purchasesSection = $("purchasesSection");
const purchaseForm = $("purchaseForm");
const purchaseSupplier = $("purchaseSupplier");
const purchaseMedicine = $("purchaseMedicine");
const purchaseQuantity = $("purchaseQuantity");
const purchaseUnitCost = $("purchaseUnitCost");
const purchaseMessage = $("purchaseMessage");
const purchaseBatchMode = $("purchaseBatchMode");
const purchaseNewBatchFields = $("purchaseNewBatchFields");
const purchaseNewBatchNumber = $("purchaseNewBatchNumber");
const purchaseNewBatchExpiry = $("purchaseNewBatchExpiry");
purchaseBatchMode?.addEventListener("change", () => {
    const isNew = purchaseBatchMode.value === "new";
    purchaseNewBatchFields.hidden = !isNew;
    purchaseNewBatchNumber.required = isNew;
    purchaseNewBatchExpiry.required = isNew;
    purchaseRequestId = null;
});
[purchaseNewBatchNumber, purchaseNewBatchExpiry].forEach(input =>
    input?.addEventListener("input", () => { purchaseRequestId = null; })
);
const purchaseTableBody = $("purchaseTableBody");

function makePurchaseRequestId() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return "purchase_" + Date.now() + "_" + Math.random().toString(36).slice(2, 12);
}

function purchaseOption(select, value, label) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.appendChild(option);
}

function updatePurchasePreview() {
    const medicine = purchaseMedicines.find(m => m._id === purchaseMedicine?.value);
    $("purchaseBatchInfo").textContent = medicine
        ? "Batch: " + medicine.batchNumber + " | Expiry: " + formatDate(medicine.expiryDate) +
          " | Current stock: " + medicine.quantity
        : "Select a medicine to see its batch and expiry date.";
    const quantity = Number(purchaseQuantity?.value) || 0;
    const cost = Number(purchaseUnitCost?.value) || 0;
    $("purchaseTotal").textContent = "Total: " + formatCurrency(quantity * cost);
}

async function loadPurchasePage() {
    if (!authToken || currentUser?.role !== "admin") return;
    setMessage(purchaseMessage, "Loading purchase information...");
    try {
        const [suppliersData, medicinesData, purchasesData] = await Promise.all([
            apiRequest("/suppliers"),
            apiRequest("/medicines"),
            apiRequest("/purchases")
        ]);
        purchaseSuppliers = (suppliersData.suppliers || []).filter(s => s.status === "active");
        purchaseMedicines = (medicinesData.medicines || []).filter(m => m.status === "active");
        const oldSupplier = purchaseSupplier.value;
        const oldMedicine = purchaseMedicine.value;
        purchaseSupplier.replaceChildren();
        purchaseMedicine.replaceChildren();
        purchaseOption(purchaseSupplier, "", "Select supplier");
        purchaseOption(purchaseMedicine, "", "Select medicine batch");
        purchaseSuppliers.forEach(s => purchaseOption(purchaseSupplier, s._id, s.supplierName));
        purchaseMedicines.forEach(m => purchaseOption(purchaseMedicine, m._id,
            m.medicineName + " — " + m.batchNumber + " (" + m.quantity + " in stock)"));
        if (purchaseSuppliers.some(s => s._id === oldSupplier)) purchaseSupplier.value = oldSupplier;
        if (purchaseMedicines.some(m => m._id === oldMedicine)) purchaseMedicine.value = oldMedicine;
        renderPurchaseHistory(purchasesData.purchases || []);
        updatePurchasePreview();
        setMessage(purchaseMessage, "");
    } catch (error) {
        setMessage(purchaseMessage, error.message, "error");
        showToast(error.message, true);
    }
}

function renderPurchaseHistory(purchases) {
    purchaseTableBody.replaceChildren();
    if (!purchases.length) {
        const row = purchaseTableBody.insertRow();
        const cell = row.insertCell();
        cell.colSpan = 8;
        cell.textContent = "No purchases recorded yet.";
        return;
    }
    for (const purchase of purchases) {
        const row = purchaseTableBody.insertRow();
        const values = [
            purchase.purchaseNumber,
            formatDate(purchase.createdAt),
            purchase.supplier?.supplierName || "Unknown supplier",
            purchase.medicineName + " / " + purchase.batchNumber,
            purchase.quantity,
            formatCurrency(purchase.unitCost),
            formatCurrency(purchase.totalCost)
        ];
        values.forEach(value => {
            const cell = row.insertCell();
            cell.textContent = String(value);
        });
        const actionCell = row.insertCell();
        const printButton = document.createElement("button");
        printButton.type = "button";
        printButton.className = "secondary-btn";
        printButton.textContent = "View / Print";
        printButton.addEventListener("click", () => openPurchaseInvoice(purchase._id));
        actionCell.appendChild(printButton);
    }
}

async function openPurchaseInvoice(id) {
    try {
        const data = await apiRequest("/purchases/" + encodeURIComponent(id));
        const purchase = data.purchase;
        if (!purchase) throw new Error("Purchase not found.");
        const supplier = purchase.supplier || {};
        const content = $("purchaseInvoiceContent");
        if (!content) return;
        // Use textContent rather than HTML for untrusted supplier or medicine fields.
        content.replaceChildren();
        const heading = document.createElement("h2");
        heading.textContent = "MEDIVAULT — PURCHASE RECEIPT";
        content.appendChild(heading);
        const fields = [
            ["Purchase No.", purchase.purchaseNumber],
            ["Date", formatDate(purchase.createdAt)],
            ["Supplier", supplier.supplierName || "Unknown supplier"],
            ["Contact", supplier.contactPerson || "—"],
            ["Phone", supplier.phone || "—"],
            ["Address", supplier.address || "—"],
            ["Medicine", purchase.medicineName],
            ["Batch No.", purchase.batchNumber],
            ["Expiry Date", formatDate(purchase.expiryDate)],
            ["Quantity Received", purchase.quantity],
            ["Unit Purchase Price", formatCurrency(purchase.unitCost)],
            ["Total Purchase Amount", formatCurrency(purchase.totalCost)]
        ];
        const table = document.createElement("table");
        table.className = "purchase-invoice-table";
        const body = document.createElement("tbody");
        fields.forEach(([label, value]) => {
            const tr = document.createElement("tr");
            const th = document.createElement("th");
            const td = document.createElement("td");
            th.textContent = label;
            td.textContent = String(value ?? "—");
            tr.append(th, td);
            body.appendChild(tr);
        });
        table.appendChild(body);
        content.appendChild(table);
        const footer = document.createElement("p");
        footer.textContent = "Purchase receipt • Generated by MediVault";
        footer.className = "purchase-invoice-footer";
        content.appendChild(footer);
        $("purchaseInvoiceResult").hidden = false;
        $("purchaseInvoiceResult").scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
        showToast(error.message, true);
    }
}

$("printPurchaseInvoiceBtn")?.addEventListener("click", () => {
    if ($("purchaseInvoiceResult")?.hidden) return;
    document.body.classList.add("printing-purchase");
    const reset = () => document.body.classList.remove("printing-purchase");
    window.addEventListener("afterprint", reset, { once: true });
    window.print();
    // Clear print mode after a print dialog returns (also handles cancelled print).
    reset();
});

purchaseMedicine?.addEventListener("change", () => {
    const medicine = purchaseMedicines.find(m => m._id === purchaseMedicine.value);
    if (medicine) purchaseUnitCost.value = medicine.purchasePrice;
    purchaseRequestId = null;
    updatePurchasePreview();
});
purchaseQuantity?.addEventListener("input", () => { purchaseRequestId = null; updatePurchasePreview(); });
purchaseUnitCost?.addEventListener("input", () => { purchaseRequestId = null; updatePurchasePreview(); });
purchaseSupplier?.addEventListener("change", () => { purchaseRequestId = null; });
$("refreshPurchasesBtn")?.addEventListener("click", loadPurchasePage);

purchaseForm?.addEventListener("submit", async event => {
    event.preventDefault();
    if (currentUser?.role !== "admin") return;
    const quantity = Number(purchaseQuantity.value);
    const unitCost = Number(purchaseUnitCost.value);
    if (!Number.isSafeInteger(quantity) || quantity < 1 ||
        !Number.isFinite(unitCost) || unitCost < 0 || !Number.isInteger(Math.round(unitCost * 10000) / 100)) {
        setMessage(purchaseMessage, "Enter a valid whole-number quantity and price with up to two decimal places.", "error");
        return;
    }
    const isNewBatch = purchaseBatchMode?.value === "new";
    const newBatch = isNewBatch ? {
        batchNumber: purchaseNewBatchNumber.value.trim(),
        expiryDate: purchaseNewBatchExpiry.value
    } : undefined;
    if (isNewBatch && (!newBatch.batchNumber || !newBatch.expiryDate)) {
        setMessage(purchaseMessage, "Enter the new batch number and expiry date.", "error");
        return;
    }
    const button = $("savePurchaseBtn");
    button.disabled = true;
    if (!purchaseRequestId) purchaseRequestId = makePurchaseRequestId();
    setMessage(purchaseMessage, "Recording purchase...");
    try {
        await apiRequest("/purchases", {
            method: "POST",
            body: JSON.stringify({
                supplierId: purchaseSupplier.value,
                medicineId: purchaseMedicine.value,
                quantity,
                unitCost,
                requestId: purchaseRequestId,
                ...(newBatch ? { newBatch } : {})
            })
        });
        purchaseRequestId = null;
        purchaseForm.reset();
        purchaseNewBatchFields.hidden = true;
        purchaseNewBatchNumber.required = false;
        purchaseNewBatchExpiry.required = false;
        setMessage(purchaseMessage, "Purchase recorded. Medicine stock increased.", "success");
        showToast("Purchase recorded successfully.");
        await loadPurchasePage();
        await loadMedicines();
    } catch (error) {
        setMessage(purchaseMessage, error.message, "error");
        showToast(error.message, true);
    } finally {
        button.disabled = false;
    }
});

// Preserve existing supplier and dashboard navigation.
const previousPurchaseShowPage = showPage;
showPage = function(page) {
    if (purchasesSection) purchasesSection.hidden = page !== "purchases";
    if (page === "purchases") {
        if (!authToken) return;
        if (currentUser?.role !== "admin") {
            showToast("Only admins can manage purchases.", true);
            return previousPurchaseShowPage("dashboard");
        }
        previousPurchaseShowPage("dashboard");
        if (dashboardSection) dashboardSection.hidden = true;
        if (suppliersSection) suppliersSection.hidden = true;
        $("pageTitle").textContent = "Purchase Management";
        document.querySelectorAll(".nav-link").forEach(link => {
            link.classList.toggle("active", link.dataset.page === "purchases");
        });
        loadPurchasePage();
        return;
    }
    previousPurchaseShowPage(page);
};
if (purchasesSection) purchasesSection.hidden = true;


// ============================================
// SALES & PURCHASE REPORTS
// ============================================
let latestReport = null;
const reportsSection = $("reportsSection");
const reportMessage = $("reportMessage");
function reportFillTable(id, rows, fields) {
    const body = $(id);
    if (!body) return;
    body.replaceChildren();
    if (!rows.length) {
        const tr = document.createElement("tr");
        const td = document.createElement("td");
        td.colSpan = fields.length;
        td.className = "empty-state";
        td.textContent = "No records for this date range.";
        tr.appendChild(td);
        body.appendChild(tr);
        return;
    }
    for (const item of rows) {
        const tr = document.createElement("tr");
        for (const field of fields) {
            const td = document.createElement("td");
            td.textContent = String(field(item) ?? "—");
            tr.appendChild(td);
        }
        body.appendChild(tr);
    }
}
async function loadReports() {
    if (!authToken || currentUser?.role !== "admin") return;
    const from = $("reportFrom")?.value || "";
    const to = $("reportTo")?.value || "";
    if (from && to && from > to) {
        setMessage(reportMessage, "From date must not be later than To date.", "error");
        return;
    }
    setMessage(reportMessage, "Loading reports...");
    try {
        const params = new URLSearchParams();
        if (from) params.set("from", from);
        if (to) params.set("to", to);
        const data = await apiRequest("/reports" + (params.size ? "?" + params : ""));
        latestReport = data;
        const summary = data.summary;
        $("reportRevenue").textContent = formatCurrency(summary.revenue);
        $("reportExpenses").textContent = formatCurrency(summary.purchaseExpenses);
        $("reportProfit").textContent = formatCurrency(summary.estimatedGrossProfit);
        $("reportSalesCount").textContent = String(summary.salesCount);
        $("reportPurchasesCount").textContent = String(summary.purchasesCount);
        reportFillTable("reportDailyBody", data.daily, [
            x => x.date, x => formatCurrency(x.sales), x => formatCurrency(x.purchases)
        ]);
        reportFillTable("reportTopBody", data.topMedicines, [
            x => x.medicineName, x => x.quantity, x => formatCurrency(x.revenue)
        ]);
        reportFillTable("reportSalesBody", data.sales, [
            x => x.invoiceNumber, x => formatDate(x.date), x => x.paymentMethod,
            x => x.itemCount, x => formatCurrency(x.total)
        ]);
        reportFillTable("reportPurchasesBody", data.purchases, [
            x => x.purchaseNumber, x => formatDate(x.date), x => x.medicineName,
            x => x.batchNumber, x => x.quantity, x => formatCurrency(x.total)
        ]);
        setMessage(reportMessage, summary.missingCostItems
            ? "Reports loaded. Note: " + summary.missingCostItems + " sold line item(s) lack a current purchase cost, so profit may be overstated."
            : "Reports loaded successfully.", summary.missingCostItems ? "error" : "success");
    } catch (error) {
        latestReport = null;
        setMessage(reportMessage, error.message, "error");
    }
}
$("reportApplyBtn")?.addEventListener("click", loadReports);
$("reportRefreshBtn")?.addEventListener("click", loadReports);
$("reportClearBtn")?.addEventListener("click", () => {
    $("reportFrom").value = "";
    $("reportTo").value = "";
    loadReports();
});
$("reportExportBtn")?.addEventListener("click", () => {
    if (!latestReport) return showToast("Load reports before exporting.", true);
    const csvRows = [["Type", "Reference", "Date", "Medicine", "Batch", "Quantity", "Amount"]];
    for (const x of latestReport.sales) csvRows.push(["Sale", x.invoiceNumber, x.date, "", "", x.itemCount, x.total]);
    for (const x of latestReport.purchases) csvRows.push(["Purchase", x.purchaseNumber, x.date, x.medicineName, x.batchNumber, x.quantity, x.total]);
    const quote = value => '"' + String(value ?? "").replace(/"/g, '""').replace(/^[=+@\-\t\r]/, "'$&") + '"';
    const csv = csvRows.map(row => row.map(quote).join(",")).join("\r\n");
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "medivault-report.csv";
    link.click();
    URL.revokeObjectURL(url);
    showToast("Report CSV exported (up to 100 transactions per type).");
});
const previousReportsShowPage = showPage;
showPage = function(page) {
    if (reportsSection) reportsSection.hidden = page !== "reports";
    if (page === "reports") {
        if (!authToken) return;
        if (currentUser?.role !== "admin") {
            showToast("Reports are available to admins only.", true);
            return previousReportsShowPage("dashboard");
        }
        previousReportsShowPage("dashboard");
        if (dashboardSection) dashboardSection.hidden = true;
        if ($("suppliersSection")) $("suppliersSection").hidden = true;
        if (purchasesSection) purchasesSection.hidden = true;
        $("pageTitle").textContent = "Sales & Purchase Reports";
        document.querySelectorAll(".nav-link").forEach(link => {
            link.classList.toggle("active", link.dataset.page === "reports");
        });
        loadReports();
        return;
    }
    previousReportsShowPage(page);
};
if (reportsSection) reportsSection.hidden = true;


// ============================================
// DASHBOARD CHARTS (NO EXTERNAL LIBRARIES)
// ============================================
const dashboardCharts = $("dashboardCharts");
function drawDashboardBars(id, rows, money = false) {
    const root = $(id);
    if (!root) return;
    root.replaceChildren();
    if (!rows.length || rows.every(r => Number(r.value) === 0)) {
        const p = document.createElement("p");
        p.className = "chart-empty";
        p.textContent = "No data yet.";
        root.appendChild(p);
        return;
    }
    const max = Math.max(1, ...rows.map(r => Number(r.value) || 0));
    for (const entry of rows) {
        const row = document.createElement("div");
        row.className = "chart-row";
        const label = document.createElement("span");
        label.className = "chart-label";
        label.textContent = entry.label;
        label.title = entry.label;
        const track = document.createElement("div");
        track.className = "chart-track";
        const bar = document.createElement("div");
        bar.className = "chart-fill" + (entry.purchase ? " purchase" : "");
        bar.style.width = (Math.max(0, Number(entry.value) || 0) / max * 100) + "%";
        track.appendChild(bar);
        const value = document.createElement("span");
        value.className = "chart-value";
        value.textContent = money ? formatCurrency(entry.value) : String(entry.value);
        row.append(label, track, value);
        root.appendChild(row);
    }
}
async function loadDashboardCharts() {
    if (!dashboardCharts || !authToken) return;
    if (currentUser?.role !== "admin") {
        setMessage($("dashboardChartsMessage"), "Analytics are available to admins only.");
        return;
    }
    setMessage($("dashboardChartsMessage"), "Loading charts...");
    try {
        // Use UTC days, matching the reporting API date grouping.
        const now = new Date();
        const todayUTC = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
        const dates = Array.from({length: 7}, (_, i) =>
            new Date(todayUTC - (6 - i) * 86400000).toISOString().slice(0, 10));
        const data = await apiRequest("/reports?from=" + dates[0] + "&to=" + dates[6]);
        const byDate = new Map(data.daily.map(d => [d.date, d]));
        drawDashboardBars("chartRevenue", dates.map(d => ({
            label: d.slice(5), value: byDate.get(d)?.sales || 0
        })), true);
        drawDashboardBars("chartSalesPurchases", [
            {label: "Sales", value: data.daily.reduce((s, d) => s + d.sales, 0)},
            {label: "Purchases", value: data.daily.reduce((s, d) => s + d.purchases, 0), purchase: true}
        ], true);
        drawDashboardBars("chartTopMedicines", data.topMedicines.slice(0, 5).map(m => ({
            label: m.medicineName, value: m.quantity
        })));
        // Inventory data comes from the full unfiltered medicines API.
        const inv = await apiRequest("/medicines");
        const stock = Array.isArray(inv) ? inv : (inv.medicines || []);
        const totals = new Map();
        for (const m of stock) {
            const name = m.category || "Uncategorized";
            totals.set(name, (totals.get(name) || 0) + Number(m.quantity || 0));
        }
        drawDashboardBars("chartStock", [...totals].map(([label, value]) => ({
            label, value
        })).sort((a,b) => b.value-a.value).slice(0,8));
        setMessage($("dashboardChartsMessage"), "Charts updated.");
    } catch (error) {
        setMessage($("dashboardChartsMessage"), "Unable to load charts: " + error.message, "error");
    }
}
$("refreshChartsBtn")?.addEventListener("click", loadDashboardCharts);
const previousChartsShowPage = showPage;
showPage = function(page) {
    previousChartsShowPage(page);
    if (dashboardCharts) dashboardCharts.hidden = page !== "dashboard";
    if (page === "dashboard" && authToken) loadDashboardCharts();
};
if (dashboardCharts) dashboardCharts.hidden = true;


// CASHIER SIGNUP & FIRST-LOGIN PASSWORD CHANGE
function applyRoleNavigation() {
    const cashier = currentUser?.role === "cashier";
    const supplier = currentUser?.role === "supplier";
    document.querySelectorAll('.nav-link').forEach(link => {
        link.hidden = supplier ? link.dataset.page !== "supplier-portal" : cashier && ["purchases","suppliers","reports","staff","supplier-applications","audit-history"].includes(link.dataset.page);
    });
    const charts = $("dashboardCharts");
    if (charts && cashier) charts.hidden = true;
    for (const id of ["todayRevenue"]) {
        const element = $(id);
        if (element) element.closest(".stat-card").hidden = cashier;
    }
}
$("showRegisterBtn")?.addEventListener("click", () => {
    loginSection.hidden = true;
    $("registerSection").hidden = false;
});
$("backToLoginBtn")?.addEventListener("click", () => {
    $("registerSection").hidden = true;
    loginSection.hidden = false;
});
$("registerForm")?.addEventListener("submit", async event => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
        const data = await apiRequest("/auth/register", {
            method: "POST",
            body: JSON.stringify({
                name: $("registerName").value,
                email: $("registerEmail").value,
                phone: $("registerPhone").value,
                address: $("registerAddress").value,
                password: $("registerPassword").value,
                confirmPassword: $("registerConfirm").value
            })
        });
        setMessage($("registerMessage"), data.message, "success");
        $("registerForm").reset();
    } catch (error) {
        setMessage($("registerMessage"), error.message, "error");
    } finally { button.disabled = false; }
});
$("passwordChangeForm")?.addEventListener("submit", async event => {
    event.preventDefault();
    const button = event.currentTarget.querySelector('button[type="submit"]');
    button.disabled = true;
    try {
        const data = await apiRequest("/auth/change-password", {
            method: "POST",
            body: JSON.stringify({
                currentPassword: $("currentPassword").value,
                newPassword: $("newPassword").value
            })
        });
        setMessage($("passwordChangeMessage"), data.message, "success");
        $("passwordChangeForm").reset();
        $("passwordChangeSection").hidden = true;
        logout(false);
    } catch (error) {
        setMessage($("passwordChangeMessage"), error.message, "error");
    } finally { button.disabled = false; }
});


// ADMIN STAFF APPROVALS
const staffSection = $("staffSection");
async function loadStaff() {
    if (currentUser?.role !== "admin") return;
    const status = $("staffStatusFilter")?.value || "";
    setMessage($("staffMessage"), "Loading staff...");
    try {
        const data = await apiRequest("/staff" + (status ? "?status=" + encodeURIComponent(status) : ""));
        const body = $("staffTableBody");
        body.replaceChildren();
        if (!data.staff.length) {
            const tr = document.createElement("tr");
            const td = document.createElement("td");
            td.colSpan = 6; td.textContent = "No staff records.";
            tr.appendChild(td); body.appendChild(tr);
        }
        for (const person of data.staff) {
            const tr = document.createElement("tr");
            for (const value of [person.name,person.email,person.phone,person.address,person.approvalStatus]) {
                const td = document.createElement("td");
                td.textContent = value || "—"; tr.appendChild(td);
            }
            const actions = document.createElement("td");
            const actionList = person.approvalStatus === "pending"
                ? [["Approve","approve"],["Reject","reject"]]
                : person.approvalStatus === "approved"
                    ? [[person.isActive ? "Deactivate" : "Activate", person.isActive ? "deactivate" : "activate"]]
                    : [];
            for (const [label,action] of actionList) {
                const button = document.createElement("button");
                button.type = "button"; button.className = "secondary-btn";
                button.textContent = label;
                button.addEventListener("click", async () => {
                    if (!window.confirm(label + " " + person.name + "?")) return;
                    const reason = action === "reject" ? window.prompt("Optional rejection reason:", "") : "";
                    if (action === "reject" && reason === null) return;
                    try {
                        if (["approve","reject"].includes(action)) {
                            await apiRequest("/staff/" + encodeURIComponent(person.id) + "/approval", {
                                method:"PATCH", body: JSON.stringify({ action, reason })
                            });
                        } else {
                            await apiRequest("/staff/" + encodeURIComponent(person.id) + "/status", {
                                method:"PATCH", body: JSON.stringify({ isActive: action === "activate" })
                            });
                        }
                        showToast("Staff updated.");
                        await loadStaff();
                    } catch(error) { showToast(error.message,true); }
                });
                actions.appendChild(button);
            }
            tr.appendChild(actions); body.appendChild(tr);
        }
        setMessage($("staffMessage"), "Staff loaded.", "success");
    } catch(error) { setMessage($("staffMessage"), error.message, "error"); }
}
$("staffStatusFilter")?.addEventListener("change", loadStaff);
$("staffRefreshBtn")?.addEventListener("click", loadStaff);
const previousStaffShowPage = showPage;
showPage = function(page) {
    if (staffSection) staffSection.hidden = page !== "staff";
    if (page === "staff") {
        if (!authToken || currentUser?.role !== "admin") return;
        previousStaffShowPage("dashboard");
        if (dashboardSection) dashboardSection.hidden = true;
        if (purchasesSection) purchasesSection.hidden = true;
        if (reportsSection) reportsSection.hidden = true;
        if ($("suppliersSection")) $("suppliersSection").hidden = true;
        $("pageTitle").textContent = "Staff Management";
        document.querySelectorAll(".nav-link").forEach(link => link.classList.toggle("active",link.dataset.page === "staff"));
        loadStaff();
        return;
    }
    previousStaffShowPage(page);
};
if (staffSection) staffSection.hidden = true;

/* Homepage shell: show workspace navigation only after a valid login. */
(function initMediVaultPublicShell() {
    function syncShell() {
        const signedIn = Boolean(authToken && currentUser && !currentUser.mustChangePassword);
        document.body.classList.toggle("is-authenticated", signedIn);
    }
    const login = document.getElementById("loginForm");
    const register = document.getElementById("registerForm");
    const passwordChange = document.getElementById("passwordChangeForm");
    // Existing submit handlers run before these observers; wait for async API completion.
    const observer = new MutationObserver(syncShell);
    for (const id of ["loginSection","registerSection","passwordChangeSection","appSections"]) {
        const node = document.getElementById(id);
        if (node) observer.observe(node, {attributes:true,attributeFilter:["hidden"]});
    }
    for (const form of [login,register,passwordChange]) {
        if (form) form.addEventListener("submit", () => queueMicrotask(syncShell));
    }
    document.getElementById("logoutBtn")?.addEventListener("click", () => queueMicrotask(syncShell));
    syncShell();
})();


/* =====================================================
   MEDIVAULT DASHBOARD V2 — LIVE DATA, NO MOCK VALUES
   ===================================================== */
(function setupDashboardV2(){
    const byId = id => document.getElementById(id);
    const menuButton=byId("accountMenuBtn"), menu=byId("accountMenu");
    const closeMenu=()=>{if(menu)menu.hidden=true;if(menuButton)menuButton.setAttribute("aria-expanded","false");};
    menuButton?.addEventListener("click",()=>{
        const opening=menu.hidden;menu.hidden=!opening;menuButton.setAttribute("aria-expanded",String(opening));
    });
    document.addEventListener("click",event=>{
        if(menu && !menu.hidden && !event.target.closest(".account-menu-wrap"))closeMenu();
    });
    document.addEventListener("keydown",event=>{if(event.key==="Escape")closeMenu();});
    const setAccount=()=>{
        const loggedIn=Boolean(authToken&&currentUser&&!currentUser.mustChangePassword);
        if(!loggedIn){closeMenu();return;}
        const displayName=(currentUser.name||currentUser.email?.split("@")[0]||"User").trim();
        const avatar=byId("accountAvatar"),welcome=byId("welcomeUserName");
        if(avatar)avatar.textContent=displayName.charAt(0).toUpperCase();
        if(welcome)welcome.textContent=displayName;
        if(byId("userName"))byId("userName").textContent=displayName;
        if(byId("userRole"))byId("userRole").textContent=currentUser.role||"user";
    };
    const date=byId("headerDate");
    if(date)date.textContent=new Intl.DateTimeFormat("en-IN",{weekday:"long",day:"numeric",month:"short",year:"numeric"}).format(new Date());
    const showAccountPanel=(id)=>{
        closeMenu();
        byId("profilePanel").hidden=id!=="profilePanel";
        byId("accountPasswordPanel").hidden=id!=="accountPasswordPanel";
        if(byId("dashboardWelcome"))byId("dashboardWelcome").hidden=true;
        if(dashboardSection)dashboardSection.hidden=true;
        if(byId("dashboardMainGrid"))byId("dashboardMainGrid").hidden=true;
        if(byId("pageTitle"))byId("pageTitle").textContent=id==="profilePanel"?"My Profile":"Change Password";
        if(id==="profilePanel"){
            byId("profileName").textContent=currentUser?.name||"—";
            byId("profileEmail").textContent=currentUser?.email||"—";
            byId("profileRole").textContent=currentUser?.role||"—";
        }
    };
    byId("profileMenuBtn")?.addEventListener("click",()=>showAccountPanel("profilePanel"));
    byId("changePasswordMenuBtn")?.addEventListener("click",()=>showAccountPanel("accountPasswordPanel"));
    for(const id of ["closeProfileBtn","closeAccountPasswordBtn"]){
        byId(id)?.addEventListener("click",()=>showPage("dashboard"));
    }
    byId("accountPasswordForm")?.addEventListener("submit",async event=>{
        event.preventDefault();
        const btn=event.currentTarget.querySelector('button[type="submit"]');
        btn.disabled=true;
        try{
            const result=await apiRequest("/auth/change-password",{
                method:"POST",
                body:JSON.stringify({currentPassword:byId("accountCurrentPassword").value,newPassword:byId("accountNewPassword").value})
            });
            byId("accountPasswordForm").reset();
            setMessage(byId("accountPasswordMessage"),result.message||"Password changed. Please sign in again.","success");
            logout(false);
            showToast("Password changed. Log in with your new password.");
        }catch(error){setMessage(byId("accountPasswordMessage"),error.message,"error");}
        finally{btn.disabled=false;}
    });
    const quickSearch=byId("globalSearch");
    quickSearch?.addEventListener("keydown",event=>{
        if(event.key!=="Enter")return;
        event.preventDefault();
        const query=quickSearch.value.trim();
        if(!query)return;
        showPage("inventory");
        const inventorySearch=byId("searchInput");
        if(inventorySearch){inventorySearch.value=query;inventorySearch.dispatchEvent(new Event("input",{bubbles:true}));inventorySearch.focus();}
    });
    document.querySelectorAll("[data-go]").forEach(button=>button.addEventListener("click",()=>{
        const target=button.dataset.go;
        if(button.hasAttribute("data-admin-only")&&currentUser?.role!=="admin")return;
        showPage(target);
        if(target==="inventory"&&button.classList.contains("inventory"))byId("addMedicineBtn")?.click();
    }));
    const chartRevenue=byId("chartRevenue"),chartTop=byId("chartTopMedicines");
    if(chartRevenue&&byId("dashboardRevenueHost"))byId("dashboardRevenueHost").appendChild(chartRevenue);
    if(chartTop&&byId("dashboardTopHost"))byId("dashboardTopHost").appendChild(chartTop);
    const colors=["#09a99f","#2c85ed","#ffab38","#a6b6c9","#7e63e9","#e96773"];
    async function loadNewDashboard(){
        if(!authToken||!currentUser)return;
        const cashier=currentUser.role==="cashier";
        document.querySelectorAll("[data-admin-only]").forEach(el=>el.hidden=cashier);
        const categoryLegend=byId("categoryLegend"),donut=byId("categoryDonut");
        try{
            const result=await apiRequest("/medicines");
            const items=Array.isArray(result)?result:(result.medicines||[]);
            const byCategory=new Map();
            for(const med of items){
                const key=med.category||"Others";
                byCategory.set(key,(byCategory.get(key)||0)+Number(med.quantity||0));
            }
            const total=[...byCategory.values()].reduce((a,b)=>a+b,0);
            byId("categoryTotal").textContent=String(total);
            categoryLegend.replaceChildren();
            let start=0;const stops=[];
            for(const [i,[name,value]] of [...byCategory].sort((a,b)=>b[1]-a[1]).slice(0,6).entries()){
                const color=colors[i%colors.length],pct=total?value/total*100:0;
                stops.push(color+" "+start+"% "+(start+pct)+"%");start+=pct;
                const line=document.createElement("div");
                const dot=document.createElement("i");dot.style.background=color;
                const label=document.createElement("span");label.textContent=name;
                const percent=document.createElement("strong");percent.textContent=Math.round(pct)+"%";
                line.append(dot,label,percent);categoryLegend.appendChild(line);
            }
            if(donut)donut.style.background=stops.length?"conic-gradient("+stops.join(",")+")":"#e6eef1";
        }catch(error){console.warn("Dashboard categories:",error.message);}
        try{
            const result=await apiRequest("/sales");
            const list=(result.sales||[]).slice().sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt)).slice(0,5);
            const tbody=byId("dashboardRecentSales");tbody.replaceChildren();
            if(!list.length){const tr=tbody.insertRow();const td=tr.insertCell();td.colSpan=6;td.textContent="No recent sales yet.";}
            for(const sale of list){
                const row=tbody.insertRow();
                const values=[sale.invoiceNumber||"—",formatDate(sale.createdAt),sale.items?.length||0,sale.paymentMethod||"—",formatCurrency(sale.grandTotal),sale.status||"—"];
                for(const value of values){const cell=row.insertCell();cell.textContent=String(value);}
            }
        }catch(error){const tbody=byId("dashboardRecentSales");if(tbody)tbody.textContent="Unable to load sales.";}
    }
    const previousShowPage=showPage;
    showPage=function(page){
        byId("profilePanel").hidden=true;
        byId("accountPasswordPanel").hidden=true;
        previousShowPage(page);
        const dashboard=page==="dashboard"&&Boolean(authToken);
        byId("dashboardWelcome").hidden=!dashboard;
        byId("dashboardMainGrid").hidden=!dashboard;
        setAccount();
        if(dashboard){loadNewDashboard();}
    };
    const app=byId("appSections");
    if(app)new MutationObserver(()=>{
        setAccount();
        if(app.hidden){byId("dashboardWelcome").hidden=true;byId("dashboardMainGrid").hidden=true;}
    }).observe(app,{attributes:true,attributeFilter:["hidden"]});
    setAccount();
})();
