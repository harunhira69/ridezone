const express = require('express')
const cors = require('cors')
const dotenv = require('dotenv');
const bcrypt = require('bcryptjs');

// Load environment variables. Try default `.env`, fall back to `.env.local` if not found.
const envResult = dotenv.config();
if (envResult.error) {
  dotenv.config({ path: '.env.local' });
}
const { MongoClient, ServerApiVersion } = require('mongodb');
const app = express()
const port = process.env.PORT||5000;
// Basic validation for required environment variables
if (!process.env.DB_USER || !process.env.DB_PASS) {
  console.error('Missing DB_USER or DB_PASS environment variables. Please add them to .env or .env.local');
  console.error('Current env keys:', { DB_USER: !!process.env.DB_USER, DB_PASS: !!process.env.DB_PASS });
  // don't exit immediately — allow developer to see logs; but Mongo connect will fail without credentials
}

const uri = `mongodb+srv://${process.env.DB_USER || ''}:${process.env.DB_PASS || ''}@cluster0.tlyifmj.mongodb.net/?appName=Cluster0`;

app.use(cors());
app.use(express.json());
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

// Global collections (will be initialized in run())
let userCollection;
let bycyleCollection;

// Define routes BEFORE connecting to database
app.get('/', (req, res) => {
  res.send('Hello World!')
})

app.get('/bicycles', async (req, res) => {
  try {
    if (!bycyleCollection) {
      return res.status(500).json({ message: "Database not connected yet" });
    }
    const result = await bycyleCollection.find().toArray();
    res.send(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error" });
  }
});

app.post('/register', async (req, res) => {
  try {
    if (!userCollection) {
      return res.status(500).json({ message: "Database not connected yet" });
    }

    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "All fields are required" });
    }

    // check existing user
    const existingUser = await userCollection.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    // hash password
    const hashedPassword = await bcrypt.hash(password, 10);

    // save to database
    const result = await userCollection.insertOne({
      name,
      email,
      password: hashedPassword,
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

app.post('/auth/google-signin', async (req, res) => {
  try {
    if (!userCollection) {
      return res.status(500).json({ message: "Database not connected yet" });
    }

    const { name, email, image, googleId } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    // Check if user already exists
    let user = await userCollection.findOne({ email });

    if (!user) {
      // Create new user (no password for OAuth users)
      const result = await userCollection.insertOne({
        name,
        email,
        image,
        googleId,
        provider: 'google',
        createdAt: new Date(),
      });

      user = {
        _id: result.insertedId,
        name,
        email,
        image,
      };

      return res.status(201).json({
        message: "User created successfully",
        user,
      });
    } else {
      // Update existing user with OAuth info if missing
      if (!user.googleId) {
        await userCollection.updateOne(
          { email },
          {
            $set: {
              googleId,
              image: image || user.image,
              provider: 'google',
              updatedAt: new Date(),
            },
          }
        );
      }

      return res.status(200).json({
        message: "User already exists",
        user: {
          _id: user._id,
          name: user.name,
          email: user.email,
          image: user.image,
        },
      });
    }
  } catch (err) {
    console.error("Error in /auth/google-signin:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Connect to database
async function run() {
  try {
    console.log("🔄 Attempting to connect to MongoDB...");
    console.log("URI:", uri.replace(/:[^:]*@/, ":****@")); // Hide password in logs
    
    // Connect the client to the server
    await client.connect();

    const db = client.db('ridezone');
    bycyleCollection = db.collection('by_cycle');
    userCollection = db.collection('users');

    await client.db("admin").command({ ping: 1 });
    console.log("✅ Pinged your deployment. You successfully connected to MongoDB!");
  } catch (err) {
    console.error("❌ MongoDB connection error:", err.message);
    console.error("Full error:", err);
    process.exit(1); // Exit if can't connect to DB
  }
}
run().catch(console.dir);

app.listen(port, () => {
  console.log(`✅ Example app listening on port ${port}`)
  console.log(`📍 You can test at: http://localhost:${port}`)
})
