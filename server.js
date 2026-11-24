
const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
require("dotenv").config();

const cookieParser = require("cookie-parser");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const jwt = require("jsonwebtoken");

const BloodUnit = require("./models/BloodUnit");
const User = require("./models/User");

const authRoutes = require("./routes/auth");
const requestRoutes = require("./routes/requests");
const expiryRoutes = require("./routes/expiry");
const trackingRoutes = require("./routes/tracking");

const { protect, authorize } = require("./middleware/auth");

const app = express();

// ==============================
// CONSTANTS
// ==============================

const PORT = process.env.PORT || 5000;

const publicDirectory = path.join(__dirname, "public");

const BLOOD_GROUPS = [
    "A+",
    "A-",
    "B+",
    "B-",
    "AB+",
    "AB-",
    "O+",
    "O-"
];

const COMPONENTS = [
    "Whole Blood",
    "Red Cells",
    "Plasma",
    "Platelets"
];

// ==============================
// SECURITY AND MIDDLEWARE
// ==============================

app.use(helmet({
    contentSecurityPolicy: false
}));

app.use(express.json({
    limit: "20kb"
}));

app.use(cookieParser());

// Frontend and backend use the same origin.
// CORS is therefore unnecessary.

// ==============================
// STATIC FILES
// ==============================

const protectedPages = [
    "/index.html",
    "/bloodbank.html",
    "/hospital.html",
    "/donor.html"
];

const staticFiles = express.static(publicDirectory, {
    index: false
});

app.use((req, res, next) => {
    if (protectedPages.includes(req.path)) {
        return next();
    }

    return staticFiles(req, res, next);
});

// ==============================
// AUTHENTICATION RATE LIMITER
// ==============================

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        message: "Too many attempts. Please try again later."
    }
});

// Limit login and registration attempts.
// Do not unnecessarily limit /me and /logout.

app.use("/api/auth/login", authLimiter);
app.use("/api/auth/register", authLimiter);

// ==============================
// API ROUTES
// ==============================

app.use("/api/auth", authRoutes);

app.use("/api/requests", requestRoutes);

app.use("/api/expiry-alerts", expiryRoutes);

app.use("/api/tracking", trackingRoutes);

// ==============================
// HELPER FUNCTIONS
// ==============================

function isValidDate(value) {
    if (typeof value !== "string") {
        return false;
    }

    // Accept the YYYY-MM-DD format used by HTML date inputs.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return false;
    }

    const date = new Date(`${value}T00:00:00.000Z`);

    return (
        !Number.isNaN(date.getTime()) &&
        date.toISOString().slice(0, 10) === value
    );
}

function getOwnershipFilter(req) {
    if (req.user.role === "bloodbank") {
        return {
            registeredBy: req.user.userId
        };
    }

    // Admin and Hospital can access shared inventory.
    return {};
}

function clearAuthenticationCookie(res) {
    res.clearCookie("token", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/"
    });
}

function isValidObjectId(value) {
    return (
        typeof value === "string" &&
        /^[a-fA-F0-9]{24}$/.test(value)
    );
}

// ==============================
// DASHBOARD ACCESS CONTROL
// ==============================

function requireDashboardRole(role, filename) {
    return async (req, res) => {
        const token = req.cookies?.token;
        const secret = process.env.JWT_SECRET;

        if (!token) {
            return res.redirect("/login.html");
        }

        if (!secret) {
            console.error("JWT_SECRET is missing.");

            return res.status(500).send(
                "Authentication service is not configured."
            );
        }

        try {
            const decoded = jwt.verify(token, secret, {
                algorithms: ["HS256"]
            });

            if (
                !decoded ||
                typeof decoded.userId !== "string" ||
                !isValidObjectId(decoded.userId)
            ) {
                clearAuthenticationCookie(res);

                return res.redirect("/login.html");
            }

            const user = await User.findById(decoded.userId)
                .select("_id role isActive")
                .lean();

            if (!user || !user.isActive) {
                clearAuthenticationCookie(res);

                return res.redirect("/login.html");
            }

            if (user.role !== role) {
                return res.status(403).send(
                    "Access denied. You do not have permission to access this dashboard."
                );
            }

            return res.sendFile(
                path.join(publicDirectory, filename)
            );

        } catch (error) {
            if (
                error.name === "JsonWebTokenError" ||
                error.name === "TokenExpiredError" ||
                error.name === "NotBeforeError"
            ) {
                clearAuthenticationCookie(res);

                return res.redirect("/login.html");
            }

            console.error(
                "Dashboard authentication error:",
                error.message
            );

            return res.status(500).send(
                "Unable to verify dashboard access."
            );
        }
    };
}

// ==============================
// PAGE ROUTES
// ==============================

app.get("/login", (req, res) => {
    return res.redirect("/login.html");
});

app.get("/index.html", (req, res) => {
    return res.redirect("/");
});

app.get(
    "/",
    requireDashboardRole("admin", "index.html")
);

app.get(
    "/bloodbank.html",
    requireDashboardRole("bloodbank", "bloodbank.html")
);

app.get(
    "/hospital.html",
    requireDashboardRole("hospital", "hospital.html")
);

app.get(
    "/donor.html",
    requireDashboardRole("donor", "donor.html")
);

app.get("/privacy", (req, res) => {
    return res.sendFile(
        path.join(publicDirectory, "privacy.html")
    );
});

// ==============================
// GET REGISTERED DONORS
// Admin and Blood Bank only
// ==============================

app.get(
    "/api/donors",
    protect,
    authorize("admin", "bloodbank"),
    async (req, res) => {
        try {
            const donors = await User.find({
                role: "donor",
                isActive: true
            })
                .select("_id name email")
                .lean();

            return res.json(donors);

        } catch (error) {
            console.error("Load donors error:", error.message);

            return res.status(500).json({
                message: "Unable to load donors."
            });
        }
    }
);

// ==============================
// REGISTER A BLOOD UNIT
// Admin and Blood Bank only
// ==============================

app.post(
    "/api/blood-units",
    protect,
    authorize("admin", "bloodbank"),
    async (req, res) => {
        try {
            const {
                unitId,
                bloodGroup,
                component,
                collectionDate,
                expiryDate,
                donorId
            } = req.body || {};

            if (
                typeof unitId !== "string" ||
                !unitId.trim() ||
                !bloodGroup ||
                !component ||
                !collectionDate ||
                !expiryDate
            ) {
                return res.status(400).json({
                    message: "Please fill in all required fields."
                });
            }

            const cleanUnitId = unitId.trim();

            if (cleanUnitId.length > 100) {
                return res.status(400).json({
                    message: "Blood unit ID is too long."
                });
            }

            if (!BLOOD_GROUPS.includes(bloodGroup)) {
                return res.status(400).json({
                    message: "Invalid blood group."
                });
            }

            if (!COMPONENTS.includes(component)) {
                return res.status(400).json({
                    message: "Invalid blood component."
                });
            }

            if (
                !isValidDate(collectionDate) ||
                !isValidDate(expiryDate) ||
                new Date(`${expiryDate}T00:00:00.000Z`) <=
                new Date(`${collectionDate}T00:00:00.000Z`)
            ) {
                return res.status(400).json({
                    message: "Please enter valid dates. Expiry date must be after collection date."
                });
            }

            // Validate selected donor.
            let donor = null;

            if (donorId) {
                if (!isValidObjectId(donorId)) {
                    return res.status(400).json({
                        message: "Invalid donor ID."
                    });
                }

                donor = await User.findOne({
                    _id: donorId,
                    role: "donor",
                    isActive: true
                }).select("_id");

                if (!donor) {
                    return res.status(400).json({
                        message: "Invalid or inactive donor selected."
                    });
                }
            }

            const bloodUnit = new BloodUnit({
                unitId: cleanUnitId,
                bloodGroup,
                component,
                collectionDate,
                expiryDate,
                status: "Collected",

                registeredBy:
                    req.user.role === "bloodbank"
                        ? req.user.userId
                        : null,

                donor: donor ? donor._id : null
            });

            await bloodUnit.save();

            return res.status(201).json({
                message: "Blood unit registered successfully.",
                data: bloodUnit
            });

        } catch (error) {
            if (error.code === 11000) {
                return res.status(409).json({
                    message: "This blood unit ID already exists."
                });
            }

            if (error.name === "ValidationError") {
                return res.status(400).json({
                    message: "Invalid blood unit details."
                });
            }

            console.error(
                "Register blood unit error:",
                error.message
            );

            return res.status(500).json({
                message: "Unable to register blood unit."
            });
        }
    }
);

// ==============================
// DONOR'S DONATION HISTORY
// Donor only
// ==============================

app.get(
    "/api/donor/donations",
    protect,
    authorize("donor"),
    async (req, res) => {
        try {
            const donations = await BloodUnit.find({
                donor: req.user.userId
            })
                .select(
                    "unitId bloodGroup component collectionDate expiryDate status createdAt"
                )
                .sort({ collectionDate: -1 })
                .lean();

            return res.json(donations);

        } catch (error) {
            console.error(
                "Donation history error:",
                error.message
            );

            return res.status(500).json({
                message: "Unable to load donation history."
            });
        }
    }
);

// ==============================
// VIEW BLOOD INVENTORY
// Admin, Blood Bank and Hospital
// ==============================

app.get(
    "/api/blood-units",
    protect,
    authorize("admin", "bloodbank", "hospital"),
    async (req, res) => {
        try {
            const ownershipFilter = getOwnershipFilter(req);

            const bloodUnits = await BloodUnit.find(
                ownershipFilter
            )
                .sort({ createdAt: -1 })
                .lean();

            // This endpoint only reads inventory.
            // Expiry processing is handled separately.

            return res.json(bloodUnits);

        } catch (error) {
            console.error(
                "Load inventory error:",
                error.message
            );

            return res.status(500).json({
                message: "Unable to load blood inventory."
            });
        }
    }
);

// ==============================
// SEARCH FOR A BLOOD UNIT
// Admin, Blood Bank and Hospital
// ==============================

app.get(
    "/api/blood-units/:unitId",
    protect,
    authorize("admin", "bloodbank", "hospital"),
    async (req, res) => {
        try {
            const unitId = req.params.unitId.trim();

            if (!unitId || unitId.length > 100) {
                return res.status(400).json({
                    message: "Invalid blood unit ID."
                });
            }

            const bloodUnit = await BloodUnit.findOne({
                unitId,
                ...getOwnershipFilter(req)
            }).lean();

            if (!bloodUnit) {
                return res.status(404).json({
                    message: "Blood unit not found."
                });
            }

            return res.json(bloodUnit);

        } catch (error) {
            console.error(
                "Find blood unit error:",
                error.message
            );

            return res.status(500).json({
                message: "Unable to retrieve blood unit."
            });
        }
    }
);

// ==============================
// MANUAL STATUS TRANSITIONS
// Admin and Blood Bank only
// ==============================

// Reserved, Dispatched and Received are
// managed by the request workflow.

const allowedTransitions = {
    "Collected": [
        "Testing Pending",
        "Rejected"
    ],

    "Testing Pending": [
        "Available",
        "Rejected"
    ],

    "Available": [
        "Recalled"
    ],

    "Reserved": [],
    "Dispatched": [],
    "Received": [],
    "Rejected": [],
    "Expired": [],
    "Recalled": []
};

// ==============================
// UPDATE BLOOD UNIT STATUS
// Admin and Blood Bank only
// ==============================

app.patch(
    "/api/blood-units/:unitId/status",
    protect,
    authorize("admin", "bloodbank"),
    async (req, res) => {
        try {
            const { status } = req.body || {};

            const bloodUnit = await BloodUnit.findOne({
                unitId: req.params.unitId,
                ...getOwnershipFilter(req)
            });

            if (!bloodUnit) {
                return res.status(404).json({
                    message: "Blood unit not found."
                });
            }

            if (
                typeof status !== "string" ||
                !allowedTransitions[bloodUnit.status] ||
                !allowedTransitions[bloodUnit.status].includes(status)
            ) {
                return res.status(400).json({
                    message: "This status change is not allowed through manual inventory management."
                });
            }

            if (
                status === "Available" &&
                new Date(bloodUnit.expiryDate) <= new Date()
            ) {
                return res.status(400).json({
                    message: "Expired blood cannot be made available."
                });
            }

            const updatedUnit = await BloodUnit.findOneAndUpdate(
                {
                    _id: bloodUnit._id,
                    status: bloodUnit.status
                },
                {
                    $set: {
                        status
                    }
                },
                {
                    new: true,
                    runValidators: true
                }
            );

            if (!updatedUnit) {
                return res.status(409).json({
                    message: "Blood unit status changed. Refresh and try again."
                });
            }

            return res.json({
                message: "Status updated successfully.",
                data: updatedUnit
            });

        } catch (error) {
            console.error(
                "Update blood status error:",
                error.message
            );

            return res.status(500).json({
                message: "Unable to update blood unit status."
            });
        }
    }
);

// ==============================
// UPDATE BLOOD UNIT DETAILS
// Admin and Blood Bank only
// ==============================

app.put(
    "/api/blood-units/:unitId",
    protect,
    authorize("admin", "bloodbank"),
    async (req, res) => {
        try {
            const {
                bloodGroup,
                component,
                collectionDate,
                expiryDate
            } = req.body || {};

            if (
                !BLOOD_GROUPS.includes(bloodGroup) ||
                !COMPONENTS.includes(component) ||
                !isValidDate(collectionDate) ||
                !isValidDate(expiryDate) ||
                new Date(`${expiryDate}T00:00:00.000Z`) <=
                new Date(`${collectionDate}T00:00:00.000Z`)
            ) {
                return res.status(400).json({
                    message: "Please provide valid blood unit details and dates."
                });
            }

            // Only unallocated units can be edited.
            const updatedUnit = await BloodUnit.findOneAndUpdate(
                {
                    unitId: req.params.unitId,
                    ...getOwnershipFilter(req),
                    status: {
                        $in: [
                            "Collected",
                            "Testing Pending"
                        ]
                    }
                },
                {
                    $set: {
                        bloodGroup,
                        component,
                        collectionDate,
                        expiryDate
                    }
                },
                {
                    new: true,
                    runValidators: true
                }
            );

            if (!updatedUnit) {
                return res.status(409).json({
                    message: "Blood unit not found or cannot be edited in its current status."
                });
            }

            return res.json({
                message: "Blood unit updated successfully.",
                data: updatedUnit
            });

        } catch (error) {
            if (error.name === "ValidationError") {
                return res.status(400).json({
                    message: "Invalid blood unit details."
                });
            }

            console.error(
                "Edit blood unit error:",
                error.message
            );

            return res.status(500).json({
                message: "Unable to update blood unit."
            });
        }
    }
);

// ==============================
// HANDLE UNKNOWN API ROUTES
// ==============================

app.use("/api", (req, res) => {
    return res.status(404).json({
        message: "API route not found."
    });
});

// ==============================
// HANDLE UNKNOWN PAGES
// ==============================

app.use((req, res) => {
    return res.status(404).send("Page not found.");
});

// ==============================
// HANDLE EXPRESS ERRORS
// ==============================

app.use((error, req, res, next) => {
    if (res.headersSent) {
        return next(error);
    }

    if (error.type === "entity.too.large") {
        return res.status(413).json({
            message: "Request body is too large."
        });
    }

    if (error instanceof SyntaxError && error.status === 400) {
        return res.status(400).json({
            message: "Invalid JSON request body."
        });
    }

    console.error("Server error:", error.message);

    return res.status(500).json({
        message: "An unexpected server error occurred."
    });
});

// ==============================
// START SERVER AFTER DB CONNECTION
// ==============================

async function startServer() {
    try {
        await mongoose.connect(
            process.env.MONGO_URI ||
            "mongodb://127.0.0.1:27017/BloodBankDB"
        );

        console.log("MongoDB Connected Successfully");

        app.listen(PORT, () => {
            console.log(
                `Server running at http://localhost:${PORT}`
            );
        });

    } catch (error) {
        console.error(
            "MongoDB Connection Failed:",
            error.message
        );

        process.exit(1);
    }
}

startServer();
