import { INestApplication } from '@nestjs/common';
import { createTestApp, getPrisma } from '../utils/test-app';
import { authed, createFactory, createMachine, createTenantWithOwner, login } from '../utils/fixtures';

/**
 * P1 regression suite for WF-017 (Maintenance Job transitions + machine
 * RUNNING/BREAKDOWN coordination) and WF-018 (preventive schedule
 * advancement on completion).
 */
describe('P1 WF-017/WF-018 — Maintenance workflow', () => {
  let app: INestApplication;
  let tenant: Awaited<ReturnType<typeof createTenantWithOwner>>;
  let token: string;
  let factoryId: string;

  beforeAll(async () => {
    app = await createTestApp();
    tenant = await createTenantWithOwner(app, { name: 'Maintenance Workflow Textiles', slug: 'mntwf' });
    token = await login(app, tenant.email, tenant.password);
    const factory = await createFactory(app, tenant.tenantId, 'MNF1');
    factoryId = factory.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('WF-017: a COMPLETED Maintenance Job cannot be reopened', async () => {
    const machine = await createMachine(app, tenant.tenantId, factoryId, 'MC-WF017-A');
    const jobRes = await authed(app, token)
      .post('/api/v1/maintenance-jobs')
      .send({ factoryId, machineId: machine.id })
      .expect(201);
    const job = jobRes.body.data as { id: string };

    await authed(app, token).patch(`/api/v1/maintenance-jobs/${job.id}`).send({ status: 'COMPLETED' }).expect(200);

    const reopen = await authed(app, token).patch(`/api/v1/maintenance-jobs/${job.id}`).send({ status: 'OPEN' });
    expect(reopen.status).toBe(400);
  });

  it('WF-017: closing a downtime does NOT mark the machine RUNNING while its auto-created corrective job is still open', async () => {
    const machine = await createMachine(app, tenant.tenantId, factoryId, 'MC-WF017-B');

    await authed(app, token)
      .post('/api/v1/downtime')
      .send({ machineId: machine.id, startTime: new Date().toISOString(), category: 'MECHANICAL', reason: 'Test breakdown' })
      .expect(201);

    const prisma = getPrisma(app).raw;
    const afterBreakdown = await prisma.machine.findUnique({ where: { id: machine.id } });
    expect(afterBreakdown?.status).toBe('BREAKDOWN');

    const downtime = await prisma.downtime.findFirst({ where: { machineId: machine.id } });
    await authed(app, token)
      .patch(`/api/v1/downtime/${downtime!.id}/close`)
      .send({ endTime: new Date().toISOString() })
      .expect(200);

    // The corrective MaintenanceJob auto-created by the breakdown is still OPEN — closing
    // the downtime must not silently mark the machine available again.
    const afterClose = await prisma.machine.findUnique({ where: { id: machine.id } });
    expect(afterClose?.status).not.toBe('RUNNING');
  });

  it('WF-017: the machine becomes RUNNING once the linked corrective job is completed', async () => {
    const machine = await createMachine(app, tenant.tenantId, factoryId, 'MC-WF017-C');

    await authed(app, token)
      .post('/api/v1/downtime')
      .send({ machineId: machine.id, startTime: new Date().toISOString(), category: 'ELECTRICAL', reason: 'Test breakdown 2' })
      .expect(201);

    const prisma = getPrisma(app).raw;
    const downtime = await prisma.downtime.findFirst({ where: { machineId: machine.id } });
    await authed(app, token)
      .patch(`/api/v1/downtime/${downtime!.id}/close`)
      .send({ endTime: new Date().toISOString() })
      .expect(200);

    const job = await prisma.maintenanceJob.findFirst({ where: { machineId: machine.id, type: 'CORRECTIVE' } });
    await authed(app, token).patch(`/api/v1/maintenance-jobs/${job!.id}`).send({ status: 'COMPLETED' }).expect(200);

    const finalMachine = await prisma.machine.findUnique({ where: { id: machine.id } });
    expect(finalMachine?.status).toBe('RUNNING');
  });

  it('WF-018: completing a PREVENTIVE job linked to a schedule advances lastPerformedAt/nextDueAt', async () => {
    const machine = await createMachine(app, tenant.tenantId, factoryId, 'MC-WF018');
    const scheduleRes = await authed(app, token)
      .post('/api/v1/maintenance-schedules')
      .send({ machineId: machine.id, frequencyDays: 30 })
      .expect(201);
    const schedule = scheduleRes.body.data as { id: string; nextDueAt: string };

    const jobRes = await authed(app, token)
      .post('/api/v1/maintenance-jobs')
      .send({ factoryId, machineId: machine.id, scheduleId: schedule.id })
      .expect(201);
    const job = jobRes.body.data as { id: string };

    await authed(app, token).patch(`/api/v1/maintenance-jobs/${job.id}`).send({ status: 'COMPLETED' }).expect(200);

    const prisma = getPrisma(app).raw;
    const updatedSchedule = await prisma.maintenanceSchedule.findUnique({ where: { id: schedule.id } });
    expect(updatedSchedule?.lastPerformedAt).not.toBeNull();
    expect(new Date(updatedSchedule!.nextDueAt!).getTime()).toBeGreaterThan(new Date(schedule.nextDueAt).getTime());
  });
});
