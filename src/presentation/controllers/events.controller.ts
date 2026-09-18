import { Request, Response } from 'express';
import { prisma } from '../../infrastructure/database/prisma.client.js';
import { ImportAttendanceUseCase } from '../../application/use-cases/import-attendance.use-case.js';

export class EventsController {
  private importUseCase = new ImportAttendanceUseCase();

  async list(req: Request, res: Response): Promise<void> {
    try {
      const organizationId = req.organizationId!;
      const events = await prisma.event.findMany({
        where: { organizationId },
        include: {
          _count: {
            select: {
              attendances: true,
              campaigns: true
            }
          }
        },
        orderBy: { eventDate: 'desc' }
      });
      res.json(events);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  async getById(req: Request, res: Response): Promise<void> {
    try {
      const organizationId = req.organizationId!;
      const id = String(req.params.id);
      const event = await prisma.event.findFirst({
        where: { id, organizationId },
        include: {
          attendances: {
            include: {
              person: true
            }
          },
          campaigns: true
        }
      });

      if (!event) {
        res.status(404).json({ error: 'Evento não encontrado' });
        return;
      }

      const attendees = (event.attendances || []).filter((a: any) => a.attended);
      const absentees = (event.attendances || []).filter((a: any) => !a.attended);

      res.json({
        ...event,
        presentCount: attendees.length,
        absentCount: absentees.length,
        attendees: attendees.map((a: any) => a.person),
        absentees: absentees.map((a: any) => a.person)
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  async create(req: Request, res: Response): Promise<void> {
    try {
      const organizationId = req.organizationId!;
      const { name, description, eventDate, location } = req.body;

      if (!name || !eventDate) {
        res.status(400).json({ error: 'Nome e Data do evento são obrigatórios' });
        return;
      }

      const event = await prisma.event.create({
        data: {
          organizationId,
          name,
          description,
          eventDate: new Date(eventDate),
          location,
          status: 'DRAFT'
        }
      });

      res.status(201).json(event);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  async importSpreadsheet(req: Request, res: Response): Promise<void> {
    try {
      const organizationId = req.organizationId!;
      const id = String(req.params.id);
      const file = req.file;

      if (!file) {
        res.status(400).json({ error: 'Arquivo de planilha (.csv ou .xlsx) é obrigatório' });
        return;
      }

      const result = await this.importUseCase.execute({
        organizationId,
        eventId: id,
        fileBuffer: file.buffer,
        filename: file.originalname
      });

      res.status(200).json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }
}
