/* eslint-disable no-console */
const semver = require('semver');
const crypto = require('crypto');
const {dirname, join} = require('path');
const fs = require('fs');

const hash = crypto.createHash('sha256').update(process.env.CI_PIPELINE_ID).digest('hex');
const modValue = parseInt(hash, 16) % 90000;
const pipelineId = modValue + 10000;

const isSnapshotBuild = process.env.IS_SNAPSHOT === 'true';
const isHotFixBuild = process.env.IS_HOTFIX === 'true';

function run() {
  if (!validateEnv()) {
    return;
  }

  versionTagAndPublish();
}

function validateEnv() {
  if (!process.env.CI) {
    throw new Error('releasing is only available from CI');
  }

  return true;
}

function currentDate() {
  const date = new Date();
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');

  return `${year}${month}${day}`;
}

function versionTagAndPublish() {
  const packageVersion = semver.clean(process.env.npm_package_version);
  console.log(`package version: ${packageVersion}`);

  let version = packageVersion;
  if (isSnapshotBuild) {
    version = `${packageVersion}-snapshot.${currentDate()}-${pipelineId}`;
  } else if (isHotFixBuild) {
    version = `${packageVersion}-hotfix.${currentDate()}-${pipelineId}`;
  }

  console.log(`Publishing version: ${version}`);

  const scriptPath = process.argv[1];
  const baseDir = dirname(scriptPath);
  const pkgInfoPath = join(baseDir, '../package.json');

  // Read the contents of 'package.json'.
  const pkgInfo = JSON.parse(fs.readFileSync(pkgInfoPath));
  // Bump the version.
  pkgInfo.version = version;

  console.info('release package.json: ', JSON.stringify(pkgInfo, null, 2));

  fs.writeFileSync(pkgInfoPath, JSON.stringify(pkgInfo, null, 2));
}

run();
