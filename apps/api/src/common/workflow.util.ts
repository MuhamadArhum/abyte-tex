import { BadRequestException } from '@nestjs/common';

/**
 * P1 remediation (WF-001/004/007/012/017): a small, explicit transition-map
 * guard — deliberately NOT a generic workflow engine (per the remediation
 * brief). Each domain service defines its own `Record<Status, Status[]>` of
 * legal next states and calls this before writing a status change. Kept to
 * exactly one job: reject an illegal transition with a clear error before
 * any write happens. Business preconditions beyond "is this transition
 * legal at all" (required fields, linked-record checks, role checks) belong
 * in each service's own named transition method, not here.
 */
export function assertValidTransition<S extends string>(
  resourceName: string,
  current: S,
  next: S,
  allowed: Partial<Record<S, readonly S[]>>,
): void {
  if (current === next) {
    throw new BadRequestException(`${resourceName} is already ${current}`);
  }
  const nextStates = allowed[current] ?? [];
  if (!nextStates.includes(next)) {
    throw new BadRequestException(
      `${resourceName} cannot transition from ${current} to ${next}. Allowed from ${current}: ${
        nextStates.length ? nextStates.join(', ') : '(none — terminal state)'
      }`,
    );
  }
}
