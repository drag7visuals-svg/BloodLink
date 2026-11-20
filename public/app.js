
// ==============================
// CONFIGURATION
// ==============================

const CONTRACT_ADDRESS = "0x7D61E79117AC92451A00C16a2E44B2e525eAA837";
const API = "/api/blood-units";

let bloodUnits = [];
let provider;
let signer;
let bloodLinkContract;

// Solidity enum values
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
// LOAD BLOOD INVENTORY
// ==============================

async function loadInventory() {
    const message = document.getElementById("inventoryMessage");

    try {
        const response = await fetch(API);

        if (!response.ok) {
            throw new Error("Could not load inventory");
        }

        bloodUnits = await response.json();

        showInventory();
        updateStatistics();

        message.textContent = "";

    } catch (error) {
        message.textContent = error.message;
        message.className = "message error";
    }
}

// ==============================
// DISPLAY BLOOD INVENTORY
// ==============================

function showInventory() {
    const table = document.getElementById("inventoryTable");

    table.innerHTML = "";

    const search = document.getElementById("searchInput").value.toLowerCase();
    const group = document.getElementById("groupFilter").value;
    const status = document.getElementById("statusFilter").value;

    const filteredUnits = bloodUnits.filter(unit => {
        return (
            unit.unitId.toLowerCase().includes(search) &&
            (!group || unit.bloodGroup === group) &&
            (!status || unit.status === status)
        );
    });

    if (filteredUnits.length === 0) {
        table.innerHTML = `
            <tr>
                <td colspan="7">No blood units found</td>
            </tr>
        `;
        return;
    }

    filteredUnits.forEach(unit => {
        const row = document.createElement("tr");

        const values = [
            unit.unitId,
            unit.bloodGroup,
            unit.component,
            formatDate(unit.collectionDate),
            formatDate(unit.expiryDate)
        ];

        values.forEach(value => {
            const cell = document.createElement("td");
            cell.textContent = value;
            row.appendChild(cell);
        });

        const statusCell = document.createElement("td");
        statusCell.textContent = unit.status;
        row.appendChild(statusCell);

        const actionCell = document.createElement("td");
        const statusSelect = document.createElement("select");

        statusSelect.className = "status-select";

        const allowedStatuses = {
            "Collected": ["Collected", "Testing Pending", "Rejected"],
            "Testing Pending": ["Testing Pending", "Available", "Rejected"],
            "Available": ["Available", "Reserved", "Expired", "Recalled"],
            "Reserved": ["Reserved", "Dispatched", "Available", "Recalled"],
            "Dispatched": ["Dispatched", "Received", "Recalled"],
            "Received": ["Received", "Recalled"],
            "Rejected": ["Rejected"],
            "Expired": ["Expired"],
            "Recalled": ["Recalled"]
        };

        allowedStatuses[unit.status].forEach(value => {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = value;
            statusSelect.appendChild(option);
        });

        statusSelect.value = unit.status;

        statusSelect.addEventListener("change", async () => {
            await updateStatus(unit.unitId, statusSelect.value);
        });

        actionCell.appendChild(statusSelect);
        row.appendChild(actionCell);

        table.appendChild(row);
    });
}

// ==============================
// FORMAT DATES
// ==============================

function formatDate(date) {
    return new Date(date).toLocaleDateString("en-IN");
}

// ==============================
// DASHBOARD STATISTICS
// ==============================

function updateStatistics() {
    document.getElementById("totalUnits").textContent = bloodUnits.length;

    document.getElementById("availableUnits").textContent =
        bloodUnits.filter(unit => unit.status === "Available").length;

    document.getElementById("testingUnits").textContent =
        bloodUnits.filter(unit => unit.status === "Testing Pending").length;

    document.getElementById("expiredUnits").textContent =
        bloodUnits.filter(unit => unit.status === "Expired").length;
}

// ==============================
// UPDATE STATUS
// MONGODB + BLOCKCHAIN
// ==============================

async function updateStatus(unitId, status) {
    try {
        if (!bloodLinkContract) {
            throw new Error("Please connect MetaMask first.");
        }

        const blockchainStatus = blockchainStatuses[status];

        if (blockchainStatus === undefined) {
            throw new Error("Invalid blockchain status.");
        }

        // Check blood unit on blockchain
        const existingUnit = await bloodLinkContract.bloodUnits(unitId);

        const unitExists = existingUnit.exists ?? existingUnit[2];

        if (!unitExists) {
            throw new Error("This blood unit does not exist on blockchain.");
        }

        const currentStatus = Number(
            existingUnit.status ?? existingUnit[1]
        );

        // Check if status is already the same
        if (currentStatus === blockchainStatus) {
            throw new Error("This blood unit already has this status on blockchain.");
        }

        // Ask MetaMask to update blockchain
        alert("Please confirm the status update in MetaMask.");

        const transaction = await bloodLinkContract.updateStatus(
            unitId,
            blockchainStatus
        );

        alert("Waiting for blockchain confirmation...");

        await transaction.wait();

        // Update MongoDB after blockchain confirmation
        const response = await fetch(
            `${API}/${encodeURIComponent(unitId)}/status`,
            {
                method: "PATCH",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ status })
            }
        );

        const result = await response.json();

        if (!response.ok) {
            throw new Error(
                "Blockchain updated, but MongoDB update failed: " +
                result.message
            );
        }

        alert("Status successfully updated in blockchain and MongoDB!");

        await loadInventory();

    } catch (error) {
        console.error(error);

        alert(error.reason || error.message);

        await loadInventory();
    }
}

// ==============================
// SEARCH AND FILTERS
// ==============================

document.getElementById("searchInput").addEventListener("input", showInventory);
document.getElementById("groupFilter").addEventListener("change", showInventory);
document.getElementById("statusFilter").addEventListener("change", showInventory);

// ==============================
// REFRESH INVENTORY
// ==============================

document.getElementById("refreshButton").addEventListener("click", loadInventory);

// ==============================
// DARK MODE
// ==============================

document.getElementById("themeToggle").addEventListener("click", () => {
    document.body.classList.toggle("dark");

    const isDark = document.body.classList.contains("dark");

    document.getElementById("themeToggle").textContent =
        isDark ? "Light Mode" : "Dark Mode";

    localStorage.setItem("bloodLinkTheme", isDark ? "dark" : "light");
});

// Restore saved theme
if (localStorage.getItem("bloodLinkTheme") === "dark") {
    document.body.classList.add("dark");
    document.getElementById("themeToggle").textContent = "Light Mode";
}

// ==============================
// METAMASK BLOCKCHAIN CONNECTION
// ==============================

const connectButton = document.getElementById("connectWallet");
const walletStatus = document.getElementById("walletStatus");
const blockchainStatusElement = document.getElementById("blockchainStatus");

async function connectWallet() {
    try {
        if (!window.ethereum) {
            throw new Error("Please install MetaMask.");
        }

        if (typeof ethers === "undefined") {
            throw new Error("Ethers.js could not load. Check your internet connection.");
        }

        connectButton.disabled = true;
        connectButton.textContent = "Connecting...";

        provider = new ethers.BrowserProvider(window.ethereum);

        await provider.send("eth_requestAccounts", []);

        signer = await provider.getSigner();

        const network = await provider.getNetwork();

        if (network.chainId !== 11155111n) {
            throw new Error("Please select Sepolia Test Network in MetaMask.");
        }

        const response = await fetch("/contract-abi.json");

        if (!response.ok) {
            throw new Error("Contract ABI file not found in public folder.");
        }

        const contractABI = await response.json();

        bloodLinkContract = new ethers.Contract(
            CONTRACT_ADDRESS,
            contractABI,
            signer
        );

        const address = await signer.getAddress();

        walletStatus.textContent = "Wallet connected: " + address;
        blockchainStatusElement.textContent = "Wallet Connected";
        connectButton.textContent = "Wallet Connected";

    } catch (error) {
        console.error(error);

        bloodLinkContract = null;

        walletStatus.textContent = error.message;
        connectButton.textContent = "Connect MetaMask";
        blockchainStatusElement.textContent = "Not Connected";

    } finally {
        connectButton.disabled = false;
    }
}

if (connectButton) {
    connectButton.addEventListener("click", connectWallet);
}

// ==============================
// REGISTER BLOOD UNIT
// MONGODB + BLOCKCHAIN
// ==============================

document.getElementById("bloodForm").addEventListener("submit", async (event) => {
    event.preventDefault();

    const message = document.getElementById("formMessage");

    const bloodData = {
        unitId: document.getElementById("unitId").value.trim(),
        bloodGroup: document.getElementById("bloodGroup").value,
        component: document.getElementById("component").value,
        collectionDate: document.getElementById("collectionDate").value,
        expiryDate: document.getElementById("expiryDate").value
    };

    try {
        if (!bloodLinkContract) {
            throw new Error("Please connect MetaMask first.");
        }

        message.textContent = "Checking blockchain...";
        message.className = "message";

        // Check whether unit already exists on blockchain
        const existingUnit = await bloodLinkContract.bloodUnits(bloodData.unitId);

        const unitExists = existingUnit.exists ?? existingUnit[2];

        if (!unitExists) {
            message.textContent = "Please confirm the transaction in MetaMask...";

            const transaction = await bloodLinkContract.registerBloodUnit(
                bloodData.unitId
            );

            message.textContent = "Waiting for blockchain confirmation...";

            await transaction.wait();
        }

        // Save unit details in MongoDB
        const response = await fetch(API, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(bloodData)
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(
                "Blockchain record exists, but database save failed: " +
                result.message
            );
        }

        message.textContent =
            "Blood unit registered successfully in MongoDB and blockchain!";

        message.className = "message success";

        document.getElementById("bloodForm").reset();

        await loadInventory();

    } catch (error) {
        console.error(error);

        message.textContent = error.reason || error.message;
        message.className = "message error";
    }
});

// ==============================
// LOAD INVENTORY WHEN PAGE OPENS
// ==============================

loadInventory();
