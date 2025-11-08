const express = require("express");
const bodyParser = require("body-parser");
const { v4: uuidv4 } = require("uuid");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(bodyParser.json());
app.use(express.static("public"));

// In-memory session store
let activeSessions = {}; // { sessionKey: { employee, location, scans: [] } }

// File storage for packages
const PACKAGE_FILE = "packages.json";

function readPackages() {
  if (!fs.existsSync(PACKAGE_FILE)) return [];
  return JSON.parse(fs.readFileSync(PACKAGE_FILE));
}

function writePackages(packages) {
  fs.writeFileSync(PACKAGE_FILE, JSON.stringify(packages, null, 2));
}

// Create package (front desk)
app.post("/api/package/create", (req, res) => {
  const { customerName, recipientName, destination } = req.body;
  const packages = readPackages();
  const packageId = uuidv4().slice(0, 8);
  const trackingNumber = Math.floor(100000 + Math.random() * 900000).toString();
  const pkg = {
    packageId,
    trackingNumber,
    customerName,
    recipientName,
    destination,
    currentInternalStatus: "created",
    currentPublicStatus: "Order Created",
    checkpoints: [
      {
        order: 1,
        locationName: "Front Desk",
        timestamp: new Date(),
        publicStatus: "Order Created"
      }
    ]
  };
  packages.push(pkg);
  writePackages(packages);

  res.json({
    message: "Package created",
    package: pkg,
    barcodeUrl: `/api/barcode/${packageId}`,
    qrUrl: `/api/qrcode/${packageId}`
  });
});

// Start session
app.post("/api/session/start", (req, res) => {
  const { sessionKey, employee, location } = req.body;
  if (!sessionKey || !employee || !location) return res.status(400).json({ error: "Missing fields" });
  if (activeSessions[sessionKey]) return res.status(400).json({ error: "Session already exists" });

  activeSessions[sessionKey] = { employee, location, scans: [] };
  res.json({ message: `Session ${sessionKey} started`, session: activeSessions[sessionKey] });
});

// End session
app.post("/api/session/end", (req, res) => {
  const { sessionKey } = req.body;
  if (!activeSessions[sessionKey]) return res.status(404).json({ error: "Session not found" });

  delete activeSessions[sessionKey];
  res.json({ message: `Session ${sessionKey} ended` });
});

// Scan package (phone)
app.post("/api/package/scan", (req, res) => {
  const { sessionKey, barcode, action, location, employee } = req.body;
  if (!sessionKey || !barcode || !action || !location || !employee)
    return res.status(400).json({ error: "Missing required fields" });

  const session = activeSessions[sessionKey];
  if (!session) return res.status(400).json({ error: "Session does not exist or ended" });

  const packages = readPackages();
  const pkg = packages.find(p => p.packageId === barcode);
  if (!pkg) return res.status(404).json({ error: "Package not found" });

  const checkpoint = {
    order: pkg.checkpoints.length + 1,
    locationName: location,
    timestamp: new Date(),
    scannedBy: employee,
    publicStatus: action,
    sessionKey
  };

  pkg.currentPublicStatus = action;
  pkg.checkpoints.push(checkpoint);
  session.scans.push(checkpoint);
  writePackages(packages);

  res.json({ message: "Package updated", package: pkg });
});

// Get scans for session (laptop live)
app.get("/api/session/:sessionKey/scans", (req, res) => {
  const session = activeSessions[req.params.sessionKey];
  if (!session) return res.status(404).json({ error: "Session not found" });
  res.json(session.scans);
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
