import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from '@/lib/auth/auth';
import { prisma } from '@/lib/prisma';
import { checkRateLimit } from '@/lib/rate-limit';
import { createCsvStream } from '@/lib/export-utils';

const EXPORT_BATCH_SIZE = 500;

/**
 * GET /api/admin/reports/disputes?startDate=...&endDate=...&format=csv
 *
 * Streams dispute report with columns:
 * id, status, resolution, parties, created_at, resolved_at
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
        action: 'export_disputes',
        status: 'SUCCESS',
        requestPath: req.nextUrl.pathname,
        httpMethod: 'GET',
      },
    });

    const dateWhere = { createdAt: { gte: startDate, lte: endDate } };
    const toReportRow = (dispute: {
      id: string;
      status: string;
      reason: string | null;
      creatorId: string;
      clientId: string;
      createdAt: Date;
      updatedAt: Date;
    }) => ({
      id: dispute.id,
      status: dispute.status,
      resolution: dispute.reason || 'Pending',
      parties: `${dispute.creatorId}, ${dispute.clientId}`,
      created_at: dispute.createdAt.toISOString().split('T')[0],
      resolved_at: dispute.updatedAt.toISOString().split('T')[0],
    });

    // JSON format is unchanged (single findMany). The CSV path below is
    // the one meant for bulk export of an unbounded date range, so that's
    // where the "doesn't OOM" fix applies.
    if (format === 'json') {
      const disputes = await prisma.dispute.findMany({ where: dateWhere });
      const reportData = disputes.map(toReportRow);
      return NextResponse.json({
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        count: reportData.length,
        data: reportData,
      });
    }

    const headers = ['id', 'status', 'resolution', 'parties', 'created_at', 'resolved_at'];

    // Paginate by id cursor instead of loading every matching dispute into
    // memory at once.
    const stream = createCsvStream<string>(headers, async (cursor) => {
      const batch = await prisma.dispute.findMany({
        where: dateWhere,
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
        'Content-Disposition': 'attachment; filename="disputes-report.csv"',
      },
    });
  } catch (error) {
    console.error('Disputes export error:', error);

    await prisma.auditLog.create({
      data: {
        resource: 'admin_export',
        action: 'export_disputes',
        status: 'FAILURE',
        errorMessage: String(error),
        requestPath: req.nextUrl.pathname,
        httpMethod: 'GET',
      },
    }).catch(() => {});

    return NextResponse.json(
      { error: 'Failed to export disputes report' },
      { status: 500 }
    );
  }
}
