"use strict";
const mongoose = require("mongoose");

const purchaseSchema = new mongoose.Schema({
  purchaseNumber: { type: String, required: true, unique: true },
  supplier: { type: mongoose.Schema.Types.ObjectId, ref: "Supplier", required: true },
  medicine: { type: mongoose.Schema.Types.ObjectId, ref: "Medicine", required: true },
  medicineName: { type: String, required: true },
  batchNumber: { type: String, required: true },
  expiryDate: { type: Date, required: true },
  quantity: { type: Number, required: true, min: 1 },
  unitCost: { type: Number, required: true, min: 0 },
  totalCost: { type: Number, required: true, min: 0 },
  purchasedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  restockRequest: { type: mongoose.Schema.Types.ObjectId, ref: "RestockRequest", index: true },
  status: { type: String, enum: ["received"], default: "received" }
}, { timestamps: true });

module.exports = mongoose.model("Purchase", purchaseSchema);
