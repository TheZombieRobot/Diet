#!/usr/bin/env bash
# Whether a run of the Pages workflow (pages.yml) may publish: prints "deploy=true" or
# "deploy=false" for $GITHUB_OUTPUT. A run started by hand may publish. A push may publish only
# when the subject line (the first line) of its head commit message contains the deploy marker,
# so the marker quoted in a commit's body, such as a merge note, never publishes (full review
# F43). Reads EVENT (github.event_name) and MESSAGE (github.event.head_commit.message) from the
# environment, never from the workflow text, so a commit message cannot inject commands.
# Tested by tools/scans/workflows.test.ts.
set -euo pipefail

subject="${MESSAGE:-}"
subject="${subject%%$'\n'*}"
subject="${subject%$'\r'}"
if [[ "${EVENT:-}" == 'workflow_dispatch' || "$subject" == *'[deploy]'* ]]; then
  echo 'deploy=true'
else
  echo 'deploy=false'
fi
