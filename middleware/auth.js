
const jwt = require("jsonwebtoken");
const User = require("../models/User");

const COOKIE_NAME = "token";

const clearCookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/"
};

// ==============================
// VERIFY LOGIN AND ACCOUNT STATUS
// ==============================

const protect = async (req, res, next) => {
    const token = req.cookies?.[COOKIE_NAME];

    if (!token) {
        return res.status(401).json({
            message: "Authentication required. Please log in."
        });
    }

    const secret = process.env.JWT_SECRET;

    if (!secret) {
        console.error("JWT_SECRET is missing from environment configuration.");

        return res.status(500).json({
            message: "Authentication service is not configured."
        });
    }

    let decoded;

    try {
        decoded = jwt.verify(token, secret, {
            algorithms: ["HS256"]
        });

    } catch (error) {
        res.clearCookie(COOKIE_NAME, clearCookieOptions);

        return res.status(401).json({
            message: "Invalid or expired session. Please log in again."
        });
    }

    // Validate the user ID before querying MongoDB.
    if (
        !decoded ||
        typeof decoded.userId !== "string" ||
        !/^[a-fA-F0-9]{24}$/.test(decoded.userId)
    ) {
        res.clearCookie(COOKIE_NAME, clearCookieOptions);

        return res.status(401).json({
            message: "Invalid session. Please log in again."
        });
    }

    try {
        // Get the current account details from the database.
        const user = await User.findById(decoded.userId)
            .select("_id role isActive");

        if (!user || !user.isActive) {
            res.clearCookie(COOKIE_NAME, clearCookieOptions);

            return res.status(401).json({
                message: "Your account is inactive or no longer exists. Please log in again."
            });
        }

        // Never trust the role stored inside the JWT.
        // Use the current role from MongoDB instead.
        req.user = {
            userId: user._id.toString(),
            role: user.role
        };

        return next();

    } catch (error) {
        console.error("Authentication database error:", error.message);

        return res.status(500).json({
            message: "Unable to verify your account. Please try again."
        });
    }
};

// ==============================
// CHECK USER ROLE PERMISSIONS
// ==============================

const authorize = (...allowedRoles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                message: "Authentication required."
            });
        }

        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                message: "You do not have permission to perform this action."
            });
        }

        return next();
    };
};

module.exports = {
    protect,
    authorize
};
