// Shared between the map page and ContributeMode: while active, clicks on
// existing map features don't open popups (they would interrupt drawing), and the
// page switches to the blueprint look and shows the session panel (ContributeSession).
import type { TokenInfo } from './validate';

export const contributing = $state<{
	active: boolean;
	/** invite code in use ('' = none yet) */
	token: string;
	/** its details and live counts; null = not checked (e.g. offline) */
	info: TokenInfo | null;
	checking: boolean;
	/** set by ContributeMode: forget the code and ask for a new one */
	reset: (() => void) | null;
}>({ active: false, token: '', info: null, checking: false, reset: null });
