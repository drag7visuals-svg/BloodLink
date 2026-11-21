
// ==============================
// IMPORTS
// ==============================

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
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

const { protect, authorize } = require("./middleware/auth");

const app = express();

// ==============================
// SECURITY AND MIDDLEWARE
// ==============================

app.use(helmet({
    contentSecurityPolicy: false
}));

app.use(cors());
app.use(express.json());
app.use(cookieParser());

// Prevent direct static access to protected dashboards
const protectedPages = [
    "/index.html",
    "/bloodbank.html",
    "/hospital.html",
    "/donor.html"
];

app.use((req, res, next) => {
    if (protectedPages.includes(req.path)) {
        return next();
    }

    express.static(path.join(__dirname, "public"), {
        index: false
    })(req, res, next);
});

// Authentication rate limiter
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        message: "Too many attempts. Please try again later."
    }
});

// ==============================
// API ROUTES
// ==============================

// Authentication routes
app.use("/api/auth", authLimiter, authRoutes);

// Blood request routes
app.use("/api/requests", requestRoutes);

// ==============================
// MONGODB CONNECTION
// ==============================

mongoose.connect(
    process.env.MONGO_URI || "mongodb://127.0.0.1:27017/BloodBankDB"
)
.then(() => {
    console.log("MongoDB Connected Successfully");
})
.catch((error) => {
    console.log("MongoDB Connection Failed:", error.message);
});

// ==============================
// DASHBOARD ACCESS CONTROL
// ==============================

function requireDashboardRole(role, filename) {
    return async (req, res) => {
        const token = req.cookies?.token;

        if (!token) {
            return res.redirect("/login.html");
        }

        try {
            const decoded = jwt.verify(
                token,
                process.env.JWT_SECRET
            );

            const user = await User.findById(decoded.userId);

            if (!user || !user.isActive) {
                res.clearCookie("token");
                return res.redirect("/login.html");
            }

            if (user.role !== role) {
                return res.status(403).send(
                    "Access denied. You do not have permission to access this dashboard."
                );
            }

            res.sendFile(
                path.join(__dirname, "public", filename)
            );

        } catch (error) {
            res.clearCookie("token");
            return res.redirect("/login.html");
        }
    };
}

// Login page
app.get("/login", (req, res) => {
    res.redirect("/login.html");
});

// Prevent direct access to admin HTML
app.get("/index.html", (req, res) => {
    res.redirect("/");
});

// Admin dashboard
app.get("/", requireDashboardRole("admin", "index.html"));

// Blood Bank dashboard
app.get(
    "/bloodbank.html",
    requireDashboardRole("bloodbank", "bloodbank.html")
);

// Hospital dashboard
app.get(
    "/hospital.html",
    requireDashboardRole("hospital", "hospital.html")
);

// Donor dashboard
app.get(
    "/donor.html",
    requireDashboardRole("donor", "donor.html")
);

// Privacy policy
app.get("/privacy", (req, res) => {
    res.sendFile(
        path.join(__dirname, "public", "privacy.html")
    );
});

// ==============================
// OWNERSHIP FILTER
// ==============================

function getOwnershipFilter(req) {
    if (req.user.role === "bloodbank") {
        return {
            registeredBy: req.user.userId
        };
    }

    // Admin and Hospital can access shared inventory
    return {};
}

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
                expiryDate
            } = req.body;

            if (
                !unitId ||
                !bloodGroup ||
                !component ||
                !collectionDate ||
                !expiryDate
            ) {
                return res.status(400).json({
                    message: "Please fill in all required fields."
                });
            }

            if (
                isNaN(Date.parse(collectionDate)) ||
                isNaN(Date.parse(expiryDate)) ||
                new Date(expiryDate) <= new Date(collectionDate)
            ) {
                return res.status(400).json({
                    message: "Please enter valid dates. Expiry date must be after collection date."
                });
            }

            const existingUnit = await BloodUnit.findOne({ unitId });

            if (existingUnit) {
                return res.status(409).json({
                    message: "This blood unit ID already exists."
                });
            }

            const bloodUnit = new BloodUnit({
                unitId,
                bloodGroup,
                component,
                collectionDate,
                expiryDate,
                status: "Collected",

                registeredBy:
                    req.user.role === "bloodbank"
                        ? req.user.userId
                        : null
            });

            await bloodUnit.save();

            res.status(201).json({
                message: "Blood unit registered successfully.",
                data: bloodUnit
            });

        } catch (error) {
            res.status(400).json({
                message: error.message
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
            ).sort({ createdAt: -1 });

            const today = new Date();

            for (const unit of bloodUnits) {
                if (
                    new Date(unit.expiryDate) < today &&
                    ["Available", "Reserved"].includes(unit.status)
                ) {
                    unit.status = "Expired";
                    await unit.save();
                }
            }

            res.json(bloodUnits);

        } catch (error) {
            res.status(500).json({
                message: error.message
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
            const bloodUnit = await BloodUnit.findOne({
                unitId: req.params.unitId,
                ...getOwnershipFilter(req)
            });

            if (!bloodUnit) {
                return res.status(404).json({
                    message: "Blood unit not found."
                });
            }

            res.json(bloodUnit);

        } catch (error) {
            res.status(500).json({
                message: error.message
            });
        }
    }
);

// ==============================
// ALLOWED STATUS TRANSITIONS
// ==============================

const allowedTransitions = {
    "Collected": ["Testing Pending", "Rejected"],
    "Testing Pending": ["Available", "Rejected"],
    "Available": ["Reserved", "Expired", "Recalled"],
    "Reserved": ["Dispatched", "Available", "Recalled"],
    "Dispatched": ["Received", "Recalled"],
    "Received": ["Recalled"],
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
            const { status } = req.body;

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
                !status ||
                !allowedTransitions[bloodUnit.status] ||
                !allowedTransitions[bloodUnit.status].includes(status)
            ) {
                return res.status(400).json({
                    message: "This status change is not allowed."
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

            bloodUnit.status = status;
            await bloodUnit.save();

            res.json({
                message: "Status updated successfully.",
                data: bloodUnit
            });

        } catch (error) {
            res.status(400).json({
                message: error.message
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
            } = req.body;

            if (
                !bloodGroup ||
                !component ||
                !collectionDate ||
                !expiryDate ||
                isNaN(Date.parse(collectionDate)) ||
                isNaN(Date.parse(expiryDate)) ||
                new Date(expiryDate) <= new Date(collectionDate)
            ) {
                return res.status(400).json({
                    message: "Please provide valid blood unit details and dates."
                });
            }

            const bloodUnit = await BloodUnit.findOneAndUpdate(
                {
                    unitId: req.params.unitId,
                    ...getOwnershipFilter(req)
                },
                {
                    bloodGroup,
                    component,
                    collectionDate,
                    expiryDate
                },
                {
                    new: true,
                    runValidators: true
                }
            );

            if (!bloodUnit) {
                return res.status(404).json({
                    message: "Blood unit not found."
                });
            }

            res.json({
                message: "Blood unit updated successfully.",
                data: bloodUnit
            });

        } catch (error) {
            res.status(400).json({
                message: error.message
            });
        }
    }
);

// ==============================
// HANDLE UNKNOWN API ROUTES
// ==============================

app.use("/api", (req, res) => {
    res.status(404).json({
        message: "API route not found."
    });
});

// Handle unknown pages
app.use((req, res) => {
    res.status(404).send("Page not found.");
});

// ==============================
// START SERVER
// ==============================

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
