const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();

// Import routes
const authRoutes = require("./routes/authRoutes");

// Import authentication middleware
const { protect, authorize } = require("./middleware/authMiddleware");

const app = express();

// ==================================================
// MIDDLEWARE
// ==================================================

app.use(cors());
app.use(express.json());

// ==================================================
// AUTHENTICATION ROUTES
// ==================================================

app.use("/api/auth", authRoutes);

// ==================================================
// HOME / TEST ROUTE
// ==================================================

app.get("/", (req, res) => {
    res.json({
        message: "MediVault API is running successfully!"
    });
});

// ==================================================
// PROTECTED TEST ROUTE
// ==================================================

app.get("/api/test/protected", protect, (req, res) => {
    res.json({
        message: "You accessed a protected route successfully!",
        user: req.user
    });
});

// ==================================================
// ADMIN-ONLY TEST ROUTE
// ==================================================

app.get(
    "/api/test/admin",
    protect,
    authorize("admin"),
    (req, res) => {
        res.json({
            message: "Welcome Admin! You have admin access.",
            user: req.user
        });
    }
);

// ==================================================
// MONGODB CONNECTION
// ==================================================

mongoose
    .connect(process.env.MONGO_URI)
    .then(() => {
        console.log("MongoDB connected successfully!");
    })
    .catch((error) => {
        console.error("MongoDB connection failed:", error.message);
    });

// ==================================================
// START SERVER
// ==================================================

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`MediVault server running on http://localhost:${PORT}`);
});