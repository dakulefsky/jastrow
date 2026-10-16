const fs=require('node:fs');
let api;
try{api=require('playwright');}catch(e){if(!process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES)throw Error('Install Playwright to run browser tests: npm install --no-save playwright');api=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright');}
const bundled='/workspace/scratch/8761b9094c3a/chrome-test-restored/chrome-headless-shell-linux64/chrome-headless-shell';
const executablePath=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||(fs.existsSync(bundled)?bundled:api.chromium.executablePath());
module.exports={chromium:api.chromium,executablePath};
