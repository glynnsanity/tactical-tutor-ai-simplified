import { chromium, Browser, Page } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const SCREENSHOTS_DIR = path.join(process.cwd(), 'test-screenshots');
const BASE_URL = 'http://localhost:3000';

const TEST_QUESTIONS = [
  'What are my biggest weaknesses based on my recent games?',
  'How can I improve my endgame?',
  'What openings would you recommend for my skill level?',
];

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTests() {
  console.log('Starting E2E tests for Chess Coach chatbot...\n');
  fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

  const browser: Browser = await chromium.launch({
    headless: false,
    slowMo: 50
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 }
  });

  const page = await context.newPage();

  try {
    // Step 1: Navigate to onboarding
    console.log('Step 1: Navigating to onboarding page...');
    await page.goto(`${BASE_URL}/onboarding`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '01-onboarding-page.png') });
    console.log('  Screenshot: 01-onboarding-page.png');

    // Step 2: Enter username
    console.log('\nStep 2: Entering username "midnightcontender"...');
    await page.fill('input[placeholder*="Chess.com username"]', 'midnightcontender');
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '02-username-entered.png') });
    console.log('  Screenshot: 02-username-entered.png');

    // Step 3: Validate username
    console.log('\nStep 3: Clicking "Find my account"...');
    await page.click('button:has-text("Find my account")');
    await page.waitForSelector('button:has-text("Get Started")', { timeout: 20000 });
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '03-username-validated.png') });
    console.log('  Screenshot: 03-username-validated.png');

    // Step 4: Click Get Started and wait for import
    console.log('\nStep 4: Clicking "Get Started" and waiting for game import...');
    console.log('  (This may take several minutes for Stockfish analysis)');
    await page.click('button:has-text("Get Started")');

    // Wait for redirect to chat - up to 7 minutes
    const maxWaitTime = 7 * 60 * 1000; // 7 minutes
    const checkInterval = 15 * 1000; // 15 seconds
    const startTime = Date.now();
    let redirected = false;

    while (Date.now() - startTime < maxWaitTime) {
      const currentUrl = page.url();
      console.log(`  [${Math.round((Date.now() - startTime) / 1000)}s] Current URL: ${currentUrl}`);

      if (currentUrl.includes('/chat')) {
        redirected = true;
        console.log('  SUCCESS: Redirected to chat page!');
        break;
      }

      await sleep(checkInterval);
    }

    if (!redirected) {
      console.log('  TIMEOUT: Did not redirect to chat after 7 minutes');
      await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '04-timeout-state.png') });
      console.log('  Screenshot: 04-timeout-state.png');
      await browser.close();
      return;
    }

    await sleep(2000); // Let chat page fully load
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '04-chat-page.png') });
    console.log('  Screenshot: 04-chat-page.png');

    // Step 5: Test each question
    console.log('\n=== Starting Chat Tests ===\n');

    for (let i = 0; i < TEST_QUESTIONS.length; i++) {
      const question = TEST_QUESTIONS[i];
      console.log(`\nQuestion ${i + 1}: "${question}"`);
      const qStartTime = Date.now();

      // Type and send question
      await page.fill('textarea', question);
      await page.click('button:has(svg.lucide-send), button[type="submit"]:has(svg)');
      console.log('  Sent question, waiting for response...');

      // Wait for response - check every 10 seconds for up to 3 minutes
      const responseMaxWait = 3 * 60 * 1000;
      const responseCheckInterval = 10 * 1000;
      let responseReceived = false;
      let lastContentLength = 0;

      while (Date.now() - qStartTime < responseMaxWait) {
        // Check if typing indicator is visible
        const typing = await page.$('text=Coach is thinking');

        // Get all assistant messages
        const messages = await page.$$('div.bg-white');
        const lastMessage = messages.length > 0 ? messages[messages.length - 1] : null;
        const content = lastMessage ? await lastMessage.textContent() : '';

        const elapsed = Math.round((Date.now() - qStartTime) / 1000);

        if (typing) {
          console.log(`  [${elapsed}s] Still thinking... (content: ${content?.length || 0} chars)`);
        } else if (content && content.length > 20 && content.length === lastContentLength) {
          // Content stopped growing and typing indicator gone
          responseReceived = true;
          console.log(`  [${elapsed}s] Response complete! (${content.length} chars)`);
          break;
        } else {
          console.log(`  [${elapsed}s] Content growing... (${content?.length || 0} chars)`);
        }

        lastContentLength = content?.length || 0;
        await sleep(responseCheckInterval);
      }

      // Take screenshot
      const screenshotPath = path.join(SCREENSHOTS_DIR, `05-question-${i + 1}-response.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.log(`  Screenshot: 05-question-${i + 1}-response.png`);

      // Get final response text
      const messages = await page.$$('div.bg-white.rounded-2xl');
      if (messages.length > 0) {
        const lastMsg = messages[messages.length - 1];
        const responseText = await lastMsg.textContent();
        console.log(`  Response preview: "${responseText?.substring(0, 150)}..."`);

        // Quick quality check
        if (responseText && responseText.includes('focus on central control')) {
          console.log('  WARNING: Response appears to be generic mock response');
        }
      }

      if (!responseReceived) {
        console.log('  WARNING: Response may not have completed');
      }

      // Wait a bit before next question
      await sleep(2000);
    }

    // Final screenshot
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '06-final-state.png'), fullPage: true });
    console.log('\n  Final screenshot: 06-final-state.png');

  } catch (err) {
    console.error('\nTest error:', err);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'error-state.png') });
  } finally {
    console.log('\n=== Test Complete ===');
    await browser.close();
  }
}

runTests();
