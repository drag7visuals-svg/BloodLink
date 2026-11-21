
// ==============================
// BLOOD BANK SESSION
// ==============================

async function loadBloodBankSession() {
    try {
        const response = await fetch("/api/auth/me", {
            credentials: "include"
        });

        if (!response.ok) {
            window.location.href = "/login.html";
            return;
        }

        const data = await response.json();

        if (data.user.role !== "bloodbank") {
            document.body.innerHTML =
                "<h2>Access denied. Blood Bank accounts only.</h2>";
            return;
        }

        document.getElementById("bankName").textContent =
            data.user.name;

        document.getElementById("bankEmail").textContent =
            data.user.email;

    } catch (error) {
        console.error("Session check failed:", error);
        window.location.href = "/login.html";
    }
}

// ==============================
// LOGOUT
// ==============================

document.getElementById("logoutButton").addEventListener("click", async () => {
    try {
        await fetch("/api/auth/logout", {
            method: "POST",
            credentials: "include"
        });

        window.location.href = "/login.html";

    } catch (error) {
        console.error("Logout failed:", error);
        alert("Unable to log out. Please try again.");
    }
});

// ==============================
// LOAD SESSION
// ==============================

loadBloodBankSession();
