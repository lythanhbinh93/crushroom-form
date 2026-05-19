// Programmatic Lighthouse mobile run.
// Uses chrome-launcher (Lighthouse's documented companion) instead of Puppeteer.
// Default Lighthouse mobile config = Moto G4 form factor, Slow 4G throttle, 4x CPU.

import lighthouse from 'lighthouse';
import { launch } from 'chrome-launcher';

export async function runLighthouseMobile(url, opts = {}) {
  const chrome = await launch({
    chromeFlags: [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--disable-dev-shm-usage',
      '--disable-extensions',
      '--disable-background-networking',
    ],
  });

  try {
    const result = await lighthouse(
      url,
      {
        port: chrome.port,
        output: 'json',
        logLevel: opts.verbose ? 'info' : 'error',
        onlyCategories: ['performance'],
      },
      {
        extends: 'lighthouse:default',
        settings: {
          formFactor: 'mobile',
          screenEmulation: {
            mobile: true,
            width: 412,
            height: 823,
            deviceScaleFactor: 1.75,
            disabled: false,
          },
          throttling: {
            rttMs: 150,
            throughputKbps: 1638,
            cpuSlowdownMultiplier: 4,
            requestLatencyMs: 562.5,
            downloadThroughputKbps: 1474.56,
            uploadThroughputKbps: 675,
          },
          throttlingMethod: 'simulate',
          emulatedUserAgent:
            'Mozilla/5.0 (Linux; Android 11; moto g power (2022)) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36',
        },
      },
    );
    if (!result || !result.lhr) {
      throw new Error('Lighthouse returned no LHR');
    }
    return result.lhr;
  } finally {
    // chrome-launcher's temp-profile rmSync fails on Windows when Chromium
    // hasn't released file handles yet. The process IS killed; swallow the
    // cleanup error so it doesn't drop the LHR result.
    try {
      await chrome.kill();
    } catch (err) {
      if (err?.code !== 'EPERM' && err?.code !== 'EBUSY') {
        // Re-throw anything else.
        throw err;
      }
    }
  }
}
