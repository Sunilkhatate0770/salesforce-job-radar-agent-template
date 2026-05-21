// Router & Navigation Shell Module
export async function showPage(id) {
  if (typeof window !== 'undefined' && typeof window.showPage === 'function') {
    return await window.showPage(id);
  }
}

export function isNavigating() {
  if (typeof window !== 'undefined') {
    return !!window.isNavigating;
  }
  return false;
}

if (typeof window !== 'undefined') {
  window.SFJR_ROUTER = { showPage, isNavigating };
}
