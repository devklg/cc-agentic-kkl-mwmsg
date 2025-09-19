const Dance = require('../models/Dance');
const KLBTransaction = require('../models/KLBTransaction');
const multer = require('multer');
const AWS = require('aws-sdk');

// Configure S3 for video storage
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION
});

const danceController = {
  // Submit dance video
  async submitDance(req, res) {
    try {
      const { style, category, metadata } = req.body;
      const userId = req.user.id;
      
      // Upload video to S3 (assuming multer middleware processed the file)
      const videoUrl = await uploadToS3(req.file);
      
      const dance = await Dance.create({
        userId,
        tenantId: req.tenantId,
        videoUrl,
        duration: req.body.duration,
        style,
        category,
        metadata
      });
      
      // Start verification process (could be async/queued)
      if (category === 'DAILY') {
        // Auto-verify daily dances for now
        await dance.verify('AUTO');
      }
      
      res.status(201).json({ success: true, data: dance });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  // Get user's dance history
  async getUserDances(req, res) {
    try {
      const { userId } = req.params;
      const { page = 1, limit = 20 } = req.query;
      
      const dances = await Dance.find({ userId, tenantId: req.tenantId })
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit);
      
      const total = await Dance.countDocuments({ userId, tenantId: req.tenantId });
      
      res.json({
        success: true,
        data: dances,
        pagination: {
          total,
          page: parseInt(page),
          pages: Math.ceil(total / limit)
        }
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  // Community verification voting
  async verifyDance(req, res) {
    try {
      const { danceId } = req.params;
      const { vote } = req.body; // APPROVE or REJECT
      const userId = req.user.id;
      
      const dance = await Dance.findOne({
        _id: danceId,
        tenantId: req.tenantId,
        'verification.status': 'PENDING'
      });
      
      if (!dance) {
        return res.status(404).json({ success: false, error: 'Dance not found or already verified' });
      }
      
      // Add vote
      dance.verification.verifiedBy.push({
        userId,
        vote,
        timestamp: new Date()
      });
      
      // Check if enough votes to verify (e.g., 5 approvals)
      const approvals = dance.verification.verifiedBy.filter(v => v.vote === 'APPROVE').length;
      const rejections = dance.verification.verifiedBy.filter(v => v.vote === 'REJECT').length;
      
      if (approvals >= 5) {
        await dance.verify('COMMUNITY');
      } else if (rejections >= 3) {
        dance.verification.status = 'REJECTED';
        dance.verification.rejectionReason = 'Community rejection';
        await dance.save();
      } else {
        await dance.save();
      }
      
      res.json({ success: true, message: 'Vote recorded' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  // Get dance feed
  async getDanceFeed(req, res) {
    try {
      const { style, category, page = 1, limit = 20 } = req.query;
      
      const filter = {
        tenantId: req.tenantId,
        'verification.status': 'VERIFIED'
      };
      
      if (style) filter.style = style;
      if (category) filter.category = category;
      
      const dances = await Dance.find(filter)
        .populate('userId', 'name avatar')
        .sort({ 'engagement.likes': -1, createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit);
      
      res.json({ success: true, data: dances });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  // Like a dance
  async likeDance(req, res) {
    try {
      const { danceId } = req.params;
      
      const dance = await Dance.findOneAndUpdate(
        { _id: danceId, tenantId: req.tenantId },
        { $inc: { 'engagement.likes': 1 } },
        { new: true }
      );
      
      res.json({ success: true, data: dance });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
};

// Helper function to upload to S3
async function uploadToS3(file) {
  const params = {
    Bucket: process.env.S3_BUCKET_NAME,
    Key: `dances/${Date.now()}-${file.originalname}`,
    Body: file.buffer,
    ContentType: file.mimetype,
    ACL: 'public-read'
  };
  
  const result = await s3.upload(params).promise();
  return result.Location;
}

module.exports = danceController;