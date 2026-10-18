import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import React from 'react';

// BountiesClient talks to the API through tRPC hooks. The list query stays
// unresolved so the component renders the bounties passed as props, and the
// escrow mutation resolves on the next microtask so the pending and success
// states can both be observed.
vi.mock('@/lib/trpc-client', async () => {
  const { useState } = await import('react');
  return {
    trpc: {
      bounties: {
        list: { useQuery: () => ({ data: undefined, isLoading: false }) },
      },
      escrow: {
        create: {
          useMutation: (options: { onSuccess?: (data: unknown) => void }) => {
            const [isPending, setIsPending] = useState(false);
            return {
              isPending,
              mutate: () => {
                setIsPending(true);
                void Promise.resolve().then(() => {
                  setIsPending(false);
                  options.onSuccess?.({
                    escrowId: 'test-escrow-1',
                    txHash: 'abc123testHash',
                    operation: 'deposit',
                    status: 'confirmed',
                  });
                });
              },
            };
          },
        },
      },
    },
  };
});

import BountiesClient from './BountiesClient';
import { bounties } from '@/lib/services/creators-data';

// A syntactically valid Stellar public key (checksum included).
const VALID_ADDRESS = 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H';

function renderBounties() {
  return render(<BountiesClient bounties={bounties} />);
}

describe('BountiesClient', () => {
  it('renders all bounties by default', () => {
    renderBounties();
    expect(screen.getByText(`Showing ${bounties.length} bounties`)).toBeTruthy();
  });

  it('filters by difficulty', () => {
    renderBounties();
    fireEvent.click(screen.getByRole('button', { name: /^intermediate$/i }));
    const intermediate = bounties.filter((b) => b.difficulty === 'intermediate');
    expect(screen.getByText(`Showing ${intermediate.length} bounties`)).toBeTruthy();
  });

  it('filters by category', () => {
    renderBounties();
    fireEvent.click(screen.getByRole('button', { name: /^UX Research$/i }));
    const ux = bounties.filter((b) => b.category === 'UX Research');
    expect(screen.getByText(`Showing ${ux.length} bounties`)).toBeTruthy();
  });

  it('shows empty state when no bounties match', () => {
    renderBounties();
    fireEvent.click(screen.getByRole('button', { name: /^expert$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Technical Writing$/i }));
    expect(screen.getAllByText(/no bounties match/i).length).toBeGreaterThan(0);
  });

  it('reset filters button restores all bounties', () => {
    renderBounties();
    fireEvent.click(screen.getByRole('button', { name: /^expert$/i }));
    fireEvent.click(screen.getByRole('button', { name: /^Technical Writing$/i }));
    fireEvent.click(screen.getByRole('button', { name: /reset filters/i }));
    expect(screen.getByText(`Showing ${bounties.length} bounties`)).toBeTruthy();
  });
});

describe('ApplyModal', () => {
  function openModal() {
    renderBounties();
    fireEvent.click(screen.getAllByRole('button', { name: /^apply to /i })[0]);
  }

  it('opens modal when Apply Now is clicked', () => {
    openModal();
    expect(screen.getByRole('dialog')).toBeTruthy();
    expect(screen.getByLabelText(/proposed budget/i)).toBeTruthy();
    expect(screen.getByLabelText(/proposal/i)).toBeTruthy();
  });

  it('closes modal when X is clicked', () => {
    openModal();
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('closes modal when backdrop is clicked', () => {
    openModal();
    fireEvent.click(screen.getByRole('dialog'));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('shows error when proposal is empty on submit', () => {
    openModal();
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));
    expect(screen.getByRole('alert').textContent).toMatch(/proposal is required/i);
  });

  it('shows error when budget is zero', () => {
    openModal();
    fireEvent.change(screen.getByLabelText(/proposed budget/i), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText(/proposal/i), { target: { value: 'My proposal' } });
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));
    expect(screen.getByRole('alert').textContent).toMatch(/budget must be positive/i);
  });

  it('shows submitting state and then success', async () => {
    openModal();
    fireEvent.change(screen.getByLabelText(/stellar wallet address/i), { target: { value: VALID_ADDRESS } });
    fireEvent.change(screen.getByLabelText(/proposed budget/i), { target: { value: '2000' } });
    fireEvent.change(screen.getByLabelText(/delivery timeline/i), { target: { value: '14' } });
    fireEvent.change(screen.getByLabelText(/proposal/i), { target: { value: 'My detailed proposal' } });

    fireEvent.click(screen.getByRole('button', { name: /submit/i }));
    expect(screen.getByText(/submitting/i)).toBeTruthy();

    const successEl = await waitFor(() => screen.getByTestId('apply-success'));
    expect(successEl).toBeTruthy();
    expect(screen.getByText(/application submitted/i)).toBeTruthy();
    expect(successEl.textContent).toMatch(/escrow/i);
  });

  it('rejects an invalid wallet address', () => {
    openModal();
    fireEvent.change(screen.getByLabelText(/stellar wallet address/i), { target: { value: 'not-an-address' } });
    fireEvent.change(screen.getByLabelText(/proposal/i), { target: { value: 'My proposal' } });
    fireEvent.click(screen.getByRole('button', { name: /submit/i }));
    expect(screen.getByRole('alert').textContent).toMatch(/valid stellar wallet address/i);
  });

  it('pre-fills budget from bounty', () => {
    openModal();
    const input = screen.getByLabelText(/proposed budget/i) as HTMLInputElement;
    expect(Number(input.value)).toBe(bounties[0].budget);
  });

  it('shows escrow info banner', () => {
    openModal();
    expect(screen.getByText(/escrow-protected payment/i)).toBeTruthy();
  });
});
