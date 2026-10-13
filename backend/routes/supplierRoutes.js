
"use strict";

const express = require("express");
const mongoose = require("mongoose");

const Supplier = require("../models/Supplier");

const router = express.Router();

// ============================================
// GET ALL SUPPLIERS
// GET /api/suppliers
// ============================================

router.get("/", async (req, res) => {
    try {
        const suppliers = await Supplier.find()
            .sort({ createdAt: -1 });

        res.status(200).json({
            count: suppliers.length,
            suppliers
        });

    } catch (error) {
        console.error("Get suppliers error:", error);

        res.status(500).json({
            message: "Failed to fetch suppliers."
        });
    }
});

// ============================================
// GET SINGLE SUPPLIER
// GET /api/suppliers/:id
// ============================================

router.get("/:id", async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({
                message: "Invalid supplier ID."
            });
        }

        const supplier = await Supplier.findById(req.params.id);

        if (!supplier) {
            return res.status(404).json({
                message: "Supplier not found."
            });
        }

        res.status(200).json({ supplier });

    } catch (error) {
        console.error("Get supplier error:", error);

        res.status(500).json({
            message: "Failed to fetch supplier."
        });
    }
});

// ============================================
// ADD SUPPLIER
// POST /api/suppliers
// ============================================

router.post("/", async (req, res) => {
    try {
        const {
            supplierName,
            contactPerson,
            phone,
            email,
            address,
            status
        } = req.body;

        if (
            !supplierName?.trim() ||
            !contactPerson?.trim() ||
            !phone?.trim()
        ) {
            return res.status(400).json({
                message:
                    "Supplier name, contact person and phone are required."
            });
        }

        const supplier = await Supplier.create({
            supplierName,
            contactPerson,
            phone,
            email,
            address,
            status
        });

        res.status(201).json({
            message: "Supplier added successfully.",
            supplier
        });

    } catch (error) {
        console.error("Add supplier error:", error);

        if (error.name === "ValidationError") {
            return res.status(400).json({
                message: error.message
            });
        }

        res.status(500).json({
            message: "Failed to add supplier."
        });
    }
});

// ============================================
// UPDATE SUPPLIER
// PUT /api/suppliers/:id
// ============================================

router.put("/:id", async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({
                message: "Invalid supplier ID."
            });
        }

        const allowedFields = [
            "supplierName",
            "contactPerson",
            "phone",
            "email",
            "address",
            "status"
        ];

        const updates = {};

        for (const field of allowedFields) {
            if (req.body[field] !== undefined) {
                updates[field] = req.body[field];
            }
        }

        const supplier = await Supplier.findByIdAndUpdate(
            req.params.id,
            updates,
            {
                new: true,
                runValidators: true
            }
        );

        if (!supplier) {
            return res.status(404).json({
                message: "Supplier not found."
            });
        }

        res.status(200).json({
            message: "Supplier updated successfully.",
            supplier
        });

    } catch (error) {
        console.error("Update supplier error:", error);

        if (error.name === "ValidationError") {
            return res.status(400).json({
                message: error.message
            });
        }

        res.status(500).json({
            message: "Failed to update supplier."
        });
    }
});

// ============================================
// DELETE SUPPLIER
// DELETE /api/suppliers/:id
// ============================================

router.delete("/:id", async (req, res) => {
    try {
        if (!mongoose.isValidObjectId(req.params.id)) {
            return res.status(400).json({
                message: "Invalid supplier ID."
            });
        }

        const supplier = await Supplier.findByIdAndDelete(
            req.params.id
        );

        if (!supplier) {
            return res.status(404).json({
                message: "Supplier not found."
            });
        }

        res.status(200).json({
            message: "Supplier deleted successfully."
        });

    } catch (error) {
        console.error("Delete supplier error:", error);

        res.status(500).json({
            message: "Failed to delete supplier."
        });
    }
});

module.exports = router;
