"use strict";

/**
 * One-time, interactive existing-admin credential rotation.
 * Usage: cd backend && node scripts/updateExistingAdmin.js
 * Required .env: MONGO_URI, INITIAL_ADMIN_PASSWORD
 * This updates the SAME User document (_id unchanged), preserving references.
 */
require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const readline = require("node:readline");
const User = require("../models/User");

function ask(rl, prompt) {
  return new Promise(resolve => rl.question(prompt, resolve));
}

async function main() {
  const newEmail = "mediadmin@gmail.com";
  const initialPassword = process.env.INITIAL_ADMIN_PASSWORD;
  if (!process.env.MONGO_URI || !initialPassword) {
    throw new Error("MONGO_URI and INITIAL_ADMIN_PASSWORD must be set in backend/.env");
  }
  if (initialPassword.length < 10 || initialPassword.length > 128) {
    throw new Error("INITIAL_ADMIN_PASSWORD must be between 10 and 128 characters.");
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  let oldEmail, oldPassword, confirmation;
  try {
    oldEmail = (await ask(rl, "Existing Admin email: ")).trim().toLowerCase();
    oldPassword = await ask(rl, "Existing Admin password (input visible): ");
    confirmation = await ask(rl, "Type UPDATE to confirm changing this account: ");
  } finally {
    rl.close();
  }
  if (confirmation !== "UPDATE") throw new Error("Cancelled; no changes made.");
  await mongoose.connect(process.env.MONGO_URI);
  try {
    const admin = await User.findOne({ email: oldEmail, role: "admin" });
    if (!admin || !(await bcrypt.compare(oldPassword, admin.password))) {
      throw new Error("Existing Admin credentials are incorrect; no changes made.");
    }
    const otherAccount = await User.findOne({ email: newEmail, _id: { $ne: admin._id } });
    if (otherAccount) throw new Error("Target email already belongs to another account; no changes made.");
    if (oldPassword === initialPassword) throw new Error("Choose an initial password different from your current password.");
    const newHash = await bcrypt.hash(initialPassword, 12);
    // Conditional update avoids overwriting a password or email changed in the meantime.
    const updated = await User.findOneAndUpdate(
      { _id: admin._id, email: oldEmail, password: admin.password, role: "admin" },
      { $set: {
        email: newEmail, password: newHash, role: "admin",
        approvalStatus: "approved", isActive: true, mustChangePassword: true,
        tokenVersion: (admin.tokenVersion || 0) + 1
      }},
      { returnDocument: "after", runValidators: true }
    );
    if (!updated) throw new Error("Account changed during update; no changes made. Please retry.");
    console.log("Admin account updated successfully.");
    console.log("Admin ID unchanged:", String(updated._id));
    console.log("New email:", updated.email);
    console.log("First-login password change required: yes");
    console.log("Restart the backend and log in using the initial password from .env.");
  } finally {
    await mongoose.disconnect();
  }
}
main().catch(err => {
  console.error("Admin update stopped:", err.code === 11000 ? "Target email already exists." : err.message);
  process.exitCode = 1;
});
