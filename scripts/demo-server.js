#!/usr/bin/env node

/**
 * Simple demo server for testing MCP tools
 * Serves a page with console logs, dialogs, and interactive elements
 */

import http from 'http';

const PORT = 3456;

const HTML_PAGE = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>MCP - Demo Page</title>
  <style>
    body {
      font-family: system-ui, -apple-system, sans-serif;
      max-width: 800px;
      margin: 50px auto;
      padding: 20px;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      color: white;
    }
    .container {
      background: rgba(255, 255, 255, 0.1);
      backdrop-filter: blur(10px);
      border-radius: 16px;
      padding: 30px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
    }
    h1 {
      margin-top: 0;
      font-size: 2.5rem;
    }
    .section {
      margin: 30px 0;
      padding: 20px;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 12px;
    }
    button {
      background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
      border: none;
      color: white;
      padding: 12px 24px;
      font-size: 16px;
      border-radius: 8px;
      cursor: pointer;
      margin: 5px;
      transition: transform 0.2s;
      font-weight: 600;
    }
    button:hover {
      transform: scale(1.05);
    }
    button:active {
      transform: scale(0.95);
    }
    input {
      padding: 10px;
      border-radius: 6px;
      border: 2px solid rgba(255, 255, 255, 0.3);
      background: rgba(255, 255, 255, 0.2);
      color: white;
      font-size: 16px;
      margin: 5px;
    }
    input::placeholder {
      color: rgba(255, 255, 255, 0.6);
    }
    .console-output {
      background: rgba(0, 0, 0, 0.3);
      padding: 15px;
      border-radius: 8px;
      font-family: 'Monaco', 'Consolas', monospace;
      font-size: 14px;
      margin-top: 10px;
      max-height: 200px;
      overflow-y: auto;
    }
    .log { color: #4ade80; }
    .info { color: #60a5fa; }
    .warn { color: #fbbf24; }
    .error { color: #f87171; }
    .debug { color: #a78bfa; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🦊 Firefox MCP</h1>
    <p><strong>Demo Page for Testing MCP Tools</strong></p>
    <p>Use this page with the MCP Inspector to test various tools!</p>

    <div class="section">
      <h2>📝 Console Logs</h2>
      <button onclick="generateLogs()">Generate All Log Types</button>
      <button onclick="generateManyLogs()">Generate 50 Logs</button>
      <button onclick="logObject()">Log Object</button>
      <button onclick="logArray()">Log Array</button>
      <button onclick="console.clear()">Clear Console</button>
    </div>

    <div class="section">
      <h2>💬 Dialogs</h2>
      <button onclick="testAlert()">Show Alert</button>
      <button onclick="testConfirm()">Show Confirm</button>
      <button onclick="testPrompt()">Show Prompt</button>
    </div>

    <div class="section">
      <h2>⌨️ Input Elements</h2>
      <input type="text" id="testInput" placeholder="Type something here...">
      <button onclick="showInputValue()">Show Input Value</button>
      <button onclick="clearInput()">Clear Input</button>
    </div>

    <div class="section">
      <h2>🔄 Page Actions</h2>
      <button onclick="location.reload()">Reload Page</button>
      <button onclick="window.open('about:blank', '_blank')">Open New Tab</button>
      <button onclick="navigateToExample()">Navigate to Example.com</button>
    </div>

    <div class="section">
      <h2>🎯 Clickable Elements</h2>
      <button id="clickCounter" onclick="incrementCounter()">Click Counter: 0</button>
      <button onclick="changeBackground()">Change Background</button>
    </div>

    <div class="section">
      <h2>📊 Live Console Output</h2>
      <div class="console-output" id="consoleOutput">
        Console logs will appear here...
      </div>
    </div>
  </div>

  <script>
    let clickCount = 0;
    const colors = ['#667eea', '#764ba2', '#f093fb', '#f5576c', '#4ade80', '#60a5fa'];
    let colorIndex = 0;

    // Intercept console methods to show in page
    const originalLog = console.log;
    const originalInfo = console.info;
    const originalWarn = console.warn;
    const originalError = console.error;
    const originalDebug = console.debug;

    function addToOutput(message, type) {
      const output = document.getElementById('consoleOutput');
      const line = document.createElement('div');
      line.className = type;
      line.textContent = '[' + type.toUpperCase() + '] ' + message;
      output.appendChild(line);
      output.scrollTop = output.scrollHeight;
    }

    console.log = function(...args) {
      originalLog.apply(console, args);
      addToOutput(args.join(' '), 'log');
    };

    console.info = function(...args) {
      originalInfo.apply(console, args);
      addToOutput(args.join(' '), 'info');
    };

    console.warn = function(...args) {
      originalWarn.apply(console, args);
      addToOutput(args.join(' '), 'warn');
    };

    console.error = function(...args) {
      originalError.apply(console, args);
      addToOutput(args.join(' '), 'error');
    };

    console.debug = function(...args) {
      originalDebug.apply(console, args);
      addToOutput(args.join(' '), 'debug');
    };

    // Console log functions
    function generateLogs() {
      console.log('This is a log message');
      console.info('This is an info message');
      console.warn('This is a warning message');
      console.error('This is an error message');
      console.debug('This is a debug message');
    }

    function generateManyLogs() {
      for (let i = 0; i < 50; i++) {
        const types = ['log', 'info', 'warn', 'error', 'debug'];
        const type = types[i % types.length];
        console[type]('Message #' + (i + 1) + ' - ' + type);
      }
    }

    function logObject() {
      console.log('Object:', {
        name: 'Firefox MCP',
        version: '0.1.0',
        features: ['console', 'dialog', 'input', 'screenshot'],
        config: { headless: false, timeout: 5000 }
      });
    }

    function logArray() {
      console.log('Array:', [1, 2, 3, 'four', { five: 5 }, [6, 7, 8]]);
    }

    // Dialog functions
    function testAlert() {
      alert('This is an alert dialog! 🚨');
      console.info('Alert dialog was shown');
    }

    function testConfirm() {
      const result = confirm('Do you want to continue? 🤔');
      console.log('Confirm result:', result);
    }

    function testPrompt() {
      const result = prompt('What is your favorite color? 🎨');
      console.log('Prompt result:', result);
    }

    // Input functions
    function showInputValue() {
      const value = document.getElementById('testInput').value;
      console.log('Input value:', value);
      alert('Input value: ' + value);
    }

    function clearInput() {
      document.getElementById('testInput').value = '';
      console.info('Input cleared');
    }

    // Page actions
    function navigateToExample() {
      console.info('Navigating to example.com...');
      window.location.href = 'https://example.com';
    }

    // Clickable elements
    function incrementCounter() {
      clickCount++;
      document.getElementById('clickCounter').textContent = 'Click Counter: ' + clickCount;
      console.log('Button clicked! Count:', clickCount);
    }

    function changeBackground() {
      colorIndex = (colorIndex + 1) % colors.length;
      document.body.style.background = 'linear-gradient(135deg, ' + colors[colorIndex] + ' 0%, ' + colors[(colorIndex + 1) % colors.length] + ' 100%)';
      console.log('Background changed to:', colors[colorIndex]);
    }

    // Initial log
    console.log('🦊 Firefox MCP Demo Page Loaded!');
    console.info('Server running on http://localhost:3456');
    console.info('Use MCP Inspector to test tools: list_console_messages, list_pages, etc.');
  </script>
</body>
</html>
`;

const server = http.createServer((req, res) => {
  if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(HTML_PAGE);
  } else if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', timestamp: new Date().toISOString() }));
  } else {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  }
});

server.listen(PORT, () => {
  console.log('');
  console.log('🦊 Firefox MCP - Demo Server');
  console.log('=====================================');
  console.log('');
  console.log(`🌐 Server running at: http://localhost:${PORT}`);
  console.log('');
  console.log('📋 Available endpoints:');
  console.log(`   http://localhost:${PORT}/        - Demo page`);
  console.log(`   http://localhost:${PORT}/health  - Health check`);
  console.log('');
  console.log('💡 Usage with MCP Inspector:');
  console.log('   1. Start this server (already running)');
  console.log(`   2. Open MCP Inspector: npm run inspector`);
  console.log(`   3. Use tool: new_page with url "http://localhost:${PORT}"`);
  console.log('   4. Test tools: list_console_messages, list_pages, etc.');
  console.log('');
  console.log('Press Ctrl+C to stop the server');
  console.log('');
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use!\n`);
    console.error('   Try stopping other servers or change the PORT in demo-server.js\n');
  } else {
    console.error('❌ Server error:', error.message);
  }
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n🛑 Shutting down demo server...');
  server.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});
