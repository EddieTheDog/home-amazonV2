import express from "express";
import bodyParser from "body-parser";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import QRCode from "qrcode";
import bwipjs from "bwip-js";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

const packagesFile = path.join(__dirname, "packages.json");
const keysFile = path.join(__dirname, "keys.json");

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

// Ensure data files exist
if (!fs.existsSync(packagesFile)) fs.writeFileSync(packagesFile, JSON.stringify([]));
if (!fs.existsSync(keysFile)) fs.writeFileSync(keysFile, JSON.stringify([]));

const readPackages = () => JSON.parse(fs.readFileSync(packagesFile));
const writePackages = (data) => fs.writeFileSync(packagesFile, JSON.stringify(data, null, 2));
const readKeys = () => JSON.parse(fs.readFileSync(keysFile));
const writeKeys = (data) => fs.writeFileSync(keysFile, JSON.stringify(data, null, 2));

function generateBarcode() {
  return crypto.randomBytes(4).toString("hex");
}

function generateTrackingNumber() {
  return "TRK-" + Math.floor(100000 + Math.random() * 900000);
}

// Friendly URLs
app.get("/frontdesk", (req, res) => res.sendFile(path.join(__dirname, "public", "frontdesk.html")));
app.get("/warehouse", (req, res) => res.sendFile(path.join(__dirname, "public", "warehouse.html")));
app.get("/scan", (req, res) => res.sendFile(path.join(__dirname, "public", "scan.html")));
app.get("/store-support", (req, res) => res.sendFile(path.join(__dirname, "public", "store-support.html")));
app.get("/urls", (req, res) => res.sendFile(path.join(__dirname, "public", "urls.html")));
app.get("/tracking/:trackingNumber", (req, res) => res.sendFile(path.join(__dirname, "public", "tracking.html")));

// Test
app.get("/api/test", (req, res) => res.json({ message: "Home Amazon V2 running ✅" }));

// Barcode endpoint
app.get("/api/barcode/:code", async (req, res) => {
  try {
    bwipjs.toBuffer({
      bcid: "code128",
      text: req.params.code,
      scale: 3,
      height: 10,
      includetext: true,
      textxalign: "center",
    }, (err, png) => {
      if (err) return res.status(500).send("Error generating barcode");
      res.type("image/png");
      res.send(png);
    });
  } catch {
    res.status(500).send("Server error");
  }
});

// QR Code endpoint
app.get("/api/qrcode/:code", async (req, res) => {
  try {
    const url = `${req.protocol}://${req.get('host')}/tracking/${req.params.code}`;
    const qr = await QRCode.toDataURL(url);
    const base64Data = qr.replace(/^data:image\/png;base64,/, "");
    const imgBuffer = Buffer.from(base64Data, "base64");
    res.type("image/png");
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

  const packages = readPackages();
  const barcode = generateBarcode();
  const trackingNumber = generateTrackingNumber();
  const barcodeUrl = `/api/barcode/${barcode}`;
  const qrUrl = `/api/qrcode/${barcode}`;

  const newPackage = {
    packageId: barcode,
    trackingNumber,
    customerName,
    recipientName,
    destination,
    details: details || {},
    barcodeUrl,
    qrUrl,
    currentPublicStatus: "Order Created",
    checkpoints: [
      { order: 1, locationName: "Front Desk", publicStatus: "Order Created", timestamp: new Date() }
    ]
  };

  packages.push(newPackage);
  writePackages(packages);

  res.json({ message: "Package created", package: newPackage });
});

// Scan package (update status)
app.post("/api/package/scan", (req, res) => {
  const { sessionKey, barcode, action, location, employee, notes } = req.body;
  if (!sessionKey || !barcode || !action || !location || !employee)
    return res.status(400).json({ error: "Missing required fields" });

  const packages = readPackages();
  const pkg = packages.find(p => p.packageId === barcode);
  if (!pkg) return res.status(404).json({ error: "Package not found" });

  pkg.currentPublicStatus = action;

  pkg.checkpoints.push({
    order: pkg.checkpoints.length + 1,
    locationName: location,
    timestamp: new Date(),
    scannedBy: employee,
    publicStatus: action,
    notes: notes || ""
  });

  writePackages(packages);
  res.json({ message: "Package updated", package: pkg });
});

// Get package by tracking number
app.get("/api/package/tracking/:trackingNumber", (req, res) => {
  const packages = readPackages();
  const pkg = packages.find(p => p.trackingNumber === req.params.trackingNumber);
  if (!pkg) return res.status(404).json({ error: "Package not found" });
  res.json(pkg);
});

app.listen(PORT, () => console.log(`🚀 Home Amazon V2 running on port ${PORT}`));
