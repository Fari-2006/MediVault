const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const helmet = require("helmet");
const path = require("path");
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
const supplierOrderRoutes = require("./routes/supplierOrderRoutes");
const adminOrderRoutes = require("./routes/adminOrderRoutes");

// ============================================
// IMPORT AUTHENTICATION MIDDLEWARE
// ============================================

const {
    protect,
    authorize
} = require("./middleware/authMiddleware");

const app = express();
const frontendOrigin = process.env.FRONTEND_ORIGIN;

// ============================================
// MIDDLEWARE
// ============================================

app.disable("x-powered-by");
app.use(helmet());
app.use(cors(frontendOrigin ? { origin: frontendOrigin } : { origin: false }));
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "../frontend")));

// ============================================
// API ROUTES
// ============================================

// Authentication
app.use("/api/auth", authRoutes);

// Medicines
app.use("/api/medicines", medicineRoutes);

// Sales
app.use("/api/sales", saleRoutes);

// Supplier records are restricted to admins.
app.use("/api/suppliers", protect, authorize("admin"), supplierRoutes);

// Purchases (admin only)
app.use("/api/purchases", purchaseRoutes);

// Reports (admin only)
app.use("/api/reports", reportRoutes);

app.use("/api/staff", staffRoutes);
app.use("/api/admin/audit-logs", auditRoutes);
app.use("/api/supplier-accounts", supplierAccountRoutes);
app.use("/api/restock-requests", restockRoutes);
app.use("/api/supplier", supplierOrderRoutes);
app.use("/api/admin/purchase-orders", adminOrderRoutes);

// ============================================
// HOME ROUTE
// ============================================

app.get("/api/health", (req, res) => {
    res.status(200).json({ message: "MediVault API is running successfully!" });
});

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "../frontend/index.html"));
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
    res.status(404).json({ message: "API route not found" });
});

app.use((error, req, res, next) => {
    if (res.headersSent) return next(error);
    const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 500 ? error.status : 500;
    if (status === 500) console.error("Request failed:", error.message);
    res.status(status).json({ message: status === 500 ? "An unexpected server error occurred." : error.message });
});

// ============================================
// CONNECT TO MONGODB AND START SERVER
// ============================================

const PORT = process.env.PORT || 5000;

async function startServer() {
    const missing = ["MONGO_URI", "JWT_SECRET"].filter(name => !process.env[name]);
    if (missing.length) {
        console.error(`Missing required environment variables: ${missing.join(", ")}`);
        process.exit(1);
    }

    if (process.env.JWT_SECRET.length < 32) {
        console.error("JWT_SECRET must be at least 32 characters long.");
        process.exit(1);
    }

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
