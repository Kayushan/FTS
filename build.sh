#!/bin/bash

# FTS Production Build Script for Netlify

echo "🚀 Building FTS for production..."

# Install dependencies
echo "📦 Installing dependencies..."
npm ci

# Type check
echo "🔍 Running TypeScript check..."
npm run build

# Check if build was successful
if [ $? -eq 0 ]; then
    echo "✅ Build successful!"
    echo "📁 Build output: dist/"
    echo "🌐 Ready for Netlify deployment!"
else
    echo "❌ Build failed!"
    exit 1
fi
