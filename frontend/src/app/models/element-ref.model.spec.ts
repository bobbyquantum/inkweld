import { describe, expect, it } from 'vitest';

import {
  getCategoryIcon,
  getCategoryLabel,
  RelationshipCategory,
} from './element-ref.model';

describe('RelationshipCategory helpers', () => {
  it('should map every category to a non-empty icon', () => {
    const categories = Object.values(RelationshipCategory);
    expect(categories.length).toBeGreaterThan(8);
    for (const category of categories) {
      expect(getCategoryIcon(category), category).toBeTruthy();
    }
  });

  it('should map every category to a non-empty label', () => {
    const categories = Object.values(RelationshipCategory);
    for (const category of categories) {
      expect(getCategoryLabel(category), category).toBeTruthy();
    }
  });

  it('should return the reference icon for the Reference category', () => {
    expect(getCategoryIcon(RelationshipCategory.Reference)).toBe('link');
  });

  it('should return the family icon for the Familial category', () => {
    expect(getCategoryIcon(RelationshipCategory.Familial)).toBe(
      'family_restroom'
    );
  });

  it('should return the people icon for the Social category', () => {
    expect(getCategoryIcon(RelationshipCategory.Social)).toBe('people');
  });

  it('should return the work icon for the Professional category', () => {
    expect(getCategoryIcon(RelationshipCategory.Professional)).toBe('work');
  });

  it('should return the place icon for the Spatial category', () => {
    expect(getCategoryIcon(RelationshipCategory.Spatial)).toBe('place');
  });

  it('should return the schedule icon for the Temporal category', () => {
    expect(getCategoryIcon(RelationshipCategory.Temporal)).toBe('schedule');
  });

  it('should return the inventory icon for the Ownership category', () => {
    expect(getCategoryIcon(RelationshipCategory.Ownership)).toBe('inventory_2');
  });

  it('should return the account_balance icon for the Political category', () => {
    expect(getCategoryIcon(RelationshipCategory.Political)).toBe(
      'account_balance'
    );
  });

  it('should return the account_tree icon for the Structural category', () => {
    expect(getCategoryIcon(RelationshipCategory.Structural)).toBe(
      'account_tree'
    );
  });

  it('should return the gavel icon for the Conflict category', () => {
    expect(getCategoryIcon(RelationshipCategory.Conflict)).toBe('gavel');
  });

  it('should return the church icon for the Religious category', () => {
    expect(getCategoryIcon(RelationshipCategory.Religious)).toBe('church');
  });

  it('should return the pets icon for the Biological category', () => {
    expect(getCategoryIcon(RelationshipCategory.Biological)).toBe('pets');
  });

  it('should return the school icon for the Scholarly category', () => {
    expect(getCategoryIcon(RelationshipCategory.Scholarly)).toBe('school');
  });

  it('should return the auto_awesome icon for the Magical category', () => {
    expect(getCategoryIcon(RelationshipCategory.Magical)).toBe('auto_awesome');
  });

  it('should return the currency_exchange icon for the Economic category', () => {
    expect(getCategoryIcon(RelationshipCategory.Economic)).toBe(
      'currency_exchange'
    );
  });

  it('should return the directions_car icon for the Transport category', () => {
    expect(getCategoryIcon(RelationshipCategory.Transport)).toBe(
      'directions_car'
    );
  });

  it('should return the tune icon for the Custom category', () => {
    expect(getCategoryIcon(RelationshipCategory.Custom)).toBe('tune');
  });

  it('should return the link icon for an unknown category', () => {
    expect(getCategoryIcon('unknown' as RelationshipCategory)).toBe('link');
  });

  it('should return "References" for the Reference category', () => {
    expect(getCategoryLabel(RelationshipCategory.Reference)).toBe('References');
  });

  it('should return "Family" for the Familial category', () => {
    expect(getCategoryLabel(RelationshipCategory.Familial)).toBe('Family');
  });

  it('should return "Social" for the Social category', () => {
    expect(getCategoryLabel(RelationshipCategory.Social)).toBe('Social');
  });

  it('should return "Professional" for the Professional category', () => {
    expect(getCategoryLabel(RelationshipCategory.Professional)).toBe(
      'Professional'
    );
  });

  it('should return "Location" for the Spatial category', () => {
    expect(getCategoryLabel(RelationshipCategory.Spatial)).toBe('Location');
  });

  it('should return "Timeline" for the Temporal category', () => {
    expect(getCategoryLabel(RelationshipCategory.Temporal)).toBe('Timeline');
  });

  it('should return "Ownership" for the Ownership category', () => {
    expect(getCategoryLabel(RelationshipCategory.Ownership)).toBe('Ownership');
  });

  it('should return "Political" for the Political category', () => {
    expect(getCategoryLabel(RelationshipCategory.Political)).toBe('Political');
  });

  it('should return "Structure" for the Structural category', () => {
    expect(getCategoryLabel(RelationshipCategory.Structural)).toBe('Structure');
  });

  it('should return "Conflict" for the Conflict category', () => {
    expect(getCategoryLabel(RelationshipCategory.Conflict)).toBe('Conflict');
  });

  it('should return "Religious" for the Religious category', () => {
    expect(getCategoryLabel(RelationshipCategory.Religious)).toBe('Religious');
  });

  it('should return "Biological" for the Biological category', () => {
    expect(getCategoryLabel(RelationshipCategory.Biological)).toBe(
      'Biological'
    );
  });

  it('should return "Scholarly" for the Scholarly category', () => {
    expect(getCategoryLabel(RelationshipCategory.Scholarly)).toBe('Scholarly');
  });

  it('should return "Magical" for the Magical category', () => {
    expect(getCategoryLabel(RelationshipCategory.Magical)).toBe('Magical');
  });

  it('should return "Economic" for the Economic category', () => {
    expect(getCategoryLabel(RelationshipCategory.Economic)).toBe('Economic');
  });

  it('should return "Transport" for the Transport category', () => {
    expect(getCategoryLabel(RelationshipCategory.Transport)).toBe('Transport');
  });

  it('should return "Other" for the Custom category', () => {
    expect(getCategoryLabel(RelationshipCategory.Custom)).toBe('Other');
  });

  it('should return "Other" for an unknown category', () => {
    expect(getCategoryLabel('unknown' as RelationshipCategory)).toBe('Other');
  });
});
