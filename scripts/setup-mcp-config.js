#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import os from 'os';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
};

function question(query) {
  return new Promise((resolve) => rl.question(query, resolve));
}

function detectNodePath() {
  try {
    // First try to get current Node.js path
    const nodeVersion = process.version;
    console.log(`${colors.green}✓ Detected Node.js version: ${nodeVersion}${colors.reset}`);

    // Check if using nvm
    const nvmDir = process.env.NVM_DIR;
    if (nvmDir) {
      // Try to get the current version from nvm
      try {
        const currentVersion = execSync('nvm current', { encoding: 'utf8' }).trim();
        const nodePath = path.join(nvmDir, 'versions', 'node', currentVersion, 'bin', 'node');
        if (fs.existsSync(nodePath)) {
          console.log(`${colors.green}✓ Using nvm Node.js at: ${nodePath}${colors.reset}`);
          return nodePath;
        }
      } catch (e) {
        // nvm not available, continue
      }
    }

    // Use the current Node.js executable path
    console.log(`${colors.green}✓ Using Node.js at: ${process.execPath}${colors.reset}`);
    return process.execPath;
  } catch (error) {
    console.log(`${colors.yellow}⚠️  Could not detect Node.js path, using default${colors.reset}`);
    return 'node';
  }
}

async function main() {
  console.log(
    `${colors.bright}${colors.blue}🚀 Firefox MCP Configuration Setup${colors.reset}\n`
  );

  // Ask which client to configure
  console.log(`${colors.bright}Select MCP client to configure:${colors.reset}`);
  console.log('1. Claude Desktop (desktop app)');
  console.log('2. Claude Code (CLI tool)');
  console.log('3. Both');
  console.log('4. Display config only (manual setup)');

  const clientChoice = (await question('\nSelect option (1-4) [2]: ')) || '2';

  // Get project path
  const projectPath = path.resolve(__dirname, '..');
  const distIndexPath = path.join(projectPath, 'dist', 'index.js');

  // Check if we need to build first
  const srcIndexPath = path.join(projectPath, 'src', 'index.ts');
  if (!fs.existsSync(distIndexPath) && fs.existsSync(srcIndexPath)) {
    console.log(`${colors.yellow}⚠️  Dist file not found. Building project...${colors.reset}`);
    try {
      execSync('npm run build', { cwd: projectPath, stdio: 'inherit' });
      console.log(`${colors.green}✓ Build completed${colors.reset}\n`);
    } catch (error) {
      console.log(
        `${colors.red}❌ Build failed. Please run 'npm run build' manually${colors.reset}`
      );
      process.exit(1);
    }
  }

  if (!fs.existsSync(distIndexPath)) {
    console.log(`${colors.red}❌ Dist file not found at: ${distIndexPath}${colors.reset}`);
    console.log(`${colors.yellow}Please run 'npm run build' first${colors.reset}`);
    process.exit(1);
  }

  console.log(`${colors.green}✓ Found server dist at: ${distIndexPath}${colors.reset}\n`);

  // Get Firefox configuration
  console.log(`${colors.bright}Firefox Configuration:${colors.reset}`);
  console.log(`${colors.yellow}(Press Enter to use default values)${colors.reset}\n`);

  const headless = (await question('Run in headless mode? (y/n) [n]: ')) || 'n';
  const viewport = (await question('Viewport size (e.g., 1280x720) [1280x720]: ')) || '1280x720';

  // Detect Node.js path
  const nodePath = detectNodePath();

  // Ask user about Node.js configuration
  console.log(`\n${colors.bright}Node.js Configuration:${colors.reset}`);
  console.log(`1. Use detected Node.js: ${nodePath}`);
  console.log(`2. Specify custom Node.js path`);
  console.log(`3. Use system default (node)`);

  const nodeChoice = await question('\nSelect option (1-3) [1]: ') || '1';
  let finalNodePath = nodePath;

  switch (nodeChoice) {
    case '2':
      finalNodePath = await question('Enter full path to Node.js executable: ');
      if (!fs.existsSync(finalNodePath)) {
        console.log(`${colors.yellow}⚠️  Path not found, using detected path${colors.reset}`);
        finalNodePath = nodePath;
      }
      break;
    case '3':
      finalNodePath = 'node';
      break;
  }

  // Create MCP config
  const mcpConfig = {
    mcpServers: {
      'firefox': {
        command: finalNodePath,
        args: [distIndexPath, '--headless=' + (headless.toLowerCase() === 'y' ? 'true' : 'false'), '--viewport=' + viewport],
      },
    },
  };

  // Determine config paths based on client choice
  const platform = os.platform();
  let desktopConfigPath, desktopConfigDir;
  let claudeCodeConfigPath, claudeCodeConfigDir;

  // Claude Desktop paths
  if (platform === 'darwin') {
    desktopConfigDir = path.join(os.homedir(), 'Library', 'Application Support', 'Claude');
    desktopConfigPath = path.join(desktopConfigDir, 'claude_desktop_config.json');
  } else if (platform === 'win32') {
    desktopConfigDir = path.join(os.homedir(), 'AppData', 'Roaming', 'Claude');
    desktopConfigPath = path.join(desktopConfigDir, 'claude_desktop_config.json');
  } else {
    desktopConfigDir = path.join(os.homedir(), '.config', 'claude');
    desktopConfigPath = path.join(desktopConfigDir, 'claude_desktop_config.json');
  }

  // Claude Code paths
  if (platform === 'darwin') {
    claudeCodeConfigDir = path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'Code');
    claudeCodeConfigPath = path.join(claudeCodeConfigDir, 'mcp_settings.json');
  } else if (platform === 'win32') {
    claudeCodeConfigDir = path.join(os.homedir(), 'AppData', 'Roaming', 'Claude', 'Code');
    claudeCodeConfigPath = path.join(claudeCodeConfigDir, 'mcp_settings.json');
  } else {
    claudeCodeConfigDir = path.join(os.homedir(), '.config', 'claude', 'code');
    claudeCodeConfigPath = path.join(claudeCodeConfigDir, 'mcp_settings.json');
  }

  // Handle display-only option
  if (clientChoice === '4') {
    console.log(
      `\n${colors.bright}Copy this configuration to your MCP config:${colors.reset}\n`
    );
    console.log(JSON.stringify(mcpConfig, null, 2));

    console.log(`\n${colors.bright}${colors.blue}Config file locations:${colors.reset}`);
    console.log(`Claude Desktop: ${desktopConfigPath}`);
    console.log(`Claude Code: ${claudeCodeConfigPath}`);
    rl.close();
    return;
  }

  // Helper function to save config
  async function saveConfig(configPath, configDir, clientName) {
    let existingConfig = {};
    if (fs.existsSync(configPath)) {
      try {
        existingConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
        if (existingConfig.mcpServers && existingConfig.mcpServers['firefox']) {
          const overwrite = await question(
            `\n${colors.yellow}⚠️  'firefox' server already exists in ${clientName}. Overwrite? (y/n): ${colors.reset}`
          );
          if (overwrite.toLowerCase() !== 'y') {
            console.log(`Skipped ${clientName}`);
            return false;
          }
        }
      } catch (error) {
        console.log(
          `${colors.yellow}⚠️  Could not read existing ${clientName} config, will create new one${colors.reset}`
        );
      }
    }

    // Merge configs
    const finalConfig = {
      ...existingConfig,
      mcpServers: {
        ...existingConfig.mcpServers,
        ...mcpConfig.mcpServers,
      },
    };

    if (!fs.existsSync(configDir)) {
      fs.mkdirSync(configDir, { recursive: true });
    }

    fs.writeFileSync(configPath, JSON.stringify(finalConfig, null, 2));
    console.log(`\n${colors.green}✅ Configuration saved to ${clientName}: ${configPath}${colors.reset}`);
    return true;
  }

  // Save to appropriate client(s)
  if (clientChoice === '1') {
    await saveConfig(desktopConfigPath, desktopConfigDir, 'Claude Desktop');
    console.log(`${colors.yellow}⚠️  Restart Claude Desktop to apply changes${colors.reset}`);
  } else if (clientChoice === '2') {
    await saveConfig(claudeCodeConfigPath, claudeCodeConfigDir, 'Claude Code');
    console.log(`${colors.yellow}⚠️  Restart Claude Code to apply changes${colors.reset}`);
  } else if (clientChoice === '3') {
    await saveConfig(desktopConfigPath, desktopConfigDir, 'Claude Desktop');
    await saveConfig(claudeCodeConfigPath, claudeCodeConfigDir, 'Claude Code');
    console.log(`${colors.yellow}⚠️  Restart Claude Desktop and Claude Code to apply changes${colors.reset}`);
  }

  // Show next steps
  console.log(`\n${colors.bright}${colors.blue}Next Steps:${colors.reset}`);
  if (clientChoice === '1' || clientChoice === '3') {
    console.log(`1. Restart Claude Desktop`);
  }
  if (clientChoice === '2' || clientChoice === '3') {
    console.log(`${clientChoice === '3' ? '2' : '1'}. Restart Claude Code (or reload window)`);
  }
  console.log(
    `${clientChoice === '3' ? '3' : '2'}. Test with: "${colors.green}List all open pages in Firefox${colors.reset}" or "${colors.green}Take a screenshot${colors.reset}"`
  );

  rl.close();
}

main().catch((error) => {
  console.error(`${colors.red}Error: ${error.message}${colors.reset}`);
  process.exit(1);
});
