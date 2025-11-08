// server/server.js

import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import bodyParser from "body-parser";
import fs from "fs";

const app = express();
const PORT = process.env.PORT || 3000;

// Setup paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const publicPath = path.join(__dirname, "../public");
const dataPath = path.join(__dirname, "../data/packages.json");

// Middleware
app.use(bodyParser.json());
app.use(express.static(publicPath));

// Create data file if it doesn't exist
if (!fs.existsSync(dataPath)) {
  fs.writeFileSync(dataPath, JSON.stringify([]));
}

// Default route
app.get("/", (req, res) => {
  res.sendFile(path.join(publicPath, "index.html"));
});

// Temporary route to test the server
app.get("/api/test", (req, res) => {
  res.json({ message: "Home Amazon V2 server is running ✅" });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Home Amazon V2 running on port ${PORT}`);
});
