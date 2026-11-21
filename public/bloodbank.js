
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
// HTML ESCAPING
// ==============================

function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => {
        const entities = {
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;"
        };

        return entities[character];
    });
}

// ==============================
// FORMAT DATE
// ==============================

function formatExpiryDate(dateValue) {
    if (!dateValue) {
        return "Not available";
    }

    const date = new Date(dateValue);

    if (isNaN(date.getTime())) {
        return "Invalid date";
    }

    return date.toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    });
}

// ==============================
// CALCULATE DAYS REMAINING
// ==============================

function getDaysRemaining(dateValue) {
    const expiryDate = new Date(dateValue);

    const today = new Date();

    today.setHours(0, 0, 0, 0);
    expiryDate.setHours(0, 0, 0, 0);

    return Math.ceil(
        (expiryDate - today) / (1000 * 60 * 60 * 24)
    );
}

// ==============================
// LOAD EXPIRY ALERTS
// ==============================

async function loadExpiryAlerts() {

    const expiringSoonTable =
        document.getElementById("expiringSoonTable");

    const expiredAlertTable =
        document.getElementById("expiredAlertTable");

    const expiringSoonMessage =
        document.getElementById("expiringSoonMessage");

    const expiredAlertMessage =
        document.getElementById("expiredAlertMessage");

    const expiringSoonCount =
        document.getElementById("expiringSoonCount");

    const expiredAlertCount =
        document.getElementById("expiredAlertCount");

    expiringSoonTable.innerHTML =
        '<tr><td colspan="5">Loading expiry alerts...</td></tr>';

    expiredAlertTable.innerHTML =
        '<tr><td colspan="5">Loading expired units...</td></tr>';

    expiringSoonMessage.textContent = "";
    expiredAlertMessage.textContent = "";

    try {

        const response = await fetch("/api/expiry-alerts", {
            method: "GET",
            credentials: "include"
        });

        if (!response.ok) {

            if (response.status === 401) {
                window.location.href = "/login.html";
                return;
            }

            throw new Error("Unable to load expiry alerts.");
        }

        const data = await response.json();

        const expiringSoon = data.expiringSoon || [];
        const expired = data.expired || [];

        // Update counters

        expiringSoonCount.textContent =
            data.summary?.expiringSoon ?? expiringSoon.length;

        expiredAlertCount.textContent =
            data.summary?.expired ?? expired.length;

        // ==============================
        // DISPLAY EXPIRING SOON UNITS
        // ==============================

        if (expiringSoon.length === 0) {

            expiringSoonTable.innerHTML = `
                <tr>
                    <td colspan="5">
                        No blood units expiring within the next 7 days.
                    </td>
                </tr>
            `;

        } else {

            expiringSoonTable.innerHTML = expiringSoon.map(unit => {

                const daysRemaining =
                    getDaysRemaining(unit.expiryDate);

                return `
                    <tr>
                        <td>${escapeHTML(unit.unitId)}</td>
                        <td>${escapeHTML(unit.bloodGroup)}</td>
                        <td>${escapeHTML(unit.component)}</td>
                        <td>${formatExpiryDate(unit.expiryDate)}</td>
                        <td>${daysRemaining} day(s)</td>
                    </tr>
                `;

            }).join("");
        }

        // ==============================
        // DISPLAY EXPIRED UNITS
        // ==============================

        if (expired.length === 0) {

            expiredAlertTable.innerHTML = `
                <tr>
                    <td colspan="5">
                        No expired blood units found.
                    </td>
                </tr>
            `;

        } else {

            expiredAlertTable.innerHTML = expired.map(unit => {

                return `
                    <tr>
                        <td>${escapeHTML(unit.unitId)}</td>
                        <td>${escapeHTML(unit.bloodGroup)}</td>
                        <td>${escapeHTML(unit.component)}</td>
                        <td>${formatExpiryDate(unit.expiryDate)}</td>
                        <td>${escapeHTML(unit.status)}</td>
                    </tr>
                `;

            }).join("");
        }

    } catch (error) {

        console.error("Expiry alerts error:", error);

        expiringSoonTable.innerHTML = `
            <tr>
                <td colspan="5">Unable to load expiry alerts.</td>
            </tr>
        `;

        expiredAlertTable.innerHTML = `
            <tr>
                <td colspan="5">Unable to load expired units.</td>
            </tr>
        `;

        expiringSoonMessage.textContent =
            "Please refresh or try again later.";

        expiredAlertMessage.textContent =
            "Unable to retrieve expiry information.";
    }
}

// ==============================
// REFRESH EXPIRY ALERTS
// ==============================

document.getElementById("refreshExpiryButton")
    .addEventListener("click", loadExpiryAlerts);

// ==============================
// INITIALIZE DASHBOARD
// ==============================

loadBloodBankSession();
loadExpiryAlerts();
