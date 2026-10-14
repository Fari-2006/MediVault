
const express = require("express");
const mongoose = require("mongoose");
const Medicine = require("../models/Medicine");

const {
    protect,
    authorize
} = require("../middleware/authMiddleware");

const router = express.Router();

// Roles allowed to manage medicines
const medicineManagers = authorize("admin");

// ============================================
// 1. ADD A NEW MEDICINE
// POST /api/medicines
// ============================================

router.post(
    "/",
    protect,
    medicineManagers,
    async (req, res) => {
        try {
            const {
                medicineName,
                genericName,
                category,
                batchNumber,
                manufacturer,
                barcode,
                purchasePrice,
                sellingPrice,
                gstPercentage,
                quantity,
                reorderLevel,
                expiryDate,
                prescriptionRequired,
                status
            } = req.body;

            // Check required fields
            if (
                !medicineName ||
                !category ||
                !batchNumber ||
                !manufacturer ||
                purchasePrice === undefined ||
                sellingPrice === undefined ||
                quantity === undefined ||
                !expiryDate
            ) {
                return res.status(400).json({
                    message: "Please provide all required medicine fields."
                });
            }

            // Validate numerical fields
            const numericFields = {
                purchasePrice,
                sellingPrice,
                quantity,
                reorderLevel,
                gstPercentage
            };

            for (const [field, value] of Object.entries(numericFields)) {
                if (
                    value !== undefined &&
                    value !== null &&
                    (
                        value === "" ||
                        !Number.isFinite(Number(value))
                    )
                ) {
                    return res.status(400).json({
                        message: `${field} must be a valid number.`
                    });
                }
            }

            // Validate expiry date
            if (
                typeof expiryDate !== "string" ||
                !/^\d{4}-\d{2}-\d{2}$/.test(expiryDate) ||
                Number.isNaN(Date.parse(expiryDate)) ||
                new Date(expiryDate).toISOString().slice(0, 10) !== expiryDate
            ) {
                return res.status(400).json({
                    message: "Please provide a valid expiry date in YYYY-MM-DD format."
                });
            }

            // Create medicine
            const medicine = await Medicine.create({
                medicineName,
                genericName,
                category,
                batchNumber,
                manufacturer,
                barcode,
                purchasePrice,
                sellingPrice,
                gstPercentage,
                quantity,
                reorderLevel,
                expiryDate,
                prescriptionRequired,
                status
            });

            return res.status(201).json({
                message: "Medicine added successfully",
                medicine
            });
        } catch (error) {
            if (error.code === 11000) {
                return res.status(409).json({
                    message: "A medicine with this name and batch number already exists."
                });
            }

            if (error.name === "ValidationError" || error.name === "CastError") {
                return res.status(400).json({
                    message: "Invalid medicine details.",
                    error: error.message
                });
            }

            return res.status(500).json({
                message: "Failed to add medicine.",
                error: error.message
            });
        }
    }
);

// ============================================
// 2. GET ALL MEDICINES + SEARCH + FILTERS
// GET /api/medicines
// GET /api/medicines?search=para
// GET /api/medicines?category=Pain%20Relief
// ============================================

router.get(
    "/",
    protect,
    async (req, res) => {
        try {
            const {
                search,
                category,
                status
            } = req.query;

            const filter = {};

            // Search medicine name, generic name, batch,
            // barcode, or manufacturer
            if (search && search.trim()) {
                const safeSearch = search.trim().replace(
                    /[.*+?^${}()|[\]\\]/g,
                    "\\$&"
                );

                const searchRegex = new RegExp(
                    safeSearch,
                    "i"
                );

                filter.$or = [
                    { medicineName: searchRegex },
                    { genericName: searchRegex },
                    { batchNumber: searchRegex },
                    { barcode: searchRegex },
                    { manufacturer: searchRegex }
                ];
            }

            if (category) {
                filter.category = category;
            }

            if (status) {
                if (!["active", "inactive"].includes(status)) {
                    return res.status(400).json({
                        message: "Status must be active or inactive."
                    });
                }

                filter.status = status;
            }

            const medicines = await Medicine.find(filter)
                .select(req.user.role === "admin" ? "" : "-purchasePrice")
                .sort({ medicineName: 1 });

            return res.status(200).json({
                count: medicines.length,
                medicines
            });
        } catch (error) {
            return res.status(500).json({
                message: "Failed to retrieve medicines.",
                error: error.message
            });
        }
    }
);

// ============================================
// 3. LOW STOCK ALERTS
// GET /api/medicines/alerts/low-stock
// ============================================

router.get(
    "/alerts/low-stock",
    protect,
    async (req, res) => {
        try {
            const medicines = await Medicine.find({
                status: "active",
                $expr: {
                    $lte: ["$quantity", "$reorderLevel"]
                }
            }).sort({ quantity: 1 });

            return res.status(200).json({
                count: medicines.length,
                message: "Low stock medicines retrieved successfully",
                medicines
            });
        } catch (error) {
            return res.status(500).json({
                message: "Failed to retrieve low stock medicines.",
                error: error.message
            });
        }
    }
);


 // ============================================
 // NEAR-EXPIRY MEDICINES ALERT
 // GET /api/medicines/alerts/near-expiry
 // ============================================

router.get(
    "/alerts/near-expiry",
    protect,
    async (req, res) => {
        try {
            const days = Number(req.query.days ?? 90);

            if (
                !Number.isInteger(days) ||
                days < 1 ||
                days > 365
            ) {
                return res.status(400).json({
                    message: "Days must be an integer between 1 and 365."
                });
            }

            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const expiryLimit = new Date(today);
            expiryLimit.setDate(expiryLimit.getDate() + days);

            const medicines = await Medicine.find({
                status: "active",
                expiryDate: {
                    $gte: today,
                    $lte: expiryLimit
                }
            }).sort({ expiryDate: 1 });

            return res.status(200).json({
                count: medicines.length,
                days,
                message: "Near-expiry medicines retrieved successfully",
                medicines
            });
        } catch (error) {
            return res.status(500).json({
                message: "Failed to retrieve near-expiry medicines.",
                error: error.message
            });
        }
    }
);

// ============================================
// 4. GET A MEDICINE BY ID
// GET /api/medicines/:id
// ============================================

router.get(
    "/:id",
    protect,
    async (req, res) => {
        try {
            const { id } = req.params;

            if (!mongoose.isValidObjectId(id)) {
                return res.status(400).json({
                    message: "Invalid medicine ID."
                });
            }

            const medicine = await Medicine.findById(id);

            if (!medicine) {
                return res.status(404).json({
                    message: "Medicine not found."
                });
            }

            return res.status(200).json({
                medicine
            });
        } catch (error) {
            return res.status(500).json({
                message: "Failed to retrieve medicine.",
                error: error.message
            });
        }
    }
);

// ============================================
// 5. UPDATE A MEDICINE
// PUT /api/medicines/:id
// ============================================

router.put(
    "/:id",
    protect,
    medicineManagers,
    async (req, res) => {
        try {
            const { id } = req.params;

            if (!mongoose.isValidObjectId(id)) {
                return res.status(400).json({
                    message: "Invalid medicine ID."
                });
            }

            // Only allow these fields to be updated
            const allowedFields = [
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
                "reorderLevel",
                "expiryDate",
                "prescriptionRequired",
                "status"
            ];

            const updates = {};

            for (const field of allowedFields) {
                if (
                    Object.prototype.hasOwnProperty.call(
                        req.body,
                        field
                    )
                ) {
                    updates[field] = req.body[field];
                }
            }

            if (Object.keys(updates).length === 0) {
                return res.status(400).json({
                    message: "Please provide at least one valid field to update."
                });
            }

            // Validate numerical fields when supplied
            const numericFields = [
                "purchasePrice",
                "sellingPrice",
                "gstPercentage",
                "quantity",
                "reorderLevel"
            ];

            for (const field of numericFields) {
                if (
                    Object.prototype.hasOwnProperty.call(
                        updates,
                        field
                    )
                ) {
                    const value = updates[field];

                    if (
                        value === "" ||
                        value === null ||
                        !Number.isFinite(Number(value))
                    ) {
                        return res.status(400).json({
                            message: `${field} must be a valid number.`
                        });
                    }

                    updates[field] = Number(value);
                }
            }

            // Validate expiry date when supplied
            if (
                Object.prototype.hasOwnProperty.call(
                    updates,
                    "expiryDate"
                )
            ) {
                const expiryDate = updates.expiryDate;

                if (
                    typeof expiryDate !== "string" ||
                    !/^\d{4}-\d{2}-\d{2}$/.test(expiryDate) ||
                    Number.isNaN(Date.parse(expiryDate)) ||
                    new Date(expiryDate).toISOString().slice(0, 10) !== expiryDate
                ) {
                    return res.status(400).json({
                        message: "Please provide a valid expiry date in YYYY-MM-DD format."
                    });
                }
            }

            const medicine = await Medicine.findByIdAndUpdate(
                id,
                { $set: updates },
                {
                    new: true,
                    runValidators: true
                }
            );

            if (!medicine) {
                return res.status(404).json({
                    message: "Medicine not found."
                });
            }

            return res.status(200).json({
                message: "Medicine updated successfully",
                medicine
            });
        } catch (error) {
            if (error.code === 11000) {
                return res.status(409).json({
                    message: "A medicine with this name and batch number already exists."
                });
            }

            if (error.name === "ValidationError" || error.name === "CastError") {
                return res.status(400).json({
                    message: "Invalid medicine details.",
                    error: error.message
                });
            }

            return res.status(500).json({
                message: "Failed to update medicine.",
                error: error.message
            });
        }
    }
);

// ============================================
// 6. DELETE A MEDICINE
// DELETE /api/medicines/:id
// Admin only
// ============================================

router.delete(
    "/:id",
    protect,
    authorize("admin"),
    async (req, res) => {
        try {
            const { id } = req.params;

            if (!mongoose.isValidObjectId(id)) {
                return res.status(400).json({
                    message: "Invalid medicine ID."
                });
            }

            const medicine = await Medicine.findByIdAndDelete(id);

            if (!medicine) {
                return res.status(404).json({
                    message: "Medicine not found."
                });
            }

            return res.status(200).json({
                message: "Medicine deleted successfully",
                medicine
            });
        } catch (error) {
            return res.status(500).json({
                message: "Failed to delete medicine.",
                error: error.message
            });
        }
    }
);

module.exports = router;
