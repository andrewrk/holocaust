(function() {
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
var landType = {
  safe: {
    name: "Safe",
    color: '#48C13C',
  },
  fatal: {
    name: "Fatal",
    color: '#860600',
  },
  danger: {
    name: "Danger",
    color: '#F30B00',
  },
  cleanWater: {
    name: "Clean Water",
    color: '#548FC4',
  },
  contaminatedWater: {
    name: "Contaminated Water",
    color: '#6D2A49',
  },
};

var cellWidth = 6;
var cellHeight = 6;
var gridWidth = Math.floor(canvas.width / cellWidth);
var gridHeight = Math.floor(canvas.height / cellHeight);
canvas.width = gridWidth * cellWidth;
canvas.height = gridHeight * cellHeight;
var perlinNoise = generatePerlinNoise(gridWidth, gridHeight);

var terrainThresholds = [
  {
    terrain: landType.fatal,
    weight: 0.20,
  },
  {
    terrain: landType.danger,
    weight: 0.50,
  },
  {
    terrain: landType.safe,
    weight: 0.30,
  },
];

var sum = 0;
terrainThresholds.forEach(function(item) {
  sum += item.weight;
  item.threshold = sum;
});

var grid = createArray(gridWidth, gridHeight);
for (var y = 0; y < gridHeight; ++y) {
  var gridRow = grid[y];
  var perlinRow = perlinNoise[y];
  for (var x = 0; x < gridWidth; ++x) {
    // just in case the weights don't add up to 1
    gridRow[x] = landType.safe;
    for (var i = 0; i < terrainThresholds.length; ++i) {
      if (perlinRow[x] < terrainThresholds[i].threshold) {
        gridRow[x] = terrainThresholds[i].terrain;
        break;
      }
    }
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
      context.fillStyle = row[x].color;
      context.fillRect(x * cellWidth, y * cellHeight, cellWidth, cellHeight);
    }
  }
}

function generatePerlinNoise(width, height, options) {
  options = options || {};
  var octaveCount = options.octaveCount || 5;
  var amplitude = options.amplitude || 0.5;
  var persistence = options.persistence || 0.2;
  var whiteNoise = generateWhiteNoise(gridWidth, gridHeight);

  var smoothNoiseList = new Array(octaveCount);
  var i, y, x, row;
  for (i = 0; i < octaveCount; ++i) {
    smoothNoiseList[i] = generateSmoothNoise(i);
  }
  var perlinNoise = createArray(width, height);
  var totalAmplitude = 0;
  // blend noise together
  for (i = octaveCount - 1; i >= 0; --i) {
    amplitude *= persistence;
    totalAmplitude += amplitude;

    for (y = 0; y < height; ++y) {
      for (x = 0; x < width; ++x) {
        perlinNoise[y][x] = perlinNoise[y][x] || 0;
        perlinNoise[y][x] += smoothNoiseList[i][y][x] * amplitude;
      }
    }
  }
  // normalization
  for (y = 0; y < height; ++y) {
    for (x = 0; x < width; ++x) {
      perlinNoise[y][x] /= totalAmplitude;
    }
  }
  return perlinNoise;
  function generateSmoothNoise(octave) {
    var noise = createArray(width, height);
    var samplePeriod = Math.pow(2, octave);
    var sampleFrequency = 1 / samplePeriod;
    for (var y = 0; y < height; ++y) {
      var row = noise[y];
      var sampleY0 = Math.floor(y / samplePeriod) * samplePeriod;
      var sampleY1 = (sampleY0 + samplePeriod) % height;
      var vertBlend = (y - sampleY0) * sampleFrequency;
      for (var x = 0; x < width; ++x) {
        var sampleX0 = Math.floor(x / samplePeriod) * samplePeriod;
        var sampleX1 = (sampleX0 + samplePeriod) % width;
        var horizBlend = (x - sampleX0) * sampleFrequency;

        // blend top two corners
        var top = interpolate(whiteNoise[sampleY0][sampleX0], whiteNoise[sampleY1][sampleX0], vertBlend);
        // blend bottom two corners
        var bottom = interpolate(whiteNoise[sampleY0][sampleX1], whiteNoise[sampleY1][sampleX1], vertBlend);
        // final blend
        row[x] = interpolate(top, bottom, horizBlend);
      }
    }
    return noise;
  }
  function generateWhiteNoise() {
    var noise = createArray(width, height);
    for (var y = 0; y < height; ++y) {
      var row = noise[y];
      for (var x = 0; x < width; ++x) {
        row[x] = Math.random();
      }
    }
    return noise;
  }
  function interpolate(x0, x1, alpha) {
    return x0 * (1 - alpha) + alpha * x1;
  }
}
function createArray(w, h) {
  var arr = new Array(h);
  for (var y = 0; y < h; ++y) {
    arr[y] = new Array(w);
  }
  return arr;
}

})();
