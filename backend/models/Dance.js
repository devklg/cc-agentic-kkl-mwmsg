const mongoose = require('mongoose');

const danceSchema = new mongoose.Schema({
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
  videoUrl: {
    type: String,
    required: true
  },
  thumbnailUrl: String,
  duration: {
    type: Number, // in seconds
    required: true,
    min: 15,
    max: 300
  },
  style: {
    type: String,
    enum: ['KONGA_LINE', 'FREESTYLE', 'SALSA_KONGA', 'HIP_HOP_KONGA', 'CULTURAL_KONGA', 'PHOENIX_KONGA', 'TEAM_KONGA'],
    required: true
  },
  category: {
    type: String,
    enum: ['DAILY', 'CHALLENGE', 'COMPETITION', 'TUTORIAL', 'CELEBRATION'],
    default: 'DAILY'
  },
  verification: {
    status: {
      type: String,
      enum: ['PENDING', 'VERIFIED', 'REJECTED', 'FLAGGED'],
      default: 'PENDING'
    },
    method: {
      type: String,
      enum: ['AI', 'COMMUNITY', 'MANUAL', 'AUTO'],
      default: 'COMMUNITY'
    },
    verifiedBy: [{
      userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      vote: { type: String, enum: ['APPROVE', 'REJECT'] },
      timestamp: Date
    }],
    aiScore: Number,
    communityScore: Number,
    rejectionReason: String
  },
  earnings: {
    klbEarned: { type: Number, default: 0 },
    bonusEarned: { type: Number, default: 0 },
    multiplierApplied: { type: Number, default: 1 }
  },
  engagement: {
    views: { type: Number, default: 0 },
    likes: { type: Number, default: 0 },
    shares: { type: Number, default: 0 },
    comments: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        text: String,
        timestamp: Date
      }
    ]
  },
  poolParticipation: [{
    poolId: { type: mongoose.Schema.Types.ObjectId, ref: 'Pool' },
    rank: Number,
    winnings: Number
  }],
  metadata: {
    location: String,
    device: String,
    appVersion: String,
    hashtags: [String],
    musicUsed: String,
    choreographyOriginal: Boolean
  }
}, {
  timestamps: true
});

// Indexes
danceSchema.index({ userId: 1, createdAt: -1 });
danceSchema.index({ tenantId: 1, category: 1, 'verification.status': 1 });
danceSchema.index({ style: 1, 'engagement.likes': -1 });

// Methods
danceSchema.methods.verify = async function(method = 'COMMUNITY') {
  this.verification.status = 'VERIFIED';
  this.verification.method = method;
  
  // Award KLB for verified dance
  const baseReward = {
    'DAILY': 10,
    'CHALLENGE': 25,
    'COMPETITION': 50,
    'TUTORIAL': 30,
    'CELEBRATION': 15
  };
  
  this.earnings.klbEarned = baseReward[this.category] * this.earnings.multiplierApplied;
  
  await this.save();
  
  // Create KLB transaction
  await mongoose.model('KLBTransaction').recordDanceEarning(this.userId, this);
  
  return this;
};

module.exports = mongoose.model('Dance', danceSchema);