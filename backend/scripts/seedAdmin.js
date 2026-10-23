"use strict";
// Run once: set INITIAL_ADMIN_PASSWORD securely in your local environment.
// Never commit the password or place it in frontend code.
require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
(async () => {
  const email = String(process.env.INITIAL_ADMIN_EMAIL || "").trim().toLowerCase();
  if (!process.env.MONGO_URI || !process.env.INITIAL_ADMIN_PASSWORD || !process.env.JWT_SECRET || !email)
    throw new Error("Set MONGO_URI, JWT_SECRET, INITIAL_ADMIN_EMAIL and INITIAL_ADMIN_PASSWORD in your local .env.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    throw new Error("INITIAL_ADMIN_EMAIL must be a valid email address.");
  if (process.env.INITIAL_ADMIN_PASSWORD.length < 10 || process.env.INITIAL_ADMIN_PASSWORD.length > 128)
    throw new Error("Initial password must be between 10 and 128 characters.");
  await mongoose.connect(process.env.MONGO_URI);
  const existing = await User.findOne({ email });
  if (existing) {
    console.log("Admin email already exists. No changes made; refusing to overwrite credentials.");
  } else {
    const admins = await User.countDocuments({ role: "admin" });
    if (admins) {
      console.log("An admin already exists. Refusing to create another bootstrap admin.");
    } else {
      await User.create({
        name: "MediVault Admin", email,
        password: await bcrypt.hash(process.env.INITIAL_ADMIN_PASSWORD, 12),
        role: "admin", approvalStatus: "approved", isActive: true,
        mustChangePassword: true
      });
      console.log("Initial admin created. Password change is required on first login.");
    }
  }
})().catch(err => { console.error(err.message); process.exitCode = 1; })
  .finally(() => mongoose.disconnect());
