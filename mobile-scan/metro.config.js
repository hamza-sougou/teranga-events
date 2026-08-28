const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

// mobile-scan is an npm workspace at the monorepo root. npm's hoisting
// split some react-native dependencies across two node_modules folders:
// e.g. @react-navigation/native (nested here, in mobile-scan/node_modules,
// because it needs React 19 and the root already hoisted React 18 for
// web/) imports @react-navigation/core (hoisted to the repo root instead,
// since it has no conflicting version). Metro's default resolution only
// looks within this project's own folder tree, so without pointing it at
// the workspace root explicitly, that import fails to resolve.
const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

config.watchFolders = [workspaceRoot];
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];
// nodeModulesPaths above is additive — it does NOT replace Metro's normal
// per-directory hierarchical walk. That walk must stay enabled: npm nests
// some of expo's own transitive deps (e.g. expo-asset) inside
// mobile-scan/node_modules/expo/node_modules/ to resolve a version
// conflict, and only the hierarchical walk from the importing file finds
// those. Setting resolver.disableHierarchicalLookup = true here previously
// broke exactly that and produced "Unable to resolve module expo-asset"
// at runtime — do not re-add it.

module.exports = config;
