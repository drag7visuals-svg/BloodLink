
const express = require("express");
const BloodUnit = require("../models/BloodUnit");
const { protect, authorize } = require("../middleware/auth");

const router = express.Router();

// Get expiry alerts
router.get(
    "/",
    protect,
    authorize("admin", "bloodbank"),
    async (req, res) => {
        try {
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            const sevenDaysLater = new Date(today);
            sevenDaysLater.setDate(sevenDaysLater.getDate() + 7);
            sevenDaysLater.setHours(23, 59, 59, 999);

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

            const [expiringSoon, expired] = await Promise.all([
                BloodUnit.find({
                    ...baseFilter,
                    expiryDate: {
                        $gte: today,
                        $lte: sevenDaysLater
                    }
                }).sort({ expiryDate: 1 }),

                BloodUnit.find({
                    ...baseFilter,
                    expiryDate: { $lt: today }
                }).sort({ expiryDate: 1 })
            ]);

            res.json({
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

            res.status(500).json({
                message: "Unable to retrieve expiry alerts."
            });
        }
    }
);

module.exports = router;
