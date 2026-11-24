
const mongoose = require("mongoose");
const crypto = require("crypto");

const bloodUnitSchema = new mongoose.Schema(
    {
        unitId: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            maxlength: 100
        },

        // Random public identifier used by permanent QR tracking URLs.
        trackingToken: {
            type: String,
            required: true,
            unique: true,
            immutable: true,
            select: false,
            default: () => crypto.randomBytes(32).toString("hex")
        },

        bloodGroup: {
            type: String,
            required: true,
            enum: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]
        },

        component: {
            type: String,
            required: true,
            enum: [
                "Whole Blood",
                "Red Cells",
                "Plasma",
                "Platelets"
            ]
        },

        collectionDate: {
            type: Date,
            required: true
        },

        expiryDate: {
            type: Date,
            required: true,
            validate: {
                validator: function (value) {
                    return !this.collectionDate ||
                        value > this.collectionDate;
                },
                message: "Expiry date must be after the collection date."
            }
        },

        status: {
            type: String,
            enum: [
                "Collected",
                "Testing Pending",
                "Available",
                "Reserved",
                "Dispatched",
                "Received",
                "Rejected",
                "Expired",
                "Recalled"
            ],
            default: "Collected"
        },

        registeredBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
            index: true
        },

        donor: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null,
            index: true
        },

        reservedForRequest: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "BloodRequest",
            default: null,
            index: true
        }
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model("BloodUnit", bloodUnitSchema);
