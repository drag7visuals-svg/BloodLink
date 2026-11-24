
const express = require("express");
const BloodUnit = require("../models/BloodUnit");
const { protect, authorize } = require("../middleware/auth");

const router = express.Router();

// ==============================
// GET BLOOD UNIT EXPIRY ALERTS
// ADMIN AND BLOOD BANK ONLY
// ==============================

router.get(
    "/",
    protect,
    authorize("admin", "bloodbank"),
    async (req, res) => {
        try {
            const now = new Date();

            const sevenDaysLater = new Date(now);
            sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);

            const ownershipFilter =
                req.user.role === "bloodbank"
                    ? { registeredBy: req.user.userId }
                    : {};

            const activeStatuses = [
                "Collected",
                "Testing Pending",
                "Available",
                "Reserved"
            ];

            const baseFilter = {
                ...ownershipFilter,
                status: { $in: activeStatuses }
            };

            const fields =
                "unitId bloodGroup component collectionDate expiryDate status createdAt updatedAt";

            const [expiringSoon, expired] = await Promise.all([
                // Units expiring within the next seven days
                BloodUnit.find({
                    ...baseFilter,
                    expiryDate: {
                        $gte: now,
                        $lte: sevenDaysLater
                    }
                })
                    .select(fields)
                    .sort({ expiryDate: 1 })
                    .lean(),

                // Units that have already expired
                BloodUnit.find({
                    ...baseFilter,
                    expiryDate: { $lt: now }
                })
                    .select(fields)
                    .sort({ expiryDate: 1 })
                    .lean()
            ]);

            return res.json({
                message: "Expiry alerts retrieved successfully.",
                summary: {
                    expiringSoon: expiringSoon.length,
                    expired: expired.length
                },
                expiringSoon,
                expired
            });

        } catch (error) {
            console.error("Expiry alert error:", error);

            return res.status(500).json({
                message: "Unable to retrieve expiry alerts."
            });
        }
    }
);

module.exports = router;
