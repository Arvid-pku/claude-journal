const { test, expect } = require('@playwright/test');

test.describe('Claude Journal', () => {

  test('page loads with sidebar and empty state', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.logo')).toContainText('Claude Journal');
    // Wait for projects to load (async ES modules)
    await page.locator('.project-group').first().waitFor({ timeout: 10000 });
    const count = await page.locator('.project-group').count();
    expect(count).toBeGreaterThan(0);
  });

  test('expanding a project shows sessions', async ({ page }) => {
    await page.goto('/');
    await page.locator('.project-group').first().waitFor({ timeout: 10000 });
    const header = page.locator('.project-header').first();
    await header.click();
    await expect(page.locator('.session-item').first()).toBeVisible({ timeout: 5000 });
  });

  test('clicking a session loads messages', async ({ page }) => {
    await page.goto('/');
    await page.locator('.project-group').first().waitFor({ timeout: 10000 });
    await page.locator('.project-header').first().click();
    await page.locator('.session-item').first().waitFor({ timeout: 5000 });
    await page.locator('.session-item').first().click();
    // Messages should appear
    await expect(page.locator('.message').first()).toBeVisible({ timeout: 5000 });
    // Session title should update
    const title = await page.locator('#session-title').textContent();
    expect(title).not.toBe('Select a session');
    // URL should update with hash
    expect(page.url()).toContain('#s/');
  });

  test('conversation rail shows dots', async ({ page }) => {
    await page.goto('/');
    await page.locator('.project-group').first().waitFor({ timeout: 10000 });
    await page.locator('.project-header').first().click();
    await page.locator('.session-item').first().waitFor({ timeout: 5000 });
    await page.locator('.session-item').first().click();
    await page.locator('.message').first().waitFor({ timeout: 5000 });
    const dots = await page.locator('.rail-dot').count();
    expect(dots).toBeGreaterThan(0);
  });

  test('favorite toggle works', async ({ page }) => {
    await page.goto('/');
    await page.locator('.project-group').first().waitFor({ timeout: 10000 });
    await page.locator('.project-header').first().click();
    await page.locator('.session-item').first().waitFor({ timeout: 5000 });
    await page.locator('.session-item').first().click();
    await page.locator('.message').first().waitFor({ timeout: 5000 });
    // Hover to show actions, click favorite
    const msg = page.locator('.message-inner').first();
    await msg.hover();
    const favBtn = msg.locator('[data-action="favorite"]');
    await favBtn.click();
    await expect(favBtn).toHaveClass(/active/);
    // Toggle off
    await msg.hover();
    await favBtn.click();
    await expect(favBtn).not.toHaveClass(/active/);
  });

  test('global search opens and finds results', async ({ page }) => {
    await page.goto('/');
    // Ctrl+Shift+F opens search
    await page.keyboard.press('Control+Shift+KeyF');
    await expect(page.locator('#search-modal')).not.toHaveClass(/hidden/);
    // Type a common word
    await page.locator('#global-search-input').fill('the');
    // Wait for results
    await page.locator('.search-result').first().waitFor({ timeout: 5000 });
    const count = await page.locator('.search-result').count();
    expect(count).toBeGreaterThan(0);
    // Escape closes
    await page.keyboard.press('Escape');
    await expect(page.locator('#search-modal')).toHaveClass(/hidden/);
  });

  test('settings modal opens and saves', async ({ page }) => {
    await page.goto('/');
    await page.locator('#btn-settings').click();
    await expect(page.locator('#settings-modal')).not.toHaveClass(/hidden/);
    // Verify form elements exist
    await expect(page.locator('#setting-font-size')).toBeVisible();
    await expect(page.locator('#setting-compact')).toBeVisible();
    await expect(page.locator('#setting-session-sort')).toBeVisible();
    // Save (no changes needed, just verify it works)
    await page.locator('#settings-save').click();
    // Verify toast appears
    await expect(page.locator('.toast')).toBeVisible({ timeout: 3000 });
    await expect(page.locator('#settings-modal')).toHaveClass(/hidden/);
  });

  test('analytics page loads', async ({ page }) => {
    await page.goto('/#analytics');
    await expect(page.locator('.analytics-dashboard')).toBeVisible({ timeout: 15000 });
    const cards = await page.locator('.analytics-dashboard .acard').count();
    expect(cards).toBeGreaterThanOrEqual(5);
  });

  test('keyboard j/k navigates messages', async ({ page }) => {
    await page.goto('/');
    await page.locator('.project-group').first().waitFor({ timeout: 10000 });
    await page.locator('.project-header').first().click();
    await page.locator('.session-item').first().waitFor({ timeout: 5000 });
    await page.locator('.session-item').first().click();
    await page.locator('.message').first().waitFor({ timeout: 5000 });
    // Press j to select first message
    await page.keyboard.press('j');
    await expect(page.locator('.message.keyboard-focus').first()).toBeVisible();
  });

  test('theme toggle works via settings', async ({ page }) => {
    await page.goto('/');
    // Open settings and change theme to dark
    await page.locator('#btn-settings').click();
    await expect(page.locator('#settings-modal')).not.toHaveClass(/hidden/);
    await page.locator('#setting-theme').selectOption('dark');
    await page.locator('#settings-save').click();
    await expect(page.locator('#settings-modal')).toHaveClass(/hidden/);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    // Change back to light
    await page.locator('#btn-settings').click();
    await expect(page.locator('#settings-modal')).not.toHaveClass(/hidden/);
    await page.locator('#setting-theme').selectOption('light');
    await page.locator('#settings-save').click();
    await expect(page.locator('#settings-modal')).toHaveClass(/hidden/);
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  });

  test('URL routing preserves session on reload', async ({ page }) => {
    await page.goto('/');
    await page.locator('.project-group').first().waitFor({ timeout: 10000 });
    await page.locator('.project-header').first().click();
    await page.locator('.session-item').first().waitFor({ timeout: 5000 });
    await page.locator('.session-item').first().click();
    await page.locator('.message').first().waitFor({ timeout: 5000 });
    const url = page.url();
    // Reload
    await page.reload();
    await page.locator('.message').first().waitFor({ timeout: 10000 });
    expect(page.url()).toBe(url);
  });
});
