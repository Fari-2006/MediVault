
const mongoose = require("mongoose");

const medicineSchema = new mongoose.Schema(
    {
        medicineName: {
            type: String,
            required: true,
            trim: true
        },

        genericName: {
            type: String,
            trim: true,
            default: ""
        },

        category: {
            type: String,
            required: true,
            trim: true
        },

        batchNumber: {
            type: String,
            required: true,
            trim: true
        },

        manufacturer: {
            type: String,
            required: true,
            trim: true
        },

        barcode: {
            type: String,
            trim: true,
            default: ""
        },

        purchasePrice: {
            type: Number,
            required: true,
            min: 0
        },

        sellingPrice: {
            type: Number,
            required: true,
            min: 0
        },

        gstPercentage: {
            type: Number,
            default: 0,
            min: 0,
            max: 100
        },

        quantity: {
            type: Number,
            required: true,
            default: 0,
            min: 0
        },

        reorderLevel: {
            type: Number,
            required: true,
            default: 10,
            min: 0
        },

        expiryDate: {
            type: Date,
            required: true
        },

        prescriptionRequired: {
            type: Boolean,
            default: false
        },

        status: {
            type: String,
            enum: ["active", "inactive"],
            default: "active"
        }
    },
    {
        timestamps: true
    }
);

// Prevent duplicate batch entries for the same medicine.
medicineSchema.index(
    { medicineName: 1, batchNumber: 1 },
    { unique: true }
);

module.exports = mongoose.model("Medicine", medicineSchema);
