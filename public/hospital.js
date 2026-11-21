
 // ==============================
 // ELEMENTS
 // ==============================

const hospitalName = document.getElementById("hospitalName");
const hospitalEmail = document.getElementById("hospitalEmail");

const bloodBankSelect = document.getElementById("bloodBank");

const requestForm = document.getElementById("requestForm");
const submitRequestButton = document.getElementById("submitRequest");

const requestFormMessage = document.getElementById("requestFormMessage");
const historyMessage = document.getElementById("historyMessage");

const requestTable = document.getElementById("hospitalRequestTable");

const refreshRequestsButton = document.getElementById("refreshRequests");
const logoutButton = document.getElementById("logoutButton");
const themeToggle = document.getElementById("themeToggle");

let hospitalRequests = [];
let processingRequest = false;

// ==============================
// LOAD HOSPITAL SESSION
// ==============================

async function loadHospitalSession() {
    try {
        const response = await fetch("/api/auth/me", {
            credentials: "include"
        });

        if (!response.ok) {
            window.location.href = "/login.html";
            return;
        }

        const data = await response.json();

        if (data.user.role !== "hospital") {
            document.body.innerHTML = `
                <h2>Access denied. Hospital accounts only.</h2>
            `;
            return;
        }

        hospitalName.textContent = data.user.name;
        hospitalEmail.textContent = data.user.email;

        await loadBloodBanks();
        await loadHospitalRequests();

    } catch (error) {
        console.error("Hospital session error:", error);
        window.location.href = "/login.html";
    }
}

// ==============================
// LOAD ACTIVE BLOOD BANKS
// ==============================

async function loadBloodBanks() {
    bloodBankSelect.innerHTML = `
        <option value="">Loading Blood Banks...</option>
    `;

    try {
        const response = await fetch("/api/auth/bloodbanks", {
            credentials: "include"
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.message || "Unable to load Blood Banks."
            );
        }

        if (!data.bloodBanks || data.bloodBanks.length === 0) {
            bloodBankSelect.innerHTML = `
                <option value="">No active Blood Banks available</option>
            `;
            return;
        }

        bloodBankSelect.innerHTML = `
            <option value="">Select Blood Bank</option>
        `;

        data.bloodBanks.forEach(bank => {
            const option = document.createElement("option");

            option.value = bank._id;
            option.textContent = `${bank.name} (${bank.email})`;

            bloodBankSelect.appendChild(option);
        });

    } catch (error) {
        console.error("Load Blood Banks error:", error);

        bloodBankSelect.innerHTML = `
            <option value="">Unable to load Blood Banks</option>
        `;

        showFormMessage(error.message, "error");
    }
}

// ==============================
// SUBMIT BLOOD REQUEST
// ==============================

requestForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const bloodBankId = bloodBankSelect.value;

    const bloodGroup = document.getElementById(
        "requestBloodGroup"
    ).value;

    const component = document.getElementById(
        "requestComponent"
    ).value;

    const quantity = Number(
        document.getElementById("requestQuantity").value
    );

    const message = document.getElementById(
        "requestMessage"
    ).value.trim();

    if (!bloodBankId || !bloodGroup || !component) {
        showFormMessage(
            "Please complete all required fields.",
            "error"
        );
        return;
    }

    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) {
        showFormMessage(
            "Quantity must be between 1 and 100.",
            "error"
        );
        return;
    }

    submitRequestButton.disabled = true;
    submitRequestButton.textContent = "Submitting...";

    showFormMessage("Submitting your request...", "info");

    try {
        const response = await fetch("/api/requests", {
            method: "POST",
            credentials: "include",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                bloodBankId,
                bloodGroup,
                component,
                quantity,
                message
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.message || "Unable to submit request."
            );
        }

        showFormMessage(
            data.message || "Blood request submitted successfully.",
            "success"
        );

        requestForm.reset();

        await loadHospitalRequests();

    } catch (error) {
        console.error("Submit request error:", error);

        showFormMessage(error.message, "error");

    } finally {
        submitRequestButton.disabled = false;
        submitRequestButton.textContent = "Submit Blood Request";
    }
});

// ==============================
// LOAD HOSPITAL REQUEST HISTORY
// ==============================

async function loadHospitalRequests() {
    requestTable.innerHTML = `
        <tr>
            <td colspan="8">Loading requests...</td>
        </tr>
    `;

    try {
        const response = await fetch("/api/requests", {
            credentials: "include"
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.message || "Unable to load requests."
            );
        }

        hospitalRequests = data;

        displayHospitalRequests();
        updateRequestStatistics();

    } catch (error) {
        console.error("Load requests error:", error);

        requestTable.innerHTML = `
            <tr>
                <td colspan="8">Unable to load requests.</td>
            </tr>
        `;

        historyMessage.textContent = error.message;
        historyMessage.className = "message error";
    }
}

// ==============================
// DISPLAY REQUEST HISTORY
// ==============================

function displayHospitalRequests() {
    if (hospitalRequests.length === 0) {
        requestTable.innerHTML = `
            <tr>
                <td colspan="8">You have not submitted any requests.</td>
            </tr>
        `;
        return;
    }

    requestTable.innerHTML = hospitalRequests.map(request => {

        const requestDate = request.createdAt
            ? new Date(request.createdAt).toLocaleDateString()
            : "N/A";

        let actions = "-";

        if (request.status === "Dispatched") {
            actions = `
                <button
                    class="primary-button"
                    onclick="confirmBloodReceipt('${escapeHTML(request.requestId)}')"
                    ${processingRequest ? "disabled" : ""}
                >
                    Confirm Receipt
                </button>
            `;
        }

        return `
            <tr>
                <td>${escapeHTML(request.requestId)}</td>

                <td>${escapeHTML(
                    request.bloodBank?.name || "Unknown Blood Bank"
                )}</td>

                <td>${escapeHTML(request.bloodGroup)}</td>

                <td>${escapeHTML(request.component)}</td>

                <td>${Number(request.quantity)}</td>

                <td>${requestDate}</td>

                <td>
                    <span class="request-status ${getStatusClass(request.status)}">
                        ${escapeHTML(request.status)}
                    </span>
                </td>

                <td>${actions}</td>
            </tr>
        `;
    }).join("");
}

// ==============================
// CONFIRM BLOOD RECEIPT
// ==============================

async function confirmBloodReceipt(requestId) {

    if (processingRequest) {
        return;
    }

    const confirmed = confirm(
        `Confirm that your hospital has received the blood units for ${requestId}?`
    );

    if (!confirmed) {
        return;
    }

    processingRequest = true;

    displayHospitalRequests();

    historyMessage.textContent = "Confirming blood receipt...";
    historyMessage.className = "message info";

    try {

        const response = await fetch(
            `/api/requests/${encodeURIComponent(requestId)}/receive`,
            {
                method: "PATCH",
                credentials: "include"
            }
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.message || "Unable to confirm receipt."
            );
        }

        historyMessage.textContent =
            data.message || "Blood receipt confirmed successfully.";

        historyMessage.className = "message success";

        await loadHospitalRequests();

    } catch (error) {

        console.error("Confirm receipt error:", error);

        historyMessage.textContent = error.message;
        historyMessage.className = "message error";

    } finally {

        processingRequest = false;

        displayHospitalRequests();
    }
}

// ==============================
// UPDATE REQUEST STATISTICS
// ==============================

function updateRequestStatistics() {
    document.getElementById("totalRequests").textContent =
        hospitalRequests.length;

    document.getElementById("pendingRequests").textContent =
        hospitalRequests.filter(
            request => request.status === "Pending"
        ).length;

    document.getElementById("approvedRequests").textContent =
        hospitalRequests.filter(
            request => request.status === "Approved" ||
                       request.status === "Reserved"
        ).length;

    document.getElementById("rejectedRequests").textContent =
        hospitalRequests.filter(
            request => request.status === "Rejected"
        ).length;
}

// ==============================
// REQUEST STATUS STYLING
// ==============================

function getStatusClass(status) {
    const classes = {
        "Pending": "pending",
        "Approved": "approved",
        "Reserved": "approved",
        "Rejected": "rejected",
        "Dispatched": "dispatched",
        "Received": "received",
        "Cancelled": "rejected"
    };

    return classes[status] || "";
}

// ==============================
// ESCAPE HTML
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
// FORM MESSAGE
// ==============================

function showFormMessage(message, type) {
    requestFormMessage.textContent = message;
    requestFormMessage.className = "message " + type;
}

// ==============================
// REFRESH REQUESTS
// ==============================

refreshRequestsButton.addEventListener(
    "click",
    loadHospitalRequests
);

// ==============================
// LOGOUT
// ==============================

logoutButton.addEventListener("click", async () => {
    try {
        await fetch("/api/auth/logout", {
            method: "POST",
            credentials: "include"
        });

        window.location.href = "/login.html";

    } catch (error) {
        console.error("Logout error:", error);
    }
});

// ==============================
// DARK MODE
// ==============================

themeToggle.addEventListener("click", () => {
    document.body.classList.toggle("dark");

    const isDark = document.body.classList.contains("dark");

    themeToggle.textContent = isDark
        ? "Light Mode"
        : "Dark Mode";
});

// ==============================
// INITIALIZE DASHBOARD
// ==============================

loadHospitalSession();
