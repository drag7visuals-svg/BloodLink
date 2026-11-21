
// ==============================
// BLOOD REQUEST MANAGEMENT
// BLOCKCHAIN + MONGODB
// ==============================

const requestTable = document.getElementById("requestTable");
const requestMessage = document.getElementById("requestMessage");
const refreshRequestsButton = document.getElementById("refreshRequestsButton");

let bloodRequests = [];
let processingRequest = false;

// Detect dashboard role (case-insensitive)
const currentPage = window.location.pathname.toLowerCase();

const currentRole = currentPage.includes("bloodbank")
    ? "bloodbank"
    : currentPage.includes("hospital")
        ? "hospital"
        : "admin";

// Solidity status values
const REQUEST_CHAIN_STATUS = {
    Available: 2,
    Reserved: 3,
    Dispatched: 4,
    Received: 5
};

// ==============================
// ENSURE AUTHORIZED BANK WALLET
// ==============================

async function ensureBankWallet() {
    if (typeof window.ethereum === "undefined") {
        throw new Error("Please install MetaMask.");
    }

    if (typeof ethers === "undefined") {
        throw new Error("Ethers.js could not load.");
    }

    // Reuse the existing app.js connection
    if (
        typeof bloodLinkContract === "undefined" ||
        !bloodLinkContract
    ) {
        if (typeof connectWallet !== "function") {
            throw new Error("Blockchain connection is unavailable.");
        }

        await connectWallet();
    }

    if (
        typeof bloodLinkContract === "undefined" ||
        !bloodLinkContract
    ) {
        throw new Error("Please connect your MetaMask wallet first.");
    }

    const chainId = await window.ethereum.request({
        method: "eth_chainId"
    });

    if (parseInt(chainId, 16) !== 11155111) {
        throw new Error("Please select Sepolia in MetaMask.");
    }

    const address = await bloodLinkContract.runner.getAddress();

    const authorized = await bloodLinkContract.authorizedBanks(address);

    if (!authorized) {
        throw new Error(
            "This wallet is not an authorized Blood Bank."
        );
    }

    return bloodLinkContract;
}

// ==============================
// READ BLOCKCHAIN STATUS
// ==============================

async function getChainUnitStatus(contract, unitId) {
    try {
        const result = await contract.getBloodUnit(unitId);
        return Number(result[1]);

    } catch (error) {
        throw new Error(
            `Blood unit ${unitId} was not found on blockchain.`
        );
    }
}

// ==============================
// UPDATE ONE UNIT ON BLOCKCHAIN
// ==============================

async function updateChainUnit(
    contract,
    unitId,
    expectedStatus,
    targetStatus
) {
    const currentStatus = await getChainUnitStatus(
        contract,
        unitId
    );

    // Transaction already completed earlier
    if (currentStatus === targetStatus) {
        console.log(`${unitId} already has blockchain status ${targetStatus}`);
        return;
    }

    if (currentStatus !== expectedStatus) {
        throw new Error(
            `Unit ${unitId} has blockchain status ${currentStatus}, ` +
            `but status ${expectedStatus} was expected.`
        );
    }

    const transaction = await contract.updateStatus(
        unitId,
        targetStatus
    );

    showRequestMessage(
        `Waiting for blockchain confirmation for ${unitId}...`,
        "info"
    );

    await transaction.wait();

    console.log(
        `Blockchain updated: ${unitId} -> ${targetStatus}`
    );
}

// ==============================
// GET ALLOCATED UNIT IDS
// ==============================

function getAllocatedUnitIds(request) {
    if (
        !request ||
        !Array.isArray(request.allocatedUnits) ||
        request.allocatedUnits.length !== Number(request.quantity)
    ) {
        throw new Error(
            "Allocated blood unit details are missing or incomplete."
        );
    }

    return request.allocatedUnits.map(unit => {
        if (!unit || typeof unit.unitId !== "string") {
            throw new Error(
                "Allocated unit details were not populated correctly."
            );
        }

        return unit.unitId;
    });
}

// ==============================
// SYNCHRONIZE RESERVED UNITS
// AVAILABLE -> RESERVED
// ==============================

async function synchronizeReservation(request) {
    const contract = await ensureBankWallet();

    const unitIds = getAllocatedUnitIds(request);

    for (const unitId of unitIds) {
        await updateChainUnit(
            contract,
            unitId,
            REQUEST_CHAIN_STATUS.Available,
            REQUEST_CHAIN_STATUS.Reserved
        );
    }
}

// ==============================
// SYNCHRONIZE DISPATCH
// RESERVED -> DISPATCHED
// ==============================

async function synchronizeDispatch(request) {
    const contract = await ensureBankWallet();

    const unitIds = getAllocatedUnitIds(request);

    for (const unitId of unitIds) {
        let currentStatus = await getChainUnitStatus(
            contract,
            unitId
        );

        // Recover if reservation was only partially synchronized
        if (currentStatus === REQUEST_CHAIN_STATUS.Available) {
            await updateChainUnit(
                contract,
                unitId,
                REQUEST_CHAIN_STATUS.Available,
                REQUEST_CHAIN_STATUS.Reserved
            );

            currentStatus = REQUEST_CHAIN_STATUS.Reserved;
        }

        if (currentStatus === REQUEST_CHAIN_STATUS.Reserved) {
            await updateChainUnit(
                contract,
                unitId,
                REQUEST_CHAIN_STATUS.Reserved,
                REQUEST_CHAIN_STATUS.Dispatched
            );

            continue;
        }

        // Already dispatched: do not spend ETH again
        if (currentStatus === REQUEST_CHAIN_STATUS.Dispatched) {
            continue;
        }

        throw new Error(
            `Cannot dispatch ${unitId}. Unexpected blockchain status: ${currentStatus}.`
        );
    }
}

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

        if (
            currentRole === "bloodbank" &&
            request.status === "Pending"
        ) {
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

        else if (
            currentRole === "bloodbank" &&
            request.status === "Approved"
        ) {
            actions = `
                <button
                    class="primary-button"
                    onclick="processRequestAction('${safeRequestId}', 'dispatch')"
                    ${processingRequest ? "disabled" : ""}
                >
                    Dispatch Units
                </button>
            `;
        }

        else if (
            currentRole === "hospital" &&
            request.status === "Dispatched"
        ) {
            actions = `
                <button
                    class="primary-button"
                    onclick="processRequestAction('${safeRequestId}', 'receive')"
                    ${processingRequest ? "disabled" : ""}
                >
                    Confirm Receipt
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

    if (!confirm(
        `Are you sure you want to ${action} request ${requestId}?`
    )) {
        return;
    }

    processingRequest = true;
    displayRequests();

    showRequestMessage(
        `Processing request ${requestId}...`,
        "info"
    );

    try {

        // Check wallet before approving in MongoDB
        if (decision === "approve") {
            await ensureBankWallet();
        }

        const response = await fetch(
            `/api/requests/${encodeURIComponent(requestId)}/decision`,
            {
                method: "PATCH",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    decision
                })
            }
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.message || "Unable to update request."
            );
        }

        // Synchronize reservation after MongoDB approval
        if (decision === "approve") {

            if (!data.request) {
                throw new Error(
                    "Request was approved in MongoDB, but allocated unit details were not returned. Refresh and retry dispatch."
                );
            }

            try {
                await synchronizeReservation(data.request);

                showRequestMessage(
                    "Request approved. All allocated units are reserved in MongoDB and blockchain.",
                    "success"
                );

            } catch (blockchainError) {

                console.error(
                    "Reservation blockchain synchronization error:",
                    blockchainError
                );

                showRequestMessage(
                    "Request approved in MongoDB, but blockchain reservation is incomplete. Do not dispatch yet. " +
                    blockchainError.message,
                    "error"
                );
            }

        } else {

            showRequestMessage(
                data.message || "Request rejected successfully.",
                "success"
            );
        }

        await loadRequests();

        if (
            decision === "approve" &&
            typeof loadInventory === "function"
        ) {
            await loadInventory();
        }

    } catch (error) {

        console.error("Update request error:", error);

        showRequestMessage(error.message, "error");

    } finally {

        processingRequest = false;
        displayRequests();
    }
}

// ==============================
// DISPATCH REQUEST
// BLOCKCHAIN FIRST, THEN MONGODB
// ==============================

async function dispatchRequest(requestId) {

    const request = bloodRequests.find(
        item => item.requestId === requestId
    );

    if (!request) {
        throw new Error("Request not found. Refresh requests and try again.");
    }

    // First synchronize all units on blockchain
    await synchronizeDispatch(request);

    // Update MongoDB only after all blockchain transactions succeed
    const response = await fetch(
        `/api/requests/${encodeURIComponent(requestId)}/dispatch`,
        {
            method: "PATCH",
            credentials: "include"
        }
    );

    const data = await response.json();

    if (!response.ok) {
        throw new Error(
            "Blockchain dispatch completed, but MongoDB update failed: " +
            (data.message || "Unknown error") +
            ". Refresh and retry; completed blockchain transactions will be skipped."
        );
    }

    return data;
}

// ==============================
// DISPATCH OR CONFIRM RECEIPT
// ==============================

async function processRequestAction(requestId, action) {

    if (processingRequest) {
        return;
    }

    const isDispatch = action === "dispatch";

    if (!["dispatch", "receive"].includes(action)) {
        return;
    }

    const confirmationMessage = isDispatch
        ? `Dispatch the allocated units for ${requestId}? This requires blockchain transactions.`
        : `Confirm that your hospital has received the blood units for ${requestId}? This requires blockchain transactions.`;

    if (!confirm(confirmationMessage)) {
        return;
    }

    processingRequest = true;
    displayRequests();

    showRequestMessage(
        isDispatch
            ? "Preparing blockchain dispatch..."
            : "Confirming blood receipt...",
        "info"
    );

    try {

        let data;

        if (isDispatch) {

            data = await dispatchRequest(requestId);

        } else {

            // Hospital receipt is handled separately by hospital.js.
            throw new Error(
                "Hospital receipt must be processed from the Hospital dashboard."
            );
        }

        showRequestMessage(
            data.message || "Request updated successfully.",
            "success"
        );

        await loadRequests();

        if (
            isDispatch &&
            typeof loadInventory === "function"
        ) {
            await loadInventory();
        }

    } catch (error) {

        console.error("Request action error:", error);

        showRequestMessage(error.message, "error");

        await loadRequests();

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

    if (!requestMessage) {
        return;
    }

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
