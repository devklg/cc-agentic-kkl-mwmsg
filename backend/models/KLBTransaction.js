const mongoose = require('mongoose');

const klbTransactionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: ['EARNED', 'SPENT', 'BONUS', 'PENALTY', 'TRANSFER', 'STAKED', 'UNSTAKED', 'DIVIDEND'],
    required: true
  },
  category: {
    type: String,
    enum: ['DANCE', 'ACHIEVEMENT', 'REFERRAL', 'POOL', 'LEVEL_UP', 'PURCHASE', 'CONVERSION'],
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  balance: {
    before: { type: Number, required: true },
    after: { type: Number, required: true }
  },
  source: {
    danceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Dance' },
    achievementId: { type: mongoose.Schema.Types.ObjectId, ref: 'Achievement' },
    poolId: { type: mongoose.Schema.Types.ObjectId, ref: 'Pool' },
    nftId: String,
    referralId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
  },
  multipliers: {
    nftLevel: { type: Number, default: 1 },
    streakBonus: { type: Number, default: 1 },
    teamBonus: { type: Number, default: 1 },
    eventBonus: { type: Number, default: 1 }
  },
  totalMultiplier: {
    type: Number,
    default: 1
  },
  status: {
    type: String,
    enum: ['PENDING', 'COMPLETED', 'FAILED', 'REVERSED'],
    default: 'COMPLETED'
  },
  transactionHash: String, // For blockchain transactions
  metadata: {
    danceStyle: String,
    achievementName: String,
    poolName: String,
    notes: String
  }
}, {
  timestamps: true
});

// Indexes
klbTransactionSchema.index({ userId: 1, type: 1, createdAt: -1 });
klbTransactionSchema.index({ tenantId: 1, category: 1, createdAt: -1 });
klbTransactionSchema.index({ transactionHash: 1 });

// Calculate total multiplier before saving
klbTransactionSchema.pre('save', function(next) {
  this.totalMultiplier = 
    this.multipliers.nftLevel * 
    this.multipliers.streakBonus * 
    this.multipliers.teamBonus * 
    this.multipliers.eventBonus;
  next();
});

// Statics
klbTransactionSchema.statics.recordDanceEarning = async function(userId, danceData) {
  const user = await mongoose.model('User').findById(userId);
  const baseEarning = danceData.baseKLB || 10;
  
  // Calculate multipliers
  const nftMultiplier = user.nftLevel || 1;
  const streakMultiplier = user.danceStreak > 7 ? 1.5 : 1;
  
  const totalEarning = baseEarning * nftMultiplier * streakMultiplier;
  
  return this.create({
    userId,
    tenantId: user.tenantId,
    type: 'EARNED',
    category: 'DANCE',
    amount: totalEarning,
    balance: {
      before: user.klbBalance || 0,
      after: (user.klbBalance || 0) + totalEarning
    },
    source: { danceId: danceData._id },
    multipliers: {
      nftLevel: nftMultiplier,
      streakBonus: streakMultiplier
    }
  });
};

module.exports = mongoose.model('KLBTransaction', klbTransactionSchema);