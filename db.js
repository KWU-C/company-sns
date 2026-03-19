const mysql = require('mysql2/promise');
const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

// Use sqlite by default for local development. Set DB_TYPE=mysql to use MySQL.
const DB_TYPE = process.env.DB_TYPE || 'sqlite';

const MYSQL_CONFIG = {
  host: process.env.DB_HOST || 'mysql322.phy.heteml.lan',
  user: process.env.DB_USER || 'tcdadmin',
  password: process.env.DB_PASSWORD || 'tcdtcd1977',
  database: process.env.DB_NAME || 'tcdadmin_sns_db',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

const SQLITE_FILE = process.env.SQLITE_FILE || path.join(__dirname, 'data', 'db.sqlite');

let pool;
let sqliteDb;

function isMysql() {
  return DB_TYPE === 'mysql';
}

function initSqlite() {
  fs.mkdirSync(path.dirname(SQLITE_FILE), { recursive: true });
  sqliteDb = new Database(SQLITE_FILE);
  sqliteDb.pragma('foreign_keys = ON');
  return sqliteDb;
}

async function initMysql() {
  pool ||= mysql.createPool(MYSQL_CONFIG);
  return pool;
}

async function initTables() {
  if (isMysql()) {
    const conn = await initMysql().then((p) => p.getConnection());
    try {
      await conn.query(`
        CREATE TABLE IF NOT EXISTS users (
          id INT AUTO_INCREMENT PRIMARY KEY,
          name VARCHAR(100) NOT NULL,
          email VARCHAR(255) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL,
          profile TEXT DEFAULT '',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      await conn.query(`
        CREATE TABLE IF NOT EXISTS posts (
          id INT AUTO_INCREMENT PRIMARY KEY,
          user_id INT NOT NULL,
          content TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          INDEX (user_id)
        )
      `);

      await conn.query(`
        CREATE TABLE IF NOT EXISTS comments (
          id INT AUTO_INCREMENT PRIMARY KEY,
          post_id INT NOT NULL,
          user_id INT NOT NULL,
          content TEXT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          INDEX (post_id)
        )
      `);

      await conn.query(`
        CREATE TABLE IF NOT EXISTS likes (
          id INT AUTO_INCREMENT PRIMARY KEY,
          post_id INT NOT NULL,
          user_id INT NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          UNIQUE KEY unique_like (post_id, user_id),
          FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `);

      console.log('✓ MySQL tables initialized');
    } finally {
      conn.release();
    }
  } else {
    if (!sqliteDb) initSqlite();

    sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        profile TEXT DEFAULT '',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS posts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        content TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS comments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        content TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS likes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id INTEGER NOT NULL,
        user_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (post_id, user_id),
        FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );
    `);

    console.log('✓ SQLite tables initialized:', SQLITE_FILE);
  }
}

async function getConnection() {
  if (isMysql()) {
    const poolInstance = await initMysql();
    return poolInstance.getConnection();
  }

  // SQLite: mimic the mysql2 connection interface used in routes
  if (!sqliteDb) initSqlite();

  return {
    query: async (sql, params = []) => {
      const normalized = sql.trim().toUpperCase();
      if (normalized.startsWith('SELECT') || normalized.startsWith('PRAGMA')) {
        const rows = sqliteDb.prepare(sql).all(...params);
        return [rows, []];
      }

      const result = sqliteDb.prepare(sql).run(...params);
      return [{ insertId: result.lastInsertRowid, affectedRows: result.changes }, []];
    },
    release: () => {},
  };
}

module.exports = { getConnection, initTables, isMysql };
