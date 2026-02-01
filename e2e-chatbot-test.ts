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

async function runChatbotTests() {
  console.log('Starting Chatbot E2E Tests...\n');
  console.log('Using pre-analyzed games for: midnightcontender\n');
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
    // Set up localStorage to simulate returning user with pre-analyzed games
    await page.goto(BASE_URL);
    await page.evaluate(() => {
      localStorage.setItem('userId', 'chesscom-midnightcontender');
      localStorage.setItem('chesscom.username', 'midnightcontender');
      localStorage.setItem('onboardingComplete', 'true');
    });

    // Navigate directly to chat
    console.log('Navigating to chat page...');
    await page.goto(`${BASE_URL}/chat`);
    await page.waitForLoadState('networkidle');
    await sleep(1000);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '01-chat-ready.png') });
    console.log('  Screenshot: 01-chat-ready.png\n');

    // Test each question
    console.log('=== Testing Chatbot Questions ===\n');

    for (let i = 0; i < TEST_QUESTIONS.length; i++) {
      const question = TEST_QUESTIONS[i];
      console.log(`Question ${i + 1}: "${question}"`);
      const startTime = Date.now();

      // Type and send question
      const textarea = await page.waitForSelector('textarea');
      await textarea.fill(question);

      // Find and click send button
      const sendBtn = await page.$('button:has(svg.lucide-send)') ||
                      await page.$('button[type="submit"]:has(svg)') ||
                      await page.$('button.bg-coach-primary');

      if (sendBtn) {
        await sendBtn.click();
      } else {
        // Fallback: press Enter
        await textarea.press('Enter');
      }

      console.log('  Sent, waiting for response...');

      // Wait for response - check every 5 seconds
      let responseComplete = false;
      let lastContentLength = 0;
      let stableCount = 0;

      for (let attempt = 0; attempt < 36; attempt++) { // Max 3 minutes
        await sleep(5000);

        const elapsed = Math.round((Date.now() - startTime) / 1000);

        // Check for typing indicator
        const typing = await page.$('text=Coach is thinking');

        // Get response content
        const messages = await page.$$('div.bg-white.rounded-2xl');
        const lastMsg = messages.length > 0 ? messages[messages.length - 1] : null;
        const content = lastMsg ? await lastMsg.textContent() || '' : '';

        if (typing) {
          console.log(`  [${elapsed}s] Still thinking...`);
          stableCount = 0;
        } else if (content.length > 20) {
          if (content.length === lastContentLength) {
            stableCount++;
            if (stableCount >= 2) {
              responseComplete = true;
              console.log(`  [${elapsed}s] Response complete (${content.length} chars)`);
              break;
            }
          } else {
            stableCount = 0;
          }
          console.log(`  [${elapsed}s] Content: ${content.length} chars`);
        }

        lastContentLength = content.length;
      }

      // Take screenshot
      const screenshotPath = path.join(SCREENSHOTS_DIR, `0${i + 2}-question-${i + 1}.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.log(`  Screenshot: 0${i + 2}-question-${i + 1}.png`);

      // Get and evaluate response
      const messages = await page.$$('div.bg-white.rounded-2xl');
      if (messages.length > 0) {
        const lastMsg = messages[messages.length - 1];
        const responseText = await lastMsg.textContent() || '';

        console.log(`  Response: "${responseText.substring(0, 120)}..."`);

        // Quality checks
        if (responseText.includes("don't have relevant data") &&
            responseText.split("don't have relevant data").length > 2) {
          console.log('  ⚠️  WARNING: Malformed "no data" response detected');
        } else if (responseText.includes('error') || responseText.includes('Error')) {
          console.log('  ❌ ERROR: Response contains error message');
        } else if (responseText.length < 50) {
          console.log('  ⚠️  WARNING: Response seems too short');
        } else {
          console.log('  ✅ Response looks good');
        }
      }

      if (!responseComplete) {
        console.log('  ⚠️  WARNING: Response may not have fully completed');
      }

      console.log('');
      await sleep(1000);
    }

    // Final screenshot
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '05-final-state.png'), fullPage: true });
    console.log('Final screenshot: 05-final-state.png');

  } catch (err) {
    console.error('\nTest error:', err);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'error-state.png') });
  } finally {
    console.log('\n=== Chatbot Tests Complete ===');
    await browser.close();
  }
}

runChatbotTests();
