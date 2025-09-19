const mongoose = require('mongoose');

const poolSchema = new mongoose.Schema({
  tenantId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Tenant',
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true
  },
  type: {
    type: String,
    enum: ['DANCE', 'PREDICTION', 'SERVICE', 'ACHIEVEMENT', 'LEADERSHIP', 'WEALTH', 'CHARITY'],
    required: true
  },
  category: {
    type: String,
    enum: ['DAILY', 'WEEKLY', 'MONTHLY', 'SPECIAL', 'PROGRESSIVE'],
    default: 'DAILY'
  },
  entryFee: {
    amount: { type: Number, required: true },
    currency: { type: String, enum: ['USD', 'KLB', 'PENNY'], default: 'USD' }
  },
  totalPoolAmount: {
    type: Number,
    default: 0
  },
  participantCount: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['UPCOMING', 'ACTIVE', 'VOTING', 'CALCULATING', 'DISTRIBUTED', 'CANCELLED'],
    default: 'UPCOMING'
  },
  distribution: {
    winners: { type: Number, default: 70 }, // 70% to winners
    charity: { type: Number, default: 10 }, // 10% to charity
    platform: { type: Number, default: 15 }, // 15% to platform
    referrers: { type: Number, default: 5 }  // 5% to referrers
  },
  startTime: {
    type: Date,
    required: true
  },
  endTime: {
    type: Date,
    required: true
  },
  votingEndTime: Date,
  rules: {
    minParticipants: { type: Number, default: 10 },
    maxParticipants: Number,
    eligibilityCriteria: [String],
    judgingCriteria: [String]
  },
  prizes: [{
    position: Number,
    percentage: Number,
    fixedAmount: Number,
    nftReward: String,
    klbBonus: Number
  }],
  participants: [{
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    entryTime: Date,
    submission: mongoose.Schema.Types.Mixed,
    votes: { type: Number, default: 0 },
    rank: Number,
    winnings: Number,
    paid: { type: Boolean, default: false }
  }],
  metadata: {
    danceStyle: String,
    predictionTarget: String,
    serviceType: String,
    sponsoredBy: String,
    celebrationTheme: String
  }
}, {
  timestamps: true
});

// Indexes
poolSchema.index({ tenantId: 1, type: 1, status: 1 });
poolSchema.index({ startTime: 1, endTime: 1 });
poolSchema.index({ 'participants.userId': 1 });

// Methods
poolSchema.methods.enter = async function(userId, submission) {
  if (this.status !== 'ACTIVE') {
    throw new Error('Pool is not active');
  }
  
  const existingEntry = this.participants.find(p => p.userId.toString() === userId);
  if (existingEntry) {
    throw new Error('Already entered in this pool');
  }
  
  this.participants.push({
    userId,
    entryTime: new Date(),
    submission
  });
  
  this.participantCount++;
  this.totalPoolAmount += this.entryFee.amount;
  
  return this.save();
};

poolSchema.methods.distributeWinnings = async function() {
  // Sort participants by votes/rank
  this.participants.sort((a, b) => b.votes - a.votes);
  
  // Calculate winnings for each position
  const winnerPool = this.totalPoolAmount * (this.distribution.winners / 100);
  
  for (let i = 0; i < this.prizes.length && i < this.participants.length; i++) {
    const prize = this.prizes[i];
    const participant = this.participants[i];
    
    participant.rank = i + 1;
    participant.winnings = prize.percentage 
      ? winnerPool * (prize.percentage / 100)
      : prize.fixedAmount;
  }
  
  this.status = 'DISTRIBUTED';
  return this.save();
};

module.exports = mongoose.model('Pool', poolSchema);