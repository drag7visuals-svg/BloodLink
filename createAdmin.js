
require("dotenv").config();

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("./models/User");

async function createAdmin() {
    try {
        await mongoose.connect(
            process.env.MONGO_URI || "mongodb://127.0.0.1:27017/BloodBankDB"
        );

        const existingAdmin = await User.findOne({ role: "admin" });

        if (existingAdmin) {
            console.log("An Admin account already exists.");
            return;
        }

        const name = process.env.ADMIN_NAME;
        const email = process.env.ADMIN_EMAIL?.toLowerCase().trim();
        const password = process.env.ADMIN_PASSWORD;

        if (!name || !email || !password || password.length < 12) {
            throw new Error(
                "Set ADMIN_NAME, ADMIN_EMAIL and a password of at least 12 characters in .env"
            );
        }

        const existingUser = await User.findOne({ email });

        if (existingUser) {
            throw new Error("This email is already registered. Use another email.");
        }

        const hashedPassword = await bcrypt.hash(password, 12);

        await User.create({
            name,
            email,
            password: hashedPassword,
            role: "admin"
        });

        console.log("Admin account created successfully.");
        console.log("Email:", email);

    } catch (error) {
        console.error("Admin creation failed:", error.message);
        process.exitCode = 1;

    } finally {
        await mongoose.disconnect();
    }
}

createAdmin();
