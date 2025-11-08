// server/server.js

import express from "express";
import bodyParser from "body-parser";
import fs from "fs";
import path from "path";
import crypto from "crypto";

const app = express();
const PORT = process.env.PORT || 3000;

// Paths for data storage
const dataPath = path.join(process.cwd(), "data/packages.json");
const sessionPath = path.join(process.cwd(), "data/keys.json");

// Middleware
app.use(bodyParser.json());

// Ensure data files exist
if (!fs.existsSync("data")) fs.mkdirSync("data");
if (!fs.existsSync(dataPath)) fs.writeFileSync(dataPath, JSON.stringify([]));
if (!fs.existsSync(sessionPath)) fs.writeFileSync(sessionPath, JSON.stringify([]));

// --- Helper functions ---
const readData = () => JSON.parse(fs.readFileSync(dataPath));
const writeData = (data) => fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));

const readSessions = () => JSON.parse(fs.readFileSync(sessionPath));
const writeSessions = (data) => fs.writeFileSync(sessionPath, JSON.stringify(data, null, 2));

const generateBarcode = () => crypto.randomBytes(4).toString("hex");

// --- API Endpoints ---

// 1️⃣ Test route
app.get("/api/test", (req, res) => {
  res.json({ message: "Home Amazon V2 server running ✅" });
});

// 2️⃣ Create a new package
app.post("/api/package/create", (req, res) => {
  const { customerName, recipientName, destination, details } = req.body;
  if (!customerName || !recipientName || !destination)
    return res.status(400).json({ error: "Missing required fields" });

  const packages = readData();
  const barcode = generateBarcode();
  const newPackage = {
    packageId: barcode,
    customerName,
    recipientName,
    destination,
    details: details || {},
    currentInternalStatus: "created",
    currentPublicStatus: "Order Created",
    checkpoints: [
      {
        order: 1,
        locationType: "store",
        locationName: "Front Desk",
        timestamp: new Date(),
        internalStatus: "created",
        publicStatus: "Order Created",
        notes: ""
      }
    ]
  };

  packages.push(newPackage);
  writeData(packages);

  res.json({ message: "Package created", package: newPackage });
});

// 3️⃣ Scan a package and update status
app.post("/api/package/scan", (req, res) => {
  const { sessionKey, barcode, action, location, employee, notes } = req.body;
  if (!sessionKey || !barcode || !action || !location || !employee)
    return res.status(400).json({ error: "Missing required fields" });

  const packages = readData();
  const pkg = packages.find(p => p.packageId === barcode);
  if (!pkg) return res.status(404).json({ error: "Package not found" });

  // Update internal status
  pkg.currentInternalStatus = action;

  // Map internal to public status
  const publicMap = {
    created: "Order Created",
    in_store: "In Store Processing",
    assigned_destination: "In Transit",
    en_route_to_warehouse: "In Transit",
    arrived_at_warehouse: "In Transit",
    stored_in_warehouse: "In Transit",
    ready_for_dispatch: "In Transit",
    out_for_delivery: "Out for Delivery",
    delivered: "Delivered",
    failed_delivery: "Delivery Attempted",
    returned_to_sender: "Returned to Sender"
  };
  pkg.currentPublicStatus = publicMap[action] || "In Transit";

  // Add checkpoint
  const checkpoint = {
    order: pkg.checkpoints.length + 1,
    locationType: "warehouse",
    locationName: location,
    timestamp: new Date(),
    scannedBy: employee,
    internalStatus: action,
    publicStatus: pkg.currentPublicStatus,
    notes: notes || ""
  };
  pkg.checkpoints.push(checkpoint);

  writeData(packages);
  res.json({ message: "Package updated", package: pkg });
});

// 4️⃣ Get package info by barcode
app.get("/api/package/:barcode", (req, res) => {
  const { barcode } = req.params;
  const packages = readData();
  const pkg = packages.find(p => p.packageId === barcode);
  if (!pkg) return res.status(404).json({ error: "Package not found" });
  res.json(pkg);
});

// 5️⃣ Start a scanning session
app.post("/api/session/start", (req, res) => {
  const { key, role } = req.body;
  if (!key || !role) return res.status(400).json({ error: "Missing key or role" });

  const sessions = readSessions();
  if (sessions.find(s => s.key === key))
    return res.status(400).json({ error: "Key already exists" });

  const newSession = { key, role, devices: [], status: "active" };
  sessions.push(newSession);
  writeSessions(sessions);
  res.json({ message: "Session started", session: newSession });
});

// 6️⃣ Join a scanning session
app.post("/api/session/join", (req, res) => {
  const { key, deviceName } = req.body;
  if (!key || !deviceName)
    return res.status(400).json({ error: "Missing key or deviceName" });

  const sessions = readSessions();
  const session = sessions.find(s => s.key === key && s.status === "active");
  if (!session)
    return res.status(404).json({ error: "Session not found or inactive" });

  if (!session.devices.includes(deviceName)) session.devices.push(deviceName);
  writeSessions(sessions);
  res.json({ message: "Joined session", session });
});

// Start the server
app.listen(PORT, () => {
  console.log(`🚀 Home Amazon V2 running on port ${PORT}`);
});
