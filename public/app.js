
// ==============================
// CONFIGURATION
// ==============================

const CONTRACT_ADDRESS = "0xe5Fe3008701613D0F2C3489CABef73d275BBe04B";
const API = "/api/blood-units";
const SEPOLIA_CHAIN_ID = 11155111n;

let bloodUnits = [];
let provider = null;
let signer = null;
let bloodLinkContract = null;

let currentQRCanvas = null;
let registrationInProgress = false;

// ==============================
// BLOCKCHAIN STATUS VALUES
// ==============================

const blockchainStatuses = {
    "Collected": 0,
    "Testing Pending": 1,
    "Available": 2,
    "Reserved": 3,
    "Dispatched": 4,
    "Received": 5,
    "Rejected": 6,
    "Expired": 7,
    "Recalled": 8
};

// ==============================
// ALLOWED MANUAL STATUS TRANSITIONS
// Must match server.js
// ==============================

const allowedStatuses = {
    "Collected": [
        "Testing Pending",
        "Rejected"
    ],

    "Testing Pending": [
        "Available",
        "Rejected"
    ],

    "Available": [
        "Recalled"
    ],

    "Reserved": [],
    "Dispatched": [],
    "Received": [],
    "Rejected": [],
    "Expired": [],
    "Recalled": []
};

// ==============================
// HELPER FUNCTIONS
// ==============================

function getElement(id) {
    return document.getElementById(id);
}

async function readJson(response) {
    try {
        return await response.json();
    } catch {
        return {};
    }
}

function showMessage(element, message, type = "") {
    if (!element) return;

    element.textContent = message;
    element.className = type ? `message ${type}` : "message";
}

function isValidDate(value) {
    if (typeof value !== "string") return false;

    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
        return false;
    }

    const date = new Date(`${value}T00:00:00.000Z`);

    return (
        !Number.isNaN(date.getTime()) &&
        date.toISOString().slice(0, 10) === value
    );
}

function formatDate(date) {
    if (!date) return "N/A";

    const parsedDate = new Date(date);

    if (Number.isNaN(parsedDate.getTime())) {
        return "Invalid date";
    }

    return parsedDate.toLocaleDateString("en-IN");
}

// ==============================
// LOAD REGISTERED DONORS
// ==============================

async function loadDonors() {
    const donorSelect = getElement("donorId");

    if (!donorSelect) return;

    donorSelect.replaceChildren();

    const loadingOption = document.createElement("option");
    loadingOption.value = "";
    loadingOption.textContent = "Loading donors...";

    donorSelect.appendChild(loadingOption);

    try {
        const response = await fetch("/api/donors", {
            credentials: "include"
        });

        const data = await readJson(response);

        if (!response.ok) {
            throw new Error(
                data.message || "Unable to load registered donors."
            );
        }

        if (!Array.isArray(data)) {
            throw new Error("Invalid donor response.");
        }

        donorSelect.replaceChildren();

        const defaultOption = document.createElement("option");
        defaultOption.value = "";
        defaultOption.textContent = "No donor selected";

        donorSelect.appendChild(defaultOption);

        if (data.length === 0) {
            defaultOption.textContent = "No registered donors found";
            return;
        }

        data.forEach(donor => {
            const option = document.createElement("option");

            option.value = donor._id;
            option.textContent = `${donor.name} (${donor.email})`;

            donorSelect.appendChild(option);
        });

    } catch (error) {
        console.error("Donor loading error:", error);

        donorSelect.replaceChildren();

        const errorOption = document.createElement("option");
        errorOption.value = "";
        errorOption.textContent = "Could not load donors";

        donorSelect.appendChild(errorOption);
    }
}

// ==============================
// LOAD BLOOD INVENTORY
// ==============================

async function loadInventory() {
    const message = getElement("inventoryMessage");

    try {
        const response = await fetch(API, {
            credentials: "include"
        });

        const data = await readJson(response);

        if (!response.ok) {
            throw new Error(
                data.message || "Could not load inventory."
            );
        }

        if (!Array.isArray(data)) {
            throw new Error("Invalid inventory response.");
        }

        bloodUnits = data;

        showInventory();
        updateStatistics();

        showMessage(message, "");

    } catch (error) {
        console.error("Inventory loading error:", error);

        showMessage(message, error.message, "error");
    }
}

// ==============================
// DISPLAY BLOOD INVENTORY
// ==============================

function showInventory() {
    const table = getElement("inventoryTable");

    if (!table) return;

    table.replaceChildren();

    const search = (
        getElement("searchInput")?.value || ""
    ).toLowerCase();

    const group = getElement("groupFilter")?.value || "";
    const status = getElement("statusFilter")?.value || "";

    const filteredUnits = bloodUnits.filter(unit => {
        return (
            String(unit.unitId).toLowerCase().includes(search) &&
            (!group || unit.bloodGroup === group) &&
            (!status || unit.status === status)
        );
    });

    if (filteredUnits.length === 0) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");

        cell.colSpan = 7;
        cell.textContent = "No blood units found";

        row.appendChild(cell);
        table.appendChild(row);

        return;
    }

    filteredUnits.forEach(unit => {
        const row = document.createElement("tr");

        const values = [
            unit.unitId,
            unit.bloodGroup,
            unit.component,
            formatDate(unit.collectionDate),
            formatDate(unit.expiryDate),
            unit.status
        ];

        values.forEach(value => {
            const cell = document.createElement("td");
            cell.textContent = value;
            row.appendChild(cell);
        });

        const actionCell = document.createElement("td");
        const statusSelect = document.createElement("select");

        statusSelect.className = "status-select";

        const transitions = allowedStatuses[unit.status] || [];

        // Show the current status and only permitted next statuses.
        [unit.status, ...transitions].forEach(value => {
            const option = document.createElement("option");

            option.value = value;
            option.textContent = value;

            statusSelect.appendChild(option);
        });

        statusSelect.value = unit.status;

        if (transitions.length === 0) {
            statusSelect.disabled = true;
        }

        statusSelect.addEventListener("change", async () => {
            const newStatus = statusSelect.value;

            statusSelect.disabled = true;

            await updateStatus(unit.unitId, newStatus);

            // Inventory refresh will rebuild the dropdown.
        });

        actionCell.appendChild(statusSelect);
        row.appendChild(actionCell);

        table.appendChild(row);
    });
}

// ==============================
// DASHBOARD STATISTICS
// ==============================

function updateStatistics() {
    const total = getElement("totalUnits");
    const available = getElement("availableUnits");
    const testing = getElement("testingUnits");
    const expired = getElement("expiredUnits");

    if (total) {
        total.textContent = bloodUnits.length;
    }

    if (available) {
        available.textContent = bloodUnits.filter(
            unit => unit.status === "Available"
        ).length;
    }

    if (testing) {
        testing.textContent = bloodUnits.filter(
            unit => unit.status === "Testing Pending"
        ).length;
    }

    if (expired) {
        expired.textContent = bloodUnits.filter(
            unit => unit.status === "Expired"
        ).length;
    }
}

// ==============================
// CHECK CONNECTED WALLET
// ==============================

async function ensureAuthorizedBank() {
    if (!window.ethereum) {
        throw new Error("Please install MetaMask.");
    }

    if (typeof ethers === "undefined") {
        throw new Error("Ethers.js could not load.");
    }

    if (!provider || !signer || !bloodLinkContract) {
        throw new Error("Please connect MetaMask first.");
    }

    const network = await provider.getNetwork();

    if (network.chainId !== SEPOLIA_CHAIN_ID) {
        throw new Error(
            "Please select Sepolia Test Network in MetaMask."
        );
    }

    const address = await signer.getAddress();

    const authorized = await bloodLinkContract.authorizedBanks(address);

    if (!authorized) {
        throw new Error(
            "The connected wallet is not authorized as a Blood Bank."
        );
    }

    return address;
}

// ==============================
// QR CODE GENERATION
// ==============================

async function generateBloodUnitQR(unitId) {
    const qrCard = getElement("qrCodeCard");
    const qrImage = getElement("bloodUnitQR");
    const qrUnitId = getElement("qrUnitId");
    const downloadButton = getElement("downloadQRButton");

    let qrContainer = null;

    try {
        if (
            !qrCard ||
            !qrImage ||
            !qrUnitId ||
            !downloadButton
        ) {
            throw new Error("QR code elements are missing from the page.");
        }

        if (typeof QRCode === "undefined") {
            throw new Error("QR code library could not load.");
        }

        // Existing tracking route uses unitId.
        // Random tracking tokens will be introduced separately.
        const trackingUrl =
            `${window.location.origin}/track.html?unitId=${encodeURIComponent(unitId)}`;

        qrContainer = document.createElement("div");

        qrContainer.style.position = "absolute";
        qrContainer.style.left = "-9999px";

        document.body.appendChild(qrContainer);

        new QRCode(qrContainer, {
            text: trackingUrl,
            width: 300,
            height: 300,
            colorDark: "#000000",
            colorLight: "#ffffff",
            correctLevel: QRCode.CorrectLevel.H
        });

        const canvas = qrContainer.querySelector("canvas");

        if (!canvas) {
            throw new Error("QR code canvas could not be generated.");
        }

        const padding = 40;

        const finalCanvas = document.createElement("canvas");

        finalCanvas.width = canvas.width + padding * 2;
        finalCanvas.height = canvas.height + padding * 2;

        const context = finalCanvas.getContext("2d");

        if (!context) {
            throw new Error("Could not create QR canvas context.");
        }

        context.fillStyle = "#ffffff";

        context.fillRect(
            0,
            0,
            finalCanvas.width,
            finalCanvas.height
        );

        context.drawImage(
            canvas,
            padding,
            padding
        );

        currentQRCanvas = finalCanvas;

        qrImage.src = finalCanvas.toDataURL("image/png");

        qrUnitId.textContent = "Blood Unit: " + unitId;

        downloadButton.dataset.filename =
            `BloodLink_${unitId}_QR.png`;

        qrCard.style.display = "block";

        qrCard.scrollIntoView({
            behavior: "smooth",
            block: "center"
        });

        return true;

    } catch (error) {
        console.error("QR generation error:", error);

        currentQRCanvas = null;

        if (qrCard) {
            qrCard.style.display = "none";
        }

        return false;

    } finally {
        if (qrContainer) {
            qrContainer.remove();
        }
    }
}

// ==============================
// DOWNLOAD QR CODE AS PNG
// ==============================

const downloadButton = getElement("downloadQRButton");

if (downloadButton) {
    downloadButton.addEventListener("click", () => {
        try {
            if (!currentQRCanvas) {
                throw new Error(
                    "No QR code available. Generate a QR code first."
                );
            }

            currentQRCanvas.toBlob(blob => {
                if (!blob) {
                    alert("Could not create PNG image.");
                    return;
                }

                const downloadUrl = URL.createObjectURL(blob);
                const link = document.createElement("a");

                link.href = downloadUrl;

                link.download =
                    downloadButton.dataset.filename ||
                    "BloodLink_QR.png";

                document.body.appendChild(link);

                link.click();
                link.remove();

                setTimeout(() => {
                    URL.revokeObjectURL(downloadUrl);
                }, 1000);

            }, "image/png");

        } catch (error) {
            console.error("QR download error:", error);

            alert("QR download failed: " + error.message);
        }
    });
}

// ==============================
// UPDATE STATUS
// MONGODB + BLOCKCHAIN
// ==============================

async function updateStatus(unitId, newStatus) {
    let blockchainUpdated = false;

    try {
        const ownershipResponse = await fetch(
            `${API}/${encodeURIComponent(unitId)}`,
            {
                credentials: "include"
            }
        );

        const ownedUnit = await readJson(ownershipResponse);

        if (!ownershipResponse.ok) {
            throw new Error(
                ownedUnit.message ||
                "You cannot manage this blood unit."
            );
        }

        const currentStatus = ownedUnit.status;

        if (!allowedStatuses[currentStatus]?.includes(newStatus)) {
            throw new Error(
                "This status transition is not allowed."
            );
        }

        if (new Date(ownedUnit.expiryDate) <= new Date() &&
            newStatus === "Available") {
            throw new Error(
                "Expired blood cannot be made available."
            );
        }

        await ensureAuthorizedBank();

        const targetBlockchainStatus = blockchainStatuses[newStatus];
        const currentBlockchainStatus = blockchainStatuses[currentStatus];

        if (
            targetBlockchainStatus === undefined ||
            currentBlockchainStatus === undefined
        ) {
            throw new Error("Invalid blockchain status.");
        }

        const existingUnit = await bloodLinkContract.bloodUnits(unitId);

        const unitExists = existingUnit.exists ?? existingUnit[2];

        if (!unitExists) {
            throw new Error(
                "This blood unit does not exist on blockchain."
            );
        }

        const actualBlockchainStatus = Number(
            existingUnit.status ?? existingUnit[1]
        );

        // Prevent updating one system when the two systems
        // already disagree about the current status.
        if (actualBlockchainStatus !== currentBlockchainStatus) {
            throw new Error(
                "MongoDB and blockchain statuses do not match. Status update stopped to prevent further inconsistency."
            );
        }

        if (actualBlockchainStatus === targetBlockchainStatus) {
            throw new Error(
                "This blood unit already has the requested blockchain status."
            );
        }

        const transaction = await bloodLinkContract.updateStatus(
            unitId,
            targetBlockchainStatus
        );

        const receipt = await transaction.wait();

        if (!receipt || Number(receipt.status) !== 1) {
            throw new Error("Blockchain transaction failed.");
        }

        blockchainUpdated = true;

        const response = await fetch(
            `${API}/${encodeURIComponent(unitId)}/status`,
            {
                method: "PATCH",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    status: newStatus
                })
            }
        );

        const result = await readJson(response);

        if (!response.ok) {
            throw new Error(
                "Blockchain status was updated, but MongoDB update failed: " +
                (result.message || "Unknown database error.")
            );
        }

        alert(
            "Status successfully updated in blockchain and MongoDB."
        );

    } catch (error) {
        console.error("Status update error:", error);

        if (blockchainUpdated) {
            alert(
                "IMPORTANT: The blockchain was updated, but the MongoDB operation did not complete. The records may now be inconsistent. Do not repeat the transaction blindly. Check both systems before proceeding.\n\n" +
                error.message
            );
        } else {
            alert(error.reason || error.shortMessage || error.message);
        }

    } finally {
        await loadInventory();
    }
}

// ==============================
// SEARCH AND FILTERS
// ==============================

const searchInput = getElement("searchInput");
const groupFilter = getElement("groupFilter");
const statusFilter = getElement("statusFilter");

if (searchInput) {
    searchInput.addEventListener("input", showInventory);
}

if (groupFilter) {
    groupFilter.addEventListener("change", showInventory);
}

if (statusFilter) {
    statusFilter.addEventListener("change", showInventory);
}

// ==============================
// REFRESH INVENTORY
// ==============================

const refreshButton = getElement("refreshButton");

if (refreshButton) {
    refreshButton.addEventListener("click", loadInventory);
}

// ==============================
// DARK MODE
// ==============================

const themeToggle = getElement("themeToggle");

function restoreTheme() {
    const savedTheme = localStorage.getItem("bloodLinkTheme");

    if (savedTheme === "dark") {
        document.body.classList.add("dark");
    } else {
        document.body.classList.remove("dark");
    }

    if (themeToggle) {
        themeToggle.textContent =
            savedTheme === "dark" ? "Light Mode" : "Dark Mode";
    }
}

if (themeToggle) {
    themeToggle.addEventListener("click", () => {
        document.body.classList.toggle("dark");

        const isDark = document.body.classList.contains("dark");

        themeToggle.textContent =
            isDark ? "Light Mode" : "Dark Mode";

        localStorage.setItem(
            "bloodLinkTheme",
            isDark ? "dark" : "light"
        );
    });
}

restoreTheme();

// ==============================
// METAMASK BLOCKCHAIN CONNECTION
// ==============================

const connectButton = getElement("connectWallet");
const walletStatus = getElement("walletStatus");
const blockchainStatusElement = getElement("blockchainStatus");

async function connectWallet() {
    if (!connectButton) return;

    try {
        if (!window.ethereum) {
            throw new Error("Please install MetaMask.");
        }

        if (typeof ethers === "undefined") {
            throw new Error("Ethers.js could not load.");
        }

        connectButton.disabled = true;
        connectButton.textContent = "Connecting...";

        provider = new ethers.BrowserProvider(window.ethereum);

        await provider.send("eth_requestAccounts", []);

        signer = await provider.getSigner();

        const network = await provider.getNetwork();

        if (network.chainId !== SEPOLIA_CHAIN_ID) {
            throw new Error(
                "Please select Sepolia Test Network in MetaMask."
            );
        }

        const response = await fetch("/contract-abi.json");

        if (!response.ok) {
            throw new Error(
                "Contract ABI file not found in public folder."
            );
        }

        const contractABI = await response.json();

        bloodLinkContract = new ethers.Contract(
            CONTRACT_ADDRESS,
            contractABI,
            signer
        );

        const address = await signer.getAddress();

        const authorized = await bloodLinkContract.authorizedBanks(address);

        if (walletStatus) {
            walletStatus.textContent =
                "Wallet connected: " + address;
        }

        if (blockchainStatusElement) {
            blockchainStatusElement.textContent = authorized
                ? "Authorized Blood Bank"
                : "Wallet connected - Not an authorized Blood Bank";
        }

        connectButton.textContent = "Wallet Connected";

    } catch (error) {
        console.error("Wallet connection error:", error);

        provider = null;
        signer = null;
        bloodLinkContract = null;

        if (walletStatus) {
            walletStatus.textContent = error.message;
        }

        if (blockchainStatusElement) {
            blockchainStatusElement.textContent = "Not Connected";
        }

        connectButton.textContent = "Connect MetaMask";

    } finally {
        connectButton.disabled = false;
    }
}

if (connectButton) {
    connectButton.addEventListener("click", connectWallet);
}

// Reset blockchain connection when the account changes.

if (window.ethereum) {
    window.ethereum.on("accountsChanged", () => {
        provider = null;
        signer = null;
        bloodLinkContract = null;

        if (walletStatus) {
            walletStatus.textContent = "Wallet account changed. Reconnect.";
        }

        if (blockchainStatusElement) {
            blockchainStatusElement.textContent = "Not Connected";
        }

        if (connectButton) {
            connectButton.textContent = "Connect MetaMask";
        }
    });

    window.ethereum.on("chainChanged", () => {
        provider = null;
        signer = null;
        bloodLinkContract = null;

        if (walletStatus) {
            walletStatus.textContent = "Network changed. Reconnect.";
        }

        if (blockchainStatusElement) {
            blockchainStatusElement.textContent = "Not Connected";
        }

        if (connectButton) {
            connectButton.textContent = "Connect MetaMask";
        }
    });
}

// ==============================
// REGISTER BLOOD UNIT
// MONGODB + BLOCKCHAIN + QR
// ==============================

const bloodForm = getElement("bloodForm");

if (bloodForm) {
    bloodForm.addEventListener("submit", async event => {
        event.preventDefault();

        if (registrationInProgress) return;

        const message = getElement("formMessage");

        const submitButton = bloodForm.querySelector(
            'button[type="submit"], input[type="submit"]'
        );

        const bloodData = {
            unitId: getElement("unitId")?.value.trim() || "",
            bloodGroup: getElement("bloodGroup")?.value || "",
            component: getElement("component")?.value || "",
            collectionDate: getElement("collectionDate")?.value || "",
            expiryDate: getElement("expiryDate")?.value || "",
            donorId: getElement("donorId")?.value || null
        };

        registrationInProgress = true;

        if (submitButton) {
            submitButton.disabled = true;
        }

        try {
            if (
                !bloodData.unitId ||
                !bloodData.bloodGroup ||
                !bloodData.component ||
                !bloodData.collectionDate ||
                !bloodData.expiryDate
            ) {
                throw new Error("Please fill in all required fields.");
            }

            if (
                !isValidDate(bloodData.collectionDate) ||
                !isValidDate(bloodData.expiryDate) ||
                new Date(`${bloodData.expiryDate}T00:00:00.000Z`) <=
                new Date(`${bloodData.collectionDate}T00:00:00.000Z`)
            ) {
                throw new Error(
                    "Please enter valid dates. Expiry date must be after collection date."
                );
            }

            if (!bloodLinkContract) {
                throw new Error("Please connect MetaMask first.");
            }

            // Always verify wallet authorization, even when
            // the unit already exists on the blockchain.
            await ensureAuthorizedBank();

            showMessage(message, "Checking blockchain...");

            const existingUnit = await bloodLinkContract.bloodUnits(
                bloodData.unitId
            );

            const unitExists = existingUnit.exists ?? existingUnit[2];

            if (unitExists) {
                const existingStatus = Number(
                    existingUnit.status ?? existingUnit[1]
                );

                if (existingStatus !== blockchainStatuses["Collected"]) {
                    throw new Error(
                        "This unit already exists on blockchain with a different status. Automatic registration recovery is not safe."
                    );
                }

            } else {
                showMessage(
                    message,
                    "Checking whether blockchain registration is possible..."
                );

                await bloodLinkContract.registerBloodUnit.staticCall(
                    bloodData.unitId
                );

                showMessage(
                    message,
                    "Pre-check passed. Please confirm the transaction in MetaMask..."
                );

                const transaction =
                    await bloodLinkContract.registerBloodUnit(
                        bloodData.unitId
                    );

                showMessage(
                    message,
                    "Waiting for blockchain confirmation..."
                );

                const receipt = await transaction.wait();

                if (!receipt || Number(receipt.status) !== 1) {
                    throw new Error(
                        "Blockchain registration transaction failed."
                    );
                }
            }

            // Save the unit in MongoDB after blockchain confirmation.

            showMessage(
                message,
                "Blockchain confirmed. Saving blood unit to database..."
            );

            const response = await fetch(API, {
                method: "POST",
                credentials: "include",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(bloodData)
            });

            const result = await readJson(response);

            if (!response.ok) {
                throw new Error(
                    "Blockchain record exists, but database registration failed: " +
                    (result.message || "Unknown database error.")
                );
            }

            bloodForm.reset();

            const qrGenerated = await generateBloodUnitQR(
                bloodData.unitId
            );

            if (qrGenerated) {
                showMessage(
                    message,
                    "Blood unit registered successfully in MongoDB and blockchain. QR code generated.",
                    "success"
                );
            } else {
                showMessage(
                    message,
                    "Blood unit registered successfully in MongoDB and blockchain, but QR generation failed. You can refresh the page and try again.",
                    "success"
                );
            }

            await loadInventory();

        } catch (error) {
            console.error("Blood registration error:", error);

            showMessage(
                message,
                error.reason || error.shortMessage || error.message,
                "error"
            );

        } finally {
            registrationInProgress = false;

            if (submitButton) {
                submitButton.disabled = false;
            }
        }
    });
}

// ==============================
// LOAD DATA WHEN PAGE OPENS
// ==============================

loadInventory();
loadDonors();
