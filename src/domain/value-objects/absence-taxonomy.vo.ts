import { z } from 'zod';

export const AbsenceCategoryEnum = z.enum([
  'TRABALHO',
  'SAUDE',
  'FAMILIA',
  'VIAGEM',
  'COMPROMISSO',
  'ESQUECIMENTO',
  'FALTA_INFORMACAO',
  'TRANSPORTE_LOGISTICA',
  'DESINTERESSE',
  'PEDIDO_ATENDIMENTO',
  'OUTRO',
  'INCONCLUSIVO'
]);

export type AbsenceCategory = z.infer<typeof AbsenceCategoryEnum>;

export const SentimentEnum = z.enum([
  'POSITIVO',
  'NEUTRO',
  'NEGATIVO',
  'PREOCUPADO'
]);

export type Sentiment = z.infer<typeof SentimentEnum>;

export const UrgencyEnum = z.enum([
  'BAIXA',
  'MEDIA',
  'ALTA'
]);

export type Urgency = z.infer<typeof UrgencyEnum>;

export const PriorityEnum = z.enum([
  'LOW',
  'MEDIUM',
  'HIGH',
  'URGENT'
]);

export type Priority = z.infer<typeof PriorityEnum>;

export const IntentEnum = z.enum([
  'JUSTIFY_ABSENCE',
  'PRAYER_REQUEST',
  'QUESTION',
  'COMPLAINT',
  'OPT_OUT',
  'GREETING',
  'OTHER'
]);

export type Intent = z.infer<typeof IntentEnum>;

export const NextActionEnum = z.enum([
  'REPLY_IMMEDIATELY',
  'REQUIRE_HUMAN_APPROVAL',
  'PASTORAL_CONTACT',
  'FOLLOW_UP_TASK',
  'NO_ACTION',
  'REQUEST_CLARIFICATION'
]);

export type NextAction = z.infer<typeof NextActionEnum>;

export const AbsenceAnalysisSchema = z.object({
  category: AbsenceCategoryEnum,
  reason: z.string().optional(),
  intent: IntentEnum.default('JUSTIFY_ABSENCE'),
  confidence: z.number().min(0.0).max(1.0),
  sentiment: SentimentEnum,
  urgency: UrgencyEnum,
  priority: PriorityEnum.default('MEDIUM'),
  summary: z.string().max(300),
  requires_human_attention: z.boolean(),
  suggested_reply: z.string().max(500).optional(),
  next_action: NextActionEnum.default('REQUIRE_HUMAN_APPROVAL')
});

export type AbsenceAnalysis = z.infer<typeof AbsenceAnalysisSchema>;

export const CategoryLabels: Record<AbsenceCategory, { label: string; color: string; description: string }> = {
  TRABALHO: { label: 'Trabalho / Plantão', color: '#3B82F6', description: 'Escala de serviço, hora extra ou compromisso de trabalho' },
  SAUDE: { label: 'Saúde / Doença', color: '#EF4444', description: 'Enfermidade pessoal, consulta médica ou internação' },
  FAMILIA: { label: 'Família / Filhos', color: '#F59E0B', description: 'Cuidado com parentes, filhos ou imprevisto familiar' },
  VIAGEM: { label: 'Viagem / Férias', color: '#10B981', description: 'Fora da cidade ou em deslocamento' },
  COMPROMISSO: { label: 'Outro Compromisso', color: '#6366F1', description: 'Estudo, faculdade, prova ou reunião prévia' },
  ESQUECIMENTO: { label: 'Esquecimento', color: '#8B5CF6', description: 'Esqueceu o horário ou a data' },
  FALTA_INFORMACAO: { label: 'Falta de Informação', color: '#EC4899', description: 'Não sabia o local, horário ou não recebeu convite a tempo' },
  TRANSPORTE_LOGISTICA: { label: 'Transporte / Chuva', color: '#14B8A6', description: 'Trânsito, chuva, carro quebrou ou sem condução' },
  DESINTERESSE: { label: 'Desânimo / Desinteresse', color: '#64748B', description: 'Desânimo ou não quis comparecer' },
  PEDIDO_ATENDIMENTO: { label: 'Pedido de Oração / Ajuda', color: '#DC2626', description: 'Solicitação de oração, crise ou contato pastoral urgente' },
  OUTRO: { label: 'Outro Motivo', color: '#6B7280', description: 'Motivo claro não listado anteriormente' },
  INCONCLUSIVO: { label: 'Não Identificado / Vago', color: '#9CA3AF', description: 'Resposta monossilábica, emoji ou inconclusiva' }
};
