// electron-builder afterPack hook.
// We distribute WITHOUT a paid Apple Developer ID, so electron-builder's mac
// signing is disabled (`build.mac.identity: null`). But a universal (Intel +
// Apple Silicon) app MUST carry a valid ad-hoc signature or macOS refuses to
// launch it ("app is damaged") on Apple Silicon. This hook applies a proper
// deep ad-hoc signature to the whole bundle after the universal merge and
// before the .dmg is assembled, so the shipped dmg contains a runnable app.
const { execSync } = require("child_process");
const path = require("path");

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;
  // For universal builds electron-builder first packs per-arch apps into
  // *-temp dirs, then merges them. Signing those temps produces divergent
  // _CodeSignature files and breaks the merge, so only sign the final app.
  if (context.appOutDir.includes("-temp")) return;
  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(context.appOutDir, `${appName}.app`);
  console.log(`  • ad-hoc signing (no Developer ID)  app=${appPath}`);
  execSync(`codesign --force --deep --sign - "${appPath}"`, { stdio: "inherit" });
  // Sanity check — fail the build loudly if the signature didn't take.
  execSync(`codesign --verify --deep --strict "${appPath}"`, { stdio: "inherit" });
};
