// Study Tracker Module
export function startTracking(topicId) {
  if (typeof window !== 'undefined' && typeof window.startTracking === 'function') {
    return window.startTracking(topicId);
  }
}

export function stopTracking() {
  if (typeof window !== 'undefined' && typeof window.stopTracking === 'function') {
    return window.stopTracking();
  }
}

export function togglePause() {
  if (typeof window !== 'undefined' && typeof window.togglePause === 'function') {
    return window.togglePause();
  }
}

export function resetTracker() {
  if (typeof window !== 'undefined' && typeof window.resetTracker === 'function') {
    return window.resetTracker();
}
}

export async function updateTrackerUI(useCache = false) {
  if (typeof window !== 'undefined' && typeof window.updateTrackerUI === 'function') {
    return await window.updateTrackerUI(useCache);
  }
}

export async function getStudyData(force = false) {
  if (typeof window !== 'undefined' && typeof window.getStudyData === 'function') {
    return await window.getStudyData(force);
  }
  return null;
}

if (typeof window !== 'undefined') {
  window.SFJR_STUDY_TRACKER = {
    startTracking,
    stopTracking,
    togglePause,
    resetTracker,
    updateTrackerUI,
    getStudyData
  };
}
