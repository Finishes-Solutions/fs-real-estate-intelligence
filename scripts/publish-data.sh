#!/usr/bin/env bash
# Publishes the data/ files the build just wrote, the way a protected default branch allows: one commit on a dedicated
# data branch (force-updated: it only ever holds this workflow's commits on top of the base) and one open pull request
# into the base branch, created the first time and updated after that, so there is never more than one.
#   REPO=owner/name  BASE_BRANCH=main  [DATA_BRANCH=data/refresh]  [RUN_URL=…]  [AUTO_MERGE=true]  [GH=gh]
# Exit codes: 0 published (or nothing to publish), 1 the push or the pull request failed, 2 the data branch holds
# someone else's commits (left alone).
set -euo pipefail
: "${REPO:?REPO=owner/name is required}"
BASE="${BASE_BRANCH:-main}"
DATA_BRANCH="${DATA_BRANCH:-$([ "$BASE" = main ] && echo data/refresh || echo "data/refresh-$BASE")}"
BOT_NAME="github-actions[bot]"; BOT_EMAIL="41898282+github-actions[bot]@users.noreply.github.com"
GH="${GH:-gh}"

# the identity by environment too, so the commit is the bot's even where GIT_AUTHOR_* is set (the author check below relies on it)
export GIT_AUTHOR_NAME="$BOT_NAME" GIT_AUTHOR_EMAIL="$BOT_EMAIL" GIT_COMMITTER_NAME="$BOT_NAME" GIT_COMMITTER_EMAIL="$BOT_EMAIL"
git config user.name "$BOT_NAME"; git config user.email "$BOT_EMAIL"
git add data/
if git diff --cached --quiet; then echo "No data changes"; exit 0; fi
DAY=$(date -u +%Y-%m-%d); TITLE="Refresh data $DAY"
STAT=$(git diff --cached --stat=100 | tail -n 20)
git commit -q -m "$TITLE"
echo "committed: $TITLE"

# never force over work that is not this workflow's: every commit the data branch has beyond the base must be the bot's
remote_sha=$(git ls-remote origin "refs/heads/$DATA_BRANCH" | cut -f1)
if [ -n "$remote_sha" ]; then
  if ! authors=$($GH api "repos/$REPO/compare/$BASE...$DATA_BRANCH" --jq '.commits[].commit.author.email'); then
    echo "::error::could not read the commits on $DATA_BRANCH; not overwriting it"; exit 1
  fi
  foreign=$(printf '%s\n' "$authors" | grep -v -x -F "$BOT_EMAIL" | grep -v '^$' || true)
  if [ -n "$foreign" ]; then
    echo "::error::$DATA_BRANCH has commits that are not this workflow's (by: $(echo "$foreign" | sort -u | tr '\n' ' ')); leaving the branch alone. Merge or delete it, then run again."
    exit 2
  fi
fi
# the lease: only replace exactly what was just inspected (or create the branch if it was absent)
pushed=
for i in 1 2 3 4 5; do
  if git push --force-with-lease="refs/heads/$DATA_BRANCH:$remote_sha" origin "HEAD:refs/heads/$DATA_BRANCH"; then pushed=1; break; fi
  sleep $((i * 5))
done
[ -n "$pushed" ] || { echo "::error::could not push $DATA_BRANCH after 5 tries"; exit 1; }
echo "pushed $DATA_BRANCH"

BODY="Nightly data refresh built by the **Refresh data** workflow${RUN_URL:+ ([run]($RUN_URL))}. Only files under \`data/\` change.

Merge to publish the new filings, changes, market and area data (Vercel deploys on merge). The next run replaces this branch and updates this pull request, so there is only ever one.

\`\`\`
$STAT
\`\`\`"
num=$($GH pr list --repo "$REPO" --head "$DATA_BRANCH" --base "$BASE" --state open --json number --jq '.[0].number // empty' || true)
if [ -n "$num" ]; then
  $GH pr edit "$num" --repo "$REPO" --title "$TITLE" --body "$BODY" >/dev/null || { echo "::error::could not update pull request #$num (the data is on $DATA_BRANCH)"; exit 1; }
  echo "updated pull request #$num"
else
  if ! url=$($GH pr create --repo "$REPO" --base "$BASE" --head "$DATA_BRANCH" --title "$TITLE" --body "$BODY"); then
    echo "::error::could not open the pull request. The data is safe on $DATA_BRANCH; open the pull request by hand, and check Settings → Actions → General → 'Allow GitHub Actions to create and approve pull requests'."
    exit 1
  fi
  num=$(echo "$url" | grep -oE '[0-9]+$' || true)
  echo "opened pull request ${num:+#$num }$url"
fi
if [ "${AUTO_MERGE:-}" = "true" ] && [ -n "$num" ]; then
  $GH pr merge "$num" --repo "$REPO" --auto --squash && echo "auto-merge requested for #$num" || echo "::warning::auto-merge could not be requested for #$num (is 'Allow auto-merge' on, and do the branch rules let this token merge?)"
fi
