
const express = require("express");
const mongoose = require("mongoose");

const router = express.Router();

const BloodRequest = require("../models/BloodRequest");
const BloodUnit = require("../models/BloodUnit");
const User = require("../models/User");

const { protect, authorize } = require("../middleware/auth");

// ==============================
// POPULATE REQUEST DETAILS
// ==============================

function populateRequest(query) {
    return query
        .populate("hospital", "name email")
        .populate("bloodBank", "name email")
        .populate(
            "allocatedUnits",
            "unitId bloodGroup component status expiryDate"
        );
}

// ==============================
// CREATE BLOOD REQUEST
// HOSPITAL ONLY
// ==============================

router.post(
    "/",
    protect,
    authorize("hospital"),
    async (req, res) => {
        try {
            const {
                bloodBankId,
                bloodGroup,
                component,
                quantity,
                message
            } = req.body;

            if (
                !bloodBankId ||
                !mongoose.Types.ObjectId.isValid(bloodBankId)
            ) {
                return res.status(400).json({
                    message: "Please select a valid blood bank."
                });
            }

            if (
                !["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]
                    .includes(bloodGroup)
            ) {
                return res.status(400).json({
                    message: "Invalid blood group."
                });
            }

            if (
                !["Whole Blood", "Red Cells", "Plasma", "Platelets"]
                    .includes(component)
            ) {
                return res.status(400).json({
                    message: "Invalid blood component."
                });
            }

            const requestedQuantity = Number(quantity);

            if (
                !Number.isInteger(requestedQuantity) ||
                requestedQuantity < 1 ||
                requestedQuantity > 100
            ) {
                return res.status(400).json({
                    message: "Quantity must be between 1 and 100."
                });
            }

            if (
                message !== undefined &&
                (typeof message !== "string" || message.length > 500)
            ) {
                return res.status(400).json({
                    message: "Message must be text with a maximum of 500 characters."
                });
            }

            const bloodBank = await User.findOne({
                _id: bloodBankId,
                role: "bloodbank",
                isActive: true
            });

            if (!bloodBank) {
                return res.status(404).json({
                    message: "Blood Bank not found or inactive."
                });
            }

            const availableUnits = await BloodUnit.countDocuments({
                registeredBy: bloodBank._id,
                bloodGroup,
                component,
                status: "Available",
                expiryDate: { $gt: new Date() }
            });

            if (availableUnits < requestedQuantity) {
                return res.status(400).json({
                    message: `Only ${availableUnits} matching units are currently available.`
                });
            }

            const requestId =
                "REQ-" + Date.now() + "-" +
                Math.floor(1000 + Math.random() * 9000);

            const bloodRequest = await BloodRequest.create({
                requestId,
                hospital: req.user.userId,
                bloodBank: bloodBank._id,
                bloodGroup,
                component,
                quantity: requestedQuantity,
                message: message || ""
            });

            res.status(201).json({
                message: "Blood request submitted successfully.",
                request: bloodRequest
            });

        } catch (error) {
            console.error("Create blood request error:", error);

            res.status(500).json({
                message: "Unable to create blood request."
            });
        }
    }
);

// ==============================
// GET BLOOD REQUESTS
// ==============================

router.get(
    "/",
    protect,
    authorize("admin", "hospital", "bloodbank"),
    async (req, res) => {
        try {
            let filter = {};

            if (req.user.role === "hospital") {
                filter.hospital = req.user.userId;
            }

            if (req.user.role === "bloodbank") {
                filter.bloodBank = req.user.userId;
            }

            const requests = await populateRequest(
                BloodRequest.find(filter)
            ).sort({ createdAt: -1 });

            res.json(requests);

        } catch (error) {
            console.error("Get blood requests error:", error);

            res.status(500).json({
                message: "Unable to load blood requests."
            });
        }
    }
);

// ==============================
// APPROVE OR REJECT REQUEST
// BLOOD BANK ONLY
// ==============================

router.patch(
    "/:requestId/decision",
    protect,
    authorize("bloodbank"),
    async (req, res) => {
        let claimedRequest = null;
        let reservedUnitIds = [];

        try {
            const { decision } = req.body;

            if (!["approve", "reject"].includes(decision)) {
                return res.status(400).json({
                    message: "Decision must be approve or reject."
                });
            }

            // REJECT REQUEST
            if (decision === "reject") {
                const rejectedRequest = await BloodRequest.findOneAndUpdate(
                    {
                        requestId: req.params.requestId,
                        bloodBank: req.user.userId,
                        status: "Pending"
                    },
                    {
                        $set: {
                            status: "Rejected"
                        }
                    },
                    {
                        new: true
                    }
                );

                if (!rejectedRequest) {
                    return res.status(404).json({
                        message: "Pending request not found or already processed."
                    });
                }

                return res.json({
                    message: "Blood request rejected successfully.",
                    request: await populateRequest(
                        BloodRequest.findById(rejectedRequest._id)
                    )
                });
            }

            // APPROVE REQUEST
            claimedRequest = await BloodRequest.findOneAndUpdate(
                {
                    requestId: req.params.requestId,
                    bloodBank: req.user.userId,
                    status: "Pending"
                },
                {
                    $set: {
                        status: "Processing"
                    }
                },
                {
                    new: true
                }
            );

            if (!claimedRequest) {
                return res.status(404).json({
                    message: "Pending request not found or already processed."
                });
            }

            // FIND MATCHING AVAILABLE UNITS
            const candidates = await BloodUnit.find({
                registeredBy: req.user.userId,
                bloodGroup: claimedRequest.bloodGroup,
                component: claimedRequest.component,
                status: "Available",
                expiryDate: { $gt: new Date() }
            })
            .sort({
                expiryDate: 1,
                collectionDate: 1
            })
            .select("_id");

            // RESERVE UNITS
            for (const candidate of candidates) {
                if (reservedUnitIds.length >= claimedRequest.quantity) {
                    break;
                }

                const reservedUnit = await BloodUnit.findOneAndUpdate(
                    {
                        _id: candidate._id,
                        registeredBy: req.user.userId,
                        status: "Available",
                        expiryDate: { $gt: new Date() }
                    },
                    {
                        $set: {
                            status: "Reserved",
                            reservedForRequest: claimedRequest._id
                        }
                    },
                    {
                        new: true
                    }
                );

                if (reservedUnit) {
                    reservedUnitIds.push(reservedUnit._id);
                }
            }

            // ROLLBACK IF INSUFFICIENT INVENTORY
            if (reservedUnitIds.length < claimedRequest.quantity) {
                await BloodUnit.updateMany(
                    {
                        _id: { $in: reservedUnitIds },
                        reservedForRequest: claimedRequest._id
                    },
                    {
                        $set: {
                            status: "Available",
                            reservedForRequest: null
                        }
                    }
                );

                reservedUnitIds = [];

                await BloodRequest.updateOne(
                    {
                        _id: claimedRequest._id,
                        status: "Processing"
                    },
                    {
                        $set: {
                            status: "Pending"
                        }
                    }
                );

                return res.status(409).json({
                    message: "Not enough matching units are currently available. The request remains pending."
                });
            }

            // COMPLETE APPROVAL
            const approvedRequest = await BloodRequest.findOneAndUpdate(
                {
                    _id: claimedRequest._id,
                    status: "Processing"
                },
                {
                    $set: {
                        status: "Approved",
                        allocatedUnits: reservedUnitIds
                    }
                },
                {
                    new: true
                }
            );

            if (!approvedRequest) {
                throw new Error("Could not complete request approval.");
            }

            res.json({
                message: "Request approved and blood units reserved successfully.",
                request: await populateRequest(
                    BloodRequest.findById(approvedRequest._id)
                )
            });

        } catch (error) {
            console.error("Request decision error:", error);

            if (reservedUnitIds.length > 0 && claimedRequest) {
                await BloodUnit.updateMany(
                    {
                        _id: { $in: reservedUnitIds },
                        reservedForRequest: claimedRequest._id
                    },
                    {
                        $set: {
                            status: "Available",
                            reservedForRequest: null
                        }
                    }
                );
            }

            if (claimedRequest) {
                await BloodRequest.updateOne(
                    {
                        _id: claimedRequest._id,
                        status: "Processing"
                    },
                    {
                        $set: {
                            status: "Pending",
                            allocatedUnits: []
                        }
                    }
                );
            }

            res.status(500).json({
                message: "Unable to process the blood request."
            });
        }
    }
);

// ==============================
// DISPATCH BLOOD UNITS
// BLOOD BANK ONLY
// ==============================

router.patch(
    "/:requestId/dispatch",
    protect,
    authorize("bloodbank"),
    async (req, res) => {
        try {
            const bloodRequest = await BloodRequest.findOne({
                requestId: req.params.requestId,
                bloodBank: req.user.userId,
                status: "Approved"
            });

            if (!bloodRequest) {
                return res.status(404).json({
                    message: "Approved request not found."
                });
            }

            if (
                bloodRequest.allocatedUnits.length !==
                bloodRequest.quantity
            ) {
                return res.status(409).json({
                    message: "Allocated unit count does not match the requested quantity."
                });
            }

            const units = await BloodUnit.find({
                _id: { $in: bloodRequest.allocatedUnits },
                registeredBy: req.user.userId,
                reservedForRequest: bloodRequest._id,
                status: "Reserved",
                expiryDate: { $gt: new Date() }
            }).select("_id");

            if (units.length !== bloodRequest.quantity) {
                return res.status(409).json({
                    message: "Some reserved units are unavailable or expired. Dispatch cannot proceed."
                });
            }

            const updateResult = await BloodUnit.updateMany(
                {
                    _id: { $in: bloodRequest.allocatedUnits },
                    registeredBy: req.user.userId,
                    reservedForRequest: bloodRequest._id,
                    status: "Reserved",
                    expiryDate: { $gt: new Date() }
                },
                {
                    $set: {
                        status: "Dispatched"
                    }
                }
            );

            if (updateResult.modifiedCount !== bloodRequest.quantity) {
                await BloodUnit.updateMany(
                    {
                        _id: { $in: bloodRequest.allocatedUnits },
                        reservedForRequest: bloodRequest._id,
                        status: "Dispatched"
                    },
                    {
                        $set: {
                            status: "Reserved"
                        }
                    }
                );

                return res.status(409).json({
                    message: "Unable to dispatch all allocated units."
                });
            }

            const updatedRequest = await BloodRequest.findOneAndUpdate(
                {
                    _id: bloodRequest._id,
                    status: "Approved"
                },
                {
                    $set: {
                        status: "Dispatched"
                    }
                },
                {
                    new: true
                }
            );

            if (!updatedRequest) {
                await BloodUnit.updateMany(
                    {
                        _id: { $in: bloodRequest.allocatedUnits },
                        reservedForRequest: bloodRequest._id,
                        status: "Dispatched"
                    },
                    {
                        $set: {
                            status: "Reserved"
                        }
                    }
                );

                return res.status(409).json({
                    message: "Request status changed before dispatch could be completed."
                });
            }

            res.json({
                message: "Blood units dispatched successfully.",
                request: await populateRequest(
                    BloodRequest.findById(updatedRequest._id)
                )
            });

        } catch (error) {
            console.error("Dispatch blood units error:", error);

            res.status(500).json({
                message: "Unable to dispatch blood units."
            });
        }
    }
);

// ==============================
// CONFIRM BLOOD RECEIPT
// HOSPITAL ONLY
// ==============================

router.patch(
    "/:requestId/receive",
    protect,
    authorize("hospital"),
    async (req, res) => {
        try {
            const bloodRequest = await BloodRequest.findOne({
                requestId: req.params.requestId,
                hospital: req.user.userId,
                status: "Dispatched"
            });

            if (!bloodRequest) {
                return res.status(404).json({
                    message: "Dispatched request not found."
                });
            }

            if (
                bloodRequest.allocatedUnits.length !==
                bloodRequest.quantity
            ) {
                return res.status(409).json({
                    message: "Allocated unit count does not match the requested quantity."
                });
            }

            const units = await BloodUnit.find({
                _id: { $in: bloodRequest.allocatedUnits },
                registeredBy: bloodRequest.bloodBank,
                reservedForRequest: bloodRequest._id,
                status: "Dispatched"
            }).select("_id");

            if (units.length !== bloodRequest.quantity) {
                return res.status(409).json({
                    message: "Some dispatched units are unavailable. Receipt cannot be confirmed."
                });
            }

            const updateResult = await BloodUnit.updateMany(
                {
                    _id: { $in: bloodRequest.allocatedUnits },
                    registeredBy: bloodRequest.bloodBank,
                    reservedForRequest: bloodRequest._id,
                    status: "Dispatched"
                },
                {
                    $set: {
                        status: "Received"
                    }
                }
            );

            if (updateResult.modifiedCount !== bloodRequest.quantity) {
                await BloodUnit.updateMany(
                    {
                        _id: { $in: bloodRequest.allocatedUnits },
                        reservedForRequest: bloodRequest._id,
                        status: "Received"
                    },
                    {
                        $set: {
                            status: "Dispatched"
                        }
                    }
                );

                return res.status(409).json({
                    message: "Unable to confirm receipt of all allocated units."
                });
            }

            const updatedRequest = await BloodRequest.findOneAndUpdate(
                {
                    _id: bloodRequest._id,
                    hospital: req.user.userId,
                    status: "Dispatched"
                },
                {
                    $set: {
                        status: "Received"
                    }
                },
                {
                    new: true
                }
            );

            if (!updatedRequest) {
                await BloodUnit.updateMany(
                    {
                        _id: { $in: bloodRequest.allocatedUnits },
                        reservedForRequest: bloodRequest._id,
                        status: "Received"
                    },
                    {
                        $set: {
                            status: "Dispatched"
                        }
                    }
                );

                return res.status(409).json({
                    message: "Request status changed before receipt could be confirmed."
                });
            }

            res.json({
                message: "Blood receipt confirmed successfully.",
                request: await populateRequest(
                    BloodRequest.findById(updatedRequest._id)
                )
            });

        } catch (error) {
            console.error("Confirm blood receipt error:", error);

            res.status(500).json({
                message: "Unable to confirm blood receipt."
            });
        }
    }
);

module.exports = router;
