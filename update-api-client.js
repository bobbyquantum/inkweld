const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

// Function to execute command and log output
function runCommand(command, cwd) {
  console.log(`Running command: ${command}`);
  execSync(command, { cwd, stdio: "inherit" });
}

// Generate API spec and client
console.log("Generating API spec and client...");
const backendPath = path.join(__dirname, "backend");
runCommand(
  ".\\mvnw clean test -Pgenerate-client -Dtest=observer.quantum.worm.api.GenerateSpecTest",
  backendPath
);
runCommand(".\\mvnw package -Pgenerate-client", backendPath);

// Build the dist package for the API client
console.log("Building dist package for API client...");
const apiClientPath = path.join(__dirname, "api-client");
runCommand("npm install", apiClientPath);
runCommand("npm run build", apiClientPath);

// Create a tarball of the API client
console.log("Creating tarball of API client...");
runCommand("npm pack", path.join(apiClientPath, "dist"));

// Read the generated package.json to get the version
const distPackageJson = JSON.parse(
  fs.readFileSync(path.join(apiClientPath, "dist", "package.json"), "utf8")
);
const version = distPackageJson.version;

// Path to the frontend project
const frontendPath = path.join(__dirname, "frontend");

// Update the frontend's package.json
const frontendPackageJsonPath = path.join(frontendPath, "package.json");
const frontendPackageJson = JSON.parse(
  fs.readFileSync(frontendPackageJsonPath, "utf8")
);

// Uninstall the old version and install the new one
console.log("Updating API client in frontend...");
runCommand("npm uninstall worm-api-client", frontendPath);

const tarballName = `worm-api-client-${version}.tgz`;
frontendPackageJson.dependencies[
  "worm-api-client"
] = `file:../api-client/dist/${tarballName}`;

fs.writeFileSync(
  frontendPackageJsonPath,
  JSON.stringify(frontendPackageJson, null, 2)
);

runCommand("npm install", frontendPath);

console.log(`Updated frontend to use worm-api-client version ${version}`);
console.log("Contents of api-client/dist folder:");
runCommand("dir", path.join(__dirname, "api-client", "dist"));
