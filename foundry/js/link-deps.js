// Foundry mis-resolves remappings whose target ends in ".sol/" (the npm package
// "@zk-kit/lean-imt.sol"). Copy it to a plain folder name. Runs on npm install.
const fs = require("fs");
const path = require("path");
const src = path.join(__dirname, "..", "node_modules", "@zk-kit", "lean-imt.sol");
const dst = path.join(__dirname, "..", "lib", "zk-kit-lean-imt");
fs.rmSync(dst, { recursive: true, force: true });
fs.cpSync(src, dst, { recursive: true });
console.log("Copied @zk-kit/lean-imt.sol -> lib/zk-kit-lean-imt");
