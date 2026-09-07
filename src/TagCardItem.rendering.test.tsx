// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { TagCardItem, TagCardItemProps } from './TagCardItem';
import { NFCTagItem } from './types';

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
    onDeleteTag: vi.fn(),
    onShowInfo: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  describe('Thumbnail & Photo Lifecycle', () => {
    it('renders fallback icon when no photoUrl or thumbnailUrl is present', () => {
      render(<TagCardItem {...defaultProps} />);
      
      const fallback = screen.getByTestId('tag-photo-fallback');
      expect(fallback).not.toBeNull();
      expect(screen.queryByTestId('tag-photo-img')).toBeNull();
    });

    it('renders image when photoUrl is provided', () => {
      const tagWithPhoto: NFCTagItem = {
        ...baseTag,
        photoUrl: 'https://example.com/photos/asset1.png'
      };

      render(<TagCardItem {...defaultProps} tag={tagWithPhoto} />);

      const img = screen.getByTestId('tag-photo-img') as HTMLImageElement;
      expect(img).not.toBeNull();
      expect(img.src).toBe('https://example.com/photos/asset1.png');
      expect(screen.queryByTestId('tag-photo-fallback')).toBeNull();
    });

    it('falls back to placeholder when image fails to load (onError)', () => {
      const tagWithBrokenPhoto: NFCTagItem = {
        ...baseTag,
        photoUrl: 'https://broken.invalid/missing.jpg'
      };

      render(<TagCardItem {...defaultProps} tag={tagWithBrokenPhoto} />);

      const img = screen.getByTestId('tag-photo-img');
      fireEvent.error(img);

      // After error, fallback icon must be rendered
      expect(screen.getByTestId('tag-photo-fallback')).not.toBeNull();
      expect(screen.queryByTestId('tag-photo-img')).toBeNull();
    });

    it('resets image error when photo prop updates with a new URL', () => {
      const { rerender } = render(
        <TagCardItem 
          {...defaultProps} 
          tag={{ ...baseTag, photoUrl: 'https://broken.invalid/missing.jpg' }} 
        />
      );

      // Trigger error on initial image
      const img = screen.getByTestId('tag-photo-img');
      fireEvent.error(img);
      expect(screen.getByTestId('tag-photo-fallback')).not.toBeNull();

      // Update prop to new valid photo
      rerender(
        <TagCardItem 
          {...defaultProps} 
          tag={{ ...baseTag, photoUrl: 'https://valid.site/new-photo.jpg' }} 
        />
      );

      // Error state should have reset, rendering new image
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
      // Multi-record badge (+1 more)
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

      const writeButton = screen.getByTestId('tag-action-write');
      fireEvent.click(writeButton);

      expect(defaultProps.onOpenSafeWrite).toHaveBeenCalledWith(baseTag);
    });
  });

  describe('Progressive Disclosure (Details Drawer)', () => {
    it('toggles details drawer when disclosure button is clicked', () => {
      render(<TagCardItem {...defaultProps} />);

      const toggleButton = screen.getByTestId('tag-details-toggle');
      expect(toggleButton.getAttribute('aria-expanded')).toBe('false');

      // Expand
      fireEvent.click(toggleButton);
      expect(toggleButton.getAttribute('aria-expanded')).toBe('true');
      // Deep technical section is visible
      expect(screen.getByText(/ISO\/IEC 14443 Type 2/i)).not.toBeNull();

      // Collapse
      fireEvent.click(toggleButton);
      expect(toggleButton.getAttribute('aria-expanded')).toBe('false');
    });
  });

  describe('Overflow Actions Menu (⋯)', () => {
    it('opens overflow dropdown and triggers Safe Erase callback', () => {
      render(<TagCardItem {...defaultProps} />);

      const menuButton = screen.getByTestId('tag-overflow-menu-button');
      expect(screen.queryByTestId('tag-overflow-menu')).toBeNull();

      // Open menu
      fireEvent.click(menuButton);
      const menu = screen.getByTestId('tag-overflow-menu');
      expect(menu).not.toBeNull();

      // Click Safe Erase in menu
      const eraseButton = screen.getByRole('menuitem', { name: /Erase/i });
      fireEvent.click(eraseButton);

      expect(defaultProps.onOpenSafeErase).toHaveBeenCalledWith(baseTag);
      // Menu should automatically close after selection
      expect(screen.queryByTestId('tag-overflow-menu')).toBeNull();
    });

    it('triggers onStartEditName callback from overflow menu', () => {
      render(<TagCardItem {...defaultProps} />);

      const menuButton = screen.getByTestId('tag-overflow-menu-button');
      fireEvent.click(menuButton);

      const renameButton = screen.getByRole('menuitem', { name: /Rename/i });
      fireEvent.click(renameButton);

      expect(defaultProps.onStartEditName).toHaveBeenCalledWith(baseTag, expect.anything());
    });

    it('triggers onDeleteTag callback from overflow menu', () => {
      render(<TagCardItem {...defaultProps} />);

      const menuButton = screen.getByTestId('tag-overflow-menu-button');
      fireEvent.click(menuButton);

      const deleteButton = screen.getByRole('menuitem', { name: /Remove from list/i });
      fireEvent.click(deleteButton);

      expect(defaultProps.onDeleteTag).toHaveBeenCalledWith(baseTag.uid);
      expect(defaultProps.onShowInfo).toHaveBeenCalledWith('Item Removed', expect.stringContaining(baseTag.uid));
    });

    it('closes overflow menu when Escape key is pressed', () => {
      render(<TagCardItem {...defaultProps} />);

      const menuButton = screen.getByTestId('tag-overflow-menu-button');
      fireEvent.click(menuButton);
      expect(screen.getByTestId('tag-overflow-menu')).not.toBeNull();

      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByTestId('tag-overflow-menu')).toBeNull();
    });

    it('renders Add photo option in overflow menu when no photo is attached', () => {
      render(<TagCardItem {...defaultProps} />);

      const menuButton = screen.getByTestId('tag-overflow-menu-button');
      fireEvent.click(menuButton);

      expect(screen.getByRole('menuitem', { name: /Add photo/i })).not.toBeNull();
    });

    it('renders Change photo and Remove photo options in overflow menu when photo is attached', () => {
      const onUpdatePhoto = vi.fn();
      render(
        <TagCardItem 
          {...defaultProps} 
          onUpdatePhoto={onUpdatePhoto}
          tag={{ ...baseTag, photoUrl: 'https://example.com/asset.jpg' }} 
        />
      );

      const menuButton = screen.getByTestId('tag-overflow-menu-button');
      fireEvent.click(menuButton);

      expect(screen.getByRole('menuitem', { name: /Change photo/i })).not.toBeNull();
      const removeBtn = screen.getByRole('menuitem', { name: /Remove photo/i });
      expect(removeBtn).not.toBeNull();

      fireEvent.click(removeBtn);
      expect(onUpdatePhoto).toHaveBeenCalledWith(baseTag.uid, undefined, undefined);
    });
  });
});
