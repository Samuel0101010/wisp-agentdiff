# wisp-agentdiff launch helper
# Run from the repo root.  Walks the v1.0.0 public-launch sequence with
# interactive confirmation at each destructive step.
#
# Pre-flight you must complete first:
#   1.  npm login                         (one-time, populates ~/.npmrc)
#   2.  gh secret set NPM_TOKEN -b "<token from npmjs>"
#   3.  vhs scripts/demo.tape             (writes docs/demo.gif)
#
# Then:  ./scripts/launch.ps1

$ErrorActionPreference = "Stop"

function Confirm($message) {
  $reply = Read-Host "$message [y/N]"
  if ($reply -ne "y" -and $reply -ne "Y") {
    Write-Host "aborted." -ForegroundColor Red
    exit 1
  }
}

Write-Host "==> wisp-agentdiff launch helper" -ForegroundColor Cyan

# Sanity checks
Write-Host "`n[1/6] checking working tree …"
if ((git status --porcelain) -ne $null) {
  Write-Host "uncommitted changes detected — commit or stash first." -ForegroundColor Red
  exit 1
}

Write-Host "[2/6] verifying npm pack contents …"
$packOut = npm pack --dry-run 2>&1
$packOut | Select-String "Tarball Contents" -Context 0,10

Write-Host "[3/6] verifying CI is green on main …"
$run = gh run list --branch main --limit 1 --json conclusion,status | ConvertFrom-Json
if ($run[0].conclusion -ne "success") {
  Write-Host "latest CI run is '$($run[0].status) / $($run[0].conclusion)' — wait for green." -ForegroundColor Yellow
  Confirm "Continue anyway?"
}

Write-Host "[4/6] verifying NPM_TOKEN secret is set …"
$secrets = gh secret list --json name | ConvertFrom-Json
if (-not ($secrets | Where-Object { $_.name -eq "NPM_TOKEN" })) {
  Write-Host "NPM_TOKEN repo secret is NOT set — run:" -ForegroundColor Red
  Write-Host '  gh secret set NPM_TOKEN -b "<your_npm_token>"'
  exit 1
}

Confirm "`nAbout to flip repo to public + promote v1.0.0 to a full release.  Proceed?"

Write-Host "`n[5/6] flipping repo visibility to public …"
gh repo edit --visibility public --accept-visibility-change-consequences

Write-Host "[6/6] promoting v1.0.0 to a non-prerelease (this triggers npm publish via release.yml) …"
gh release edit v1.0.0 --prerelease=false --title "v1.0.0 — Per-agent diffs for Claude Code parallel subagents"

Write-Host "`nLaunch sequence complete.  Watch:" -ForegroundColor Green
Write-Host "  gh run watch        # observe the release workflow"
Write-Host "  npm view wisp-agentdiff version    # confirm publish"
Write-Host ""
Write-Host "Now post the Show HN draft from your local notes (do NOT recommit it into the repo)." -ForegroundColor Cyan
