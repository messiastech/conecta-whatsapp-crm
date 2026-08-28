import { Request, Response } from 'express';
import { prisma } from '../../infrastructure/database/prisma.client.js';

export class TasksController {
  async list(req: Request, res: Response): Promise<void> {
    try {
      const { status, priority } = req.query;

      const where: any = {};
      if (status && typeof status === 'string') {
        where.status = status;
      }
      if (priority && typeof priority === 'string') {
        where.priority = priority;
      }

      const tasks = await prisma.followUpTask.findMany({
        where,
        include: {
          person: true,
          conversation: {
            include: {
              messages: {
                take: 3,
                orderBy: { createdAt: 'desc' }
              }
            }
          }
        },
        orderBy: [
          { priority: 'desc' },
          { createdAt: 'desc' }
        ]
      });

      res.json(tasks);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  async updateStatus(req: Request, res: Response): Promise<void> {
    try {
      const id = String(req.params.id);
      const { status, assignedTo } = req.body;

      if (!status || !['PENDING', 'IN_PROGRESS', 'COMPLETED'].includes(status)) {
        res.status(400).json({ error: 'Status inválido. Use PENDING, IN_PROGRESS ou COMPLETED' });
        return;
      }

      const task = await prisma.followUpTask.update({
        where: { id },
        data: {
          status,
          assignedTo: assignedTo || undefined,
          completedAt: status === 'COMPLETED' ? new Date() : null
        }
      });

      await prisma.auditLog.create({
        data: {
          action: 'FOLLOW_UP_TASK_UPDATED',
          entityType: 'FollowUpTask',
          entityId: task.id,
          details: JSON.stringify({ status, assignedTo })
        }
      });

      res.json(task);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
}
