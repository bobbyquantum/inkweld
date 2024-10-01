const path = require("path");
const { execSync } = require("child_process");

// Function to execute command and log output
function runCommand(command, cwd) {
  console.log(`Running command: ${command}`);
  execSync(command, { cwd, stdio: "inherit" });
}

// Run backend tests
console.log("Running backend tests...");
const backendPath = path.join(__dirname, "backend");
const mvnwCommand = process.platform === "win32" ? "mvnw.cmd" : "./mvnw";
const fullCommand = `${mvnwCommand} test`;

runCommand(fullCommand, backendPath);
