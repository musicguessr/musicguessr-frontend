import { expect, test } from '@playwright/test';

test('landing page renders the core call-to-action', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.logo').first()).toHaveText('musicguessr');
  await expect(page.getByRole('link', { name: /Start Playing Free/i }).first()).toBeVisible();
  await expect(page.locator('.provider-card', { hasText: 'YouTube' })).toBeVisible();
});

test('how-to-play link navigates correctly', async ({ page }) => {
  await page.goto('/');
  await page.locator('.top-nav').getByRole('link', { name: 'How to play' }).click();
  await expect(page).toHaveURL(/\/how-to-play$/);
  await expect(page.locator('h1')).toContainText('How to Play');
});
