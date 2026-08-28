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
        totalMessagesDelivered,
        totalMessagesReceived,
        totalOptOuts,
        pendingAttentionCount,
        pendingFollowUpsCount,
        categoryCounts,
        priorityCounts,
        attendanceStats,
        uniqueRecipients,
        uniqueResponders
      ] = await Promise.all([
        prisma.person.count(),
        prisma.event.count(),
        prisma.campaign.count(),
        prisma.message.count({ where: { direction: 'OUTBOUND' } }),
        prisma.message.count({ where: { direction: 'OUTBOUND', status: { in: ['DELIVERED', 'READ'] } } }),
        prisma.message.count({ where: { direction: 'INBOUND' } }),
        prisma.person.count({ where: { optOut: true } }),
        prisma.conversation.count({ where: { requiresHumanAttention: true } }),
        prisma.followUpTask.count({ where: { status: 'PENDING' } }),
        prisma.aIAnalysis.groupBy({
          by: ['category'],
          _count: { category: true }
        }),
        prisma.conversation.groupBy({
          by: ['priority'],
          _count: { priority: true }
        }),
        prisma.attendance.groupBy({
          by: ['attended'],
          _count: { attended: true }
        }),
        // Contatos únicos alvos de campanhas
        prisma.message.findMany({
          where: { direction: 'OUTBOUND', campaignId: { not: null } },
          select: { personId: true },
          distinct: ['personId']
        }),
        // Contatos únicos que responderam
        prisma.message.findMany({
          where: { direction: 'INBOUND' },
          select: { personId: true },
          distinct: ['personId']
        })
      ]);

      let totalPresent = 0;
      let totalAbsent = 0;
      for (const item of attendanceStats) {
        if (item.attended) totalPresent += item._count.attended;
        else totalAbsent += item._count.attended;
      }

      const totalExpected = totalPresent + totalAbsent;
      const presenceRate = totalExpected > 0
        ? Number(((totalPresent / totalExpected) * 100).toFixed(1))
        : 0;

      const uniqueRecipientsCount = uniqueRecipients.length;
      const uniqueRespondersCount = uniqueResponders.length;

      // Taxa real de resposta: % de pessoas que responderam sobre o total de pessoas contatadas
      const responseRate = uniqueRecipientsCount > 0
        ? Math.min(100, Number(((uniqueRespondersCount / uniqueRecipientsCount) * 100).toFixed(1)))
        : (totalMessagesSent > 0 ? Math.min(100, Number(((totalMessagesReceived / totalMessagesSent) * 100).toFixed(1))) : 0);

      const formattedCategories = categoryCounts.map(c => ({
        category: c.category,
        count: c._count.category
      })).sort((a, b) => b.count - a.count);

      const formattedPriorities = priorityCounts.map(p => ({
        priority: p.priority,
        count: p._count.priority
      }));

      res.json({
        totalPersons,
        totalEvents,
        totalCampaigns,
        totalPresent,
        totalAbsent,
        presenceRate,
        totalMessagesSent,
        totalMessagesDelivered,
        totalMessagesReceived,
        uniqueRecipientsCount,
        uniqueRespondersCount,
        totalOptOuts,
        pendingAttentionCount,
        pendingFollowUpsCount,
        responseRate,
        categoryBreakdown: formattedCategories,
        priorityBreakdown: formattedPriorities
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
}
