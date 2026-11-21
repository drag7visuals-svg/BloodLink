
// ==============================
// BLOOD REQUEST MANAGEMENT
// ==============================

const requestTable = document.getElementById("requestTable");
const requestMessage = document.getElementById("requestMessage");
const refreshRequestsButton = document.getElementById("refreshRequestsButton");

let bloodRequests = [];
let processingRequest = false;

// ==============================
// LOAD REQUESTS
// ==============================

async function loadRequests() {
    requestTable.innerHTML = `
        <tr>
            <td colspan="10">Loading requests...</td>
        </tr>
    `;

    try {
        const response = await fetch("/api/requests", {
            method: "GET",
            credentials: "include"
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.message || "Unable to load requests."
            );
        }

        bloodRequests = data;

        displayRequests();

    } catch (error) {
        console.error("Load requests error:", error);

        requestTable.innerHTML = `
            <tr>
                <td colspan="10">Unable to load blood requests.</td>
            </tr>
        `;

        showRequestMessage(error.message, "error");
    }
}

// ==============================
// DISPLAY REQUESTS
// ==============================

function displayRequests() {
    if (bloodRequests.length === 0) {
        requestTable.innerHTML = `
            <tr>
                <td colspan="10">No hospital requests found.</td>
            </tr>
        `;
        return;
    }

    requestTable.innerHTML = bloodRequests.map(request => {

        const hospitalName = escapeRequestText(
            request.hospital?.name || "Unknown Hospital"
        );

        const hospitalEmail = escapeRequestText(
            request.hospital?.email || "N/A"
        );

        const message = escapeRequestText(
            request.message || "No message"
        );

        const status = escapeRequestText(
            request.status || "Unknown"
        );

        const requestDate = request.createdAt
            ? new Date(request.createdAt).toLocaleDateString()
            : "N/A";

        const safeRequestId = escapeRequestText(
            request.requestId
        );

        let actions = "-";

        if (request.status === "Pending") {
            actions = `
                <button
                    class="primary-button"
                    onclick="updateRequestStatus('${safeRequestId}', 'approve')"
                    ${processingRequest ? "disabled" : ""}
                >
                    Approve
                </button>

                <button
                    class="secondary-button"
                    onclick="updateRequestStatus('${safeRequestId}', 'reject')"
                    ${processingRequest ? "disabled" : ""}
                >
                    Reject
                </button>
            `;
        }

        return `
            <tr>
                <td>${safeRequestId}</td>

                <td>${hospitalName}</td>

                <td>${hospitalEmail}</td>

                <td>${escapeRequestText(request.bloodGroup)}</td>

                <td>${escapeRequestText(request.component)}</td>

                <td>${Number(request.quantity)}</td>

                <td>${message}</td>

                <td>${requestDate}</td>

                <td>
                    <span class="request-status ${getRequestStatusClass(request.status)}">
                        ${status}
                    </span>
                </td>

                <td>${actions}</td>
            </tr>
        `;

    }).join("");
}

// ==============================
// APPROVE OR REJECT REQUEST
// ==============================

async function updateRequestStatus(requestId, decision) {

    if (processingRequest) {
        return;
    }

    const action = decision === "approve"
        ? "approve"
        : "reject";

    const confirmed = confirm(
        `Are you sure you want to ${action} request ${requestId}?`
    );

    if (!confirmed) {
        return;
    }

    processingRequest = true;

    displayRequests();

    showRequestMessage(
        `Processing request ${requestId}...`,
        "info"
    );

    try {

        const response = await fetch(
            `/api/requests/${encodeURIComponent(requestId)}/decision`,
            {
                method: "PATCH",

                credentials: "include",

                headers: {
                    "Content-Type": "application/json"
                },

                body: JSON.stringify({
                    decision: decision
                })
            }
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.message || "Unable to update request."
            );
        }

        showRequestMessage(
            data.message || "Request updated successfully.",
            "success"
        );

        await loadRequests();

        // Refresh inventory after approval

        if (
            decision === "approve" &&
            typeof loadInventory === "function"
        ) {
            await loadInventory();
        }

    } catch (error) {

        console.error("Update request error:", error);

        showRequestMessage(
            error.message,
            "error"
        );

    } finally {

        processingRequest = false;

        displayRequests();
    }
}

// ==============================
// REQUEST STATUS STYLING
// ==============================

function getRequestStatusClass(status) {

    const statusClasses = {
        "Pending": "pending",
        "Processing": "pending",
        "Approved": "approved",
        "Reserved": "approved",
        "Rejected": "rejected",
        "Dispatched": "dispatched",
        "Received": "received",
        "Cancelled": "rejected"
    };

    return statusClasses[status] || "";
}

// ==============================
// REQUEST MESSAGE
// ==============================

function showRequestMessage(message, type) {

    requestMessage.textContent = message;

    requestMessage.className = "message " + type;
}

// ==============================
// ESCAPE HTML
// ==============================

function escapeRequestText(value) {

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
// REFRESH BUTTON
// ==============================

refreshRequestsButton.addEventListener(
    "click",
    loadRequests
);

// ==============================
// INITIAL LOAD
// ==============================

loadRequests();
