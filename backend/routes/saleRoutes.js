
const express = require("express");
const mongoose = require("mongoose");

const Sale = require("../models/Sale");
const Medicine = require("../models/Medicine");
const { protect, authorize } = require("../middleware/authMiddleware");

const router = express.Router();

// CREATE A SALE
router.post(
    "/",
    protect,
    authorize("admin", "pharmacist", "cashier"),
    async (req, res) => {
        const session = await mongoose.startSession();

        try {
            const { items, paymentMethod = "cash" } = req.body;

            if (!Array.isArray(items) || items.length === 0) {
                return res.status(400).json({
                    message: "Please add at least one medicine."
                });
            }

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
                        message: "Each item needs a valid medicine ID and a positive whole-number quantity."
                    });
                }

                const id = item.medicineId;
                quantities.set(
                    id,
                    (quantities.get(id) || 0) + item.quantity
                );

                if (!Number.isSafeInteger(quantities.get(id))) {
                    return res.status(400).json({
                        message: "Quantity is too large."
                    });
                }
            }

            let invoiceNumber;
            let saleData;

            // A transaction ensures stock and sale records stay consistent.
            await session.withTransaction(async () => {
                const medicineIds = [...quantities.keys()].sort();

                const medicines = await Medicine.find({
                    _id: { $in: medicineIds },
                    status: "active"
                })
                    .sort({ _id: 1 })
                    .session(session);

                if (medicines.length !== medicineIds.length) {
                    throw new Error("MEDICINE_NOT_FOUND");
                }

                const saleItems = [];
                let subtotal = 0;
                let totalGST = 0;

                for (const medicine of medicines) {
                    const quantity = quantities.get(
                        medicine._id.toString()
                    );

                    if (medicine.quantity < quantity) {
                        throw new Error(
                            `INSUFFICIENT_STOCK:${medicine.medicineName}: available ${medicine.quantity}`
                        );
                    }

                    const unitPrice = medicine.sellingPrice;
                    const gstPercentage = medicine.gstPercentage || 0;

                    const itemSubtotal = Number(
                        (unitPrice * quantity).toFixed(2)
                    );

                    const gstAmount = Number(
                        (itemSubtotal * gstPercentage / 100).toFixed(2)
                    );

                    const itemTotal = Number(
                        (itemSubtotal + gstAmount).toFixed(2)
                    );

                    saleItems.push({
                        medicine: medicine._id,
                        medicineName: medicine.medicineName,
                        quantity,
                        unitPrice,
                        gstPercentage,
                        subtotal: itemSubtotal,
                        gstAmount,
                        total: itemTotal
                    });

                    subtotal += itemSubtotal;
                    totalGST += gstAmount;
                }

                subtotal = Number(subtotal.toFixed(2));
                totalGST = Number(totalGST.toFixed(2));

                const grandTotal = Number(
                    (subtotal + totalGST).toFixed(2)
                );

                invoiceNumber =
                    "MV-" +
                    Date.now() +
                    "-" +
                    new mongoose.Types.ObjectId().toString().slice(-6);

                const [sale] = await Sale.create(
                    [{
                        invoiceNumber,
                        items: saleItems,
                        subtotal,
                        totalGST,
                        grandTotal,
                        soldBy: req.user.id,
                        paymentMethod,
                        status: "completed"
                    }],
                    { session }
                );

                // Deduct stock only if sufficient stock remains.
                for (const item of saleItems) {
                    const result = await Medicine.updateOne(
                        {
                            _id: item.medicine,
                            status: "active",
                            quantity: { $gte: item.quantity }
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
            if (error.message === "MEDICINE_NOT_FOUND") {
                return res.status(404).json({
                    message: "One or more medicines were not found or are inactive."
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
                    message: "Stock changed during checkout. Please retry the sale."
                });
            }

            console.error("Sale creation failed:", error);

            return res.status(500).json({
                message: "Unable to complete sale."
            });
        } finally {
            await session.endSession();
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
            const sales = await Sale.find()
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

            const sale = await Sale.findById(req.params.id)
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
