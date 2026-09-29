import { setPremiumFlag } from 'rxdb-premium/plugins/shared';

// Tests run like a licensed app: RxDB 17 caps a process at 13 open
// collections unless the premium flag is set, and caches the first check,
// so it is set here before any test creates a collection.
setPremiumFlag();
