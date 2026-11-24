
const loginForm = document.getElementById("loginForm");
const loginMessage = document.getElementById("loginMessage");
const loginButton = document.getElementById("loginButton");

loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (loginButton.disabled) {
        return;
    }

    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;

    loginMessage.textContent = "";
    loginMessage.className = "message";

    loginButton.disabled = true;
    loginButton.textContent = "Logging in...";

    try {
        const response = await fetch("/api/auth/login", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            credentials: "include",
            body: JSON.stringify({
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
            throw new Error(data.message || "Login failed.");
        }

        if (!data.user || !data.user.role) {
            throw new Error("Invalid login response from server.");
        }

        const dashboards = {
            admin: "/",
            bloodbank: "/bloodbank.html",
            hospital: "/hospital.html",
            donor: "/donor.html"
        };

        const destination = dashboards[data.user.role];

        if (!destination) {
            throw new Error(
                "Your account does not have a valid dashboard."
            );
        }

        loginMessage.textContent = "Login successful. Redirecting...";
        loginMessage.classList.add("success");

        window.location.replace(destination);

    } catch (error) {
        loginMessage.textContent =
            error.message || "Something went wrong. Please try again.";

        loginMessage.classList.add("error");

        loginButton.disabled = false;
        loginButton.textContent = "Log In";
    }
});
