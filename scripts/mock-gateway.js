/**
 * Mock API Gateway for local testing
 * 
 * This script creates a simple proxy server that mimics the API Gateway's behavior.
 * It forwards requests to the Firebase Functions emulator while adding the necessary
 * X-Forwarded-Authorization header to simulate the token forwarding behavior.
 * 
 * Usage:
 * 1. Start the Firebase emulators: npm run cursor-dev
 * 2. Run this script: node scripts/mock-gateway.js
 * 3. Set VITE_API_GATEWAY_URL=http://localhost:8888 in .env.local
 */

const express = require('express');
const { createProxyMiddleware } = require('http-proxy-middleware');
const cors = require('cors');

// Get the project ID from environment or use default
const projectId = process.env.PROJECT_ID || 'color-lock-prod';
const region = process.env.REGION || 'us-central1';
const gatewayPort = process.env.GATEWAY_PORT || 8888;

// Create Express app
const app = express();
app.use(cors());

// Log all requests
app.use((req, res, next) => {
  console.log(`[Mock Gateway] ${req.method} ${req.url}`);
  console.log(`[Mock Gateway] Headers:`, JSON.stringify(req.headers, null, 2));
  next();
});

// Verify token (simplistic mock)
app.use((req, res, next) => {
  const authHeader = req.headers.authorization;
  
  // Skip preflight requests
  if (req.method === 'OPTIONS') {
    return next();
  }
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    console.log('[Mock Gateway] No valid Authorization header found');
    return res.status(401).json({
      success: false,
      error: 'Unauthorized - Valid Firebase Auth token required'
    });
  }
  
  // In a real gateway, token validation would happen here
  console.log('[Mock Gateway] Authorization token accepted (mock validation)');
  next();
});

// Configure the proxy middleware
const proxyOptions = {
  target: `http://localhost:5001/${projectId}/${region}`,
  changeOrigin: true,
  pathRewrite: {
    '^/fetchPuzzle': '/fetchPuzzle',
    '^/updateUserStats': '/updateUserStatsHttp',
    '^/getUserStats': '/getUserStatsHttp',
    '^/getDailyScoresStats': '/getDailyScoresStatsHttp'
  },
  onProxyReq: (proxyReq, req) => {
    // Copy Authorization header to X-Forwarded-Authorization
    const authHeader = req.headers.authorization;
    if (authHeader) {
      proxyReq.setHeader('X-Forwarded-Authorization', authHeader);
      
      // In production, the gateway would replace the Authorization header with a Google-signed token
      // For emulator testing, we can keep the original one or set a mock service account token
      // proxyReq.setHeader('Authorization', 'Bearer mock-service-account-token');
    }
    
    console.log('[Mock Gateway] Forwarding request to Functions emulator with X-Forwarded-Authorization');
  },
  onProxyRes: (proxyRes, req, res) => {
    console.log(`[Mock Gateway] Received ${proxyRes.statusCode} response from Functions emulator`);
  },
  onError: (err, req, res) => {
    console.error('[Mock Gateway] Proxy error:', err);
    res.status(500).json({
      success: false,
      error: 'Gateway Error: Unable to connect to backend service'
    });
  }
};

// Apply the proxy middleware to all routes
app.use('/', createProxyMiddleware(proxyOptions));

// Start the server
app.listen(gatewayPort, () => {
  console.log(`
┌───────────────────────────────────────────────────┐
│                                                   │
│   🌍 Mock API Gateway Server                      │
│                                                   │
│   Running at: http://localhost:${gatewayPort}               │
│   Proxying to: ${proxyOptions.target}   │
│                                                   │
│   Available endpoints:                            │
│     • /fetchPuzzle                                │
│     • /updateUserStats                            │
│     • /getUserStats                               │
│     • /getDailyScoresStats                        │
│                                                   │
└───────────────────────────────────────────────────┘
  `);
}); 