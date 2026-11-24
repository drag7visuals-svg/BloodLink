
"use strict";

// ==============================
// BLOOD BANK SESSION
// ==============================

async function loadBloodBankSession() {
    try {
        const response = await fetch("/api/auth/me", {
            method: "GET",
            credentials: "include"
        });

        if (response.status === 401) {
            window.location.replace("/login.html");
            return false;
        }

        let data;

        try {
            data = await response.json();
        } catch {
            throw new Error("Invalid server response.");
        }

        if (!response.ok || !data.user) {
            throw new Error("Unable to verify your session.");
        }

        if (data.user.role !== "bloodbank") {
            document.querySelector(".main-content").innerHTML =
                "<h2>Access denied. Blood Bank accounts only.</h2>";
            return false;
        }

        document.getElementById("bankName").textContent =
            data.user.name || "Blood Bank";

        document.getElementById("bankEmail").textContent =
            data.user.email || "";

        return true;

    } catch (error) {
        console.error("Session check failed:", error);

        window.location.replace("/login.html");
        return false;
    }
}


// ==============================
// LOGOUT
// ==============================

document.getElementById("logoutButton")
    .addEventListener("click", async () => {

        const logoutButton =
            document.getElementById("logoutButton");

        logoutButton.disabled = true;
        logoutButton.textContent = "Logging out...";

        try {
            const response = await fetch("/api/auth/logout", {
                method: "POST",
                credentials: "include"
            });

            if (!response.ok) {
                throw new Error("Logout failed.");
            }

            window.location.replace("/login.html");

        } catch (error) {
            console.error("Logout failed:", error);

            alert("Unable to log out. Please try again.");

            logoutButton.disabled = false;
            logoutButton.textContent = "Logout";
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
    if (!dateValue) {
        return null;
    }

    const expiryDate = new Date(dateValue);

    if (isNaN(expiryDate.getTime())) {
        return null;
    }

    const today = new Date();

    today.setHours(0, 0, 0, 0);
    expiryDate.setHours(0, 0, 0, 0);

    return Math.round(
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

        if (response.status === 401) {
            window.location.replace("/login.html");
            return;
        }

        let data;

        try {
            data = await response.json();
        } catch {
            throw new Error("Invalid expiry alerts response.");
        }

        if (!response.ok) {
            throw new Error(
                data.message || "Unable to load expiry alerts."
            );
        }

        if (
            !Array.isArray(data.expiringSoon) ||
            !Array.isArray(data.expired)
        ) {
            throw new Error("Invalid expiry alerts data.");
        }

        const expiringSoon = data.expiringSoon;
        const expired = data.expired;

        // UPDATE COUNTERS

        expiringSoonCount.textContent =
            expiringSoon.length;

        expiredAlertCount.textContent =
            expired.length;


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
                        <td>${escapeHTML(formatExpiryDate(unit.expiryDate))}</td>
                        <td>
                            ${daysRemaining === null
                                ? "Invalid date"
                                : `${daysRemaining} day(s)`
                            }
                        </td>
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
                        <td>${escapeHTML(formatExpiryDate(unit.expiryDate))}</td>
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

async function initializeBloodBankDashboard() {

    const authenticated = await loadBloodBankSession();

    if (!authenticated) {
        return;
    }

    await loadExpiryAlerts();
}

initializeBloodBankDashboard();
