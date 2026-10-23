const express = require("express");
const mongoose = require("mongoose");

const Sale = require("../models/Sale");
const Medicine = require("../models/Medicine");
const allocateFefo = require("../fefoAllocation");
const { protect, authorize } = require("../middleware/authMiddleware");

const router = express.Router();

// CREATE A SALE
router.post(
    "/",
    protect,
    authorize("admin", "cashier"),
    async (req, res) => {
        let session;

        try {
            const { items, paymentMethod = "cash" } = req.body;

            // Validate sale items.
            if (!Array.isArray(items) || items.length === 0) {
                return res.status(400).json({
                    message: "Please add at least one medicine."
                });
            }

            // Validate payment method.
            if (!["cash", "upi", "card"].includes(paymentMethod)) {
                return res.status(400).json({
                    message: "Invalid payment method."
                });
            }

            // Validate quantities and combine duplicate medicine IDs.
            const quantities = new Map();

            for (const item of items) {
                if (
                    !item.medicineId ||
                    !mongoose.isValidObjectId(item.medicineId) ||
                    !Number.isSafeInteger(item.quantity) ||
                    item.quantity < 1
                ) {
                    return res.status(400).json({
                        message:
                            "Each item needs a valid medicine ID and a positive whole-number quantity."
                    });
                }

                const id = item.medicineId;
                const combinedQuantity =
                    (quantities.get(id) || 0) + item.quantity;

                if (!Number.isSafeInteger(combinedQuantity)) {
                    return res.status(400).json({
                        message: "Quantity is too large."
                    });
                }

                quantities.set(id, combinedQuantity);
            }

            let invoiceNumber;
            let saleData;

            // Start a MongoDB transaction.
            session = await mongoose.startSession();

            await session.withTransaction(async () => {
                const requestedIds = [...quantities.keys()].sort();
                const requested = await Medicine.find({ _id: { $in: requestedIds } }).session(session);
                if (requested.length !== requestedIds.length) throw new Error("MEDICINE_NOT_FOUND");
                const saleItems = [];
                let subtotalCents = 0;
                let totalGSTCents = 0;
                const today = new Date();
                today.setUTCHours(0, 0, 0, 0);
                // Group requested batch IDs by medicine name so checkout always allocates FEFO.
                const groups = new Map();
                for (const selected of requested) {
                    const key = selected.medicineName.trim().toLowerCase();
                    groups.set(key, (groups.get(key) || 0) + quantities.get(String(selected._id)));
                }
                for (const [nameKey, requestedQty] of groups) {
                    const example = requested.find(m => m.medicineName.trim().toLowerCase() === nameKey);
                    const candidates = await Medicine.find({
                        medicineName: example.medicineName,
                        status: "active",
                        quantity: { $gt: 0 }
                    }).sort({ expiryDate: 1, _id: 1 }).session(session);
                    const allocation = allocateFefo(candidates, requestedQty, today);
                    if (!allocation.allocations)
                        throw new Error("INSUFFICIENT_STOCK:" + example.medicineName + ": available " + allocation.available);
                    for (const { batch: medicine, quantity } of allocation.allocations) {
                        const unitPriceCents = Math.round(medicine.sellingPrice * 100);
                        const unitPrice = unitPriceCents / 100;
                        const gstPercentage = medicine.gstPercentage || 0;
                        const itemSubtotalCents = unitPriceCents * quantity;
                        const gstAmountCents = Math.round(itemSubtotalCents * gstPercentage / 100);
                        if (!Number.isSafeInteger(itemSubtotalCents) || !Number.isSafeInteger(gstAmountCents))
                            throw new Error("AMOUNT_TOO_LARGE");
                        const itemSubtotal = itemSubtotalCents / 100;
                        const gstAmount = gstAmountCents / 100;
                        saleItems.push({
                            medicine: medicine._id,
                            medicineName: medicine.medicineName,
                            batchNumber: medicine.batchNumber,
                            expiryDate: medicine.expiryDate,
                            quantity, unitPrice, unitCost: medicine.purchasePrice, gstPercentage,
                            subtotal: itemSubtotal, gstAmount,
                            total: (itemSubtotalCents + gstAmountCents) / 100
                        });
                        subtotalCents += itemSubtotalCents;
                        totalGSTCents += gstAmountCents;
                    }
                }

                if (!Number.isSafeInteger(subtotalCents) || !Number.isSafeInteger(totalGSTCents))
                    throw new Error("AMOUNT_TOO_LARGE");
                const subtotal = subtotalCents / 100;
                const totalGST = totalGSTCents / 100;
                const grandTotalCents = subtotalCents + totalGSTCents;
                if (!Number.isSafeInteger(grandTotalCents)) throw new Error("AMOUNT_TOO_LARGE");
                const grandTotal = grandTotalCents / 100;

                // Generate invoice number.
                invoiceNumber =
                    "MV-" +
                    Date.now() +
                    "-" +
                    new mongoose.Types.ObjectId().toString().slice(-6);

                // Create the sale inside the transaction.
                const [sale] = await Sale.create(
                    [
                        {
                            invoiceNumber,
                            items: saleItems,
                            subtotal,
                            totalGST,
                            grandTotal,
                            soldBy: req.user.id,
                            paymentMethod,
                            status: "completed"
                        }
                    ],
                    { session }
                );

                // Deduct stock only if the medicine is still active,
                // unexpired, and has sufficient stock.
                for (const item of saleItems) {
                    const result = await Medicine.updateOne(
                        {
                            _id: item.medicine,
                            status: "active",
                            quantity: { $gte: item.quantity },
                            $or: [
                                { expiryDate: null },
                                { expiryDate: { $exists: false } },
                                {
                                    expiryDate: {
                                        $gte: new Date(
                                            new Date().setUTCHours(0, 0, 0, 0)
                                        )
                                    }
                                }
                            ]
                        },
                        {
                            $inc: {
                                quantity: -item.quantity
                            }
                        },
                        { session }
                    );

                    if (result.modifiedCount !== 1) {
                        throw new Error(
                            `STOCK_UPDATE_FAILED:${item.medicineName}`
                        );
                    }
                }

                saleData = sale.toObject();
            });

            return res.status(201).json({
                message: "Sale completed successfully.",
                sale: saleData
            });
        } catch (error) {
            if (error.message === "AMOUNT_TOO_LARGE") {
                return res.status(400).json({ message: "Sale amount is too large." });
            }

            if (error.message === "MEDICINE_NOT_FOUND") {
                return res.status(404).json({
                    message:
                        "One or more medicines were not found."
                });
            }

            if (error.message.startsWith("MEDICINE_INACTIVE:")) {
                return res.status(400).json({
                    message:
                        error.message.substring(
                            "MEDICINE_INACTIVE:".length
                        ) + " is inactive and cannot be sold."
                });
            }

            if (error.message.startsWith("MEDICINE_EXPIRED:")) {
                return res.status(400).json({
                    message:
                        error.message.substring(
                            "MEDICINE_EXPIRED:".length
                        ) + " has expired and cannot be sold."
                });
            }

            if (error.message.startsWith("INSUFFICIENT_STOCK:")) {
                return res.status(400).json({
                    message: error.message.substring(
                        "INSUFFICIENT_STOCK:".length
                    )
                });
            }

            if (error.message.startsWith("STOCK_UPDATE_FAILED:")) {
                return res.status(409).json({
                    message:
                        "Medicine stock or expiry status changed during checkout. Please refresh and retry the sale."
                });
            }

            console.error("Sale creation failed:", error);

            return res.status(500).json({
                message: "Unable to complete sale."
            });
        } finally {
            if (session) {
                await session.endSession();
            }
        }
    }
);

// GET SALES HISTORY
router.get(
    "/",
    protect,
    authorize("admin", "pharmacist", "cashier"),
    async (req, res) => {
        try {
            const sales = await Sale.find(req.user.role === "admin" ? {} : { soldBy: req.user.id })
                .sort({ createdAt: -1 })
                .limit(100)
                .populate("soldBy", "name email");

            return res.status(200).json({
                count: sales.length,
                sales
            });
        } catch (error) {
            console.error("Fetching sales failed:", error);

            return res.status(500).json({
                message: "Unable to fetch sales history."
            });
        }
    }
);

// GET A SINGLE SALE BY ID
router.get(
    "/:id",
    protect,
    authorize("admin", "pharmacist", "cashier"),
    async (req, res) => {
        try {
            if (!mongoose.isValidObjectId(req.params.id)) {
                return res.status(400).json({
                    message: "Invalid sale ID."
                });
            }

            const sale = await Sale.findOne(req.user.role === "admin" ? { _id: req.params.id } : { _id: req.params.id, soldBy: req.user.id })
                .populate("soldBy", "name email");

            if (!sale) {
                return res.status(404).json({
                    message: "Sale not found."
                });
            }

            return res.status(200).json({ sale });
        } catch (error) {
            console.error("Fetching sale failed:", error);

            return res.status(500).json({
                message: "Unable to fetch sale."
            });
        }
    }
);

module.exports = router;
