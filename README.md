# Tactical Tutor AI - Simplified Chatbot Edition

A streamlined React Native chess coaching app featuring an AI chatbot and minimal setup flow.

## 🎯 What's Included

- **Chatbot Screen**: Ask your chess coach questions about positions, tactics, and gameplay
- **Minimal Onboarding**: 
  - Quick intro carousel explaining the concept
  - Optional Chess.com username linking (for personalized analysis)
  - Simple completion screen

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- Expo CLI (`npm install -g expo-cli`)
- iOS Simulator or Android Emulator (or Expo Go app on physical device)

### Installation

```bash
# Install dependencies
npm install

# Start the development server
npm start

# For iOS
npm run ios

# For Android
npm run android

# For web
npm run web
```

## 📁 Project Structure

```
src/
├── components/
│   ├── chess/
│   │   └── Board.tsx              # Chess board display component
│   ├── MarkdownMessage.tsx         # Renders formatted chat messages
│   ├── ScreenHeader.tsx            # Screen title/header component
│   └── ui/
│       └── Button.tsx              # Reusable button component
├── lib/
│   ├── api.ts                      # Backend API calls (ask/poll)
│   └── analytics.ts                # Analytics tracking
├── navigation/
│   └── OnboardingStack.tsx          # Onboarding flow navigation
├── screens/
│   ├── AskCoach.tsx               # Main chatbot screen
│   ├── OnboardingIntro.tsx         # Feature intro carousel
│   ├── ChessComUsername.tsx        # Username linking screen
│   └── OnboardingDone.tsx          # Onboarding completion
├── theme.ts                        # Color and style constants
├── types/
│   └── svg.d.ts                   # SVG type definitions
└── App.tsx                         # Root app component

App Flow:
- On first launch → OnboardingStack (intro → username linking → done)
- After onboarding → AskCoach (main chatbot screen)
```

## 🔄 User Flow

### First Launch (Onboarding)
1. **Intro Screen** - Carousel explaining the coaching concept
2. **Username Screen** - Optional connection to Chess.com account
3. **Done Screen** - Transition to main app
4. **Chat Screen** - Ready to interact with the coach

### After Onboarding
- User goes directly to the Chat screen
- Can ask the coach questions about chess
- Responses are streamed token-by-token for smooth UX

## 🛠️ Key Features

### Chatbot (AskCoach)
- Real-time token streaming from backend
- Markdown-formatted responses
- Message history display
- Typing indicator while coach responds
- Input validation and send throttling

### Backend Integration
- `/ask` endpoint - Submit a question
- `/poll` endpoint - Stream response tokens with cursor pagination
- Chess.com API integration - Optional player profile lookup

## 📦 Dependencies

### Core
- `react` - React framework
- `react-native` - Mobile framework
- `expo` - Managed React Native platform

### Navigation
- `@react-navigation/native` - Navigation library
- `@react-navigation/native-stack` - Stack navigator

### UI/Display
- `lucide-react-native` - Icons
- `react-native-markdown-display` - Markdown rendering
- `react-native-svg` - SVG rendering (chess pieces)

### Storage
- `@react-native-async-storage/async-storage` - Local data persistence

### Other
- `react-native-gesture-handler` - Gesture handling
- `react-native-reanimated` - Animation library
- `react-native-screens` - Screen management
- `react-native-safe-area-context` - Safe area handling

## 🎨 Customization

### Colors & Styling
Edit `src/theme.ts` to customize:
- Coach primary color
- Background colors
- Text colors
- Border radius
- Spacing values

### API Configuration
Set custom backend URL in `src/lib/api.ts`:
```typescript
setApiBaseUrl('https://your-backend.com');
```

## 🔒 Storage

The app stores:
- `onboardingComplete` - Flag indicating setup completion
- `chesscom.username` - Chess.com username (if provided)
- `chesscom.avatar` - User avatar URL

## 📝 Notes

- This is a simplified version focusing on the chatbot experience
- Removed: home screen, game review, progress tracking, study plans, settings
- The onboarding can be easily extended by adding new screens to `OnboardingStack.tsx`
- Backend connection required for full functionality

## 🚀 Deployment

Build for production:
```bash
eas build --platform ios
eas build --platform android
```

## 📄 License

See LICENSE file for details