import { Request, Response } from 'express';
import { prisma } from '../../infrastructure/database/prisma.client.js';

export class MetricsController {
  async getDashboardMetrics(req: Request, res: Response): Promise<void> {
    try {
      const organizationId = req.organizationId!;

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
        prisma.person.count({ where: { organizationId } }),
        prisma.event.count({ where: { organizationId } }),
        prisma.campaign.count({ where: { organizationId } }),
        prisma.message.count({ where: { organizationId, direction: 'OUTBOUND' } }),
        prisma.message.count({ where: { organizationId, direction: 'OUTBOUND', status: { in: ['DELIVERED', 'READ'] } } }),
        prisma.message.count({ where: { organizationId, direction: 'INBOUND' } }),
        prisma.person.count({ where: { organizationId, optOut: true } }),
        prisma.conversation.count({ where: { organizationId, requiresHumanAttention: true } }),
        prisma.followUpTask.count({ where: { organizationId, status: 'PENDING' } }),
        prisma.aIAnalysis.groupBy({
          by: ['category'],
          where: { organizationId },
          _count: { category: true }
        }),
        prisma.conversation.groupBy({
          by: ['priority'],
          where: { organizationId },
          _count: { priority: true }
        }),
        prisma.attendance.groupBy({
          by: ['attended'],
          where: { organizationId },
          _count: { attended: true }
        }),
        // Contatos únicos alvos de campanhas dentro do tenant
        prisma.message.findMany({
          where: { organizationId, direction: 'OUTBOUND', campaignId: { not: null } },
          select: { personId: true },
          distinct: ['personId']
        }),
        // Contatos únicos que responderam dentro do tenant
        prisma.message.findMany({
          where: { organizationId, direction: 'INBOUND' },
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
