const fs=require('node:fs');
let api;
try{api=require('playwright');}catch(e){if(!process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES)throw Error('Install Playwright to run browser tests: npm install --no-save playwright');api=require(process.env.CODEX_PRIMARY_RUNTIME_NODE_MODULES+'/playwright');}
const executablePath=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||api.chromium.executablePath();
module.exports={chromium:api.chromium,executablePath};
