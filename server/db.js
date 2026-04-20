import fs from "node:fs";
import path from "node:path";
import { Pool } from "pg";

const seedDir = path.join(process.cwd(), "server", "data");

const pool = new Pool({
  host: process.env.PGHOST || "localhost",
  port: Number(process.env.PGPORT || 5432),
  database: process.env.PGDATABASE || "postgres",
  user: process.env.PGUSER || "postgres",
  password: process.env.PGPASSWORD || "7589",
  ssl: (process.env.PGSSL || "no").toLowerCase() === "yes" ? { rejectUnauthorized: false } : false
});

function readJsonIfExists(fileName, fallbackValue) {
  const filePath = path.join(seedDir, fileName);
  if (!fs.existsSync(filePath)) {
    return fallbackValue;
  }

  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return fallbackValue;
  }
}

function mapLawyer(row) {
  return {
    id: row.id,
    name: row.name,
    specialty: row.specialty,
    city: row.city,
    experience: row.experience,
    rating: Number(row.rating),
    casesClosed: row.cases_closed,
    response: row.response,
    bio: row.bio,
    review: row.latest_review || ""
  };
}

function mapReview(row) {
  return {
    id: row.id,
    lawyerId: row.lawyer_id,
    clientName: row.client_name,
    rating: Number(row.rating),
    comment: row.comment,
    createdAt: row.created_at
  };
}

function mapCase(row, files) {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    type: row.type,
    details: row.details,
    createdAt: row.created_at,
    files,
    analysis: {
      readiness: row.analysis_readiness,
      wordCount: row.analysis_word_count,
      focus: row.analysis_focus,
      nextSteps: JSON.parse(row.analysis_next_steps || "[]"),
      fileCount: row.analysis_file_count
    }
  };
}

async function hydrateCases(rows) {
  const ids = rows.map((row) => row.id);
  let filesByCaseId = new Map();

  if (ids.length > 0) {
    const fileResult = await pool.query(
      "SELECT case_id, original_name, saved_name, url FROM case_files WHERE case_id = ANY($1::bigint[]) ORDER BY id DESC",
      [ids]
    );

    filesByCaseId = fileResult.rows.reduce((acc, row) => {
      const list = acc.get(row.case_id) || [];
      list.push({
        originalName: row.original_name,
        savedName: row.saved_name,
        url: row.url
      });
      acc.set(row.case_id, list);
      return acc;
    }, new Map());
  }

  return rows.map((row) => mapCase(row, filesByCaseId.get(row.id) || []));
}

export async function initDatabase({ defaultLawyers, defaultUsers }) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id BIGINT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS lawyers (
      id BIGINT PRIMARY KEY,
      name TEXT NOT NULL,
      specialty TEXT NOT NULL,
      city TEXT NOT NULL,
      experience TEXT NOT NULL,
      rating NUMERIC(3, 1) NOT NULL,
      cases_closed INTEGER NOT NULL,
      response TEXT NOT NULL,
      bio TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id BIGSERIAL PRIMARY KEY,
      lawyer_id BIGINT NOT NULL REFERENCES lawyers(id) ON DELETE CASCADE,
      client_name TEXT NOT NULL,
      rating NUMERIC(3, 1) NOT NULL,
      comment TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cases (
      id BIGINT PRIMARY KEY,
      user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      type TEXT NOT NULL,
      details TEXT NOT NULL,
      created_at TEXT NOT NULL,
      analysis_readiness TEXT NOT NULL,
      analysis_word_count INTEGER NOT NULL,
      analysis_focus TEXT NOT NULL,
      analysis_next_steps TEXT NOT NULL,
      analysis_file_count INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS case_files (
      id BIGSERIAL PRIMARY KEY,
      case_id BIGINT NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
      original_name TEXT NOT NULL,
      saved_name TEXT NOT NULL,
      url TEXT NOT NULL
    );
  `);

  const usersCount = Number((await pool.query("SELECT COUNT(*)::int AS count FROM users")).rows[0].count);
  if (usersCount === 0) {
    const seededUsers = readJsonIfExists("users.json", defaultUsers);
    for (const user of seededUsers) {
      await pool.query(
        "INSERT INTO users (id, name, email, password_hash, role, created_at) VALUES ($1, $2, $3, $4, $5, $6)",
        [
          user.id,
          user.name,
          user.email,
          user.passwordHash ?? user.password_hash,
          user.role,
          user.createdAt ?? user.created_at
        ]
      );
    }
  }

  const sessionsCount = Number((await pool.query("SELECT COUNT(*)::int AS count FROM sessions")).rows[0].count);
  if (sessionsCount === 0) {
    const seededSessions = readJsonIfExists("sessions.json", []);
    for (const session of seededSessions) {
      await pool.query(
        "INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES ($1, $2, $3, $4)",
        [
          session.token,
          session.userId ?? session.user_id,
          session.createdAt ?? session.created_at,
          session.expiresAt ?? session.expires_at
        ]
      );
    }
  }

  const lawyersCount = Number((await pool.query("SELECT COUNT(*)::int AS count FROM lawyers")).rows[0].count);
  if (lawyersCount === 0) {
    const seededLawyers = readJsonIfExists("lawyers.json", defaultLawyers);
    for (const lawyer of seededLawyers) {
      await pool.query(
        `
          INSERT INTO lawyers
          (id, name, specialty, city, experience, rating, cases_closed, response, bio)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `,
        [
          lawyer.id,
          lawyer.name,
          lawyer.specialty,
          lawyer.city,
          lawyer.experience,
          lawyer.rating,
          lawyer.casesClosed ?? lawyer.cases_closed,
          lawyer.response,
          lawyer.bio
        ]
      );

      if (lawyer.review) {
        await pool.query(
          "INSERT INTO reviews (lawyer_id, client_name, rating, comment, created_at) VALUES ($1, $2, $3, $4, $5)",
          [lawyer.id, "Previous Client", lawyer.rating || 4.5, lawyer.review, new Date().toISOString()]
        );
      }
    }
  }

  const casesCount = Number((await pool.query("SELECT COUNT(*)::int AS count FROM cases")).rows[0].count);
  if (casesCount === 0) {
    const seededCases = readJsonIfExists("cases.json", []);
    for (const caseItem of seededCases) {
      await pool.query(
        `
          INSERT INTO cases
          (id, user_id, title, type, details, created_at, analysis_readiness, analysis_word_count, analysis_focus, analysis_next_steps, analysis_file_count)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        `,
        [
          caseItem.id,
          caseItem.userId ?? caseItem.user_id ?? null,
          caseItem.title,
          caseItem.type,
          caseItem.details || "",
          caseItem.createdAt ?? caseItem.created_at,
          caseItem.analysis?.readiness || "Early-stage",
          caseItem.analysis?.wordCount || 0,
          caseItem.analysis?.focus || "",
          JSON.stringify(caseItem.analysis?.nextSteps || []),
          caseItem.analysis?.fileCount || caseItem.files?.length || 0
        ]
      );

      for (const file of caseItem.files || []) {
        await pool.query(
          "INSERT INTO case_files (case_id, original_name, saved_name, url) VALUES ($1, $2, $3, $4)",
          [caseItem.id, file.originalName, file.savedName, file.url]
        );
      }
    }
  }
}

export async function getLawyers({ specialty, query }) {
  const result = await pool.query(
    `
      SELECT lawyers.*, latest.comment AS latest_review
      FROM lawyers
      LEFT JOIN LATERAL (
        SELECT comment
        FROM reviews
        WHERE reviews.lawyer_id = lawyers.id
        ORDER BY created_at DESC
        LIMIT 1
      ) AS latest ON true
      WHERE ($1::text IS NULL OR $1 = 'All practices' OR specialty = $1)
      AND ($2::text = '' OR lower(name || ' ' || specialty || ' ' || city) LIKE '%' || $2 || '%')
      ORDER BY lawyers.id DESC
    `,
    [specialty || null, query || ""]
  );

  return result.rows.map(mapLawyer);
}

export async function getLawyerById(id) {
  const lawyerResult = await pool.query(
    `
      SELECT lawyers.*, latest.comment AS latest_review
      FROM lawyers
      LEFT JOIN LATERAL (
        SELECT comment
        FROM reviews
        WHERE reviews.lawyer_id = lawyers.id
        ORDER BY created_at DESC
        LIMIT 1
      ) AS latest ON true
      WHERE lawyers.id = $1
    `,
    [id]
  );
  const lawyer = lawyerResult.rows[0] ? mapLawyer(lawyerResult.rows[0]) : null;
  if (!lawyer) {
    return null;
  }

  const reviewResult = await pool.query(
    "SELECT * FROM reviews WHERE lawyer_id = $1 ORDER BY created_at DESC",
    [id]
  );

  return {
    ...lawyer,
    reviews: reviewResult.rows.map(mapReview)
  };
}

export async function getCases({ userId, includeAll = false }) {
  const result = includeAll
    ? await pool.query("SELECT * FROM cases ORDER BY created_at DESC")
    : await pool.query("SELECT * FROM cases WHERE user_id = $1 ORDER BY created_at DESC", [userId]);

  return hydrateCases(result.rows);
}

export async function getUserByEmail(email) {
  const result = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
  return result.rows[0] || null;
}

export async function createUser(user) {
  await pool.query(
    "INSERT INTO users (id, name, email, password_hash, role, created_at) VALUES ($1, $2, $3, $4, $5, $6)",
    [user.id, user.name, user.email, user.passwordHash, user.role, user.createdAt]
  );
}

export async function updateUserPassword(email, passwordHash) {
  await pool.query("UPDATE users SET password_hash = $1 WHERE email = $2", [passwordHash, email]);
}

export async function createSessionRecord(session) {
  await pool.query(
    "INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES ($1, $2, $3, $4)",
    [session.token, session.userId, session.createdAt, session.expiresAt]
  );
}

export async function getSessionWithUser(token) {
  const result = await pool.query(
    `
      SELECT sessions.token, sessions.user_id, sessions.expires_at, users.id, users.name, users.email,
             users.password_hash, users.role, users.created_at
      FROM sessions
      JOIN users ON users.id = sessions.user_id
      WHERE sessions.token = $1
    `,
    [token]
  );

  return result.rows[0] || null;
}

export async function createLawyer(lawyer) {
  await pool.query(
    `
      INSERT INTO lawyers
      (id, name, specialty, city, experience, rating, cases_closed, response, bio)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `,
    [
      lawyer.id,
      lawyer.name,
      lawyer.specialty,
      lawyer.city,
      lawyer.experience,
      lawyer.rating,
      lawyer.casesClosed,
      lawyer.response,
      lawyer.bio
    ]
  );
}

export async function updateLawyer(lawyer) {
  await pool.query(
    `
      UPDATE lawyers
      SET name = $2, specialty = $3, city = $4, experience = $5, rating = $6,
          cases_closed = $7, response = $8, bio = $9
      WHERE id = $1
    `,
    [
      lawyer.id,
      lawyer.name,
      lawyer.specialty,
      lawyer.city,
      lawyer.experience,
      lawyer.rating,
      lawyer.casesClosed,
      lawyer.response,
      lawyer.bio
    ]
  );
}

export async function deleteLawyer(id) {
  await pool.query("DELETE FROM lawyers WHERE id = $1", [id]);
}

export async function createReview(review) {
  const result = await pool.query(
    `
      INSERT INTO reviews (lawyer_id, client_name, rating, comment, created_at)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING *
    `,
    [review.lawyerId, review.clientName, review.rating, review.comment, review.createdAt]
  );
  return mapReview(result.rows[0]);
}

export async function deleteReview(id) {
  await pool.query("DELETE FROM reviews WHERE id = $1", [id]);
}

export async function getStats() {
  const [users, cases, lawyers] = await Promise.all([
    pool.query("SELECT COUNT(*)::int AS count FROM users"),
    pool.query("SELECT COUNT(*)::int AS count FROM cases"),
    pool.query("SELECT COUNT(*)::int AS count FROM lawyers")
  ]);

  return {
    users: users.rows[0].count,
    cases: cases.rows[0].count,
    lawyers: lawyers.rows[0].count
  };
}

export async function createCaseRecord(caseData) {
  await pool.query(
    `
      INSERT INTO cases
      (id, user_id, title, type, details, created_at, analysis_readiness, analysis_word_count, analysis_focus, analysis_next_steps, analysis_file_count)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    `,
    [
      caseData.id,
      caseData.userId || null,
      caseData.title,
      caseData.type,
      caseData.details,
      caseData.createdAt,
      caseData.analysis.readiness,
      caseData.analysis.wordCount,
      caseData.analysis.focus,
      JSON.stringify(caseData.analysis.nextSteps),
      caseData.analysis.fileCount
    ]
  );

  for (const file of caseData.files) {
    await pool.query(
      "INSERT INTO case_files (case_id, original_name, saved_name, url) VALUES ($1, $2, $3, $4)",
      [caseData.id, file.originalName, file.savedName, file.url]
    );
  }
}

export async function pingDatabase() {
  await pool.query("SELECT 1");
}
