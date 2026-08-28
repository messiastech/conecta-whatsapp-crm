import { IAIService, AIClassificationContext } from '../../domain/ports/ai-service.port.js';
import {
  AbsenceAnalysis,
  AbsenceCategory,
  Sentiment,
  Urgency,
  Priority,
  Intent,
  NextAction
} from '../../domain/value-objects/absence-taxonomy.vo.js';

interface RuleDefinition {
  category: AbsenceCategory;
  regex: RegExp;
  sentiment: Sentiment;
  urgency: Urgency;
  priority: Priority;
  intent: Intent;
  nextAction: NextAction;
  requiresAttention: boolean;
  summary: string;
}

export class RuleBasedFallbackProvider implements IAIService {
  private rules: RuleDefinition[] = [
    {
      category: 'PEDIDO_ATENDIMENTO',
      regex: /(orem|ora(c|ç)(a|ã)o|orar|luto|faleceu|morreu|crise|socorro|depress|suic|pastor.*conversar|ajuda.*urgente|preciso.*ajuda|momento.*dif(i|í)cil)/i,
      sentiment: 'PREOCUPADO',
      urgency: 'ALTA',
      priority: 'URGENT',
      intent: 'PRAYER_REQUEST',
      nextAction: 'PASTORAL_CONTACT',
      requiresAttention: true,
      summary: 'Solicitação explícita de oração, visita pastoral ou momento de crise.'
    },
    {
      category: 'SAUDE',
      regex: /(doen(c|ç)a|doente|febre|upa|hospital|m(e|é)dic(o|a)|consulta|internad|rem(e|é)dio|covid|dengue|dor|gripe|enxaqueca|passando mal|cirurgia|repouso)/i,
      sentiment: 'PREOCUPADO',
      urgency: 'MEDIA',
      priority: 'HIGH',
      intent: 'JUSTIFY_ABSENCE',
      nextAction: 'REQUIRE_HUMAN_APPROVAL',
      requiresAttention: true,
      summary: 'Problema de saúde, doença ou consulta médica.'
    },
    {
      category: 'TRABALHO',
      regex: /(trabalh(o|ando)|trampo|plant(a|ã)o|escala|empresa|reuni(a|ã)o de servi(c|ç)o|hora extra|chefe|dobrar)/i,
      sentiment: 'NEUTRO',
      urgency: 'BAIXA',
      priority: 'LOW',
      intent: 'JUSTIFY_ABSENCE',
      nextAction: 'REPLY_IMMEDIATELY',
      requiresAttention: false,
      summary: 'Compromisso profissional, turno, plantão ou hora extra.'
    },
    {
      category: 'VIAGEM',
      regex: /(viaj(ando|ei|em|ar)|estrada|aeroporto|voo|fora da cidade|interior|praia|f(e|é)rias)/i,
      sentiment: 'POSITIVO',
      urgency: 'BAIXA',
      priority: 'LOW',
      intent: 'JUSTIFY_ABSENCE',
      nextAction: 'REPLY_IMMEDIATELY',
      requiresAttention: false,
      summary: 'Em viagem a trabalho ou lazer fora da cidade.'
    },
    {
      category: 'FAMILIA',
      regex: /(filh(o|a)|m(a|ã)e|pai|espos(o|a)|marido|fam(i|í)lia|sobrinh(o|a)|beb(e|ê)|sogr(o|a)|visita.*parente)/i,
      sentiment: 'NEUTRO',
      urgency: 'MEDIA',
      priority: 'MEDIUM',
      intent: 'JUSTIFY_ABSENCE',
      nextAction: 'REQUIRE_HUMAN_APPROVAL',
      requiresAttention: false,
      summary: 'Compromisso familiar ou assistência a parentes.'
    },
    {
      category: 'TRANSPORTE_LOGISTICA',
      regex: /(chuva|chovendo|alagamento|tr(a|â)nsito|engarraf|pneu|carro quebrou|sem condu(c|ç)(a|ã)o|ônibus|carona|uber)/i,
      sentiment: 'NEUTRO',
      urgency: 'MEDIA',
      priority: 'LOW',
      intent: 'JUSTIFY_ABSENCE',
      nextAction: 'REPLY_IMMEDIATELY',
      requiresAttention: false,
      summary: 'Dificuldade de transporte, trânsito ou condições climáticas.'
    },
    {
      category: 'COMPROMISSO',
      regex: /(faculdade|curso|prova|estud(o|ando)|outr(o|a) compromisso|aula|trabalho da facul)/i,
      sentiment: 'NEUTRO',
      urgency: 'BAIXA',
      priority: 'LOW',
      intent: 'JUSTIFY_ABSENCE',
      nextAction: 'REPLY_IMMEDIATELY',
      requiresAttention: false,
      summary: 'Compromisso acadêmico ou evento prévio agendado.'
    },
    {
      category: 'ESQUECIMENTO',
      regex: /(esquec(i|eu)|perdi.*hora|me confundi|achei que era.*amanh(a|ã)|confundi.*data)/i,
      sentiment: 'NEUTRO',
      urgency: 'BAIXA',
      priority: 'LOW',
      intent: 'JUSTIFY_ABSENCE',
      nextAction: 'REPLY_IMMEDIATELY',
      requiresAttention: false,
      summary: 'Esqueceu o dia/horário ou se confundiu com as datas.'
    },
    {
      category: 'FALTA_INFORMACAO',
      regex: /(n(a|ã)o sabia|n(a|ã)o fiquei sabendo|que horas|qual.*endere(c|ç)o|n(a|ã)o recebi.*convite)/i,
      sentiment: 'NEUTRO',
      urgency: 'MEDIA',
      priority: 'MEDIUM',
      intent: 'QUESTION',
      nextAction: 'REQUIRE_HUMAN_APPROVAL',
      requiresAttention: false,
      summary: 'Falta de informação sobre horário, local ou convite.'
    },
    {
      category: 'DESINTERESSE',
      regex: /(n(a|ã)o quis ir|n(a|ã)o estava afim|n(a|ã)o vou mais|desanimad(o|a)|pregui(c|ç)a)/i,
      sentiment: 'NEGATIVO',
      urgency: 'MEDIA',
      priority: 'HIGH',
      intent: 'JUSTIFY_ABSENCE',
      nextAction: 'FOLLOW_UP_TASK',
      requiresAttention: true,
      summary: 'Desânimo ou desinteresse manifestado.'
    }
  ];

  async classifyAbsence(
    messageText: string,
    context: AIClassificationContext
  ): Promise<AbsenceAnalysis & { providerUsed: string }> {
    const text = messageText.trim();

    for (const rule of this.rules) {
      if (rule.regex.test(text)) {
        const replyResult = await this.generateSuggestedReply(messageText, context, rule.category);
        return {
          category: rule.category,
          reason: rule.summary,
          intent: rule.intent,
          confidence: 0.85,
          sentiment: rule.sentiment,
          urgency: rule.urgency,
          priority: rule.priority,
          summary: rule.summary,
          requires_human_attention: rule.requiresAttention,
          suggested_reply: replyResult.suggestedReply,
          next_action: rule.nextAction,
          providerUsed: 'RULE_BASED_FALLBACK'
        };
      }
    }

    const isAmbiguous = text.length < 15 || text.toLowerCase() === 'ok' || text.toLowerCase() === 'sim' || text.toLowerCase() === 'não';
    const suggested = await this.generateSuggestedReply(messageText, context, 'INCONCLUSIVO');

    return {
      category: isAmbiguous ? 'INCONCLUSIVO' : 'OUTRO',
      reason: isAmbiguous ? 'Resposta ambígua' : 'Outro motivo',
      intent: isAmbiguous ? 'OTHER' : 'JUSTIFY_ABSENCE',
      confidence: isAmbiguous ? 0.40 : 0.65,
      sentiment: 'NEUTRO',
      urgency: 'BAIXA',
      priority: isAmbiguous ? 'MEDIUM' : 'LOW',
      summary: isAmbiguous ? 'Resposta monossilábica ou sem contexto claro de ausência.' : 'Outro motivo não categorizado diretamente.',
      requires_human_attention: isAmbiguous,
      suggested_reply: suggested.suggestedReply,
      next_action: isAmbiguous ? 'REQUEST_CLARIFICATION' : 'REQUIRE_HUMAN_APPROVAL',
      providerUsed: 'RULE_BASED_FALLBACK'
    };
  }

  async generateSuggestedReply(
    _messageText: string,
    context: AIClassificationContext,
    category: string
  ): Promise<{ suggestedReply: string; providerUsed: string }> {
    const firstName = context.personName ? context.personName.split(' ')[0] : 'Irmão(ã)';
    const event = context.eventName || 'nosso encontro';
    let reply = '';

    switch (category) {
      case 'PEDIDO_ATENDIMENTO':
        reply = `Olá, ${firstName}! Recebemos sua mensagem com muito carinho e já estamos em oração por você e sua família. Nossa equipe de liderança vai entrar em contato com você o quanto antes. Conte conosco para o que precisar!`;
        break;
      case 'SAUDE':
        reply = `Olá, ${firstName}! Sentimos muito por isso. Desejamos uma recuperação rápida e plena para você. Que Deus renove suas forças! Melhoras e qualquer coisa estamos por aqui!`;
        break;
      case 'TRABALHO':
        reply = `Olá, ${firstName}! Entendemos perfeitamente. Que Deus abençoe seu trabalho e sua escala de hoje! Sentimos sua falta no ${event} e esperamos você no próximo!`;
        break;
      case 'VIAGEM':
        reply = `Olá, ${firstName}! Que você tenha uma excelente viagem e um ótimo tempo de descanso. Que Deus guarde seus caminhos! Nos vemos no seu retorno!`;
        break;
      case 'FAMILIA':
        reply = `Olá, ${firstName}! A família é prioridade. Esperamos que esteja tudo bem com todos em seu lar. Sentimos sua falta no ${event}!`;
        break;
      case 'TRANSPORTE_LOGISTICA':
        reply = `Olá, ${firstName}! Poxa, imprevistos no trânsito e com transporte acontecem. Fique em segurança e esperamos você no nosso próximo encontro!`;
        break;
      case 'DESINTERESSE':
        reply = `Olá, ${firstName}! Obrigado por compartilhar com sinceridade. Seu bem-estar é muito importante para nós. Quando se sentir à vontade, adoraríamos conversar com você com todo o carinho.`;
        break;
      default:
        reply = `Olá, ${firstName}! Obrigado pelo retorno e carinho. Sua presença faz toda a diferença para nós! Esperamos ter você conosco no próximo ${event}!`;
        break;
    }

    return {
      suggestedReply: reply,
      providerUsed: 'RULE_BASED_FALLBACK'
    };
  }
}
