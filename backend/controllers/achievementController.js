const Achievement = require('../models/Achievement');
const UserAchievement = require('../models/UserAchievement');
const KLBTransaction = require('../models/KLBTransaction');
const User = require('../models/User');
const Dance = require('../models/Dance');
const mongoose = require('mongoose');

const achievementController = {
  // Get all achievements
  async getAllAchievements(req, res) {
    try {
      const achievements = await Achievement.find({ tenantId: req.tenantId })
        .sort({ category: 1, tier: 1 });
      
      res.json({ success: true, data: achievements });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  // Get user's achievements
  async getUserAchievements(req, res) {
    try {
      const { userId } = req.params;
      
      const userAchievements = await UserAchievement.find({
        userId,
        tenantId: req.tenantId
      }).populate('achievementId');
      
      // Calculate K.E.V.I.N.S. K.O.N.G.A. progress
      const progress = {
        K: userAchievements.filter(a => a.achievementId.framework === 'K').length,
        E: userAchievements.filter(a => a.achievementId.framework === 'E').length,
        V: userAchievements.filter(a => a.achievementId.framework === 'V').length,
        I: userAchievements.filter(a => a.achievementId.framework === 'I').length,
        N: userAchievements.filter(a => a.achievementId.framework === 'N').length,
        S: userAchievements.filter(a => a.achievementId.framework === 'S').length,
        KONGA: {
          K: userAchievements.filter(a => a.achievementId.metric === 'K').length,
          O: userAchievements.filter(a => a.achievementId.metric === 'O').length,
          N: userAchievements.filter(a => a.achievementId.metric === 'N').length,
          G: userAchievements.filter(a => a.achievementId.metric === 'G').length,
          A: userAchievements.filter(a => a.achievementId.metric === 'A').length
        }
      };
      
      res.json({
        success: true,
        data: {
          achievements: userAchievements,
          progress,
          totalKLBEarned: userAchievements.reduce((sum, a) => sum + (a.klbReward || 0), 0)
        }
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  // Check and award achievements
  async checkAchievements(req, res) {
    try {
      const { userId } = req.params;
      const user = await User.findById(userId);
      
      // Get all possible achievements
      const achievements = await Achievement.find({ tenantId: req.tenantId });
      
      // Get user's current achievements
      const existingAchievements = await UserAchievement.find({ userId, tenantId: req.tenantId });
      const existingIds = existingAchievements.map(a => a.achievementId.toString());
      
      const newAchievements = [];
      
      for (const achievement of achievements) {
        if (!existingIds.includes(achievement._id.toString())) {
          // Check if user meets criteria
          const qualified = await checkAchievementCriteria(user, achievement);
          
          if (qualified) {
            // Award achievement
            const userAchievement = await UserAchievement.create({
              userId,
              achievementId: achievement._id,
              tenantId: req.tenantId,
              klbReward: achievement.rewards.klb
            });
            
            // Award KLB
            if (achievement.rewards.klb > 0) {
              await KLBTransaction.create({
                userId,
                tenantId: req.tenantId,
                type: 'EARNED',
                category: 'ACHIEVEMENT',
                amount: achievement.rewards.klb,
                balance: {
                  before: user.klbBalance,
                  after: user.klbBalance + achievement.rewards.klb
                },
                source: { achievementId: achievement._id },
                metadata: { achievementName: achievement.name }
              });
              
              user.klbBalance += achievement.rewards.klb;
              await user.save();
            }
            
            newAchievements.push(userAchievement);
          }
        }
      }
      
      res.json({
        success: true,
        data: {
          newAchievements,
          count: newAchievements.length
        }
      });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  // Get leaderboard
  async getLeaderboard(req, res) {
    try {
      const { type = 'achievements', timeframe = 'all' } = req.query;
      
      let startDate = new Date(0);
      if (timeframe === 'daily') {
        startDate = new Date();
        startDate.setHours(0, 0, 0, 0);
      } else if (timeframe === 'weekly') {
        startDate = new Date();
        startDate.setDate(startDate.getDate() - 7);
      } else if (timeframe === 'monthly') {
        startDate = new Date();
        startDate.setMonth(startDate.getMonth() - 1);
      }
      
      const leaderboard = await UserAchievement.aggregate([
        {
          $match: {
            tenantId: mongoose.Types.ObjectId(req.tenantId),
            unlockedAt: { $gte: startDate }
          }
        },
        {
          $group: {
            _id: '$userId',
            count: { $sum: 1 },
            totalKLB: { $sum: '$klbReward' }
          }
        },
        {
          $sort: type === 'klb' ? { totalKLB: -1 } : { count: -1 }
        },
        {
          $limit: 100
        },
        {
          $lookup: {
            from: 'users',
            localField: '_id',
            foreignField: '_id',
            as: 'user'
          }
        },
        {
          $unwind: '$user'
        },
        {
          $project: {
            userId: '$_id',
            name: '$user.name',
            avatar: '$user.avatar',
            achievementCount: '$count',
            totalKLB: '$totalKLB'
          }
        }
      ]);
      
      res.json({ success: true, data: leaderboard });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
};

// Helper function to check achievement criteria
async function checkAchievementCriteria(user, achievement) {
  // Implement specific criteria checking based on achievement type
  switch (achievement.criteria.type) {
    case 'DANCE_COUNT':
      const danceCount = await Dance.countDocuments({
        userId: user._id,
        'verification.status': 'VERIFIED'
      });
      return danceCount >= achievement.criteria.value;
    
    case 'REFERRAL_COUNT':
      return user.referralCount >= achievement.criteria.value;
    
    case 'TEAM_SIZE':
      return (user.leftLegCount + user.rightLegCount) >= achievement.criteria.value;
    
    case 'KLB_EARNED':
      return user.totalKLBEarned >= achievement.criteria.value;
    
    default:
      return false;
  }
}

module.exports = achievementController;