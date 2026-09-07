// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { TagCardItem, TagCardItemProps } from './TagCardItem';
import { NFCTagItem } from './types';
import { savePhotoAsset, _resetDBForTesting } from './storage/photoAssetStorage';

describe('TagCardItem Component Rendering & Interaction Tests', () => {
  const baseTag: NFCTagItem = {
    uid: '04112233445566',
    name: 'Asset Alpha',
    firstSeen: 1600000000000,
    lastRead: 1600001000000,
    readCount: 5,
    hasNdef: true,
    tagType: 'NTAG215 (Type 2)',
    records: [
      { id: 'rec-1', recordType: 'url', data: 'https://example.com/item/100' },
      { id: 'rec-2', recordType: 'text', data: 'Asset Shelf 4B', lang: 'ja' }
    ]
  };

  const defaultProps: TagCardItemProps = {
    tag: baseTag,
    copiedUid: null,
    onCopyUid: vi.fn(),
    editingNameUid: null,
    tempName: '',
    onSetTempName: vi.fn(),
    onStartEditName: vi.fn(),
    onSaveName: vi.fn(),
    onOpenSafeWrite: vi.fn(),
    onOpenSafeErase: vi.fn(),
    onDeleteTag: vi.fn().mockResolvedValue({ success: true }),
    onShowInfo: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();
    await _resetDBForTesting();
    const mockCreate = vi.fn((blob: Blob) => `blob:mock/${Date.now()}`);
    const mockRevoke = vi.fn();
    window.URL.createObjectURL = mockCreate;
    window.URL.revokeObjectURL = mockRevoke;
    globalThis.URL.createObjectURL = mockCreate;
    globalThis.URL.revokeObjectURL = mockRevoke;
  });

  afterEach(() => cleanup());

  describe('Thumbnail & Photo Lifecycle', () => {
    it('renders fallback icon when no photoUrl or thumbnailUrl is present', () => {
      render(<TagCardItem {...defaultProps} />);
      expect(screen.getByTestId('tag-photo-fallback')).not.toBeNull();
      expect(screen.queryByTestId('tag-photo-img')).toBeNull();
    });

    it('renders image when photoUrl is provided', () => {
      render(<TagCardItem {...defaultProps} tag={{ ...baseTag, photoUrl: 'https://example.com/photos/asset1.png' }} />);
      const img = screen.getByTestId('tag-photo-img') as HTMLImageElement;
      expect(img).not.toBeNull();
      expect(img.src).toBe('https://example.com/photos/asset1.png');
      expect(screen.queryByTestId('tag-photo-fallback')).toBeNull();
    });

    it('falls back to placeholder when image fails to load (onError)', () => {
      render(<TagCardItem {...defaultProps} tag={{ ...baseTag, photoUrl: 'https://broken.invalid/missing.jpg' }} />);
      fireEvent.error(screen.getByTestId('tag-photo-img'));
      expect(screen.getByTestId('tag-photo-fallback')).not.toBeNull();
      expect(screen.queryByTestId('tag-photo-img')).toBeNull();
    });

    it('resets image error when photo prop updates with a new URL', () => {
      const { rerender } = render(<TagCardItem {...defaultProps} tag={{ ...baseTag, photoUrl: 'https://broken.invalid/missing.jpg' }} />);
      fireEvent.error(screen.getByTestId('tag-photo-img'));
      expect(screen.getByTestId('tag-photo-fallback')).not.toBeNull();
      rerender(<TagCardItem {...defaultProps} tag={{ ...baseTag, photoUrl: 'https://valid.site/new-photo.jpg' }} />);
      const newImg = screen.getByTestId('tag-photo-img') as HTMLImageElement;
      expect(newImg).not.toBeNull();
      expect(newImg.src).toBe('https://valid.site/new-photo.jpg');
      expect(screen.queryByTestId('tag-photo-fallback')).toBeNull();
    });
  });

  describe('Inventory Row Presentation', () => {
    it('displays tag name and primary record content', () => {
      render(<TagCardItem {...defaultProps} />);
      expect(screen.getByText('Asset Alpha')).not.toBeNull();
      expect(screen.getByText('https://example.com/item/100')).not.toBeNull();
      expect(screen.getByText('+1 more')).not.toBeNull();
    });

    it('calls onCopyUid when copy button is clicked', () => {
      render(<TagCardItem {...defaultProps} />);
      const copyButtons = screen.getAllByRole('button', { name: /Copy UID/i });
      expect(copyButtons.length).toBeGreaterThan(0);
      fireEvent.click(copyButtons[0]);
      expect(defaultProps.onCopyUid).toHaveBeenCalledWith(baseTag.uid, expect.anything());
    });
  });

  describe('Primary Action (Write)', () => {
    it('invokes onOpenSafeWrite when Write button is clicked', () => {
      render(<TagCardItem {...defaultProps} />);
      fireEvent.click(screen.getByTestId('tag-action-write'));
      expect(defaultProps.onOpenSafeWrite).toHaveBeenCalledWith(baseTag);
    });
  });

  describe('Progressive Disclosure (Details Drawer)', () => {
    it('toggles details drawer when disclosure button is clicked', () => {
      render(<TagCardItem {...defaultProps} />);
      const toggleButton = screen.getByTestId('tag-details-toggle');
      expect(toggleButton.getAttribute('aria-expanded')).toBe('false');
      fireEvent.click(toggleButton);
      expect(toggleButton.getAttribute('aria-expanded')).toBe('true');
      expect(screen.getByText(/ISO\/IEC 14443 Type 2/i)).not.toBeNull();
      fireEvent.click(toggleButton);
      expect(toggleButton.getAttribute('aria-expanded')).toBe('false');
    });
  });

  describe('Overflow Actions Menu (⋯)', () => {
    it('opens overflow dropdown and triggers Safe Erase callback', () => {
      render(<TagCardItem {...defaultProps} />);
      const menuButton = screen.getByTestId('tag-overflow-menu-button');
      expect(screen.queryByTestId('tag-overflow-menu')).toBeNull();
      fireEvent.click(menuButton);
      expect(screen.getByTestId('tag-overflow-menu')).not.toBeNull();
      fireEvent.click(screen.getByRole('menuitem', { name: /Erase/i }));
      expect(defaultProps.onOpenSafeErase).toHaveBeenCalledWith(baseTag);
      expect(screen.queryByTestId('tag-overflow-menu')).toBeNull();
    });

    it('triggers onStartEditName callback from overflow menu', () => {
      render(<TagCardItem {...defaultProps} />);
      fireEvent.click(screen.getByTestId('tag-overflow-menu-button'));
      fireEvent.click(screen.getByRole('menuitem', { name: /Rename/i }));
      expect(defaultProps.onStartEditName).toHaveBeenCalledWith(baseTag, expect.anything());
    });

    it('waits for durable delete success before showing removal feedback', async () => {
      const onDeleteTag = vi.fn().mockResolvedValue({ success: true });
      const onShowInfo = vi.fn();
      render(<TagCardItem {...defaultProps} onDeleteTag={onDeleteTag} onShowInfo={onShowInfo} />);

      fireEvent.click(screen.getByTestId('tag-overflow-menu-button'));
      fireEvent.click(screen.getByRole('menuitem', { name: /Remove from list/i }));

      expect(onDeleteTag).toHaveBeenCalledWith(baseTag.uid);
      await waitFor(() => {
        expect(onShowInfo).toHaveBeenCalledWith('Item Removed', expect.stringContaining(baseTag.uid));
      });
    });

    it('does not show removal success when durable delete fails', async () => {
      const onDeleteTag = vi.fn().mockResolvedValue({ success: false, error: 'database unavailable' });
      const onShowInfo = vi.fn();
      render(<TagCardItem {...defaultProps} onDeleteTag={onDeleteTag} onShowInfo={onShowInfo} />);

      fireEvent.click(screen.getByTestId('tag-overflow-menu-button'));
      fireEvent.click(screen.getByRole('menuitem', { name: /Remove from list/i }));

      await waitFor(() => {
        expect(onShowInfo).toHaveBeenCalledWith('Remove Error', 'database unavailable');
      });
      expect(onShowInfo).not.toHaveBeenCalledWith('Item Removed', expect.anything());
    });

    it('closes overflow menu when Escape key is pressed', () => {
      render(<TagCardItem {...defaultProps} />);
      fireEvent.click(screen.getByTestId('tag-overflow-menu-button'));
      expect(screen.getByTestId('tag-overflow-menu')).not.toBeNull();
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByTestId('tag-overflow-menu')).toBeNull();
    });

    it('renders Add photo option in overflow menu when no photo is attached', () => {
      render(<TagCardItem {...defaultProps} />);
      fireEvent.click(screen.getByTestId('tag-overflow-menu-button'));
      expect(screen.getByRole('menuitem', { name: /Add photo/i })).not.toBeNull();
    });

    it('renders Change photo and Remove photo options in overflow menu when photo is attached', () => {
      const onUpdatePhoto = vi.fn().mockResolvedValue({ success: true });
      render(<TagCardItem {...defaultProps} onUpdatePhoto={onUpdatePhoto} tag={{ ...baseTag, photoUrl: 'https://example.com/asset.jpg' }} />);
      fireEvent.click(screen.getByTestId('tag-overflow-menu-button'));
      expect(screen.getByRole('menuitem', { name: /Change photo/i })).not.toBeNull();
      const removeBtn = screen.getByRole('menuitem', { name: /Remove photo/i });
      expect(removeBtn).not.toBeNull();
      fireEvent.click(removeBtn);
      expect(onUpdatePhoto).toHaveBeenCalledWith(baseTag.uid, { photoAssetId: null, photoUrl: null });
    });

    it('loads and renders photo asset from IndexedDB when photoAssetId is provided', async () => {
      const assetId = 'photo-test-rendering';
      await savePhotoAsset(new Blob(['image-bytes'], { type: 'image/png' }), { id: assetId, mimeType: 'image/png' });
      render(<TagCardItem {...defaultProps} tag={{ ...baseTag, photoAssetId: assetId }} />);
      await waitFor(() => {
        const img = screen.getByTestId('tag-photo-img') as HTMLImageElement;
        expect(img).not.toBeNull();
        expect(img.src).toContain('blob:');
      });
    });
  });
});
