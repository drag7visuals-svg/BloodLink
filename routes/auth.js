
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const User = require("../models/User");
const { protect, authorize } = require("../middleware/auth");

const router = express.Router();

const COOKIE_NAME = "token";
const TOKEN_EXPIRY = "7d";
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60 * 1000;
const BCRYPT_MAX_BYTES = 72;

const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: COOKIE_MAX_AGE
};

const clearCookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/"
};

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const objectIdRegex = /^[a-fA-F0-9]{24}$/;

// ==============================
// VALIDATION HELPERS
// ==============================

function isValidEmail(email) {
    return (
        typeof email === "string" &&
        email.trim().length <= 254 &&
        emailRegex.test(email.trim())
    );
}

function isValidName(name) {
    return (
        typeof name === "string" &&
        name.trim().length >= 2 &&
        name.trim().length <= 100
    );
}

function isValidPassword(password, minimumLength) {
    return (
        typeof password === "string" &&
        password.length >= minimumLength &&
        Buffer.byteLength(password, "utf8") <= BCRYPT_MAX_BYTES
    );
}

function safeUser(user) {
    return {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        isActive: user.isActive
    };
}

// ==============================
// DONOR REGISTRATION
// ==============================

router.post("/register", async (req, res) => {
    try {
        const { name, email, password } = req.body || {};

        if (!isValidName(name) || !isValidEmail(email)) {
            return res.status(400).json({
                message: "Please provide a valid name and email address."
            });
        }

        if (!isValidPassword(password, 8)) {
            return res.status(400).json({
                message: "Password must contain at least 8 characters and must not exceed 72 UTF-8 bytes."
            });
        }

        const normalizedEmail = email.trim().toLowerCase();

        const hashedPassword = await bcrypt.hash(password, 12);

        const user = await User.create({
            name: name.trim(),
            email: normalizedEmail,
            password: hashedPassword,
            role: "donor"
        });

        return res.status(201).json({
            message: "Donor account created successfully.",
            user: safeUser(user)
        });

    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({
                message: "An account with this email already exists."
            });
        }

        if (error.name === "ValidationError") {
            return res.status(400).json({
                message: "Invalid registration information."
            });
        }

        console.error("Donor registration error:", error);

        return res.status(500).json({
            message: "Registration failed."
        });
    }
});

// ==============================
// ADMIN CREATES STAFF ACCOUNTS
// ==============================

router.post(
    "/users",
    protect,
    authorize("admin"),
    async (req, res) => {
        try {
            const { name, email, password, role } = req.body || {};

            if (!isValidName(name) || !isValidEmail(email)) {
                return res.status(400).json({
                    message: "Please provide a valid name and email address."
                });
            }

            if (!["bloodbank", "hospital"].includes(role)) {
                return res.status(400).json({
                    message: "Only Blood Bank and Hospital accounts can be created here."
                });
            }

            if (!isValidPassword(password, 12)) {
                return res.status(400).json({
                    message: "Password must contain at least 12 characters and must not exceed 72 UTF-8 bytes."
                });
            }

            const normalizedEmail = email.trim().toLowerCase();

            const hashedPassword = await bcrypt.hash(password, 12);

            const user = await User.create({
                name: name.trim(),
                email: normalizedEmail,
                password: hashedPassword,
                role
            });

            return res.status(201).json({
                message: "Staff account created successfully.",
                user: safeUser(user)
            });

        } catch (error) {
            if (error.code === 11000) {
                return res.status(409).json({
                    message: "An account with this email already exists."
                });
            }

            if (error.name === "ValidationError") {
                return res.status(400).json({
                    message: "Invalid account information."
                });
            }

            console.error("Create staff account error:", error);

            return res.status(500).json({
                message: "Failed to create staff account."
            });
        }
    }
);

// ==============================
// ADMIN VIEW ALL USERS
// ==============================

router.get(
    "/users",
    protect,
    authorize("admin"),
    async (req, res) => {
        try {
            const users = await User.find()
                .select("name email role isActive createdAt updatedAt")
                .sort({ createdAt: -1 })
                .lean();

            return res.json({
                count: users.length,
                users
            });

        } catch (error) {
            console.error("Get users error:", error);

            return res.status(500).json({
                message: "Failed to retrieve users."
            });
        }
    }
);

// ==============================
// ADMIN ACTIVATE / DEACTIVATE USERS
// ==============================

router.patch(
    "/users/:id/status",
    protect,
    authorize("admin"),
    async (req, res) => {
        try {
            const { isActive } = req.body || {};

            if (typeof isActive !== "boolean") {
                return res.status(400).json({
                    message: "isActive must be true or false."
                });
            }

            if (!objectIdRegex.test(req.params.id)) {
                return res.status(400).json({
                    message: "Invalid user ID."
                });
            }

            const user = await User.findById(req.params.id);

            if (!user) {
                return res.status(404).json({
                    message: "User not found."
                });
            }

            if (
                user._id.toString() === req.user.userId &&
                !isActive
            ) {
                return res.status(400).json({
                    message: "You cannot deactivate your own account."
                });
            }

            if (user.role === "admin" && user.isActive && !isActive) {
                const activeAdmins = await User.countDocuments({
                    role: "admin",
                    isActive: true
                });

                if (activeAdmins <= 1) {
                    return res.status(400).json({
                        message: "The last active Admin cannot be deactivated."
                    });
                }
            }

            user.isActive = isActive;
            await user.save();

            return res.json({
                message: `User ${isActive ? "activated" : "deactivated"} successfully.`,
                user: safeUser(user)
            });

        } catch (error) {
            console.error("Update user status error:", error);

            return res.status(500).json({
                message: "Failed to update user status."
            });
        }
    }
);

// ==============================
// GET ACTIVE BLOOD BANKS
// HOSPITAL ONLY
// ==============================

router.get(
    "/bloodbanks",
    protect,
    authorize("hospital"),
    async (req, res) => {
        try {
            const bloodBanks = await User.find({
                role: "bloodbank",
                isActive: true
            })
                .select("name email")
                .sort({ name: 1 })
                .lean();

            return res.json({
                count: bloodBanks.length,
                bloodBanks
            });

        } catch (error) {
            console.error("Get Blood Banks error:", error);

            return res.status(500).json({
                message: "Unable to retrieve Blood Banks."
            });
        }
    }
);

// ==============================
// USER LOGIN
// ==============================

router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body || {};

        if (
            !isValidEmail(email) ||
            typeof password !== "string" ||
            password.length === 0 ||
            Buffer.byteLength(password, "utf8") > BCRYPT_MAX_BYTES
        ) {
            return res.status(400).json({
                message: "Please provide a valid email and password."
            });
        }

        const secret = process.env.JWT_SECRET;

        if (!secret) {
            console.error("JWT_SECRET is missing.");

            return res.status(500).json({
                message: "Authentication service is not configured."
            });
        }

        const user = await User.findOne({
            email: email.trim().toLowerCase()
        }).select("+password");

        if (!user || !user.isActive) {
            return res.status(401).json({
                message: "Invalid email or password."
            });
        }

        const passwordMatches = await bcrypt.compare(
            password,
            user.password
        );

        if (!passwordMatches) {
            return res.status(401).json({
                message: "Invalid email or password."
            });
        }

        const token = jwt.sign(
            {
                userId: user._id.toString(),
                role: user.role
            },
            secret,
            {
                expiresIn: TOKEN_EXPIRY,
                algorithm: "HS256"
            }
        );

        res.cookie(COOKIE_NAME, token, cookieOptions);

        return res.json({
            message: "Login successful.",
            user: safeUser(user)
        });

    } catch (error) {
        console.error("Login error:", error);

        return res.status(500).json({
            message: "Login failed."
        });
    }
});

// ==============================
// CHECK CURRENT SESSION
// ==============================

router.get("/me", protect, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId)
            .select("name email role isActive");

        if (!user || !user.isActive) {
            res.clearCookie(COOKIE_NAME, clearCookieOptions);

            return res.status(401).json({
                message: "Account unavailable. Please log in again."
            });
        }

        return res.json({
            loggedIn: true,
            user: safeUser(user)
        });

    } catch (error) {
        console.error("Session verification error:", error);

        return res.status(500).json({
            message: "Unable to verify your session."
        });
    }
});

// ==============================
// USER LOGOUT
// ==============================

router.post("/logout", (req, res) => {
    res.clearCookie(COOKIE_NAME, clearCookieOptions);

    return res.json({
        message: "Logged out successfully."
    });
});

module.exports = router;
