import { Request, Response } from 'express';
import { prisma } from '../../infrastructure/database/prisma.client.js';

export class MetricsController {
  async getDashboardMetrics(_req: Request, res: Response): Promise<void> {
    try {
      const [
        totalPersons,
        totalEvents,
        totalCampaigns,
        totalMessagesSent,
        totalMessagesReceived,
        totalOptOuts,
        pendingAttentionCount,
        categoryCounts,
        recentAttendances
      ] = await Promise.all([
        prisma.person.count(),
        prisma.event.count(),
        prisma.campaign.count(),
        prisma.message.count({ where: { direction: 'OUTBOUND' } }),
        prisma.message.count({ where: { direction: 'INBOUND' } }),
        prisma.person.count({ where: { optOut: true } }),
        prisma.conversation.count({ where: { requiresHumanAttention: true } }),
        prisma.aIAnalysis.groupBy({
          by: ['category'],
          _count: { category: true }
        }),
        prisma.attendance.groupBy({
          by: ['attended'],
          _count: { attended: true }
        })
      ]);

      let totalPresent = 0;
      let totalAbsent = 0;
      for (const item of recentAttendances) {
        if (item.attended) totalPresent += item._count.attended;
        else totalAbsent += item._count.attended;
      }

      const formattedCategories = categoryCounts.map(c => ({
        category: c.category,
        count: c._count.category
      })).sort((a, b) => b.count - a.count);

      res.json({
        totalPersons,
        totalEvents,
        totalCampaigns,
        totalPresent,
        totalAbsent,
        totalMessagesSent,
        totalMessagesReceived,
        totalOptOuts,
        pendingAttentionCount,
        responseRate: totalMessagesSent > 0 ? Number(((totalMessagesReceived / totalMessagesSent) * 100).toFixed(1)) : 0,
        categoryBreakdown: formattedCategories
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
}
