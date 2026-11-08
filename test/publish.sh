#!/usr/bin/env bash
# Offline test of scripts/publish-data.sh: a local bare "origin" and a stub gh. The data branch is created, then replaced;
# someone else's commits on it are never overwritten; a failed pull request still leaves the data pushed; no changes, no work.
set -euo pipefail
cd "$(dirname "$0")/.."
T=$(mktemp -d); trap 'rm -rf "$T"' EXIT
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1 GIT_AUTHOR_NAME=t GIT_AUTHOR_EMAIL=t@x GIT_COMMITTER_NAME=t GIT_COMMITTER_EMAIL=t@x
git init -q --bare -b main "$T/origin.git"
git clone -q "$T/origin.git" "$T/w" 2>/dev/null; cd "$T/w"; git checkout -q -b main
mkdir data; echo '{"filings":[1]}' > data/filings.json; echo code > app.js; git add -A; git commit -q -m "first"; git push -q origin main
# the stub gh: `api …compare…` answers the emails in $GH_COMPARE (or 404), `pr list` answers $GH_PR_NUMBER, the rest is logged
mkdir "$T/bin"; cat > "$T/bin/gh" <<'GH'
#!/usr/bin/env bash
echo "gh $*" >> "$GH_LOG"
case "$1 $2" in
  "api repos"*) if [ -n "${GH_COMPARE:-}" ]; then printf '%s\n' "$GH_COMPARE"; else echo '{"message":"Not Found"}' >&2; exit 1; fi ;;
  "pr list") echo "${GH_PR_NUMBER:-}" ;;
  "pr create") [ -n "${GH_FAIL_CREATE:-}" ] && { echo "GraphQL: GitHub Actions is not permitted to create or approve pull requests" >&2; exit 1; }; echo "https://github.com/o/r/pull/41" ;;
  "pr edit"|"pr merge") exit 0 ;;
  *) echo "unexpected gh call: $*" >&2; exit 9 ;;
esac
GH
chmod +x "$T/bin/gh"; export PATH="$T/bin:$PATH" GH_LOG="$T/gh.log" REPO=o/r BASE_BRANCH=main
run() { : > "$GH_LOG"; bash "$OLDPWD/scripts/publish-data.sh" > "$T/out" 2>&1; echo $?; }
remote() { git -C "$T/origin.git" rev-parse --verify -q "refs/heads/$1" || true; }
above_main() { git -C "$T/origin.git" rev-list --count main..data/refresh; }
touched() { git -C "$T/origin.git" diff --name-only main data/refresh | tr '\n' ' '; }

# 1. nothing changed: no commit, no push, no gh
[ "$(run)" = 0 ]; grep -q "No data changes" "$T/out"; [ ! -s "$GH_LOG" ]; [ -z "$(remote data/refresh)" ]
# 2. first night: the branch appears with one bot commit touching only data/, and one pull request is opened
echo '{"filings":[1,2]}' > data/filings.json; echo edited > app.js   # a stray change outside data/ must not be published
[ "$(run)" = 0 ]; grep -q "opened pull request #41" "$T/out"
[ "$(above_main)" = 1 ]; [ "$(touched)" = "data/filings.json " ]; [ "$(git -C "$T/origin.git" log -1 --format=%ae data/refresh)" = "41898282+github-actions[bot]@users.noreply.github.com" ]
grep -q "^gh pr create --repo o/r --base main --head data/refresh --title Refresh data 20" "$GH_LOG"; ! grep -q "pr edit" "$GH_LOG"; ! grep -q "pr merge" "$GH_LOG"
git checkout -q -- app.js; git reset -q --hard origin/main   # back to the base, as a fresh runner would be
# 3. the next night: the branch is replaced (still one commit above main), the open pull request is updated, not duplicated
echo '{"filings":[1,2,3]}' > data/filings.json; first=$(remote data/refresh)
[ "$(GH_COMPARE='41898282+github-actions[bot]@users.noreply.github.com' GH_PR_NUMBER=41 run)" = 0 ]; grep -q "updated pull request #41" "$T/out"
[ "$(above_main)" = 1 ]; [ "$(remote data/refresh)" != "$first" ]; grep -q "^gh pr edit 41 " "$GH_LOG"; ! grep -q "pr create" "$GH_LOG"
git -C "$T/origin.git" cat-file -e "$first" 2>/dev/null || true
git reset -q --hard origin/main
# 4. a person committed on the data branch: it is left exactly as it is
echo '{"filings":[1,2,3,4]}' > data/filings.json; before=$(remote data/refresh)
[ "$(GH_COMPARE=$'41898282+github-actions[bot]@users.noreply.github.com\nsomeone@example.com' GH_PR_NUMBER=41 run)" = 2 ]
grep -q "not this workflow's (by: someone@example.com" "$T/out"; [ "$(remote data/refresh)" = "$before" ]; ! grep -q "pr " "$GH_LOG"
git reset -q --hard origin/main
# 5. the compare cannot be read: nothing is overwritten
echo '{"filings":[1,2,3,4]}' > data/filings.json
[ "$(GH_PR_NUMBER=41 run)" = 1 ]; grep -q "could not read the commits" "$T/out"; [ "$(remote data/refresh)" = "$before" ]
git reset -q --hard origin/main
# 6. the pull request cannot be opened (Actions not allowed to): the run fails, but the data is on the branch
git -C "$T/origin.git" update-ref -d refs/heads/data/refresh
echo '{"filings":[9]}' > data/filings.json
[ "$(GH_FAIL_CREATE=1 run)" = 1 ]; grep -q "Allow GitHub Actions to create and approve pull requests" "$T/out"; [ "$(above_main)" = 1 ]
git reset -q --hard origin/main
# 7. auto-merge on request; a base other than main gets its own data branch
echo '{"filings":[9,9]}' > data/filings.json
[ "$(GH_COMPARE='41898282+github-actions[bot]@users.noreply.github.com' AUTO_MERGE=true run)" = 0 ]; grep -q "^gh pr merge 41 --repo o/r --auto --squash" "$GH_LOG"
git reset -q --hard origin/main; git checkout -q -b staging; git push -q origin staging
echo '{"filings":[7]}' > data/filings.json
[ "$(BASE_BRANCH=staging run)" = 0 ]; [ -n "$(remote data/refresh-staging)" ]; grep -q "^gh pr create --repo o/r --base staging --head data/refresh-staging" "$GH_LOG"
echo "publish ok: branch created, replaced, protected from foreign commits, data kept when the pull request fails"
