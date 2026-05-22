const path = require('path');
const dotenv = require('dotenv');
dotenv.config();

let dbRun, dbAll, dbGet;
let isPostgres = false;
let pgPool = null;
let sqliteDb = null;

if (process.env.DATABASE_URL) {
  // Use PostgreSQL (Supabase)
  const { Pool } = require('pg');
  const dns = require('dns');
  
  let connectionString = process.env.DATABASE_URL;
  
  // Auto-rewrite direct Supabase host to IPv4 pooler to prevent ENETUNREACH on IPv4-only environments like Render
  const supabaseRegex = /postgresql:\/\/(.*?)(:.*?)?@db\.(.*?)\.supabase\.co/i;
  const match = connectionString ? connectionString.match(supabaseRegex) : null;
  
  if (match) {
    const username = match[1];
    const projectRef = match[3];
    console.log(`Detected direct Supabase host. Auto-routing connection through IPv4 pooler for project: ${projectRef}...`);
    
    // Rewrite host to transaction pooler
    connectionString = connectionString.replace(
      `db.${projectRef}.supabase.co:5432`,
      `aws-0-eu-west-3.pooler.supabase.com:6543`
    ).replace(
      `db.${projectRef}.supabase.co`,
      `aws-0-eu-west-3.pooler.supabase.com`
    );
    
    // Append the tenant ID to the username to resolve the multi-tenant routing issue
    if (username && !username.includes(projectRef)) {
      connectionString = connectionString.replace(
        `://${username}:`,
        `://${username}.${projectRef}:`
      ).replace(
        `://${username}@`,
        `://${username}.${projectRef}@`
      );
    }
  }

  pgPool = new Pool({
    connectionString,
    ssl: {
      rejectUnauthorized: false // Required for Supabase standard connections
    },
    // Force IPv4 to prevent ENETUNREACH IPv6 connection issues on Render
    lookup: (hostname, options, callback) => {
      dns.lookup(hostname, { ...options, family: 4 }, callback);
    }
  });
  isPostgres = true;
  console.log('Connecting to PostgreSQL database via DATABASE_URL...');

  // Helper to convert SQLite style ? placeholders to PostgreSQL $1, $2, ...
  const convertQuery = (sql) => {
    let index = 1;
    return sql.replace(/\?/g, () => `$${index++}`);
  };

  dbRun = async (sql, params = []) => {
    const pgSql = convertQuery(sql);
    const result = await pgPool.query(pgSql, params);
    // Mimic SQLite output: result.rows[0].id for INSERT, result.rowCount for changes
    const lastID = result.rows && result.rows[0] ? result.rows[0].id : null;
    return { id: lastID, changes: result.rowCount };
  };

  dbAll = async (sql, params = []) => {
    const pgSql = convertQuery(sql);
    const result = await pgPool.query(pgSql, params);
    return result.rows;
  };

  dbGet = async (sql, params = []) => {
    const pgSql = convertQuery(sql);
    const result = await pgPool.query(pgSql, params);
    return result.rows[0] || null;
  };

} else {
  // Use SQLite (Local Development)
  const sqlite3 = require('sqlite3').verbose();
  const dbPath = path.resolve(__dirname, '../database.sqlite');
  sqliteDb = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      console.error('Could not connect to SQLite database:', err.message);
    } else {
      console.log('Connected to SQLite database at:', dbPath);
    }
  });

  dbRun = (sql, params = []) => {
    return new Promise((resolve, reject) => {
      sqliteDb.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, changes: this.changes });
      });
    });
  };

  dbAll = (sql, params = []) => {
    return new Promise((resolve, reject) => {
      sqliteDb.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  };

  dbGet = (sql, params = []) => {
    return new Promise((resolve, reject) => {
      sqliteDb.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  };
}

// Initialize Database Tables
const initDb = async () => {
  try {
    if (isPostgres) {
      // 1. Rules table: Stores keywords and corresponding DM & Comment reply configurations
      await dbRun(`
        CREATE TABLE IF NOT EXISTS rules (
          id SERIAL PRIMARY KEY,
          keyword VARCHAR(255) UNIQUE NOT NULL,
          channel VARCHAR(50) NOT NULL DEFAULT 'all',
          dm_message TEXT NOT NULL,
          comment_reply TEXT,
          is_active INTEGER NOT NULL DEFAULT 1,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // 2. Leads table: Captures lead details when they engage with a configured keyword
      await dbRun(`
        CREATE TABLE IF NOT EXISTS leads (
          id SERIAL PRIMARY KEY,
          platform_user_id VARCHAR(255) NOT NULL,
          username VARCHAR(255) NOT NULL,
          full_name VARCHAR(255),
          channel VARCHAR(50) NOT NULL,
          source_type VARCHAR(50) NOT NULL,
          matched_keyword VARCHAR(255) NOT NULL,
          captured_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // 3. Logs table: Audit trail logs for all incoming events and automated actions
      await dbRun(`
        CREATE TABLE IF NOT EXISTS logs (
          id SERIAL PRIMARY KEY,
          channel VARCHAR(50) NOT NULL,
          event_type VARCHAR(50) NOT NULL,
          username VARCHAR(255),
          details TEXT NOT NULL,
          status VARCHAR(50) NOT NULL,
          timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Insert some default mock rules if empty, so the user has immediate examples
      const rulesCount = await dbGet('SELECT COUNT(*) as count FROM rules');
      if (parseInt(rulesCount.count || 0) === 0) {
        await dbRun(
          `INSERT INTO rules (keyword, channel, dm_message, comment_reply, is_active) VALUES (?, ?, ?, ?, ?)`,
          ['pdf', 'all', 'Hey! Here is the link to download your free PDF Guide: https://example.com/free-pdf-guide 🚀 Let me know if you have any questions!', 'Just sent you a DM with the link! Check your inbox 📥', 1]
        );
        await dbRun(
          `INSERT INTO rules (keyword, channel, dm_message, comment_reply, is_active) VALUES (?, ?, ?, ?, ?)`,
          ['growth', 'instagram', 'Thanks for commenting! Here is the link to our 10x Business Growth Training: https://example.com/growth-training 📈', 'Done! Check your DMs for the training link! 🔥', 1]
        );
        await dbRun(
          `INSERT INTO rules (keyword, channel, dm_message, comment_reply, is_active) VALUES (?, ?, ?, ?, ?)`,
          ['lead', 'facebook', 'Awesome! Tap here to book a free 1-on-1 strategy call with our team: https://example.com/book-call 🤝', 'Just sent you a DM! Book your call there.', 1]
        );
      }
    } else {
      // SQLite execution
      // 1. Rules table: Stores keywords and corresponding DM & Comment reply configurations
      await dbRun(`
        CREATE TABLE IF NOT EXISTS rules (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          keyword TEXT UNIQUE NOT NULL,
          channel TEXT NOT NULL DEFAULT 'all', -- 'instagram', 'facebook', 'tiktok', 'all'
          dm_message TEXT NOT NULL,
          comment_reply TEXT,                  -- Can be null if only sending DM
          is_active INTEGER NOT NULL DEFAULT 1, -- 1 = active, 0 = inactive
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Insert some default mock rules if empty, so the user has immediate examples
      const rulesCount = await dbGet('SELECT COUNT(*) as count FROM rules');
      if (rulesCount.count === 0) {
        await dbRun(
          `INSERT INTO rules (keyword, channel, dm_message, comment_reply, is_active) VALUES (?, ?, ?, ?, ?)`,
          ['pdf', 'all', 'Hey! Here is the link to download your free PDF Guide: https://example.com/free-pdf-guide 🚀 Let me know if you have any questions!', 'Just sent you a DM with the link! Check your inbox 📥', 1]
        );
        await dbRun(
          `INSERT INTO rules (keyword, channel, dm_message, comment_reply, is_active) VALUES (?, ?, ?, ?, ?)`,
          ['growth', 'instagram', 'Thanks for commenting! Here is the link to our 10x Business Growth Training: https://example.com/growth-training 📈', 'Done! Check your DMs for the training link! 🔥', 1]
        );
        await dbRun(
          `INSERT INTO rules (keyword, channel, dm_message, comment_reply, is_active) VALUES (?, ?, ?, ?, ?)`,
          ['lead', 'facebook', 'Awesome! Tap here to book a free 1-on-1 strategy call with our team: https://example.com/book-call 🤝', 'Just sent you a DM! Book your call there.', 1]
        );
      }

      // 2. Leads table: Captures lead details when they engage with a configured keyword
      await dbRun(`
        CREATE TABLE IF NOT EXISTS leads (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          platform_user_id TEXT NOT NULL,
          username TEXT NOT NULL,
          full_name TEXT,
          channel TEXT NOT NULL,               -- 'instagram', 'facebook', 'tiktok'
          source_type TEXT NOT NULL,           -- 'comment', 'dm'
          matched_keyword TEXT NOT NULL,
          captured_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // 3. Logs table: Audit trail logs for all incoming events and automated actions
      await dbRun(`
        CREATE TABLE IF NOT EXISTS logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          channel TEXT NOT NULL,               -- 'instagram', 'facebook', 'tiktok', 'system'
          event_type TEXT NOT NULL,            -- 'comment_received', 'dm_received', 'reply_sent', 'error', 'system'
          username TEXT,
          details TEXT NOT NULL,
          status TEXT NOT NULL,                -- 'success', 'failed', 'info'
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);
    }

    console.log('Database tables successfully initialized.');
  } catch (error) {
    console.error('Error initializing database tables:', error);
  }
};

module.exports = {
  db: isPostgres ? pgPool : sqliteDb,
  dbRun,
  dbAll,
  dbGet,
  initDb
};
