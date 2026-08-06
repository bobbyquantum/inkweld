import { describe, expect, it } from 'vitest';

import {
  getCategoryIcon,
  getCategoryLabelKey,
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
      expect(getCategoryLabelKey(category), category).toBeTruthy();
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
    expect(getCategoryLabelKey(RelationshipCategory.Reference)).toBe(
      'relationships.categories.reference'
    );
  });

  it('should return "Family" for the Familial category', () => {
    expect(getCategoryLabelKey(RelationshipCategory.Familial)).toBe(
      'relationships.categories.familial'
    );
  });

  it('should return "Social" for the Social category', () => {
    expect(getCategoryLabelKey(RelationshipCategory.Social)).toBe(
      'relationships.categories.social'
    );
  });

  it('should return "Professional" for the Professional category', () => {
    expect(getCategoryLabelKey(RelationshipCategory.Professional)).toBe(
      'relationships.categories.professional'
    );
  });

  it('should return "Location" for the Spatial category', () => {
    expect(getCategoryLabelKey(RelationshipCategory.Spatial)).toBe(
      'relationships.categories.spatial'
    );
  });

  it('should return "Timeline" for the Temporal category', () => {
    expect(getCategoryLabelKey(RelationshipCategory.Temporal)).toBe(
      'relationships.categories.temporal'
    );
  });

  it('should return "Ownership" for the Ownership category', () => {
    expect(getCategoryLabelKey(RelationshipCategory.Ownership)).toBe(
      'relationships.categories.ownership'
    );
  });

  it('should return "Political" for the Political category', () => {
    expect(getCategoryLabelKey(RelationshipCategory.Political)).toBe(
      'relationships.categories.political'
    );
  });

  it('should return "Structure" for the Structural category', () => {
    expect(getCategoryLabelKey(RelationshipCategory.Structural)).toBe(
      'relationships.categories.structural'
    );
  });

  it('should return "Conflict" for the Conflict category', () => {
    expect(getCategoryLabelKey(RelationshipCategory.Conflict)).toBe(
      'relationships.categories.conflict'
    );
  });

  it('should return "Religious" for the Religious category', () => {
    expect(getCategoryLabelKey(RelationshipCategory.Religious)).toBe(
      'relationships.categories.religious'
    );
  });

  it('should return "Biological" for the Biological category', () => {
    expect(getCategoryLabelKey(RelationshipCategory.Biological)).toBe(
      'relationships.categories.biological'
    );
  });

  it('should return "Scholarly" for the Scholarly category', () => {
    expect(getCategoryLabelKey(RelationshipCategory.Scholarly)).toBe(
      'relationships.categories.scholarly'
    );
  });

  it('should return "Magical" for the Magical category', () => {
    expect(getCategoryLabelKey(RelationshipCategory.Magical)).toBe(
      'relationships.categories.magical'
    );
  });

  it('should return "Economic" for the Economic category', () => {
    expect(getCategoryLabelKey(RelationshipCategory.Economic)).toBe(
      'relationships.categories.economic'
    );
  });

  it('should return "Transport" for the Transport category', () => {
    expect(getCategoryLabelKey(RelationshipCategory.Transport)).toBe(
      'relationships.categories.transport'
    );
  });

  it('should return "Other" for the Custom category', () => {
    expect(getCategoryLabelKey(RelationshipCategory.Custom)).toBe(
      'relationships.categories.custom'
    );
  });

  it('should return "Other" for an unknown category', () => {
    expect(getCategoryLabelKey('unknown' as RelationshipCategory)).toBe(
      'relationships.categories.custom'
    );
  });
});
