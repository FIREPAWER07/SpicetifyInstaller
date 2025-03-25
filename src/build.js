// Simple build script to compile TypeScript to JavaScript
const { exec } = require("child_process");

console.log("Compiling TypeScript...");
exec("tsc", (error, stdout, stderr) => {
  if (error) {
    console.error(`Error: ${error.message}`);
    return;
  }
  if (stderr) {
    console.error(`stderr: ${stderr}`);
    return;
  }
  console.log("TypeScript compilation complete!");
});
