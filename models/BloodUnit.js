
const mongoose = require("mongoose");

const bloodUnitSchema = new mongoose.Schema(
    {
        unitId: {
            type: String,
            required: true,
            unique: true,
            trim: true
        },

        bloodGroup: {
            type: String,
            required: true,
            enum: ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"]
        },

        component: {
            type: String,
            required: true,
            enum: ["Whole Blood", "Red Cells", "Plasma", "Platelets"]
        },

        collectionDate: {
            type: Date,
            required: true
        },

        expiryDate: {
            type: Date,
            required: true
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
        }
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model("BloodUnit", bloodUnitSchema);
