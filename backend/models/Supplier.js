
const mongoose = require("mongoose");

const supplierSchema = new mongoose.Schema(
    {
        linkedUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", unique: true, sparse: true },
        supplierName: {
            type: String,
            required: true,
            trim: true
        },

        contactPerson: {
            type: String,
            required: true,
            trim: true
        },

        phone: {
            type: String,
            required: true,
            trim: true
        },

        email: {
            type: String,
            trim: true,
            lowercase: true
        },

        address: {
            type: String,
            trim: true
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

module.exports = mongoose.model(
    "Supplier",
    supplierSchema
);
