
// ==============================
// DONOR DASHBOARD ELEMENTS
// ==============================

const donorName = document.getElementById("donorName");
const donorFullName = document.getElementById("donorFullName");
const donorEmail = document.getElementById("donorEmail");

const donorMessage = document.getElementById("donorMessage");
const donationMessage = document.getElementById("donationMessage");

const donationTable = document.getElementById("donationTable");

const totalDonations = document.getElementById("totalDonations");
const totalUnits = document.getElementById("totalUnits");

const themeToggle = document.getElementById("themeToggle");

const logoutButtons = [
    document.getElementById("sidebarLogoutButton"),
    document.getElementById("mainLogoutButton")
].filter(Boolean);


// ==============================
// LIGHT / DARK MODE
// ==============================

function updateThemeButton() {
    const currentTheme =
        document.documentElement.getAttribute("data-theme");

    themeToggle.textContent =
        currentTheme === "dark" ? "Light Mode" : "Dark Mode";
}

function loadTheme() {
    const savedTheme = localStorage.getItem("donorTheme");

    const theme =
        savedTheme === "dark" ? "dark" : "light";

    document.documentElement.setAttribute(
        "data-theme",
        theme
    );

    updateThemeButton();
}

function toggleTheme() {
    const currentTheme =
        document.documentElement.getAttribute("data-theme");

    const newTheme =
        currentTheme === "dark" ? "light" : "dark";

    document.documentElement.setAttribute(
        "data-theme",
        newTheme
    );

    localStorage.setItem("donorTheme", newTheme);

    updateThemeButton();
}

themeToggle.addEventListener("click", toggleTheme);


// ==============================
// LOAD DONOR PROFILE
// ==============================

async function loadDonorProfile() {
    try {
        const response = await fetch("/api/auth/me", {
            method: "GET",
            credentials: "include"
        });

        let data;

        try {
            data = await response.json();
        } catch {
            throw new Error("Invalid server response.");
        }

        if (!response.ok || !data.user) {
            window.location.replace("/login.html");
            return;
        }

        if (data.user.role !== "donor") {
            window.location.replace("/login.html");
            return;
        }

        donorName.textContent = data.user.name || "Donor";
        donorFullName.textContent = data.user.name || "-";
        donorEmail.textContent = data.user.email || "-";

        const accountStatus =
            document.querySelector(".account-status");

        if (accountStatus) {
            accountStatus.replaceChildren();

            const statusDot = document.createElement("span");
            statusDot.className = "status-dot";

            const isActive = data.user.isActive === true;

            accountStatus.appendChild(statusDot);
            accountStatus.appendChild(
                document.createTextNode(
                    isActive ? "Active" : "Inactive"
                )
            );

            accountStatus.style.color =
                isActive ? "var(--success)" : "var(--primary)";
        }

        await loadDonationHistory();

    } catch (error) {
        console.error("Donor profile error:", error);

        donorMessage.textContent =
            "Unable to load donor profile. Please refresh the page.";
    }
}


// ==============================
// FORMAT DATE
// ==============================

function formatDonationDate(date) {
    if (!date) {
        return "-";
    }

    const formattedDate = new Date(date);

    if (isNaN(formattedDate.getTime())) {
        return "-";
    }

    return formattedDate.toLocaleDateString("en-IN");
}


// ==============================
// LOAD DONATION HISTORY
// ==============================

async function loadDonationHistory() {
    try {
        donationTable.innerHTML = `
            <tr>
                <td colspan="5" class="donor-empty-state">
                    Loading donation history...
                </td>
            </tr>
        `;

        donationMessage.textContent =
            "Loading donation history...";

        const response = await fetch("/api/donor/donations", {
            method: "GET",
            credentials: "include"
        });

        let donations;

        try {
            donations = await response.json();
        } catch {
            throw new Error("Invalid donation history response.");
        }

        if (!response.ok) {
            throw new Error(
                donations.message ||
                "Unable to load donation history."
            );
        }

        if (!Array.isArray(donations)) {
            throw new Error(
                "Invalid donation history response."
            );
        }

        // UPDATE STATISTICS

        totalDonations.textContent = donations.length;
        totalUnits.textContent = donations.length;

        donationTable.innerHTML = "";

        // NO DONATION RECORDS

        if (donations.length === 0) {
            donationMessage.textContent =
                "No donation records available yet.";

            donationTable.innerHTML = `
                <tr>
                    <td colspan="5" class="donor-empty-state">
                        No donation records found.
                    </td>
                </tr>
            `;

            return;
        }

        // DONATION RECORDS FOUND

        donationMessage.textContent =
            `${donations.length} donation record(s) found.`;

        donations.forEach(donation => {
            const row = document.createElement("tr");

            const values = [
                donation.unitId,
                donation.bloodGroup,
                donation.component,
                formatDonationDate(donation.collectionDate),
                donation.status
            ];

            values.forEach(value => {
                const cell = document.createElement("td");

                cell.textContent = value ?? "-";

                row.appendChild(cell);
            });

            donationTable.appendChild(row);
        });

    } catch (error) {
        console.error("Donation history error:", error);

        donationMessage.textContent =
            "Unable to load donation history.";

        donationTable.innerHTML = `
            <tr>
                <td colspan="5" class="donor-empty-state">
                    Unable to load donation history.
                </td>
            </tr>
        `;
    }
}


// ==============================
// DONOR LOGOUT
// ==============================

async function logoutDonor() {
    logoutButtons.forEach(button => {
        button.disabled = true;
        button.textContent = "Logging out...";
    });

    try {
        const response = await fetch("/api/auth/logout", {
            method: "POST",
            credentials: "include"
        });

        if (!response.ok) {
            throw new Error("Logout failed. Please try again.");
        }

        window.location.replace("/login.html");

    } catch (error) {
        console.error("Donor logout error:", error);

        donorMessage.textContent =
            error.message || "Unable to log out.";

        logoutButtons.forEach(button => {
            button.disabled = false;
            button.textContent = "Log Out";
        });
    }
}

logoutButtons.forEach(button => {
    button.addEventListener("click", logoutDonor);
});


// ==============================
// INITIALIZE DASHBOARD
// ==============================

loadTheme();
loadDonorProfile();
