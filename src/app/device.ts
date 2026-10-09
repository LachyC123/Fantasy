/** Device detection for touch play. `?touch` forces touch controls (testing on desktop). */
export function isTouchDevice(): boolean {
  try {
    if (new URLSearchParams(window.location.search).has('touch')) return true;
    const coarse = window.matchMedia?.('(pointer: coarse)').matches ?? false;
    const fine = window.matchMedia?.('(any-pointer: fine)').matches ?? false;
    // Phones and tablets: a coarse primary pointer and no mouse or trackpad attached.
    return (coarse || navigator.maxTouchPoints > 0) && !fine;
  } catch {
    return false;
  }
}
