import { Request, Response } from 'express';
import { prisma } from '../../infrastructure/database/prisma.client.js';

export class PersonsController {
  async list(req: Request, res: Response): Promise<void> {
    try {
      const { search, optOut } = req.query;

      const where: any = {};
      if (search && typeof search === 'string') {
        where.OR = [
          { name: { contains: search } },
          { phone: { contains: search } },
          { normalizedPhone: { contains: search } }
        ];
      }

      if (optOut !== undefined) {
        where.optOut = optOut === 'true';
      }

      const persons = await prisma.person.findMany({
        where,
        include: {
          attendances: {
            include: { event: true },
            orderBy: { createdAt: 'desc' }
          },
          conversations: {
            take: 1,
            orderBy: { lastMessageAt: 'desc' }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      res.json(persons);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  async getById(req: Request, res: Response): Promise<void> {
    try {
      const id = String(req.params.id);
      const person = await prisma.person.findUnique({
        where: { id },
        include: {
          attendances: {
            include: { event: true },
            orderBy: { createdAt: 'desc' }
          },
          messages: {
            orderBy: { createdAt: 'asc' },
            include: { aiAnalyses: true }
          },
          conversations: true
        }
      });

      if (!person) {
        res.status(404).json({ error: 'Contato não encontrado' });
        return;
      }

      res.json(person);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  async update(req: Request, res: Response): Promise<void> {
    try {
      const id = String(req.params.id);
      const { name, notes, optOut } = req.body;

      const person = await prisma.person.update({
        where: { id },
        data: {
          name,
          notes,
          optOut: optOut !== undefined ? optOut : undefined,
          optOutAt: optOut === true ? new Date() : undefined
        }
      });

      res.json(person);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
}
