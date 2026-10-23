"use strict";
const express = require("express");
const mongoose = require("mongoose");
const User = require("../models/User");
const Supplier = require("../models/Supplier");
const Purchase = require("../models/Purchase");
const AuditLog = require("../models/AuditLog");
const { protect, authorize } = require("../middleware/authMiddleware");
const router = express.Router();
router.use(protect);
const safe = u => ({ id: u._id, name: u.name, email: u.email, phone: u.phone,
  approvalStatus: u.approvalStatus, isActive: u.isActive, createdAt: u.createdAt });
router.get("/applications", authorize("admin"), async (req, res) => {
  try {
    const users = await User.find({ role: "supplier" }).sort({ createdAt: -1 }).limit(200).lean();
    const profiles = await Supplier.find({ linkedUser: { $in: users.map(u => u._id) } }).lean();
    const byUser = new Map(profiles.map(s => [String(s.linkedUser), s]));
    res.json({ count: users.length, applications: users.map(u => ({ ...safe(u), supplier: byUser.get(String(u._id)) || null })) });
  } catch (error) { res.status(500).json({ message: "Unable to load supplier applications." }); }
});
router.patch("/applications/:id", authorize("admin"), async (req, res) => {
  const { action } = req.body || {};
  if (!["approve", "reject", "deactivate"].includes(action))
    return res.status(400).json({ message: "Choose approve, reject, or deactivate." });
  if (!mongoose.isValidObjectId(req.params.id))
    return res.status(400).json({ message: "Invalid supplier account ID." });
  try {
    const user = await User.findOne({ _id: req.params.id, role: "supplier" });
    if (!user) return res.status(404).json({ message: "Supplier account not found." });
    if (action !== "deactivate" && user.approvalStatus !== "pending")
      return res.status(409).json({ message: "Only pending applications can be approved or rejected." });
    user.approvalStatus = action === "approve" ? "approved" : "rejected";
    user.isActive = action === "approve";
    await user.save();
    await Supplier.updateOne({ linkedUser: user._id }, { $set: { status: action === "approve" ? "active" : "inactive" } });
    await AuditLog.create({ actor: req.user.id, action: "supplier." + action, targetType: "User", targetId: user._id });
    res.json({ message: "Supplier account " + action + "d.", account: safe(user) });
  } catch (error) {
    console.error("Supplier approval error:", error);
    res.status(500).json({ message: "Unable to update supplier account." });
  }
});
router.get("/me", authorize("supplier"), async (req, res) => {
  try {
    const supplier = await Supplier.findOne({ linkedUser: req.user.id }).lean();
    if (!supplier) return res.status(404).json({ message: "Supplier profile not found." });
    res.json({ supplier });
  } catch (error) { res.status(500).json({ message: "Unable to load supplier profile." }); }
});
router.get("/my-orders", authorize("supplier"), async (req, res) => {
  try {
    const supplier = await Supplier.findOne({ linkedUser: req.user.id });
    if (!supplier) return res.status(404).json({ message: "Supplier profile not found." });
    const orders = await Purchase.find({ supplier: supplier._id }).sort({ createdAt: -1 }).limit(100).lean();
    res.json({ count: orders.length, orders });
  } catch (error) { res.status(500).json({ message: "Unable to load supplier orders." }); }
});
module.exports = router;
