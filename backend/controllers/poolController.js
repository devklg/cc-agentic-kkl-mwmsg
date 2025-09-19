const Pool = require('../models/Pool');
const KLBTransaction = require('../models/KLBTransaction');
const User = require('../models/User');

const poolController = {
  // Create new pool
  async createPool(req, res) {
    try {
      const poolData = {
        ...req.body,
        tenantId: req.tenantId
      };
      
      const pool = await Pool.create(poolData);
      
      res.status(201).json({ success: true, data: pool });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  // Get active pools
  async getActivePools(req, res) {
    try {
      const { type, category } = req.query;
      
      const filter = {
        tenantId: req.tenantId,
        status: 'ACTIVE',
        startTime: { $lte: new Date() },
        endTime: { $gte: new Date() }
      };
      
      if (type) filter.type = type;
      if (category) filter.category = category;
      
      const pools = await Pool.find(filter)
        .select('-participants')
        .sort({ totalPoolAmount: -1 });
      
      res.json({ success: true, data: pools });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  // Enter pool
  async enterPool(req, res) {
    try {
      const { poolId } = req.params;
      const { submission } = req.body;
      const userId = req.user.id;
      
      const pool = await Pool.findOne({
        _id: poolId,
        tenantId: req.tenantId
      });
      
      if (!pool) {
        return res.status(404).json({ success: false, error: 'Pool not found' });
      }
      
      // Check user has enough KLB/funds
      const user = await User.findById(userId);
      if (pool.entryFee.currency === 'KLB' && user.klbBalance < pool.entryFee.amount) {
        return res.status(400).json({ success: false, error: 'Insufficient KLB balance' });
      }
      
      // Enter the pool
      await pool.enter(userId, submission);
      
      // Deduct entry fee if using KLB
      if (pool.entryFee.currency === 'KLB') {
        await KLBTransaction.create({
          userId,
          tenantId: req.tenantId,
          type: 'SPENT',
          category: 'POOL',
          amount: pool.entryFee.amount,
          balance: {
            before: user.klbBalance,
            after: user.klbBalance - pool.entryFee.amount
          },
          source: { poolId: pool._id }
        });
        
        user.klbBalance -= pool.entryFee.amount;
        await user.save();
      }
      
      res.json({ success: true, message: 'Successfully entered pool' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  // Vote in pool
  async voteInPool(req, res) {
    try {
      const { poolId, participantId } = req.params;
      const userId = req.user.id;
      
      const pool = await Pool.findOne({
        _id: poolId,
        tenantId: req.tenantId,
        status: 'VOTING'
      });
      
      if (!pool) {
        return res.status(404).json({ success: false, error: 'Pool not in voting phase' });
      }
      
      // Record vote
      const participant = pool.participants.id(participantId);
      if (!participant) {
        return res.status(404).json({ success: false, error: 'Participant not found' });
      }
      
      participant.votes++;
      await pool.save();
      
      res.json({ success: true, message: 'Vote recorded' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  // Distribute pool winnings
  async distributePool(req, res) {
    try {
      const { poolId } = req.params;
      
      const pool = await Pool.findOne({
        _id: poolId,
        tenantId: req.tenantId,
        status: 'VOTING'
      });
      
      if (!pool) {
        return res.status(404).json({ success: false, error: 'Pool not ready for distribution' });
      }
      
      await pool.distributeWinnings();
      
      // Create KLB transactions for winners
      for (const participant of pool.participants) {
        if (participant.winnings > 0) {
          const user = await User.findById(participant.userId);
          
          await KLBTransaction.create({
            userId: participant.userId,
            tenantId: req.tenantId,
            type: 'EARNED',
            category: 'POOL',
            amount: participant.winnings,
            balance: {
              before: user.klbBalance,
              after: user.klbBalance + participant.winnings
            },
            source: { poolId: pool._id },
            metadata: {
              poolName: pool.name,
              rank: participant.rank
            }
          });
          
          user.klbBalance += participant.winnings;
          await user.save();
        }
      }
      
      res.json({ success: true, message: 'Pool distributed successfully' });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
};

module.exports = poolController;