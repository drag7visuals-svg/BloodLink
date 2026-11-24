
const mongoose = require("mongoose");

const bloodRequestSchema = new mongoose.Schema(
    {
        requestId: {
            type: String,
            required: true,
            unique: true,
            trim: true,
            immutable: true
        },

        hospital: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true
        },

        bloodBank: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true
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
            min: 1,
            max: 100,
            validate: {
                validator: Number.isInteger,
                message: "Quantity must be a whole number."
            }
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
            default: "Pending",
            index: true
        },

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

// Compound indexes for common request queries.
bloodRequestSchema.index({ hospital: 1, createdAt: -1 });
bloodRequestSchema.index({ bloodBank: 1, createdAt: -1 });
bloodRequestSchema.index({ bloodBank: 1, status: 1 });

module.exports = mongoose.model("BloodRequest", bloodRequestSchema);
