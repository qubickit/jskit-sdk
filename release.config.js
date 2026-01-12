export default {
  branches: ["main"],
  // biome-ignore lint/suspicious/noTemplateCurlyInString: semantic-release replaces ${version}.
  tagFormat: "v${version}",
  plugins: [
    [
      "@semantic-release/commit-analyzer",
      {
        preset: "conventionalcommits",
      },
    ],
    [
      "@semantic-release/release-notes-generator",
      {
        preset: "conventionalcommits",
      },
    ],
    [
      "@semantic-release/changelog",
      {
        changelogFile: "CHANGELOG.md",
      },
    ],
    [
      "@semantic-release/npm",
      {
        npmPublish: true,
      },
    ],
    "@semantic-release/github",
    [
      "@semantic-release/git",
      {
        assets: ["package.json", "bun.lock", "CHANGELOG.md"],
        // biome-ignore lint/suspicious/noTemplateCurlyInString: semantic-release replaces ${nextRelease.*}.
        message: "chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}",
      },
    ],
  ],
};
