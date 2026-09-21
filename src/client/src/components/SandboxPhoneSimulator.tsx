import React, { useState, useEffect, useRef } from 'react';
import {
  Smartphone,
  Send,
  Sparkles,
  RefreshCw,
  User,
  ShieldCheck,
  Zap,
  Check,
  CheckCheck
} from 'lucide-react';
import { api } from '../services/api.js';
import { OrganizationSettingsItem } from '../types.js';

interface SandboxLog {
  id: string;
  direction: 'OUTBOUND' | 'INBOUND';
  toOrFrom: string;
  text: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string | Date;
}

export const SandboxPhoneSimulator: React.FC = () => {
  const [messages, setMessages] = useState<SandboxLog[]>([]);
  const [activePhone, setActivePhone] = useState<string>('+5511987654321');
  const [contactName, setContactName] = useState<string>('Mariana Souza');
  const [inputText, setInputText] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [lastPipelineResult, setLastPipelineResult] = useState<any | null>(null);
  const [verticalProfile, setVerticalProfile] = useState<string>('DEFAULT');

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Carrega histórico inicial e conecta ao stream SSE
  useEffect(() => {
    api.getOrganizationSettings().then((st: OrganizationSettingsItem) => {
      if (st?.organization?.verticalProfile) {
        setVerticalProfile(st.organization.verticalProfile);
        if (st.organization.verticalProfile === 'ACCOUNTING') {
          setActivePhone('+5511981112233');
          setContactName('Roberto Silveira (TechSolutions LTDA)');
        }
      }
    }).catch(console.error);

    api.getSandboxHistory().then(hist => {
      if (hist && Array.isArray(hist)) setMessages(hist);
    }).catch(console.error);

    const activeOrgId = api.getActiveOrganization();
    const eventSource = new EventSource(
      activeOrgId ? `/api/sandbox/events?orgId=${encodeURIComponent(activeOrgId)}` : '/api/sandbox/events',
      { withCredentials: true }
    );

    eventSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === 'OUTGOING_MESSAGE' || data.type === 'INCOMING_MESSAGE') {
          setMessages(prev => [...prev, data.message]);
        } else if (data.type === 'STATUS_UPDATE') {
          setMessages(prev => prev.map(m => m.id === data.messageId ? { ...m, status: data.status } : m));
        }
      } catch (err) {
        // Heartbeat or malformed
      }
    };

    return () => {
      eventSource.close();
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSimulateReply = async (textToSend?: string, customPhone?: string, customName?: string) => {
    const text = textToSend || inputText;
    if (!text.trim()) return;

    if (customPhone) setActivePhone(customPhone);
    if (customName) setContactName(customName);

    try {
      setLoading(true);
      const phoneToUse = customPhone || activePhone;
      const res = await api.simulateReply(phoneToUse, text);
      setLastPipelineResult(res.pipelineResult);
      if (!textToSend) setInputText('');
    } catch (err: any) {
      alert(err.message || 'Erro ao simular envio');
    } finally {
      setLoading(false);
    }
  };

  const isAccounting = verticalProfile === 'ACCOUNTING';

  const quickScenarios = isAccounting
    ? [
        {
          title: 'Simples / Reforma Tributária',
          text: 'Olá equipe Yeshua! Nossa empresa de tecnologia é optante pelo Simples Nacional. Como fica nossa tributação com a transição do IBS/CBS da Reforma Tributária? Vamos perder benefícios fiscais?',
          badge: 'REFORMA_TRIBUTARIA',
          phone: '+5511981112233',
          name: 'Roberto Silveira (TechSolutions LTDA)'
        },
        {
          title: 'MEI / Limite de Faturamento',
          text: 'Boa tarde! Fiz as contas do meu faturamento deste ano e ultrapassei os R$ 81.000,00 do MEI, fechando em R$ 98.000,00. Preciso desenquadrar agora para Microempresa? Como calcular a guia complementar?',
          badge: 'MEI',
          phone: '+5511982223344',
          name: 'Carla Dias (CD Consultoria MEI)'
        },
        {
          title: 'Nota Fiscal / Retenções',
          text: 'Preciso emitir urgentemente uma NFS-e de R$ 45.000,00 para um cliente corporativo de outro município com retenção de ISS e CSRF (PIS/COFINS/CSLL), mas o sistema da Prefeitura está travando no código de serviço.',
          badge: 'NOTA_FISCAL',
          phone: '+5511983334455',
          name: 'Marcos Vinicius (LogExpress Transportes)'
        },
        {
          title: 'Igreja / Imunidade & CND',
          text: 'A paz de Cristo! Nossa Comunidade da Fé precisa renovar a Certidão Negativa de Débitos (CND) na Receita Federal e protocolar a declaração de imunidade constitucional de templos. Quais documentos vocês precisam?',
          badge: 'IMUNIDADE_TEMPLO',
          phone: '+5511984445566',
          name: 'Pr. Josué Mendes (Comunidade da Fé)'
        },
        {
          title: 'Caso Complexo / Fiscalização',
          text: 'Recebemos uma intimação da SEFAZ com prazo de 5 dias úteis alegando divergência de recolhimento de ICMS-ST e SPED Fiscal dos últimos 2 anos. O valor apontado é de R$ 140.000,00. Precisamos de defesa urgente!',
          badge: 'CASO_COMPLEXO',
          phone: '+5511985556677',
          name: 'Dra. Helena Castro (BioFarma Distribuidora)'
        },
        {
          title: 'Falar com Contador',
          text: 'Olá! Gostaria de agendar uma reunião presencial com o contador responsável na Yeshua nesta semana. Estamos estruturando uma holding patrimonial familiar e abertura de filial.',
          badge: 'FALAR_CONTADOR',
          phone: '+5511986667788',
          name: 'Fernando Guimarães (Grupo Aliança)'
        }
      ]
    : [
        {
          title: 'Saúde / Doença',
          text: 'Oi pastor! Não consegui ir porque minha filha teve febre alta e levei na UPA.',
          badge: 'SAUDE',
          phone: '+5511987654321',
          name: 'Mariana Souza'
        },
        {
          title: 'Trabalho / Plantão',
          text: 'Boa noite! Peguei escala de plantão extra no hospital e não chego a tempo.',
          badge: 'TRABALHO',
          phone: '+5511981110006',
          name: 'Rodrigo Lima'
        },
        {
          title: 'Pedido de Oração (Crise)',
          text: 'Pastor, estou passando por uma fase muito difícil com depressão e angústia. Por favor orem por mim.',
          badge: 'PEDIDO_ATENDIMENTO',
          phone: '+5511981110005',
          name: 'Carlos Eduardo'
        },
        {
          title: 'Viagem em Família',
          text: 'Olá! Estou em viagem de férias fora da cidade com a família, volto semana que vem!',
          badge: 'VIAGEM',
          phone: '+5511981110002',
          name: 'Beatriz Almeida'
        },
        {
          title: 'Resposta Ambígua',
          text: '👍 ok valeu',
          badge: 'INCONCLUSIVO',
          phone: '+5511981110008',
          name: 'Paulo Ricardo'
        },
        {
          title: 'Descadastro LGPD (SAIR)',
          text: 'SAIR',
          badge: 'OPT_OUT',
          phone: '+5511981110009',
          name: 'Carla Nogueira'
        }
      ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900">Emulador Visual de Celular (WhatsApp Sandbox)</h2>
        <p className="text-xs text-slate-500">
          Simule o recebimento e envio de mensagens em tempo real sem custos e sem necessidade de credenciais da Meta
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Painel Esquerdo: Controle de Cenários e Pipeline da IA */}
        <div className="lg:col-span-6 space-y-4">
          {/* Card de Configuração do Contato */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-3">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <User className="w-4 h-4 text-emerald-600" /> Contato Simulado no WhatsApp
            </h3>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Nome do Participante</label>
                <input
                  type="text"
                  value={contactName}
                  onChange={e => setContactName(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">Número de Telefone</label>
                <input
                  type="text"
                  value={activePhone}
                  onChange={e => setActivePhone(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg outline-none focus:ring-2 focus:ring-emerald-500 font-mono"
                />
              </div>
            </div>
          </div>

          {/* Cenários Rápidos de Teste */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <Zap className="w-4 h-4 text-amber-500" /> Cenários Rápidos de Simulação
              </h3>
              <span className="text-[10px] text-slate-400">1 clique para simular resposta</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {quickScenarios.map((sc, i) => (
                <button
                  key={i}
                  onClick={() => handleSimulateReply(sc.text, sc.phone, sc.name)}
                  disabled={loading}
                  className="p-3 text-left rounded-xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/40 transition-all group flex flex-col justify-between"
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-slate-800 group-hover:text-emerald-700">
                      {sc.title}
                    </span>
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-semibold">
                      {sc.badge}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500 line-clamp-2 italic">
                    "{sc.text}"
                  </p>
                </button>
              ))}
            </div>
          </div>

          {/* Resultado do Pipeline da IA em Tempo Real */}
          {lastPipelineResult && (
            <div className="bg-indigo-50/80 rounded-2xl p-5 border border-indigo-200 shadow-sm space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-indigo-950 font-bold text-xs">
                  <Sparkles className="w-4 h-4 text-indigo-600" />
                  Resultado da Análise da IA
                </div>
                {lastPipelineResult.classification?.confidence && (
                  <span className="text-[10px] px-2 py-0.5 bg-indigo-200 text-indigo-900 font-mono font-bold rounded">
                    {(lastPipelineResult.classification.confidence * 100).toFixed(0)}% confiança
                  </span>
                )}
              </div>

              {lastPipelineResult.isOptOut ? (
                <div className="p-3 bg-rose-100 text-rose-900 rounded-lg text-xs font-bold flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-rose-700" />
                  Descadastro (Opt-Out) processado com sucesso! Contato bloqueado para novas campanhas.
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-slate-500">Categoria: </span>
                      <strong className="text-slate-900">{lastPipelineResult.classification?.category}</strong>
                    </div>
                    <div>
                      <span className="text-slate-500">Sentimento: </span>
                      <strong className="text-slate-900">{lastPipelineResult.classification?.sentiment}</strong>
                    </div>
                  </div>

                  <div className="text-xs text-slate-700 bg-white/80 p-2.5 rounded-lg border border-indigo-100">
                    <strong>Resumo:</strong> {lastPipelineResult.classification?.summary}
                  </div>

                  {lastPipelineResult.classification?.suggestedReply && (
                    <div className="text-xs bg-white p-2.5 rounded-lg border border-indigo-100 text-slate-800">
                      <span className="text-[10px] font-bold text-indigo-950 uppercase tracking-wider block mb-1">
                        Sugestão de Resposta Gerada:
                      </span>
                      <em className="text-slate-700">"{lastPipelineResult.classification.suggestedReply}"</em>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Painel Direito: Smartphone Mock Frame (Visual WhatsApp) */}
        <div className="lg:col-span-6 flex justify-center">
          <div className="w-full max-w-[360px] bg-slate-900 rounded-[40px] p-3.5 shadow-2xl border-4 border-slate-800 ring-1 ring-slate-700">
            {/* Top Speaker & Camera Notch */}
            <div className="w-32 h-4 bg-slate-800 rounded-full mx-auto mb-2 flex items-center justify-center">
              <div className="w-2.5 h-2.5 bg-slate-950 rounded-full"></div>
            </div>

            {/* WhatsApp Screen Body */}
            <div className="bg-whatsapp-chatbg rounded-[28px] overflow-hidden flex flex-col h-[520px] shadow-inner relative border border-slate-700/50">
              {/* WhatsApp App Header */}
              <div className="bg-whatsapp-dark text-white p-3 flex items-center justify-between shrink-0 shadow-md">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-xs">
                    {contactName.charAt(0)}
                  </div>
                  <div>
                    <div className="font-bold text-xs leading-tight">{contactName}</div>
                    <div className="text-[10px] text-emerald-200 font-sans">online no WhatsApp</div>
                  </div>
                </div>
                <Smartphone className="w-4 h-4 text-emerald-300" />
              </div>

              {/* Chat Message Stream */}
              <div className="flex-1 p-3 overflow-y-auto space-y-2.5 text-xs bg-[#EFEAE2]">
                <div className="text-center my-1">
                  <span className="bg-white/80 text-[10px] text-slate-500 px-2 py-0.5 rounded shadow-xs">
                    Hoje
                  </span>
                </div>

                {messages.map((m, idx) => {
                  const isOutbound = m.direction === 'OUTBOUND';
                  return (
                    <div
                      key={m.id || idx}
                      className={`flex flex-col ${isOutbound ? 'items-start' : 'items-end'}`}
                    >
                      <div
                        className={`max-w-[82%] p-2.5 rounded-xl text-xs leading-relaxed shadow-sm relative ${
                          isOutbound
                            ? 'bg-white text-slate-900 rounded-tl-none border border-slate-200/60'
                            : 'bg-[#DCF8C6] text-slate-900 rounded-tr-none'
                        }`}
                      >
                        <p className="whitespace-pre-wrap">{m.text}</p>
                        <div className="flex items-center justify-end gap-1 mt-1 text-[9px] text-slate-400">
                          <span>
                            {new Intl.DateTimeFormat('pt-BR', { timeStyle: 'short' }).format(new Date(m.timestamp))}
                          </span>
                          {!isOutbound && (
                            <span>
                              {m.status === 'read' ? (
                                <CheckCheck className="w-3 h-3 text-blue-500" />
                              ) : m.status === 'delivered' ? (
                                <CheckCheck className="w-3 h-3 text-slate-400" />
                              ) : (
                                <Check className="w-3 h-3 text-slate-400" />
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}

                {messages.length === 0 && (
                  <div className="text-center py-12 text-slate-400 text-xs italic">
                    Nenhuma mensagem no histórico.<br />Dispare uma campanha ou digite abaixo para simular.
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Chat Input Bar */}
              <div className="p-2 bg-[#F0F2F5] border-t border-slate-300 flex items-center gap-1.5 shrink-0">
                <input
                  type="text"
                  placeholder="Mensagem..."
                  value={inputText}
                  onChange={e => setInputText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSimulateReply();
                    }
                  }}
                  className="flex-1 px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-full focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
                <button
                  onClick={() => handleSimulateReply()}
                  disabled={loading || !inputText.trim()}
                  className="w-8 h-8 rounded-full bg-whatsapp-teal text-white flex items-center justify-center shadow hover:bg-emerald-700 transition-colors disabled:opacity-50"
                >
                  {loading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
