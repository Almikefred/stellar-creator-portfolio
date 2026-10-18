import { NextRequest, NextResponse } from 'next/server'
import { searchSkillsWithSynonyms } from '@/lib/skills-taxonomy-admin'

// No longer `edge` (#1617): matching now also queries admin-added skills
// and synonyms via Prisma, which needs the Node runtime.

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const q = searchParams.get('q') ?? ''
  const limit = Math.min(parseInt(searchParams.get('limit') ?? '8', 10), 20)

  const skills = await searchSkillsWithSynonyms(q, limit)
  return NextResponse.json({ skills, total: skills.length, query: q })
}
