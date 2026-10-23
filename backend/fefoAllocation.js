"use strict";

function allocateFefo(batches, requestedQuantity, today = new Date()) {
  const dayStart = new Date(today);
  dayStart.setHours(0, 0, 0, 0);
  const candidates = batches
    .filter(batch => batch.status === "active" && batch.quantity > 0 && batch.expiryDate >= dayStart)
    .sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate) || String(a._id).localeCompare(String(b._id)));
  const available = candidates.reduce((total, batch) => total + batch.quantity, 0);
  if (available < requestedQuantity) return { available, allocations: null };

  let remaining = requestedQuantity;
  const allocations = [];
  for (const batch of candidates) {
    if (!remaining) break;
    const quantity = Math.min(remaining, batch.quantity);
    allocations.push({ batch, quantity });
    remaining -= quantity;
  }
  return { available, allocations };
}

module.exports = allocateFefo;
