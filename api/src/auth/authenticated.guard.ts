import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { AppUser } from '@prisma/client';
import { Request } from 'express';

@Injectable()
export class AuthenticatedGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (!req.isAuthenticated || !req.isAuthenticated()) throw new UnauthorizedException('Connexion requise');
    // Un blocage doit couper la session en cours, pas seulement empêcher la
    // prochaine connexion : on revérifie le statut à chaque requête.
    const user = req.user as AppUser | undefined;
    if (user?.status === 'BLOCKED') throw new ForbiddenException('Compte bloqué');
    return true;
  }
}
