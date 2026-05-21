// Auth & Session Module
export async function checkAuth() {
  if (typeof window !== 'undefined' && typeof window.checkAuth === 'function') {
    return await window.checkAuth();
  }
  return false;
}

export function signOut() {
  if (typeof window !== 'undefined' && typeof window.signOut === 'function') {
    return window.signOut();
  }
}

export function getCurrentUserId() {
  if (typeof window !== 'undefined' && typeof window.getCurrentUserId === 'function') {
    return window.getCurrentUserId();
  }
  return null;
}

export function getCurrentUserName() {
  if (typeof window !== 'undefined' && typeof window.getCurrentUserName === 'function') {
    return window.getCurrentUserName();
  }
  return null;
}

if (typeof window !== 'undefined') {
  window.SFJR_AUTH = { checkAuth, signOut, getCurrentUserId, getCurrentUserName };
}
