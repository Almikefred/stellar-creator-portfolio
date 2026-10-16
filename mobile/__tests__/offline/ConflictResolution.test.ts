import {
  entityFromEndpoint,
  getConflictStrategy,
  resolveConflict,
  resolveOperationConflict,
} from '../../src/offline/ConflictResolution';

describe('entityFromEndpoint', () => {
  it('extracts a singular entity name from a plural, versioned path', () => {
    expect(entityFromEndpoint('/api/v1/profiles/42')).toBe('profile');
    expect(entityFromEndpoint('/api/v1/portfolio-items/9')).toBe('portfolio-item');
  });

  it('leaves settings as-is (no singular form)', () => {
    expect(entityFromEndpoint('/api/v1/settings')).toBe('settings');
  });

  it('ignores query strings', () => {
    expect(entityFromEndpoint('/api/v1/ratings/1?expand=user')).toBe('rating');
  });
});

describe('getConflictStrategy', () => {
  it('returns merge for multi-field resources', () => {
    expect(getConflictStrategy('profile')).toBe('merge');
    expect(getConflictStrategy('portfolio')).toBe('merge');
  });

  it('returns last-write-wins for transactional resources', () => {
    expect(getConflictStrategy('escrow')).toBe('last-write-wins');
    expect(getConflictStrategy('payment')).toBe('last-write-wins');
  });

  it('defaults unlisted entities to last-write-wins', () => {
    expect(getConflictStrategy('some-future-entity')).toBe('last-write-wins');
  });
});

describe('resolveConflict — last-write-wins', () => {
  it('keeps the local write when it is newer than the server', () => {
    const local = { name: 'Local Name', localUpdatedAt: '2026-01-02T00:00:00Z' };
    const remote = { name: 'Remote Name', updatedAt: '2026-01-01T00:00:00Z' };

    expect(resolveConflict(local, remote, 'last-write-wins')).toBe(local);
  });

  it('takes the server value when it is newer than the local write', () => {
    const local = { name: 'Local Name', localUpdatedAt: '2026-01-01T00:00:00Z' };
    const remote = { name: 'Remote Name', updatedAt: '2026-01-02T00:00:00Z' };

    expect(resolveConflict(local, remote, 'last-write-wins')).toBe(remote);
  });

  it('falls back to the local write when timestamps cannot be compared', () => {
    const local = { name: 'Local Name' };
    const remote = { name: 'Remote Name' };

    expect(resolveConflict(local, remote, 'last-write-wins')).toBe(local);
  });
});

describe('resolveConflict — merge', () => {
  it('overlays only the changed fields onto the server object', () => {
    const local = { bio: 'new bio', avatarUrl: 'old-avatar.png' };
    const remote = { bio: 'old bio', avatarUrl: 'new-avatar.png', displayName: 'Unchanged' };

    const merged = resolveConflict(local, remote, 'merge', ['bio']);

    expect(merged).toEqual({
      bio: 'new bio', // local write wins — it's the field that actually changed
      avatarUrl: 'new-avatar.png', // kept from server — local didn't touch this
      displayName: 'Unchanged',
    });
  });

  it('defaults to every local field when changedFields is omitted', () => {
    const local = { bio: 'new bio', avatarUrl: 'local-avatar.png' };
    const remote = { bio: 'old bio', avatarUrl: 'remote-avatar.png', displayName: 'Unchanged' };

    const merged = resolveConflict(local, remote, 'merge');

    expect(merged).toEqual({
      bio: 'new bio',
      avatarUrl: 'local-avatar.png',
      displayName: 'Unchanged',
    });
  });
});

describe('resolveOperationConflict', () => {
  it('resolves using the policy for the operation endpoint entity', () => {
    const op = {
      endpoint: '/api/v1/profiles/42',
      payload: { bio: 'new bio' },
      changedFields: ['bio'] as const,
      localUpdatedAt: undefined,
    };
    const remote = { bio: 'old bio', avatarUrl: 'remote-avatar.png' };

    expect(resolveOperationConflict(op, remote)).toEqual({
      bio: 'new bio',
      avatarUrl: 'remote-avatar.png',
    });
  });

  it('uses last-write-wins for transactional entities', () => {
    const op = {
      endpoint: '/api/v1/escrows/7',
      payload: { amount: 100, localUpdatedAt: '2026-01-01T00:00:00Z' },
      changedFields: undefined,
      localUpdatedAt: '2026-01-01T00:00:00Z',
    };
    const remote = { amount: 150, updatedAt: '2026-01-02T00:00:00Z' };

    // Server is newer -> server wins outright for a last-write-wins entity.
    expect(resolveOperationConflict(op, remote)).toBe(remote);
  });
});
