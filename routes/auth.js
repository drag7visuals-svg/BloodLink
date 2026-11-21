
const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const User = require("../models/User");
const { protect, authorize } = require("../middleware/auth");

const router = express.Router();

const cookieOptions = {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 7 * 24 * 60 * 60 * 1000
};

// ==============================
// DONOR REGISTRATION
// ==============================

router.post("/register", async (req, res) => {
    try {
        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({
                message: "Please fill in all required fields."
            });
        }

        if (password.length < 8) {
            return res.status(400).json({
                message: "Password must contain at least 8 characters."
            });
        }

        const normalizedEmail = email.trim().toLowerCase();

        const existingUser = await User.findOne({
            email: normalizedEmail
        });

        if (existingUser) {
            return res.status(409).json({
                message: "An account with this email already exists."
            });
        }

        const hashedPassword = await bcrypt.hash(password, 12);

        const user = await User.create({
            name: name.trim(),
            email: normalizedEmail,
            password: hashedPassword,
            role: "donor"
        });

        res.status(201).json({
            message: "Donor account created successfully.",
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });

    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({
                message: "An account with this email already exists."
            });
        }

        console.error("Donor registration error:", error);

        res.status(500).json({
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
            const { name, email, password, role } = req.body;

            if (!name || !email || !password || !role) {
                return res.status(400).json({
                    message: "Please fill in all required fields."
                });
            }

            if (!["bloodbank", "hospital"].includes(role)) {
                return res.status(400).json({
                    message: "Only Blood Bank and Hospital accounts can be created here."
                });
            }

            if (password.length < 12) {
                return res.status(400).json({
                    message: "Password must contain at least 12 characters."
                });
            }

            const normalizedEmail = email.trim().toLowerCase();

            const existingUser = await User.findOne({
                email: normalizedEmail
            });

            if (existingUser) {
                return res.status(409).json({
                    message: "An account with this email already exists."
                });
            }

            const hashedPassword = await bcrypt.hash(password, 12);

            const user = await User.create({
                name: name.trim(),
                email: normalizedEmail,
                password: hashedPassword,
                role
            });

            res.status(201).json({
                message: "Staff account created successfully.",
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role
                }
            });

        } catch (error) {
            if (error.code === 11000) {
                return res.status(409).json({
                    message: "An account with this email already exists."
                });
            }

            console.error("Create staff account error:", error);

            res.status(500).json({
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
                .select("-password")
                .sort({ createdAt: -1 });

            res.json({
                count: users.length,
                users
            });

        } catch (error) {
            console.error("Get users error:", error);

            res.status(500).json({
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
            const { isActive } = req.body;

            if (typeof isActive !== "boolean") {
                return res.status(400).json({
                    message: "isActive must be true or false."
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

            res.json({
                message: `User ${isActive ? "activated" : "deactivated"} successfully.`,
                user: {
                    id: user._id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    isActive: user.isActive
                }
            });

        } catch (error) {
            console.error("Update user status error:", error);

            res.status(500).json({
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
                .sort({ name: 1 });

            res.json({
                count: bloodBanks.length,
                bloodBanks
            });

        } catch (error) {
            console.error("Get Blood Banks error:", error);

            res.status(500).json({
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
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                message: "Email and password are required."
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
            process.env.JWT_SECRET,
            { expiresIn: "7d" }
        );

        res.cookie("token", token, cookieOptions);

        res.json({
            message: "Login successful.",
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });

    } catch (error) {
        console.error("Login error:", error);

        res.status(500).json({
            message: "Login failed."
        });
    }
});

// ==============================
// CHECK CURRENT SESSION
// ==============================

router.get("/me", async (req, res) => {
    try {
        const token = req.cookies?.token;

        if (!token) {
            return res.status(401).json({
                message: "Not logged in."
            });
        }

        const decoded = jwt.verify(
            token,
            process.env.JWT_SECRET
        );

        const user = await User.findById(decoded.userId);

        if (!user || !user.isActive) {
            res.clearCookie("token", cookieOptions);

            return res.status(401).json({
                message: "Account unavailable. Please log in again."
            });
        }

        res.json({
            loggedIn: true,
            user: {
                id: user._id,
                name: user.name,
                email: user.email,
                role: user.role
            }
        });

    } catch (error) {
        res.clearCookie("token", cookieOptions);

        res.status(401).json({
            message: "Session expired. Please log in again."
        });
    }
});

// ==============================
// USER LOGOUT
// ==============================

router.post("/logout", (req, res) => {
    res.clearCookie("token", cookieOptions);

    res.json({
        message: "Logged out successfully."
    });
});

module.exports = router;
