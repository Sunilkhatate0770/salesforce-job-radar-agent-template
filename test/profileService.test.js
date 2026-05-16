import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildHybridProfile,
  buildImportedProfile,
  buildPremiumRoadmap,
  extractProfileImportFields,
  normalizeProfileSavePayload,
  sanitizeImportText
} from '../src/services/profileService.js';

function fixtureReader(name, fallback) {
  const fixtures = {
    'career-roadmaps.json': {
      years: {
        '3': {
          title: 'Three year Salesforce path',
          topicIds: ['apex_core'],
          topics: [{ topicId: 'apex_core', topic: 'Apex Core' }],
          releaseFocus: ['Developer']
        }
      }
    },
    'designation-map.json': {
      designations: [
        {
          id: 'salesforce_developer',
          label: 'Salesforce Developer',
          aliases: ['SF Developer'],
          track: 'Developer',
          primaryTopicIds: ['lwc_core']
        }
      ]
    },
    'salesforce-releases.json': {
      activeRelease: { name: 'Spring 26' },
      items: [
        { id: 'dev_release', category: 'Developer', experienceLevels: [3], designations: [] },
        { id: 'admin_release', category: 'Admin', experienceLevels: [1], designations: [] }
      ]
    },
    'trailhead-resources.json': {
      resources: [
        { id: 'trail_apex', topicIds: ['apex_core'], recommendedYears: [3] },
        { id: 'trail_admin', topicIds: ['admin'], recommendedYears: [1] }
      ]
    }
  };
  return fixtures[name] || fallback;
}

test('profile import sanitizer removes HTML and credential-looking values', () => {
  const sanitized = sanitizeImportText('<b>Apex</b> password: secret123 4 years');
  assert.equal(sanitized.includes('<b>'), false);
  assert.equal(sanitized.includes('secret123'), false);
  assert.equal(sanitized.includes('password: [removed]'), true);

  const extracted = extractProfileImportFields(sanitized);
  assert.equal(extracted.experienceYears, 4);
  assert.equal(extracted.skills.includes('Apex'), true);
});

test('profile save normalization scopes user and preserves existing arrays', () => {
  const { profile, intelligence } = normalizeProfileSavePayload({
    userId: 'server-user',
    existingProfile: {
      userId: 'server-user',
      skills: ['Apex'],
      certifications: ['Salesforce Certified Administrator'],
      missingSkills: ['Data Cloud'],
      studyPlanTopics: [{ topicId: 'apex_core', revised: 1 }]
    },
    body: {
      userId: 'client-user',
      _id: 'mongo-id',
      targetRole: 'Salesforce Developer',
      experienceYears: 3,
      skills: 'LWC, Apex',
      clouds: 'Sales Cloud;Service Cloud'
    },
    readDataJson: fixtureReader
  });

  assert.equal(profile.userId, 'server-user');
  assert.equal(profile._id, undefined);
  assert.deepEqual(profile.skills, ['Apex', 'LWC']);
  assert.deepEqual(profile.missingSkills, ['Data Cloud']);
  assert.equal(profile.roadmapSnapshot.topicIds.includes('lwc_core'), true);
  assert.equal(intelligence.releaseFocus.items[0].id, 'dev_release');
});

test('profile import builder appends sanitized imports and keeps existing private data', () => {
  const imported = buildImportedProfile({
    userId: 'u1',
    existingProfile: {
      skills: ['Flow'],
      certifications: ['Salesforce Certified Platform App Builder']
    },
    body: {
      source: 'Manual Resume',
      profileText: 'Senior Salesforce Developer with Apex, LWC and Salesforce Certified Platform Developer I. 3 years.',
      targetDesignation: 'Salesforce Developer'
    },
    readDataJson: fixtureReader
  });

  assert.equal(imported.error, undefined);
  assert.equal(imported.profile.userId, 'u1');
  assert.equal(imported.profile.skills.includes('Flow'), true);
  assert.equal(imported.profile.skills.includes('LWC'), true);
  assert.equal(imported.profile.profileImports.length, 1);
  assert.equal(imported.profile.profileImports[0].source, 'manual resume');
});

test('hybrid profile merge keeps Mongo and Turso user artifacts without duplicates', () => {
  const { profile, source } = buildHybridProfile({
    mongoProfile: {
      skills: ['Apex'],
      bookmarks: [{ q: 'bulk' }],
      studyPlanTopics: [{ topicId: 'apex_core', revised: 1 }]
    },
    tursoProfile: {
      skills: ['Apex', 'LWC'],
      bookmarks: [{ q: 'bulk' }, { q: 'wire' }],
      studyPlanTopics: [{ topicId: 'lwc_core', revised: 2 }]
    }
  });

  assert.equal(source, 'Unified Hybrid (Turso + Mongo)');
  assert.deepEqual(profile.skills, ['Apex', 'LWC']);
  assert.deepEqual(profile.bookmarks.map(item => item.q), ['bulk', 'wire']);
  assert.deepEqual(profile.studyPlanTopics.map(item => item.topicId), ['apex_core', 'lwc_core']);
});

test('roadmap builder adds designation topics and scoped release focus', () => {
  const roadmap = buildPremiumRoadmap(
    { experienceYears: 3, targetRole: 'SF Developer' },
    fixtureReader
  );

  assert.equal(roadmap.experienceYears, 3);
  assert.equal(roadmap.designation.id, 'salesforce_developer');
  assert.equal(roadmap.roadmap.topicIds.includes('apex_core'), true);
  assert.equal(roadmap.roadmap.topicIds.includes('lwc_core'), true);
  assert.deepEqual(roadmap.releaseFocus.items.map(item => item.id), ['dev_release']);
  assert.deepEqual(roadmap.trailheadResources.map(item => item.id), ['trail_apex']);
});
