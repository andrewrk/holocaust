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
  var gridSize = v(gridWidth, gridHeight);
  var crew = {};
  var crewLosRadius = 4;
  var crewMaxSpeed = 0.1;
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

  var startSize = v(4, 4);
  var startPos = v(gridWidth / 2, gridHeight / 2).floor();
  var zoom = v(3, 3);
  var scroll = engine.size.clone();
  var miniMapPos = engine.size.minus(gridSize).offset(-2, -2);
  var miniMapBoxSize = v();

  // make a safe area to start out on
  for (var y = startPos.y - startSize.y; y < startPos.y + startSize.y; ++y) {
    for (var x = startPos.x - startSize.x; x < startPos.x + startSize.x; ++x) {
      grid[y][x].terrain = landType.safe;
    }
  }
  createCrewMember("Dean", "man", startPos.offset(-2, 0));
  createCrewMember("Hank", "man", startPos.offset(2, 0));
  createCrewMember("Gaby", "lady", startPos.offset(0, -2));
  createCrewMember("Andy", "man", startPos.offset(0, 2));

  engine.on('buttondown', function(button) {
    if (button === Chem.Button.Mouse_Left) {
      if (inside(engine.mouse_pos, miniMapPos, gridSize)) return;
      onMapLeftClick();
    } else if (button === Chem.Button.Mouse_Right) {
      if (inside(engine.mouse_pos, miniMapPos, gridSize)) return;
      onMapRightClick();
    }
  });


  engine.on('update', function (dt, dx) {
    if (engine.buttonState(Chem.Button.Key_Left)) {
      scroll.x -= 10 * dx;
    } else if (engine.buttonState(Chem.Button.Key_Right)) {
      scroll.x += 10 * dx;
    }
    if (engine.buttonState(Chem.Button.Key_Up)) {
      scroll.y -= 10 * dx;
    } else if (engine.buttonState(Chem.Button.Key_Down)) {
      scroll.y += 10 * dx;
    }
    if (engine.buttonState(Chem.Button.Mouse_Left) && inside(engine.mouse_pos, miniMapPos, gridSize)) {
      scroll = engine.mouse_pos.minus(miniMapPos).minus(miniMapBoxSize.scaled(0.5)).times(cellSize).times(zoom);
    }
    scroll.floor();

    for (var id in crew) {
      var member = crew[id];

      // explore areas around crew members
      for (var y = -crewLosRadius; y < crewLosRadius; ++y) {
        for (var x = -crewLosRadius; x < crewLosRadius; ++x) {
          var targetPos = member.pos.offset(x, y).floor();
          if (targetPos.distanceTo(member.pos) <= crewLosRadius) {
            if (!grid[targetPos.y][targetPos.x].explored) {
              explore(member, targetPos);
            }
          }
        }
      }

      // crew member physics
      var vel = member.inputs.direction.scaled(member.inputs.speed * dx);
      member.pos.add(vel);

      // crew member AI
      if (member.task && member.task.name === 'walk') {
        var dest = member.task.pos;
        if (dest.distanceTo(member.pos) < crewMaxSpeed) {
          member.pos = dest;
          member.inputs.speed = 0;
          member.task = null;
        } else {
          member.inputs.direction = dest.minus(member.pos).normalize();
          member.inputs.speed = crewMaxSpeed;
        }
      }
    }
  });
  engine.on('draw', function (context) {
    context.fillStyle = '#000000'
    context.fillRect(0, 0, engine.size.x, engine.size.y);
    var start = fromScreen(v(0, 0)).floor();
    var end = fromScreen(engine.size).ceil();
    if (start.x < 0) start.x = 0;
    if (start.y < 0) start.y = 0;
    if (end.x >= gridWidth) end.x = gridWidth - 1;
    if (end.y >= gridHeight) end.y = gridHeight - 1;
    var it = v();
    var size = sizeToScreen(v(1, 1));
    for (it.y = start.y; it.y < end.y; it.y += 1) {
      var row = grid[it.y];
      for (it.x = start.x; it.x < end.x; it.x += 1) {
        context.fillStyle = row[it.x].explored ? row[it.x].terrain.color : '#000000';
        var pos = toScreen(it);
        context.fillRect(pos.x, pos.y, size.x, size.y);
      }
    }
    // draw all sprites in batch
    var id, member, screenPos;
    for (id in crew) {
      member = crew[id]
      member.sprite.pos = toScreen(member.pos);
    }
    engine.draw(batch);

    // draw crew names and health
    // but only if selected
    context.textAlign = 'center';
    var healthBarSize = v(32, 4);
    for (id in crew) {
      member = crew[id];
      if (!member.selected) continue;
      context.fillStyle = '#ffffff';
      context.fillText(member.name,
          member.sprite.pos.x, member.sprite.pos.y - member.sprite.size.y - 5);
      context.fillStyle = '#009413';
      context.fillRect(member.sprite.pos.x - healthBarSize.x / 2,
          member.sprite.pos.y - member.sprite.size.y - healthBarSize.y / 2, healthBarSize.x, healthBarSize.y);
    }

    // mini map
    // border
    context.fillStyle = '#ffffff';
    context.fillRect(miniMapPos.x - 2, miniMapPos.y - 2, gridSize.x + 4, gridSize.y + 4);
    for (var y = 0; y < gridSize.y; ++y) {
      for (var x = 0; x < gridSize.x; ++x) {
        context.fillStyle = grid[y][x].explored ? grid[y][x].terrain.color : '#000000';
        context.fillRect(miniMapPos.x + x, miniMapPos.y + y, 1, 1);
      }
    }
    var miniMapTopLeft = fromScreen(v(0, 0));
    var miniMapBottomRight = fromScreen(engine.size);
    miniMapBoxSize = miniMapBottomRight.minus(miniMapTopLeft);
    context.strokeStyle = '#ffffff';
    context.strokeRect(miniMapPos.x + miniMapTopLeft.x,
        miniMapPos.y + miniMapTopLeft.y,
        miniMapBoxSize.x, miniMapBoxSize.y);

    // draw a little fps counter in the corner
    context.fillStyle = '#ffffff'
    engine.drawFps();
  });
  engine.start();
  canvas.focus();

  function inside(pos, start, size) {
    var end = start.plus(size);
    return pos.x >= start.x && pos.x < end.x &&
      pos.y >= start.y && pos.y < end.y;
  }

  function onMapRightClick() {
    var pos = fromScreen(engine.mouse_pos);
    for (var id in crew) {
      var member = crew[id];
      if (member.selected) {
        member.task = {
          name: 'walk',
          pos: pos.clone(),
          state: 'off',
        };
      }
    }
  }

  function onMapLeftClick() {
    var pos = engine.mouse_pos;
    for (var id in crew) {
      var member = crew[id];
      var sprite = member.sprite;
      var selected = (
        pos.x >= sprite.pos.x - sprite.size.x / 2 &&
        pos.x <= sprite.pos.x + sprite.size.x / 2 &&
        pos.y >= sprite.pos.y - sprite.size.y &&
        pos.y <= sprite.pos.y);
      var shift = engine.buttonState(Chem.Button.Key_Shift) || engine.buttonState(Chem.Button.Key_Ctrl);
      member.selected = (shift ? member.selected : false) || selected;
    }
  }

  function explore(crewMember, pos) {
    grid[pos.y][pos.x].explored = true;
  }

  function toScreen(vec) {
    return v(vec.x * cellSize.x * zoom.x - scroll.x,
        vec.y * cellSize.y * zoom.y - scroll.y);
  }

  function sizeToScreen(vec) {
    return v(vec.x * cellSize.x * zoom.x, vec.y * cellSize.y * zoom.y);
  }

  function fromScreen(vec) {
    return v((vec.x + scroll.x) / cellSize.x / zoom.x,
        (vec.y + scroll.y) / cellSize.y / zoom.y);
  }

  function createCrewMember(name, graphic, pos) {
    var id = "" + Math.random();
    crew[id] = {
      id: id,
      name: name,
      health: 1,
      pos: pos.clone(),
      inputs: {
        direction: v(1, 0),
        speed: 0,
      },
      sprite: new Chem.Sprite(graphic, {
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
        gridRow[x] = {terrain: landType.safe};
        for (var i = 0; i < terrainThresholds.length; ++i) {
          if (perlinRow[x] < terrainThresholds[i].threshold) {
            gridRow[x] = {terrain: terrainThresholds[i].terrain};
            break;
          }
        }
      }
    }
    return grid;
  }
  function generatePerlinNoise(width, height, options) {
    options = options || {};
    var octaveCount = options.octaveCount || 4;
    var amplitude = options.amplitude || 0.1;
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

