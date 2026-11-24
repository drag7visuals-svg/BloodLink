
require("dotenv").config();

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("./models/User");

async function createAdmin() {
    try {
        await mongoose.connect(
            process.env.MONGO_URI || "mongodb://127.0.0.1:27017/BloodBankDB"
        );

        const existingAdmin = await User.findOne({
            role: "admin"
        });

        if (existingAdmin) {
            console.log("An Admin account already exists.");
            return;
        }

        const name = process.env.ADMIN_NAME?.trim();
        const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
        const password = process.env.ADMIN_PASSWORD;

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

        if (!name || name.length > 100) {
            throw new Error("Provide a valid admin name (maximum 100 characters).");
        }

        if (!email || email.length > 254 || !emailRegex.test(email)) {
            throw new Error("Provide a valid admin email address.");
        }

        if (
            !password ||
            password.length < 12 ||
            Buffer.byteLength(password, "utf8") > 72
        ) {
            throw new Error(
                "Admin password must contain at least 12 characters and no more than 72 UTF-8 bytes."
            );
        }

        const existingUser = await User.findOne({ email });

        if (existingUser) {
            throw new Error(
                "This email is already registered. Use another email."
            );
        }

        const hashedPassword = await bcrypt.hash(password, 12);

        await User.create({
            name,
            email,
            password: hashedPassword,
            role: "admin"
        });

        console.log("Admin account created successfully.");

    } catch (error) {
        console.error("Admin creation failed:", error.message);
        process.exitCode = 1;

    } finally {
        await mongoose.disconnect();
    }
}

createAdmin();
