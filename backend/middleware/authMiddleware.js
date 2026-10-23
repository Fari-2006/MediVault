const jwt = require("jsonwebtoken");
const User = require("../models/User");

// ==================================================
// AUTHENTICATION MIDDLEWARE
// ==================================================

const protect = async (req, res, next) => {
    try {
        // Get Authorization header
        const authHeader = req.headers.authorization;

        // Check if token exists
        if (!authHeader) {
            return res.status(401).json({
                message: "Access denied. No token provided."
            });
        }

        // Check Bearer format
        if (!authHeader.startsWith("Bearer ")) {
            return res.status(401).json({
                message: "Invalid authorization format."
            });
        }

        // Extract token
        const token = authHeader.split(" ")[1];

        // Verify token
        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET
        );

        // Never trust role/approval claims stored in an old JWT.
        const user = await User.findById(decoded.id).select("role approvalStatus isActive mustChangePassword tokenVersion");
        if (!user || decoded.tokenVersion !== (user.tokenVersion || 0)) {
            return res.status(401).json({ message: "Invalid or expired token." });
        }
        if (!user.isActive || user.approvalStatus === "rejected") {
            return res.status(403).json({ message: "This account is inactive or rejected." });
        }
        if (user.role !== "admin" && user.approvalStatus !== "approved") {
            return res.status(403).json({ message: "Your registration is awaiting Admin approval." });
        }
        if (user.mustChangePassword && req.originalUrl !== "/api/auth/change-password") {
            return res.status(403).json({ message: "Change your initial password before using the application.", code: "PASSWORD_CHANGE_REQUIRED" });
        }
        if (user.role === "supplier") {
            const Supplier = require("../models/Supplier");
            const supplier = await Supplier.findOne({ linkedUser: user._id }).select("status").lean();
            if (!supplier || supplier.status !== "active")
                return res.status(403).json({ message: "Your account is not active. Please contact the admin", code: "SUPPLIER_INACTIVE" });
        }
        req.user = { id: String(user._id), role: user.role };

        // Continue to next function
        next();

    } catch (error) {
        return res.status(401).json({
            message: "Invalid or expired token."
        });
    }
};


// ==================================================
// ROLE-BASED AUTHORIZATION
// ==================================================

const authorize = (...roles) => {
    return (req, res, next) => {

        // Check if user exists
        if (!req.user) {
            return res.status(401).json({
                message: "Authentication required."
            });
        }

        // Check user's role
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                message: "Access denied. You do not have permission."
            });
        }

        next();
    };
};


module.exports = {
    protect,
    authorize
};
