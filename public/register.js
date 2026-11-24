
const registerForm = document.getElementById("registerForm");
const registerMessage = document.getElementById("registerMessage");
const registerButton = document.getElementById("registerButton");

registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (registerButton.disabled) {
        return;
    }

    const name = document.getElementById("name").value.trim();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    registerMessage.textContent = "";
    registerMessage.className = "message";

    registerButton.disabled = true;
    registerButton.textContent = "Creating Account...";

    try {
        if (!name || !email || !password) {
            throw new Error("Please fill in all required fields.");
        }

        if (password.length < 8) {
            throw new Error("Password must contain at least 8 characters.");
        }

        if (new TextEncoder().encode(password).length > 72) {
            throw new Error("Password must not exceed 72 UTF-8 bytes.");
        }

        const response = await fetch("/api/auth/register", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                name,
                email,
                password
            })
        });

        let data;

        try {
            data = await response.json();
        } catch {
            throw new Error("Invalid server response. Please try again.");
        }

        if (!response.ok) {
            throw new Error(
                data.message || "Registration failed."
            );
        }

        registerMessage.textContent =
            "Account created successfully! Redirecting to login...";

        registerMessage.classList.add("success");

        registerForm.reset();

        setTimeout(() => {
            window.location.replace("/login.html");
        }, 1500);

    } catch (error) {
        registerMessage.textContent =
            error.message || "Something went wrong. Please try again.";

        registerMessage.classList.add("error");

        registerButton.disabled = false;
        registerButton.textContent = "Create Donor Account";
    }
});
