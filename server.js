const express = require("express");
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");
const app = express();
app.use(bodyParser.json());
app.use(express.static("public"));

const packagesFile = path.join(__dirname, "packages.json");

// --- Utility functions ---
function readPackages() {
  if (!fs.existsSync(packagesFile)) return [];
  return JSON.parse(fs.readFileSync(packagesFile));
}

function writePackages(pkgs) {
  fs.writeFileSync(packagesFile, JSON.stringify(pkgs, null, 2));
}

// --- Session management ---
let activeSessions = {}; // sessionKey -> { employee, location, scans: [] }

// --- API: Create Package ---
app.post("/api/package/create", (req, res) => {
  const { customerName, recipientName, destination } = req.body;
  const packages = readPackages();
  const packageId = Math.random().toString(16).substr(2, 8);
  const trackingNumber = Math.random().toString(36).substr(2, 8).toUpperCase();
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
        internalStatus: "created",
        publicStatus: "Order Created",
        notes: ""
      }
    ]
  };
  packages.push(pkg);
  writePackages(packages);
  res.json({ message: "Package created", package: pkg });
});

// --- API: Start Session ---
app.post("/api/session/start", (req, res) => {
  const { sessionKey, employee, location } = req.body;
  if (!sessionKey || !employee || !location)
    return res.status(400).json({ error: "Missing required fields" });
  activeSessions[sessionKey] = { employee, location, scans: [] };
  res.json({ message: `Session ${sessionKey} started` });
});

// --- API: End Session ---
app.post("/api/session/end", (req, res) => {
  const { sessionKey } = req.body;
  if (!sessionKey || !activeSessions[sessionKey])
    return res.status(400).json({ error: "Session does not exist" });
  delete activeSessions[sessionKey];
  res.json({ message: `Session ${sessionKey} ended` });
});

// --- API: Scan Package ---
app.post("/api/package/scan", (req, res) => {
  const { sessionKey, barcode, action, location, employee, notes } = req.body;
  if (!sessionKey || !barcode || !action || !location || !employee)
    return res.status(400).json({ error: "Missing required fields" });

  // Check if session exists
  if (!activeSessions[sessionKey])
    return res.status(400).json({ error: "Session does not exist or ended" });

  const packages = readPackages();
  const pkg = packages.find(p => p.packageId === barcode);
  if (!pkg) return res.status(404).json({ error: "Package not found" });

  // Update package
  pkg.currentPublicStatus = action;
  const checkpoint = {
    order: pkg.checkpoints.length + 1,
    locationName: location,
    timestamp: new Date(),
    scannedBy: employee,
    publicStatus: action,
    notes: notes || "",
    sessionKey
  };
  pkg.checkpoints.push(checkpoint);
  writePackages(packages);

  // Store scan in session
  activeSessions[sessionKey].scans.push({ barcode, action, timestamp: new Date() });

  res.json({ message: "Package updated", package: pkg });
});

// --- API: Get active session scans ---
app.get("/api/session/:sessionKey/scans", (req, res) => {
  const session = activeSessions[req.params.sessionKey];
  if (!session) return res.status(404).json({ error: "Session not found" });
  res.json({ scans: session.scans });
});

app.listen(3000, () => console.log("Server running on port 3000"));
