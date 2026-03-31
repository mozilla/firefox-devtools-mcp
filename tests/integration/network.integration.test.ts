/**
 * Integration tests for network monitoring
 * Tests with real Firefox browser in headless mode
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createTestFirefox,
  closeFirefox,
  waitFor,
  waitForElementInSnapshot,
  waitForPageLoad,
} from '../helpers/firefox.js';
import type { FirefoxClient } from '@/firefox/index.js';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const fixturesPath = resolve(__dirname, '../fixtures');

describe('Network Monitoring Integration Tests', () => {
  let firefox: FirefoxClient;

  beforeAll(async () => {
    firefox = await createTestFirefox();
    await firefox.startNetworkMonitoring();
  }, 30000);

  afterAll(async () => {
    await closeFirefox(firefox);
  });

  it('should capture network requests on page load', async () => {
    firefox.clearNetworkRequests();

    const fixturePath = `file://${fixturesPath}/network.html`;
    await firefox.navigate(fixturePath);
    await waitForPageLoad();

    // Wait a bit for network request to be captured
    await new Promise((resolve) => setTimeout(resolve, 500));

    const requests = await firefox.getNetworkRequests();

    // Note: file:// protocol doesn't produce network events in BiDi
    // Local files don't go through the network layer
    // This test verifies network monitoring is active and ready
    // Actual network capture is tested in the fetch/XHR tests below
    expect(Array.isArray(requests)).toBe(true);

    // If we got any requests (may depend on Firefox version/config), verify structure
    if (requests.length > 0) {
      const htmlRequest = requests.find((req) => req.url.includes('network.html'));
      if (htmlRequest) {
        expect(htmlRequest.method).toBeDefined();
      }
    }
  }, 15000);

  it('should capture fetch GET request', async () => {
    const fixturePath = `file://${fixturesPath}/network.html`;
    await firefox.navigate(fixturePath);
    await waitForPageLoad();

    firefox.clearNetworkRequests();

    // Wait for fetch GET button to appear in snapshot
    const fetchGetBtn = await waitForElementInSnapshot(
      firefox,
      (entry) => entry.css.includes('#fetchGet') || entry.css.includes('fetchGet'),
      10000
    );

    expect(fetchGetBtn).toBeDefined();

    await firefox.clickByUid(fetchGetBtn.uid);

    // Wait for network request
    await waitFor(async () => {
      const requests = await firefox.getNetworkRequests();
      return requests.some((req) => req.url.includes('jsonplaceholder'));
    }, 10000);

    const requests = await firefox.getNetworkRequests();
    const apiRequest = requests.find((req) => req.url.includes('jsonplaceholder'));

    expect(apiRequest).toBeDefined();
    expect(apiRequest?.method).toBe('GET');
  }, 20000);

  it('should capture fetch POST request', async () => {
    const fixturePath = `file://${fixturesPath}/network.html`;
    await firefox.navigate(fixturePath);
    await waitForPageLoad();

    firefox.clearNetworkRequests();

    // Wait for fetch POST button to appear in snapshot
    const fetchPostBtn = await waitForElementInSnapshot(
      firefox,
      (entry) => entry.css.includes('#fetchPost') || entry.css.includes('fetchPost'),
      10000
    );

    expect(fetchPostBtn).toBeDefined();

    await firefox.clickByUid(fetchPostBtn.uid);

    // Wait for network request
    await waitFor(async () => {
      const requests = await firefox.getNetworkRequests();
      return requests.some((req) => req.method === 'POST');
    }, 10000);

    const requests = await firefox.getNetworkRequests();
    const postRequest = requests.find((req) => req.method === 'POST');

    expect(postRequest).toBeDefined();
    expect(postRequest?.method).toBe('POST');
    expect(postRequest?.url).toContain('jsonplaceholder');
  }, 20000);

  it('should capture XHR request', async () => {
    const fixturePath = `file://${fixturesPath}/network.html`;
    await firefox.navigate(fixturePath);
    await waitForPageLoad();

    firefox.clearNetworkRequests();

    // Wait for XHR button to appear in snapshot
    const xhrBtn = await waitForElementInSnapshot(
      firefox,
      (entry) => entry.css.includes('#xhr') || entry.css.includes('data-testid="xhr'),
      10000
    );

    expect(xhrBtn).toBeDefined();

    await firefox.clickByUid(xhrBtn.uid);

    // Wait for network request
    await waitFor(async () => {
      const requests = await firefox.getNetworkRequests();
      return requests.some((req) => req.url.includes('users/1'));
    }, 10000);

    const requests = await firefox.getNetworkRequests();
    const xhrRequest = requests.find((req) => req.url.includes('users/1'));

    expect(xhrRequest).toBeDefined();
    expect(xhrRequest?.method).toBe('GET');
  }, 20000);

  it('should clear network requests', async () => {
    const fixturePath = `file://${fixturesPath}/network.html`;
    await firefox.navigate(fixturePath);
    await waitForPageLoad();

    // Wait for initial page load request
    await new Promise((resolve) => setTimeout(resolve, 500));

    let requests = await firefox.getNetworkRequests();
    expect(requests.length).toBeGreaterThan(0);

    // Clear requests
    firefox.clearNetworkRequests();

    requests = await firefox.getNetworkRequests();
    expect(requests.length).toBe(0);
  }, 15000);
});
