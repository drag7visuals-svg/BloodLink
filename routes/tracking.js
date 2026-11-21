
const express = require("express");
const BloodUnit = require("../models/BloodUnit");

const router = express.Router();

// Public blood unit tracking
router.get("/:unitId", async (req, res) => {
    try {
        const unitId = req.params.unitId.trim();

        if (!unitId) {
            return res.status(400).json({
                message: "Blood unit ID is required."
            });
        }

        const bloodUnit = await BloodUnit.findOne({ unitId })
            .select(
                "unitId bloodGroup component collectionDate expiryDate status createdAt updatedAt"
            )
            .lean();

        if (!bloodUnit) {
            return res.status(404).json({
                message: "Blood unit not found."
            });
        }

        res.json({
            message: "Blood unit tracking details retrieved successfully.",
            bloodUnit
        });

    } catch (error) {
        console.error("Tracking API error:", error);

        res.status(500).json({
            message: "Unable to retrieve blood unit tracking details."
        });
    }
});

module.exports = router;
