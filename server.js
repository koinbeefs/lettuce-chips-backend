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
        ('admin', 'admin123', 'admin'), 
        ('teofilo', 'teofilo123', 'user'), 
        ('daxton', 'daxton123', 'user'), 
        ('faith', 'faith123', 'user')`
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
  console.log('POST /purchase-details received:', req.body);
  if (!grams || !quantity || !totalCost) {
    return res.status(400).json({ error: 'Missing required fields: grams, quantity, totalCost' });
  }
  const parsedQuantity = Number(quantity);
  if (isNaN(parsedQuantity) || parsedQuantity < 1) {
    return res.status(400).json({ error: 'Invalid quantity: must be a number >= 1' });
  }
  purchaseDetails = { grams, quantity: parsedQuantity, totalCost };
  console.log('Stored purchaseDetails:', purchaseDetails);
  res.json({ message: 'Purchase details saved' });
});

app.get('/purchase-details', (req, res) => {
  console.log('GET /purchase-details returning:', purchaseDetails);
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
  console.log('POST /purchases_lettuce received:', req.body); // Debug log
  if (!grams || !quantity || !totalCost || !purchaseDate) {
    console.log('Validation failed: Missing fields');
    return res.status(400).json({ error: 'Missing required fields: grams, quantity, totalCost, purchaseDate' });
  }

  const parsedQuantity = Number(quantity);
  if (isNaN(parsedQuantity) || parsedQuantity < 1) {
    console.log('Validation failed: Invalid quantity');
    return res.status(400).json({ error: 'Invalid quantity: must be a number >= 1' });
  }

  db.get('SELECT * FROM products WHERE grams = ?', [grams], (err, product) => {
    if (err) {
      console.log('Database error:', err.message);
      return res.status(500).json({ error: 'Database error: ' + err.message });
    }
    if (!product) {
      console.log('Validation failed: Product not found');
      return res.status(404).json({ error: 'Product not found' });
    }
    if (product.quantity < parsedQuantity) {
      console.log('Validation failed: Insufficient stock', { available: product.quantity, requested: parsedQuantity });
      return res.status(400).json({ error: `Insufficient stock: ${product.quantity} available` });
    }

    db.run('BEGIN TRANSACTION', (err) => {
      if (err) {
        console.log('Transaction begin error:', err.message);
        return res.status(500).json({ error: 'Database error: ' + err.message });
      }
      db.run(
        `INSERT INTO purchases_lettuce (grams, quantity, totalCost, purchaseDate) VALUES (?, ?, ?, ?)`,
        [grams, parsedQuantity, totalCost, purchaseDate],
        function (err) {
          if (err) {
            console.log('Insert error:', err.message);
            db.run('ROLLBACK');
            return res.status(500).json({ error: 'Database error: ' + err.message });
          }
          db.run(
            `UPDATE products SET quantity = quantity - ? WHERE grams = ?`,
            [parsedQuantity, grams],
            function (err) {
              if (err) {
                console.log('Update error:', err.message);
                db.run('ROLLBACK');
                return res.status(500).json({ error: 'Database error: ' + err.message });
              }
              db.run('COMMIT', (err) => {
                if (err) {
                  console.log('Commit error:', err.message);
                  return res.status(500).json({ error: 'Database error: ' + err.message });
                }
                console.log('Purchase completed:', { id: this.lastID });
                res.json({ id: this.lastID, message: 'Purchase completed successfully' });
              });
            }
          );
        }
      );
    });
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
  console.log('POST /purchases_other received:', req.body);
  if (!grams || !quantity || !totalCost || !purchaseDate) {
    console.log('Validation failed: Missing fields');
    return res.status(400).json({ error: 'Missing required fields: grams, quantity, totalCost, purchaseDate' });
  }

  const parsedQuantity = Number(quantity);
  if (isNaN(parsedQuantity) || parsedQuantity < 1) {
    console.log('Validation failed: Invalid quantity');
    return res.status(400).json({ error: 'Invalid quantity: must be a number >= 1' });
  }

  db.get('SELECT * FROM products WHERE grams = ?', [grams], (err, product) => {
    if (err) {
      console.log('Database error:', err.message);
      return res.status(500).json({ error: 'Database error: ' + err.message });
    }
    if (!product) {
      console.log('Validation failed: Product not found');
      return res.status(404).json({ error: 'Product not found' });
    }
    if (product.quantity < parsedQuantity) {
      console.log('Validation failed: Insufficient stock', { available: product.quantity, requested: parsedQuantity });
      return res.status(400).json({ error: `Insufficient stock: ${product.quantity} available` });
    }

    db.run('BEGIN TRANSACTION', (err) => {
      if (err) {
        console.log('Transaction begin error:', err.message);
        return res.status(500).json({ error: 'Database error: ' + err.message });
      }
      db.run(
        `INSERT INTO purchases_other (grams, quantity, totalCost, purchaseDate) VALUES (?, ?, ?, ?)`,
        [grams, parsedQuantity, totalCost, purchaseDate],
        function (err) {
          if (err) {
            console.log('Insert error:', err.message);
            db.run('ROLLBACK');
            return res.status(500).json({ error: 'Database error: ' + err.message });
          }
          db.run(
            `UPDATE products SET quantity = quantity - ? WHERE grams = ?`,
            [parsedQuantity, grams],
            function (err) {
              if (err) {
                console.log('Update error:', err.message);
                db.run('ROLLBACK');
                return res.status(500).json({ error: 'Database error: ' + err.message });
              }
              db.run('COMMIT', (err) => {
                if (err) {
                  console.log('Commit error:', err.message);
                  return res.status(500).json({ error: 'Database error: ' + err.message });
                }
                console.log('Purchase completed:', { id: this.lastID });
                res.json({ id: this.lastID, message: 'Purchase completed successfully' });
              });
            }
          );
        }
      );
    });
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