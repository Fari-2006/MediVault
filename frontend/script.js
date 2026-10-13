
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
