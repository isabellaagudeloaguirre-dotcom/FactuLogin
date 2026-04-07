const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const DB_PATH = path.join(__dirname, 'database.sqlite');

const db = new sqlite3.Database(DB_PATH);

db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      profile_image TEXT,
      created_at TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS invoices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      description TEXT NOT NULL,
      total REAL NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS user_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      action TEXT NOT NULL,
      detail TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      document TEXT NOT NULL,
      phone TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS companies (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      nit TEXT NOT NULL,
      phone TEXT NOT NULL,
      address TEXT NOT NULL,
      created_at TEXT NOT NULL
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      company_id INTEGER NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(company_id) REFERENCES companies(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      client_id INTEGER NOT NULL,
      company_id INTEGER NOT NULL,
      total REAL NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES users(id),
      FOREIGN KEY(client_id) REFERENCES clients(id),
      FOREIGN KEY(company_id) REFERENCES companies(id)
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity INTEGER NOT NULL,
      price REAL NOT NULL,
      subtotal REAL NOT NULL,
      FOREIGN KEY(order_id) REFERENCES orders(id),
      FOREIGN KEY(product_id) REFERENCES products(id)
    )
  `);
});

function createUser({ name, email, passwordHash }) {
  return new Promise((resolve, reject) => {
    const stmt = `
      INSERT INTO users (name, email, password_hash, created_at)
      VALUES (?, ?, ?, datetime('now'))
    `;
    db.run(stmt, [name, email, passwordHash], function (err) {
      if (err) return reject(err);
      resolve({ id: this.lastID, name, email });
    });
  });
}

function getUserByEmail(email) {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT * FROM users WHERE email = ?',
      [email],
      (err, row) => {
        if (err) return reject(err);
        resolve(row || null);
      }
    );
  });
}

function getAllUsers() {
  return new Promise((resolve, reject) => {
    db.all(
      'SELECT id, name, email, created_at FROM users ORDER BY id DESC',
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      }
    );
  });
}

function getUserById(id) {
  return new Promise((resolve, reject) => {
    db.get(
      'SELECT id, name, email, profile_image, created_at FROM users WHERE id = ?',
      [id],
      (err, row) => {
        if (err) return reject(err);
        resolve(row || null);
      }
    );
  });
}

function updateUserProfileImage(userId, profileImagePath) {
  return new Promise((resolve, reject) => {
    db.run(
      'UPDATE users SET profile_image = ? WHERE id = ?',
      [profileImagePath, userId],
      function (err) {
        if (err) return reject(err);
        resolve(this.changes > 0);
      }
    );
  });
}

function addNotification(userId, message) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO notifications (user_id, message, created_at)
       VALUES (?, ?, datetime('now'))`,
      [userId, message],
      function (err) {
        if (err) return reject(err);
        resolve({ id: this.lastID, userId, message });
      }
    );
  });
}

function getNotificationsByUser(userId) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT id, message, created_at
       FROM notifications
       WHERE user_id = ?
       ORDER BY id DESC
       LIMIT 20`,
      [userId],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      }
    );
  });
}

function addInvoice(userId, description, total) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO invoices (user_id, description, total, created_at)
       VALUES (?, ?, ?, datetime('now'))`,
      [userId, description, total],
      function (err) {
        if (err) return reject(err);
        resolve({ id: this.lastID, userId, description, total });
      }
    );
  });
}

function getInvoicesByUser(userId) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT id, description, total, created_at
       FROM invoices
       WHERE user_id = ?
       ORDER BY id DESC`,
      [userId],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      }
    );
  });
}

function addUserEvent(userId, action, detail) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO user_events (user_id, action, detail, created_at)
       VALUES (?, ?, ?, datetime('now'))`,
      [userId, action, detail || null],
      function (err) {
        if (err) return reject(err);
        resolve({ id: this.lastID, userId, action, detail });
      }
    );
  });
}

function createClient({ name, document, phone }) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO clients (name, document, phone, created_at)
       VALUES (?, ?, ?, datetime('now'))`,
      [name, document, phone],
      function (err) {
        if (err) return reject(err);
        resolve({ id: this.lastID, name, document, phone });
      }
    );
  });
}

function getClients() {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM clients ORDER BY id DESC', (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

function createCompany({ name, nit, phone, address }) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO companies (name, nit, phone, address, created_at)
       VALUES (?, ?, ?, ?, datetime('now'))`,
      [name, nit, phone, address],
      function (err) {
        if (err) return reject(err);
        resolve({ id: this.lastID, name, nit, phone, address });
      }
    );
  });
}

function getCompanies() {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM companies ORDER BY id DESC', (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

function createProduct({ name, price, companyId }) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO products (name, price, company_id, created_at)
       VALUES (?, ?, ?, datetime('now'))`,
      [name, price, companyId],
      function (err) {
        if (err) return reject(err);
        resolve({ id: this.lastID, name, price, companyId });
      }
    );
  });
}

function getProducts() {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT p.id, p.name, p.price, p.company_id, c.name AS company_name
       FROM products p
       JOIN companies c ON c.id = p.company_id
       ORDER BY p.id DESC`,
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      }
    );
  });
}

function getProductById(productId) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM products WHERE id = ?', [productId], (err, row) => {
      if (err) return reject(err);
      resolve(row || null);
    });
  });
}

function createOrder({ userId, clientId, companyId, total }) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO orders (user_id, client_id, company_id, total, created_at)
       VALUES (?, ?, ?, ?, datetime('now'))`,
      [userId || null, clientId, companyId, total],
      function (err) {
        if (err) return reject(err);
        resolve({ id: this.lastID, userId, clientId, companyId, total });
      }
    );
  });
}

function createOrderItem({ orderId, productId, quantity, price, subtotal }) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO order_items (order_id, product_id, quantity, price, subtotal)
       VALUES (?, ?, ?, ?, ?)`,
      [orderId, productId, quantity, price, subtotal],
      function (err) {
        if (err) return reject(err);
        resolve({ id: this.lastID, orderId, productId, quantity, price, subtotal });
      }
    );
  });
}

function getOrders() {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT o.id, o.total, o.created_at, cl.name AS client_name, co.name AS company_name
       FROM orders o
       JOIN clients cl ON cl.id = o.client_id
       JOIN companies co ON co.id = o.company_id
       ORDER BY o.id DESC`,
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      }
    );
  });
}

module.exports = {
  createUser,
  getUserByEmail,
  getAllUsers,
  getUserById,
  updateUserProfileImage,
  addNotification,
  getNotificationsByUser,
  addInvoice,
  getInvoicesByUser,
  addUserEvent,
  createClient,
  getClients,
  createCompany,
  getCompanies,
  createProduct,
  getProducts,
  getProductById,
  createOrder,
  createOrderItem,
  getOrders,
};

