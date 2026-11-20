
const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const path = require("path");
require("dotenv").config();

const BloodUnit = require("./models/BloodUnit");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// MongoDB connection
mongoose.connect(
    process.env.MONGO_URI || "mongodb://127.0.0.1:27017/BloodBankDB"
)
.then(() => {
    console.log("MongoDB Connected Successfully");
})
.catch((error) => {
    console.log("MongoDB Connection Failed:", error.message);
});

// Home page
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

// Privacy Policy
app.get("/privacy", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "privacy.html"));
});

// Register a blood unit
app.post("/api/blood-units", async (req, res) => {
    try {
        const {
            unitId,
            bloodGroup,
            component,
            collectionDate,
            expiryDate
        } = req.body;

        if (!unitId || !bloodGroup || !component || !collectionDate || !expiryDate) {
            return res.status(400).json({
                message: "Please fill in all required fields"
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
                message: "This blood unit ID already exists"
            });
        }

        const bloodUnit = new BloodUnit({
            unitId,
            bloodGroup,
            component,
            collectionDate,
            expiryDate,
            status: "Collected"
        });

        await bloodUnit.save();

        res.status(201).json({
            message: "Blood unit registered successfully",
            data: bloodUnit
        });

    } catch (error) {
        res.status(400).json({
            message: error.message
        });
    }
});

// View all blood units
app.get("/api/blood-units", async (req, res) => {
    try {
        const bloodUnits = await BloodUnit.find().sort({ createdAt: -1 });

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
});

// Search for a blood unit
app.get("/api/blood-units/:unitId", async (req, res) => {
    try {
        const bloodUnit = await BloodUnit.findOne({
            unitId: req.params.unitId
        });

        if (!bloodUnit) {
            return res.status(404).json({
                message: "Blood unit not found"
            });
        }

        res.json(bloodUnit);

    } catch (error) {
        res.status(500).json({
            message: error.message
        });
    }
});

// Allowed status transitions
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

// Update blood unit status
app.patch("/api/blood-units/:unitId/status", async (req, res) => {
    try {
        const { status } = req.body;

        const bloodUnit = await BloodUnit.findOne({
            unitId: req.params.unitId
        });

        if (!bloodUnit) {
            return res.status(404).json({
                message: "Blood unit not found"
            });
        }

        if (
            !status ||
            !allowedTransitions[bloodUnit.status] ||
            !allowedTransitions[bloodUnit.status].includes(status)
        ) {
            return res.status(400).json({
                message: "This status change is not allowed"
            });
        }

        if (
            status === "Available" &&
            new Date(bloodUnit.expiryDate) <= new Date()
        ) {
            return res.status(400).json({
                message: "Expired blood cannot be made available"
            });
        }

        bloodUnit.status = status;
        await bloodUnit.save();

        res.json({
            message: "Status updated successfully",
            data: bloodUnit
        });

    } catch (error) {
        res.status(400).json({
            message: error.message
        });
    }
});

// Update blood unit details
app.put("/api/blood-units/:unitId", async (req, res) => {
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
            { unitId: req.params.unitId },
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
                message: "Blood unit not found"
            });
        }

        res.json({
            message: "Blood unit updated successfully",
            data: bloodUnit
        });

    } catch (error) {
        res.status(400).json({
            message: error.message
        });
    }
});

// Handle unknown API routes
app.use("/api", (req, res) => {
    res.status(404).json({
        message: "API route not found"
    });
});

// Handle unknown pages
app.use((req, res) => {
    res.status(404).send("Page not found");
});

// Start server
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
});
