"use strict";
const express = require("express");
const Sale = require("../models/Sale");
const Purchase = require("../models/Purchase");
const Medicine = require("../models/Medicine");
const { protect, authorize } = require("../middleware/authMiddleware");
const router = express.Router();
router.use(protect, authorize("admin"));

router.get("/", async (req, res) => {
  try {
    const { from, to } = req.query;
    const valid = value => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
    if ((from && !valid(from)) || (to && !valid(to)) || (from && to && from > to))
      return res.status(400).json({ message: "Enter a valid date range (YYYY-MM-DD)." });
    const dateFilter = {};
    if (from || to) {
      dateFilter.createdAt = {};
      if (from) dateFilter.createdAt.$gte = new Date(from + "T00:00:00.000Z");
      if (to) dateFilter.createdAt.$lt = new Date(new Date(to + "T00:00:00.000Z").getTime() + 86400000);
    }
    const [sales, purchases] = await Promise.all([
      Sale.find({ ...dateFilter, status: "completed" }).sort({ createdAt: -1 }).lean(),
      Purchase.find({ ...dateFilter, status: "received" }).sort({ createdAt: -1 })
        .populate("supplier", "supplierName").lean()
    ]);
    const money = n => Math.round(n * 100) / 100;
    const revenue = money(sales.reduce((sum, sale) => sum + Number(sale.grandTotal || 0), 0));
    const salesSubtotal = money(sales.reduce((sum, sale) => sum + Number(sale.subtotal || 0), 0));
    const salesGST = money(sales.reduce((sum, sale) => sum + Number(sale.totalGST || 0), 0));
    const purchaseExpenses = money(purchases.reduce((sum, p) => sum + Number(p.totalCost || 0), 0));
    let estimatedCOGS = 0;
    let missingCostItems = 0;
    const top = new Map();
    for (const sale of sales) for (const item of sale.items || []) {
      if (Number.isFinite(item.unitCost)) estimatedCOGS += item.unitCost * item.quantity;
      else missingCostItems++;
      const name = item.medicineName || "Unknown medicine";
      const prev = top.get(name) || { medicineName: name, quantity: 0, revenue: 0 };
      prev.quantity += Number(item.quantity || 0);
      prev.revenue += Number(item.total || 0);
      top.set(name, prev);
    }
    const daily = new Map();
    for (const sale of sales) {
      const day = new Date(sale.createdAt).toISOString().slice(0, 10);
      const row = daily.get(day) || { date: day, sales: 0, purchases: 0 };
      row.sales += Number(sale.grandTotal || 0);
      daily.set(day, row);
    }
    for (const purchase of purchases) {
      const day = new Date(purchase.createdAt).toISOString().slice(0, 10);
      const row = daily.get(day) || { date: day, sales: 0, purchases: 0 };
      row.purchases += Number(purchase.totalCost || 0);
      daily.set(day, row);
    }
    res.json({
      summary: {
        revenue, salesSubtotal, salesGST, purchaseExpenses,
        estimatedCOGS: money(estimatedCOGS),
        estimatedGrossProfit: missingCostItems ? null : money(salesSubtotal - estimatedCOGS),
        missingCostItems, salesCount: sales.length, purchasesCount: purchases.length
      },
      daily: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)).map(row => ({
        date: row.date, sales: money(row.sales), purchases: money(row.purchases)
      })),
      topMedicines: [...top.values()].sort((a, b) => b.quantity - a.quantity).slice(0, 10)
        .map(m => ({ ...m, revenue: money(m.revenue) })),
      sales: sales.slice(0, 100).map(s => ({
        invoiceNumber: s.invoiceNumber, date: s.createdAt, paymentMethod: s.paymentMethod,
        itemCount: (s.items || []).reduce((sum, i) => sum + i.quantity, 0), total: s.grandTotal
      })),
      purchases: purchases.slice(0, 100).map(p => ({
        purchaseNumber: p.purchaseNumber, date: p.createdAt,
        supplier: p.supplier?.supplierName || "Unknown", medicineName: p.medicineName,
        batchNumber: p.batchNumber, quantity: p.quantity, total: p.totalCost
      }))
    });
  } catch (error) {
    console.error("Reports error:", error);
    res.status(500).json({ message: "Unable to generate reports." });
  }
});
module.exports = router;
