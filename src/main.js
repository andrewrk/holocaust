//depend "chem"
window.Chem.onReady(function () {
  var Chem = window.Chem
    , v = Chem.Vec2d
    , canvas = document.getElementById("game")
    , engine = new Chem.Engine(canvas)
    , batch = new Chem.Batch()

  engine.setSize(v(1067, 600));

  var cellSize = v(6, 6);
  var gridWidth = Math.floor(canvas.width / cellSize.x);
  var gridHeight = Math.floor(canvas.height / cellSize.y);
  var crew = {};
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
  var grid = gridFromPerlinNoise();

  var startPos = v(gridWidth / 2, gridHeight / 2).floor();
  for (var y = startPos.y - 5; y < startPos.y + 5; ++y) {
    for (var x = startPos.x - 5; x < startPos.x + 5; ++x) {
      grid[y][x] = landType.safe;
    }
  }
  createCrewMember("Dean", startPos.offset(-1, 0));
  createCrewMember("Hank", startPos.offset(1, 0));
  createCrewMember("Gaby", startPos.offset(0, -1));
  createCrewMember("Andy", startPos.offset(0, 1));

  engine.on('update', function (dt, dx) {});
  engine.on('draw', function (context) {
    for (var y = 0; y < gridHeight; ++y) {
      var row = grid[y];
      for (var x = 0; x < gridWidth; ++x) {
        context.fillStyle = row[x].color;
        context.fillRect(x * cellSize.x, y * cellSize.y, cellSize.x, cellSize.y);
      }
    }
    // draw all sprites in batch
    engine.draw(batch);

    // draw a little fps counter in the corner
    context.fillStyle = '#000000'
    engine.drawFps();
  });
  engine.start();
  canvas.focus();

  function createCrewMember(name, pos) {
    var id = "" + Math.random();
    crew[id] = {
      id: id,
      name: name,
      health: 1,
      pos: pos.clone(),
      sprite: new Chem.Sprite('ship', {
        batch: batch,
        pos: pos.times(cellSize),
      }),
    };
  }

  function gridFromPerlinNoise() {
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

    var perlinNoise = generatePerlinNoise(gridWidth, gridHeight);
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
    return grid;
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
});

