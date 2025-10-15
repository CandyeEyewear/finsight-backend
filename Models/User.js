const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  // Auth0 user ID (unique identifier)
  auth0Id: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  
  // User info
  email: {
    type: String,
    required: true,
    lowercase: true
  },
  name: String,
  
  // Subscription tier
  tier: {
    type: String,
    enum: ['free', 'professional', 'business', 'enterprise'],
    default: 'free'
  },
  
  // Usage tracking
  usage: {
    aiQueriesThisMonth: {
      type: Number,
      default: 0
    },
    reportsThisMonth: {
      type: Number,
      default: 0
    },
    lastResetDate: {
      type: Date,
      default: () => new Date()
    }
  },
  
  // Subscription details
  subscription: {
    status: {
      type: String,
      enum: ['active', 'canceled', 'past_due', 'trialing'],
      default: 'trialing'
    },
    stripeCustomerId: String,
    stripeSubscriptionId: String,
    currentPeriodEnd: Date
  },
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  lastLoginAt: Date
}, {
  timestamps: true
});

// Method to reset monthly usage
userSchema.methods.resetMonthlyUsage = function() {
  const now = new Date();
  const lastReset = this.usage.lastResetDate;
  
  // Reset if it's a new month
  if (now.getMonth() !== lastReset.getMonth() || now.getFullYear() !== lastReset.getFullYear()) {
    this.usage.aiQueriesThisMonth = 0;
    this.usage.reportsThisMonth = 0;
    this.usage.lastResetDate = now;
    return true;
  }
  return false;
};

// Method to check if user can make AI query
userSchema.methods.canMakeAIQuery = function() {
  const limits = {
    free: 10,
    professional: 100,
    business: 500,
    enterprise: Infinity
  };
  
  return this.usage.aiQueriesThisMonth < limits[this.tier];
};

// Method to increment AI usage
userSchema.methods.incrementAIUsage = async function() {
  this.usage.aiQueriesThisMonth += 1;
  await this.save();
};

module.exports = mongoose.model('User', userSchema);
