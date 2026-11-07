<#
.SYNOPSIS
  Two-way content sync between CCAR-P-Study (desktop) and CCAR-P-Study-Mobile.
  The same script lives in both repos; it finds the other one next to it.

.DESCRIPTION
  Shared content: questions, plan, domains, labs, case study, labs/ files and the vi/ overlays.
  Desktop keeps them in  Data\        Mobile keeps them in  data\ccarp\
  Desktop-only (never synced): Data\vi\ui.json.

  Modes (all are a dry run unless -Apply is given, except check):
    check  Report differences only. Exit code 1 if anything differs.   (default)
    sync   Two-way. For each differing file the side whose last git commit is newer wins.
           A file with uncommitted edits counts as "now".
    pull   Copy differing files from the other repo into this one.
    push   Copy differing files from this repo into the other one.

  Safety: questions.json is never overwritten when BOTH sides have question ids the other lacks
  (a real fork needing a manual merge) unless -Force. Invalid JSON is never copied. Equal timestamps with
  different content are reported as a conflict and skipped.

.EXAMPLE
  .\scripts\sync-content.ps1                 # check
  .\scripts\sync-content.ps1 sync            # preview a two-way sync
  .\scripts\sync-content.ps1 sync -Apply     # do it
  .\scripts\sync-content.ps1 pull -Apply     # take everything from the other repo
#>
[CmdletBinding()]
param(
    [Parameter(Position = 0)][ValidateSet('check', 'sync', 'pull', 'push')][string]$Mode = 'check',
    [switch]$Apply,
    [switch]$Force,
    [string]$Other
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$isDesktop = Test-Path (Join-Path $root 'CcarpStudy.csproj')

if (-not $Other) {
    $name = if ($isDesktop) { 'CCAR-P-Study-Mobile' } else { 'CCAR-P-Study' }
    $Other = Join-Path (Split-Path $root -Parent) $name
}
if (-not (Test-Path $Other)) { throw "Other repo not found: $Other (use -Other <path>)" }
$other = (Resolve-Path $Other).Path
$otherIsDesktop = Test-Path (Join-Path $other 'CcarpStudy.csproj')
if ($otherIsDesktop -eq $isDesktop) { throw "Both paths look like the same kind of repo." }

function Content-Dir($repo, $desktop) {
    if ($desktop) { Join-Path $repo 'Data' } else { Join-Path $repo 'data\ccarp' }
}
$here = Content-Dir $root $isDesktop
$there = Content-Dir $other $otherIsDesktop
$hereName = if ($isDesktop) { 'desktop' } else { 'mobile' }
$thereName = if ($isDesktop) { 'mobile' } else { 'desktop' }

# ---- the shared file list (relative to each content dir)
$names = @('questions.json', 'plan.json', 'domains.json', 'labs.json', 'case.json',
           'vi\questions.json', 'vi\plan.json', 'vi\domains.json', 'vi\labs.json', 'vi\case.json')
foreach ($dir in @($here, $there)) {
    $l = Join-Path $dir 'labs'
    if (Test-Path $l) {
        Get-ChildItem $l -File | ForEach-Object { $names += ('labs\' + $_.Name) }
    }
}
$names = $names | Sort-Object -Unique

function Norm($path) {
    if (-not (Test-Path $path)) { return $null }
    (Get-Content $path -Raw -Encoding UTF8) -replace "`r`n", "`n"
}

# last-change time of a file: git commit time, or "now" if it has uncommitted edits
function Changed-At($repo, $path) {
    $rel = $path.Substring($repo.Length).TrimStart('\', '/') -replace '\\', '/'
    $dirty = git -C $repo status --porcelain -- $rel
    if ($dirty) { return [DateTimeOffset]::UtcNow.ToUnixTimeSeconds() }
    $t = git -C $repo log -1 --format=%ct -- $rel
    if ($t) { return [int64]$t } else { return 0 }
}

function Is-Dirty($repo, $path) {
    $rel = $path.Substring($repo.Length).TrimStart('\', '/') -replace '\\', '/'
    return [bool](git -C $repo status --porcelain -- $rel)
}

function Question-Ids($text) {
    try { ($text | ConvertFrom-Json) | ForEach-Object { $_.id } } catch { @() }
}

$plan = @()
foreach ($n in $names) {
    $a = Join-Path $here $n
    $b = Join-Path $there $n
    $ta = Norm $a
    $tb = Norm $b
    if ($null -eq $ta -and $null -eq $tb) { continue }
    if ($ta -eq $tb) { continue }

    $dir = $null; $why = ''
    $ext = [IO.Path]::GetExtension($n)
    if ($null -eq $ta) { $dir = 'pull'; $why = "only in $thereName" }
    elseif ($null -eq $tb) { $dir = 'push'; $why = "only in $hereName" }
    else {
        switch ($Mode) {
            'pull' { $dir = 'pull' }
            'push' { $dir = 'push' }
            default {
                $ca = Changed-At $root $a
                $cb = Changed-At $other $b
                if ((Is-Dirty $root $a) -and (Is-Dirty $other $b)) { $dir = 'conflict'; $why = 'uncommitted edits on both sides' }
                elseif ($ca -gt $cb) { $dir = 'push'; $why = "$hereName newer" }
                elseif ($cb -gt $ca) { $dir = 'pull'; $why = "$thereName newer" }
                else { $dir = 'conflict'; $why = 'same age, different content' }
            }
        }
    }

    # fork guard for the question bank
    if ($n -eq 'questions.json' -and $null -ne $ta -and $null -ne $tb -and $dir -ne 'conflict') {
        $ia = @(Question-Ids $ta); $ib = @(Question-Ids $tb)
        $onlyA = @($ia | Where-Object { $_ -notin $ib }).Count
        $onlyB = @($ib | Where-Object { $_ -notin $ia }).Count
        if ($onlyA -gt 0 -and $onlyB -gt 0 -and -not $Force) {
            $dir = 'conflict'; $why = "both sides added questions ($onlyA here, $onlyB there) - merge by hand or use -Force"
        }
    }

    $plan += [pscustomobject]@{ Name = $n; Direction = $dir; Why = $why; A = $a; B = $b }
}

Write-Host "This repo: $hereName ($root)"
Write-Host "Other:     $thereName ($other)"
if ($plan.Count -eq 0) { Write-Host "In sync: shared content is identical." -ForegroundColor Green; exit 0 }

foreach ($p in $plan) {
    $arrow = switch ($p.Direction) { 'pull' { "$thereName -> $hereName" } 'push' { "$hereName -> $thereName" } default { 'CONFLICT' } }
    $color = if ($p.Direction -eq 'conflict') { 'Red' } else { 'Yellow' }
    Write-Host ("  {0,-34} {1,-18} {2}" -f $p.Name, $arrow, $p.Why) -ForegroundColor $color
}

if ($Mode -eq 'check') { Write-Host "`n$($plan.Count) file(s) differ. Run 'sync', 'pull' or 'push' (add -Apply to write)."; exit 1 }
if (-not $Apply) { Write-Host "`nDry run. Add -Apply to copy."; exit 0 }

$touchedHere = $false; $touchedThere = $false; $skipped = 0
foreach ($p in $plan) {
    if ($p.Direction -eq 'conflict') { $skipped++; continue }
    $src = if ($p.Direction -eq 'pull') { $p.B } else { $p.A }
    $dst = if ($p.Direction -eq 'pull') { $p.A } else { $p.B }
    if ($src.EndsWith('.json')) {
        try { Get-Content $src -Raw -Encoding UTF8 | ConvertFrom-Json | Out-Null }
        catch { Write-Host "  skip $($p.Name): source is not valid JSON" -ForegroundColor Red; $skipped++; continue }
    }
    New-Item -ItemType Directory -Force -Path (Split-Path $dst -Parent) | Out-Null
    Copy-Item $src $dst -Force
    if ($p.Direction -eq 'pull') { $touchedHere = $true } else { $touchedThere = $true }
}
Write-Host "`nCopied $($plan.Count - $skipped) file(s); skipped $skipped." -ForegroundColor Green

function Reminders($desktop) {
    if ($desktop) { Write-Host "  desktop: run 'dotnet build' and 'dotnet run -- --selftest', then commit." }
    else { Write-Host "  mobile: bump VERSION in sw.js, run 'node --test tests/*.mjs', then commit." }
}
Write-Host "Next steps (nothing is committed for you):"
if ($touchedHere) { Reminders $isDesktop }
if ($touchedThere) { Reminders $otherIsDesktop }
exit 0
