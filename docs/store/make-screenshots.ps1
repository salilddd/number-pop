<#
    Renders the Play Store screenshots from the real game.

        powershell -ExecutionPolicy Bypass -File docs\store\make-screenshots.ps1

    Why this is not just "open the game and press PrtSc": requestAnimationFrame
    does not advance in headless Chromium, so a rAF-driven game freezes on its
    first painted frame however long you wait. This injects a harness that takes
    the frame function away from the loop before it ever starts, then steps it by
    hand -- which is also the only way to land on an exact moment, like a boss
    question two seconds in with the bubbles well spread and the gorilla not
    caught mid-blink.

    Two settings are load-bearing and were arrived at the hard way:

    * --force-device-scale-factor must be 2, matching the dpr cap in render.js.
      At 3 it fights --window-size: the viewport comes out a different aspect to
      the image, and every bubble lands on disk as an ellipse.
    * The screenshot is used whole. An early version cropped to the viewport
      size reported by window.innerHeight, which is measured before the window
      settles and reads short -- that quietly cut the gorilla's head off.

    Verified undistorted by rendering a known 200x200 CSS circle and measuring
    it back at exactly 400x400 device pixels.
#>

$ErrorActionPreference = 'Stop'

$root    = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$outDir  = Join-Path $PSScriptRoot 'screenshots'
$edge    = 'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe'
$shots   = Join-Path $root 'shots.html'

if (-not (Test-Path $edge)) { throw "Edge not found at $edge" }
New-Item -ItemType Directory -Path $outDir -Force | Out-Null

# ---------------------------------------------------------------- harness ---

$harness = @'
<script>
(function () {
  var NP = window.NP;
  var tickFn = null;
  NP.loop.start = function (fn) { tickFn = fn; };      // capture it, never start rAF
  function step(n) { for (var i = 0; i < n; i++) tickFn(1 / 60); }

  function param(name) {
    var m = new RegExp('[?&]' + name + '=([^&]+)').exec(window.location.search);
    return m ? m[1] : null;
  }

  /* Seeded before main.js runs, so init() and the garden see the totals on the
     way up. Shaped like a few weeks of real practice: the small tables solid,
     the 7s to 9s still being fought for, and a scatter never met at all. A grid
     that is uniformly gold says as little as one that is uniformly bare. */
  function seed() {
    var s = NP.storage;
    for (var a = 2; a <= 12; a++) {
      for (var b = a; b <= 12; b++) {
        if ((a * b) % 7 === 3) continue;
        var hard = (a >= 7 && a <= 9) || (b >= 7 && b <= 9);
        var reps = hard ? 3 : 6;
        for (var i = 0; i < reps; i++) {
          s.recordFact(a + 'x' + b, hard ? (i % 3 !== 0) : true, 1100 + i * 220);
        }
      }
    }
    s.addBananas(13);
    s.setHighscore('times-2,3,4,5,10-normal', 8400);
  }
  seed();

  function drive() {
    var shot = param('shot') || 'home';
    var frames = Number(param('frames') || 0);
    if (shot === 'home')         { step(frames || 900); }
    else if (shot === 'mastery') { document.getElementById('btn-mastery').click(); step(frames || 30); }
    else if (shot === 'topics')  { document.getElementById('btn-topics').click();  step(frames || 30); }
    else if (shot === 'game')    { document.getElementById('btn-play').click();    step(frames || 150); }
  }

  window.addEventListener('load', function () {
    setTimeout(function () {
      window.dispatchEvent(new Event('resize'));   // main.js debounces this 120ms
      setTimeout(drive, 260);
    }, 60);
  });
})();
</script>
'@

# shots.html is index.html with the harness spliced in ahead of main.js, so the
# screenshots are of the real page and there is no second copy to drift.
$needle = '<script src="src/main.js"></script>'
$index  = [System.IO.File]::ReadAllText((Join-Path $root 'index.html'))
if ($index -notmatch [regex]::Escape($needle)) { throw 'main.js script tag not found in index.html' }
[System.IO.File]::WriteAllText($shots, $index.Replace($needle, $harness + "`r`n" + $needle),
                               (New-Object System.Text.UTF8Encoding($false)))

# ------------------------------------------------------------------ shoot ---

# frames is tuned per shot: past the level card, far enough in for the bubbles
# to have spread, and not on a blink.
$plan = @(
    @{ name = '01-home';    q = '?shot=home' },
    @{ name = '02-game';    q = '?shot=game&level=3&frames=120' },
    @{ name = '03-boss';    q = '?shot=game&level=6&frames=205' },
    @{ name = '04-mastery'; q = '?shot=mastery' },
    @{ name = '05-topics';  q = '?shot=topics' }
)

try {
    foreach ($s in $plan) {
        $png  = Join-Path $outDir ($s.name + '.png')
        $prof = Join-Path $env:TEMP ('np-shot-' + $s.name + '-' + (Get-Random))
        Start-Process -FilePath $edge -Wait -NoNewWindow -ArgumentList @(
            '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
            '--allow-file-access-from-files', "--user-data-dir=$prof",
            '--force-device-scale-factor=2', '--virtual-time-budget=9000',
            '--window-size=540,960', "--screenshot=$png",
            ('file:///' + ($shots -replace '\\', '/') + $s.q)
        )
        Write-Host ("  {0}  ->  {1}" -f $s.name, $png)
    }
}
finally {
    if (Test-Path $shots) { Remove-Item $shots -Force }
}

Write-Host "`nDone. 1080x1920, ready for Play Console."
