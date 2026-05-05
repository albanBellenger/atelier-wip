## Push to GitHub for Claude review / Claude.ai can't connect to public repo.
git remote add github-alban https://github.com/albanBellenger/atelier-wip.git
git push github-alban master

## Localplay right
npx playwright install   # once per machine / after Playwright upgrades
$env:PLAYWRIGHT_BASE_URL = "http://127.0.0.1:5173"   # optional; this is already the default
$env:PLAYWRIGHT_TOOL_ADMIN_EMAIL = "admin-4c571c4e@example.com"   
$env:PLAYWRIGHT_TOOL_ADMIN_PASSWORD = "ChangeMe!123"   
npm run test:e2e
npx playwright show-report
