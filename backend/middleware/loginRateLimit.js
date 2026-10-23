"use strict";
// In-memory protection for a single Node.js instance. Use a shared store for multi-instance deployment.
const attempts = new Map();
const WINDOW = 15 * 60 * 1000;
const MAX = 8;
function key(req) {
  return String(req.ip || req.socket.remoteAddress || "unknown") + ":" +
    String(req.body?.email || "").trim().toLowerCase().slice(0, 254);
}
function loginRateLimit(req, res, next) {
  const now = Date.now();
  const k = key(req);
  const item = attempts.get(k);
  if (item && item.expires > now && item.count >= MAX) {
    res.set("Retry-After", String(Math.ceil((item.expires - now) / 1000)));
    return res.status(429).json({ message: "Too many login attempts. Please try again in 15 minutes." });
  }
  if (item && item.expires <= now) attempts.delete(k);
  req.loginAttemptKey = k;
  next();
}
function recordFailedLogin(req) {
  const now = Date.now();
  const k = req.loginAttemptKey || key(req);
  const item = attempts.get(k);
  if (!item || item.expires <= now) attempts.set(k, { count: 1, expires: now + WINDOW });
  else item.count++;
  if (attempts.size > 10000) {
    for (const [entry, value] of attempts) if (value.expires <= now) attempts.delete(entry);
  }
}
function clearLoginFailures(req) { attempts.delete(req.loginAttemptKey || key(req)); }
module.exports = { loginRateLimit, recordFailedLogin, clearLoginFailures };
