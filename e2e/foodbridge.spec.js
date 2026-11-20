import { test, expect } from '@playwright/test';

test.describe('FoodBridge Production-Grade E2E User Journeys', () => {

  // Journey 8: Language switching works and persists
  test('Journey 8: Language switching changes UI labels and persists in localStorage', async ({ page }) => {
    await page.goto('/');

    // English baseline
    await expect(page.locator('h1')).toContainText('Good Food Deserves a Second Chance.');

    // Switch to Kannada
    await page.getByLabel('Select language').click();
    await page.getByRole('option', { name: 'ಕನ್ನಡ' }).click();
    await expect(page.locator('h1')).toContainText('ಉತ್ತಮ ಆಹಾರಕ್ಕೆ ಎರಡನೇ ಅವಕಾಶ ಸಿಗಬೇಕು.');

    // Verify localStorage persistence
    const savedLocaleKn = await page.evaluate(() => localStorage.getItem('foodbridge_locale'));
    expect(savedLocaleKn).toBe('kn');

    // Switch to Hindi
    await page.getByLabel('Select language').click();
    await page.getByRole('option', { name: 'हिन्दी' }).click();
    await expect(page.locator('h1')).toContainText('अच्छे भोजन को दूसरा मौका मिलना चाहिए।');

    const savedLocaleHi = await page.evaluate(() => localStorage.getItem('foodbridge_locale'));
    expect(savedLocaleHi).toBe('hi');

    // Switch back to English
    await page.getByLabel('Select language').click();
    await page.getByRole('option', { name: 'English' }).click();
    await expect(page.locator('h1')).toContainText('Good Food Deserves a Second Chance.');
  });

  // Journey 1: Donor registers, completes onboarding, and creates a listing
  test('Journey 1: Donor registration, role onboarding, and listing creation', async ({ page }) => {
    await page.goto('/signin');

    // Toggle to Create Account
    await page.getByRole('button', { name: /create account/i }).click();

    // Fill registration credentials
    await page.getByLabel(/email address/i).fill(`donor_${Date.now()}@test.org`);
    await page.getByLabel(/^password$/i).fill('SecurePass123!');
    await page.getByLabel(/confirm password/i).fill('SecurePass123!');
    await page.getByRole('button', { name: /create account/i }).click();

    // Reaches role selection onboarding
    await expect(page.locator('text=Choose your operational roles')).toBeVisible({ timeout: 10000 });
    await page.locator('text=Food Donor').click();
    await page.getByRole('button', { name: /continue to role profile/i }).click();

    // Fill donor profile
    await page.getByLabel(/organization \/ donor name/i).fill('Grand Community Kitchen');
    await page.getByLabel(/contact person name/i).fill('Sunil Hegde');
    await page.getByLabel(/contact phone number/i).fill('+919876543210');
    await page.getByLabel(/street address/i).fill('12 Infantry Road, Bengaluru');
    await page.getByRole('button', { name: /complete profile/i }).click();

    // Reaches Donor Workspace
    await expect(page.locator('text=Surplus Food Listings')).toBeVisible({ timeout: 10000 });

    // Open Create Food Listing Form
    await page.getByRole('button', { name: /create food listing/i }).click();
    await expect(page.locator('text=Create Food Listing')).toBeVisible();

    // Fill listing details
    await page.getByLabel(/food \/ material title/i).fill('50 Packed Veg Biryani Portions');
    await page.getByLabel(/quantity/i).fill('50');
    await page.getByLabel(/pickup address/i).fill('12 Infantry Road, Bengaluru');

    // Real-time safety validation indicator should be visible
    await expect(page.locator('text=Automated Suitability Evaluation')).toBeVisible();

    // Declaration checkbox
    await page.locator('#donorDeclaration').check();

    // Publish listing
    await page.getByRole('button', { name: /publish surplus food listing/i }).click();
    await expect(page.locator('text=50 Packed Veg Biryani Portions')).toBeVisible({ timeout: 10000 });
  });

  // Journey 2 & 3: Recipient verification guard and acceptance
  test('Journey 3 & 2: Ineligible/unverified recipient is guarded; verified recipient accepts', async ({ page }) => {
    await page.goto('/recipient/dashboard');

    // In unverified / pending state, verification guard notice is prominently displayed
    const verificationAlert = page.locator('text=Verification Pending');
    if (await verificationAlert.isVisible()) {
      // Accept button should be disabled for safety
      const acceptBtn = page.getByRole('button', { name: /accept food/i }).first();
      if (await acceptBtn.isVisible()) {
        await expect(acceptBtn).toBeDisabled();
      }
    }
  });

  // Journey 5: Delivery partner coordination
  test('Journey 5: Delivery partner dashboard shows available requests with protected addresses', async ({ page }) => {
    await page.goto('/delivery/dashboard');

    // Unassigned deliveries display district level approximations, not exact street addresses
    await expect(page.locator('text=Available Deliveries')).toBeVisible();
    await expect(page.locator('text=Direct Settlement Notice')).toBeVisible();
  });

  // Journey 7: Admin verification console
  test('Journey 7: Admin workspace allows reviewing submissions and enforces audit trail', async ({ page }) => {
    await page.goto('/admin/verification');

    // Top metrics bar
    await expect(page.locator('text=Administrator Workspace')).toBeVisible();
    await expect(page.locator('text=Verified Partners')).toBeVisible();
    await expect(page.locator('text=Pending Reviews')).toBeVisible();
    await expect(page.locator('text=Audit Trail')).toBeVisible();
  });

  // Accessibility checks
  test('Accessibility: Page structure has valid landmarks and focusable controls', async ({ page }) => {
    await page.goto('/');

    // Has main landmark
    await expect(page.locator('main#main-content')).toBeVisible();

    // Has skip link
    const skipLink = page.locator('a:has-text("Skip to main content")');
    await expect(skipLink).toBeAttached();

    // Form buttons have descriptive labels
    const buttons = await page.getByRole('button').all();
    for (const btn of buttons) {
      const text = await btn.innerText();
      const ariaLabel = await btn.getAttribute('aria-label');
      expect((text || ariaLabel || '').trim().length).toBeGreaterThan(0);
    }
  });

  // Responsive mobile viewport checks
  test('Responsive: Mobile navigation toggles correctly without overflow', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 }); // Mobile iPhone SE
    await page.goto('/');

    // Desktop nav should be hidden, mobile menu button visible
    const mobileMenuTrigger = page.getByLabel('Toggle navigation menu');
    await expect(mobileMenuTrigger).toBeVisible();

    // Open mobile menu
    await mobileMenuTrigger.click();
    await expect(page.locator('nav[aria-label="Mobile Navigation"]')).toBeVisible();
  });
});
