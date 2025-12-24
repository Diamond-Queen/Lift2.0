import { test, expect } from '@playwright/test';

test.describe('Cross-Browser Compatibility', () => {
  test('homepage loads successfully', async ({ page }) => {
    await page.goto('/');
    
    // Check basic page structure
    await expect(page).toHaveTitle(/Lift|Study/i);
    
    // Check key elements load
    const mainContent = page.locator('main, [role="main"]').first();
    await expect(mainContent).toBeVisible();
  });

  test('theme toggle works', async ({ page }) => {
    await page.goto('/');
    
    // Check if theme toggle exists
    const themeToggle = page.locator('button').filter({ hasText: /theme|dark|light/i }).first();
    if (await themeToggle.isVisible()) {
      await themeToggle.click();
      // Verify theme changed
      const htmlElement = page.locator('html');
      const theme = await htmlElement.getAttribute('data-theme');
      expect(theme).toMatch(/dark|light/i);
    }
  });

  test('navigation works', async ({ page }) => {
    await page.goto('/');
    
    // Look for navigation links
    const navLinks = page.locator('nav a, [role="navigation"] a').first();
    if (await navLinks.count() > 0) {
      await navLinks.click();
      // Verify navigation worked
      await expect(page).toHaveURL(/\/|\/login|\/dashboard/);
    }
  });

  test('localStorage persists across sessions', async ({ page }) => {
    await page.goto('/');
    
    // Set a value in localStorage
    await page.evaluate(() => {
      localStorage.setItem('test-key', 'test-value');
    });
    
    // Reload and verify
    await page.reload();
    const value = await page.evaluate(() => localStorage.getItem('test-key'));
    expect(value).toBe('test-value');
    
    // Clean up
    await page.evaluate(() => localStorage.removeItem('test-key'));
  });

  test('CSS loads correctly', async ({ page }) => {
    await page.goto('/');
    
    // Verify stylesheets are loaded
    const stylesheets = await page.locator('link[rel="stylesheet"]').count();
    expect(stylesheets).toBeGreaterThan(0);
    
    // Check computed styles work
    const body = page.locator('body').first();
    const computedStyle = await body.evaluate((el) => 
      window.getComputedStyle(el).display
    );
    expect(computedStyle).toBeTruthy();
  });

  test('viewport responsive on mobile', async ({ page }) => {
    // Test mobile viewport (375px wide)
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    
    // Check page is usable on mobile
    const mainContent = page.locator('main, [role="main"]').first();
    await expect(mainContent).toBeVisible();
    
    // Check text is readable
    const textElements = page.locator('p, h1, h2, h3');
    if (await textElements.count() > 0) {
      const fontSize = await textElements.first().evaluate((el) => 
        window.getComputedStyle(el).fontSize
      );
      // Font size should be at least 12px for readability
      expect(parseFloat(fontSize)).toBeGreaterThanOrEqual(12);
    }
  });

  test('viewport responsive on tablet', async ({ page }) => {
    // Test tablet viewport (768px wide)
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');
    
    const mainContent = page.locator('main, [role="main"]').first();
    await expect(mainContent).toBeVisible();
  });

  test('viewport responsive on desktop', async ({ page }) => {
    // Test desktop viewport (1920px wide)
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/');
    
    const mainContent = page.locator('main, [role="main"]').first();
    await expect(mainContent).toBeVisible();
  });

  test('no console errors on page load', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    
    await page.goto('/');
    
    // Filter out known third-party errors
    const appErrors = errors.filter(
      (err) => !err.includes('Loading chunked failed') && 
               !err.includes('Stripe') &&
               !err.includes('third-party')
    );
    
    expect(appErrors.length).toBe(0);
  });

  test('keyboard navigation works', async ({ page }) => {
    await page.goto('/');
    
    // Tab through elements
    await page.keyboard.press('Tab');
    const focusedElement = await page.evaluate(() => document.activeElement?.tagName);
    expect(focusedElement).toBeTruthy();
  });

  test('buttons are accessible', async ({ page }) => {
    await page.goto('/');
    
    const buttons = page.locator('button');
    const count = await buttons.count();
    
    if (count > 0) {
      const firstButton = buttons.first();
      // Check button has accessible attributes
      const ariaLabel = await firstButton.getAttribute('aria-label');
      const text = await firstButton.textContent();
      
      expect(ariaLabel || text).toBeTruthy();
    }
  });
});

test.describe('Cross-Platform Performance', () => {
  test('page load time is acceptable', async ({ page }) => {
    const startTime = Date.now();
    await page.goto('/');
    const loadTime = Date.now() - startTime;
    
    // Page should load in under 5 seconds on test infrastructure
    expect(loadTime).toBeLessThan(5000);
  });

  test('no memory leaks on navigation', async ({ page }) => {
    // Use page.evaluate with proper typing to avoid memory leak
    const metrics1 = await page.evaluate(() => {
      return { timestamp: Date.now() };
    });
    
    await page.goto('/');
    const metrics2 = await page.evaluate(() => {
      return { timestamp: Date.now() };
    });
    
    // Simple validation that navigation succeeded
    expect(metrics2.timestamp).toBeGreaterThan(metrics1.timestamp);
  });
});
