import {defineConfig,devices} from '@playwright/test';
export default defineConfig({
  testDir:'./tests/e2e',fullyParallel:false,workers:1,retries:0,
  timeout:60_000,expect:{timeout:12_000},
  outputDir:'test-results',reporter:[['list'],['html',{open:'never'}]],
  use:{baseURL:process.env.E2E_ORIGIN,trace:'retain-on-failure',screenshot:'only-on-failure'},
  projects:[
    {name:'chromium',use:{...devices['Desktop Chrome'],viewport:{width:1280,height:900},timezoneId:'Asia/Shanghai'}},
    {name:'webkit-mobile',use:{...devices['iPhone 13'],timezoneId:'America/Los_Angeles'}},
  ],
});
