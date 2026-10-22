import { BadRequestException, Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { AppUser } from '@prisma/client';
import { AdminGuard } from '../auth/admin.guard';
import { AuthenticatedGuard } from '../auth/authenticated.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { VisionBudgetService } from '../queue/vision-budget.service';
import { GeminiModelService, fallbackModels } from '../vision/gemini-model.service';
import { GeminiQuotaService } from '../vision/gemini-quota';
import { AdminService } from './admin.service';
import { geminiUsageDaysSchema, updateAdminUserSchema, updateBudgetSchema, updateGeminiQuotaSchema } from './dto';
import { GeminiUsageService } from './gemini-usage.service';

@Controller('admin/users')
@UseGuards(AuthenticatedGuard, AdminGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get()
  list() {
    return this.admin.listUsers();
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() body: unknown, @CurrentUser() user: AppUser) {
    const parsed = updateAdminUserSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues.map((i) => i.message).join(' ; '));
    return this.admin.updateUser(id, user, parsed.data);
  }

  @Post(':id/cave')
  createCave(@Param('id', ParseUUIDPipe) id: string) {
    return this.admin.createCaveFor(id);
  }
}

@Controller('admin/registrations')
@UseGuards(AuthenticatedGuard, AdminGuard)
export class AdminRegistrationsController {
  constructor(private readonly admin: AdminService) {}

  @Get()
  list() {
    return this.admin.listRegistrations();
  }

  @Post(':id/validate')
  validate(@Param('id', ParseUUIDPipe) id: string) {
    return this.admin.validateRegistration(id);
  }

  @Post(':id/refuse')
  refuse(@Param('id', ParseUUIDPipe) id: string) {
    return this.admin.refuseRegistration(id);
  }
}

/** Part du plafond mensuel Gemini qu'une cave peut dépenser (la cave du premier administrateur en est exemptée). */
@Controller('admin/budget')
@UseGuards(AuthenticatedGuard, AdminGuard)
export class AdminBudgetController {
  constructor(private readonly budget: VisionBudgetService) {}

  @Get()
  get() {
    return this.view();
  }

  @Put()
  async update(@Body() body: unknown) {
    const parsed = updateBudgetSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0].message);
    if (parsed.data.caveShare !== undefined) await this.budget.setCaveShare(parsed.data.caveShare);
    if (parsed.data.invitedShare !== undefined) await this.budget.setInvitedShare(parsed.data.invitedShare);
    return this.view();
  }

  private async view(): Promise<{ caveShare: number; invitedShare: number; capCents: number; spentThisMonthCents: number }> {
    const [caveShare, invitedShare, spentThisMonthCents] = await Promise.all([
      this.budget.caveShare(),
      this.budget.invitedShare(),
      this.budget.spentThisMonthCents(),
    ]);
    return { caveShare, invitedShare, capCents: this.budget.capCents, spentThisMonthCents };
  }
}

/** Consommation Gemini par jour et par usage, refus de Google compris, et pause commune en cours. */
@Controller('admin/gemini-usage')
@UseGuards(AuthenticatedGuard, AdminGuard)
export class AdminGeminiUsageController {
  constructor(private readonly usage: GeminiUsageService) {}

  @Get()
  get(@Query('days') days: string | undefined) {
    const parsed = geminiUsageDaysSchema.safeParse(days);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0].message);
    return this.usage.report(parsed.data);
  }
}

/** Modèles Gemini, choisis seuls (du plus récent au plus ancien), leurs limites de débit (niveau sans frais de Google) et leur utilisation. */
@Controller('admin/gemini-quota')
@UseGuards(AuthenticatedGuard, AdminGuard)
export class AdminGeminiQuotaController {
  constructor(
    private readonly quota: GeminiQuotaService,
    private readonly models: GeminiModelService,
  ) {}

  /** Modèle en cours (`current`), chaque modèle dans l'ordre d'emploi, erreur de la liste de Google éventuelle. */
  @Get()
  async get() {
    return this.view();
  }

  /** Limites d'un modèle de la liste (`model`, par défaut le modèle en cours). */
  @Put()
  async update(@Body() body: unknown) {
    const parsed = updateGeminiQuotaSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException(parsed.error.issues[0].message);
    const { model, ...limits } = parsed.data;
    const models = await this.models.candidates();
    const target = model ?? (await this.quota.usage(models)).current ?? models[0];
    if (!target || !models.includes(target)) throw new BadRequestException('Modèle absent de la liste des modèles employés');
    await this.quota.setLimits(target, limits);
    return this.view();
  }

  private async view() {
    const { models, error } = await this.models.available();
    return { ...(await this.quota.usage(fallbackModels(models))), error };
  }
}
