import { Badge } from '../../types';
import { evaluatorRegistry } from '../../services/BadgeEvaluators';
import { BadgeAwardService } from '../../services/badge/BadgeAwardService';
import { BadgeDefinitionService } from '../../services/badge/BadgeDefinitionService';
import { BadgeEvaluationService } from '../../services/badge/BadgeEvaluationService';
import { BadgeNotificationService } from '../../services/badge/BadgeNotificationService';
import { realtimePublisher } from '../../services/RealtimePublisher';
import { sendToUser } from '../../utils/websocket';

const mockQuery = jest.fn();

jest.mock('../../config/database', () => ({
  __esModule: true,
  default: {
    getInstance: () => ({ query: mockQuery }),
  },
}));
jest.mock('../../services/RealtimePublisher', () => ({
  realtimePublisher: {
    publishToUser: jest.fn(),
  },
}));
jest.mock('../../utils/websocket', () => ({
  sendToUser: jest.fn(),
}));
jest.mock('../../utils/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

const makeBadge = (overrides: Partial<Badge> = {}): Badge => ({
  id: 'badge-1',
  name: 'First Show',
  description: 'Attend your first show',
  iconUrl: 'https://images.example/badge.png',
  badgeType: 'checkin_count',
  requirementValue: 1,
  color: '#FF5500',
  criteria: { type: 'test_counter', threshold: 1 },
  createdAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const badgeRow = {
  id: 'badge-1',
  name: 'First Show',
  description: 'Attend your first show',
  icon_url: 'https://images.example/badge.png',
  badge_type: 'checkin_count',
  requirement_value: 1,
  color: '#FF5500',
  criteria: { type: 'checkin_count', threshold: 1 },
  created_at: '2026-01-01T00:00:00.000Z',
};

describe('BadgeAwardService duplicate-safe persistence', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockReset();
  });

  it('reports a new atomic badge insert and serializes its metadata', async () => {
    mockQuery.mockResolvedValue({ rows: [{ id: 'award-1' }], rowCount: 1 });

    await expect(
      new BadgeAwardService().awardBadge('user-1', 'badge-1', { bandId: 'band-1' })
    ).resolves.toEqual({
      success: true,
      wasNew: true,
      badgeId: 'badge-1',
      userId: 'user-1',
      metadata: { bandId: 'band-1' },
    });
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('ON CONFLICT'), [
      'user-1',
      'badge-1',
      '{"bandId":"band-1"}',
    ]);
    expect(mockQuery.mock.calls[0][0]).toContain('RETURNING id');
  });

  it('reports a duplicate award without treating it as an error', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });

    await expect(new BadgeAwardService().awardBadge('user-1', 'badge-1')).resolves.toEqual({
      success: true,
      wasNew: false,
      badgeId: 'badge-1',
      userId: 'user-1',
      metadata: undefined,
    });
    expect(mockQuery).toHaveBeenCalledWith(expect.any(String), ['user-1', 'badge-1', '{}']);
  });

  it('returns a failed result when persistence is unavailable', async () => {
    mockQuery.mockRejectedValue(new Error('database unavailable'));

    await expect(new BadgeAwardService().awardBadge('user-1', 'badge-1')).resolves.toEqual({
      success: false,
      wasNew: false,
      badgeId: 'badge-1',
      userId: 'user-1',
      error: 'database unavailable',
    });
  });

  it('awards a batch independently and preserves its input order', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: 'award-1' }] })
      .mockResolvedValueOnce({ rows: [] });

    const results = await new BadgeAwardService().awardBadgesBatch('user-1', [
      { badgeId: 'badge-1' },
      { badgeId: 'badge-2', metadata: { count: 5 } },
    ]);

    expect(results.map(({ badgeId, wasNew }) => ({ badgeId, wasNew }))).toEqual([
      { badgeId: 'badge-1', wasNew: true },
      { badgeId: 'badge-2', wasNew: false },
    ]);
  });

  it('awards an evaluated badge by its canonical ID', async () => {
    mockQuery.mockResolvedValue({ rows: [{ id: 'award-1' }] });

    const result = await new BadgeAwardService().awardBadgeFromEvaluation('user-1', makeBadge(), {
      current: 1,
    });

    expect(result.wasNew).toBe(true);
    expect(mockQuery).toHaveBeenCalledWith(expect.any(String), [
      'user-1',
      'badge-1',
      '{"current":1}',
    ]);
  });

  it.each([
    [1, true],
    [0, false],
  ])('reports badge removal rowCount %d as %s', async (rowCount, expected) => {
    mockQuery.mockResolvedValue({ rows: [], rowCount });

    await expect(new BadgeAwardService().removeBadge('user-1', 'badge-1')).resolves.toBe(expected);
  });

  it('contains badge removal failures', async () => {
    mockQuery.mockRejectedValue(new Error('delete failed'));

    await expect(new BadgeAwardService().removeBadge('user-1', 'badge-1')).resolves.toBe(false);
  });

  it('maps award history and badge earners to public field names', async () => {
    const earnedAt = new Date('2026-07-27T00:00:00Z');
    mockQuery
      .mockResolvedValueOnce({
        rows: [{ badge_id: 'badge-1', earned_at: earnedAt, metadata: { count: 1 } }],
      })
      .mockResolvedValueOnce({
        rows: [{ user_id: 'user-1', earned_at: earnedAt, metadata: { count: 1 } }],
      });
    const service = new BadgeAwardService();

    await expect(service.getUserAwardHistory('user-1')).resolves.toEqual([
      { badgeId: 'badge-1', earnedAt, metadata: { count: 1 } },
    ]);
    await expect(service.getBadgeEarners('badge-1')).resolves.toEqual([
      { userId: 'user-1', earnedAt, metadata: { count: 1 } },
    ]);
  });

  it.each([
    [[{ '?column?': 1 }], true],
    [[], false],
  ])('detects an existing award from rows %#', async (rows, expected) => {
    mockQuery.mockResolvedValue({ rows });

    await expect(new BadgeAwardService().wouldBeDuplicate('user-1', 'badge-1')).resolves.toBe(
      expected
    );
  });

  it('updates badge award metadata and reports whether a row changed', async () => {
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });

    await expect(
      new BadgeAwardService().updateAwardMetadata('user-1', 'badge-1', { band: 'The Band' })
    ).resolves.toBe(true);
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('UPDATE user_badges'), [
      'user-1',
      'badge-1',
      '{"band":"The Band"}',
    ]);
  });

  it('contains badge metadata update failures', async () => {
    mockQuery.mockRejectedValue(new Error('update failed'));

    await expect(
      new BadgeAwardService().updateAwardMetadata('user-1', 'badge-1', {})
    ).resolves.toBe(false);
  });
});

describe('BadgeDefinitionService public models', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockQuery.mockReset();
  });

  it('maps all badge definitions and a requested definition', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [badgeRow] })
      .mockResolvedValueOnce({ rows: [badgeRow] });
    const service = new BadgeDefinitionService();

    await expect(service.getAllBadges()).resolves.toEqual([
      {
        id: 'badge-1',
        name: 'First Show',
        description: 'Attend your first show',
        iconUrl: 'https://images.example/badge.png',
        badgeType: 'checkin_count',
        requirementValue: 1,
        color: '#FF5500',
        criteria: { type: 'checkin_count', threshold: 1 },
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
    await expect(service.getBadgeById('badge-1')).resolves.toMatchObject({
      id: 'badge-1',
      badgeType: 'checkin_count',
    });
  });

  it('returns null for an unknown badge', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await expect(new BadgeDefinitionService().getBadgeById('missing')).resolves.toBeNull();
  });

  it('maps earned badges with their award identity and definition', async () => {
    const earnedAt = '2026-07-27T00:00:00.000Z';
    mockQuery.mockResolvedValue({
      rows: [{ ...badgeRow, user_id: 'user-1', badge_id: 'badge-1', earned_at: earnedAt }],
    });

    await expect(new BadgeDefinitionService().getUserBadges('user-1')).resolves.toEqual([
      {
        id: 'badge-1',
        userId: 'user-1',
        badgeId: 'badge-1',
        earnedAt,
        badge: expect.objectContaining({ id: 'badge-1', name: 'First Show' }),
      },
    ]);
  });

  it.each([
    [[{ '?column?': 1 }], true],
    [[], false],
  ])('reports whether a user owns a badge from rows %#', async (rows, expected) => {
    mockQuery.mockResolvedValue({ rows });
    await expect(new BadgeDefinitionService().userHasBadge('user-1', 'badge-1')).resolves.toBe(
      expected
    );
  });

  it('normalizes rarity counts returned as database strings', async () => {
    mockQuery.mockResolvedValue({
      rows: [
        {
          id: 'badge-1',
          name: 'First Show',
          category: 'checkin_count',
          requirement_value: 1,
          earned_count: '5',
          total_users: '20',
          rarity_pct: '25.0',
        },
      ],
    });

    await expect(new BadgeDefinitionService().getBadgeRarity()).resolves.toEqual([
      {
        badgeId: 'badge-1',
        name: 'First Show',
        category: 'checkin_count',
        threshold: 1,
        earnedCount: 5,
        totalUsers: 20,
        rarityPct: 25,
      },
    ]);
  });

  it('groups leaderboard rows into one user with recent badges', async () => {
    mockQuery.mockResolvedValue({
      rows: [
        {
          id: 'user-1',
          username: 'alice',
          first_name: 'Alice',
          last_name: 'A',
          profile_image_url: null,
          badge_count: '2',
          recent_badge_id: 'badge-1',
          recent_badge_name: 'First Show',
          recent_badge_type: 'checkin_count',
          recent_badge_requirement_value: 1,
          recent_badge_created_at: '2026-01-01T00:00:00Z',
        },
        {
          id: 'user-1',
          username: 'alice',
          first_name: 'Alice',
          last_name: 'A',
          profile_image_url: null,
          badge_count: '2',
          recent_badge_id: 'badge-2',
          recent_badge_name: 'Five Shows',
          recent_badge_type: 'checkin_count',
          recent_badge_requirement_value: 5,
          recent_badge_created_at: '2026-02-01T00:00:00Z',
        },
        {
          id: 'user-2',
          username: 'bob',
          badge_count: '1',
          recent_badge_id: null,
        },
      ],
    });

    const result = await new BadgeDefinitionService().getBadgeLeaderboard(10);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      user: { id: 'user-1', username: 'alice' },
      badgeCount: 2,
    });
    expect(result[0].recentBadges.map((badge) => badge.id)).toEqual(['badge-1', 'badge-2']);
    expect(result[1].recentBadges).toEqual([]);
  });

  it('creates a badge using nullable optional fields and JSON criteria', async () => {
    mockQuery.mockResolvedValue({ rows: [badgeRow] });

    const result = await new BadgeDefinitionService().createBadge({
      name: 'First Show',
      description: 'Attend your first show',
      iconUrl: 'https://images.example/badge.png',
      badgeType: 'checkin_count',
      requirementValue: 1,
      color: '#FF5500',
      criteria: { type: 'checkin_count', threshold: 1 },
    });

    expect(result.id).toBe('badge-1');
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO badges'), [
      'First Show',
      'Attend your first show',
      'https://images.example/badge.png',
      'checkin_count',
      1,
      '#FF5500',
      '{"type":"checkin_count","threshold":1}',
    ]);
  });

  it('updates only allowed badge fields and JSON-encodes criteria', async () => {
    mockQuery.mockResolvedValue({ rows: [{ ...badgeRow, name: 'Updated' }] });

    const result = await new BadgeDefinitionService().updateBadge('badge-1', {
      name: 'Updated',
      criteria: { type: 'checkin_count', threshold: 2 },
    });

    expect(result?.name).toBe('Updated');
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining('name = $1, criteria = $2'), [
      'Updated',
      '{"type":"checkin_count","threshold":2}',
      'badge-1',
    ]);
  });

  it('rejects an update without mutable fields', async () => {
    await expect(new BadgeDefinitionService().updateBadge('badge-1', {})).rejects.toThrow(
      'No valid fields to update'
    );
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('returns null when an updated badge no longer exists', async () => {
    mockQuery.mockResolvedValue({ rows: [] });
    await expect(
      new BadgeDefinitionService().updateBadge('missing', { name: 'Updated' })
    ).resolves.toBeNull();
  });

  it.each([
    [1, true],
    [0, false],
  ])('reports delete rowCount %d as %s', async (rowCount, expected) => {
    mockQuery.mockResolvedValue({ rows: [], rowCount });
    await expect(new BadgeDefinitionService().deleteBadge('badge-1')).resolves.toBe(expected);
  });
});

describe('BadgeEvaluationService qualification and progress', () => {
  const priorTestEvaluator = evaluatorRegistry.get('test_counter');
  const priorUnknownEvaluator = evaluatorRegistry.get('test_failure');
  let counterEvaluator: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    counterEvaluator = jest.fn().mockResolvedValue({
      current: 5,
      target: 10,
      earned: false,
      metadata: { source: 'checkins' },
    });
    evaluatorRegistry.set('test_counter', counterEvaluator);
    evaluatorRegistry.set('test_failure', jest.fn().mockRejectedValue(new Error('query failed')));
  });

  afterAll(() => {
    if (priorTestEvaluator) evaluatorRegistry.set('test_counter', priorTestEvaluator);
    else evaluatorRegistry.delete('test_counter');
    if (priorUnknownEvaluator) evaluatorRegistry.set('test_failure', priorUnknownEvaluator);
    else evaluatorRegistry.delete('test_failure');
  });

  it('marks a badge earned at its explicit criteria threshold', async () => {
    counterEvaluator.mockResolvedValue({
      current: 5,
      target: 5,
      earned: true,
      metadata: { showCount: 5 },
    });
    const badge = makeBadge({ criteria: { type: 'test_counter', threshold: 5 } });

    await expect(new BadgeEvaluationService().evaluate('user-1', badge)).resolves.toEqual({
      badge,
      earned: true,
      currentValue: 5,
      threshold: 5,
      metadata: { showCount: 5 },
    });
  });

  it.each([
    [makeBadge({ criteria: undefined }), 1],
    [makeBadge({ criteria: { type: 'unknown' }, requirementValue: 4 }), 4],
    [makeBadge({ criteria: { type: 'test_failure' }, requirementValue: 3 }), 3],
  ])('degrades an unevaluable badge to zero progress', async (badge, threshold) => {
    await expect(new BadgeEvaluationService().evaluate('user-1', badge)).resolves.toEqual({
      badge,
      earned: false,
      currentValue: 0,
      threshold,
    });
  });

  it('evaluates one shared counter once for multiple badge tiers', async () => {
    const first = makeBadge({
      id: 'badge-1',
      requirementValue: 1,
      criteria: { type: 'test_counter', threshold: 1 },
    });
    const tenth = makeBadge({
      id: 'badge-10',
      requirementValue: 10,
      criteria: { type: 'test_counter', threshold: 10 },
    });

    const results = await new BadgeEvaluationService().evaluateMany('user-1', [first, tenth]);

    expect(counterEvaluator).toHaveBeenCalledTimes(1);
    expect(results).toEqual([
      {
        badge: first,
        earned: true,
        currentValue: 5,
        threshold: 1,
        metadata: { source: 'checkins' },
      },
      {
        badge: tenth,
        earned: false,
        currentValue: 5,
        threshold: 10,
        metadata: undefined,
      },
    ]);
  });

  it('evaluates road-warrior city and state badges with their own field', async () => {
    const fieldEvaluator = jest.fn().mockResolvedValue({ current: 6, target: 5, earned: true });
    evaluatorRegistry.set('road_warrior', fieldEvaluator);
    const city = makeBadge({
      id: 'badge-city',
      criteria: { type: 'road_warrior', field: 'city', threshold: 5 },
    });
    const state = makeBadge({
      id: 'badge-state',
      criteria: { type: 'road_warrior', field: 'state', threshold: 5 },
    });

    const results = await new BadgeEvaluationService().evaluateMany('user-1', [city, state]);

    expect(fieldEvaluator).toHaveBeenCalledTimes(2);
    expect(fieldEvaluator).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ field: 'city' })
    );
    expect(fieldEvaluator).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ field: 'state' })
    );
    expect(results.map((result) => result.badge.id).sort()).toEqual(['badge-city', 'badge-state']);
    evaluatorRegistry.delete('road_warrior');
  });

  it('fails the job when a badge does not match its evaluation group', async () => {
    const { assertEvaluationGroup } = await import('../../services/badge/badgeGroups');
    expect(() =>
      assertEvaluationGroup('type=road_warrior|field=city', [
        makeBadge({
          id: 'badge-state',
          criteria: { type: 'road_warrior', field: 'state', threshold: 5 },
        }),
      ])
    ).toThrow(
      "Badge badge-state criteria do not match evaluation group 'type=road_warrior|field=city'"
    );
  });

  it('returns no evaluations for an empty badge list', async () => {
    await expect(new BadgeEvaluationService().evaluateMany('user-1', [])).resolves.toEqual([]);
    expect(counterEvaluator).not.toHaveBeenCalled();
  });

  it('isolates an evaluator failure to its group and preserves no-criteria badges', async () => {
    const failing = makeBadge({
      id: 'badge-failing',
      requirementValue: 3,
      criteria: { type: 'test_failure', threshold: 3 },
    });
    const manual = makeBadge({ id: 'badge-manual', requirementValue: 1, criteria: undefined });

    await expect(
      new BadgeEvaluationService().evaluateMany('user-1', [failing, manual])
    ).resolves.toEqual([
      {
        badge: failing,
        earned: false,
        currentValue: 0,
        threshold: 3,
      },
      {
        badge: manual,
        earned: false,
        currentValue: 0,
        threshold: 1,
      },
    ]);
  });

  it('calculates bounded progress and preserves already-earned state', async () => {
    counterEvaluator.mockResolvedValue({ current: 15, target: 10, earned: true });
    const counted = makeBadge({
      id: 'badge-counted',
      criteria: { type: 'test_counter', threshold: 10 },
    });
    const manual = makeBadge({ id: 'badge-manual', criteria: undefined });

    await expect(
      new BadgeEvaluationService().getUserBadgeProgress(
        'user-1',
        [counted, manual],
        new Set(['badge-counted', 'badge-manual'])
      )
    ).resolves.toEqual([
      { badge: counted, progress: 100, isEarned: true },
      { badge: manual, progress: 100, isEarned: true },
    ]);
  });

  it('uses earned state as fallback when a progress evaluator fails', async () => {
    const badge = makeBadge({
      id: 'badge-failing',
      requirementValue: 3,
      criteria: { type: 'test_failure', threshold: 3 },
    });

    await expect(
      new BadgeEvaluationService().getUserBadgeProgress(
        'user-1',
        [badge],
        new Set(['badge-failing'])
      )
    ).resolves.toEqual([{ badge, progress: 100, isEarned: true }]);
  });

  it('identifies eligible badges through the grouped evaluator path', async () => {
    const badge = makeBadge();
    await expect(
      new BadgeEvaluationService().identifyEligibleBadges('user-1', [badge])
    ).resolves.toEqual([
      {
        badge,
        earned: true,
        currentValue: 5,
        threshold: 1,
        metadata: { source: 'checkins' },
      },
    ]);
  });
});

describe('BadgeNotificationService retryable side effects', () => {
  let createNotification: jest.Mock;
  const mockPublishToUser = realtimePublisher.publishToUser as jest.Mock;
  const mockSendToUser = sendToUser as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    createNotification = jest.fn().mockResolvedValue({ id: 'notification-1' });
    mockPublishToUser.mockResolvedValue(true);
  });

  it('persists and publishes a newly earned badge', async () => {
    const badge = makeBadge();
    const service = new BadgeNotificationService({ createNotification } as any);

    await expect(service.notifyBadgeEarned('user-1', badge)).resolves.toEqual({
      badgeId: 'badge-1',
      userId: 'user-1',
      dbNotificationSent: true,
      websocketSent: true,
      error: undefined,
    });
    expect(createNotification).toHaveBeenCalledWith({
      userId: 'user-1',
      type: 'badge_earned',
      title: 'Badge Earned: First Show',
      message: 'Attend your first show',
      badgeId: 'badge-1',
    });
    expect(mockPublishToUser).toHaveBeenCalledWith('user-1', 'badge_earned', {
      badgeId: 'badge-1',
      badgeName: 'First Show',
      badgeColor: '#FF5500',
      badgeIconUrl: 'https://images.example/badge.png',
    });
    expect(mockSendToUser).not.toHaveBeenCalled();
  });

  it('falls back to local WebSocket delivery when cross-instance publication is unavailable', async () => {
    mockPublishToUser.mockResolvedValue(false);
    const service = new BadgeNotificationService({ createNotification } as any);

    const result = await service.notifyBadgeEarned('user-1', makeBadge());

    expect(result.websocketSent).toBe(true);
    expect(mockSendToUser).toHaveBeenCalledWith(
      'user-1',
      'badge_earned',
      expect.objectContaining({ badgeId: 'badge-1' })
    );
  });

  it('reports persistence degradation while still delivering real-time notification', async () => {
    createNotification.mockRejectedValue(new Error('notification database unavailable'));
    const service = new BadgeNotificationService({ createNotification } as any);

    await expect(service.notifyBadgeEarned('user-1', makeBadge())).resolves.toMatchObject({
      dbNotificationSent: false,
      websocketSent: true,
      error: 'notification database unavailable',
    });
  });

  it('reports WebSocket degradation without erasing the persistent notification', async () => {
    mockPublishToUser.mockRejectedValue(new Error('realtime unavailable'));
    const service = new BadgeNotificationService({ createNotification } as any);

    await expect(service.notifyBadgeEarned('user-1', makeBadge())).resolves.toMatchObject({
      dbNotificationSent: true,
      websocketSent: false,
      error: 'realtime unavailable',
    });
  });

  it('notifies a badge batch independently and in order', async () => {
    const service = new BadgeNotificationService({ createNotification } as any);

    const results = await service.notifyBadgesEarned('user-1', [
      makeBadge(),
      makeBadge({ id: 'badge-2', name: 'Five Shows' }),
    ]);

    expect(results.map((result) => result.badgeId)).toEqual(['badge-1', 'badge-2']);
    expect(createNotification).toHaveBeenCalledTimes(2);
  });

  it.each([
    [true, true, 0],
    [false, true, 1],
  ])(
    'reports realtime publication %s as success and uses local fallback %d time(s)',
    async (published, expected, localCalls) => {
      mockPublishToUser.mockResolvedValue(published);
      const service = new BadgeNotificationService({ createNotification } as any);

      await expect(service.sendRealtimeNotification('user-1', makeBadge())).resolves.toBe(expected);
      expect(mockSendToUser).toHaveBeenCalledTimes(localCalls);
    }
  );

  it('returns false when realtime delivery throws', async () => {
    mockPublishToUser.mockRejectedValue(new Error('realtime unavailable'));
    const service = new BadgeNotificationService({ createNotification } as any);

    await expect(service.sendRealtimeNotification('user-1', makeBadge())).resolves.toBe(false);
  });

  it.each([
    [false, true],
    [true, false],
  ])('reports persistent notification failure=%s as %s', async (failure, expected) => {
    if (failure) createNotification.mockRejectedValue(new Error('database unavailable'));
    const service = new BadgeNotificationService({ createNotification } as any);

    await expect(service.sendPersistentNotification('user-1', makeBadge())).resolves.toBe(expected);
  });
});
