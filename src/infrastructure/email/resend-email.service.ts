export interface SendEmailPayload {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
}

export interface SendPasswordResetParams {
  to: string;
  userName?: string;
  token: string;
  url?: string;
}

export interface SendEmailResult {
  success: boolean;
  id?: string;
  error?: string;
}

export class ResendEmailService {
  private static getApiKey(): string | undefined {
    return process.env.RESEND_API_KEY?.trim();
  }

  private static getFromAddress(override?: string): string | undefined {
    return override?.trim() || process.env.AUTH_EMAIL_FROM?.trim() || undefined;
  }

  private static getApiUrl(): string {
    return process.env.RESEND_API_URL?.trim() || 'https://api.resend.com/emails';
  }

  /**
   * Envia e-mail genérico via Resend API usando fetch nativo.
   * Não lança exceção se a chave ou remetente não estiverem configurados ou se houver falha de rede.
   * Não expõe segredos, tokens ou URLs sensíveis em logs.
   */
  public static async sendEmail(payload: SendEmailPayload): Promise<SendEmailResult> {
    const apiKey = this.getApiKey();
    if (!apiKey) {
      console.warn('[ResendEmailService] RESEND_API_KEY não configurada. Envio de e-mail suprimido.');
      return { success: false, error: 'RESEND_API_KEY_MISSING' };
    }

    const from = this.getFromAddress(payload.from);
    if (!from) {
      console.warn('[ResendEmailService] AUTH_EMAIL_FROM não configurado. Envio de e-mail suprimido.');
      return { success: false, error: 'AUTH_EMAIL_FROM_MISSING' };
    }

    const recipients = Array.isArray(payload.to) ? payload.to : [payload.to];
    const apiUrl = this.getApiUrl();

    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from,
          to: recipients,
          subject: payload.subject,
          html: payload.html,
          ...(payload.text ? { text: payload.text } : {})
        })
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => 'no error detail');
        console.error(`[ResendEmailService] Falha na API do Resend (status ${response.status}):`, errorText);
        return { success: false, error: `HTTP_${response.status}` };
      }

      const data = (await response.json().catch(() => ({}))) as { id?: string };
      return { success: true, id: data?.id };
    } catch (err: any) {
      console.error('[ResendEmailService] Erro ao comunicar com Resend:', err?.message || 'Unknown network error');
      return { success: false, error: err?.message || 'NETWORK_ERROR' };
    }
  }

  /**
   * Envia e-mail de recuperação de senha com link seguro para o frontend.
   * Regra P0: Nunca logar token, API key ou a URL completa com token.
   */
  public static async sendPasswordResetEmail(params: SendPasswordResetParams): Promise<SendEmailResult> {
    const { to, userName, token, url } = params;

    const appBaseUrl = process.env.APP_URL || process.env.BETTER_AUTH_URL || 'http://localhost:3000';
    const resetUrl = url || `${appBaseUrl.replace(/\/+$/, '')}/reset-password?token=${encodeURIComponent(token)}`;

    const displayName = userName?.trim() || 'Usuário';
    const subject = 'Recuperação de Acesso - Redefinição de Senha';

    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>${subject}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 24px; }
    .container { max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 32px; border: 1px solid #e2e8f0; }
    .header { margin-bottom: 24px; }
    .brand { font-size: 20px; font-weight: bold; color: #0f172a; }
    .content { line-height: 1.6; font-size: 15px; color: #334155; }
    .button-container { margin: 28px 0; }
    .button { display: inline-block; background-color: #2563eb; color: #ffffff !important; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-weight: 600; font-size: 14px; }
    .footer { margin-top: 32px; padding-top: 20px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #64748b; }
    .fallback-url { word-break: break-all; color: #2563eb; font-size: 13px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="brand">MEGA SI</div>
    </div>
    <div class="content">
      <p>Olá, <strong>${displayName}</strong>,</p>
      <p>Recebemos uma solicitação para redefinir a senha do seu acesso à plataforma.</p>
      <p>Para criar uma nova senha, clique no botão abaixo:</p>
      <div class="button-container">
        <a href="${resetUrl}" class="button" target="_blank" rel="noopener noreferrer">Redefinir Minha Senha</a>
      </div>
      <p>Ou acesse diretamente através do link:</p>
      <p><a href="${resetUrl}" class="fallback-url">${resetUrl}</a></p>
      <p>Este link é de uso único e expira em 1 hora.</p>
      <p>Se você não solicitou a alteração de senha, ignore este e-mail. Nenhuma alteração foi realizada.</p>
    </div>
    <div class="footer">
      <p>© ${new Date().getFullYear()} MEGA SI. Todos os direitos reservados.</p>
    </div>
  </div>
</body>
</html>
    `.trim();

    const text = `
MEGA SI - Recuperação de Senha

Olá, ${displayName},

Recebemos uma solicitação para redefinir a senha do seu acesso à plataforma.
Para criar uma nova senha, copie e cole o seguinte link em seu navegador:

${resetUrl}

Este link é de uso único e expira em 1 hora.
Se você não solicitou a alteração de senha, ignore esta mensagem.

© ${new Date().getFullYear()} MEGA SI.
    `.trim();

    return this.sendEmail({
      to,
      subject,
      html,
      text
    });
  }
}
