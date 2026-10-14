const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true
        },

        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true
        },

        password: {
            type: String,
            required: true
        },

        role: {
            type: String,
            enum: ["admin", "cashier"],
            default: "cashier"
        },

        approvalStatus: { type: String, enum: ["pending", "approved", "rejected"], default: "pending", index: true },
        rejectionReason: { type: String, default: "" },
        address: { type: String, trim: true, default: "" },
        profilePhoto: { type: String, default: "" },
        mustChangePassword: { type: Boolean, default: false },
        joiningDate: { type: Date },
        jobTitle: { type: String, default: "Cashier" },
        employmentStatus: { type: String, enum: ["active", "inactive"], default: "active" },
        phone: {
            type: String,
            trim: true
        },

        isActive: {
            type: Boolean,
            default: true
        }
    },
    {
        timestamps: true
    }
);

module.exports = mongoose.model("User", userSchema);