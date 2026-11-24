# BloodLink – Blood Bank Management and Traceability System

## 1. Project Overview

BloodLink is a blood bank management and traceability prototype designed to manage blood donations, blood inventory, hospital requests, and blood unit tracking.

The system combines a web application, MongoDB database, and Ethereum blockchain integration to maintain blood unit records and track their status throughout the workflow.

## 2. Technologies Used

- Frontend: HTML, CSS, JavaScript
- Backend: Node.js and Express.js
- Database: MongoDB with Mongoose
- Blockchain: Solidity and Ethereum Sepolia Test Network
- Wallet: MetaMask
- Smart Contract Interaction: ethers.js
- QR Code Generation: QRCode.js

## 3. User Roles

### Admin
- Admin login
- Create Blood Bank and Hospital accounts
- View and manage registered users
- Activate or deactivate accounts
- Manage blood inventory

### Blood Bank
- View blood inventory
- Register blood units
- Update blood unit status
- Connect MetaMask
- Interact with the deployed smart contract
- View expiry alerts
- View and process hospital requests
- Approve and dispatch blood requests
- Generate QR codes for blood unit tracking

### Hospital
- View available Blood Banks
- Submit blood requests
- View request history
- Confirm receipt of dispatched blood units

### Donor
- Register and log in
- View donor dashboard
- View donation history

## 4. Main Features

### User Authentication
- Role-based login
- Password hashing
- JWT-based authentication
- HTTP-only authentication cookies
- Protected dashboard routes
- Active and inactive account handling

### Blood Unit Management
- Register blood units
- Store blood group and component information
- Record collection and expiry dates
- Track blood unit status
- Prevent invalid status transitions

### Hospital Request Management
- Hospitals can submit blood requests.
- Blood Banks can approve or reject requests.
- Matching blood units can be reserved.
- Blood Banks can dispatch allocated units.
- Hospitals can confirm receipt.

### Expiry Alerts
- Identify expired blood units.
- Display units approaching their expiry date.
- Restrict expiry information according to user roles.

### QR Code Tracking
- Generate QR codes for registered blood units.
- Provide a public tracking page for blood unit status.
- Display tracking information without exposing unnecessary internal records.

### Blockchain Integration
- Solidity smart contract deployed on Ethereum Sepolia.
- MetaMask wallet connection on the Blood Bank Dashboard.
- Authorized blood bank wallets.
- On-chain blood unit registration.
- On-chain status updates.
- Blockchain events for registration and status changes.

## 5. Blood Unit Status Workflow

The smart contract supports the following statuses:

1. Collected
2. TestingPending
3. Available
4. Reserved
5. Dispatched
6. Received
7. Rejected
8. Expired
9. Recalled

The smart contract validates permitted status transitions before updating a blood unit.

## 6. Project Structure

```text
BloodBankBackend/
│
├── middleware/
│   └── auth.js
│
├── models/
│   ├── User.js
│   ├── BloodUnit.js
│   └── BloodRequest.js
│
├── routes/
│   ├── auth.js
│   ├── expiry.js
│   ├── requests.js
│   └── tracking.js
│
├── public/
│   ├── index.html
│   ├── login.html
│   ├── register.html
│   ├── donor.html
│   ├── bloodbank.html
│   ├── hospital.html
│   ├── track.html
│   ├── privacy.html
│   ├── terms.html
│   ├── app.js
│   ├── donor.js
│   ├── bloodbank.js
│   ├── hospital.js
│   ├── requests.js
│   ├── login.js
│   ├── register.js
│   ├── styles.css
│   └── contract-abi.json
│
├── createAdmin.js
├── server.js
├── package.json
├── package-lock.json
├── README.md
└── .gitignore
```

## 7. Installation and Setup

### Requirements

- Node.js and npm
- MongoDB Community Server
- MetaMask browser extension
- Remix IDE (for smart contract development)

### Step 1: Clone the Repository

```bash
git clone YOUR_GITHUB_REPOSITORY_URL
cd BloodBankBackend
```

### Step 2: Install Dependencies

```bash
npm install
```

### Step 3: Configure Environment Variables

Create a `.env` file in the project root.

Configure the following values according to your local setup:

```env
PORT=5000
MONGO_URI=mongodb://127.0.0.1:27017/BloodBankDB
JWT_SECRET=YOUR_LONG_RANDOM_SECRET
ADMIN_NAME=Administrator
ADMIN_EMAIL=admin@example.com
ADMIN_PASSWORD=YOUR_STRONG_PASSWORD
```

Do not upload the `.env` file to GitHub.

### Step 4: Create the Admin Account

```bash
node createAdmin.js
```

The script creates an administrator account if one does not already exist.

### Step 5: Start the Application

```bash
npm start
```

Open the application:

```text
http://localhost:5000
```

## 8. Blockchain Setup

1. Open Remix IDE.
2. Open the BloodLink Solidity smart contract.
3. Compile using a compatible Solidity 0.8.x compiler.
4. Connect MetaMask to the Sepolia test network.
5. Use the existing deployed contract address and matching ABI.
6. Authorize the required Blood Bank wallet through the contract owner account.

The application uses the deployed contract address configured in `public/app.js` and its ABI in `public/contract-abi.json`.

Do not deploy a replacement contract without updating and verifying the frontend configuration.

Sepolia Etherscan:

https://sepolia.etherscan.io/

## 9. Important Notes

- This project is a prototype and is not intended for real-world medical or blood bank operations.
- Use synthetic donor, hospital, and blood unit data during testing.
- MongoDB stores application records, while the smart contract records supported blockchain operations.
- MongoDB and blockchain updates are separate operations and can become inconsistent if one succeeds and the other fails.
- Hospital receipt confirmation currently uses the backend request workflow. A separate hospital-authorized blockchain confirmation mechanism is not yet implemented.
- The local MongoDB setup may run as a standalone server and does not provide multi-document transactions.

## 10. Security Considerations

- Never upload `.env` or private keys.
- Never store MetaMask private keys in frontend code.
- Use strong passwords and JWT secrets.
- Restrict API access based on user roles.
- Validate user input on the backend.
- Use synthetic data for demonstrations and testing.

## 11. Future Improvements

- Backend-authorized hospital receipt confirmation on the blockchain.
- Secure random QR tracking tokens.
- Improved synchronization between MongoDB and blockchain.
- Better recovery handling for interrupted request workflows.
- Additional automated security and integration tests.

## 12. Project Purpose

BloodLink demonstrates how web technologies, database management, and blockchain can be combined to improve blood inventory management, request processing, and blood unit traceability.