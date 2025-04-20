const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to SQLite database');
  }
});

app.use(cors());
app.use(bodyParser.json());

// Initialize database
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    grams INTEGER UNIQUE,
    price REAL,
    quantity INTEGER
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS purchases_lettuce (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    grams INTEGER,
    quantity INTEGER,
    totalCost REAL,
    purchaseDate TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS purchases_other (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    grams INTEGER,
    quantity INTEGER,
    totalCost REAL,
    purchaseDate TEXT
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    role TEXT
  )`);

  // Seed users
  db.get(`SELECT COUNT(*) as count FROM users`, (err, row) => {
    if (err) {
      console.error('Error checking users:', err.message);
      return;
    }
    if (row.count === 0) {
      db.run(
        `INSERT INTO users (username, password, role) VALUES 
        ('admin', 'admin', 'admin'), 
        ('teofilo', 'teofilo', 'user'), 
        ('daxton', 'daxton', 'user'), 
        ('faith', 'faith', 'user')`
      );
    }
  });
});

// Temporary storage for purchase details
let purchaseDetails = {};

// Product endpoints
app.get('/products', (req, res) => {
  db.all('SELECT * FROM products', [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error: ' + err.message });
    res.json(rows);
  });
});

app.post('/products', (req, res) => {
  const { grams, price, quantity } = req.body;
  if (!grams || !price || !quantity) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  db.run(
    `INSERT INTO products (grams, price, quantity) VALUES (?, ?, ?)`,
    [grams, price, quantity],
    function (err) {
      if (err) return res.status(500).json({ error: 'Database error: ' + err.message });
      res.json({ id: this.lastID });
    }
  );
});

app.put('/products/:id', (req, res) => {
  const { grams, price, quantity } = req.body;
  if (!grams || !price || !quantity) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  db.run(
    `UPDATE products SET grams = ?, price = ?, quantity = ? WHERE id = ?`,
    [grams, price, quantity, req.params.id],
    function (err) {
      if (err) return res.status(500).json({ error: 'Database error: ' + err.message });
      res.json({ changes: this.changes });
    }
  );
});

// Purchase details endpoint
app.post('/purchase-details', (req, res) => {
  const { grams, quantity, totalCost } = req.body;
  if (!grams || !quantity || !totalCost) {
    return res.status(400).json({ error: 'Missing required fields: grams, quantity, totalCost' });
  }
  purchaseDetails = { grams, quantity, totalCost };
  res.json({ message: 'Purchase details saved' });
});

app.get('/purchase-details', (req, res) => {
  res.json(purchaseDetails || {});
});

// Purchase endpoints for lettuce-chips-sales
app.get('/purchases_lettuce', (req, res) => {
  db.all('SELECT * FROM purchases_lettuce', [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error: ' + err.message });
    res.json(rows);
  });
});

app.post('/purchases_lettuce', (req, res) => {
  const { grams, quantity, totalCost, purchaseDate } = req.body;
  if (!grams || !quantity || !totalCost || !purchaseDate) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  db.get('SELECT * FROM products WHERE grams = ?', [grams], (err, product) => {
    if (err) return res.status(500).json({ error: 'Database error: ' + err.message });
    if (!product) return res.status(404).json({ error: 'Product not found' });
    if (product.quantity < quantity) return res.status(400).json({ error: 'Insufficient stock' });

    db.run('BEGIN TRANSACTION');
    db.run(
      `INSERT INTO purchases_lettuce (grams, quantity, totalCost, purchaseDate) VALUES (?, ?, ?, ?)`,
      [grams, quantity, totalCost, purchaseDate],
      function (err) {
        if (err) {
          db.run('ROLLBACK');
          return res.status(500).json({ error: 'Database error: ' + err.message });
        }
        db.run(
          `UPDATE products SET quantity = quantity - ? WHERE grams = ?`,
          [quantity, grams],
          function (err) {
            if (err) {
              db.run('ROLLBACK');
              return res.status(500).json({ error: 'Database error: ' + err.message });
            }
            db.run('COMMIT', (err) => {
              if (err) return res.status(500).json({ error: 'Database error: ' + err.message });
              res.json({ id: this.lastID });
            });
          }
        );
      }
    );
  });
});

// Purchase endpoints for other app
app.get('/purchases_other', (req, res) => {
  db.all('SELECT * FROM purchases_other', [], (err, rows) => {
    if (err) return res.status(500).json({ error: 'Database error: ' + err.message });
    res.json(rows);
  });
});

app.post('/purchases_other', (req, res) => {
  const { grams, quantity, totalCost, purchaseDate } = req.body;
  if (!grams || !quantity || !totalCost || !purchaseDate) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  db.get('SELECT * FROM products WHERE grams = ?', [grams], (err, product) => {
    if (err) return res.status(500).json({ error: 'Database error: ' + err.message });
    if (!product) return res.status(404).json({ error: 'Product not found' });
    if (product.quantity < quantity) return res.status(400).json({ error: 'Insufficient stock' });

    db.run('BEGIN TRANSACTION');
    db.run(
      `INSERT INTO purchases_other (grams, quantity, totalCost, purchaseDate) VALUES (?, ?, ?, ?)`,
      [grams, quantity, totalCost, purchaseDate],
      function (err) {
        if (err) {
          db.run('ROLLBACK');
          return res.status(500).json({ error: 'Database error: ' + err.message });
        }
        db.run(
          `UPDATE products SET quantity = quantity - ? WHERE grams = ?`,
          [quantity, grams],
          function (err) {
            if (err) {
              db.run('ROLLBACK');
              return res.status(500).json({ error: 'Database error: ' + err.message });
            }
            db.run('COMMIT', (err) => {
              if (err) return res.status(500).json({ error: 'Database error: ' + err.message });
              res.json({ id: this.lastID });
            });
          }
        );
      }
    );
  });
});

// User endpoints
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Missing username or password' });
  }
  db.get(
    `SELECT * FROM users WHERE username = ? AND password = ?`,
    [username, password],
    (err, row) => {
      if (err) return res.status(500).json({ error: 'Database error: ' + err.message });
      if (!row) return res.status(401).json({ error: 'Invalid credentials' });
      res.json({ role: row.role });
    }
  );
});

app.post('/register', (req, res) => {
  const { username, password, role } = req.body;
  if (!username || !password || !role) {
    return res.status(400).json({ error: 'Missing required fields' });
  }
  if (!['user', 'admin'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }
  db.run(
    `INSERT INTO users (username, password, role) VALUES (?, ?, ?)`,
    [username, password, role],
    function (err) {
      if (err) {
        if (err.message.includes('UNIQUE constraint')) {
          return res.status(409).json({ error: 'Username already exists' });
        }
        return res.status(500).json({ error: 'Database error: ' + err.message });
      }
      res.json({ id: this.lastID, message: 'User registered successfully' });
    }
  );
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});