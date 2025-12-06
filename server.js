import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import multer from "multer";
import bd from "./src/models/index.js";
import redisClient from "./src/config/redis.js";
import { supabase } from "./src/config/supabase.js";
import { authenticateToken } from "./src/middleware/auth.js";
import { comparePassword, generateToken } from "./src/config/auth.js";

dotenv.config();

const { Task, User } = bd;
const upload = multer({ storage: multer.memoryStorage() });

await bd.sequelize.sync();

const app = express();
const port = process.env.PORT || 3001;

app.use(express.json());
app.use(cors());

app.get("/", (req, res) => {
  res.json({ message: "Hello World" });
});

app.get("/tasks", async (req, res) => {
  const cached = await redisClient.get('tasks');
  if (cached) {
    console.log('Cache HIT - Tasks retrieved from Redis');
    return res.json(JSON.parse(cached));
  }
  
  console.log('Cache MISS - Fetching tasks from database');
  const tasks = await Task.findAll();
  await redisClient.setEx('tasks', 300, JSON.stringify(tasks));
  res.json(tasks);
});

app.get("/tasks/:id", async (req, res) => {
  const task = await Task.findByPk(req.params.id);
  if (!task) return res.status(404).json({ error: "Tarefa não encontrada" });
  res.json(task);
});

app.post("/tasks", async (req, res) => {
  const { description } = req.body;
  if (!description) return res.status(400).json({ error: "Descrição obrigatória" });
  const task = await Task.create({ description, completed: false });
  await redisClient.del('tasks');
  console.log('Cache INVALIDATED - Task created');
  res.status(201).json(task);
});

app.put("/tasks/:id", async (req, res) => {
  const { description, completed } = req.body;
  const task = await Task.findByPk(req.params.id);
  if (!task) return res.status(404).json({ error: "Tarefa não encontrada" });
  await task.update({ description, completed });
  await redisClient.del('tasks');
  console.log('Cache INVALIDATED - Task updated');
  res.json(task);
});

app.delete("/tasks/:id", async (req, res) => {
  const deleted = await Task.destroy({ where: { id: req.params.id } });
  if (!deleted) return res.status(404).json({ error: "Tarefa não encontrada" });
  await redisClient.del('tasks');
  console.log('Cache INVALIDATED - Task deleted');
  res.status(204).send();
});

app.post("/signin", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: "Email e senha obrigatórios" });
  
  const user = await User.findOne({ where: { email } });
  if (!user) return res.status(401).json({ error: "Credenciais inválidas" });
  
  const isValid = await comparePassword(password, user.password);
  if (!isValid) return res.status(401).json({ error: "Credenciais inválidas" });
  
  const token = generateToken({ id: user.id, email: user.email });
  res.json({ token, user: { id: user.id, name: user.name, email: user.email } });
});

app.post("/profile/photo", authenticateToken, upload.single('photo'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Foto obrigatória" });
  
  const fileName = `profile_${Date.now()}.${req.file.mimetype.split('/')[1]}`;
  
  const { data, error } = await supabase.storage
    .from('profiles')
    .upload(fileName, req.file.buffer, {
      contentType: req.file.mimetype
    });
  
  if (error) return res.status(500).json({ error: error.message });
  
  const { data: { publicUrl } } = supabase.storage
    .from('profiles')
    .getPublicUrl(fileName);
  
  res.json({ photoUrl: publicUrl });
});

app.listen(port, '0.0.0.0', () => {
  console.log(`Server is running on port ${port}`);
  console.log(`Database is running on port ${process.env.DB_PORT}`);
});