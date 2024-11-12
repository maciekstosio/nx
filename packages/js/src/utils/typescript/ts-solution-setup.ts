import {
  output,
  readJson,
  readNxJson,
  workspaceRoot,
  type Tree,
  updateJson,
} from '@nx/devkit';
import { FsTree } from 'nx/src/generators/tree';
import { isUsingPackageManagerWorkspaces } from '../package-manager-workspaces';

export function isUsingTypeScriptPlugin(tree: Tree): boolean {
  const nxJson = readNxJson(tree);

  return (
    nxJson?.plugins?.some((p) =>
      typeof p === 'string'
        ? p === '@nx/js/typescript'
        : p.plugin === '@nx/js/typescript'
    ) ?? false
  );
}

export function isUsingTsSolutionSetup(tree?: Tree): boolean {
  tree ??= new FsTree(workspaceRoot, false);

  return (
    isUsingPackageManagerWorkspaces(tree) &&
    isWorkspaceSetupWithTsSolution(tree)
  );
}

function isWorkspaceSetupWithTsSolution(tree: Tree): boolean {
  if (!tree.exists('tsconfig.base.json') || !tree.exists('tsconfig.json')) {
    return false;
  }

  const tsconfigJson = readJson(tree, 'tsconfig.json');
  if (tsconfigJson.extends !== './tsconfig.base.json') {
    return false;
  }

  /**
   * New setup:
   * - `files` is defined and set to an empty array
   * - `references` is defined and set to an empty array
   * - `include` is not defined or is set to an empty array
   */
  if (
    !tsconfigJson.files ||
    tsconfigJson.files.length > 0 ||
    !tsconfigJson.references ||
    !!tsconfigJson.include?.length
  ) {
    return false;
  }

  const baseTsconfigJson = readJson(tree, 'tsconfig.base.json');
  if (
    !baseTsconfigJson.compilerOptions ||
    !baseTsconfigJson.compilerOptions.composite ||
    !baseTsconfigJson.compilerOptions.declaration
  ) {
    return false;
  }

  const { compilerOptions, ...rest } = baseTsconfigJson;
  if (Object.keys(rest).length > 0) {
    return false;
  }

  return true;
}

export function assertNotUsingTsSolutionSetup(
  tree: Tree,
  pluginName: string,
  generatorName: string
): void {
  if (
    process.env.NX_IGNORE_UNSUPPORTED_TS_SETUP === 'true' ||
    !isUsingTsSolutionSetup(tree)
  ) {
    return;
  }

  const artifactString =
    generatorName === 'init'
      ? `"@nx/${pluginName}" plugin`
      : `"@nx/${pluginName}:${generatorName}" generator`;
  output.error({
    title: `The ${artifactString} doesn't yet support the existing TypeScript setup`,
    bodyLines: [
      `We're working hard to support the existing TypeScript setup with the ${artifactString}. We'll soon release a new version of Nx with support for it.`,
    ],
  });

  process.exit(1);
}

export function updateTsconfigFiles(
  tree: Tree,
  projectRoot: string,
  runtimeTsconfigFileName: string,
  compilerOptions: Record<string, string>
) {
  if (!isUsingTsSolutionSetup(tree)) return;

  const tsconfigSpec = `${projectRoot}/tsconfig.spec.json`;
  const tsconfigE2E = `${projectRoot}-e2e/tsconfig.json`;
  const tsconfigFiles = [
    `${projectRoot}/${runtimeTsconfigFileName}`,
    tsconfigSpec,
  ];

  for (const tsconfig of tsconfigFiles) {
    if (tree.exists(tsconfig)) {
      updateJson(tree, tsconfig, (json) => {
        json.compilerOptions = {
          ...json.compilerOptions,
          ...compilerOptions,
        };
        return json;
      });
    }
  }

  if (tree.exists(tsconfigSpec)) {
    updateJson(tree, tsconfigSpec, (json) => {
      const runtimePath = `./${runtimeTsconfigFileName}`;
      json.references ??= [];
      if (!json.references.some((x) => x.path === runtimePath))
        json.references.push({ path: runtimePath });
      return json;
    });
  }

  if (tree.exists(tsconfigE2E)) {
    updateJson(tree, tsconfigE2E, (json) => {
      json.references ??= [];
      const projectPath = '../' + projectRoot;
      if (!json.references.some((x) => x.path === projectPath))
        json.references.push({ path: projectPath });
      return json;
    });
  }

  if (tree.exists('tsconfig.json')) {
    updateJson(tree, 'tsconfig.json', (json) => {
      const projectPath = './' + projectRoot;
      json.references ??= [];
      if (!json.references.some((x) => x.path === projectPath))
        json.references.push({ path: projectPath });
      return json;
    });
  }
}
