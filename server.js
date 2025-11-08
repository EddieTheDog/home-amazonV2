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

// Data files
const packagesFile = path.join(__dirname, "packages.json");
const sessionsFile = path.join(__dirname, "sessions.json");

if (!fs.existsSync(packagesFile)) fs.writeFileSync(packagesFile, JSON.stringify([]));
if (!fs.existsSync(sessionsFile)) fs.writeFileSync(sessionsFile, JSON.stringify([]));

const readPackages = () => JSON.parse(fs.readFileSync(packagesFile));
const writePackages = (data) => fs.writeFileSync(packagesFile, JSON.stringify(data, null, 2));
const readSessions = () => JSON.parse(fs.readFileSync(sessionsFile));
const writeSessions = (data) => fs.writeFileSync(sessionsFile, JSON.stringify(data, null, 2));

function generateBarcode() { return crypto.randomBytes(4).toString("hex"); }
function generateTrackingNumber() { return "TRK-" + Math.floor(100000 + Math.random() * 900000); }
function generateSessionKey() { 
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const numbers = "0123456789";
    return letters[Math.floor(Math.random()*letters.length)] + numbers[Math.floor(Math.random()*numbers.length)];
}

// Static files
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, "public")));

// Friendly URLs
app.get("/frontdesk", (req,res)=>res.sendFile(path.join(__dirname,"public","frontdesk.html")));
app.get("/warehouse", (req,res)=>res.sendFile(path.join(__dirname,"public","warehouse.html")));
app.get("/scan", (req,res)=>res.sendFile(path.join(__dirname,"public","scan.html")));
app.get("/tracking/:trackingNumber", (req,res)=>res.sendFile(path.join(__dirname,"public","tracking.html")));
app.get("/urls", (req,res)=>res.sendFile(path.join(__dirname,"public","urls.html")));

// Barcode endpoint
app.get("/api/barcode/:code", async (req,res)=>{
    bwipjs.toBuffer({
        bcid:'code128',
        text:req.params.code,
        scale:3,
        height:10,
        includetext:true,
        textxalign:'center'
    }, (err,png)=>{
        if(err) return res.status(500).send("Error generating barcode");
        res.type("image/png"); res.send(png);
    });
});

// QR code endpoint
app.get("/api/qrcode/:code", async (req,res)=>{
    try {
        const url = `${req.protocol}://${req.get('host')}/tracking/${req.params.code}`;
        const qr = await QRCode.toDataURL(url);
        const base64Data = qr.replace(/^data:image\/png;base64,/,"");
        res.type("image/png").send(Buffer.from(base64Data,"base64"));
    } catch { res.status(500).send("Error generating QR code"); }
});

// ----------------- SESSION API -------------------

// Start session
app.post("/api/session/start", (req,res)=>{
    const { employee, location } = req.body;
    if(!employee || !location) return res.status(400).json({error:"Missing fields"});
    const sessions = readSessions();
    const sessionKey = generateSessionKey();
    sessions.push({ sessionKey, employee, location, deviceConnected:false, queue:[] });
    writeSessions(sessions);
    res.json({ message:"Session started", sessionKey });
});

// Join session queue
app.post("/api/session/join", (req,res)=>{
    const { sessionKey, deviceName } = req.body;
    if(!sessionKey || !deviceName) return res.status(400).json({error:"Missing fields"});
    const sessions = readSessions();
    const session = sessions.find(s=>s.sessionKey===sessionKey);
    if(!session) return res.status(404).json({error:"Session not found"});
    if(!session.queue.includes(deviceName)) session.queue.push(deviceName);
    writeSessions(sessions);
    res.json({ message:"Device joined queue", queue: session.queue });
});

// Connect device
app.post("/api/session/connect", (req,res)=>{
    const { sessionKey, deviceName } = req.body;
    const sessions = readSessions();
    const session = sessions.find(s=>s.sessionKey===sessionKey);
    if(!session) return res.status(404).json({error:"Session not found"});
    session.deviceConnected = true;
    session.connectedDevice = deviceName;
    writeSessions(sessions);
    res.json({ message:`Device ${deviceName} connected` });
});

// End session
app.post("/api/session/end", (req,res)=>{
    const { sessionKey } = req.body;
    const sessions = readSessions();
    const index = sessions.findIndex(s=>s.sessionKey===sessionKey);
    if(index===-1) return res.status(404).json({error:"Session not found"});
    sessions.splice(index,1);
    writeSessions(sessions);
    res.json({ message:"Session ended" });
});

// ----------------- PACKAGE SCAN -------------------
app.post("/api/package/scan", (req,res)=>{
    const { sessionKey, barcode, action, location, employee, notes } = req.body;
    if(!sessionKey || !barcode || !action || !location || !employee) 
        return res.status(400).json({error:"Missing required fields"});

    const sessions = readSessions();
    const session = sessions.find(s=>s.sessionKey===sessionKey);
    if(!session || !session.deviceConnected) return res.status(400).json({error:"No active session or device not connected"});

    const packages = readPackages();
    const pkg = packages.find(p=>p.packageId===barcode);
    if(!pkg) return res.status(404).json({error:"Package not found"});

    pkg.currentPublicStatus = action;
    pkg.checkpoints.push({
        order: pkg.checkpoints.length+1,
        locationName: location,
        scannedBy: employee,
        publicStatus: action,
        notes: notes || "",
        timestamp: new Date()
    });
    writePackages(packages);
    res.json({ message:"Package updated", package: pkg });
});

// Get package by tracking
app.get("/api/package/tracking/:trackingNumber",(req,res)=>{
    const packages = readPackages();
    const pkg = packages.find(p=>p.trackingNumber===req.params.trackingNumber);
    if(!pkg) return res.status(404).json({error:"Package not found"});
    res.json(pkg);
});

app.listen(PORT,()=>console.log(`🚀 Home Amazon V2 running on port ${PORT}`));
