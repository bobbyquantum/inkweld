const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Read the generated package.json to get the version
const distPackageJson = JSON.parse(
  fs.readFileSync(
    path.join(__dirname, '..', 'api-client', 'dist', 'package.json'),
    'utf8'
  )
);
const version = distPackageJson.version;

// Path to the frontend project
const frontendPath = path.join(__dirname, '..', 'frontend');

// Update the frontend's package.json
const frontendPackageJsonPath = path.join(frontendPath, 'package.json');
const frontendPackageJson = JSON.parse(
  fs.readFileSync(frontendPackageJsonPath, 'utf8')
);

frontendPackageJson.dependencies['worm-api-client'] =
  `file:../api-client/dist/worm-api-client-${version}.tgz`;

fs.writeFileSync(
  frontendPackageJsonPath,
  JSON.stringify(frontendPackageJson, null, 2)
);

// Install the updated package in the frontend project
execSync('npm install', { cwd: frontendPath, stdio: 'inherit' });

console.log(`Updated frontend to use worm-api-client version ${version}`);
