import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Mock Data
  const pools = [
    {
      name: "tank",
      size: "40T",
      alloc: "12.4T",
      free: "27.6T",
      cap: 31,
      health: "ONLINE",
      raidType: "RAIDZ2",
    },
  ];

  const datasets = [
    {
      id: "1",
      name: "tank/data",
      used: "5.2T",
      avail: "27.6T",
      refer: "5.2T",
      mountpoint: "/mnt/tank/data",
      compression: "lz4",
      dedup: "off",
      readonly: false,
    },
    {
      id: "2",
      name: "tank/backups",
      used: "4.1T",
      avail: "27.6T",
      refer: "4.1T",
      mountpoint: "/mnt/tank/backups",
      compression: "gzip",
      dedup: "off",
      readonly: false,
    },
    {
      id: "3",
      name: "tank/media",
      used: "3.1T",
      avail: "27.6T",
      refer: "3.1T",
      mountpoint: "/mnt/tank/media",
      compression: "lz4",
      dedup: "off",
      readonly: true,
    },
  ];

  const acls = {
    "1": [
      { id: "a1", type: "user", name: "admin", permissions: ["read", "write", "execute"], inheritance: "all" },
      { id: "a2", type: "group", name: "users", permissions: ["read"], inheritance: "none" },
    ],
  };

  // API Routes
  app.get("/api/pools", (req, res) => res.json(pools));
  app.get("/api/datasets", (req, res) => res.json(datasets));
  app.get("/api/datasets/:id/acl", (req, res) => {
    const { id } = req.params;
    res.json(acls[id as keyof typeof acls] || []);
  });

  app.get("/api/stats/disk", (req, res) => {
    const stats = Array.from({ length: 20 }, (_, i) => ({
      timestamp: new Date(Date.now() - (19 - i) * 5000).toISOString(),
      read: Math.floor(Math.random() * 500) + 100,
      write: Math.floor(Math.random() * 300) + 50,
      iops: Math.floor(Math.random() * 2000) + 500,
    }));
    res.json(stats);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`ZFS Nexus Server running on http://localhost:${PORT}`);
  });
}

startServer();
