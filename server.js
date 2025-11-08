import express from "express";
import bodyParser from "body-parser";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import QRCode from "qrcode";
import bwipjs from "bwip-js";

const app = express();
const PORT = process.env.PORT || 3000;

const dataPath = path.join(process.cwd(), "packages.json");
const sessionPath = path.join(process.cwd(), "keys.json");

app.use(bodyParser.json());
app.use(express.static(path.join(process.cwd(), "public")));

// Ensure data files exist
if (!fs.existsSync(dataPath)) fs.writeFileSync(dataPath, JSON.stringify([]));
if (!fs.existsSync(sessionPath)) fs.writeFileSync(sessionPath, JSON.stringify([]));

const readData = () => JSON.parse(fs.readFileSync(dataPath));
const writeData = (data) => fs.writeFileSync(dataPath, JSON.stringify(data, null, 2));
const readSessions = () => JSON.parse(fs.readFileSync(sessionPath));
const writeSessions = (data) => fs.writeFileSync(sessionPath, JSON.stringify(data, null, 2));

const generateBarcode = () => crypto.randomBytes(4).toString("hex");

// Test endpoint
app.get("/api/test", (req, res) => res.json({ message: "Home Amazon V2 running ✅" }));

// Barcode image
app.get("/api/barcode/:code", async (req, res) => {
  try {
    bwipjs.toBuffer({
      bcid: 'code128',
      text: req.params.code,
      scale: 3,
      height: 10,
      includetext: true,
      textxalign: 'center',
    }, function (err, png) {
      if (err) return res.status(500).send("Error generating barcode");
      res.type('image/png');
      res.send(png);
    });
  } catch {
    res.status(500).send("Server error");
  }
});

// QR code image
app.get("/api/qrcode/:code", async (req, res) => {
  try {
    const url = `${req.protocol}://${req.get('host')}/tracking.html?barcode=${req.params.code}`;
    const qr = await QRCode.toDataURL(url);
    const base64Data = qr.replace(/^data:image\/png;base64,/, "");
    const imgBuffer = Buffer.from(base64Data, "base64");
    res.type('image/png');
    res.send(imgBuffer);
  } catch {
    res.status(500).send("Error generating QR code");
  }
});

// Create package
app.post("/api/package/create", (req, res) => {
  const { customerName, recipientName, destination, details } = req.body;
  if (!customerName || !recipientName || !destination)
    return res.status(400).json({ error: "Missing required fields" });

  const packages = readData();
  const barcode = generateBarcode();
  const barcodeUrl = `/api/barcode/${barcode}`;
  const qrUrl = `/api/qrcode/${barcode}`;

  const newPackage = {
    packageId: barcode,
    customerName,
    recipientName,
    destination,
    details: details || {},
    barcodeUrl,
    qrUrl,
    currentInternalStatus: "created",
    currentPublicStatus: "Order Created",
    checkpoints: [
      { order: 1, locationType: "store", locationName: "Front Desk", timestamp: new Date(), internalStatus: "created", publicStatus: "Order Created", notes: "" }
    ]
  };

  packages.push(newPackage);
  writeData(packages);
  res.json({ message: "Package created", package: newPackage });
});

// Scan package
app.post("/api/package/scan", (req, res) => {
  const { sessionKey, barcode, action, location, employee, notes } = req.body;
  if (!sessionKey || !barcode || !action || !location || !employee)
    return res.status(400).json({ error: "Missing required fields" });

  const packages = readData();
  const pkg = packages.find(p => p.packageId === barcode);
  if (!pkg) return res.status(404).json({ error: "Package not found" });

  pkg.currentInternalStatus = action;
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

// Track package
app.get("/api/package/:barcode", (req, res) => {
  const packages = readData();
  const pkg = packages.find(p => p.packageId === req.params.barcode);
  if (!pkg) return res.status(404).json({ error: "Package not found" });
  res.json(pkg);
});

// Sessions
app.post("/api/session/start", (req, res) => {
  const { key, role } = req.body;
  if (!key || !role) return res.status(400).json({ error: "Missing key or role" });

  const sessions = readSessions();
  if (sessions.find(s => s.key === key)) return res.status(400).json({ error: "Key already exists" });

  const newSession = { key, role, devices: [], status: "active" };
  sessions.push(newSession);
  writeSessions(sessions);
  res.json({ message: "Session started", session: newSession });
});

app.post("/api/session/join", (req, res) => {
  const { key, deviceName } = req.body;
  if (!key || !deviceName) return res.status(400).json({ error: "Missing key or deviceName" });

  const sessions = readSessions();
  const session = sessions.find(s => s.key === key && s.status === "active");
  if (!session) return res.status(404).json({ error: "Session not found or inactive" });

  if (!session.devices.includes(deviceName)) session.devices.push(deviceName);
  writeSessions(sessions);
  res.json({ message: "Joined session", session });
});

app.listen(PORT, () => console.log(`🚀 Home Amazon V2 running on port ${PORT}`));
