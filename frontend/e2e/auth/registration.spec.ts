// import { expect, test } from '../fixtures';

// test.describe('User Registration', () => {
//   test('should register a new user successfully', async ({
//     anonymousPage: page,
//   }) => {
//     // Go to registration page
//     await page.goto('/register');

//     // Fill registration form with unique username
//     const uniqueUsername = `newuser-${Date.now()}`;
//     await page.fill('input[name="username"]', uniqueUsername);
//     await page.fill('input[name="password"]', 'correct-password');
//     await page.fill('input[name="confirmPassword"]', 'correct-password');
//     await page.fill('input[name="name"]', 'New Test User');

//     // Submit the form
//     await page.click('button[type="submit"]');

//     // Should redirect to home page after successful registration
//     await expect(page).toHaveURL('/');

//     // Check that user name is displayed
//     await expect(page.locator('.user-name')).toContainText('New Test User');
//   });

//   test('should show error when username is already taken', async ({
//     anonymousPage: page,
//   }) => {
//     // Go to registration page
//     await page.goto('/register');

//     // Fill registration form with existing username
//     await page.fill('input[name="username"]', 'testuser'); // This username exists in our mock database
//     await page.fill('input[name="password"]', 'correct-password');
//     await page.fill('input[name="confirmPassword"]', 'correct-password');
//     await page.fill('input[name="name"]', 'Test User Clone');

//     // Submit the form
//     await page.click('button[type="submit"]');

//     // Should show error message
//     await expect(page.locator('.error-message')).toContainText(
//       'Username already taken'
//     );

//     // Should still be on the registration page
//     await expect(page).toHaveURL('/register');
//   });

//   test('should validate password confirmation', async ({
//     anonymousPage: page,
//   }) => {
//     // Go to registration page
//     await page.goto('/register');

//     // Fill registration form with mismatched passwords
//     await page.fill('input[name="username"]', 'valid-username');
//     await page.fill('input[name="password"]', 'password123');
//     await page.fill('input[name="confirmPassword"]', 'different-password');
//     await page.fill('input[name="name"]', 'Valid User');

//     // Submit the form
//     await page.click('button[type="submit"]');

//     // Should show error message
//     await expect(page.locator('.error-message')).toContainText(
//       'Passwords do not match'
//     );

//     // Should still be on the registration page
//     await expect(page).toHaveURL('/register');
//   });

//   test('should prevent empty form submission', async ({
//     anonymousPage: page,
//   }) => {
//     // Go to registration page
//     await page.goto('/register');

//     // Submit empty form
//     await page.click('button[type="submit"]');

//     // Should show validation errors
//     await expect(page.locator('.error-message')).toBeVisible();

//     // Should still be on the registration page
//     await expect(page).toHaveURL('/register');
//   });
// });
