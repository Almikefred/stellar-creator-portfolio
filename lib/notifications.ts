/**
 * In-app notification persistence.
 *
 * Queued transactional email (delivery log, unsubscribe tokens, per-category
 * preferences) is not implemented yet; see docs/MAINTENANCE_NOTES.md.
 */
import { prisma } from '@/lib/prisma';

interface InAppNotificationInput {
  id: string;
  userId: string;
  title: string;
  body: string;
  read: boolean;
  applicationId?: string;
  bountyId?: string;
  createdAt: string;
}

/**
 * Persist a fire-and-forget copy of an in-app notification to the
 * InAppNotification table, alongside the in-memory store bounty-service.ts
 * keeps for the current process. Never throws - callers invoke this with
 * `void persistInAppNotification(record)` and don't await or catch it, so
 * a DB failure here must not become an unhandled promise rejection.
 */
export async function persistInAppNotification(
  record: InAppNotificationInput,
): Promise<void> {
  try {
    await prisma.inAppNotification.create({
      data: {
        id: record.id,
        userId: record.userId,
        title: record.title,
        body: record.body,
        read: record.read,
        applicationId: record.applicationId ?? null,
        bountyId: record.bountyId ?? null,
        createdAt: new Date(record.createdAt),
      },
    });
  } catch (error) {
    console.error('[persistInAppNotification] failed to persist notification:', error);
  }
}
