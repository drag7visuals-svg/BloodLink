
const registerForm = document.getElementById("registerForm");
const registerMessage = document.getElementById("registerMessage");
const registerButton = document.getElementById("registerButton");

registerForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const name = document.getElementById("name").value.trim();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    registerMessage.textContent = "";
    registerMessage.className = "message";

    registerButton.disabled = true;
    registerButton.textContent = "Creating Account...";

    try {
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

        const data = await response.json();

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
            window.location.href = "/login.html";
        }, 1500);

    } catch (error) {
        registerMessage.textContent = error.message;
        registerMessage.classList.add("error");

        registerButton.disabled = false;
        registerButton.textContent = "Create Donor Account";
    }
});
