# 💰 FTS - Financial Tracking System

A modern, intuitive Progressive Web App (PWA) for personal finance management with AI-powered insights and cloud synchronization.

![FTS Banner](https://img.shields.io/badge/FTS-Financial_Tracking_System-blue?style=for-the-badge)
![Version](https://img.shields.io/badge/version-0.0.1-green?style=for-the-badge)
![PWA](https://img.shields.io/badge/PWA-Ready-purple?style=for-the-badge)

## ✨ Features

### 📊 **Core Tracking**
- **Daily Balance Management**: Track your starting balance and see real-time remaining amounts
- **Smart Balance Continuation**: Automatically continue with yesterday's ending balance
- **Income & Expense Tracking**: Categorized transactions with intuitive icons
- **Historical Data**: Browse and manage past days with full transaction history

### 💳 **Debt & Credit Management**
- **Debt Tracking**: Monitor money you owe to others
- **Borrowed Money**: Keep track of money lent to others
- **Balance Impact**: Automatic adjustment of your overall financial picture

### 🤖 **AI-Powered Advisor**
- **Smart Financial Insights**: AI advisor analyzes your spending patterns
- **Personalized Recommendations**: Get tailored advice based on your financial habits
- **Spending Analysis**: Understand where your money goes

### ☁️ **Cloud Synchronization**
- **Cross-Device Sync**: Access your data from any device
- **Supabase Integration**: Secure cloud storage and real-time synchronization
- **Offline-First**: Works seamlessly offline, syncs when connected

### 📱 **Progressive Web App**
- **Installable**: Install as a native app on any device
- **Offline Support**: Full functionality without internet connection
- **Mobile Optimized**: Touch-friendly interface designed for mobile
- **App Shortcuts**: Quick access to key features

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ 
- npm or yarn package manager

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/78777866/FTS.git
   cd FTS
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   ```
   Add your Supabase credentials:
   ```env
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

4. **Start development server**
   ```bash
   npm run dev
   ```

5. **Open your browser**
   Navigate to `http://localhost:5173`

## 🛠️ Tech Stack

### **Frontend**
- **React 18** - Modern UI library with hooks
- **TypeScript** - Type-safe development
- **Tailwind CSS** - Utility-first styling
- **Vite** - Fast build tool and dev server

### **UI Components**
- **Radix UI** - Unstyled, accessible components
- **Lucide React** - Beautiful icon library
- **React Day Picker** - Date selection
- **React Markdown** - Markdown rendering

### **Backend & Data**
- **Supabase** - Backend as a service
- **localStorage** - Client-side data persistence
- **Real-time sync** - Cross-device synchronization

### **PWA Features**
- **Service Worker** - Offline functionality
- **Web Manifest** - Native app experience
- **Background Sync** - Data synchronization

## 📱 Usage

### Daily Tracking
1. **Set Starting Balance**: Enter your balance for the day
2. **Add Transactions**: Record income and expenses with categories
3. **Monitor Remaining**: See your real-time remaining balance
4. **View History**: Browse previous days' data

### Debt Management
- **Track Debts**: Record money you owe to others
- **Monitor Borrowed**: Keep tabs on money you've lent
- **See Impact**: Understand how debts affect your overall finances

### AI Advisor
- **Get Insights**: Receive AI-powered financial advice
- **Analyze Spending**: Understand your spending patterns
- **Set Goals**: Get help with financial planning

## 📁 Project Structure

```
FTS/
├── public/                 # Static assets
│   ├── icons/             # PWA icons
│   ├── manifest.json      # Web app manifest
│   └── sw.js             # Service worker
├── src/
│   ├── components/       # React components
│   │   ├── ui/          # Reusable UI components
│   │   └── icons/       # Icon components
│   ├── lib/             # Utility functions
│   │   ├── storage.ts   # Data persistence
│   │   ├── supabase.ts  # Database client
│   │   ├── sync.ts      # Cloud synchronization
│   │   └── ai.ts        # AI integration
│   └── App.tsx          # Main application
├── supabase/
│   └── migrations/      # Database schema
└── build/               # Production build
```

## 🚀 Deployment

### Quick Deploy to Netlify

1. **Build the project**
   ```bash
   npm run build
   ```

2. **Deploy**
   - Connect your GitHub repo to Netlify
   - Or drag and drop the `dist` folder
   - Or use: `netlify deploy --prod --dir=dist`

3. **Configure environment variables** in Netlify dashboard:
   ```
   VITE_SUPABASE_URL=your_supabase_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
   ```

For detailed deployment instructions, see [DEPLOYMENT.md](DEPLOYMENT.md)

## 🔧 Configuration

### Supabase Setup
1. Create a new Supabase project
2. Run the migrations in `supabase/migrations/`
3. Add your project URL and anon key to `.env`

### AI Features
Configure AI providers in the app:
- OpenRouter API for AI advisor
- Custom prompts and model selection

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **Radix UI** for accessible component primitives
- **Tailwind CSS** for the utility-first CSS framework  
- **Supabase** for the backend infrastructure
- **Vite** for the blazing fast development experience
- **Lucide** for the beautiful icons

## 📊 Features Breakdown

| Feature | Status | Description |
|---------|---------|-------------|
| 💰 Balance Tracking | ✅ | Real-time balance management |
| 📝 Transaction Logging | ✅ | Categorized income/expense tracking |
| 📱 PWA Support | ✅ | Installable mobile app |
| ☁️ Cloud Sync | ✅ | Cross-device synchronization |
| 🤖 AI Advisor | ✅ | Smart financial insights |
| 💳 Debt Management | ✅ | Track debts and borrowed money |
| 📊 Analytics | 🔄 | Spending pattern analysis |
| 🎯 Goal Setting | 📋 | Financial goal tracking |
| 📧 Notifications | 📋 | Smart spending alerts |
| 🌙 Dark Mode | 📋 | Theme customization |

**Legend**: ✅ Complete | 🔄 In Progress | 📋 Planned

---

## ⚡ Fun Fact

This app is **80% vibe coded** - built with intuition, creativity, and a lot of good vibes! 🌟

*Sometimes the best code comes from following your instincts and letting the creative energy flow!*

---

<div align="center">

**Built with ❤️ for better financial management**

[🌟 Star this repo](https://github.com/78777866/FTS) if you found it helpful!

</div>
