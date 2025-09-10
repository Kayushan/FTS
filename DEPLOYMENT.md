# 🚀 FTS Deployment Guide for Netlify

## ✅ Pre-Deployment Checklist

### Required Files (All Present):
- ✅ `netlify.toml` - Netlify configuration
- ✅ `public/manifest.json` - PWA manifest
- ✅ `public/sw.js` - Service worker
- ✅ `public/icon-192x192.png` - App icon (192x192)
- ✅ `public/icon-512x512.png` - App icon (512x512)
- ✅ `public/favicon.ico` - Favicon

## 🌐 Netlify Deployment Steps

### Method 1: Git Integration (Recommended)

1. **Push to GitHub/GitLab**:
   ```bash
   git add .
   git commit -m "Add PWA support and Netlify config"
   git push origin main
   ```

2. **Connect to Netlify**:
   - Go to [netlify.com](https://netlify.com)
   - Click "New site from Git"
   - Connect your repository
   - Netlify will auto-detect settings from `netlify.toml`

### Method 2: Manual Deploy

1. **Build locally**:
   ```bash
   npm run build
   ```

2. **Deploy to Netlify**:
   - Go to [netlify.com](https://netlify.com)
   - Drag and drop the `dist/` folder
   - Or use Netlify CLI: `netlify deploy --prod --dir=dist`

## ⚙️ Netlify Settings

### Build Settings (Auto-detected):
- **Build command**: `npm run build`
- **Publish directory**: `dist`
- **Node version**: 18

### Environment Variables (Add in Netlify Dashboard):
```
NODE_ENV=production
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## 🔧 Post-Deployment Configuration

### 1. Custom Domain (Optional):
- Go to Site settings → Domain management
- Add your custom domain
- Configure DNS records

### 2. HTTPS (Automatic):
- Netlify provides free SSL certificates
- HTTPS is enabled by default

### 3. PWA Testing:
- Test installation on mobile devices
- Verify offline functionality
- Check app shortcuts work

## 📱 PWA Features After Deployment

### ✅ Installable:
- Users can install from browser
- App appears on home screen
- Standalone mode (no browser UI)

### ✅ Offline Support:
- Basic caching for offline use
- Service worker handles requests
- Background sync when online

### ✅ Performance:
- Optimized bundle splitting
- Static asset caching
- Fast loading times

## 🚨 Troubleshooting

### Build Fails:
- Check Node.js version (should be 18+)
- Verify all dependencies are installed
- Check TypeScript errors

### PWA Not Working:
- Verify manifest.json is accessible
- Check service worker registration
- Test on HTTPS (required for PWA)

### Environment Variables:
- Add Supabase credentials in Netlify dashboard
- Restart build after adding variables

## 🎉 Success!

Your FTS app is now live and installable as a PWA! Users can:
- 📱 Install on mobile devices
- 💻 Use offline
- ⚡ Access via app shortcuts
- 🔄 Sync data when online

**Deployment URL**: `https://your-app-name.netlify.app`
