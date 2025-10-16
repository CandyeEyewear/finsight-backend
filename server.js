require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const aiRoutes = require('./routes/ai'); // your API routes file

const app = express();

// ✅ Middleware
app.use(cors());
app.use(express.json());

// ✅ Root route — friendly homepage check
app.get('/', (req, res) => {
  res.send('✅ FinSight API is running securely via HTTPS!');
});

// ✅ Health check (useful for uptime monitoring)
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK',
    message: 'Backend is running',
    mongodb: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
    timestamp: new Date().toISOString()
  });
});

// ✅ Actual API routes
app.use('/api/ai', aiRoutes);

// ✅ Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Connected to MongoDB'))
  .catch(err => console.error('❌ MongoDB connection error:', err));

// ✅ Start server (only once!)
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {  // ← Bind to 0.0.0.0 for DigitalOcean
  console.log(`🚀 FinSight API running on port ${PORT}`);
  console.log(`📍 Health check: http://localhost:${PORT}/health`);
  console.log(`🤖 AI endpoint: http://localhost:${PORT}/api/ai/analyze`);
});


// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'Backend is running',
    mongodb: mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected',
    timestamp: new Date().toISOString()
  });
});

