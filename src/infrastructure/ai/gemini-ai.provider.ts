import { IAIService, AIClassificationContext } from '../../domain/ports/ai-service.port.js';
import {
  AbsenceAnalysis,
  AbsenceAnalysisSchema
} from '../../domain/value-objects/absence-taxonomy.vo.js';

export class GeminiAIProvider implements IAIService {
  constructor(
    private apiKey: string,
    private modelName: string = 'gemini-2.0-flash'
  ) {}

  async classifyAbsence(
    messageText: string,
    context: AIClassificationContext
  ): Promise<AbsenceAnalysis & { providerUsed: string }> {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.modelName}:generateContent?key=${this.apiKey}`;

    const systemInstruction = `Você é um assistente de IA especialista em acolhimento e triagem pastoral de membros e participantes de eventos de comunidades.
Sua função é classificar rigorosamente o motivo da ausência do participante e gerar uma sugestão de resposta calorosa, empática, respeitosa e contextualizada.

DIRETRIZES:
1. Classifique a categoria exclusivamente entre: TRABALHO, SAUDE, FAMILIA, VIAGEM, COMPROMISSO, ESQUECIMENTO, FALTA_INFORMACAO, TRANSPORTE_LOGISTICA, DESINTERESSE, PEDIDO_ATENDIMENTO, OUTRO, INCONCLUSIVO.
2. Sentimento: POSITIVO, NEUTRO, NEGATIVO, PREOCUPADO.
3. Urgência: BAIXA, MEDIA, ALTA.
4. requires_human_attention: true se a mensagem envolver PEDIDO_ATENDIMENTO, SAUDE grave/internação, sentiment NEGATIVO/PREOCUPADO com crise ou se a confiança for baixa (< 0.60).
5. Sugestão de resposta (suggested_reply): Acolhedora, mencionando o primeiro nome, em tom pastoral/respeitoso, sem cobrança, pronta para o WhatsApp.
6. Retorne ESTRITAMENTE em formato JSON compatível com o schema.`;

    const userPrompt = `Contexto:
- Nome da pessoa: ${context.personName}
- Evento: ${context.eventName} (Data: ${context.eventDate || 'Recente'})
- Mensagem recebida do participante: "${messageText}"`;

    const requestBody = {
      contents: [
        {
          parts: [
            { text: `${systemInstruction}\n\n${userPrompt}` }
          ]
        }
      ],
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0.1,
        maxOutputTokens: 600
      }
    };

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Erro na API do Google Gemini (${response.status}): ${errText}`);
    }

    const data = await response.json() as any;
    const textOutput = data?.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!textOutput) {
      throw new Error('Resposta vazia da API do Gemini');
    }

    const parsedJson = JSON.parse(textOutput);
    const validated = AbsenceAnalysisSchema.parse(parsedJson);

    return {
      ...validated,
      providerUsed: `GEMINI (${this.modelName})`
    };
  }

  async generateSuggestedReply(
    messageText: string,
    context: AIClassificationContext,
    category: string
  ): Promise<{ suggestedReply: string; providerUsed: string }> {
    const analysis = await this.classifyAbsence(messageText, context);
    return {
      suggestedReply: analysis.suggested_reply,
      providerUsed: analysis.providerUsed
    };
  }
}
