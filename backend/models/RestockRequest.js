"use strict";
const mongoose = require("mongoose");
const schema = new mongoose.Schema({
  medicine: { type: mongoose.Schema.Types.ObjectId, ref: "Medicine", required: true, index: true },
  medicineName: { type: String, required: true },
  batchNumber: { type: String, required: true },
  quantityRequested: { type: Number, required: true, min: 1 },
  note: { type: String, default: "", maxlength: 1000 },
  requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  requestedByName: { type: String, required: true },
  pharmacyName: { type: String, default: "MediVault Pharmacy" },
  supplier: { type: mongoose.Schema.Types.ObjectId, ref: "Supplier", default: null },
  status: { type: String, enum: ["Pending", "Accepted", "Dispatched", "Rejected", "Delivered", "Received", "Partially Received"], default: "Pending", index: true },
  active: { type: Boolean, default: true },
  purchaseOrderNumber: { type: String, unique: true, sparse: true },
  expectedDeliveryDate: Date,
  dispatchDate: Date,
  estimatedDeliveryDate: Date,
  trackingReference: { type: String, default: "" },
  receivedQuantity: { type: Number, default: 0 },
  receivedBatchNumber: String,
  receivedExpiryDate: Date,
  receivedAt: Date,
  history: [{ status: String, action: String, actor: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, at: { type: Date, default: Date.now } }],
  respondedAt: Date,
  deliveredAt: Date
}, { timestamps: true });
schema.index({ medicine: 1 }, { unique: true, partialFilterExpression: { active: true } });
module.exports = mongoose.model("RestockRequest", schema);
