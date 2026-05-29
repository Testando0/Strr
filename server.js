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

// Configuração do Multer armazenando em memória para repasse imediato ao Uploader
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
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
        { id: 101, name: "Espada Sombria", rarity: "Lendário", price: 1500, image: "https://images.unsplash.com/photo-1580610447943-eebd4a3b5c44?w=400" },
        { id: 102, name: "Arma de Energia", rarity: "Épico", price: 1250, image: "https://images.unsplash.com/photo-1595590424283-b8f17842773f?w=400" },
        { id: 103, name: "Capuz do Fantasma", rarity: "Lendário", price: 800, image: "https://images.unsplash.com/photo-1509248961158-e54f6934749c?w=400" }
      ],
      promoCodes: []
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2));
    return initialData;
  }
  return JSON.parse(fs.readFileSync(DB_FILE, "utf-8"));
}

function saveDB(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];
  if (!token) return res.status(401).json({ error: "Chave de sessão ausente." });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: "Sessão expirada ou revogada." });
    req.user = user;
    next();
  });
}

// ENDPOINTS DO SISTEMA
app.post("/api/register", async (req, res) => {
  const { username, password, isMaster } = req.body;
  if (!username || !password) return res.status(400).json({ error: "Parâmetros incompletos." });

  const db = loadDB();
  if (db.users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
    return res.status(400).json({ error: "Este codinome já está em uso na rede." });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const user = {
    id: Date.now(),
    username,
    password: hashedPassword,
    role: isMaster ? "MASTER" : "USER",
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
    return res.status(400).json({ error: "Credenciais de acesso incorretas." });
  }
  
  const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
  res.json({ token, role: user.role });
});

app.get("/api/user/profile", authenticateToken, (req, res) => {
  const db = loadDB();
  const user = db.users.find(u => u.id === req.user.id);
  if (!user) return res.status(404).json({ error: "Perfil não localizado." });
  res.json({ username: user.username, role: user.role, ghostCoins: user.ghostCoins });
});

app.get("/api/products", (req, res) => {
  res.json(loadDB().products);
});

// UPLOAD REAL DE IMAGENS MULTIPART E ENVIO AO CATBOX
app.post("/api/products/create", authenticateToken, upload.single("image"), async (req, res) => {
  if (req.user.role !== "MASTER") return res.status(403).json({ error: "Permissão MASTER exigida." });
  
  try {
    const { name, rarity, price } = req.body;
    if (!name || !rarity || !price || !req.file) {
      return res.status(400).json({ error: "Dados cadastrais ou arquivo de imagem ausentes." });
    }

    // Processamento do buffer binário da imagem enviado pelo formulário frontend
    const remoteUrl = await uploaderInstance.catbox(req.file.buffer);
    
    const db = loadDB();
    const newProduct = {
      id: Date.now(),
      name,
      rarity,
      price: parseInt(price),
      image: remoteUrl
    };
    
    db.products.unshift(newProduct);
    saveDB(db);
    res.status(201).json({ success: true });
  } catch (err) {
    res.status(500).json({ error: `Falha crítica no upload: ${err.message}` });
  }
});

app.post("/api/admin/generate-code", authenticateToken, (req, res) => {
  if (req.user.role !== "MASTER") return res.status(403).json({ error: "Acesso administrativo negado." });
  const { amount, type } = req.body;

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
  if (!promo) return res.status(400).json({ error: "Código promocional inválido ou já resgatado." });

  const user = db.users.find(u => u.id === req.user.id);
  user.ghostCoins += promo.amount;
  promo.active = false;
  saveDB(db);
  res.json({ success: true, message: `Código ativado! +${promo.amount} GC creditados.` });
});

app.get("*", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Servidor de Loja ativo e escutando na porta ${PORT}`);
});
