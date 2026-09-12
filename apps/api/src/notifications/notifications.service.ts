import { Injectable, NotFoundException } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { TenantContextStore } from '../common/tenant-context';
import { buildPaginationMeta } from '../common/dto/pagination.dto';
import { ListNotificationsQueryDto } from './dto/list-notifications-query.dto';

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  referenceType?: string;
  referenceId?: string;
}

/**
 * In-app notifications per SRS §12.7. `notify()` is the hook other modules will
 * call as their triggers are built (low stock, production delay, machine
 * breakdown, maintenance due, quality rejection, pending approval, order
 * deadline, attendance alerts) — none of those triggers are wired up yet, so
 * this module currently has no producer besides direct calls in tests/manual use.
 * Email channel delivery (also named in §12.7) is not yet connected to MailService.
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async notify(input: CreateNotificationInput) {
    const ctx = TenantContextStore.get();
    return this.prisma.raw.notification.create({
      data: {
        tenantId: ctx?.tenantId ?? null,
        userId: input.userId,
        type: input.type,
        channel: 'IN_APP',
        title: input.title,
        message: input.message,
        referenceType: input.referenceType,
        referenceId: input.referenceId,
      },
    });
  }

  async listForUser(userId: string, query: ListNotificationsQueryDto) {
    const where = { userId, ...(query.unreadOnly === 'true' ? { isRead: false } : {}) };
    const [items, total] = await Promise.all([
      this.prisma.raw.notification.findMany({
        where,
        skip: query.skip,
        take: query.take,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.raw.notification.count({ where }),
    ]);
    return { data: items, meta: buildPaginationMeta(total, query.page, query.pageSize) };
  }

  async markRead(userId: string, id: string) {
    const notification = await this.prisma.raw.notification.findFirst({ where: { id, userId } });
    if (!notification) throw new NotFoundException('Notification not found');
    return this.prisma.raw.notification.update({ where: { id }, data: { isRead: true, readAt: new Date() } });
  }

  async markAllRead(userId: string) {
    await this.prisma.raw.notification.updateMany({
      where: { userId, isRead: false },
      data: { isRead: true, readAt: new Date() },
    });
    return { success: true };
  }
}
