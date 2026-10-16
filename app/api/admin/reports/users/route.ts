import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth/auth';
import { prisma } from '@/lib/prisma';
import { checkRateLimit } from '@/lib/rate-limit';
import { createCsvStream } from '@/lib/export-utils';

const EXPORT_BATCH_SIZE = 500;

/**
 * GET /api/admin/reports/users?startDate=...&endDate=...&format=csv
 *
 * Streams user report with columns:
 * username, email, role, join_date, bounty_count, total_earned
 *
 * Requires admin role. Rate limited to 3 exports per hour.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession();

    // Check auth and admin role
    if (!session?.user?.id || session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Unauthorized: Admin role required' },
        { status: 403 }
      );
    }

    const userId = session.user.id;

    // Check rate limit
    if (!checkRateLimit(userId)) {
      return NextResponse.json(
        { error: 'Rate limited: Maximum 3 exports per hour' },
        { status: 429 }
      );
    }

    // Parse date range
    const { searchParams } = req.nextUrl;
    const startDateStr = searchParams.get('startDate');
    const endDateStr = searchParams.get('endDate');
    const format = searchParams.get('format') || 'csv';

    const startDate = startDateStr ? new Date(startDateStr) : new Date('2000-01-01');
    const endDate = endDateStr ? new Date(endDateStr) : new Date();

    // Log export to audit
    await prisma.auditLog.create({
      data: {
        userId,
        resource: 'admin_export',
        action: 'export_users',
        status: 'SUCCESS',
        requestPath: req.nextUrl.pathname,
        httpMethod: 'GET',
      },
    });

    const dateWhere = { createdAt: { gte: startDate, lte: endDate } };
    const toReportRow = (user: {
      name: string | null;
      email: string | null;
      role: string;
      createdAt: Date;
      bounties: { budget: number }[];
    }) => ({
      username: user.name || 'Unknown',
      email: user.email || '',
      role: user.role,
      join_date: user.createdAt.toISOString().split('T')[0],
      bounty_count: user.bounties.length,
      total_earned: user.bounties.reduce((sum, b) => sum + b.budget, 0),
    });

    // JSON format is unchanged: still a single findMany. This endpoint's
    // "doesn't OOM on a large range" fix targets the CSV path below, which
    // is the one meant for bulk/offline export of an unbounded date range.
    if (format === 'json') {
      const users = await prisma.user.findMany({
        where: dateWhere,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          createdAt: true,
          bounties: { select: { id: true, budget: true } },
        },
      });
      const reportData = users.map(toReportRow);
      return NextResponse.json({
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        count: reportData.length,
        data: reportData,
      });
    }

    // CSV format: paginate by id cursor instead of loading every matching
    // user (and their bounties) into memory at once, so an unbounded date
    // range streams to the client instead of risking an OOM.
    const headers = [
      'username',
      'email',
      'role',
      'join_date',
      'bounty_count',
      'total_earned',
    ];

    const stream = createCsvStream<string>(headers, async (cursor) => {
      const batch = await prisma.user.findMany({
        where: dateWhere,
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          createdAt: true,
          bounties: { select: { id: true, budget: true } },
        },
        orderBy: { id: 'asc' },
        take: EXPORT_BATCH_SIZE,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });

      return {
        rows: batch.map(toReportRow),
        nextCursor: batch.length === EXPORT_BATCH_SIZE ? batch[batch.length - 1].id : null,
      };
    });

    return new NextResponse(stream, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="users-report.csv"',
      },
    });
  } catch (error) {
    console.error('Users export error:', error);

    await prisma.auditLog.create({
      data: {
        resource: 'admin_export',
        action: 'export_users',
        status: 'FAILURE',
        errorMessage: String(error),
        requestPath: req.nextUrl.pathname,
        httpMethod: 'GET',
      },
    }).catch(() => {}); // Ignore audit log errors

    return NextResponse.json(
      { error: 'Failed to export users report' },
      { status: 500 }
    );
  }
}
