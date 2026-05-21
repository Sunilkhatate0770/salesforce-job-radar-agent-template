// User Profile & Roadmap Module
export async function loadUserProfile() {
  if (typeof window !== 'undefined' && typeof window.loadUserProfile === 'function') {
    return await window.loadUserProfile();
  }
}

export function updateProfileStrengthMeter() {
  if (typeof window !== 'undefined' && typeof window.updateProfileStrengthMeter === 'function') {
    return window.updateProfileStrengthMeter();
  }
}

export function buildStaticPremiumRoadmap(profile) {
  if (typeof window !== 'undefined' && typeof window.buildStaticPremiumRoadmap === 'function') {
    return window.buildStaticPremiumRoadmap(profile);
  }
}

if (typeof window !== 'undefined') {
  window.SFJR_PROFILE = {
    loadUserProfile,
    updateProfileStrengthMeter,
    buildStaticPremiumRoadmap
  };
}
