import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth/auth';
import { prisma } from '@/lib/prisma';
import { checkRateLimit } from '@/lib/rate-limit';
import { createCsvStream } from '@/lib/export-utils';

const EXPORT_BATCH_SIZE = 500;

/**
 * GET /api/admin/reports/bounties?startDate=...&endDate=...&format=csv
 *
 * Streams bounty report with columns:
 * title, budget, status, applicant_count, creator, created_at, updated_at
 *
 * Requires admin role. Rate limited to 3 exports per hour.
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession();

    if (!session?.user?.id || session.user.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Unauthorized: Admin role required' },
        { status: 403 }
      );
    }

    const userId = session.user.id;

    if (!checkRateLimit(userId)) {
      return NextResponse.json(
        { error: 'Rate limited: Maximum 3 exports per hour' },
        { status: 429 }
      );
    }

    const { searchParams } = req.nextUrl;
    const startDateStr = searchParams.get('startDate');
    const endDateStr = searchParams.get('endDate');
    const format = searchParams.get('format') || 'csv';

    const startDate = startDateStr ? new Date(startDateStr) : new Date('2000-01-01');
    const endDate = endDateStr ? new Date(endDateStr) : new Date();

    await prisma.auditLog.create({
      data: {
        userId,
        resource: 'admin_export',
        action: 'export_bounties',
        status: 'SUCCESS',
        requestPath: req.nextUrl.pathname,
        httpMethod: 'GET',
      },
    });

    const dateWhere = { createdAt: { gte: startDate, lte: endDate } };
    const toReportRow = (bounty: {
      title: string;
      budget: number;
      status: string;
      createdAt: Date;
      updatedAt: Date;
      creator: { name: string | null };
      applications: { id: string }[];
    }) => ({
      title: bounty.title,
      budget: bounty.budget,
      status: bounty.status,
      applicant_count: bounty.applications.length,
      creator: bounty.creator.name || 'Unknown',
      created_at: bounty.createdAt.toISOString().split('T')[0],
      updated_at: bounty.updatedAt.toISOString().split('T')[0],
    });

    // JSON format is unchanged (single findMany). The CSV path below is
    // the one meant for bulk export of an unbounded date range, so that's
    // where the "doesn't OOM" fix applies.
    if (format === 'json') {
      const bounties = await prisma.bounty.findMany({
        where: dateWhere,
        include: {
          creator: { select: { name: true } },
          applications: { select: { id: true } },
        },
      });
      const reportData = bounties.map(toReportRow);
      return NextResponse.json({
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        count: reportData.length,
        data: reportData,
      });
    }

    const headers = [
      'title',
      'budget',
      'status',
      'applicant_count',
      'creator',
      'created_at',
      'updated_at',
    ];

    // Paginate by id cursor instead of loading every matching bounty (plus
    // its creator/applications) into memory at once.
    const stream = createCsvStream<string>(headers, async (cursor) => {
      const batch = await prisma.bounty.findMany({
        where: dateWhere,
        include: {
          creator: { select: { name: true } },
          applications: { select: { id: true } },
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
        'Content-Disposition': 'attachment; filename="bounties-report.csv"',
      },
    });
  } catch (error) {
    console.error('Bounties export error:', error);

    await prisma.auditLog.create({
      data: {
        resource: 'admin_export',
        action: 'export_bounties',
        status: 'FAILURE',
        errorMessage: String(error),
        requestPath: req.nextUrl.pathname,
        httpMethod: 'GET',
      },
    }).catch(() => {});

    return NextResponse.json(
      { error: 'Failed to export bounties report' },
      { status: 500 }
    );
  }
}
