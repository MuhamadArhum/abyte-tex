import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { TenantContextStore } from '../common/tenant-context';
import { buildPaginationMeta } from '../common/dto/pagination.dto';
import { MarkAttendanceDto, UpdateAttendanceDto } from './dto/attendance.dto';
import { ListAttendanceQueryDto } from './dto/list-attendance-query.dto';

@Injectable()
export class AttendanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async mark(dto: MarkAttendanceDto) {
    const ctx = TenantContextStore.getOrThrow();
    if (!ctx.tenantId) throw new ConflictException('Attendance can only be recorded within a tenant context');

    const employee = await this.prisma.db.employee.findUnique({ where: { id: dto.employeeId } });
    if (!employee) throw new NotFoundException('Employee not found');

    const date = new Date(dto.date);
    const existing = await this.prisma.db.attendance.findFirst({ where: { employeeId: dto.employeeId, date } });
    if (existing) {
      throw new ConflictException(
        'Attendance for this employee on this date has already been recorded — use update instead',
      );
    }

    const attendance = await this.prisma.db.attendance.create({
      data: {
        tenantId: ctx.tenantId,
        factoryId: employee.factoryId,
        employeeId: dto.employeeId,
        date,
        checkIn: dto.checkIn ? new Date(dto.checkIn) : undefined,
        checkOut: dto.checkOut ? new Date(dto.checkOut) : undefined,
        status: dto.status,
        overtimeMinutes: dto.overtimeMinutes ?? 0,
        notes: dto.notes,
      },
    });
    await this.auditService.log({ action: 'CREATE', entityType: 'Attendance', entityId: attendance.id, newValue: dto });
    return attendance;
  }

  async list(query: ListAttendanceQueryDto) {
    const where = {
      ...(query.factoryId ? { factoryId: query.factoryId } : {}),
      ...(query.employeeId ? { employeeId: query.employeeId } : {}),
      ...(query.date ? { date: new Date(query.date) } : {}),
    };

    const [items, total] = await Promise.all([
      this.prisma.db.attendance.findMany({
        where,
        include: { employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } } },
        skip: query.skip,
        take: query.take,
        orderBy: { date: 'desc' },
      }),
      this.prisma.db.attendance.count({ where }),
    ]);
    return { data: items, meta: buildPaginationMeta(total, query.page, query.pageSize) };
  }

  async getById(id: string) {
    const attendance = await this.prisma.db.attendance.findUnique({
      where: { id },
      include: { employee: { select: { id: true, firstName: true, lastName: true, employeeCode: true } } },
    });
    if (!attendance) throw new NotFoundException('Attendance record not found');
    return attendance;
  }

  async update(id: string, dto: UpdateAttendanceDto) {
    const existing = await this.getById(id);
    const updated = await this.prisma.db.attendance.update({
      where: { id },
      data: {
        checkIn: dto.checkIn ? new Date(dto.checkIn) : undefined,
        checkOut: dto.checkOut ? new Date(dto.checkOut) : undefined,
        status: dto.status,
        overtimeMinutes: dto.overtimeMinutes,
        notes: dto.notes,
      },
    });
    await this.auditService.log({
      action: 'UPDATE',
      entityType: 'Attendance',
      entityId: id,
      oldValue: existing,
      newValue: dto,
    });
    return updated;
  }
}
