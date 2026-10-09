
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();

// Import routes
const authRoutes = require("./routes/authRoutes");
const medicineRoutes = require("./routes/medicineRoutes");
const saleRoutes = require("./routes/saleRoutes");

// Import authentication middleware
const {
    protect,
    authorize
} = require("./middleware/authMiddleware");

const app = express();

// MIDDLEWARE
app.use(cors());
app.use(express.json());

// API ROUTES
app.use("/api/auth", authRoutes);
app.use("/api/medicines", medicineRoutes);
app.use("/api/sales", saleRoutes);

// HOME ROUTE
app.get("/", (req, res) => {
    res.status(200).json({
        message: "MediVault API is running successfully!"
    });
});

// PROTECTED TEST ROUTE
app.get("/api/test/protected", protect, (req, res) => {
    res.status(200).json({
        message: "You accessed a protected route successfully!",
        user: req.user
    });
});

// ADMIN-ONLY TEST ROUTE
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

// HANDLE UNKNOWN ROUTES
app.use((req, res) => {
    res.status(404).json({
        message: "API route not found"
    });
});

// CONNECT TO MONGODB AND START SERVER
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
