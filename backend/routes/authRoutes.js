"use strict";
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { protect } = require("../middleware/authMiddleware");
const router = express.Router();
const { loginRateLimit, recordFailedLogin, clearLoginFailures } = require("../middleware/loginRateLimit");
const cleanEmail = email => String(email || "").trim().toLowerCase();
const publicUser = user => ({
  id: user._id, name: user.name, email: user.email, role: user.role,
  phone: user.phone, address: user.address, approvalStatus: user.approvalStatus,
  mustChangePassword: !!user.mustChangePassword
});
router.post("/register", async (req, res) => {
  try {
    const { name, password, confirmPassword, phone, address } = req.body || {};
    const email = cleanEmail(req.body?.email);
    if (typeof name !== "string" || name.trim().length < 2 || name.length > 120 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254 ||
        typeof phone !== "string" || !/^[+\d ()-]{7,20}$/.test(phone) ||
        typeof address !== "string" || !address.trim() || address.length > 500 ||
        typeof password !== "string" || password.length < 10 || password.length > 128 ||
        password !== confirmPassword) {
      return res.status(400).json({ message: "Enter valid name, email, phone, address and matching password (at least 10 characters)." });
    }
    if (await User.exists({ email })) return res.status(409).json({ message: "An account with this email already exists." });
    const user = await User.create({
      name: name.trim(), email, phone: phone.trim(), address: address.trim(),
      password: await bcrypt.hash(password, 12), role: "cashier",
      approvalStatus: "pending", isActive: false
    });
    res.status(201).json({ message: "Your registration is awaiting Admin approval.", user: publicUser(user) });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ message: "An account with this email already exists." });
    console.error("Registration error:", error);
    res.status(500).json({ message: "Registration failed." });
  }
});
router.post("/login", loginRateLimit, async (req, res) => {
  try {
    const email = cleanEmail(req.body?.email);
    const password = req.body?.password;
    if (!email || typeof password !== "string") return res.status(400).json({ message: "Email and password are required." });
    const user = await User.findOne({ email });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      recordFailedLogin(req);
      return res.status(401).json({ message: "Invalid email or password." });
    }
    clearLoginFailures(req);
    if (user.role !== "admin" && user.approvalStatus === "pending") return res.status(403).json({ message: "Your registration is awaiting Admin approval." });
    if (user.approvalStatus === "rejected") return res.status(403).json({ message: "Your registration was rejected." });
    if (!user.isActive) return res.status(403).json({ message: "Your account is inactive. Contact the Admin." });
    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "8h" });
    res.json({ message: "Login successful", token, user: publicUser(user) });
  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ message: "Login failed." });
  }
});
router.post("/change-password", protect, async (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (typeof newPassword !== "string" || newPassword.length < 10 || newPassword.length > 128)
    return res.status(400).json({ message: "New password must contain 10–128 characters." });
  const user = await User.findById(req.user.id);
  if (!user || typeof currentPassword !== "string" || !(await bcrypt.compare(currentPassword, user.password)))
    return res.status(401).json({ message: "Current password is incorrect." });
  if (currentPassword === newPassword) return res.status(400).json({ message: "Choose a different password." });
  user.password = await bcrypt.hash(newPassword, 12);
  user.mustChangePassword = false;
  await user.save();
  res.json({ message: "Password changed successfully. Log in again." });
});
router.get("/me", protect, async (req, res) => {
  const user = await User.findById(req.user.id);
  res.json({ user: publicUser(user) });
});
router.post("/logout", (_req, res) => res.json({ message: "Log out by discarding your session token." }));
module.exports = router;
