"use strict";
const express = require("express");
const User = require("../models/User");
const AuditLog = require("../models/AuditLog");
const { protect, authorize } = require("../middleware/authMiddleware");
const router = express.Router();
router.use(protect, authorize("admin"));
const safe = u => ({ id: u._id, name: u.name, email: u.email, phone: u.phone,
  address: u.address, role: u.role, approvalStatus: u.approvalStatus,
  rejectionReason: u.rejectionReason, isActive: u.isActive,
  joiningDate: u.joiningDate, jobTitle: u.jobTitle, employmentStatus: u.employmentStatus,
  createdAt: u.createdAt });
router.get("/", async (req, res) => {
  const filter = { role: "cashier" };
  if (req.query.status) {
    if (!["pending", "approved", "rejected"].includes(req.query.status))
      return res.status(400).json({ message: "Invalid status." });
    filter.approvalStatus = req.query.status;
  }
  const users = await User.find(filter).sort({ createdAt: -1 }).limit(200);
  res.json({ count: users.length, staff: users.map(safe) });
});
router.patch("/:id/approval", async (req, res) => {
  const { action, reason } = req.body || {};
  if (!["approve", "reject"].includes(action))
    return res.status(400).json({ message: "Choose approve or reject." });
  const user = await User.findOne({ _id: req.params.id, role: "cashier", approvalStatus: "pending" }).catch(() => null);
  if (!user) return res.status(404).json({ message: "Pending cashier application not found." });
  user.approvalStatus = action === "approve" ? "approved" : "rejected";
  user.isActive = action === "approve";
  user.rejectionReason = action === "reject" ? String(reason || "").slice(0, 500) : "";
  if (action === "approve") user.joiningDate = new Date();
  await user.save();
  await AuditLog.create({ actor: req.user.id, action: action === "approve" ? "staff.approved" : "staff.rejected", targetType: "User", targetId: user._id, details: { reason: user.rejectionReason } }).catch(error => console.error("Audit log error:", error));
  res.json({ message: "Application " + (action === "approve" ? "approved" : "rejected") + ".", staff: safe(user) });
});
router.patch("/:id/status", async (req, res) => {
  if (typeof req.body?.isActive !== "boolean") return res.status(400).json({ message: "isActive must be true or false." });
  const user = await User.findOne({ _id: req.params.id, role: "cashier", approvalStatus: "approved" }).catch(() => null);
  if (!user) return res.status(404).json({ message: "Approved cashier not found." });
  user.isActive = req.body.isActive;
  await user.save();
  await AuditLog.create({ actor: req.user.id, action: user.isActive ? "staff.activated" : "staff.deactivated", targetType: "User", targetId: user._id }).catch(error => console.error("Audit log error:", error));
  res.json({ message: "Staff status updated.", staff: safe(user) });
});
module.exports = router;
