
const express = require("express");
const BloodUnit = require("../models/BloodUnit");

const router = express.Router();

// ==============================
// PUBLIC BLOOD UNIT TRACKING
// ==============================

router.get("/:unitId", async (req, res) => {
    try {
        const unitId = req.params.unitId;

        if (
            typeof unitId !== "string" ||
            unitId.trim().length === 0 ||
            unitId.trim().length > 100
        ) {
            return res.status(400).json({
                message: "Please provide a valid blood unit ID."
            });
        }

        const bloodUnit = await BloodUnit.findOne({
            unitId: unitId.trim()
        })
            .select(
                "unitId bloodGroup component collectionDate expiryDate status createdAt updatedAt"
            )
            .lean();

        if (!bloodUnit) {
            return res.status(404).json({
                message: "Blood unit not found."
            });
        }

        return res.status(200).json({
            message: "Blood unit tracking details retrieved successfully.",
            bloodUnit
        });

    } catch (error) {
        console.error("Tracking API error:", error);

        return res.status(500).json({
            message: "Unable to retrieve blood unit tracking details."
        });
    }
});

module.exports = router;
