const express = require("express");
const multer = require("multer");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const cors = require("cors");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const Uploader = require("./Uploader");

const app = express();
const PORT = process.env.PORT || 3000;
const upload = multer({ storage: multer.memoryStorage() });
const uploaderInstance = new Uploader();

const JWT_SECRET = "GHOST_SUBMUNDO_EXPRESS_RENDER_2026";
const DB_FILE = path.join(__dirname, "db.json");

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function loadDB() {
  if (!fs.existsSync(DB_FILE)) {
    const initialData = {
      users: [],
      products: [
        { id: 1, name: "Espada Sombria", rarity: "Lendário", price: 1500, image: "https://images.unsplash.com/photo-1580610447943-eebd4a3b5c44?auto=format&fit=crop&w=300&q=80" },
        { id: 2, name: "Arma de Energia", rarity: "Épico", price: 1250, image: "https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=300&q=80" },
        { id: 3, name: "Capuz do Fantasma", rarity: "Lendário", price: 800, image: "https://images.unsplash.com/photo-1509248961158-e54f6934749c?auto=format&fit=crop&w=300&q=80" },
        { id: 4, name: "Asas Neon", rarity: "Épico", price: 950, image: "https://images.unsplash.com/photo-1550684848-fac1c5b4e853?auto=format&fit=crop&w=300&q=80" },
        { id: 5, name: "Orbe do Caos", rarity: "Mítico", price: 2000, image: "https://images.unsplash.com/photo-1518709268805-4e9042af9f23?auto=format&fit=crop&w=300&q=80" }
      ],
      promoCodes: []
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2));
    return initialData;
  }
  try {
    return JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
  } catch (e) {
    return { users: [], products: [], promoCodes: [] };
  }
}

function saveDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Token não fornecido." });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: "Sessão expirada." });
    req.user = user;
    next();
  });
}

app.post("/api/register", async (req, res) => {
  const { username, password, isMaster } = req.body;
  if (!username || !password) return res.status(400).json({ error: "Campos obrigatórios ausentes." });

  const db = loadDB();
  const exists = db.users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (exists) return res.status(400).json({ error: "Este usuário já está cadastrado." });

  const hashedPassword = await bcrypt.hash(password, 10);
  const user = {
    id: Date.now(),
    username,
    password: hashedPassword,
    role: isMaster ? "MASTER" : "USER",
    saldoBancario: 15750.00,
    ghostCoins: 8250
  };
  db.users.push(user);
  saveDB(db);
  res.status(201).json({ success: true });
});

app.post("/api/login", async (req, res) => {
  const { username, password } = req.body;
  const db = loadDB();
  const user = db.users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(400).json({ error: "Usuário ou senha incorretos." });
  }

  const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ token, role: user.role, username: user.username });
});

app.get("/api/user/profile", authenticateToken, (req, res) => {
  const db = loadDB();
  const user = db.users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: "Perfil não encontrado." });
  res.json({
    username: user.username,
    role: user.role,
    saldoBancario: user.saldoBancario,
    ghostCoins: user.ghostCoins
  });
});

app.get("/api/products", (req, res) => {
  const db = loadDB();
  res.json(db.products);
});

app.post("/api/products/create", authenticateToken, upload.single("image"), async (req, res) => {
  if (req.user.role !== "MASTER") return res.status(403).json({ error: "Acesso restrito MASTER." });
  
  try {
    const { name, rarity, price } = req.body;
    if (!name || !rarity || !price || !req.file) {
      return res.status(400).json({ error: "Todos os campos e a imagem são obrigatórios." });
    }

    const remoteUrl = await uploaderInstance.catbox(req.file.buffer);
    const db = loadDB();

    const newProduct = {
      id: Date.now(),
      name,
      rarity,
      price: parseInt(price),
      image: remoteUrl
    };
    db.products.push(newProduct);
    saveDB(db);
    res.status(201).json({ success: true, product: newProduct });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/admin/generate-code", authenticateToken, (req, res) => {
  if (req.user.role !== "MASTER") return res.status(403).json({ error: "Restrito MASTER." });
  
  const { amount, type } = req.body;
  if (!amount || !type) return res.status(400).json({ error: "Parâmetros inválidos." });

  const code = "GHOST-" + crypto.randomBytes(4).toString("hex").toUpperCase();
  const db = loadDB();
  db.promoCodes.push({ code, amount: parseFloat(amount), type, active: true });
  saveDB(db);
  res.json({ code });
});

app.post("/api/user/redeem-code", authenticateToken, (req, res) => {
  const { code } = req.body;
  const db = loadDB();
  const promo = db.promoCodes.find(p => p.code === code.toUpperCase() && p.active);
  if (!promo) return res.status(400).json({ error: "Código inválido, expirado ou já utilizado." });

  const user = db.users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: "Usuário não encontrado." });

  if (promo.type === "GC") user.ghostCoins += promo.amount;
  if (promo.type === "BRL") user.saldoBancario += promo.amount;

  promo.active = false;
  saveDB(db);
  res.json({ success: true, message: `Código ativado! +${promo.amount} ${promo.type} adicionados.` });
});

app.post("/api/bank/buy-gc", authenticateToken, (req, res) => {
  const { amountGC } = req.body;
  const numericAmount = parseInt(amountGC);
  if (isNaN(numericAmount) || numericAmount <= 0) return res.status(400).json({ error: "Quantidade inválida." });
  
  const cost = numericAmount * 0.10;
  const db = loadDB();
  const user = db.users.find(u => u.id === req.user.id);

  if (user.saldoBancario < cost) return res.status(400).json({ error: "Saldo em R$ insuficiente para concluir a conversão." });

  user.saldoBancario -= cost;
  user.ghostCoins += numericAmount;
  saveDB(db);
  res.json({ success: true });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Servidor ativo na porta ${PORT}`);
});
