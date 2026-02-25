import type { NeutralCustomer } from './types';

// ---------------------------------------------------------------------------
// 5 customers — 2 US, 1 UK, 1 AU, 1 DE
// ordersCount and totalSpent are plausible values matching order data
// ---------------------------------------------------------------------------

export const customers: NeutralCustomer[] = [
  // ── US #1 ─────────────────────────────────────────────────────────────
  {
    id: 'cust-001',
    email: 'sarah.chen@example.com',
    firstName: 'Sarah',
    lastName: 'Chen',
    phone: '+1-503-555-0142',
    address: {
      firstName: 'Sarah',
      lastName: 'Chen',
      line1: '742 Evergreen Terrace',
      line2: null,
      city: 'Portland',
      state: 'OR',
      postalCode: '97205',
      country: 'US',
    },
    ordersCount: 4,
    totalSpent: 23560,
    createdAt: '2025-06-10T12:00:00Z',
    updatedAt: '2025-11-01T14:22:00Z',
  },

  // ── US #2 ─────────────────────────────────────────────────────────────
  {
    id: 'cust-002',
    email: 'mike.johnson@example.com',
    firstName: 'Mike',
    lastName: 'Johnson',
    phone: '+1-512-555-0198',
    address: {
      firstName: 'Mike',
      lastName: 'Johnson',
      line1: '88 Sunrise Blvd',
      line2: 'Apt 4C',
      city: 'Austin',
      state: 'TX',
      postalCode: '78701',
      country: 'US',
    },
    ordersCount: 3,
    totalSpent: 54120,
    createdAt: '2025-07-01T09:00:00Z',
    updatedAt: '2025-10-29T08:30:00Z',
  },

  // ── UK ────────────────────────────────────────────────────────────────
  {
    id: 'cust-003',
    email: 'james.wright@example.co.uk',
    firstName: 'James',
    lastName: 'Wright',
    phone: null,
    address: {
      firstName: 'James',
      lastName: 'Wright',
      line1: '14 Camden High Street',
      line2: 'Flat B',
      city: 'London',
      state: 'England',
      postalCode: 'NW1 0JH',
      country: 'GB',
    },
    ordersCount: 2,
    totalSpent: 12072,
    createdAt: '2025-08-15T14:00:00Z',
    updatedAt: '2025-11-03T09:15:00Z',
  },

  // ── DE ────────────────────────────────────────────────────────────────
  {
    id: 'cust-004',
    email: 'lena.schmidt@example.de',
    firstName: 'Lena',
    lastName: 'Schmidt',
    phone: '+49-30-555-01234',
    address: {
      firstName: 'Lena',
      lastName: 'Schmidt',
      line1: 'Friedrichstrasse 42',
      line2: null,
      city: 'Berlin',
      state: 'Berlin',
      postalCode: '10117',
      country: 'DE',
    },
    ordersCount: 3,
    totalSpent: 28298,
    createdAt: '2025-07-20T10:00:00Z',
    updatedAt: '2025-10-31T07:20:00Z',
  },

  // ── AU ────────────────────────────────────────────────────────────────
  {
    id: 'cust-005',
    email: 'olivia.nguyen@example.com.au',
    firstName: 'Olivia',
    lastName: 'Nguyen',
    phone: null,
    address: {
      firstName: 'Olivia',
      lastName: 'Nguyen',
      line1: '27 Flinders Lane',
      line2: null,
      city: 'Melbourne',
      state: 'VIC',
      postalCode: '3000',
      country: 'AU',
    },
    ordersCount: 1,
    totalSpent: 154330,
    createdAt: '2025-09-05T03:00:00Z',
    updatedAt: '2025-10-26T09:00:00Z',
  },
];
