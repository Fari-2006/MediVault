"use strict";
const express = require("express");
const mongoose = require("mongoose");
const Medicine = require("../models/Medicine");
const User = require("../models/User");
const Supplier = require("../models/Supplier");
const RestockRequest = require("../models/RestockRequest");
const { protect, authorize } = require("../middleware/authMiddleware");
const router = express.Router();
router.use(protect);
const isId = id => mongoose.isValidObjectId(id);
router.get("/", authorize("admin", "cashier"), async (req, res) => {
  try {
    const requests = await RestockRequest.find().sort({ createdAt: -1 }).limit(1000).lean();
    res.json({ requests });
  } catch (error) { res.status(500).json({ message: "Unable to load restock requests." }); }
});
router.post("/", authorize("admin", "cashier"), async (req, res) => {
  const { medicineId, quantity, note = "" } = req.body || {};
  if (!isId(medicineId) || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1000000 ||
      typeof note !== "string" || note.length > 1000)
    return res.status(400).json({ message: "Provide a valid medicine, quantity and optional note (up to 1000 characters)." });
  try {
    const medicine = await Medicine.findById(medicineId).lean();
    if (!medicine || medicine.status !== "active") return res.status(404).json({ message: "Active medicine not found." });
    if (medicine.quantity > medicine.reorderLevel) return res.status(409).json({ message: "This medicine is no longer low stock." });
    const existing = await RestockRequest.findOne({ medicine: medicine._id, active: true }).lean();
    if (existing) return res.status(409).json({ message: "An active restock request already exists.", request: existing });
    const actor = await User.findById(req.user.id).select("name").lean();
    const request = await RestockRequest.create({
      medicine: medicine._id, medicineName: medicine.medicineName, batchNumber: medicine.batchNumber,
      quantityRequested: quantity, note: note.trim(), requestedBy: req.user.id,
      requestedByName: actor?.name || "Pharmacy Staff"
    });
    res.status(201).json({ message: "Order request sent to supplier", request });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: "An active restock request already exists." });
    console.error("Restock request error:", error);
    res.status(500).json({ message: "Unable to create restock request." });
  }
});
router.get("/supplier", authorize("supplier"), async (req, res) => {
  try {
    const supplier = await Supplier.findOne({ linkedUser: req.user.id, status: "active" }).lean();
    if (!supplier) return res.status(403).json({ message: "Active supplier profile required." });
    const requests = await RestockRequest.find({
      $or: [{ status: "Pending", supplier: null }, { supplier: supplier._id }]
    }).sort({ createdAt: -1 }).limit(500).lean();
    res.json({ requests });
  } catch (error) { res.status(500).json({ message: "Unable to load supplier restock requests." }); }
});
router.patch("/:id/status", authorize("supplier"), async (req, res) => {
  const { action } = req.body || {};
  if (!isId(req.params.id) || !["accept", "reject", "deliver"].includes(action))
    return res.status(400).json({ message: "Invalid request or action." });
  try {
    const supplier = await Supplier.findOne({ linkedUser: req.user.id, status: "active" });
    if (!supplier) return res.status(403).json({ message: "Active supplier profile required." });
    const now = new Date();
    let request;
    if (action === "accept") {
      request = await RestockRequest.findOneAndUpdate(
        { _id: req.params.id, status: "Pending", supplier: null },
        { $set: { supplier: supplier._id, status: "Accepted", respondedAt: now } }, { new: true });
    } else if (action === "reject") {
      request = await RestockRequest.findOneAndUpdate(
        { _id: req.params.id, status: "Pending", supplier: null },
        { $set: { supplier: supplier._id, status: "Rejected", active: false, respondedAt: now } }, { new: true });
    } else {
      request = await RestockRequest.findOneAndUpdate(
        { _id: req.params.id, status: "Accepted", supplier: supplier._id },
        { $set: { status: "Delivered", deliveredAt: now } }, { new: true });
    }
    if (!request) return res.status(409).json({ message: "Request has already changed status or belongs to another supplier." });
    // Delivery is a supplier status update only; receiving stock remains an authorized pharmacy operation.
    res.json({ message: "Restock request updated.", request });
  } catch (error) {
    console.error("Restock status error:", error);
    res.status(500).json({ message: "Unable to update restock request." });
  }
});
module.exports = router;
