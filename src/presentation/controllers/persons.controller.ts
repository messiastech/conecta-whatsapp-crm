import { Request, Response } from 'express';
import { prisma } from '../../infrastructure/database/prisma.client.js';
import { PhoneNumber } from '../../domain/value-objects/phone-number.vo.js';

export class PersonsController {
  async list(req: Request, res: Response): Promise<void> {
    try {
      const organizationId = req.organizationId!;
      const { search, optOut, consentStatus } = req.query;

      const where: any = { organizationId };

      if (search && typeof search === 'string') {
        where.AND = [
          {
            OR: [
              { name: { contains: search, mode: 'insensitive' } },
              { phone: { contains: search } },
              { normalizedPhone: { contains: search } }
            ]
          }
        ];
      }

      if (optOut !== undefined) {
        where.optOut = optOut === 'true';
      }

      if (consentStatus && typeof consentStatus === 'string') {
        where.consentStatus = consentStatus;
      }

      const persons = await prisma.person.findMany({
        where,
        include: {
          attendances: {
            where: { organizationId },
            include: { event: true },
            orderBy: { createdAt: 'desc' }
          },
          conversations: {
            where: { organizationId },
            take: 1,
            orderBy: { lastMessageAt: 'desc' },
            include: {
              aiAnalyses: {
                take: 1,
                orderBy: { createdAt: 'desc' }
              }
            }
          },
          followUpTasks: {
            where: { organizationId, status: 'PENDING' }
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
      const organizationId = req.organizationId!;
      const id = String(req.params.id);
      const person = await prisma.person.findFirst({
        where: { id, organizationId },
        include: {
          attendances: {
            where: { organizationId },
            include: { event: true },
            orderBy: { createdAt: 'desc' }
          },
          messages: {
            where: { organizationId },
            orderBy: { createdAt: 'asc' },
            include: { aiAnalyses: true }
          },
          conversations: {
            where: { organizationId },
            include: {
              aiAnalyses: { orderBy: { createdAt: 'desc' } }
            }
          },
          followUpTasks: {
            where: { organizationId },
            orderBy: { createdAt: 'desc' }
          },
          consentHistory: {
            where: { organizationId },
            orderBy: { createdAt: 'desc' }
          }
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

  async getTimeline(req: Request, res: Response): Promise<void> {
    try {
      const organizationId = req.organizationId!;
      const id = String(req.params.id);
      const person = await prisma.person.findFirst({
        where: { id, organizationId },
        include: {
          attendances: { where: { organizationId }, include: { event: true } },
          messages: { where: { organizationId }, include: { aiAnalyses: true, campaign: true } },
          followUpTasks: { where: { organizationId } },
          consentHistory: { where: { organizationId } }
        }
      });

      if (!person) {
        res.status(404).json({ error: 'Contato não encontrado' });
        return;
      }

      // Constrói timeline cronológica unificada
      const timeline: Array<{
        id: string;
        date: Date;
        type: 'ATTENDANCE' | 'OUTBOUND_MESSAGE' | 'INBOUND_MESSAGE' | 'AI_ANALYSIS' | 'FOLLOW_UP_TASK' | 'CONSENT_CHANGE';
        title: string;
        description: string;
        badge?: string;
        badgeColor?: string;
        metadata?: any;
      }> = [];

      // 1. Presenças e Ausências em Eventos
      person.attendances.forEach(att => {
        timeline.push({
          id: `att-${att.id}`,
          date: att.createdAt,
          type: 'ATTENDANCE',
          title: `Evento: ${att.event?.name || 'Encontro'}`,
          description: att.attended ? 'Presença confirmada no evento' : 'Ausência registrada (Público esperado/convidado)',
          badge: att.attended ? 'PRESENTE' : 'AUSENTE',
          badgeColor: att.attended ? 'emerald' : 'rose',
          metadata: { eventId: att.eventId, attended: att.attended }
        });
      });

      // 2. Mensagens e Análises de IA
      person.messages.forEach(msg => {
        const isOutbound = msg.direction === 'OUTBOUND';
        timeline.push({
          id: `msg-${msg.id}`,
          date: msg.createdAt,
          type: isOutbound ? 'OUTBOUND_MESSAGE' : 'INBOUND_MESSAGE',
          title: isOutbound ? 'Campanha / Disparo WhatsApp' : 'Resposta do Participante',
          description: `"${msg.content}"`,
          badge: isOutbound ? 'ENVIADA' : 'RECEBIDA',
          badgeColor: isOutbound ? 'blue' : 'emerald',
          metadata: { messageId: msg.id, status: msg.status }
        });

        // Se a mensagem possui análise da IA
        msg.aiAnalyses?.forEach(ai => {
          timeline.push({
            id: `ai-${ai.id}`,
            date: ai.createdAt,
            type: 'AI_ANALYSIS',
            title: `Triagem Inteligente de IA: ${ai.category}`,
            description: `Resumo: ${ai.summary}\nSentimento: ${ai.sentiment} | Prioridade: ${ai.priority}`,
            badge: ai.category,
            badgeColor: ai.requiresHumanAttention ? 'rose' : 'indigo',
            metadata: {
              confidence: ai.confidence,
              requiresHumanAttention: ai.requiresHumanAttention,
              suggestedReply: ai.suggestedReply,
              nextAction: ai.nextAction
            }
          });
        });
      });

      // 3. Tarefas de Acompanhamento (Follow-Up)
      person.followUpTasks.forEach(task => {
        timeline.push({
          id: `task-${task.id}`,
          date: task.createdAt,
          type: 'FOLLOW_UP_TASK',
          title: task.title,
          description: task.description || 'Tarefa de acompanhamento gerada pela triagem',
          badge: task.status === 'COMPLETED' ? 'CONCLUÍDO' : `PRIORIDADE ${task.priority}`,
          badgeColor: task.status === 'COMPLETED' ? 'emerald' : 'amber',
          metadata: { taskId: task.id, status: task.status, priority: task.priority }
        });
      });

      // 4. Histórico de Consentimento LGPD
      person.consentHistory.forEach(con => {
        timeline.push({
          id: `con-${con.id}`,
          date: con.createdAt,
          type: 'CONSENT_CHANGE',
          title: con.status === 'OPTED_OUT' ? 'Descadastro LGPD (Opt-Out)' : 'Consentimento Registrado (Opt-In)',
          description: con.reason || `Origem: ${con.source}`,
          badge: con.status,
          badgeColor: con.status === 'OPTED_OUT' ? 'rose' : 'emerald',
          metadata: { status: con.status, source: con.source }
        });
      });

      // Ordena por data decrescente
      timeline.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

      res.json({
        person: {
          id: person.id,
          name: person.name,
          phone: person.phone,
          normalizedPhone: person.normalizedPhone,
          optOut: person.optOut,
          consentStatus: person.consentStatus,
          createdAt: person.createdAt
        },
        timeline
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  async update(req: Request, res: Response): Promise<void> {
    try {
      const organizationId = req.organizationId!;
      const id = String(req.params.id);
      const { name, notes, optOut } = req.body;

      const person = await prisma.person.findFirst({
        where: { id, organizationId }
      });

      if (!person) {
        res.status(404).json({ error: 'Contato não encontrado' });
        return;
      }

      const updated = await prisma.person.update({
        where: { id: person.id },
        data: {
          name,
          notes,
          optOut: optOut !== undefined ? optOut : undefined,
          consentStatus: optOut === true ? 'OPTED_OUT' : (optOut === false ? 'OPTED_IN' : undefined),
          optOutAt: optOut === true ? new Date() : undefined
        }
      });

      if (optOut !== undefined) {
        await prisma.consentHistory.create({
          data: {
            organizationId,
            personId: person.id,
            status: optOut ? 'OPTED_OUT' : 'OPTED_IN',
            reason: 'Alteração manual no cadastro do CRM',
            source: 'MANUAL_CHANGE'
          }
        });
      }

      res.json(updated);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }

  async create(req: Request, res: Response): Promise<void> {
    try {
      const organizationId = req.organizationId!;
      const { name, phone, email, notes } = req.body;

      if (!name || typeof name !== 'string' || !name.trim()) {
        res.status(400).json({ error: 'Nome do contato é obrigatório' });
        return;
      }
      if (!phone || typeof phone !== 'string' || !phone.trim()) {
        res.status(400).json({ error: 'Telefone do contato é obrigatório' });
        return;
      }

      const phoneValidation = PhoneNumber.normalize(phone);
      if (!phoneValidation.isValid || !phoneValidation.normalizedPhone) {
        res.status(400).json({ error: phoneValidation.error || 'Número de telefone inválido' });
        return;
      }

      const person = await prisma.person.upsert({
        where: {
          organizationId_normalizedPhone: {
            organizationId,
            normalizedPhone: phoneValidation.normalizedPhone
          }
        },
        update: {
          name: name.trim(),
          phone: phone.trim(),
          email: email?.trim() || undefined,
          notes: notes?.trim() || undefined
        },
        create: {
          organizationId,
          name: name.trim(),
          phone: phone.trim(),
          normalizedPhone: phoneValidation.normalizedPhone,
          email: email?.trim() || null,
          notes: notes?.trim() || null,
          optOut: false,
          consentStatus: 'OPTED_IN',
          consentSource: 'MANUAL_ENTRY'
        }
      });

      res.status(201).json(person);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
}
