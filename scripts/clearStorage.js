#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Find the booted simulator
let simulatorUDID;
try {
  const output = execSync('xcrun simctl list devices | grep "Booted" | tail -1', { encoding: 'utf-8' });
  const match = output.match(/\(([A-F0-9\-]+)\)/);
  simulatorUDID = match ? match[1] : null;
} catch (e) {
  console.error('❌ No booted simulator found. Start the simulator first!');
  process.exit(1);
}

if (!simulatorUDID) {
  console.error('❌ Could not find booted simulator UDID');
  process.exit(1);
}

console.log(`📱 Found simulator: ${simulatorUDID}`);

// Path to AsyncStorage data
const simulatorPath = `${process.env.HOME}/Library/Developer/CoreSimulator/Devices/${simulatorUDID}`;
const appDataPath = `${simulatorPath}/data/Containers/Data/Application`;

if (!fs.existsSync(appDataPath)) {
  console.error(`❌ App data path not found: ${appDataPath}`);
  process.exit(1);
}

try {
  // Find the app folder (usually only one for chess app)
  const appFolders = fs.readdirSync(appDataPath);
  
  let found = false;
  for (const folder of appFolders) {
    const libraryPath = `${appDataPath}/${folder}/Library/RCTAsyncStorage_V1`;
    
    if (fs.existsSync(libraryPath)) {
      try {
        execSync(`rm -rf "${libraryPath}"`, { stdio: 'pipe' });
        console.log(`✅ Cleared AsyncStorage for app in ${folder}`);
        found = true;
      } catch (e) {
        console.error(`⚠️  Could not delete ${libraryPath}`);
      }
    }
  }
  
  if (found) {
    console.log('✅ AsyncStorage cleared!');
    console.log('📲 Reload the app (Cmd+R) to see the onboarding flow again.');
  } else {
    console.log('⚠️  No AsyncStorage data found (app may not have been run yet)');
  }
} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}
