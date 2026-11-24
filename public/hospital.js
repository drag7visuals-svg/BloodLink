
// ==============================
// HOSPITAL DASHBOARD
// ==============================

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
let loadingRequests = false;

// ==============================
// HELPERS
// ==============================

async function readJson(response) {
    try {
        return await response.json();
    } catch {
        return {};
    }
}

function showFormMessage(message, type = "") {
    if (!requestFormMessage) return;

    requestFormMessage.textContent = message;
    requestFormMessage.className = type
        ? "message " + type
        : "message";
}

function showHistoryMessage(message, type = "") {
    if (!historyMessage) return;

    historyMessage.textContent = message;
    historyMessage.className = type
        ? "message " + type
        : "message";
}

function createCell(value) {
    const cell = document.createElement("td");

    cell.textContent =
        value === null || value === undefined || value === ""
            ? "N/A"
            : String(value);

    return cell;
}

function redirectToLogin() {
    window.location.replace("/login.html");
}

function isValidRequestId(requestId) {
    return (
        typeof requestId === "string" &&
        requestId.trim().length > 0 &&
        requestId.length <= 100
    );
}

// ==============================
// LOAD HOSPITAL SESSION
// ==============================

async function loadHospitalSession() {
    try {
        const response = await fetch("/api/auth/me", {
            credentials: "include",
            headers: {
                "Accept": "application/json"
            }
        });

        const data = await readJson(response);

        if (response.status === 401 || !response.ok || !data.user) {
            redirectToLogin();
            return;
        }

        if (data.user.role !== "hospital") {
            document.body.textContent =
                "Access denied. Hospital accounts only.";
            return;
        }

        if (data.user.isActive === false) {
            redirectToLogin();
            return;
        }

        if (hospitalName) {
            hospitalName.textContent = data.user.name || "Hospital";
        }

        if (hospitalEmail) {
            hospitalEmail.textContent = data.user.email || "";
        }

        await Promise.all([
            loadBloodBanks(),
            loadHospitalRequests()
        ]);

    } catch (error) {
        console.error("Hospital session error:", error);

        showFormMessage(
            "Unable to verify your session. Please log in again.",
            "error"
        );

        redirectToLogin();
    }
}

// ==============================
// LOAD ACTIVE BLOOD BANKS
// ==============================

async function loadBloodBanks() {
    if (!bloodBankSelect) return;

    bloodBankSelect.replaceChildren();

    const loadingOption = document.createElement("option");
    loadingOption.value = "";
    loadingOption.textContent = "Loading Blood Banks...";

    bloodBankSelect.appendChild(loadingOption);

    try {
        const response = await fetch("/api/auth/bloodbanks", {
            credentials: "include",
            headers: {
                "Accept": "application/json"
            }
        });

        const data = await readJson(response);

        if (response.status === 401) {
            redirectToLogin();
            return;
        }

        if (!response.ok) {
            throw new Error(
                data.message || "Unable to load Blood Banks."
            );
        }

        if (
            !Array.isArray(data.bloodBanks) ||
            data.bloodBanks.length === 0
        ) {
            bloodBankSelect.replaceChildren();

            const option = document.createElement("option");
            option.value = "";
            option.textContent = "No active Blood Banks available";

            bloodBankSelect.appendChild(option);
            return;
        }

        bloodBankSelect.replaceChildren();

        const defaultOption = document.createElement("option");
        defaultOption.value = "";
        defaultOption.textContent = "Select Blood Bank";

        bloodBankSelect.appendChild(defaultOption);

        data.bloodBanks.forEach(bank => {
            if (
                !bank ||
                typeof bank._id !== "string" ||
                typeof bank.name !== "string"
            ) {
                return;
            }

            const option = document.createElement("option");

            option.value = bank._id;
            option.textContent =
                `${bank.name} (${bank.email || "No email"})`;

            bloodBankSelect.appendChild(option);
        });

    } catch (error) {
        console.error("Load Blood Banks error:", error);

        bloodBankSelect.replaceChildren();

        const option = document.createElement("option");
        option.value = "";
        option.textContent = "Unable to load Blood Banks";

        bloodBankSelect.appendChild(option);

        showFormMessage(error.message, "error");
    }
}

// ==============================
// SUBMIT BLOOD REQUEST
// ==============================

if (requestForm) {
    requestForm.addEventListener("submit", async (event) => {
        event.preventDefault();

        if (processingRequest) return;

        const bloodBankId = bloodBankSelect?.value;

        const bloodGroup = document.getElementById(
            "requestBloodGroup"
        )?.value;

        const component = document.getElementById(
            "requestComponent"
        )?.value;

        const quantity = Number(
            document.getElementById("requestQuantity")?.value
        );

        const message = document.getElementById(
            "requestMessage"
        )?.value.trim() || "";

        if (!bloodBankId || !bloodGroup || !component) {
            showFormMessage(
                "Please complete all required fields.",
                "error"
            );
            return;
        }

        if (
            !Number.isInteger(quantity) ||
            quantity < 1 ||
            quantity > 100
        ) {
            showFormMessage(
                "Quantity must be between 1 and 100.",
                "error"
            );
            return;
        }

        if (message.length > 500) {
            showFormMessage(
                "Message cannot exceed 500 characters.",
                "error"
            );
            return;
        }

        processingRequest = true;

        const originalButtonText = submitRequestButton
            ? submitRequestButton.textContent
            : "";

        if (submitRequestButton) {
            submitRequestButton.disabled = true;
            submitRequestButton.textContent = "Submitting...";
        }

        showFormMessage(
            "Submitting your request...",
            "info"
        );

        try {
            const response = await fetch("/api/requests", {
                method: "POST",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json",
                    "Accept": "application/json"
                },
                body: JSON.stringify({
                    bloodBankId,
                    bloodGroup,
                    component,
                    quantity,
                    message
                })
            });

            const data = await readJson(response);

            if (response.status === 401) {
                redirectToLogin();
                return;
            }

            if (!response.ok) {
                throw new Error(
                    data.message || "Unable to submit request."
                );
            }

            requestForm.reset();

            showFormMessage(
                data.message || "Blood request submitted successfully.",
                "success"
            );

            await loadHospitalRequests();

        } catch (error) {
            console.error("Submit request error:", error);

            showFormMessage(error.message, "error");

        } finally {
            processingRequest = false;

            if (submitRequestButton) {
                submitRequestButton.disabled = false;
                submitRequestButton.textContent =
                    originalButtonText || "Submit Blood Request";
            }

            displayHospitalRequests();
        }
    });
}

// ==============================
// LOAD HOSPITAL REQUEST HISTORY
// ==============================

async function loadHospitalRequests() {
    if (!requestTable || loadingRequests) return;

    loadingRequests = true;

    if (refreshRequestsButton) {
        refreshRequestsButton.disabled = true;
    }

    const loadingRow = document.createElement("tr");
    const loadingCell = document.createElement("td");

    loadingCell.colSpan = 8;
    loadingCell.textContent = "Loading requests...";

    loadingRow.appendChild(loadingCell);
    requestTable.replaceChildren(loadingRow);

    try {
        const response = await fetch("/api/requests", {
            credentials: "include",
            headers: {
                "Accept": "application/json"
            }
        });

        const data = await readJson(response);

        if (response.status === 401) {
            redirectToLogin();
            return;
        }

        if (!response.ok) {
            throw new Error(
                data.message || "Unable to load requests."
            );
        }

        if (!Array.isArray(data)) {
            throw new Error("Invalid request history response.");
        }

        hospitalRequests = data;

        displayHospitalRequests();
        updateRequestStatistics();

        showHistoryMessage("");

    } catch (error) {
        console.error("Load requests error:", error);

        const errorRow = document.createElement("tr");
        const errorCell = document.createElement("td");

        errorCell.colSpan = 8;
        errorCell.textContent = "Unable to load requests.";

        errorRow.appendChild(errorCell);
        requestTable.replaceChildren(errorRow);

        showHistoryMessage(error.message, "error");

    } finally {
        loadingRequests = false;

        if (refreshRequestsButton) {
            refreshRequestsButton.disabled = false;
        }

        // FIX: Re-render after loadingRequests becomes false.
        displayHospitalRequests();
    }
}

// ==============================
// DISPLAY REQUEST HISTORY
// ==============================

function displayHospitalRequests() {
    if (!requestTable) return;

    requestTable.replaceChildren();

    if (hospitalRequests.length === 0) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");

        cell.colSpan = 8;
        cell.textContent =
            "You have not submitted any requests.";

        row.appendChild(cell);
        requestTable.appendChild(row);

        return;
    }

    hospitalRequests.forEach(request => {
        const row = document.createElement("tr");

        const requestDate = request.createdAt
            ? new Date(request.createdAt).toLocaleDateString("en-IN")
            : "N/A";

        row.appendChild(createCell(request.requestId));

        row.appendChild(
            createCell(
                request.bloodBank?.name || "Unknown Blood Bank"
            )
        );

        row.appendChild(createCell(request.bloodGroup));
        row.appendChild(createCell(request.component));
        row.appendChild(createCell(request.quantity));
        row.appendChild(createCell(requestDate));

        const statusCell = document.createElement("td");
        const statusElement = document.createElement("span");

        statusElement.className =
            "request-status " + getStatusClass(request.status);

        statusElement.textContent = request.status || "Unknown";

        statusCell.appendChild(statusElement);
        row.appendChild(statusCell);

        const actionCell = document.createElement("td");

        if (request.status === "Dispatched") {
            const receiveButton = document.createElement("button");

            receiveButton.type = "button";
            receiveButton.className = "primary-button";
            receiveButton.textContent = "Confirm Receipt";

            receiveButton.disabled =
                processingRequest || loadingRequests;

            receiveButton.addEventListener("click", () => {
                confirmBloodReceipt(request.requestId);
            });

            actionCell.appendChild(receiveButton);

        } else {
            actionCell.textContent = "-";
        }

        row.appendChild(actionCell);
        requestTable.appendChild(row);
    });
}

// ==============================
// CONFIRM BLOOD RECEIPT
// MONGODB UPDATE
// ==============================

async function confirmBloodReceipt(requestId) {
    if (processingRequest || loadingRequests) return;

    if (!isValidRequestId(requestId)) {
        showHistoryMessage(
            "Invalid request ID.",
            "error"
        );
        return;
    }

    const request = hospitalRequests.find(
        item => item.requestId === requestId
    );

    if (!request || request.status !== "Dispatched") {
        showHistoryMessage(
            "This request is not currently awaiting receipt confirmation.",
            "error"
        );

        await loadHospitalRequests();
        return;
    }

    const confirmed = window.confirm(
        `Confirm that your hospital has received the blood units for ${requestId}?`
    );

    if (!confirmed) return;

    processingRequest = true;

    displayHospitalRequests();

    showHistoryMessage(
        "Confirming blood receipt...",
        "info"
    );

    try {
        const response = await fetch(
            `/api/requests/${encodeURIComponent(requestId)}/receive`,
            {
                method: "PATCH",
                credentials: "include",
                headers: {
                    "Accept": "application/json"
                }
            }
        );

        const data = await readJson(response);

        if (response.status === 401) {
            redirectToLogin();
            return;
        }

        if (!response.ok) {
            throw new Error(
                data.message || "Unable to confirm receipt."
            );
        }

        showHistoryMessage(
            data.message || "Blood receipt confirmed successfully.",
            "success"
        );

        await loadHospitalRequests();

    } catch (error) {
        console.error("Confirm receipt error:", error);

        showHistoryMessage(error.message, "error");

        await loadHospitalRequests();

    } finally {
        processingRequest = false;
        displayHospitalRequests();
    }
}

// ==============================
// UPDATE REQUEST STATISTICS
// ==============================

function updateRequestStatistics() {
    const totalElement = document.getElementById("totalRequests");
    const pendingElement = document.getElementById("pendingRequests");
    const approvedElement = document.getElementById("approvedRequests");
    const rejectedElement = document.getElementById("rejectedRequests");

    if (totalElement) {
        totalElement.textContent = hospitalRequests.length;
    }

    if (pendingElement) {
        pendingElement.textContent =
            hospitalRequests.filter(
                request => request.status === "Pending"
            ).length;
    }

    if (approvedElement) {
        approvedElement.textContent =
            hospitalRequests.filter(
                request =>
                    request.status === "Approved" ||
                    request.status === "Reserved"
            ).length;
    }

    if (rejectedElement) {
        rejectedElement.textContent =
            hospitalRequests.filter(
                request => request.status === "Rejected"
            ).length;
    }
}

// ==============================
// REQUEST STATUS STYLING
// ==============================

function getStatusClass(status) {
    const classes = {
        "Pending": "pending",
        "Processing": "pending",
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
// REFRESH REQUESTS
// ==============================

if (refreshRequestsButton) {
    refreshRequestsButton.addEventListener(
        "click",
        loadHospitalRequests
    );
}

// ==============================
// LOGOUT
// ==============================

if (logoutButton) {
    logoutButton.addEventListener("click", async () => {
        logoutButton.disabled = true;

        try {
            await fetch("/api/auth/logout", {
                method: "POST",
                credentials: "include",
                headers: {
                    "Accept": "application/json"
                }
            });

        } catch (error) {
            console.error("Logout error:", error);

        } finally {
            redirectToLogin();
        }
    });
}

// ==============================
// DARK MODE
// ==============================

if (themeToggle) {
    const savedTheme = localStorage.getItem("theme");

    if (savedTheme === "dark") {
        document.body.classList.add("dark");
    }

    function updateThemeButton() {
        const isDark = document.body.classList.contains("dark");

        themeToggle.textContent = isDark
            ? "Light Mode"
            : "Dark Mode";
    }

    updateThemeButton();

    themeToggle.addEventListener("click", () => {
        document.body.classList.toggle("dark");

        const isDark = document.body.classList.contains("dark");

        localStorage.setItem(
            "theme",
            isDark ? "dark" : "light"
        );

        updateThemeButton();
    });
}

// ==============================
// INITIALIZE DASHBOARD
// ==============================

loadHospitalSession();
