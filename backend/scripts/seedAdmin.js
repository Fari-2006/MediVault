"use strict";
// Run once: set INITIAL_ADMIN_PASSWORD securely in your local environment.
// Never commit the password or place it in frontend code.
require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
(async () => {
  if (!process.env.MONGO_URI || !process.env.INITIAL_ADMIN_PASSWORD || !process.env.JWT_SECRET)
    throw new Error("Set MONGO_URI, JWT_SECRET and INITIAL_ADMIN_PASSWORD in your local .env.");
  if (process.env.INITIAL_ADMIN_PASSWORD.length < 10)
    throw new Error("Initial password must be at least 10 characters.");
  await mongoose.connect(process.env.MONGO_URI);
  const email = "mediadmin@gmail.com";
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
