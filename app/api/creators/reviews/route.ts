import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerSession } from '@/lib/auth/auth';
import { prisma } from '@/lib/db';

/**
 * POST /api/creators/reviews
 *
 * Create a review of a creator (issue #1608). Reviews must be tied to a
 * completed engagement between the reviewer and the creator being
 * reviewed, to prevent fake reviews from accounts that never actually
 * worked together:
 *
 *   - `bountyId` names the specific bounty the review is about
 *   - the caller (from the session) must be that bounty's poster
 *     (`Bounty.creatorId`)
 *   - the creator being reviewed must be the applicant whose application
 *     to that bounty was `ACCEPTED`
 *   - the bounty itself must be `COMPLETED`
 *
 * A review created through this constraint is automatically marked
 * `isVerifiedPurchase: true` ("verified" badge) — there is no path to
 * create an unverified review here, by design.
 */

const createReviewSchema = z.object({
  creatorId: z.string().min(1), // CreatorProfile.id being reviewed
  bountyId: z.string().min(1),
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().min(1).max(200),
  body: z.string().trim().min(1).max(5000),
});

export async function POST(req: NextRequest) {
  const session = await getServerSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const json = await req.json().catch(() => null);
  const parsed = createReviewSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid request', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const { creatorId, bountyId, rating, title, body } = parsed.data;

  const creatorProfile = await prisma.creatorProfile.findUnique({
    where: { id: creatorId },
    select: { id: true, userId: true, displayName: true },
  });
  if (!creatorProfile) {
    return NextResponse.json({ error: 'Creator not found' }, { status: 404 });
  }

  // The completed-engagement check: a bounty posted by the reviewer,
  // completed, with the creator's ACCEPTED application on it.
  const engagement = await prisma.bounty.findFirst({
    where: {
      id: bountyId,
      creatorId: session.user.id,
      status: 'COMPLETED',
      applications: {
        some: {
          applicantId: creatorProfile.userId,
          status: 'ACCEPTED',
        },
      },
    },
    select: { id: true },
  });

  if (!engagement) {
    return NextResponse.json(
      {
        error:
          'Reviews can only be left for a completed bounty where this creator\'s application was accepted and you posted the bounty',
      },
      { status: 403 },
    );
  }

  const reviewerName = session.user.name ?? 'Anonymous client';

  try {
    const review = await prisma.review.create({
      data: {
        creatorId: creatorProfile.id,
        reviewerId: session.user.id,
        reviewerName,
        rating,
        title,
        body,
        bountyId,
        isVerifiedPurchase: true,
        status: 'PENDING', // still goes through moderation before showing publicly
      },
    });
    return NextResponse.json(review, { status: 201 });
  } catch (error: unknown) {
    // Unique(reviewerId, bountyId) — already reviewed this engagement.
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: string }).code === 'P2002'
    ) {
      return NextResponse.json(
        { error: 'You have already reviewed this engagement' },
        { status: 409 },
      );
    }
    console.error('Review creation error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
