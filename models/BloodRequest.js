
const mongoose = require("mongoose");

const bloodRequestSchema = new mongoose.Schema(
    {
        requestId: {
            type: String,
            required: true,
            unique: true,
            trim: true
        },

        hospital: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },

        bloodBank: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },

        bloodGroup: {
            type: String,
            required: true,
            enum: [
                "A+", "A-", "B+", "B-",
                "AB+", "AB-", "O+", "O-"
            ]
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

        quantity: {
            type: Number,
            required: true,
            min: 1
        },

        status: {
            type: String,
            enum: [
                "Pending",
                "Processing",
                "Approved",
                "Rejected",
                "Reserved",
                "Dispatched",
                "Received",
                "Cancelled"
            ],
            default: "Pending"
        },

        // Blood units allocated to this request
        allocatedUnits: [
            {
                type: mongoose.Schema.Types.ObjectId,
                ref: "BloodUnit"
            }
        ],

        message: {
            type: String,
            trim: true,
            maxlength: 500,
            default: ""
        }
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model("BloodRequest", bloodRequestSchema);
