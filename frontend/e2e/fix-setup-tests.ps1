# Fix setup.spec.ts
$setupContent = Get-Content 'e2e/setup.spec.ts' -Raw

# Replace all old selectors with test data IDs
$setupContent = $setupContent -replace "page\.locator\('button:has-text\(`"Work Offline`"\)'\)\.click\(\)", "page.getByTestId('offline-mode-button').click()"
$setupContent = $setupContent -replace "page\.locator\('button:has-text\(`"Connect to Server`"\)'\)\.click\(\)", "page.getByTestId('server-mode-button').click()"
$setupContent = $setupContent -replace "page\.locator\('input\[placeholder=`"Enter your username`"\]'\)", "page.getByTestId('offline-username-input')"
$setupContent = $setupContent -replace "page\.locator\('input\[placeholder=`"Enter your display name`"\]'\)", "page.getByTestId('offline-displayname-input')"
$setupContent = $setupContent -replace "page\.locator\('input\[placeholder=`"https://your-inkweld-server\.com`"\]'\)", "page.getByTestId('server-url-input')"
$setupContent = $setupContent -replace "page\.locator\('button:has-text\(`"Set Up Offline Mode`"\)'\)", "page.getByTestId('start-offline-button')"
$setupContent = $setupContent -replace "page\.locator\('button:has-text\(`"Back`"\)'\)\.first\(\)", "page.getByTestId('offline-back-button')"
$setupContent = $setupContent -replace "page\.locator\('\.setup-card'\)", "page.getByTestId('setup-card')"
$setupContent = $setupContent -replace "page\.locator\('text=Work Offline'\)", "page.getByTestId('offline-mode-button')"
$setupContent = $setupContent -replace "page\.locator\('text=Connect to Server'\)", "page.getByTestId('server-mode-button')"

# Add timeout for initial subtitle check (wait for config loading)
$setupContent = $setupContent -replace "await expect\(page\.locator\('mat-card-subtitle'\)\)\.toContainText\(\s+`"Choose how you'd like to use Inkweld`"\s+\);", "await expect(page.locator('mat-card-subtitle')).toContainText(`n        `"Choose how you'd like to use Inkweld`",`n        { timeout: 10000 }`n      );"

$setupContent | Set-Content 'e2e/setup.spec.ts' -NoNewline

# Fix setup-integration.spec.ts
$integContent = Get-Content 'e2e/setup-integration.spec.ts' -Raw

$integContent = $integContent -replace "page\.locator\('button:has-text\(`"Work Offline`"\)'\)\.click\(\)", "page.getByTestId('offline-mode-button').click()"
$integContent = $integContent -replace "page\.locator\('button:has-text\(`"Connect to Server`"\)'\)\.click\(\)", "page.getByTestId('server-mode-button').click()"
$integContent = $integContent -replace "page\.locator\('input\[placeholder=`"Enter your username`"\]'\)", "page.getByTestId('offline-username-input')"
$integContent = $integContent -replace "page\.locator\('input\[placeholder=`"Enter your display name`"\]'\)", "page.getByTestId('offline-displayname-input')"
$integContent = $integContent -replace "page\.locator\('input\[placeholder=`"https://your-inkweld-server\.com`"\]'\)", "page.getByTestId('server-url-input')"
$integContent = $integContent -replace "page\.locator\('button:has-text\(`"Set Up Offline Mode`"\)'\)", "page.getByTestId('start-offline-button')"
$integContent = $integContent -replace "page\.locator\('\.setup-card'\)", "page.getByTestId('setup-card')"

$integContent | Set-Content 'e2e/setup-integration.spec.ts' -NoNewline

Write-Host "Fixed both test files!"
