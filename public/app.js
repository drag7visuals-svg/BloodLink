
// ==============================
// CONFIGURATION
// ==============================

const CONTRACT_ADDRESS = "0xe5Fe3008701613D0F2C3489CABef73d275BBe04B";
const API = "/api/blood-units";

let bloodUnits = [];
let provider;
let signer;
let bloodLinkContract;

let currentQRCanvas = null;

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
// ALLOWED STATUS TRANSITIONS
// ==============================

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

// ==============================
// LOAD REGISTERED DONORS
// ==============================

async function loadDonors() {
    const donorSelect = document.getElementById("donorId");

    if (!donorSelect) return;

    try {
        donorSelect.innerHTML = `
            <option value="">Loading donors...</option>
        `;

        const response = await fetch("/api/donors", {
            credentials: "include"
        });

        if (!response.ok) {
            throw new Error("Unable to load registered donors.");
        }

        const donors = await response.json();

        donorSelect.innerHTML = `
            <option value="">No donor selected</option>
        `;

        if (donors.length === 0) {
            donorSelect.innerHTML = `
                <option value="">No registered donors found</option>
            `;
            return;
        }

        donors.forEach(donor => {
            const option = document.createElement("option");

            option.value = donor._id;
            option.textContent = `${donor.name} (${donor.email})`;

            donorSelect.appendChild(option);
        });

    } catch (error) {
        console.error("Donor loading error:", error);

        donorSelect.innerHTML = `
            <option value="">Could not load donors</option>
        `;
    }
}

// ==============================
// LOAD BLOOD INVENTORY
// ==============================

async function loadInventory() {
    const message = document.getElementById("inventoryMessage");

    try {
        const response = await fetch(API, {
            credentials: "include"
        });

        if (!response.ok) {
            throw new Error("Could not load inventory.");
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

        (allowedStatuses[unit.status] || [unit.status]).forEach(value => {
            const option = document.createElement("option");

            option.value = value;
            option.textContent = value;

            statusSelect.appendChild(option);
        });

        statusSelect.value = unit.status;

        statusSelect.addEventListener("change", async () => {
            statusSelect.disabled = true;

            await updateStatus(unit.unitId, statusSelect.value);

            statusSelect.disabled = false;
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
    document.getElementById("totalUnits").textContent =
        bloodUnits.length;

    document.getElementById("availableUnits").textContent =
        bloodUnits.filter(unit => unit.status === "Available").length;

    document.getElementById("testingUnits").textContent =
        bloodUnits.filter(unit => unit.status === "Testing Pending").length;

    document.getElementById("expiredUnits").textContent =
        bloodUnits.filter(unit => unit.status === "Expired").length;
}

// ==============================
// QR CODE GENERATION
// ==============================

async function generateBloodUnitQR(unitId) {
    const qrCard = document.getElementById("qrCodeCard");
    const qrImage = document.getElementById("bloodUnitQR");
    const qrUnitId = document.getElementById("qrUnitId");
    const downloadButton = document.getElementById("downloadQRButton");

    let qrContainer;

    try {
        if (typeof QRCode === "undefined") {
            throw new Error("QR code library could not load.");
        }

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

        const pngData = finalCanvas.toDataURL("image/png");

        if (!pngData.startsWith("data:image/png")) {
            throw new Error("QR code could not be converted to PNG.");
        }

        qrImage.src = pngData;

        qrUnitId.textContent = "Blood Unit: " + unitId;

        downloadButton.dataset.filename =
            `BloodLink_${unitId}_QR.png`;

        qrCard.style.display = "block";

        qrCard.scrollIntoView({
            behavior: "smooth",
            block: "center"
        });

    } catch (error) {
        console.error("QR generation error:", error);

        currentQRCanvas = null;

        qrCard.style.display = "none";

        document.getElementById("formMessage").textContent =
            "Blood unit registered successfully, but QR generation failed: " +
            error.message;

        document.getElementById("formMessage").className =
            "message error";

    } finally {
        if (qrContainer) {
            qrContainer.remove();
        }
    }
}

// ==============================
// DOWNLOAD QR CODE AS PNG
// ==============================

document.getElementById("downloadQRButton").addEventListener(
    "click",
    () => {
        const downloadButton = document.getElementById("downloadQRButton");

        try {
            if (!currentQRCanvas) {
                throw new Error("No QR code available. Generate a QR code first.");
            }

            currentQRCanvas.toBlob((blob) => {

                if (!blob) {
                    alert("Could not create PNG image.");
                    return;
                }

                const downloadUrl = URL.createObjectURL(blob);

                const link = document.createElement("a");

                link.href = downloadUrl;

                link.download =
                    downloadButton.dataset.filename || "BloodLink_QR.png";

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
    }
);

// ==============================
// UPDATE STATUS
// MONGODB + BLOCKCHAIN
// ==============================

async function updateStatus(unitId, status) {
    try {
        const ownershipResponse = await fetch(
            `${API}/${encodeURIComponent(unitId)}`,
            {
                credentials: "include"
            }
        );

        const ownedUnit = await ownershipResponse.json();

        if (!ownershipResponse.ok) {
            throw new Error(
                ownedUnit.message || "You cannot manage this blood unit."
            );
        }

        if (!allowedStatuses[ownedUnit.status]?.includes(status)) {
            throw new Error("This status transition is not allowed.");
        }

        if (!bloodLinkContract) {
            throw new Error("Please connect MetaMask first.");
        }

        const blockchainStatus = blockchainStatuses[status];

        if (blockchainStatus === undefined) {
            throw new Error("Invalid blockchain status.");
        }

        const existingUnit = await bloodLinkContract.bloodUnits(unitId);

        const unitExists = existingUnit.exists ?? existingUnit[2];

        if (!unitExists) {
            throw new Error(
                "This blood unit does not exist on blockchain."
            );
        }

        const currentStatus = Number(
            existingUnit.status ?? existingUnit[1]
        );

        if (currentStatus === blockchainStatus) {
            throw new Error(
                "This blood unit already has this status on blockchain."
            );
        }

        alert("Please confirm the status update in MetaMask.");

        const transaction = await bloodLinkContract.updateStatus(
            unitId,
            blockchainStatus
        );

        alert("Waiting for blockchain confirmation...");

        await transaction.wait();

        const response = await fetch(
            `${API}/${encodeURIComponent(unitId)}/status`,
            {
                method: "PATCH",
                credentials: "include",
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

        alert(
            "Status successfully updated in blockchain and MongoDB!"
        );

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

document.getElementById("searchInput").addEventListener(
    "input",
    showInventory
);

document.getElementById("groupFilter").addEventListener(
    "change",
    showInventory
);

document.getElementById("statusFilter").addEventListener(
    "change",
    showInventory
);

// ==============================
// REFRESH INVENTORY
// ==============================

document.getElementById("refreshButton").addEventListener(
    "click",
    loadInventory
);

// ==============================
// DARK MODE
// ==============================

document.getElementById("themeToggle").addEventListener("click", () => {
    document.body.classList.toggle("dark");

    const isDark = document.body.classList.contains("dark");

    document.getElementById("themeToggle").textContent =
        isDark ? "Light Mode" : "Dark Mode";

    localStorage.setItem(
        "bloodLinkTheme",
        isDark ? "dark" : "light"
    );
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
            throw new Error(
                "Ethers.js could not load. Check your internet connection."
            );
        }

        connectButton.disabled = true;
        connectButton.textContent = "Connecting...";

        provider = new ethers.BrowserProvider(window.ethereum);

        await provider.send("eth_requestAccounts", []);

        signer = await provider.getSigner();

        const network = await provider.getNetwork();

        if (network.chainId !== 11155111n) {
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
// MONGODB + BLOCKCHAIN + QR
// ==============================

document.getElementById("bloodForm").addEventListener(
    "submit",
    async (event) => {

        event.preventDefault();

        const message = document.getElementById("formMessage");

        const bloodData = {
            unitId: document.getElementById("unitId").value.trim(),
            bloodGroup: document.getElementById("bloodGroup").value,
            component: document.getElementById("component").value,
            collectionDate: document.getElementById("collectionDate").value,
            expiryDate: document.getElementById("expiryDate").value,
            donorId: document.getElementById("donorId").value || null
        };

        try {
            if (!bloodLinkContract) {
                throw new Error("Please connect MetaMask first.");
            }

            if (
                new Date(bloodData.expiryDate) <=
                new Date(bloodData.collectionDate)
            ) {
                throw new Error(
                    "Expiry date must be after collection date."
                );
            }

            message.textContent = "Checking blockchain...";
            message.className = "message";

            const existingUnit = await bloodLinkContract.bloodUnits(
                bloodData.unitId
            );

            const unitExists = existingUnit.exists ?? existingUnit[2];

            if (!unitExists) {

                const connectedAddress = await signer.getAddress();

                const isAuthorized =
                    await bloodLinkContract.authorizedBanks(
                        connectedAddress
                    );

                console.log("Connected wallet:", connectedAddress);
                console.log("Bank authorized:", isAuthorized);
                console.log("Contract:", CONTRACT_ADDRESS);

                if (!isAuthorized) {
                    throw new Error(
                        "The connected wallet is not authorized as a Blood Bank."
                    );
                }

                message.textContent =
                    "Checking whether blockchain registration is possible...";

                await bloodLinkContract.registerBloodUnit.staticCall(
                    bloodData.unitId
                );

                message.textContent =
                    "Pre-check passed. Please confirm in MetaMask...";

                const transaction =
                    await bloodLinkContract.registerBloodUnit(
                        bloodData.unitId
                    );

                message.textContent =
                    "Waiting for blockchain confirmation...";

                await transaction.wait();
            }

            // SAVE BLOOD UNIT AND DONOR ID TO MONGODB

            message.textContent = "Saving blood unit and donor details...";

            const response = await fetch(API, {
                method: "POST",
                credentials: "include",
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

            document.getElementById("bloodForm").reset();

            message.textContent =
                "Blood unit registered successfully in MongoDB and blockchain!";

            message.className = "message success";

            await generateBloodUnitQR(bloodData.unitId);

            await loadInventory();

            // Refresh donor list after registration

            await loadDonors();

        } catch (error) {
            console.error(error);

            message.textContent =
                error.reason || error.shortMessage || error.message;

            message.className = "message error";
        }
    }
);

// ==============================
// LOAD DATA WHEN PAGE OPENS
// ==============================

loadInventory();
loadDonors();
