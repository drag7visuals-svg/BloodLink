# BloodLink -- Project Setup and User Guide

## 1. Project overview

BloodLink is a blood bank management and traceability prototype.

It uses: - **Frontend:** HTML, CSS and JavaScript - **Backend:** Node.js
and Express - **Database:** MongoDB with Mongoose - **Blockchain:**
Solidity smart contract on the Ethereum Sepolia test network -
**Wallet:** MetaMask - **Blockchain connection:** Ethers.js

The project folder is:

``` text
C:\Users\palas\BloodBankBackend
```

## 2. What the current version can do

-   Display a dashboard with blood inventory statistics.
-   Register blood units with a unit ID, blood group, component,
    collection date and expiry date.
-   Save blood unit details in MongoDB.
-   Register a blood unit ID on the Sepolia blockchain.
-   Connect the website to MetaMask.
-   Display and filter the blood inventory.
-   Update a unit's status in MongoDB and on the blockchain.
-   Switch between dark mode and light mode.
-   Open the Privacy Policy page.

The project was tested with the sample unit **BL002**: - Registration
was confirmed in MongoDB and on Sepolia. - The status was changed to
**Testing Pending**. - The status was confirmed in both MongoDB and the
smart contract.

## 3. Software needed

Make sure these are installed:

1.  Node.js and npm
2.  MongoDB Community Server
3.  MongoDB Compass (optional, for viewing database records)
4.  MetaMask browser extension
5.  A browser such as Chrome
6.  VS Code

You also need access to Remix IDE if you want to inspect or interact
with the deployed smart contract.

## 4. Project folder structure

The project currently uses this structure:

``` text
BloodBankBackend/
│
├── models/
│   └── BloodUnit.js
│
├── public/
│   ├── index.html
│   ├── styles.css
│   ├── app.js
│   ├── privacy.html
│   └── contract-abi.json
│
├── .env
├── .gitignore
├── package.json
├── package-lock.json
└── server.js
```

Do not delete `contract-abi.json`. The website reads this file to
connect to the smart contract.

## 5. How to start BloodLink

Follow these steps whenever you want to run the website.

### Step 1 -- Start MongoDB

MongoDB Community Server must be running before the website can save or
load records.

If MongoDB was installed as a Windows service, it may start
automatically. If it is not running:

1.  Press `Windows + R`.
2.  Type `services.msc` and press Enter.
3.  Find the MongoDB Server service (often named `MongoDB`).
4.  If its status is not Running, right-click it and choose Start.

MongoDB Compass is not required for the website to run. It is only a
graphical tool for viewing the database.

### Step 2 -- Open the project folder

1.  Open VS Code.
2.  Select **File → Open Folder**.
3.  Open:

``` text
C:\Users\palas\BloodBankBackend
```

### Step 3 -- Open the VS Code terminal

In VS Code, select **Terminal → New Terminal**.

Make sure the terminal is in the project folder. If it is not, run:

``` cmd
cd /d C:\Users\palas\BloodBankBackend
```

### Step 4 -- Install packages if needed

Normally, you only need to do this once. If `node_modules` is missing,
run:

``` cmd
npm install
```

The project uses Express, Mongoose, CORS, dotenv and Ethers.js.

### Step 5 -- Start the server

Run:

``` cmd
node server.js
```

Keep this terminal open while using BloodLink.

The server should report that it is running on port `5000`. If MongoDB
connection fails, check that the MongoDB service is running and that the
connection string in `.env` is correct.

### Step 6 -- Open the website

Open Chrome and visit:

<http://localhost:5000>

The website is running locally on your computer.

## 6. Connect MetaMask

1.  Open the BloodLink website.
2.  Make sure MetaMask is installed and unlocked.
3.  Select the **Sepolia Test Network** in MetaMask.
4.  Click **Connect MetaMask** on the website.
5.  Approve the connection request.

The website checks that the selected network is Sepolia. If it asks you
to switch networks, select Sepolia in MetaMask and connect again.

The deployed contract address used by the current website is:

``` text
0x7D61E79117AC92451A00C16a2E44B2e525eAA837
```

The ABI file should be available at:

``` text
public\contract-abi.json
```

The wallet used to register or update units must be authorised by the
smart contract. If a transaction fails with `Not an authorized bank`,
the connected wallet is not authorised.

**Never share your MetaMask recovery phrase or private key.** The
website does not need either of them.

## 7. How to use the website

### Register a blood unit

1.  Open **Register Blood Unit**.
2.  Enter a unique unit ID.
3.  Select the blood group and component.
4.  Enter the collection and expiry dates.
5.  Click **Register Blood Unit**.
6.  Confirm the blockchain transaction in MetaMask.
7.  Wait for the transaction confirmation and database save message.

A unit ID must be unique. Do not try to register an ID that already
exists.

### View inventory

Open **Blood Inventory** to see registered units. Use the search box and
filters to find units by ID, blood group or status.

### Update a unit's status

Use the status dropdown in the inventory table. The current integration
requests a blockchain transaction through MetaMask first and then
updates MongoDB after blockchain confirmation.

The smart contract allows these main transitions:

``` text
Collected
    ↓
Testing Pending
    ↓
Available
    ↓
Reserved
    ↓
Dispatched
    ↓
Received
```

Other supported outcomes include Rejected, Expired and Recalled, subject
to the contract's transition rules.

Only authorised personnel should approve blood units after the required
testing. Do not mark a unit Available just to test the software.

## 8. How to stop BloodLink

When you finish:

1.  Return to the VS Code terminal where `node server.js` is running.
2.  Press `Ctrl + C`.
3.  If the terminal returns to the command prompt, the server has
    stopped.
4.  You can then close VS Code, MongoDB Compass and the browser.

If you close the terminal window, the server normally stops with it. If
you need to check for a leftover Node.js process, open Task Manager and
look for `node.exe`. Ending a Node.js process can stop other Node.js
projects too, so do not end it if you are running another project.

Your saved project files, MongoDB records and deployed Sepolia contract
are not deleted when you stop the server.

## 9. View records in MongoDB Compass

1.  Open MongoDB Compass.
2.  Connect using:

``` text
mongodb://127.0.0.1:27017
```

3.  Open the database:

``` text
BloodBankDB
```

4.  Open the collection:

``` text
bloodunits
```

5.  Find the required unit ID, such as `BL002`.

The status field should match the latest status shown by the website,
provided both updates succeeded.

## 10. View the blockchain record

The contract is deployed on Sepolia.

To inspect a unit using Remix:

1.  Open Remix IDE.
2.  Open the Solidity file containing `BloodLink`.
3.  Select **Deploy & Run Transactions**.
4.  Find the deployed `BloodLink` contract under **Deployed Contracts**.
5.  Expand the contract.
6.  Find the `bloodUnits` read function.
7.  Enter the unit ID and run the query.

The returned status is a number representing the Solidity enum:

    Number Status
  -------- ----------------
         0 Collected
         1 TestingPending
         2 Available
         3 Reserved
         4 Dispatched
         5 Received
         6 Rejected
         7 Expired
         8 Recalled

You can also view the contract on Sepolia Etherscan:

[Open BloodLink contract on Sepolia
Etherscan](https://sepolia.etherscan.io/address/0x7D61E79117AC92451A00C16a2E44B2e525eAA837)

The contract may not have verified source code on Etherscan. Remix can
still be used to read the deployed contract through the ABI.

## 11. Common problems

### Website does not open

-   Check that the terminal is running `node server.js`.
-   Check that the server is using port `5000`.
-   Open `http://localhost:5000`.

### MongoDB connection error

-   Check that the MongoDB Server service is running.
-   Check the MongoDB connection string in `.env`.
-   The local default used by the project is:

``` text
mongodb://127.0.0.1:27017/BloodBankDB
```

### MetaMask does not connect

-   Unlock MetaMask.
-   Select Sepolia Test Network.
-   Refresh the website.
-   Click **Connect MetaMask** again.

### Contract ABI file not found

Check that this file exists:

``` text
C:\Users\palas\BloodBankBackend\public\contract-abi.json
```

It must contain the ABI array copied from the compiled Solidity
contract.

### Transaction says the bank is not authorised

The connected MetaMask account must be authorised by the contract owner
using the contract's `authorizeBank(address)` function. Only the owner
can authorise a bank address.

### Blockchain update succeeds but MongoDB update fails

The blockchain transaction cannot be rolled back automatically. Check
the unit's status in Remix and MongoDB separately before trying another
update. Do not repeatedly submit the same status change.

## 12. Important project limitations and safety

-   This is a student prototype using the Sepolia test network, not a
    production blood bank system.
-   Sepolia ETH is test currency and has no intended real-world payment
    value.
-   Blockchain records provide tamper-evident traceability; they do not
    prove that blood was correctly collected, tested, stored or
    transported.
-   Use synthetic test data only. Do not enter real donor or patient
    personal information.
-   A real deployment would require qualified blood bank partners,
    validated medical workflows, appropriate privacy and security
    controls, regulatory review and professional testing.
-   The QR tracking feature is planned. The QR library was being added
    to `index.html`, but QR generation and the public tracking page
    still need to be implemented in `app.js` and the backend.
-   Role-based access control, hospital workflows, donor management,
    automated expiry alerts and IoT temperature monitoring are not
    confirmed as implemented in the current version.

## 13. Quick start -- commands to remember

Open VS Code terminal and run:

``` cmd
cd /d C:\Users\palas\BloodBankBackend
node server.js
```

Then open:

``` text
http://localhost:5000
```

To stop the server, return to the terminal and press:

``` text
Ctrl + C
```

------------------------------------------------------------------------

**Project:** BloodLink -- Blockchain-Based Blood Bank Management and
Traceability System\
**Local folder:** `C:\Users\palas\BloodBankBackend`\
**Local website:** `http://localhost:5000`\
**Database:** `BloodBankDB`\
**Blockchain:** Ethereum Sepolia Testnet
