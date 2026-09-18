import { Request, Response, NextFunction } from 'express';
import { auth } from '../../infrastructure/auth/auth.config.js';
import { prisma } from '../../infrastructure/database/prisma.client.js';

// Extensão dos tipos do Express Request
declare global {
  namespace Express {
    interface Request {
      user?: any;
      session?: any;
      organizationId?: string;
      memberRole?: string;
    }
  }
}

/**
 * Middleware para exigir sessão autenticada via Better Auth (cookies/sessão)
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const session = await auth.api.getSession({
      headers: req.headers as any
    });

    if (!session || !session.user) {
      res.status(401).json({
        error: 'UNAUTHORIZED',
        message: 'Acesso não autorizado. Sessão ativa necessária.'
      });
      return;
    }

    req.user = session.user;
    req.session = session.session;
    next();
  } catch (err: any) {
    console.error('[AuthMiddleware] Erro ao validar sessão:', err.message);
    res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Falha ao autenticar sessão.'
    });
  }
}

/**
 * Middleware para exigir organização ativa e validar membership no banco
 * Regra Crítica: x-organization-id indica o workspace, mas NUNCA autoriza sozinho!
 */
export async function requireOrganization(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const targetOrgId =
      (req.headers['x-organization-id'] as string) ||
      req.session?.activeOrganizationId;

    if (!targetOrgId) {
      res.status(400).json({
        error: 'ORGANIZATION_REQUIRED',
        message: 'Nenhuma organização/workspace selecionado. Envie o header x-organization-id.'
      });
      return;
    }

    if (!req.user || !req.user.id) {
      res.status(401).json({ error: 'UNAUTHORIZED', message: 'Usuário não identificado.' });
      return;
    }

    // Validação estrita de Membership no banco
    const membership = await prisma.member.findUnique({
      where: {
        organizationId_userId: {
          organizationId: targetOrgId,
          userId: req.user.id
        }
      },
      include: {
        organization: true
      }
    });

    if (!membership) {
      res.status(403).json({
        error: 'FORBIDDEN_CROSS_TENANT',
        message: 'Acesso negado. Você não pertence a esta organização/workspace.'
      });
      return;
    }

    req.organizationId = targetOrgId;
    req.memberRole = membership.role.toUpperCase();
    next();
  } catch (err: any) {
    console.error('[OrganizationMiddleware] Erro ao validar tenant:', err.message);
    res.status(500).json({
      error: 'INTERNAL_SERVER_ERROR',
      message: 'Erro interno ao validar workspace.'
    });
  }
}

/**
 * Middleware de controle de acesso baseado em papéis (RBAC)
 * @param allowedRoles Lista de papéis autorizados (ex: ['OWNER', 'ADMIN'])
 */
export function requireRole(allowedRoles: string[]) {
  const normalizedAllowed = allowedRoles.map(r => r.toUpperCase());

  return (req: Request, res: Response, next: NextFunction): void => {
    const role = (req.memberRole || '').toUpperCase();

    // OWNER sempre tem acesso total
    if (role === 'OWNER' || normalizedAllowed.includes(role)) {
      next();
      return;
    }

    res.status(403).json({
      error: 'INSUFFICIENT_PERMISSIONS',
      message: `Permissão insuficiente. Esta operação requer um dos seguintes papéis: ${allowedRoles.join(', ')}.`
    });
  };
}
