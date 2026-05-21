// Job Radar Board Module
export async function fetchJobs() {
  if (typeof window !== 'undefined' && typeof window.fetchJobs === 'function') {
    return await window.fetchJobs();
  }
  return [];
}

export async function updateJobStatus(jobId, newStatus) {
  if (typeof window !== 'undefined' && typeof window.updateJobStatus === 'function') {
    return await window.updateJobStatus(jobId, newStatus);
  }
}

export function renderJobsList(jobs) {
  if (typeof window !== 'undefined' && typeof window.renderJobsList === 'function') {
    return window.renderJobsList(jobs);
  }
}

export function sortBoardJobs(jobs, colId) {
  if (typeof window !== 'undefined' && typeof window.sortBoardJobs === 'function') {
    return window.sortBoardJobs(jobs, colId);
  }
  return jobs;
}

export async function clearAndSyncJobs() {
  if (typeof window !== 'undefined' && typeof window.clearAndSyncJobs === 'function') {
    return await window.clearAndSyncJobs();
  }
}

if (typeof window !== 'undefined') {
  window.SFJR_JOB_RADAR = {
    fetchJobs,
    updateJobStatus,
    renderJobsList,
    sortBoardJobs,
    clearAndSyncJobs
  };
}
