const Commission = require('../models/Commission');
const User = require('../models/User');
const mongoose = require('mongoose');
const { validationResult } = require('express-validator');

const commissionController = {
  // Get user's commission history
  async getCommissionHistory(req, res) {
    try {
      const { userId } = req.params;
      const { page = 1, limit = 20, type, status } = req.query;
      
      const filter = { userId, tenantId: req.tenantId };
      if (type) filter.type = type;
      if (status) filter.status = status;
      
      const commissions = await Commission.find(filter)
        .sort({ createdAt: -1 })
        .limit(limit * 1)
        .skip((page - 1) * limit)
        .populate('sourceUser', 'name email')
        .exec();
      
      const total = await Commission.countDocuments(filter);
      
      res.json({
        success: true,
        data: commissions,
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

  // Calculate pending commissions
  async calculateCommissions(req, res) {
    try {
      const { userId } = req.params;
      
      // Calculate binary commissions
      const binaryCalc = await Commission.calculateBinaryCommissions(userId, req.tenantId);
      
      // Check for other commission types
      const pending = await Commission.find({
        userId,
        status: 'PENDING',
        tenantId: req.tenantId
      });
      
      const summary = {
        binary: binaryCalc,
        pending: pending.reduce((sum, c) => sum + c.amount, 0),
        pendingCount: pending.length,
        types: {
          direct: pending.filter(c => c.type === 'DIRECT').reduce((sum, c) => sum + c.amount, 0),
          pool: pending.filter(c => c.type === 'POOL').reduce((sum, c) => sum + c.amount, 0),
          dance: pending.filter(c => c.type === 'DANCE').reduce((sum, c) => sum + c.amount, 0),
          achievement: pending.filter(c => c.type === 'ACHIEVEMENT').reduce((sum, c) => sum + c.amount, 0)
        }
      };
      
      res.json({ success: true, data: summary });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  // Process commission payouts
  async processPayouts(req, res) {
    try {
      const { commissionIds, method = 'DIRECT_DEPOSIT' } = req.body;
      
      const commissions = await Commission.find({
        _id: { $in: commissionIds },
        status: 'APPROVED',
        tenantId: req.tenantId
      });
      
      const results = [];
      
      for (const commission of commissions) {
        try {
          // Here you would integrate with actual payment processor
          await commission.pay();
          results.push({ id: commission._id, status: 'PAID' });
        } catch (err) {
          results.push({ id: commission._id, status: 'FAILED', error: err.message });
        }
      }
      
      res.json({ success: true, data: results });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  },

  // Get commission analytics
  async getCommissionAnalytics(req, res) {
    try {
      const { startDate, endDate } = req.query;
      
      const analytics = await Commission.aggregate([
        {
          $match: {
            tenantId: mongoose.Types.ObjectId(req.tenantId),
            createdAt: {
              $gte: new Date(startDate),
              $lte: new Date(endDate)
            }
          }
        },
        {
          $group: {
            _id: {
              type: '$type',
              status: '$status'
            },
            total: { $sum: '$amount' },
            count: { $sum: 1 },
            avgAmount: { $avg: '$amount' }
          }
        },
        {
          $group: {
            _id: '$_id.type',
            statuses: {
              $push: {
                status: '$_id.status',
                total: '$total',
                count: '$count',
                avgAmount: '$avgAmount'
              }
            },
            totalAmount: { $sum: '$total' },
            totalCount: { $sum: '$count' }
          }
        }
      ]);
      
      res.json({ success: true, data: analytics });
    } catch (error) {
      res.status(500).json({ success: false, error: error.message });
    }
  }
};

module.exports = commissionController;