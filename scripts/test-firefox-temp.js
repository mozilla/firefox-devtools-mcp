import { FirefoxDevTools } from '../dist/index.js';

async function main() {
  const firefox = new FirefoxDevTools({
    headless: true,
    enableBidiLogging: false,
    width: 1280,
    height: 720,
  });

  console.log('Connecting...');
  await firefox.connect();
  console.log('Connected!');
  await firefox.close();
  console.log('Done!');
}

main().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
