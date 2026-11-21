
const loginForm = document.getElementById("loginForm");
const loginMessage = document.getElementById("loginMessage");
const loginButton = document.getElementById("loginButton");

loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

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

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || "Login failed.");
        }

        const dashboards = {
            admin: "/",
            bloodbank: "/bloodbank.html",
            hospital: "/hospital.html",
            donor: "/donor.html"
        };

        const destination = dashboards[data.user.role];

        if (!destination) {
            throw new Error("Your account does not have a valid dashboard.");
        }

        loginMessage.textContent = "Login successful. Redirecting...";
        loginMessage.classList.add("success");

        window.location.href = destination;

    } catch (error) {
        loginMessage.textContent = error.message;
        loginMessage.classList.add("error");

        loginButton.disabled = false;
        loginButton.textContent = "Log In";
    }
});
