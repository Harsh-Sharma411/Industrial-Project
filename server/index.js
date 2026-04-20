import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import {
  createCaseRecord,
  createLawyer,
  createReview,
  createSessionRecord,
  createUser,
  deleteLawyer,
  deleteReview,
  getCases,
  getLawyerById,
  getLawyers,
  pingDatabase,
  getSessionWithUser,
  getStats,
  getUserByEmail,
  initDatabase,
  updateLawyer,
  updateUserPassword
} from "./db.js";

const app = express();
const PORT = 8787;
const uploadDir = path.join(process.cwd(), "server", "uploads");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, callback) => {
    callback(null, uploadDir);
  },
  filename: (_req, file, callback) => {
    const safeName = `${Date.now()}-${file.originalname.replace(/\s+/g, "-")}`;
    callback(null, safeName);
  }
});

const upload = multer({ storage });
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5.4-mini";

app.use(cors());
app.use(express.json());
app.use("/uploads", express.static(uploadDir));

const defaultLawyers = [
  {
    id: 1,
    name: "Adv. Aanya Mehra",
    specialty: "Land dispute",
    city: "Delhi",
    experience: "11 years",
    rating: 4.9,
    casesClosed: 148,
    response: "Replies in under 2 hours",
    bio: "Focuses on title conflicts, ancestral property disputes, and boundary matters with a document-first strategy.",
    review: "She translated a confusing land record dispute into a step-by-step plan and helped us enter the first hearing fully prepared."
  },
  {
    id: 2,
    name: "Adv. Rohan Sethi",
    specialty: "Rental agreement",
    city: "Mumbai",
    experience: "8 years",
    rating: 4.8,
    casesClosed: 96,
    response: "Fast on notice disputes",
    bio: "Handles tenancy terms, rent defaults, deposit recovery, eviction notices, and landlord-tenant mediation.",
    review: "Direct, practical, and easy to understand. He reviewed our agreement, explained our options, and saved us weeks of confusion."
  },
  {
    id: 3,
    name: "Adv. Kavya Bansal",
    specialty: "General",
    city: "Bengaluru",
    experience: "10 years",
    rating: 4.7,
    casesClosed: 121,
    response: "Strong intake preparation",
    bio: "Supports mixed civil matters and general disputes, with particular strength in early-stage case organization.",
    review: "Her case intake process was excellent. We walked in with scattered papers and left with a clear action list."
  },
  {
    id: 4,
    name: "Adv. Sameer Nanda",
    specialty: "Land dispute",
    city: "Jaipur",
    experience: "14 years",
    rating: 4.9,
    casesClosed: 201,
    response: "Survey and title specialist",
    bio: "Works on possession disputes, mutation issues, encroachment conflicts, and evidence mapping for property cases.",
    review: "He knew exactly which land records mattered and helped us structure the dispute chronologically before filing."
  }
];

const defaultUsers = [
  {
    id: 1,
    name: "Admin User",
    email: "admin@lawgic.ai",
    passwordHash: hashPassword("admin123"),
    role: "admin",
    createdAt: new Date().toISOString()
  }
];

function hashPassword(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

function sanitizeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt || user.created_at
  };
}

async function createSession(userId) {
  const token = crypto.randomUUID();
  const session = {
    token,
    userId,
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString()
  };

  await createSessionRecord(session);
  return token;
}

async function getSessionUser(token) {
  if (!token) {
    return null;
  }

  const session = await getSessionWithUser(token);
  if (!session || new Date(session.expires_at).getTime() <= Date.now()) {
    return null;
  }

  return {
    id: session.id,
    name: session.name,
    email: session.email,
    passwordHash: session.password_hash,
    role: session.role,
    createdAt: session.created_at
  };
}

async function authMiddleware(req, res, next) {
  const raw = req.headers.authorization || "";
  const token = raw.startsWith("Bearer ") ? raw.slice(7) : "";
  const user = await getSessionUser(token);

  if (!user) {
    return res.status(401).json({ error: "Authentication required." });
  }

  req.user = user;
  next();
}

function adminOnly(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "Admin access required." });
  }

  next();
}

function summarizeCase({ type, details, fileCount }) {
  const wordCount = (details || "").trim().split(/\s+/).filter(Boolean).length;
  const readiness = wordCount > 80 ? "Strong" : wordCount > 30 ? "Moderate" : "Early-stage";
  const focusMap = {
    "Land dispute": "ownership history, land records, boundaries, possession history",
    "Rental agreement": "agreement clauses, payments, notices, deposit or possession issues",
    General: "timeline, parties, evidence, legal objective"
  };

  return {
    readiness,
    wordCount,
    focus: focusMap[type] || focusMap.General,
    nextSteps: [
      "Prepare a date-wise timeline of events.",
      "Group your documents into agreements, payments, notices, and evidence.",
      "Write one clear sentence describing the outcome you want from legal help."
    ],
    fileCount
  };
}

function fallbackAssistantReply(message) {
  const text = (message || "").toLowerCase();

  if (text.includes("land")) {
    return "For land disputes, start with title deeds, tax receipts, survey records, prior notices, and a short history of possession or boundary conflict.";
  }

  if (text.includes("rent") || text.includes("tenant") || text.includes("landlord")) {
    return "For rental matters, collect the agreement, payment proof, chats, notices, deposit details, and any record of possession or damage claims.";
  }

  if (text.includes("lawyer") || text.includes("hire")) {
    return "Compare specialization, review quality, city, and how clearly the lawyer explains the next procedural step for your type of case.";
  }

  return "Start with the case category, the people involved, what happened first, and what outcome you want. That creates the clearest lawyer-ready intake.";
}

async function assistantReply(message) {
  if (!OPENAI_API_KEY) {
    return fallbackAssistantReply(message);
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text:
                "You are Lawgic AI, a legal intake assistant. Give general, non-binding guidance for land disputes, rental agreement conflicts, and general civil case intake. Keep replies concise, practical, and clear that users should consult a licensed lawyer."
            }
          ]
        },
        {
          role: "user",
          content: [{ type: "input_text", text: message || "" }]
        }
      ]
    })
  });

  if (!response.ok) {
    return fallbackAssistantReply(message);
  }

  const data = await response.json();
  return data.output_text || fallbackAssistantReply(message);
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, date: new Date().toISOString() });
});

app.get("/api/lawyers", async (req, res) => {
  const specialty = req.query.specialty;
  const query = (req.query.q || "").toString().toLowerCase();
  res.json({ lawyers: await getLawyers({ specialty, query }) });
});

app.get("/api/lawyers/:id", async (req, res) => {
  const lawyer = await getLawyerById(Number(req.params.id));
  if (!lawyer) {
    return res.status(404).json({ error: "Lawyer not found." });
  }
  res.json({ lawyer });
});

app.get("/api/cases", authMiddleware, async (req, res) => {
  const includeAll = req.user.role === "admin" && req.query.scope === "all";
  res.json({ cases: await getCases({ userId: req.user.id, includeAll }) });
});

app.get("/api/me", authMiddleware, (req, res) => {
  res.json({ user: sanitizeUser(req.user) });
});

app.post("/api/auth/register", async (req, res) => {
  const { name, email, password } = req.body || {};

  if (!name || !email || !password) {
    return res.status(400).json({ error: "Name, email, and password are required." });
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (await getUserByEmail(normalizedEmail)) {
    return res.status(409).json({ error: "An account with this email already exists." });
  }

  const user = {
    id: Date.now(),
    name: name.trim(),
    email: normalizedEmail,
    passwordHash: hashPassword(password),
    role: "user",
    createdAt: new Date().toISOString()
  };

  await createUser(user);
  const token = await createSession(user.id);
  res.status(201).json({ token, user: sanitizeUser(user) });
});

app.post("/api/auth/login", async (req, res) => {
  const { email, password } = req.body || {};
  const normalizedEmail = (email || "").trim().toLowerCase();
  const user = await getUserByEmail(normalizedEmail);

  if (!user || user.password_hash !== hashPassword(password || "")) {
    return res.status(401).json({ error: "Invalid email or password." });
  }

  const token = await createSession(user.id);
  res.json({ token, user: sanitizeUser(user) });
});

app.post("/api/auth/forgot-password", async (req, res) => {
  const normalizedEmail = (req.body?.email || "").trim().toLowerCase();
  const user = await getUserByEmail(normalizedEmail);

  if (!user) {
    return res.status(404).json({ error: "No account found for this email." });
  }

  const tempPassword = crypto.randomBytes(4).toString("hex");
  await updateUserPassword(normalizedEmail, hashPassword(tempPassword));
  res.json({
    message: "Temporary password generated. Use it to log in, then change it from a future settings screen.",
    tempPassword
  });
});

app.get("/api/admin/stats", authMiddleware, adminOnly, async (_req, res) => {
  res.json({ stats: await getStats() });
});

app.post("/api/admin/lawyers", authMiddleware, adminOnly, async (req, res) => {
  const { name, specialty, city, experience, rating, casesClosed, response, bio, review } = req.body || {};

  if (!name || !specialty || !city) {
    return res.status(400).json({ error: "Name, specialty, and city are required." });
  }

  const lawyer = {
    id: Date.now(),
    name,
    specialty,
    city,
    experience: experience || "New",
    rating: Number(rating || 0),
    casesClosed: Number(casesClosed || 0),
    response: response || "Response time not specified",
    bio: bio || "",
    review: review || ""
  };

  await createLawyer(lawyer);
  res.status(201).json({ lawyer });
});

app.put("/api/admin/lawyers/:id", authMiddleware, adminOnly, async (req, res) => {
  const { name, specialty, city, experience, rating, casesClosed, response, bio } = req.body || {};
  const lawyer = {
    id: Number(req.params.id),
    name,
    specialty,
    city,
    experience,
    rating: Number(rating || 0),
    casesClosed: Number(casesClosed || 0),
    response,
    bio
  };
  await updateLawyer(lawyer);
  res.json({ lawyer });
});

app.delete("/api/admin/lawyers/:id", authMiddleware, adminOnly, async (req, res) => {
  await deleteLawyer(Number(req.params.id));
  res.status(204).end();
});

app.post("/api/admin/reviews", authMiddleware, adminOnly, async (req, res) => {
  const { lawyerId, clientName, rating, comment } = req.body || {};
  if (!lawyerId || !clientName || !comment) {
    return res.status(400).json({ error: "lawyerId, clientName, and comment are required." });
  }

  const review = await createReview({
    lawyerId: Number(lawyerId),
    clientName,
    rating: Number(rating || 5),
    comment,
    createdAt: new Date().toISOString()
  });

  res.status(201).json({ review });
});

app.delete("/api/admin/reviews/:id", authMiddleware, adminOnly, async (req, res) => {
  await deleteReview(Number(req.params.id));
  res.status(204).end();
});

app.post("/api/assistant", async (req, res) => {
  const message = req.body?.message || "";
  const reply = await assistantReply(message);
  res.json({ reply, live: Boolean(OPENAI_API_KEY) });
});

app.post("/api/cases", authMiddleware, upload.array("files"), async (req, res) => {
  const files = (req.files || []).map((file) => ({
    originalName: file.originalname,
    savedName: file.filename,
    url: `/uploads/${file.filename}`
  }));

  const createdCase = {
    id: Date.now(),
    userId: req.user.id,
    title: req.body.title || "Untitled case",
    type: req.body.type || "General",
    details: req.body.details || "",
    files,
    createdAt: new Date().toISOString()
  };

  const analysis = summarizeCase({
    type: createdCase.type,
    details: createdCase.details,
    fileCount: files.length
  });

  await createCaseRecord({ ...createdCase, analysis });

  res.status(201).json({
    case: createdCase,
    analysis
  });
});

async function startServer() {
  await initDatabase({ defaultLawyers, defaultUsers });
  await pingDatabase();
  app.listen(PORT, () => {
    console.log(`Lawgic AI backend running on http://localhost:${PORT}`);
  });
}

startServer().catch((error) => {
  console.error("Failed to start Lawgic AI backend:", error.message);
  process.exit(1);
});
