"use strict";
const express = require("express");
const mongoose = require("mongoose");
const Purchase = require("../models/Purchase");
const Supplier = require("../models/Supplier");
const Medicine = require("../models/Medicine");
const { protect, authorize } = require("../middleware/authMiddleware");

const router = express.Router();
router.use(protect, authorize("admin"));

router.get("/", async (req, res) => {
  try {
    const purchases = await Purchase.find().sort({ createdAt: -1 }).limit(100)
      .populate("supplier", "supplierName contactPerson phone")
      .populate("purchasedBy", "name email");
    res.json({ count: purchases.length, purchases });
  } catch (error) {
    console.error("Purchase history error:", error);
    res.status(500).json({ message: "Could not load purchase history." });
  }
});

router.get("/:id", async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.id))
      return res.status(400).json({ message: "Invalid purchase ID." });
    const purchase = await Purchase.findById(req.params.id)
      .populate("supplier", "supplierName contactPerson phone address")
      .populate("purchasedBy", "name email");
    if (!purchase) return res.status(404).json({ message: "Purchase not found." });
    res.json({ purchase });
  } catch (error) {
    console.error("Purchase detail error:", error);
    res.status(500).json({ message: "Could not load purchase." });
  }
});

router.post("/", async (req, res) => {
  const { supplierId, medicineId, quantity, unitCost, requestId, newBatch } = req.body || {};
  if (!mongoose.isValidObjectId(supplierId) || !mongoose.isValidObjectId(medicineId))
    return res.status(400).json({ message: "Choose a valid supplier and medicine." });
  if (!Number.isSafeInteger(quantity) || quantity < 1)
    return res.status(400).json({ message: "Quantity must be a positive whole number." });
  if (typeof unitCost !== "number" || !Number.isFinite(unitCost) || unitCost < 0 ||
      Math.round(unitCost * 100) !== unitCost * 100)
    return res.status(400).json({ message: "Unit cost must be a nonnegative amount with at most two decimal places." });
  // Client-generated stable requestId prevents duplicate stock increases after a retry.
  if (typeof requestId !== "string" || !/^[a-zA-Z0-9_-]{8,100}$/.test(requestId))
    return res.status(400).json({ message: "A unique requestId (8–100 letters, digits, _ or -) is required." });

  if (newBatch !== undefined) {
    if (!newBatch || typeof newBatch !== "object" || Array.isArray(newBatch))
      return res.status(400).json({ message: "Invalid new batch." });
    const { batchNumber, expiryDate } = newBatch;
    if (typeof batchNumber !== "string" || !batchNumber.trim() || batchNumber.trim().length > 100)
      return res.status(400).json({ message: "Enter a new batch number." });
    if (typeof expiryDate !== "string" || !/^\\d{4}-\\d{2}-\\d{2}$/.test(expiryDate) ||
        Number.isNaN(Date.parse(expiryDate)) || new Date(expiryDate).toISOString().slice(0, 10) !== expiryDate)
      return res.status(400).json({ message: "Enter a valid expiry date." });
    if (expiryDate < new Date().toISOString().slice(0, 10))
      return res.status(400).json({ message: "Cannot receive an expired batch." });
  }
  let session;
  try {
    session = await mongoose.startSession();
    let saved;
    await session.withTransaction(async () => {
      const existing = await Purchase.findOne({ purchaseNumber: requestId }).session(session);
      if (existing) {
        if (existing.purchasedBy.toString() !== req.user.id.toString())
          throw new Error("DUPLICATE_REQUEST");
        saved = existing;
        return;
      }
      const supplier = await Supplier.findById(supplierId).session(session);
      if (!supplier || supplier.status !== "active") throw new Error("SUPPLIER_INVALID");
      const medicine = await Medicine.findById(medicineId).session(session);
      if (!medicine) throw new Error("MEDICINE_NOT_FOUND");
      if (medicine.status !== "active") throw new Error("MEDICINE_INACTIVE");
      let targetMedicine = medicine;
      if (newBatch) {
        const batchNumber = newBatch.batchNumber.trim();
        const duplicate = await Medicine.findOne({
          medicineName: medicine.medicineName, batchNumber
        }).session(session);
        if (duplicate) throw new Error("BATCH_EXISTS");
        const [created] = await Medicine.create([{
          medicineName: medicine.medicineName,
          genericName: medicine.genericName,
          category: medicine.category,
          batchNumber,
          manufacturer: medicine.manufacturer,
          barcode: "",
          purchasePrice: unitCost,
          sellingPrice: medicine.sellingPrice,
          gstPercentage: medicine.gstPercentage,
          quantity: 0,
          reorderLevel: medicine.reorderLevel,
          expiryDate: newBatch.expiryDate,
          prescriptionRequired: medicine.prescriptionRequired,
          status: "active"
        }], { session });
        targetMedicine = created;
      }
      const totalCost = Math.round(quantity * Math.round(unitCost * 100)) / 100;
      if (!Number.isSafeInteger(Math.round(totalCost * 100))) throw new Error("AMOUNT_TOO_LARGE");
      const [purchase] = await Purchase.create([{
        purchaseNumber: requestId, supplier: supplier._id, medicine: targetMedicine._id,
        medicineName: targetMedicine.medicineName, batchNumber: targetMedicine.batchNumber,
        expiryDate: targetMedicine.expiryDate, quantity, unitCost, totalCost,
        purchasedBy: req.user.id
      }], { session });
      const result = await Medicine.updateOne(
        { _id: targetMedicine._id, status: "active" },
        { $inc: { quantity }, $set: { purchasePrice: unitCost } },
        { session, runValidators: true }
      );
      if (result.modifiedCount !== 1) throw new Error("STOCK_UPDATE_FAILED");
      saved = purchase;
    });
    res.status(201).json({ message: "Purchase recorded and stock updated.", purchase: saved });
  } catch (error) {
    if (error.code === 11000 || error.message === "DUPLICATE_REQUEST")
      return res.status(409).json({ message: "This purchase request has already been recorded. Refresh purchase history." });
    const errors = {
      SUPPLIER_INVALID: [400, "Supplier not found or inactive."],
      MEDICINE_NOT_FOUND: [404, "Medicine not found."],
      MEDICINE_INACTIVE: [400, "Inactive medicines cannot receive stock."],
      BATCH_EXISTS: [409, "Batch already exists. Receive stock into that batch instead."],
      AMOUNT_TOO_LARGE: [400, "Purchase amount is too large."],
      STOCK_UPDATE_FAILED: [409, "Medicine changed while recording purchase. Please retry."]
    };
    const known = errors[error.message];
    if (known) return res.status(known[0]).json({ message: known[1] });
    console.error("Purchase creation error:", error);
    res.status(500).json({ message: "Unable to record purchase. MongoDB transactions require a replica set." });
  } finally {
    if (session) await session.endSession();
  }
});

module.exports = router;
