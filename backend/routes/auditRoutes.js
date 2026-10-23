"use strict";
const express = require("express");
const { protect, authorize } = require("../middleware/authMiddleware");
const AuditLog = require("../models/AuditLog");
const router = express.Router();
router.use(protect, authorize("admin"));
router.get("/", async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, Number.parseInt(req.query.limit, 10) || 50));
    const logs = await AuditLog.find().sort({ createdAt: -1 }).limit(limit)
      .populate("actor", "name email role").lean();
    res.json({ count: logs.length, logs });
  } catch (error) {
    console.error("Audit history error:", error);
    res.status(500).json({ message: "Unable to load audit history." });
  }
});
module.exports = router;
