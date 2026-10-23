const mongoose = require("mongoose");

const saleItemSchema = new mongoose.Schema(
    {
        medicine: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Medicine",
            required: true
        },

        medicineName: {
            type: String,
            required: true
        },
        batchNumber: { type: String, default: "" },
        expiryDate: { type: Date },

        quantity: {
            type: Number,
            required: true,
            min: 1
        },

        unitPrice: {
            type: Number,
            required: true,
            min: 0
        },
        unitCost: { type: Number, min: 0 },

        gstPercentage: {
            type: Number,
            default: 0,
            min: 0,
            max: 100
        },

        subtotal: {
            type: Number,
            required: true,
            min: 0
        },

        gstAmount: {
            type: Number,
            required: true,
            min: 0
        },

        total: {
            type: Number,
            required: true,
            min: 0
        }
    },
    { _id: false }
);

const saleSchema = new mongoose.Schema(
    {
        invoiceNumber: {
            type: String,
            required: true,
            unique: true
        },

        items: {
            type: [saleItemSchema],
            required: true,
            validate: {
                validator: items => items.length > 0,
                message: "A sale must contain at least one medicine."
            }
        },

        subtotal: {
            type: Number,
            required: true,
            min: 0
        },

        totalGST: {
            type: Number,
            required: true,
            min: 0
        },

        grandTotal: {
            type: Number,
            required: true,
            min: 0
        },

        soldBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },

        paymentMethod: {
            type: String,
            enum: ["cash", "upi", "card"],
            default: "cash"
        },

        status: {
            type: String,
            enum: ["completed", "cancelled"],
            default: "completed"
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model("Sale", saleSchema);
