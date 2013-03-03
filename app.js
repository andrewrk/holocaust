var canvas = document.getElementById("game");
canvas.width = 1067;
canvas.height = 600;

var targetFps = 60;
var targetSpf = 1 / targetFps;
var maxSpf = 1 / 20;
var fpsSmoothness = 0.9;
var fpsOneFrameWeight = 1.0 - fpsSmoothness;
var requestAnimationFrame = window.requestAnimationFrame ||
  window.webkitRequestAnimationFrame ||
  window.mozRequestAnimationFrame ||
  window.oRequestAnimationFrame ||
  window.msRequestAnimationFrame ||
  function(cb) { window.setTimeout(cb, targetSpf * 1000) };

// add tabindex property to canvas so that it can receive keyboard input
canvas.tabIndex = 0;
var context = canvas.getContext('2d');
var fps = targetFps;

var cellWidth = 6;
var cellHeight = 6;
var gridWidth = Math.floor(canvas.width / cellWidth);
var gridHeight = Math.floor(canvas.height / cellHeight);
var grid = new Array(gridHeight);
var colors = [
  '#48C13C', // safe
  '#860600', // fatal
  '#F30B00', // danger
  '#548FC4', // clean water
  '#6D2A49', // contaminated water
];

for (var y = 0; y < gridHeight; ++y) {
  var row;
  grid[y] = row = new Array(gridWidth);
  for (var x = 0; x < gridWidth; ++x) {
    row[x] = Math.floor(Math.random() * colors.length);
  }
}

startMainLoop();

function startMainLoop() {
  var previousUpdate = new Date();
  requestAnimationFrame(mainLoop, canvas);

  function mainLoop() {
    var now = new Date();
    var delta = (now - previousUpdate) / 1000;
    previousUpdate = now;
    // make sure dt is never zero
    // if FPS is too low, lag instead of causing physics glitches
    var dt = delta;
    if (dt < 0.00000001) dt = 0.00000001;
    if (dt > maxSpf) dt = maxSpf;
    var multiplier = dt / targetSpf;
    nextFrame(dt, multiplier);
    draw();
    var thisFps = 1 / delta;
    if (thisFps > 90000) thisFps = 90000;
    fps = fps * fpsSmoothness + thisFps * fpsOneFrameWeight;
    requestAnimationFrame(mainLoop, canvas);
  }
}

function nextFrame(dt, multiplier) {

}

function draw() {
  for (var y = 0; y < gridHeight; ++y) {
    var row = grid[y];
    for (var x = 0; x < gridWidth; ++x) {
      context.fillStyle = colors[row[x]];
      context.fillRect(x * cellWidth, y * cellHeight, cellWidth, cellHeight);
    }
  }
}
