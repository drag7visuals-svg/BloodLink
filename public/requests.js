
// ==============================
// BLOOD REQUEST MANAGEMENT
// BLOCKCHAIN + MONGODB
// ==============================

const requestTable = document.getElementById("requestTable");
const requestMessage = document.getElementById("requestMessage");
const refreshRequestsButton = document.getElementById("refreshRequestsButton");

let bloodRequests = [];
let processingRequest = false;

// Detect dashboard role
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
// HELPER FUNCTIONS
// ==============================

async function readRequestJson(response) {
    try {
        return await response.json();
    } catch {
        return {};
    }
}

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
        console.error(
            `Blockchain lookup failed for ${unitId}:`,
            error
        );

        throw new Error(
            `Unable to retrieve blood unit ${unitId} from blockchain.`
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
        console.log(
            `${unitId} already has blockchain status ${targetStatus}`
        );

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

    const receipt = await transaction.wait();

    if (!receipt || Number(receipt.status) !== 1) {
        throw new Error(
            `Blockchain transaction failed for ${unitId}.`
        );
    }

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
    if (!requestTable) {
        showRequestMessage(
            "Request table was not found on this page.",
            "error"
        );

        return;
    }

    const loadingRow = document.createElement("tr");
    const loadingCell = document.createElement("td");

    loadingCell.colSpan = 10;
    loadingCell.textContent = "Loading requests...";

    loadingRow.appendChild(loadingCell);

    requestTable.replaceChildren(loadingRow);

    try {
        const response = await fetch("/api/requests", {
            method: "GET",
            credentials: "include",
            headers: {
                "Accept": "application/json"
            }
        });

        const data = await readRequestJson(response);

        if (!response.ok) {
            throw new Error(
                data.message || "Unable to load requests."
            );
        }

        if (!Array.isArray(data)) {
            throw new Error("Invalid request response.");
        }

        bloodRequests = data;

        displayRequests();

    } catch (error) {
        console.error("Load requests error:", error);

        const errorRow = document.createElement("tr");
        const errorCell = document.createElement("td");

        errorCell.colSpan = 10;
        errorCell.textContent = "Unable to load blood requests.";

        errorRow.appendChild(errorCell);

        requestTable.replaceChildren(errorRow);

        showRequestMessage(error.message, "error");
    }
}

// ==============================
// CREATE TABLE CELL
// ==============================

function createRequestCell(value) {
    const cell = document.createElement("td");

    cell.textContent = value ?? "N/A";

    return cell;
}

// ==============================
// DISPLAY REQUESTS
// ==============================

function displayRequests() {
    if (!requestTable) return;

    requestTable.replaceChildren();

    if (bloodRequests.length === 0) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");

        cell.colSpan = 10;
        cell.textContent = "No hospital requests found.";

        row.appendChild(cell);
        requestTable.appendChild(row);

        return;
    }

    bloodRequests.forEach(request => {
        const row = document.createElement("tr");

        const hospitalName =
            request.hospital?.name || "Unknown Hospital";

        const hospitalEmail =
            request.hospital?.email || "N/A";

        const requestMessage =
            request.message || "No message";

        const requestStatus =
            request.status || "Unknown";

        const requestDate = request.createdAt
            ? new Date(request.createdAt).toLocaleDateString("en-IN")
            : "N/A";

        const quantity = Number(request.quantity);

        row.appendChild(
            createRequestCell(request.requestId)
        );

        row.appendChild(
            createRequestCell(hospitalName)
        );

        row.appendChild(
            createRequestCell(hospitalEmail)
        );

        row.appendChild(
            createRequestCell(request.bloodGroup)
        );

        row.appendChild(
            createRequestCell(request.component)
        );

        row.appendChild(
            createRequestCell(
                Number.isFinite(quantity) ? quantity : "N/A"
            )
        );

        row.appendChild(
            createRequestCell(requestMessage)
        );

        row.appendChild(
            createRequestCell(requestDate)
        );

        // Status cell
        const statusCell = document.createElement("td");
        const statusElement = document.createElement("span");

        statusElement.className =
            "request-status " +
            getRequestStatusClass(requestStatus);

        statusElement.textContent = requestStatus;

        statusCell.appendChild(statusElement);
        row.appendChild(statusCell);

        // Action cell
        const actionCell = document.createElement("td");

        if (
            currentRole === "bloodbank" &&
            request.status === "Pending"
        ) {
            const approveButton = document.createElement("button");

            approveButton.type = "button";
            approveButton.className = "primary-button";
            approveButton.textContent = "Approve";
            approveButton.disabled = processingRequest;

            approveButton.addEventListener("click", () => {
                updateRequestStatus(
                    request.requestId,
                    "approve"
                );
            });

            const rejectButton = document.createElement("button");

            rejectButton.type = "button";
            rejectButton.className = "secondary-button";
            rejectButton.textContent = "Reject";
            rejectButton.disabled = processingRequest;

            rejectButton.addEventListener("click", () => {
                updateRequestStatus(
                    request.requestId,
                    "reject"
                );
            });

            actionCell.appendChild(approveButton);
            actionCell.appendChild(rejectButton);

        } else if (
            currentRole === "bloodbank" &&
            request.status === "Approved"
        ) {
            const dispatchButton = document.createElement("button");

            dispatchButton.type = "button";
            dispatchButton.className = "primary-button";
            dispatchButton.textContent = "Dispatch Units";
            dispatchButton.disabled = processingRequest;

            dispatchButton.addEventListener("click", () => {
                processRequestAction(
                    request.requestId,
                    "dispatch"
                );
            });

            actionCell.appendChild(dispatchButton);
        }

        // Hospital receipt confirmation is handled by hospital.js.
        // Do not create a nonfunctional receipt button here.

        if (!actionCell.hasChildNodes()) {
            actionCell.textContent = "-";
        }

        row.appendChild(actionCell);

        requestTable.appendChild(row);
    });
}

// ==============================
// APPROVE OR REJECT REQUEST
// ==============================

async function updateRequestStatus(requestId, decision) {
    if (processingRequest) {
        return;
    }

    if (
        currentRole !== "bloodbank" ||
        !["approve", "reject"].includes(decision)
    ) {
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

        const data = await readRequestJson(response);

        if (!response.ok) {
            throw new Error(
                data.message || "Unable to update request."
            );
        }

        // Synchronize reservation after MongoDB approval
        if (decision === "approve") {
            if (!data.request) {
                throw new Error(
                    "Request was approved in MongoDB, but allocated unit details were not returned. Refresh and check the request before dispatching."
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

        await loadRequests();

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
        throw new Error(
            "Request not found. Refresh requests and try again."
        );
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

    const data = await readRequestJson(response);

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
// PROCESS DISPATCH ACTION
// ==============================

async function processRequestAction(requestId, action) {
    if (processingRequest) {
        return;
    }

    if (
        currentRole !== "bloodbank" ||
        action !== "dispatch"
    ) {
        return;
    }

    const confirmationMessage =
        `Dispatch the allocated units for ${requestId}? This requires blockchain transactions.`;

    if (!confirm(confirmationMessage)) {
        return;
    }

    processingRequest = true;
    displayRequests();

    showRequestMessage(
        "Preparing blockchain dispatch...",
        "info"
    );

    try {
        const data = await dispatchRequest(requestId);

        showRequestMessage(
            data.message || "Request dispatched successfully.",
            "success"
        );

        await loadRequests();

        if (typeof loadInventory === "function") {
            await loadInventory();
        }

    } catch (error) {
        console.error("Request dispatch error:", error);

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

function showRequestMessage(message, type = "") {
    if (!requestMessage) {
        return;
    }

    requestMessage.textContent = message;

    requestMessage.className = type
        ? "message " + type
        : "message";
}

// ==============================
// REFRESH BUTTON
// ==============================

if (refreshRequestsButton) {
    refreshRequestsButton.addEventListener(
        "click",
        loadRequests
    );
}

// ==============================
// INITIAL LOAD
// ==============================

loadRequests();
