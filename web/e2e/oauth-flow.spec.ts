// OAuth E2E flow: /login -> /auth/github -> callback -> dashboard
// chain with redirect interception (#4189).

import { test, expect, type Route } from '@playwright/test'
import { mockApiFallback, mockApiMe } from './helpers/setup'

const ELEMENT_VISIBLE_TIMEOUT_MS = 10_000
const NAV_INTERCEPT_TIMEOUT_MS = 5_000
const OAUTH_TEST_TIMEOUT_MS = 30_000

const FAKE_OAUTH_CODE = 'test-authorization-code'
const FAKE_OAUTH_STATE = 'test-csrf-state-token'
const FAKE_ACCESS_TOKEN = 'gho_fake_access_token_for_test'

// Override mockApiFallback's /health (which sets oauth_configured: false) so
// the Login component renders the GitHub button instead of the setup wizard.
async function mockHealthOAuthConfigured(page: import('@playwright/test').Page) {
  await page.route('**/health', (route: Route) => {
    const url = new URL(route.request().url())
    if (url.pathname !== '/health') return route.fallback()
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        status: 'ok',
        version: 'dev',
        oauth_configured: true,
        in_cluster: false,
        no_local_agent: true,
        install_method: 'dev',
      }),
    })
  })
}

test.describe('OAuth flow - frontend (mocked backend)', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test.beforeEach(async ({ page }, testInfo) => {
    testInfo.setTimeout(OAUTH_TEST_TIMEOUT_MS)
    await mockApiFallback(page)
    await mockHealthOAuthConfigured(page)
    await mockApiMe(page)
  })

  test('clicking GitHub login navigates to /auth/github', async ({ page }) => {
    await page.route('**/auth/github', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: '' })
    )

    await page.goto('/login')
    await page.waitForLoadState('domcontentloaded')
    await expect(page.getByTestId('login-page')).toBeVisible({
      timeout: ELEMENT_VISIBLE_TIMEOUT_MS,
    })

    await page.getByTestId('github-login-button').click()

    await page
      .waitForURL(/\/auth\/github(?:$|\?)/, { timeout: NAV_INTERCEPT_TIMEOUT_MS })
      .catch(() => {})
    expect(page.url()).toMatch(/\/auth\/github(?:$|\?)/)
  })

  test('completes full OAuth chain and lands on dashboard', async ({ page }, testInfo) => {
    if (testInfo.project.name === 'mobile-safari') {
      test.skip()
    }

    let refreshHeaders: Record<string, string> | null = null

    await page.route('**/auth/github', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: '' })
    )

    // route.fulfill() rejects 3xx outside Chromium, so absorb the callback
    // with a 200 and drive the next step via page.goto() (Login.spec.ts:131).
    await page.route('**/auth/github/callback*', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: '' })
    )

    await page.route('**/auth/refresh', (route) => {
      refreshHeaders = route.request().headers()
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ refreshed: true, onboarded: true }),
      })
    })

    await page.route('**/api/agent/token', (route) =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ token: 'fake-agent-token' }),
      })
    )

    await page.context().addCookies([
      {
        name: 'kc_auth',
        value: 'fake-jwt-cookie-value',
        domain: 'localhost',
        path: '/',
        httpOnly: true,
        secure: false,
        sameSite: 'Strict',
      },
    ])

    await page.goto('/login')
    await page.waitForLoadState('domcontentloaded')
    await expect(page.getByTestId('github-login-button')).toBeVisible({
      timeout: ELEMENT_VISIBLE_TIMEOUT_MS,
    })
    await page.getByTestId('github-login-button').click()

    await page.goto(
      `/auth/github/callback?code=${FAKE_OAUTH_CODE}&state=${FAKE_OAUTH_STATE}`
    )

    await page.goto(
      `/auth/callback?onboarded=true#kc_x=${encodeURIComponent(FAKE_ACCESS_TOKEN)}`
    )

    await expect(page.getByTestId('dashboard-page')).toBeVisible({
      timeout: ELEMENT_VISIBLE_TIMEOUT_MS,
    })

    // #6588: CSRF gate
    expect(refreshHeaders).not.toBeNull()
    expect(refreshHeaders!['x-requested-with']).toBe('XMLHttpRequest')

    // The HttpOnly kc_auth cookie must reach /auth/refresh; if AuthCallback
    // drops credentials: 'same-origin' the real flow breaks silently.
    expect(refreshHeaders!['cookie']).toBeDefined()
    expect(refreshHeaders!['cookie']).toContain('kc_auth=')

    // #4278: JWT must never appear in URL query; fragment must be stripped
    const finalUrl = page.url()
    expect(finalUrl).not.toMatch(/[?&]token=/i)
    expect(finalUrl).not.toMatch(/[?&]access_token=/i)
    expect(finalUrl).not.toContain('#kc_x=')

    const hasSession = await page.evaluate(() => localStorage.getItem('kc-has-session'))
    expect(hasSession).toBe('true')
  })

  test('OAuth error redirect surfaces actionable troubleshooting UI', async ({ page }) => {
    await page.goto(
      '/login?error=invalid_client&error_detail=GitHub+rejected+the+client+credentials'
    )
    await page.waitForLoadState('domcontentloaded')

    const errorBanner = page.getByTestId('oauth-error-banner')
    await expect(errorBanner).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    await expect(errorBanner).toContainText('Invalid OAuth Client Credentials')
    await expect(errorBanner).toContainText('GitHub rejected the client credentials')
    await expect(page).toHaveURL(/\/login/)
  })

  test('csrf_validation_failed error code renders the mapped session-expired UI', async ({
    page,
  }) => {
    await page.goto('/login?error=csrf_validation_failed')
    await page.waitForLoadState('domcontentloaded')

    const errorBanner = page.getByTestId('oauth-error-banner')
    await expect(errorBanner).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    await expect(errorBanner).toContainText('Login Session Expired')
    await expect(errorBanner).toContainText(/Try logging in again/i)
  })

  test('unknown error code falls back to a non-empty actionable message', async ({ page }) => {
    await page.goto('/login?error=some_brand_new_error_code_we_have_not_mapped')
    await page.waitForLoadState('domcontentloaded')

    const errorBanner = page.getByTestId('oauth-error-banner')
    await expect(errorBanner).toBeVisible({ timeout: ELEMENT_VISIBLE_TIMEOUT_MS })
    await expect(errorBanner).toContainText('Authentication Error')
    await expect(errorBanner).toContainText('some_brand_new_error_code_we_have_not_mapped')
  })
})

test.describe('OAuth flow - real backend', () => {
  test.use({ storageState: { cookies: [], origins: [] } })

  test.beforeEach(async ({ page }) => {
    const health = await page.request
      .get('/health')
      .then((r) => (r.ok() ? r.json() : null))
      .catch(() => null)
    test.skip(!health, 'Backend not reachable')
    test.skip(
      !health.oauth_configured,
      'OAuth not configured (GITHUB_CLIENT_ID unset)'
    )
  })

  test('/auth/github 307s to GitHub authorize URL with required params', async ({ page }) => {
    const response = await page.request.get('/auth/github', { maxRedirects: 0 })

    expect(response.status()).toBe(307)

    const location = response.headers()['location']
    expect(location).toBeDefined()
    expect(location).toMatch(/\/login\/oauth\/authorize/)

    const parsed = new URL(location!)
    const state = parsed.searchParams.get('state')
    expect(state).toBeTruthy()
    expect(state).toMatch(/^[0-9a-f-]{36}$/i)

    // Widening scope from user:email to repo/admin would be a security regression
    expect(parsed.searchParams.get('scope')).toBe('user:email')

    const redirectUri = parsed.searchParams.get('redirect_uri')
    expect(redirectUri).toBeTruthy()
    expect(redirectUri).toMatch(/\/auth\/github\/callback$/)

    expect(response.headers()['cache-control']).toContain('no-store')
  })

  test('/auth/github/callback rejects requests with no state', async ({ page }) => {
    const response = await page.request.get('/auth/github/callback?code=anything', {
      maxRedirects: 0,
    })

    expect(response.status()).toBe(307)
    const location = response.headers()['location']
    expect(location).toBeDefined()
    expect(location).toMatch(/\/login\?.*error=csrf_validation_failed/)
    expect(location).not.toMatch(/[?&]token=/i)
    expect(location).not.toMatch(/[?&]access_token=/i)
    expect(location).not.toContain('#kc_x=')
  })

  // Drives the full callback contract on the real backend: get a valid state
  // from /auth/github, then hit the callback so token exchange runs (and
  // fails with a fake code). The resulting error redirect must land on
  // /login?error=... with no credentials in the URL. Locks #4278 against
  // any future change to oauthErrorRedirect's URL construction.
  test('/auth/github/callback error redirect after token exchange leaks no credentials', async ({
    page,
  }) => {
    const init = await page.request.get('/auth/github', { maxRedirects: 0 })
    expect(init.status()).toBe(307)
    const authorizeUrl = new URL(init.headers()['location']!)
    const validState = authorizeUrl.searchParams.get('state')
    expect(validState).toBeTruthy()

    const callback = await page.request.get(
      `/auth/github/callback?code=invalid_test_code&state=${validState}`,
      { maxRedirects: 0 }
    )
    expect(callback.status()).toBe(307)

    const location = callback.headers()['location']
    expect(location).toBeDefined()
    expect(location).toMatch(/\/login\?.*error=/)
    expect(location).not.toMatch(/[?&]token=/i)
    expect(location).not.toMatch(/[?&]access_token=/i)
    expect(location).not.toContain('#kc_x=')

    expect(callback.headers()['cache-control']).toContain('no-store')
  })
})
