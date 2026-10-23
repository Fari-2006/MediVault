"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const allocateFefo = require("./fefoAllocation");

const today = new Date("2026-01-15T12:00:00.000Z");
const batch = (id, expiryDate, quantity, status = "active") => ({
  _id: id,
  expiryDate: new Date(expiryDate),
  quantity,
  status
});

test("allocates the earliest valid batch first across batches", () => {
  const result = allocateFefo([
    batch("later", "2027-03-01", 20),
    batch("earlier", "2026-11-01", 3)
  ], 5, today);
  assert.deepEqual(result.allocations.map(item => [item.batch._id, item.quantity]), [["earlier", 3], ["later", 2]]);
});

test("allows a batch expiring today and excludes earlier or inactive batches", () => {
  const result = allocateFefo([
    batch("today", "2026-01-15T00:00:00.000Z", 2),
    batch("expired", "2026-01-14", 50),
    batch("inactive", "2026-01-15", 50, "inactive")
  ], 2, today);
  assert.deepEqual(result.allocations.map(item => item.batch._id), ["today"]);
});

test("reports insufficient eligible stock without allocating", () => {
  const result = allocateFefo([
    batch("expired", "2026-01-14", 10),
    batch("valid", "2026-02-01", 2)
  ], 3, today);
  assert.equal(result.available, 2);
  assert.equal(result.allocations, null);
});
