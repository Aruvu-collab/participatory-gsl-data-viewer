// Shared between the map page and ContributeMode: while active, clicks on
// existing map features don't open popups (they would interrupt drawing).
export const contributing = $state({ active: false });
