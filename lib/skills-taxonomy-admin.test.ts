import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => ({
  prisma: {
    adminSkill: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
    skillSynonym: {
      findMany: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
    },
  },
}));

import { prisma } from '@/lib/prisma';
import {
  addSynonym,
  createAdminSkill,
  isValidSkillCategory,
  isValidSkillId,
  searchSkillsWithSynonyms,
} from './skills-taxonomy-admin';

describe('isValidSkillId', () => {
  it('accepts lowercase hyphenated slugs', () => {
    expect(isValidSkillId('zig')).toBe(true);
    expect(isValidSkillId('move-lang')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isValidSkillId('Zig')).toBe(false);
    expect(isValidSkillId('move_lang')).toBe(false);
    expect(isValidSkillId('has space')).toBe(false);
    expect(isValidSkillId('')).toBe(false);
  });
});

describe('isValidSkillCategory', () => {
  it('accepts the known categories only', () => {
    expect(isValidSkillCategory('Languages')).toBe(true);
    expect(isValidSkillCategory('NotACategory')).toBe(false);
  });
});

describe('createAdminSkill', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects a skillId already in the built-in taxonomy', async () => {
    await expect(
      createAdminSkill({ skillId: 'rust', name: 'Rust', category: 'Languages' }),
    ).rejects.toThrow(/already exists in the built-in taxonomy/);
    expect(prisma.adminSkill.create).not.toHaveBeenCalled();
  });

  it('creates a genuinely new skill', async () => {
    vi.mocked(prisma.adminSkill.create).mockResolvedValue({
      id: 'id-1',
      skillId: 'zig',
      name: 'Zig',
      category: 'Languages',
      aliases: ['ziglang'],
    } as any);

    const skill = await createAdminSkill({
      skillId: 'zig',
      name: 'Zig',
      category: 'Languages',
      aliases: ['ziglang'],
    });

    expect(skill.skillId).toBe('zig');
    expect(prisma.adminSkill.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ skillId: 'zig' }) }),
    );
  });
});

describe('addSynonym', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects a synonym for an unknown skill', async () => {
    vi.mocked(prisma.adminSkill.findUnique).mockResolvedValue(null);

    await expect(
      addSynonym({ skillId: 'not-a-real-skill', synonym: 'nrs' }),
    ).rejects.toThrow(/Unknown skill/);
  });

  it('attaches to a built-in skill without creating an AdminSkill row', async () => {
    vi.mocked(prisma.skillSynonym.create).mockResolvedValue({
      id: 's-1',
      skillId: 'rust',
      adminSkillId: null,
      synonym: 'rustlang',
    } as any);

    await addSynonym({ skillId: 'rust', synonym: 'rustlang' });

    expect(prisma.skillSynonym.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ skillId: 'rust', adminSkillId: null, synonym: 'rustlang' }),
    });
  });

  it('attaches to an admin-added skill and sets adminSkillId for cascade delete', async () => {
    vi.mocked(prisma.adminSkill.findUnique).mockResolvedValue({
      skillId: 'zig',
      name: 'Zig',
      category: 'Languages',
      aliases: [],
    } as any);
    vi.mocked(prisma.skillSynonym.create).mockResolvedValue({} as any);

    await addSynonym({ skillId: 'zig', synonym: 'ziglang' });

    expect(prisma.skillSynonym.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ skillId: 'zig', adminSkillId: 'zig', synonym: 'ziglang' }),
    });
  });
});

describe('searchSkillsWithSynonyms (#1617 acceptance: search for synonym returns matches)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns a skill matched only via an admin-added synonym', async () => {
    vi.mocked(prisma.adminSkill.findMany).mockResolvedValue([]);
    vi.mocked(prisma.skillSynonym.findMany).mockResolvedValue([
      { id: 's-1', skillId: 'rust', adminSkillId: null, synonym: 'ferris', createdAt: new Date() } as any,
    ]);

    // "ferris" (Rust's mascot name) doesn't match the built-in name/aliases
    // for "rust" at all — only the admin-added synonym does.
    const results = await searchSkillsWithSynonyms('ferris');

    expect(results).toHaveLength(1);
    expect(results[0].id).toBe('rust');
  });

  it('ranks a direct name/alias match ahead of a synonym match', async () => {
    vi.mocked(prisma.adminSkill.findMany).mockResolvedValue([]);
    vi.mocked(prisma.skillSynonym.findMany).mockResolvedValue([
      { id: 's-1', skillId: 'go', adminSkillId: null, synonym: 'rustacean', createdAt: new Date() } as any,
    ]);

    const results = await searchSkillsWithSynonyms('rust');

    expect(results[0].id).toBe('rust'); // direct name match, ranked first
    expect(results.some((s) => s.id === 'go')).toBe(true); // via the synonym
  });

  it('does not duplicate a skill already matched by name/alias', async () => {
    vi.mocked(prisma.adminSkill.findMany).mockResolvedValue([]);
    vi.mocked(prisma.skillSynonym.findMany).mockResolvedValue([
      { id: 's-1', skillId: 'rust', adminSkillId: null, synonym: 'rust-lang', createdAt: new Date() } as any,
    ]);

    const results = await searchSkillsWithSynonyms('rust');
    expect(results.filter((s) => s.id === 'rust')).toHaveLength(1);
  });

  it('returns [] for an empty query without touching the database', async () => {
    const results = await searchSkillsWithSynonyms('   ');
    expect(results).toEqual([]);
    expect(prisma.adminSkill.findMany).not.toHaveBeenCalled();
  });
});
