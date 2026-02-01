import { chromium, Browser, Page } from '@playwright/test';
import * as path from 'path';

const SCREENSHOTS_DIR = path.join(process.cwd(), 'test-screenshots');
const BASE_URL = 'http://localhost:3000';

const TEST_QUESTIONS = [
  'What are my biggest weaknesses based on my recent games?',
  'How can I improve my endgame?',
  'What openings would you recommend for my skill level?',
];

interface TestResult {
  question: string;
  response: string;
  screenshotPath: string;
  responseTime: number;
  issues: string[];
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function waitForResponse(page: Page, maxWaitTime = 60000): Promise<string> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitTime) {
    // Check if typing indicator is gone
    const typingIndicator = await page.$('text=Coach is thinking');

    if (!typingIndicator) {
      // Get the last assistant message
      const messages = await page.$$('[class*="bg-white"][class*="rounded"]');
      if (messages.length > 0) {
        const lastMessage = messages[messages.length - 1];
        const content = await lastMessage.textContent();
        if (content && content.trim().length > 0) {
          return content.trim();
        }
      }
    }

    await sleep(500);
  }

  return 'TIMEOUT: No response received';
}

async function runTests() {
  console.log('Starting E2E tests for Chess Coach chatbot...\n');

  const browser: Browser = await chromium.launch({
    headless: false,
    slowMo: 100
  });

  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 }
  });

  const page = await context.newPage();
  const results: TestResult[] = [];
  const issues: string[] = [];

  try {
    // Step 1: Navigate to onboarding
    console.log('Step 1: Navigating to onboarding page...');
    await page.goto(`${BASE_URL}/onboarding`);
    await page.waitForLoadState('networkidle');
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '01-onboarding-page.png') });
    console.log('  Screenshot saved: 01-onboarding-page.png');

    // Step 2: Enter username
    console.log('\nStep 2: Entering username "midnightcontender"...');
    const usernameInput = await page.waitForSelector('input[placeholder*="Chess.com username"]');
    await usernameInput.fill('midnightcontender');
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '02-username-entered.png') });
    console.log('  Screenshot saved: 02-username-entered.png');

    // Step 3: Validate username
    console.log('\nStep 3: Validating username...');
    const findAccountBtn = await page.waitForSelector('button:has-text("Find my account")');
    await findAccountBtn.click();

    // Wait for validation
    await page.waitForSelector('[class*="text-green"], button:has-text("Get Started")', { timeout: 15000 });
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '03-username-validated.png') });
    console.log('  Screenshot saved: 03-username-validated.png');

    // Step 4: Click Get Started
    console.log('\nStep 4: Clicking "Get Started" to import games...');
    const getStartedBtn = await page.waitForSelector('button:has-text("Get Started")');
    await getStartedBtn.click();

    // Wait for ingestion and redirect to chat
    console.log('  Waiting for game import (this may take a moment)...');
    await page.waitForURL('**/chat', { timeout: 60000 });
    await sleep(2000); // Allow page to fully load
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '04-chat-page.png') });
    console.log('  Screenshot saved: 04-chat-page.png');

    // Step 5: Test each question
    console.log('\n=== Starting Chat Tests ===\n');

    for (let i = 0; i < TEST_QUESTIONS.length; i++) {
      const question = TEST_QUESTIONS[i];
      console.log(`Test ${i + 1}: "${question}"`);

      const startTime = Date.now();
      const questionIssues: string[] = [];

      // Type and send question
      const textarea = await page.waitForSelector('textarea');
      await textarea.fill(question);

      const sendBtn = await page.waitForSelector('button:has(svg)');
      await sendBtn.click();

      console.log('  Waiting for response...');

      // Wait for response to complete
      await sleep(1000); // Initial delay for request to start

      // Wait for typing indicator to appear and then disappear
      try {
        await page.waitForSelector('text=Coach is thinking', { timeout: 5000 });
      } catch {
        // Typing indicator may not always appear
      }

      // Wait for response to complete (no more typing indicator)
      let response = '';
      let attempts = 0;
      const maxAttempts = 120; // 60 seconds max

      while (attempts < maxAttempts) {
        const typing = await page.$('text=Coach is thinking');
        if (!typing) {
          // Get all assistant messages
          const assistantMsgs = await page.$$('div.bg-white.rounded-2xl.p-4');
          if (assistantMsgs.length > 0) {
            const lastMsg = assistantMsgs[assistantMsgs.length - 1];
            const content = await lastMsg.textContent();
            if (content && content.length > 10) {
              response = content;
              break;
            }
          }
        }
        await sleep(500);
        attempts++;
      }

      const responseTime = Date.now() - startTime;

      // Take screenshot
      const screenshotPath = path.join(SCREENSHOTS_DIR, `05-question-${i + 1}-response.png`);
      await page.screenshot({ path: screenshotPath, fullPage: true });
      console.log(`  Screenshot saved: 05-question-${i + 1}-response.png`);

      // Evaluate response quality
      if (!response || response.length < 20) {
        questionIssues.push('Response is too short or empty');
      }

      if (response.includes('error') || response.includes('Error')) {
        questionIssues.push('Response contains error message');
      }

      if (response.includes('Sorry, something went wrong')) {
        questionIssues.push('API error occurred');
      }

      if (responseTime > 30000) {
        questionIssues.push(`Slow response time: ${(responseTime / 1000).toFixed(1)}s`);
      }

      // Check for generic/non-personalized responses
      if (response.includes('focus on central control, king safety') && !response.includes('midnightcontender')) {
        questionIssues.push('Response appears to be mock/generic (not personalized)');
      }

      results.push({
        question,
        response: response.substring(0, 500) + (response.length > 500 ? '...' : ''),
        screenshotPath,
        responseTime,
        issues: questionIssues,
      });

      console.log(`  Response time: ${(responseTime / 1000).toFixed(1)}s`);
      console.log(`  Response preview: "${response.substring(0, 100)}..."`);
      if (questionIssues.length > 0) {
        console.log(`  Issues found: ${questionIssues.join(', ')}`);
        issues.push(...questionIssues.map(issue => `Q${i + 1}: ${issue}`));
      }
      console.log('');

      // Small delay between questions
      await sleep(1000);
    }

    // Final summary screenshot
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, '06-final-state.png'), fullPage: true });

  } catch (err) {
    console.error('Test error:', err);
    await page.screenshot({ path: path.join(SCREENSHOTS_DIR, 'error-state.png') });
    issues.push(`Test execution error: ${err}`);
  } finally {
    await browser.close();
  }

  // Print summary
  console.log('\n=== TEST SUMMARY ===\n');
  console.log(`Total questions tested: ${results.length}`);
  console.log(`Total issues found: ${issues.length}`);

  if (issues.length > 0) {
    console.log('\nIssues:');
    issues.forEach((issue, i) => console.log(`  ${i + 1}. ${issue}`));
  }

  console.log('\nDetailed Results:');
  results.forEach((result, i) => {
    console.log(`\n${i + 1}. "${result.question}"`);
    console.log(`   Response time: ${(result.responseTime / 1000).toFixed(1)}s`);
    console.log(`   Screenshot: ${result.screenshotPath}`);
    console.log(`   Response: ${result.response.substring(0, 200)}...`);
    if (result.issues.length > 0) {
      console.log(`   Issues: ${result.issues.join(', ')}`);
    }
  });

  return { results, issues };
}

// Create screenshots directory and run
import * as fs from 'fs';
fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

runTests()
  .then(({ results, issues }) => {
    console.log('\n=== Tests completed ===');
    process.exit(issues.length > 0 ? 1 : 0);
  })
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
