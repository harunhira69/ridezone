const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

// Load env variables
const envResult = dotenv.config();
if (envResult.error) dotenv.config({ path: '.env.local' });

const app = express();
const port = process.env.PORT || 5000;

// Validate required env variables
if (!process.env.DB_USER || !process.env.DB_PASS) {
  console.error("❌ Missing DB_USER or DB_PASS in .env");
  process.exit(1);
}

// MongoDB Atlas URI
const uri =
  `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}` +
  `@cluster0.tlyifmj.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;

const client = new MongoClient(uri, {
  serverApi: { version: ServerApiVersion.v1, strict: true, deprecationErrors: true }
});

// Middleware
app.use(cors({
  origin: ["http://localhost:3000", "https://ridezone-ui.vercel.app"],
  credentials: true,
}));
app.use(express.json());

// Collections
let userCollection;
let productCollection;

// =============================
// Root Route
// =============================
app.get("/", (req, res) => {
  res.send("RideZone API is running 🚀");
});

// =============================
// REGISTER (Credentials)
// =============================
app.post("/register", async (req, res) => {
  try {
    if (!userCollection)
      return res.status(500).json({ message: "DB not connected" });

    const { name, email, password, image } = req.body;

    // ⭐ FIX 1: Normalize email to lowercase
    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }
    const normalizedEmail = email.toLowerCase();
    
    // ⭐ FIX 2: Check ONLY the truly essential fields (name, email, password)
    // The image field is now optional and can be an empty string or null.
    if (!name || !password)
      return res.status(400).json({ message: "Name and password are required" });

    // 🛑 Check existing user using the normalized email
    const existing = await userCollection.findOne({ email: normalizedEmail });
    if (existing)
      return res.status(400).json({ message: "User already exists" });

    // 🔐 Hash password
    const hashed = await bcrypt.hash(password, 10);
    
    // Sanitize image: If the client sent an empty string, store it as null.
    const finalImage = image || null; 

    // ✅ Insert data
    const result = await userCollection.insertOne({
      name,
      email: normalizedEmail, // Store normalized email
      password: hashed,
      image: finalImage,      // Store null if image was empty
      provider: "credentials",
      createdAt: new Date(),
    });

    return res
      .status(201)
      .json({ message: "Registration successful", id: result.insertedId });

  } catch (err) {
    console.error("Register error:", err);
    return res.status(500).json({ message: "Server error" });
  }
});


// =============================
// GOOGLE SIGN-IN (for NextAuth)
// =============================
app.post("/auth/google-signin", async (req, res) => {
  try {
    if (!userCollection) return res.status(500).json({ message: "DB not connected" });

    const { name, email, image, googleId } = req.body;
    if (!email) return res.status(400).json({ message: "Email required" });

    let user = await userCollection.findOne({ email });

    // Create new google user
    if (!user) {
      const result = await userCollection.insertOne({
        name,
        email,
        image,
        googleId,
        provider: "google",
        createdAt: new Date(),
      });

      return res.status(201).json({
        message: "Google user created",
        user: { _id: result.insertedId, name, email, image }
      });
    }

    // Update old credential user → google user
    if (!user.googleId) {
      await userCollection.updateOne(
        { email },
        {
          $set: {
            googleId,
            image: image || user.image,
            provider: "google"
          }
        }
      );
    }

    res.status(200).json({
      message: "Google login success",
      user: { _id: user._id, name: user.name, email: user.email, image: user.image }
    });

  } catch (err) {
    console.error("Google signin error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// =============================
// LOGIN (Credentials)
// =============================
app.post("/login", async (req, res) => {
  try {
    if (!userCollection) return res.status(500).json({ message: "DB not connected" });

    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email & Password required" });
    }

    // Check email exists
    const user = await userCollection.findOne({ email });

    if (!user) {
      return res.status(400).json({ message: "Invalid email" });
    }

    // Compare password with hashed password
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(400).json({ message: "Incorrect password" });
    }

    res.status(200).json({
      message: "Login successful",
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        provider: user.provider
      }
    });

  } catch (err) {
    console.error("Login error:", err);
    res.status(500).json({ message: "Server error" });
  }
});


// =============================
// GET ALL PRODUCTS
// =============================
app.get("/products", async (req, res) => {
  try {
    const items = await productCollection.find().toArray();
    res.json(items);
  } catch (err) {
    console.error("Get products error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// =============================
// GET SINGLE PRODUCT
// =============================
app.get("/products/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id))
      return res.status(400).json({ message: "Invalid ID" });

    const product = await productCollection.findOne({ _id: new ObjectId(id) });
    if (!product) return res.status(404).json({ message: "Not found" });

    res.json(product);
  } catch (err) {
    console.error("Single product error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// =============================
// ADD PRODUCT
// =============================
app.post("/products", async (req, res) => {
  try {
    const { title, brand, price, image, model, shortDescription, userId } = req.body;

    if (!title || !brand || !price)
      return res.status(400).json({ message: "Fill required fields" });

    const safeImage = image && image.startsWith("http") ? image : null;

    const result = await productCollection.insertOne({
      title,
      brand,
      model,
      price,
      image: safeImage,
      shortDescription,
      userId,
      createdAt: new Date(),
    });

    res.status(201).json({ message: "Added successfully", id: result.insertedId });

  } catch (err) {
    console.error("Add product error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// =============================
// UPDATE PRODUCT
// =============================
app.put("/products/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id))
      return res.status(400).json({ message: "Invalid ID" });

    let data = req.body;

    if (data.image && !data.image.startsWith("http")) {
      data.image = null;
    }

    const result = await productCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: data }
    );

    if (result.matchedCount === 0)
      return res.status(404).json({ message: "Not found" });

    res.json({ message: "Updated successfully" });

  } catch (err) {
    console.error("Update error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// =============================
// DELETE PRODUCT
// =============================
app.delete("/products/:id", async (req, res) => {
  try {
    const { id } = req.params;

    if (!ObjectId.isValid(id))
      return res.status(400).json({ message: "Invalid ID" });

    const result = await productCollection.deleteOne({ _id: new ObjectId(id) });

    if (result.deletedCount === 0)
      return res.status(404).json({ message: "Not found" });

    res.json({ message: "Deleted successfully" });

  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// =============================
// CONNECT MONGODB
// =============================
async function run() {
  try {
    console.log("🔄 Connecting to MongoDB...");
    await client.connect();

    const db = client.db("ridezone");
    userCollection = db.collection("users");
    productCollection = db.collection("products");

    console.log("✅ MongoDB Connected!");
  } catch (err) {
    console.error("❌ MongoDB Error:", err);
    process.exit(1);
  }
}

run().catch(console.dir);

// =============================
// START SERVER
// =============================
app.listen(port, () => {
  console.log(`🚀 RideZone API running at http://localhost:${port}`);
});
