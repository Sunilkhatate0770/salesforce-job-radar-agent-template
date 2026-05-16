import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildCodePracticeAttempt,
  buildCodePracticeEvaluationResponse,
  buildCodePracticeFilesText,
  createCustomCodePracticeChallenge,
  filterCodePracticeChallenges,
  getCodePracticeChallenge,
  normalizeCodePracticeFiles,
  parseCodePracticeAiReview,
  runCodePracticeChecks
} from '../src/services/codePracticeService.js';

const catalog = {
  version: 'test',
  challenges: [
    {
      id: 'apex-1',
      title: 'Bulk Apex',
      track: 'salesforce',
      experienceLevels: [3, 4],
      designations: ['Developer'],
      staticChecks: [
        { id: 'has-loop', label: 'Uses loop', file: 'Class.cls', regex: 'for\\s*\\(', weight: 20 },
        { id: 'no-debug', label: 'No debug statements', file: '*', negativeRegex: 'System\\.debug', weight: 10 }
      ],
      tests: [{ id: 'unit', weight: 20 }]
    },
    {
      id: 'js-1',
      title: 'DOM Utility',
      track: 'javascript',
      experienceLevels: [1],
      designations: ['Frontend']
    }
  ]
};

test('code practice service filters catalog by track, years, and designation', () => {
  const params = new URLSearchParams({ track: 'SALESFORCE', experienceYears: '3', designation: 'developer' });
  const result = filterCodePracticeChallenges(catalog, params);

  assert.equal(result.version, 'test');
  assert.deepEqual(result.challenges.map(item => item.id), ['apex-1']);
  assert.equal(getCodePracticeChallenge(catalog, 'js-1')?.title, 'DOM Utility');
});

test('code practice service sanitizes files and scores deterministic checks', () => {
  const sanitized = normalizeCodePracticeFiles({
    '../Class.cls<script>': 'for (Account accountRecord : accounts) { accountRecord.Name = accountRecord.Name; }',
    'notes.md': 'no debug here'
  });

  assert.deepEqual(Object.keys(sanitized), ['Class.clsscript', 'notes.md']);

  const files = normalizeCodePracticeFiles({
    'Class.cls': 'for (Account accountRecord : accounts) { accountRecord.Name = accountRecord.Name; }',
    'notes.md': 'no debug here'
  });

  const result = runCodePracticeChecks(catalog.challenges[0], files, {
    tests: [{ id: 'unit', label: 'Unit test passes', pass: true }]
  });

  assert.equal(result.score, 100);
  assert.equal(result.passedChecks.length, 3);
  assert.deepEqual(result.nextPracticeTopics, ['Bulkification', 'Test coverage', 'Security review']);
});

test('code practice service parses AI review and builds stable evaluation response', () => {
  const deterministic = runCodePracticeChecks(catalog.challenges[0], { 'Class.cls': 'System.debug(accounts);' }, {});
  const aiReview = parseCodePracticeAiReview('```json\n{"score":70,"improvements":["Add tests"],"nextPracticeTopics":["SOQL"]}\n```', deterministic);
  const response = buildCodePracticeEvaluationResponse({
    challenge: catalog.challenges[0],
    body: { languageTrack: 'salesforce' },
    deterministic,
    aiReview,
    now: new Date('2026-05-16T00:00:00.000Z')
  });

  assert.equal(response.success, true);
  assert.equal(response.score, 14);
  assert.equal(response.aiScore, 70);
  assert.equal(response.evaluatedAt, '2026-05-16T00:00:00.000Z');
});

test('code practice service builds custom attempts and keeps best scores', () => {
  const challenge = createCustomCodePracticeChallenge({
    custom: true,
    challengeId: 'custom-apex',
    title: 'Custom Apex Trigger',
    languageTrack: 'apex-trigger-single'
  }, new Date('2026-05-16T01:00:00.000Z'));

  const current = {
    attempts: [{ challengeId: 'custom-apex', score: 95 }],
    bestScores: { 'custom-apex': 95 },
    completedChallengeIds: ['custom-apex'],
    lastWorkspace: null
  };
  const { codingPractice } = buildCodePracticeAttempt({
    challenge,
    current,
    body: {
      score: 82,
      files: { 'trigger!!.trigger': 'trigger Sample on Account(before insert) {}' }
    },
    now: new Date('2026-05-16T02:00:00.000Z')
  });

  assert.equal(codingPractice.attempts.length, 2);
  assert.equal(codingPractice.bestScores['custom-apex'], 95);
  assert.deepEqual(codingPractice.completedChallengeIds, ['custom-apex']);
  assert.deepEqual(Object.keys(codingPractice.lastWorkspace.files), ['trigger.trigger']);
});

test('code practice service caps AI file prompt text', () => {
  const text = buildCodePracticeFilesText({
    'large.cls': 'a'.repeat(7000),
    'second.cls': 'b'.repeat(7000),
    'third.cls': 'c'.repeat(7000)
  });

  assert.ok(text.length <= 14000);
  assert.match(text, /--- large\.cls ---/);
});
