const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');

// Load environment variables
const envResult = dotenv.config();
if (envResult.error) {
  dotenv.config({ path: '.env.local' });
}

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express();
const port = process.env.PORT || 5000;

// Validate required environment variables
if (!process.env.DB_USER || !process.env.DB_PASS) {
  console.error('❌ Missing DB_USER or DB_PASS in environment variables.');
  console.error('Loaded:', {
    DB_USER: !!process.env.DB_USER,
    DB_PASS: !!process.env.DB_PASS,
  });
}

// MongoDB connection string
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.tlyifmj.mongodb.net/?appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

// Middleware
app.use(cors());
app.use(express.json());

// Global collections (initialized after DB connection)
let userCollection;
let productCollection;

// -------------------------
// Routes
// -------------------------

app.get('/', (req, res) => {
  res.send('RideZone API is running 🚴‍♂️');
});

// -------------------------
// Register User
// -------------------------
app.post('/register', async (req, res) => {
  try {
    if (!userCollection) return res.status(500).json({ message: "Database not connected yet" });

    const { name, email, password } = req.body;

    if (!name || !email || !password)
      return res.status(400).json({ message: "All fields are required" });

    // Check existing user
    const existing = await userCollection.findOne({ email });
    if (existing) return res.status(400).json({ message: "User already exists" });

    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await userCollection.insertOne({
      name,
      email,
      password: hashedPassword,
      provider: "credentials",
      createdAt: new Date(),
    });

    res.status(201).json({
      message: "User registered successfully",
      userId: result.insertedId,
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// -------------------------
// Google Sign-In
// -------------------------
app.post('/auth/google-signin', async (req, res) => {
  try {
    if (!userCollection) return res.status(500).json({ message: "Database not connected yet" });

    const { name, email, image, googleId } = req.body;

    if (!email) return res.status(400).json({ message: "Email is required" });

    let user = await userCollection.findOne({ email });

    if (!user) {
      // New Google OAuth User
      const result = await userCollection.insertOne({
        name,
        email,
        image,
        googleId,
        provider: "google",
        createdAt: new Date(),
      });

      return res.status(201).json({
        message: "User created successfully",
        user: {
          _id: result.insertedId,
          name,
          email,
          image,
        },
      });
    }

    // Update if missing Google fields
    if (!user.googleId) {
      await userCollection.updateOne(
        { email },
        {
          $set: {
            googleId,
            image: image || user.image,
            provider: "google",
            updatedAt: new Date(),
          },
        }
      );
    }

    // Return existing user
    res.status(200).json({
      message: "User already exists",
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        image: user.image,
      },
    });

  } catch (err) {
    console.error("Error in /auth/google-signin:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// -------------------------
// Products API
// -------------------------
app.get('/products', async (req, res) => {
  try {
    if (!productCollection) return res.status(500).json({ message: "Database not connected" });

    const result = await productCollection.find().toArray();
    res.send(result);

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

// Add new product
app.post('/products', async (req, res) => {
  try {
    if (!productCollection) return res.status(500).json({ message: "Database not connected" });

    const { name, brand, model, category, price, image, description, userId } = req.body;

    if (!name || !brand || !category || !price)
      return res.status(400).json({ message: "Please fill all required fields" });

    const result = await productCollection.insertOne({
      name,
      brand,
      model,
      category,
      price,
      image,
      description,
      userId,
      createdAt: new Date(),
    });

    res.status(201).json({
      message: "Product added successfully",
      productId: result.insertedId,
    });

  } catch (err) {
    console.error("Error adding product:", err);
    res.status(500).json({ message: "Server error" });
  }
});


app.get('/products/:id', async (req, res) => {
  try {
    if (!productCollection)
      return res.status(500).json({ message: "Database not connected yet" });

    const id = req.params.id;

    if (!ObjectId.isValid(id)) {
      return res.status(400).json({ message: "Invalid product ID" });
    }

    const product = await productCollection.findOne({ _id: new ObjectId(id) });

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    res.json(product);
  } catch (err) {
    console.error("Error fetching product:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// -------------------------
// MongoDB Connection
// -------------------------
async function run() {
  try {
    console.log("🔄 Connecting to MongoDB...");
    console.log("URI:", uri.replace(/:[^:]*@/, ":****@")); // Hide password

    await client.connect();

    const db = client.db('ridezone');
    userCollection = db.collection('users');
    productCollection = db.collection('products');

    // Fix wrong imgbb URLs once
    const updateResult = await productCollection.updateMany(
      { image: { $regex: "i.ibb.co.com" } },
      [
        {
          $set: {
            image: {
              $replaceOne: {
                input: "$image",
                find: "i.ibb.co.com",
                replacement: "i.ibb.co",
              },
            },
          },
        },
      ]
    );

    console.log(`🔧 Fixed ${updateResult.modifiedCount} broken product image URLs.`);

    await client.db("admin").command({ ping: 1 });
    console.log("✅ MongoDB Connected Successfully!");

  } catch (err) {
    console.error("❌ MongoDB connection error:", err.message);
    process.exit(1);
  }
}

run().catch(console.dir);

// -------------------------
// Start Server
// -------------------------
app.listen(port, () => {
  console.log(`🚀 RideZone API running at http://localhost:${port}`);
});
