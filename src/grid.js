//depend "chem"
window.Chem.onReady(function () {
  var Chem = window.Chem
    , v = Chem.Vec2d
    , exports = window.Holocaust || (window.Holocaust = {})

  var lastId = 0;

  exports.Grid = Grid;

  Grid.terrains = {
    treeAdult: { // dummy, used for generation and then gets replaced
      color: '#000000',
    },
    safe: {
      name: "Safe",
      color: '#48C13C',
      texture: Chem.getImage('dirt'),
      walkable: true,
      plantable: true,
      buildable: true,
      spawnable: false,
      damage: 0,
      mutantDamage: -0.0005,
    },
    fatal: {
      name: "Fatal",
      color: '#860600',
      texture: Chem.getImage('danger'),
      walkable: true,
      plantable: false,
      buildable: false,
      spawnable: true,
      damage: -1,
      mutantDamage: 0,
    },
    oxygenated: {
      name: "Oxygenated Land",
      color: '#3CC162',
      texture: Chem.getImage('oxygendirt'),
      walkable: true,
      plantable: true,
      buildable: true,
      spawnable: false,
      damage: 0,
      mutantDamage: -0.0005,
    },
    danger: {
      name: "Danger",
      color: '#F30B00',
      texture: Chem.getImage('dirtno2'),
      walkable: true,
      plantable: true,
      buildable: false,
      spawnable: true,
      damage: -0.005,
      mutantDamage: 0,
    },
    cleanWater: {
      name: "Clean Water",
      color: '#548FC4',
      texture: Chem.getImage('water'),
      walkable: false,
      plantable: false,
      buildable: false,
      spawnable: false,
      damage: 0,
      mutantDamage: 0,
    },
    contaminatedWater: {
      name: "Contaminated Water",
      color: '#6D2A49',
      texture: Chem.getImage('evilwater'),
      walkable: false,
      plantable: false,
      buildable: false,
      spawnable: false,
      damage: 0,
      mutantDamage: 0,
    },
  };
  function Grid(cells) {
    this.size = v(cells[0].length, cells.length);
    this.cells = cells;
  }
  Grid.prototype.cell = function(pt) {
    assert(pt.equals(pt.floored()));
    return this.cells[Math.floor(pt.y)][Math.floor(pt.x)];
  }
  Grid.create = function(gridSize) {
    var terrainThresholds = [
      {
        terrain: Grid.terrains.fatal,
        weight: 0.20,
      },
      {
        terrain: Grid.terrains.danger,
        weight: 0.50,
      },
      {
        terrain: Grid.terrains.safe,
        weight: 0.15,
      },
      {
        terrain: Grid.terrains.treeAdult,
        weight: 0.15,
      },
    ];

    var perlinNoise = generatePerlinNoise(gridSize.x, gridSize.y);
    var sum = 0;
    terrainThresholds.forEach(function(item) {
      sum += item.weight;
      item.threshold = sum;
    });
    var grid = createArray(gridSize.x, gridSize.y);
    var x;
    for (var y = 0; y < gridSize.y; ++y) {
      var gridRow = grid[y];
      var perlinRow = perlinNoise[y];
      for (x = 0; x < gridSize.x; ++x) {
        // just in case the weights don't add up to 1
        gridRow[x] = new Cell(v(x, y), Grid.terrains.safe);
        for (var i = 0; i < terrainThresholds.length; ++i) {
          if (perlinRow[x] < terrainThresholds[i].threshold) {
            gridRow[x].terrain = terrainThresholds[i].terrain;
            break;
          }
        }
      }
    }
    // add rivers
    var waterCount = 0;
    while (waterCount < 1000) {
      waterCount += addRiver();
    }
    // convert trees to plants
    for (y = 0; y < gridSize.y; ++y) {
      for (x = 0; x < gridSize.x; ++x) {
        var cell = grid[y][x];
        if (cell.terrain === Grid.terrains.treeAdult) {
          cell.setNewPlant('shrub');
          cell.terrain = Grid.terrains.safe;
        }
      }
    }
    return new Grid(grid);
    function addRiver() {
      var count = 0;
      var it = v(Math.random() * gridSize.x, 0).floor();
      var itRadius = Math.floor(Math.random() * 5) + 2;
      while(it.y < gridSize.y) {
        if (itRadius < 1) itRadius = 1;
        if (itRadius > 10) itRadius = 10;
        for (x = it.x - itRadius; x < it.x + itRadius; ++x) {
          if (x < 0 || x >= gridSize.x) continue;
          grid[it.y][x].terrain = waterizeTerrain(grid[it.y][x].terrain);
          count += 1;
        }
        it.y += 1;
        it.x += Math.floor(Math.random() * 3) - 1;
        itRadius += Math.floor(Math.random() * 3) - 1;
      }
      return count;
    }
  }
  function generatePerlinNoise(width, height, options) {
    options = options || {};
    var octaveCount = options.octaveCount || 4;
    var amplitude = options.amplitude || 0.1;
    var persistence = options.persistence || 0.2;
    var whiteNoise = generateWhiteNoise(width, height);

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
  function waterizeTerrain(terrain) {
    if (terrain === Grid.terrains.safe) {
      return Grid.terrains.cleanWater;
    } else if (terrain === Grid.terrains.danger) {
      return Grid.terrains.contaminatedWater;
    } else if (terrain === Grid.terrains.fatal) {
      return Grid.terrains.contaminatedWater;
    } else if (terrain === Grid.terrains.treeAdult) {
      return Grid.terrains.cleanWater;
    } else {
      return terrain;
    }
  }
  function Cell(pos, terrain) {
    this.pos = pos;
    this.terrain = terrain;
    this.plant = null;
  }
  Cell.prototype.setNewPlant = function(type) {
    this.plant = new Plant(this, type);
  }
  Cell.prototype.setGrowingPlant = function(type) {
    this.plant = new Plant(this, type);
    this.plant.growing = 1;
  }
  Cell.prototype.empty = function() {
    return this.terrain.walkable && !this.plant && !this.building && !this.entity;
  };
  function Plant(cell, type) {
    this.id = nextId();
    this.type = type;
    this.chopCount = null;
    this.growing = null;
    this.cell = cell;
  }
  function assert(value) {
    if (! value) throw new Error("assertion failure");
  }
  function nextId() {
    return lastId++;
  }
});
