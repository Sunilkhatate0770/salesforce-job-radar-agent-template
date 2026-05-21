// Theme System Module
export function toggleTheme() {
  if (typeof window !== 'undefined' && typeof window.toggleTheme === 'function') {
    return window.toggleTheme();
  }
}

export function applyUiMode(mode) {
  if (typeof window !== 'undefined' && typeof window.applyUiMode === 'function') {
    return window.applyUiMode(mode);
  }
}

export function persistUiMode(mode) {
  if (typeof window !== 'undefined' && typeof window.persistUiMode === 'function') {
    return window.persistUiMode(mode);
  }
}

if (typeof window !== 'undefined') {
  window.SFJR_THEME = {
    toggleTheme,
    applyUiMode,
    persistUiMode
  };
}
