const express = require('express');
const router = express.Router();
const { expressjwt: jwt } = require('express-jwt');
const jwksRsa = require('jwks-rsa');
const User = require('../models/User');  // ← ADD THIS

// Auth0 JWT verification middleware
const checkJwt = jwt({
  secret: jwksRsa.expressJwtSecret({
    cache: true,
    rateLimit: true,
    jwksRequestsPerMinute: 5,
    jwksUri: `https://${process.env.AUTH0_DOMAIN}/.well-known/jwks.json`
  }),
  audience: process.env.AUTH0_AUDIENCE,
  issuer: `https://${process.env.AUTH0_DOMAIN}/`,
  algorithms: ['RS256']
});

// Subscription limits
const PLAN_LIMITS = {
  free: 10,
  professional: 100,
  business: 500,
  enterprise: Infinity
};

// MongoDB usage tracking middleware
const trackUsage = async (req, res, next) => {
  try {
    const userId = req.auth.sub; // Auth0 user ID
    const userEmail = req.auth.email || req.auth.sub;
    
    console.log('Authenticated user:', userId, userEmail);
    
    // Find or create user
    let user = await User.findOne({ auth0Id: userId });
    
    if (!user) {
      // Create new user on first login
      user = new User({
        auth0Id: userId,
        email: userEmail,
        name: req.auth.name || userEmail,
        tier: 'free',  // Default to free tier
        lastLoginAt: new Date()
      });
      await user.save();
      console.log('✅ Created new user:', userEmail);
    } else {
      // Update last login
      user.lastLoginAt = new Date();
    }
    
    // Reset monthly usage if needed
    user.resetMonthlyUsage();
    
    // Check if user can make AI query
    if (!user.canMakeAIQuery()) {
      const limit = PLAN_LIMITS[user.tier];
      return res.status(429).json({ 
        error: 'Monthly AI query limit reached',
        limit,
        used: user.usage.aiQueriesThisMonth,
        tier: user.tier,
        message: `You've used ${user.usage.aiQueriesThisMonth} of ${limit} AI queries this month. Upgrade to continue.`,
        upgradeUrl: '/pricing'
      });
    }
    
    // Increment usage
    await user.incrementAIUsage();
    
    console.log(`User ${userEmail} usage: ${user.usage.aiQueriesThisMonth}/${PLAN_LIMITS[user.tier]} (${user.tier} tier)`);
    
    // Attach user to request
    req.user = user;
    
    next();
  } catch (error) {
    console.error('Usage tracking error:', error);
    res.status(500).json({ 
      error: 'Failed to track usage',
      message: error.message 
    });
  }
};

// Protected AI endpoint with auth and usage tracking
router.post('/analyze', checkJwt, trackUsage, async (req, res) => {
  try {
    const { prompt, modelData, messages, systemMessage } = req.body;

    console.log('Received authenticated AI request');
    console.log('User tier:', req.user.tier);

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    if (!process.env.DEEPSEEK_API_KEY) {
      console.error('DEEPSEEK_API_KEY is not set');
      return res.status(500).json({ 
        error: 'Server configuration error: Missing API key' 
      });
    }

    // Build messages array
    const deepseekMessages = [];
    
    if (systemMessage) {
      deepseekMessages.push({
        role: "system",
        content: systemMessage
      });
    }
    
    if (messages && Array.isArray(messages)) {
      deepseekMessages.push(...messages);
    }
    
    deepseekMessages.push({
      role: "user",
      content: prompt
    });

    // Call DeepSeek API
    const response = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'deepseek-chat',
        messages: deepseekMessages,
        temperature: 0.8,
        max_tokens: 1500,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('DeepSeek API Error:', errorText);
      return res.status(response.status).json({ 
        error: 'DeepSeek API error',
        details: errorText 
      });
    }

    const data = await response.json();
    console.log('✅ DeepSeek API response received');

    // Return with usage info
    res.json({
      choices: [{
        message: {
          content: data.choices[0].message.content
        }
      }],
      model: data.model,
      usage: data.usage,
      userUsage: {
        used: req.user.usage.aiQueriesThisMonth,
        limit: PLAN_LIMITS[req.user.tier],
        tier: req.user.tier,
        percentage: (req.user.usage.aiQueriesThisMonth / PLAN_LIMITS[req.user.tier]) * 100
      }
    });

  } catch (error) {
    console.error('AI Analysis Error:', error);
    res.status(500).json({ 
      error: 'Failed to analyze data',
      message: error.message 
    });
  }
});

// Get user usage stats
router.get('/usage', checkJwt, async (req, res) => {
  try {
    const userId = req.auth.sub;
    const user = await User.findOne({ auth0Id: userId });
    
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    user.resetMonthlyUsage();
    
    res.json({
      used: user.usage.aiQueriesThisMonth,
      limit: PLAN_LIMITS[user.tier],
      tier: user.tier,
      percentage: (user.usage.aiQueriesThisMonth / PLAN_LIMITS[user.tier]) * 100,
      resetDate: user.usage.lastResetDate
    });
  } catch (error) {
    console.error('Error fetching usage:', error);
    res.status(500).json({ error: 'Failed to fetch usage' });
  }
});

// Test endpoint
router.get('/test', (req, res) => {
  res.json({ 
    message: 'AI routes working',
    deepseekConfigured: !!process.env.DEEPSEEK_API_KEY,
    auth0Configured: !!process.env.AUTH0_DOMAIN && !!process.env.AUTH0_AUDIENCE,
    mongodbConfigured: !!process.env.MONGODB_URI
  });
});

module.exports = router;