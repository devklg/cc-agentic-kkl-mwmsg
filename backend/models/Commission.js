const mongoose = require('mongoose');

const commissionSchema = new mongoose.Schema({
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
    enum: ['DIRECT', 'BINARY', 'MATCHING', 'POOL', 'DANCE', 'ACHIEVEMENT', 'LEADERSHIP'],
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  currency: {
    type: String,
    enum: ['USD', 'KLB', 'KONGA'],
    default: 'USD'
  },
  sourceUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  sourceTransaction: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Transaction'
  },
  level: {
    type: Number,
    default: 1
  },
  percentage: {
    type: Number,
    min: 0,
    max: 100
  },
  status: {
    type: String,
    enum: ['PENDING', 'APPROVED', 'PAID', 'CANCELLED', 'HELD'],
    default: 'PENDING'
  },
  binaryLeg: {
    type: String,
    enum: ['LEFT', 'RIGHT']
  },
  volumeGenerated: {
    left: { type: Number, default: 0 },
    right: { type: Number, default: 0 }
  },
  paidAt: Date,
  heldUntil: Date,
  notes: String,
  metadata: {
    poolId: String,
    danceId: String,
    achievementId: String,
    cycleWeek: Number,
    qualificationMet: Boolean
  }
}, {
  timestamps: true
});

// Indexes for performance
commissionSchema.index({ userId: 1, status: 1, createdAt: -1 });
commissionSchema.index({ tenantId: 1, type: 1, createdAt: -1 });
commissionSchema.index({ paidAt: 1, status: 1 });

// Methods
commissionSchema.methods.approve = async function() {
  this.status = 'APPROVED';
  return this.save();
};

commissionSchema.methods.pay = async function() {
  this.status = 'PAID';
  this.paidAt = new Date();
  return this.save();
};

// Statics
commissionSchema.statics.calculateBinaryCommissions = async function(userId, tenantId) {
  // Binary commission calculation logic
  const user = await mongoose.model('User').findById(userId);
  const leftVolume = await this.aggregate([
    { $match: { userId, binaryLeg: 'LEFT', status: 'APPROVED' } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);
  
  const rightVolume = await this.aggregate([
    { $match: { userId, binaryLeg: 'RIGHT', status: 'APPROVED' } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);
  
  // Calculate matching bonus
  const weakerLeg = Math.min(leftVolume[0]?.total || 0, rightVolume[0]?.total || 0);
  const commissionPercentage = user.rank?.binaryPercentage || 10;
  
  return {
    leftVolume: leftVolume[0]?.total || 0,
    rightVolume: rightVolume[0]?.total || 0,
    weakerLeg,
    commission: weakerLeg * (commissionPercentage / 100)
  };
};

module.exports = mongoose.model('Commission', commissionSchema);