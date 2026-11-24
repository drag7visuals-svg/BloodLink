
const express = require("express");
const mongoose = require("mongoose");
const crypto = require("crypto");

const router = express.Router();

const BloodRequest = require("../models/BloodRequest");
const BloodUnit = require("../models/BloodUnit");
const User = require("../models/User");

const { protect, authorize } = require("../middleware/auth");

const BLOOD_GROUPS = [
    "A+", "A-", "B+", "B-",
    "AB+", "AB-", "O+", "O-"
];

const COMPONENTS = [
    "Whole Blood",
    "Red Cells",
    "Plasma",
    "Platelets"
];

const MAX_QUANTITY = 100;

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

async function getPopulatedRequest(id) {
    return populateRequest(
        BloodRequest.findById(id)
    );
}

// ==============================
// HELPER: RESTORE REQUEST STATUS
// ==============================

async function restoreRequestStatus(requestId, currentStatus, previousStatus) {
    return BloodRequest.updateOne(
        {
            _id: requestId,
            status: currentStatus
        },
        {
            $set: {
                status: previousStatus
            }
        }
    );
}

// ==============================
// HELPER: RELEASE RESERVED UNITS
// ==============================

async function releaseReservedUnits(requestId, unitIds) {
    if (!unitIds || unitIds.length === 0) {
        return;
    }

    await BloodUnit.updateMany(
        {
            _id: { $in: unitIds },
            reservedForRequest: requestId,
            status: "Reserved"
        },
        {
            $set: {
                status: "Available",
                reservedForRequest: null
            }
        }
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
            } = req.body || {};

            if (
                typeof bloodBankId !== "string" ||
                !mongoose.Types.ObjectId.isValid(bloodBankId)
            ) {
                return res.status(400).json({
                    message: "Please select a valid blood bank."
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

            const requestedQuantity = Number(quantity);

            if (
                !Number.isInteger(requestedQuantity) ||
                requestedQuantity < 1 ||
                requestedQuantity > MAX_QUANTITY
            ) {
                return res.status(400).json({
                    message: "Quantity must be between 1 and 100."
                });
            }

            if (
                message !== undefined &&
                (
                    typeof message !== "string" ||
                    message.length > 500
                )
            ) {
                return res.status(400).json({
                    message: "Message must be text with a maximum of 500 characters."
                });
            }

            const bloodBank = await User.findOne({
                _id: bloodBankId,
                role: "bloodbank",
                isActive: true
            }).select("_id");

            if (!bloodBank) {
                return res.status(404).json({
                    message: "Blood Bank not found or inactive."
                });
            }

            // Availability check is advisory.
            // Actual units are reserved atomically during approval.
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
                "REQ-" +
                Date.now() +
                "-" +
                crypto.randomBytes(4).toString("hex").toUpperCase();

            const bloodRequest = await BloodRequest.create({
                requestId,
                hospital: req.user.userId,
                bloodBank: bloodBank._id,
                bloodGroup,
                component,
                quantity: requestedQuantity,
                message: (message || "").trim()
            });

            return res.status(201).json({
                message: "Blood request submitted successfully.",
                request: bloodRequest
            });

        } catch (error) {
            console.error(
                "Create blood request error:",
                error.message
            );

            if (error.code === 11000) {
                return res.status(409).json({
                    message: "Unable to generate a unique request ID. Please try again."
                });
            }

            return res.status(500).json({
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
            const filter = {};

            if (req.user.role === "hospital") {
                filter.hospital = req.user.userId;
            }

            if (req.user.role === "bloodbank") {
                filter.bloodBank = req.user.userId;
            }

            const requests = await populateRequest(
                BloodRequest.find(filter)
            )
                .sort({ createdAt: -1 })
                .lean();

            return res.json(requests);

        } catch (error) {
            console.error(
                "Get blood requests error:",
                error.message
            );

            return res.status(500).json({
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
        let approvalCompleted = false;

        try {
            const { decision } = req.body || {};

            if (!["approve", "reject"].includes(decision)) {
                return res.status(400).json({
                    message: "Decision must be approve or reject."
                });
            }

            // ==========================
            // REJECT REQUEST
            // ==========================

            if (decision === "reject") {
                const rejectedRequest =
                    await BloodRequest.findOneAndUpdate(
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
                    return res.status(409).json({
                        message: "Pending request not found or already processed."
                    });
                }

                return res.json({
                    message: "Blood request rejected successfully.",
                    request: await getPopulatedRequest(
                        rejectedRequest._id
                    )
                });
            }

            // ==========================
            // CLAIM REQUEST FOR APPROVAL
            // ==========================

            claimedRequest =
                await BloodRequest.findOneAndUpdate(
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
                return res.status(409).json({
                    message: "Pending request not found or already being processed."
                });
            }

            // ==========================
            // FIND MATCHING UNITS
            // FIRST EXPIRING, FIRST OUT
            // ==========================

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
                .select("_id")
                .lean();

            // ==========================
            // RESERVE UNITS
            // ==========================

            for (const candidate of candidates) {
                if (
                    reservedUnitIds.length >=
                    claimedRequest.quantity
                ) {
                    break;
                }

                const reservedUnit =
                    await BloodUnit.findOneAndUpdate(
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
                    ).select("_id");

                if (reservedUnit) {
                    reservedUnitIds.push(reservedUnit._id);
                }
            }

            // ==========================
            // CHECK RESERVED QUANTITY
            // ==========================

            if (
                reservedUnitIds.length !==
                claimedRequest.quantity
            ) {
                await releaseReservedUnits(
                    claimedRequest._id,
                    reservedUnitIds
                );

                reservedUnitIds = [];

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

                return res.status(409).json({
                    message: "Not enough matching units are currently available. The request remains pending."
                });
            }

            // ==========================
            // COMPLETE APPROVAL
            // ==========================

            const approvedRequest =
                await BloodRequest.findOneAndUpdate(
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
                throw new Error(
                    "Could not complete request approval."
                );
            }

            approvalCompleted = true;

            return res.json({
                message: "Request approved and blood units reserved successfully.",
                request: await getPopulatedRequest(
                    approvedRequest._id
                )
            });

        } catch (error) {
            console.error(
                "Request decision error:",
                error.message
            );

            // Only roll back if approval did not finish.
            if (claimedRequest && !approvalCompleted) {
                try {
                    await releaseReservedUnits(
                        claimedRequest._id,
                        reservedUnitIds
                    );

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

                } catch (rollbackError) {
                    console.error(
                        "Approval rollback failed:",
                        rollbackError.message
                    );
                }
            }

            return res.status(500).json({
                message: "Unable to process the blood request. Check the request status before retrying."
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
        let bloodRequest = null;
        let dispatchCompleted = false;

        try {
            // Claim the request to prevent concurrent dispatch.
            bloodRequest =
                await BloodRequest.findOneAndUpdate(
                    {
                        requestId: req.params.requestId,
                        bloodBank: req.user.userId,
                        status: "Approved"
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

            if (!bloodRequest) {
                return res.status(409).json({
                    message: "Approved request not found or already being processed."
                });
            }

            if (
                !Array.isArray(bloodRequest.allocatedUnits) ||
                bloodRequest.allocatedUnits.length !==
                bloodRequest.quantity
            ) {
                await restoreRequestStatus(
                    bloodRequest._id,
                    "Processing",
                    "Approved"
                );

                return res.status(409).json({
                    message: "Allocated unit count does not match the requested quantity."
                });
            }

            const unitFilter = {
                _id: {
                    $in: bloodRequest.allocatedUnits
                },
                registeredBy: req.user.userId,
                reservedForRequest: bloodRequest._id,
                status: "Reserved",
                expiryDate: { $gt: new Date() }
            };

            const units = await BloodUnit.find(unitFilter)
                .select("_id")
                .lean();

            if (units.length !== bloodRequest.quantity) {
                await restoreRequestStatus(
                    bloodRequest._id,
                    "Processing",
                    "Approved"
                );

                return res.status(409).json({
                    message: "Some reserved units are unavailable or expired. Dispatch cannot proceed."
                });
            }

            // Update only units that still belong to this request.
            const updateResult = await BloodUnit.updateMany(
                unitFilter,
                {
                    $set: {
                        status: "Dispatched"
                    }
                }
            );

            if (
                updateResult.modifiedCount !==
                bloodRequest.quantity
            ) {
                await BloodUnit.updateMany(
                    {
                        _id: { $in: bloodRequest.allocatedUnits },
                        registeredBy: req.user.userId,
                        reservedForRequest: bloodRequest._id,
                        status: "Dispatched"
                    },
                    {
                        $set: {
                            status: "Reserved"
                        }
                    }
                );

                await restoreRequestStatus(
                    bloodRequest._id,
                    "Processing",
                    "Approved"
                );

                return res.status(409).json({
                    message: "Unable to dispatch all allocated units. The request has been restored for retry."
                });
            }

            const updatedRequest =
                await BloodRequest.findOneAndUpdate(
                    {
                        _id: bloodRequest._id,
                        status: "Processing"
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
                throw new Error(
                    "Request status changed before dispatch could be completed."
                );
            }

            dispatchCompleted = true;

            return res.json({
                message: "Blood units dispatched successfully.",
                request: await getPopulatedRequest(
                    updatedRequest._id
                )
            });

        } catch (error) {
            console.error(
                "Dispatch blood units error:",
                error.message
            );

            if (bloodRequest && !dispatchCompleted) {
                try {
                    await BloodUnit.updateMany(
                        {
                            _id: {
                                $in: bloodRequest.allocatedUnits
                            },
                            registeredBy: req.user.userId,
                            reservedForRequest: bloodRequest._id,
                            status: "Dispatched"
                        },
                        {
                            $set: {
                                status: "Reserved"
                            }
                        }
                    );

                    await restoreRequestStatus(
                        bloodRequest._id,
                        "Processing",
                        "Approved"
                    );

                } catch (rollbackError) {
                    console.error(
                        "Dispatch rollback failed:",
                        rollbackError.message
                    );
                }
            }

            return res.status(500).json({
                message: "Unable to dispatch blood units. Check request and inventory status before retrying."
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
        let bloodRequest = null;
        let receiptCompleted = false;

        try {
            // Claim the request to prevent duplicate receipt.
            bloodRequest =
                await BloodRequest.findOneAndUpdate(
                    {
                        requestId: req.params.requestId,
                        hospital: req.user.userId,
                        status: "Dispatched"
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

            if (!bloodRequest) {
                return res.status(409).json({
                    message: "Dispatched request not found or already being processed."
                });
            }

            if (
                !Array.isArray(bloodRequest.allocatedUnits) ||
                bloodRequest.allocatedUnits.length !==
                bloodRequest.quantity
            ) {
                await restoreRequestStatus(
                    bloodRequest._id,
                    "Processing",
                    "Dispatched"
                );

                return res.status(409).json({
                    message: "Allocated unit count does not match the requested quantity."
                });
            }

            const unitFilter = {
                _id: {
                    $in: bloodRequest.allocatedUnits
                },
                registeredBy: bloodRequest.bloodBank,
                reservedForRequest: bloodRequest._id,
                status: "Dispatched"
            };

            const units = await BloodUnit.find(unitFilter)
                .select("_id")
                .lean();

            if (units.length !== bloodRequest.quantity) {
                await restoreRequestStatus(
                    bloodRequest._id,
                    "Processing",
                    "Dispatched"
                );

                return res.status(409).json({
                    message: "Some dispatched units are unavailable. Receipt cannot be confirmed."
                });
            }

            const updateResult = await BloodUnit.updateMany(
                unitFilter,
                {
                    $set: {
                        status: "Received"
                    }
                }
            );

            if (
                updateResult.modifiedCount !==
                bloodRequest.quantity
            ) {
                await BloodUnit.updateMany(
                    {
                        _id: { $in: bloodRequest.allocatedUnits },
                        registeredBy: bloodRequest.bloodBank,
                        reservedForRequest: bloodRequest._id,
                        status: "Received"
                    },
                    {
                        $set: {
                            status: "Dispatched"
                        }
                    }
                );

                await restoreRequestStatus(
                    bloodRequest._id,
                    "Processing",
                    "Dispatched"
                );

                return res.status(409).json({
                    message: "Unable to confirm receipt of all allocated units. The request has been restored for retry."
                });
            }

            const updatedRequest =
                await BloodRequest.findOneAndUpdate(
                    {
                        _id: bloodRequest._id,
                        hospital: req.user.userId,
                        status: "Processing"
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
                throw new Error(
                    "Request status changed before receipt could be completed."
                );
            }

            receiptCompleted = true;

            return res.json({
                message: "Blood receipt confirmed successfully.",
                request: await getPopulatedRequest(
                    updatedRequest._id
                )
            });

        } catch (error) {
            console.error(
                "Confirm blood receipt error:",
                error.message
            );

            if (bloodRequest && !receiptCompleted) {
                try {
                    await BloodUnit.updateMany(
                        {
                            _id: {
                                $in: bloodRequest.allocatedUnits
                            },
                            registeredBy: bloodRequest.bloodBank,
                            reservedForRequest: bloodRequest._id,
                            status: "Received"
                        },
                        {
                            $set: {
                                status: "Dispatched"
                            }
                        }
                    );

                    await restoreRequestStatus(
                        bloodRequest._id,
                        "Processing",
                        "Dispatched"
                    );

                } catch (rollbackError) {
                    console.error(
                        "Receipt rollback failed:",
                        rollbackError.message
                    );
                }
            }

            return res.status(500).json({
                message: "Unable to confirm blood receipt. Check request and inventory status before retrying."
            });
        }
    }
);

module.exports = router;
