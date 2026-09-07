// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StorageErrorState } from './StorageErrorState';

describe('StorageErrorState', () => {
  afterEach(() => cleanup());

  it('shows a storage-specific error instead of an empty registry message', () => {
    render(<StorageErrorState error="Unable to load local tag data from IndexedDB." onRetry={() => {}} />);

    expect(screen.getByTestId('storage-error-state')).not.toBeNull();
    expect(screen.getByText('Could not load local tag data')).not.toBeNull();
    expect(screen.getByText('Unable to load local tag data from IndexedDB.')).not.toBeNull();
    expect(screen.queryByText('No NFC inventory items found')).toBeNull();
  });

  it('invokes the retry callback without requiring a page reload', () => {
    const retry = vi.fn();
    render(<StorageErrorState error={null} onRetry={retry} />);

    fireEvent.click(screen.getByTestId('storage-retry-button'));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
