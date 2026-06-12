import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, "public");
const dataDir = path.join(__dirname, "data");
const dbPath = path.join(dataDir, "robogo.db.json");
const port = Number(process.env.PORT || 3000);
const host = process.env.HOST || "127.0.0.1";

const sessions = new Map();

const seedDatabase = {
  users: [
    {
      id: "teacher-1",
      name: "RoBoGo Teacher",
      email: "teacher@robogo.local",
      password: "Teacher123!",
      role: "Teacher"
    },
    {
      id: "student-1",
      name: "Demo Student",
      email: "student@robogo.local",
      password: "Student123!",
      role: "Student"
    }
  ]
};

async function ensureDatabase() {
  await mkdir(dataDir, { recursive: true });
  if (!existsSync(dbPath)) {
    await writeFile(dbPath, JSON.stringify(seedDatabase, null, 2));
  }
}

async function readDatabase() {
  await ensureDatabase();
  return JSON.parse(await readFile(dbPath, "utf8"));
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
}

async function readJsonBody(req) {
  let body = "";
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 1_000_000) {
      throw new Error("Request body too large");
    }
  }
  return body ? JSON.parse(body) : {};
}

function publicUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role
  };
}

function createSession(user) {
  const token = randomUUID();
  sessions.set(token, {
    userId: user.id,
    expiresAt: Date.now() + 1000 * 60 * 60 * 8
  });
  return token;
}

async function getAuthenticatedUser(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length) : "";
  const session = sessions.get(token);
  if (!session || session.expiresAt < Date.now()) {
    if (token) sessions.delete(token);
    return null;
  }

  const db = await readDatabase();
  return db.users.find((user) => user.id === session.userId) || null;
}

async function handleApi(req, res) {
  if (req.method === "POST" && req.url === "/api/auth/login") {
    const { email, password } = await readJsonBody(req);
    const db = await readDatabase();
    const user = db.users.find(
      (candidate) =>
        candidate.email.toLowerCase() === String(email || "").trim().toLowerCase() &&
        candidate.password === String(password || "")
    );

    if (!user) {
      sendJson(res, 401, { error: "Invalid email or password." });
      return;
    }

    sendJson(res, 200, { token: createSession(user), user: publicUser(user) });
    return;
  }

  if (req.method === "GET" && req.url === "/api/me") {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      sendJson(res, 401, { error: "Not authenticated." });
      return;
    }
    sendJson(res, 200, { user: publicUser(user) });
    return;
  }

  if (req.method === "GET" && req.url === "/api/teacher/dashboard") {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      sendJson(res, 401, { error: "Not authenticated." });
      return;
    }
    if (user.role !== "Teacher") {
      sendJson(res, 403, { error: "Teacher role required." });
      return;
    }
    sendJson(res, 200, {
      title: "Teacher Dashboard",
      welcome: `Welcome, ${user.name}.`,
      next: ["Students", "Classes", "Sessions", "Material Library", "Attendance"]
    });
    return;
  }

  if (req.method === "GET" && req.url === "/api/student/current-lesson") {
    const user = await getAuthenticatedUser(req);
    if (!user) {
      sendJson(res, 401, { error: "Not authenticated." });
      return;
    }
    if (user.role !== "Student") {
      sendJson(res, 403, { error: "Student role required." });
      return;
    }
    sendJson(res, 200, {
      title: "Current Lesson",
      welcome: `Welcome, ${user.name}.`,
      status: "No lesson material has been assigned yet."
    });
    return;
  }

  sendJson(res, 404, { error: "API route not found." });
}

async function serveStatic(req, res) {
  const requestPath = new URL(req.url, `http://${req.headers.host}`).pathname;
  const candidate = requestPath === "/" ? "/index.html" : requestPath;
  const filePath = path.normalize(path.join(publicDir, candidate));

  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const file = await readFile(filePath);
    const ext = path.extname(filePath);
    const contentType =
      ext === ".html" ? "text/html" : ext === ".css" ? "text/css" : "text/plain";
    res.writeHead(200, { "Content-Type": contentType });
    res.end(file);
  } catch {
    const app = await readFile(path.join(publicDir, "index.html"));
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(app);
  }
}

await ensureDatabase();

createServer(async (req, res) => {
  try {
    if (req.url?.startsWith("/api/")) {
      await handleApi(req, res);
      return;
    }
    await serveStatic(req, res);
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Server error." });
  }
}).listen(port, host, () => {
  console.log(`RoBoGo Learning Portal running at http://${host}:${port}`);
});
