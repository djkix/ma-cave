import { Controller, Get, HttpCode, Post, UseGuards } from '@nestjs/common';
import { AdminGuard } from '../auth/admin.guard';
import { AuthenticatedGuard } from '../auth/authenticated.guard';
import { PrismaService } from '../prisma/prisma.service';
import { backupAlert } from './backup-status';

/**
 * Sauvegarde vers le NAS, vue de l'Administration. L'api ne sauvegarde rien
 * elle-même : elle lit les tentatives inscrites par le service `sauvegarde` et
 * n'écrit qu'une demande, prise par ce service dans les 5 minutes.
 */
@Controller('admin/backup')
@UseGuards(AuthenticatedGuard, AdminGuard)
export class BackupController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async status() {
    const [last, success, requests] = await Promise.all([
      this.prisma.backupRun.findFirst({ orderBy: { finishedAt: 'desc' }, select: { finishedAt: true, succeeded: true, message: true } }),
      this.prisma.backupRun.findFirst({ where: { succeeded: true }, orderBy: { finishedAt: 'desc' }, select: { finishedAt: true } }),
      this.prisma.backupRequest.count(),
    ]);
    return {
      lastSuccessAt: success?.finishedAt.toISOString() ?? null,
      lastRun: last && { finishedAt: last.finishedAt.toISOString(), succeeded: last.succeeded, message: last.message },
      requested: requests > 0,
      alert: backupAlert(last, success?.finishedAt ?? null, new Date()),
    };
  }

  /** Deux appuis ne font qu'une sauvegarde. */
  @Post('request')
  @HttpCode(204)
  async request(): Promise<void> {
    if ((await this.prisma.backupRequest.count()) === 0) await this.prisma.backupRequest.create({ data: {} });
  }
}
