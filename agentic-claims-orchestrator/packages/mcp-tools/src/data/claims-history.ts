import type { z } from 'zod';
import type { PriorClaim } from '@aco/core';

type Prior = z.infer<typeof PriorClaim>;

/** Synthetic claims history keyed by policy number (stands in for the claims data warehouse). */
export const CLAIMS_HISTORY: Readonly<Record<string, readonly Prior[]>> = {
  'POL-100001': [
    { claimId: 'CLM-2025-0412', lossDate: '2025-04-12', lossType: 'glass', paidAmount: 640, status: 'paid' },
  ],
  'POL-100004': [
    {
      claimId: 'CLM-2023-1188',
      lossDate: '2023-11-02',
      lossType: 'storm',
      paidAmount: 7_800,
      status: 'paid',
    },
  ],
  'POL-100006': [
    {
      claimId: 'CLM-2025-0107',
      lossDate: '2025-01-07',
      lossType: 'collision',
      paidAmount: 4_200,
      status: 'paid',
    },
    { claimId: 'CLM-2025-0630', lossDate: '2025-06-30', lossType: 'theft', paidAmount: 0, status: 'denied' },
    {
      claimId: 'CLM-2025-1015',
      lossDate: '2025-10-15',
      lossType: 'vandalism',
      paidAmount: 1_900,
      status: 'paid',
    },
    {
      claimId: 'CLM-2026-0302',
      lossDate: '2026-03-02',
      lossType: 'collision',
      paidAmount: 6_100,
      status: 'paid',
    },
    { claimId: 'CLM-2026-0718', lossDate: '2026-07-18', lossType: 'glass', paidAmount: 380, status: 'paid' },
  ],
  'POL-100008': [
    {
      claimId: 'CLM-2024-0905',
      lossDate: '2024-09-05',
      lossType: 'water_damage',
      paidAmount: 12_400,
      status: 'paid',
    },
  ],
  'POL-100009': [],
};
