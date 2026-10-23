
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();

// ============================================
// IMPORT ROUTES
// ============================================

const authRoutes = require("./routes/authRoutes");
const medicineRoutes = require("./routes/medicineRoutes");
const saleRoutes = require("./routes/saleRoutes");
const supplierRoutes = require("./routes/supplierRoutes");
const purchaseRoutes = require("./routes/purchaseRoutes");
const reportRoutes = require("./routes/reportRoutes");
const staffRoutes = require("./routes/staffRoutes");
const auditRoutes = require("./routes/auditRoutes");
const supplierAccountRoutes = require("./routes/supplierAccountRoutes");
const restockRoutes = require("./routes/restockRoutes");

// ============================================
// IMPORT AUTHENTICATION MIDDLEWARE
// ============================================

const {
    protect,
    authorize
} = require("./middleware/authMiddleware");

const app = express();

// ============================================
// MIDDLEWARE
// ============================================

app.use(cors());
app.use(express.json());

// ============================================
// API ROUTES
// ============================================

// Authentication
app.use("/api/auth", authRoutes);

// Medicines
app.use("/api/medicines", medicineRoutes);

// Sales
app.use("/api/sales", saleRoutes);

// Suppliers
// All supplier routes require login.
// Only admins can add, edit or delete suppliers.
// GET requests are available to authenticated users.
app.use(
    "/api/suppliers",
    protect,
    (req, res, next) => {
        if (req.method === "GET") {
            return next();
        }

        return authorize("admin")(req, res, next);
    },
    supplierRoutes
);

// Purchases (admin only)
app.use("/api/purchases", purchaseRoutes);

// Reports (admin only)
app.use("/api/reports", reportRoutes);

app.use("/api/staff", staffRoutes);
app.use("/api/admin/audit-logs", auditRoutes);
app.use("/api/supplier-accounts", supplierAccountRoutes);
app.use("/api/restock-requests", restockRoutes);

// ============================================
// HOME ROUTE
// ============================================

app.get("/", (req, res) => {
    res.status(200).json({
        message: "MediVault API is running successfully!"
    });
});

// ============================================
// PROTECTED TEST ROUTE
// ============================================

app.get("/api/test/protected", protect, (req, res) => {
    res.status(200).json({
        message: "You accessed a protected route successfully!",
        user: req.user
    });
});

// ============================================
// ADMIN-ONLY TEST ROUTE
// ============================================

app.get(
    "/api/test/admin",
    protect,
    authorize("admin"),
    (req, res) => {
        res.status(200).json({
            message: "Welcome Admin! You have admin access.",
            user: req.user
        });
    }
);

// ============================================
// HANDLE UNKNOWN ROUTES
// ============================================

app.use((req, res) => {
    res.status(404).json({
        message: "API route not found"
    });
});

// ============================================
// CONNECT TO MONGODB AND START SERVER
// ============================================

const PORT = process.env.PORT || 5000;

async function startServer() {
    try {
        await mongoose.connect(process.env.MONGO_URI);

        console.log("MongoDB connected successfully!");

        app.listen(PORT, () => {
            console.log(
                `MediVault server running on http://localhost:${PORT}`
            );
        });
    } catch (error) {
        console.error(
            "MongoDB connection failed:",
            error.message
        );

        process.exit(1);
    }
}

startServer();
