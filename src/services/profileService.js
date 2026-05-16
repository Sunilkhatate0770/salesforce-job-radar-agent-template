const PROFILE_SKILL_BANK = [
  'Salesforce',
  'Apex',
  'SOQL',
  'SOSL',
  'LWC',
  'Aura',
  'Flow',
  'REST API',
  'SOAP API',
  'Integration',
  'Batch Apex',
  'Queueable Apex',
  'Platform Events',
  'Change Data Capture',
  'Sales Cloud',
  'Service Cloud',
  'Experience Cloud',
  'Data Cloud',
  'Agentforce',
  'CPQ',
  'Git',
  'Copado',
  'DevOps',
  'Reports',
  'Dashboards',
  'Security',
  'Sharing Rules'
];

export function mergeUnique(arr1 = [], arr2 = [], key) {
  const map = new Map();
  [...(arr2 || []), ...(arr1 || [])].forEach(item => {
    if (!item) return;
    const id = key ? (typeof item === 'object' ? item[key] : item) : item;
    if (id !== undefined && id !== null) map.set(String(id), item);
  });
  return Array.from(map.values());
}

export function clampExperienceYears(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 1;
  return Math.min(10, Math.max(1, Math.round(num)));
}

export function normalizeList(value) {
  if (Array.isArray(value)) return value.map(v => String(v || '').trim()).filter(Boolean);
  if (typeof value === 'string') {
    return value.split(/[,;\n]/).map(v => v.trim()).filter(Boolean);
  }
  return [];
}

export function sanitizeImportText(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\b(password|passwd|pwd|otp|one[-\s]?time password)\b\s*[:=]\s*\S+/gi, '$1: [removed]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 12000);
}

function scoreDesignationLabel(normalized, label) {
  const normalizedLabel = String(label || '').toLowerCase().trim();
  if (!normalizedLabel) return 0;
  if (normalized === normalizedLabel) return 10000 + normalizedLabel.length;
  if (normalized.includes(normalizedLabel)) return 1000 + normalizedLabel.length;
  if (normalizedLabel.includes(normalized)) return 500 + normalized.length;
  return 0;
}

export function inferDesignation(rawDesignation, designationsData = {}) {
  const value = String(rawDesignation || '').trim();
  if (!value) return designationsData.designations?.[0] || null;
  const normalized = value.toLowerCase();
  const ranked = (designationsData.designations || [])
    .map(item => {
      const labels = [item.label, ...(item.aliases || [])].map(v => String(v || '').toLowerCase());
      return { item, score: Math.max(...labels.map(label => scoreDesignationLabel(normalized, label))) };
    })
    .filter(match => match.score > 0)
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.item || {
    id: normalized.replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'custom_designation',
    label: value,
    track: 'Custom',
    primaryTopicIds: []
  };
}

export function topicConfigName(topicId) {
  return String(topicId || '')
    .split(/[-_]/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

export function buildPremiumRoadmap(profile = {}, readDataJson = () => ({})) {
  const roadmaps = readDataJson('career-roadmaps.json', { years: {} });
  const designations = readDataJson('designation-map.json', { designations: [] });
  const releases = readDataJson('salesforce-releases.json', { activeRelease: {}, items: [] });
  const trailhead = readDataJson('trailhead-resources.json', { resources: [] });

  const experienceYears = clampExperienceYears(profile.experienceYears || profile.yearsOfExperience || 1);
  const designation = inferDesignation(
    profile.targetDesignation || profile.targetRole || profile.currentDesignation || profile.currentRole,
    designations
  );
  const baseRoadmap = roadmaps.years?.[String(experienceYears)] || roadmaps.years?.['1'] || {};
  const designationTopicIds = new Set(designation?.primaryTopicIds || []);
  const roadmapTopicIds = new Set(baseRoadmap.topicIds || []);
  const mergedTopics = [...(baseRoadmap.topics || [])];

  for (const topicId of designationTopicIds) {
    if (!roadmapTopicIds.has(topicId)) {
      mergedTopics.push({
        topicId,
        topic: topicConfigName(topicId),
        category: designation?.track || 'Designation',
        priority: 'medium',
        estimatedHours: 6,
        reason: `Added because it is important for ${designation?.label || 'the selected designation'}.`
      });
      roadmapTopicIds.add(topicId);
    }
  }

  const releaseCategories = new Set(baseRoadmap.releaseFocus || []);
  const releaseItems = (releases.items || []).filter(item => {
    const levelMatch = (item.experienceLevels || []).includes(experienceYears);
    const categoryMatch = releaseCategories.has(item.category);
    const designationMatch = (item.designations || []).some(d =>
      String(d).toLowerCase() === String(designation?.label || '').toLowerCase()
    );
    return levelMatch && (categoryMatch || designationMatch);
  });

  const topicSet = new Set(mergedTopics.map(t => t.topicId));
  const resources = (trailhead.resources || []).filter(resource => {
    const yearMatch = (resource.recommendedYears || []).includes(experienceYears);
    const topicMatch = (resource.topicIds || []).some(topicId => topicSet.has(topicId));
    return yearMatch && topicMatch;
  });

  return {
    experienceYears,
    designation,
    roadmap: {
      ...baseRoadmap,
      topics: mergedTopics,
      topicIds: Array.from(roadmapTopicIds)
    },
    releaseFocus: {
      activeRelease: releases.activeRelease || {},
      items: releaseItems.length
        ? releaseItems
        : (releases.items || []).filter(item =>
          (item.experienceLevels || []).includes(experienceYears)
        ).slice(0, 6)
    },
    trailheadResources: resources.slice(0, 8),
    generatedAt: new Date().toISOString()
  };
}

export function extractProfileImportFields(text) {
  const cleanText = sanitizeImportText(text);
  const skills = PROFILE_SKILL_BANK.filter(skill =>
    new RegExp(`\\b${skill.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(cleanText)
  );
  const yearsMatch = cleanText.match(/(\d+(?:\.\d+)?)\s*\+?\s*(?:years?|yrs?)\b/i);
  const certMatches = cleanText.match(/Salesforce Certified [A-Za-z0-9 &-]+/gi) || [];
  const roleMatch = cleanText.match(/\b(?:Senior |Lead |Junior |Associate )?Salesforce [A-Za-z ]{3,40}\b/i);
  return {
    rawText: cleanText,
    skills,
    experienceYears: yearsMatch ? clampExperienceYears(yearsMatch[1]) : undefined,
    currentDesignation: roleMatch ? roleMatch[0].trim() : undefined,
    certifications: Array.from(new Set(certMatches.map(v => v.trim())))
  };
}

export function stripPersistenceFields(profile = {}) {
  const { _id, __v, createdAt, ...clean } = profile || {};
  return clean;
}

export function normalizeProfileSavePayload({
  body = {},
  existingProfile = null,
  userId,
  readDataJson = () => ({})
} = {}) {
  const profileData = stripPersistenceFields(body);
  const existing = stripPersistenceFields(existingProfile || {});
  const platform = String(profileData.platform || '');
  const platforms = { ...(existing.platforms || {}) };
  if (platform === 'LinkedIn') platforms.linkedin = { synced: true, lastSync: new Date() };
  if (platform === 'Naukri') platforms.naukri = { synced: true, lastSync: new Date() };

  const rawExtraction = { ...(existing.rawExtraction || {}) };
  if (platform === 'LinkedIn') {
    rawExtraction.linkedinSkills = profileData.skills;
    rawExtraction.linkedinCerts = profileData.certifications;
  }
  if (platform === 'Naukri') {
    rawExtraction.naukriSkills = profileData.skills;
    rawExtraction.naukriCerts = profileData.certifications;
  }

  const normalizedProfile = {
    ...existing,
    ...profileData,
    userId,
    platforms,
    skills: mergeUnique(normalizeList(profileData.skills), existing.skills),
    certifications: mergeUnique(normalizeList(profileData.certifications), existing.certifications),
    missingSkills: mergeUnique(normalizeList(profileData.missingSkills), existing.missingSkills),
    experienceYears: clampExperienceYears(profileData.experienceYears || existing.experienceYears || existing.yearsOfExperience || 1),
    currentDesignation: profileData.currentDesignation || existing.currentDesignation,
    targetDesignation: profileData.targetDesignation || existing.targetDesignation,
    currentRole: profileData.currentRole || profileData.currentDesignation || existing.currentRole,
    targetRole: profileData.targetRole || profileData.targetDesignation || existing.targetRole,
    uiMode: profileData.uiMode === 'classic' ? 'classic' : 'modern',
    clouds: normalizeList(profileData.clouds || existing.clouds),
    tools: normalizeList(profileData.tools || existing.tools),
    domains: normalizeList(profileData.domains || existing.domains),
    jobPreferences: profileData.jobPreferences || existing.jobPreferences,
    profileImports: profileData.profileImports || existing.profileImports || [],
    studyPlan: profileData.studyPlan || existing.studyPlan,
    studyPlanTopics: Array.isArray(profileData.studyPlanTopics) && profileData.studyPlanTopics.length > 0
      ? profileData.studyPlanTopics
      : (existing.studyPlanTopics || []),
    rawExtraction,
    updatedAt: new Date()
  };

  if (!normalizedProfile.targetRole && normalizedProfile.targetDesignation) {
    normalizedProfile.targetRole = normalizedProfile.targetDesignation;
  }
  if (!normalizedProfile.currentRole && normalizedProfile.currentDesignation) {
    normalizedProfile.currentRole = normalizedProfile.currentDesignation;
  }

  const intelligence = buildPremiumRoadmap(normalizedProfile, readDataJson);
  normalizedProfile.roadmapSnapshot = intelligence.roadmap;
  normalizedProfile.releaseFocus = intelligence.releaseFocus;

  return { profile: normalizedProfile, intelligence };
}

export function buildImportedProfile({
  body = {},
  existingProfile = null,
  userId,
  readDataJson = () => ({})
} = {}) {
  const extracted = extractProfileImportFields(body.text || body.profileText || '');
  if (!extracted.rawText) {
    return { error: 'Profile text is required', extracted };
  }

  const source = String(body.source || 'manual').toLowerCase().slice(0, 40);
  const profile = stripPersistenceFields(existingProfile || {});
  const nextProfile = {
    ...profile,
    userId,
    skills: mergeUnique(extracted.skills, profile.skills),
    certifications: mergeUnique(extracted.certifications, profile.certifications),
    experienceYears: extracted.experienceYears || profile.experienceYears || clampExperienceYears(body.experienceYears || 1),
    currentDesignation: extracted.currentDesignation || profile.currentDesignation || profile.currentRole,
    targetDesignation: body.targetDesignation || profile.targetDesignation || profile.targetRole || extracted.currentDesignation,
    currentRole: extracted.currentDesignation || profile.currentRole || profile.currentDesignation,
    targetRole: body.targetDesignation || profile.targetRole || profile.targetDesignation || extracted.currentDesignation,
    uiMode: profile.uiMode || 'modern',
    profileImports: [
      ...(profile.profileImports || []).slice(-4),
      { source, text: extracted.rawText, importedAt: new Date() }
    ],
    updatedAt: new Date()
  };

  const intelligence = buildPremiumRoadmap(nextProfile, readDataJson);
  nextProfile.roadmapSnapshot = intelligence.roadmap;
  nextProfile.releaseFocus = intelligence.releaseFocus;

  return { profile: nextProfile, extracted, intelligence };
}

export function buildHybridProfile({ tursoProfile = null, mongoProfile = null } = {}) {
  if (tursoProfile && mongoProfile) {
    return {
      profile: {
        ...mongoProfile,
        ...tursoProfile,
        skills: mergeUnique(tursoProfile.skills, mongoProfile.skills),
        certifications: mergeUnique(tursoProfile.certifications, mongoProfile.certifications),
        missingSkills: mergeUnique(tursoProfile.missingSkills, mongoProfile.missingSkills),
        bookmarks: mergeUnique(tursoProfile.bookmarks, mongoProfile.bookmarks, 'q'),
        completedTasks: mergeUnique(tursoProfile.completedTasks, mongoProfile.completedTasks),
        studyPlanTopics: mergeUnique(tursoProfile.studyPlanTopics, mongoProfile.studyPlanTopics, 'topicId')
      },
      source: 'Unified Hybrid (Turso + Mongo)'
    };
  }

  return {
    profile: tursoProfile || mongoProfile || null,
    source: tursoProfile ? 'Turso (Primary)' : (mongoProfile ? 'MongoDB (Legacy)' : 'None')
  };
}
