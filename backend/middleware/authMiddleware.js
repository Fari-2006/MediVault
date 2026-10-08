const jwt = require("jsonwebtoken");

// ==================================================
// AUTHENTICATION MIDDLEWARE
// ==================================================

const protect = (req, res, next) => {
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

        // Store user information in request
        req.user = decoded;

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