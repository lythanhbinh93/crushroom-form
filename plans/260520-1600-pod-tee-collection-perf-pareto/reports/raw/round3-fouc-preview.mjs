#!/usr/bin/env node

import puppeteer from 'puppeteer';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const PREVIEW_URL = 'https://crushroom.myshopify.com';
const PREVIEW_THEME_ID = '158279991548';
const SCREENSHOTS_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fouc-check-preview');

const CHROME_PATH = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

async function ensureDir(dir) {
  try {
    await fs.mkdir(dir, { recursive: true });
  } catch (e) {
    // ignore
  }
}

async function captureLoadSequence() {
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-gpu', '--disable-web-resources'],
  });

  try {
    const page = await browser.newPage();
    page.setViewport({ width: 1366, height: 768 });

    const errors = [];
    const warnings = [];

    page.on('console', (msg) => {
      const text = msg.text();
      if (msg.type() === 'error') {
        errors.push(text);
      } else if (msg.type() === 'warn') {
        warnings.push(text);
      }
    });

    page.on('response', (response) => {
      if (response.status() >= 400 && !response.url().includes('analytics')) {
        errors.push(`HTTP ${response.status()}: ${response.url()}`);
      }
    });

    // Set cookie for preview theme
    await page.setCookie({
      name: 'preview_theme_id',
      value: PREVIEW_THEME_ID,
      domain: '.myshopify.com',
      path: '/',
    });

    console.log(`Loading preview URL with theme ID ${PREVIEW_THEME_ID}...`);
    try {
      await page.goto(`${PREVIEW_URL}?preview_theme_id=${PREVIEW_THEME_ID}`, {
        waitUntil: 'load',
        timeout: 30000,
      });
    } catch (e) {
      console.log(`  Note: goto timed out, but content may have loaded`);
    }

    // Capture at load event
    console.log('Taking screenshot at load event...');
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, 'fouc-01-at-load.png'),
      fullPage: true,
    });

    // Wait 50ms
    await new Promise(resolve => setTimeout(resolve, 50));
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, 'fouc-02-at-50ms.png'),
      fullPage: true,
    });

    // Wait 200ms
    await new Promise(resolve => setTimeout(resolve, 150));
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, 'fouc-03-at-200ms.png'),
      fullPage: true,
    });

    // Wait 1000ms
    await new Promise(resolve => setTimeout(resolve, 800));
    await page.screenshot({
      path: path.join(SCREENSHOTS_DIR, 'fouc-04-at-1000ms.png'),
      fullPage: true,
    });

    console.log('✓ FOUC capture complete');

    // Test interactive features
    console.log('\nTesting interactive features...');

    // Click cart icon
    try {
      await page.click('[data-cart-icon], .Header__CartIcon, .js-drawer-open-cart, a[href="/cart"]', {
        timeout: 5000,
      });
      await new Promise(resolve => setTimeout(resolve, 500));
      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, 'interactive-cart-drawer-open.png'),
        fullPage: true,
      });
      console.log('✓ Cart drawer interaction tested');
    } catch (e) {
      warnings.push(`Cart click failed: ${e.message}`);
    }

    // Test search
    try {
      await page.click('[data-search-icon], .Header__SearchIcon, .js-drawer-open-search, button[aria-label*="Search"]', {
        timeout: 5000,
      });
      await new Promise(resolve => setTimeout(resolve, 500));
      await page.screenshot({
        path: path.join(SCREENSHOTS_DIR, 'interactive-search-panel.png'),
        fullPage: true,
      });
      console.log('✓ Search panel interaction tested');
    } catch (e) {
      warnings.push(`Search click failed: ${e.message}`);
    }

    // Test product card hover
    try {
      const productCard = '.ProductCard, .product-card, .product-item, [data-product-card]';
      const element = await page.$(productCard);
      if (element) {
        await element.hover();
        await new Promise(resolve => setTimeout(resolve, 300));
        console.log('✓ Product card hover tested');
      } else {
        warnings.push('No product card found to hover');
      }
    } catch (e) {
      warnings.push(`Product hover failed: ${e.message}`);
    }

    // Save console output
    const consoleLog = {
      timestamp: new Date().toISOString(),
      url: PREVIEW_URL,
      themeId: PREVIEW_THEME_ID,
      errors: errors.filter(e => e && !e.includes('analytics')),
      warnings,
      errorCount: errors.filter(e => e && !e.includes('analytics')).length,
      warningCount: warnings.length,
    };

    await fs.writeFile(
      path.join(SCREENSHOTS_DIR, 'console-log.json'),
      JSON.stringify(consoleLog, null, 2)
    );

    console.log(
      `\n✓ Console log saved (${consoleLog.errorCount} errors, ${consoleLog.warningCount} warnings)`
    );

    await page.close();
  } finally {
    await browser.close();
  }
}

async function main() {
  await ensureDir(SCREENSHOTS_DIR);
  try {
    await captureLoadSequence();
    console.log('\n✓ All tests completed');
    process.exit(0);
  } catch (err) {
    console.error('FOUC test failed:', err.message);
    process.exit(1);
  }
}

main();
