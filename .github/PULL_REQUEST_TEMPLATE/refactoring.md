---
name: Refactoring
about: Code refactoring that doesn't add features or fix bugs
title: '[REFACTOR] '
labels: refactor
---

# Refactoring Pull Request

## Description
<!-- Provide a clear and concise description of the refactoring work -->

## Motivation
<!-- Explain why this refactoring was necessary -->
- [ ] Improve code readability
- [ ] Enhance performance
- [ ] Reduce technical debt
- [ ] Prepare for future feature
- [ ] Simplify maintenance
- [ ] Other: <!-- specify -->

## Changes Overview
<!-- Summarize the key changes made -->

## Before/After Comparison
<!-- If applicable, describe the structure or approach before and after the refactoring -->

**Before:**
```
// Example of code structure before refactoring
```

**After:**
```
// Example of code structure after refactoring
```

## Frontend Changes (if applicable)
- [ ] I've followed the Angular control flow syntax (@if/@else, @for with track, @switch/@case)
- [ ] I've used inject() syntax rather than constructor injection
- [ ] All components are standalone (no modules)
- [ ] Component tests are written using Jest (not Jasmine)
- [ ] All tests still pass with the refactored code
- [ ] Performance measurements (if performance was a goal)

## Backend Changes (if applicable)
- [ ] Properly structured according to NestJS patterns
- [ ] Used "import type" for Request/Response types
- [ ] No changes to API behavior
- [ ] Tests are updated and passing
- [ ] API client has been regenerated if necessary

## Testing
<!-- Describe how you ensured the refactoring didn't break existing functionality -->
- [ ] Existing tests still pass
- [ ] Additional tests added to cover refactored code
- [ ] Performance tests (if performance was a goal)

## Performance Impact (if applicable)
<!-- Include before/after metrics if the refactoring was performance-related -->

## Dependencies
- [ ] No new dependencies added
- [ ] New dependencies have been justified below
<!-- If new dependencies were added, explain why they're necessary -->

## Related Issues
<!-- Reference any related issues using the GitHub issue linking syntax: -->
<!-- Fixes #123 -->
<!-- Relates to #456 -->

## Reviewer Instructions
<!-- Any specific instructions for reviewers -->
