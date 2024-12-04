const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// Function to execute command and log output
function runCommand(command, cwd) {
  console.log(`Running command: ${command}`);
  execSync(command, { cwd, stdio: "inherit" });
}

// Function to clean directory
function cleanDirectory(dir) {
  if (fs.existsSync(dir)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// Get platform-specific mvnw command
const mvnwCommand = process.platform === 'win32' ? '.\\mvnw' : './mvnw';

// Generate API spec and client
console.log("Generating OpenAPI spec...");
const backendPath = path.join(__dirname, "backend");

// Then run verify with generate-api-client profile to create TypeScript clients
console.log("Generating TypeScript clients...");
runCommand(mvnwCommand + " clean verify -P generate-api-client", backendPath);

// Build the dist package for the Angular API client
console.log("Building dist package for Angular API client...");
const angularClientPath = path.join(__dirname, "worm-api-angular-client");
const angularDistPath = path.join(angularClientPath, "dist");

// Clean Angular client dist and any tgz files
console.log("Cleaning Angular client dist directory...");
cleanDirectory(angularDistPath);
const angularTgzFiles = fs.readdirSync(angularClientPath).filter(f => f.endsWith('.tgz'));
angularTgzFiles.forEach(f => fs.unlinkSync(path.join(angularClientPath, f)));

runCommand("npm install", angularClientPath);
runCommand("npm run build", angularClientPath);

// Create a tarball of the Angular API client
console.log("Creating tarball of Angular API client...");
runCommand("npm pack", angularDistPath);

// Read the generated package.json to get the version
const angularDistPackageJson = JSON.parse(
  fs.readFileSync(path.join(angularClientPath, "dist", "package.json"), "utf8")
);
const angularVersion = angularDistPackageJson.version;

// Build the dist package for the Node API client
console.log("Building dist package for Node API client...");
const nodeClientPath = path.join(__dirname, "worm-api-node-client");

// Clean and build Node client (clean is included in build script)
runCommand("npm install", nodeClientPath);
runCommand("npm run build", nodeClientPath);

// Create a tarball of the Node API client and move it to dist
console.log("Creating tarball of Node API client...");
runCommand("npm pack", nodeClientPath);

// Read the generated package.json to get the version
const nodePackageJson = JSON.parse(
  fs.readFileSync(path.join(nodeClientPath, "package.json"), "utf8")
);
const nodeVersion = nodePackageJson.version;

// Move the node client tarball to dist directory
const nodeTarballName = `worm-api-node-client-${nodeVersion}.tgz`;
const nodeDistPath = path.join(nodeClientPath, "dist");
fs.renameSync(
  path.join(nodeClientPath, nodeTarballName),
  path.join(nodeDistPath, nodeTarballName)
);

// Path to the frontend project
const frontendPath = path.join(__dirname, "frontend");

// Update the frontend's package.json
const frontendPackageJsonPath = path.join(frontendPath, "package.json");
const frontendPackageJson = JSON.parse(
  fs.readFileSync(frontendPackageJsonPath, "utf8")
);

// Uninstall the old version and install the new one
console.log("Updating API clients in frontend...");
runCommand("npm uninstall worm-api-angular-client", frontendPath);

const angularTarballName = `worm-api-angular-client-${angularVersion}.tgz`;
frontendPackageJson.dependencies[
  "worm-api-angular-client"
] = `file:../worm-api-angular-client/dist/${angularTarballName}`;

fs.writeFileSync(
  frontendPackageJsonPath,
  JSON.stringify(frontendPackageJson, null, 2)
);

runCommand("npm install", frontendPath);

console.log(`Updated frontend to use worm-api-angular-client version ${angularVersion}`);
console.log(`Generated worm-api-node-client version ${nodeVersion} (tarball available in worm-api-node-client/dist/)`);
