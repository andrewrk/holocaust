//depend "chem"
//depend "astar"
window.Chem.onReady(function () {
  var Chem = window.Chem
    , aStar = window.aStar
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
    treeAdult: {
      name: "Adult Tree",
      color: '#002702',
      walkable: false,
    },
    safe: {
      name: "Safe",
      color: '#48C13C',
      walkable: true,
    },
    fatal: {
      name: "Fatal",
      color: '#860600',
      walkable: true,
    },
    danger: {
      name: "Danger",
      color: '#F30B00',
      walkable: true,
    },
    cleanWater: {
      name: "Clean Water",
      color: '#548FC4',
      walkable: false,
    },
    contaminatedWater: {
      name: "Contaminated Water",
      color: '#6D2A49',
      walkable: false,
    },
    fatalWater: {
      name: "Fatal Water",
      color: '#350024',
      walkable: false,
    },
  };

  var grid = gridFromPerlinNoise();

  var zoom = v(3, 3);
  var scroll = engine.size.clone();
  var miniMapPos = engine.size.minus(gridSize).offset(-2, -2);
  var miniMapBoxSize = v();
  var miniMapImage;
  var updateMiniMapTimer = null;

  createSafeStartArea();
  generateTerrainTextures();
  generateMiniMap();

  engine.on('buttondown', onButtonDown);
  engine.on('update', onUpdate);
  engine.on('draw', onDraw);

  engine.start();
  canvas.focus();

  function onButtonDown(button) {
    if (button === Chem.Button.Mouse_Left) {
      if (inside(engine.mouse_pos, miniMapPos, gridSize)) return;
      onMapLeftClick();
    } else if (button === Chem.Button.Mouse_Right) {
      if (inside(engine.mouse_pos, miniMapPos, gridSize)) return;
      onMapRightClick();
    } else if (engine.buttonState(Chem.Button.Mouse_Left)) {
      // cheatz!!
      if (button === Chem.Button.Key_E) {
        setEverythingExplored();
      }
    }
  }

  function onUpdate(dt, dx) {
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

    var id, member;

    for (id in crew) {
      member = crew[id];

      // get hurt by dangerous land
      var loc = member.pos.floored();
      var cell = grid[loc.y][loc.x];
      var terrain = cell.terrain;
      if (terrain === landType.danger) {
        member.health -= 0.005 * dx;
      } else if (terrain === landType.fatal) {
        member.health = 0;
      }
      if (member.health <= 0) {
        die(member);
        return;
      }


      // explore areas around crew members
      for (var y = -crewLosRadius; y < crewLosRadius; ++y) {
        for (var x = -crewLosRadius; x < crewLosRadius; ++x) {
          var targetPos = loc.offset(x, y);
          if (targetPos.distanceTo(member.pos) <= crewLosRadius) {
            if (!grid[targetPos.y][targetPos.x].explored) {
              explore(member, targetPos);
            }
          }
        }
      }

      // crew member physics
      var vel = member.inputs.direction.scaled(member.inputs.speed * dx);
      var newPos = member.pos.plus(vel);
      var newPosFloored = newPos.floored();
      if (! newPosFloored.equals(member.pos.floored())) {
        var newCell = grid[newPosFloored.y][newPosFloored.x];
        if (newCell.entity == null && newCell.terrain.walkable) {
          cell.entity = null;
          member.pos = newPos;
          newCell.entity = member;
        }
      } else {
        member.pos = newPos;
      }


      // crew member AI
      if (member.task) {
        if (member.task.name === 'walk') {
          if (member.task.state === 'off') {
            member.task.path = computePath(member, member.task.pos);
            member.task.state = 'path';
          }
          if (member.task.state === 'path') {
            var nextNode = member.task.path[0].offset(0.5, 0.5);
            if (nextNode.distanceTo(member.pos) < crewMaxSpeed) {
              member.task.path.shift();
              if (member.task.path.length === 0) {
                // done following path
                member.pos = nextNode;
                if (member.pos.floored().equals(member.task.pos.floored())) {
                  // task complete
                  member.task = null;
                  member.inputs.speed = 0;
                } else {
                  // recompute path
                  member.task.state = 'off';
                  member.inputs.speed = 0;
                }
              }
            } else {
              member.inputs.direction = nextNode.minus(member.pos).normalize();
              member.inputs.speed = crewMaxSpeed;
            }
          }
        }
      }
    }
  }

  function onDraw(context) {
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
        if (! row[it.x].explored) continue;
        var pos = toScreen(it);
        var cell = row[it.x];
        context.fillStyle = cell.terrain.color;
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
      start = member.sprite.pos.minus(healthBarSize.scaled(0.5)).floor();
      context.fillStyle = '#000000';
      context.fillRect(start.x - 1, start.y - member.sprite.size.y - 1, healthBarSize.x + 2, healthBarSize.y + 2);
      context.fillStyle = '#009413';
      context.fillRect(start.x, start.y - member.sprite.size.y, healthBarSize.x * member.health, healthBarSize.y);
    }

    // highlight the square you're mouse overing
    var mouseCellPos = toScreen(fromScreen(engine.mouse_pos).floor());
    var mouseCellSize = sizeToScreen(v(1, 1));
    context.strokeStyle = '#ffffff';
    context.strokeRect(mouseCellPos.x, mouseCellPos.y, mouseCellSize.x, mouseCellSize.y);

    // mini map
    context.drawImage(miniMapImage, miniMapPos.x, miniMapPos.y);
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
  }

  function setEverythingExplored() {
    for (var y = 0; y < gridSize.y; ++y) {
      for (var x = 0; x < gridSize.x; ++x) {
        grid[y][x].explored = true;
      }
    }
    generateMiniMap();
  }
  function inside(pos, start, size) {
    var end = start.plus(size);
    return pos.x >= start.x && pos.x < end.x &&
      pos.y >= start.y && pos.y < end.y;
  }

  function onMapRightClick() {
    var posFloored = fromScreen(engine.mouse_pos).floor();
    var pos = posFloored.offset(0.5, 0.5);
    var cell = grid[posFloored.y][posFloored.x];
    for (var id in crew) {
      var member = crew[id];
      if (member.selected) {
        if (cell.terrain.walkable) {
          member.task = {
            name: 'walk',
            pos: pos.clone(),
            state: 'off',
          };
        } else if (cell.terrain === landType.treeAdult) {
          member.task = {
            name: 'chop',
            pos: posFloored,
            state: 'off',
          };
        }
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
    clearTimeout(updateMiniMapTimer);
    updateMiniMapTimer = setTimeout(generateMiniMap, 0);
  }

  function die(crewMember) {
    crewMember.sprite.setAnimationName(crewMember.graphic + 'die');
    crewMember.sprite.setFrameIndex(0);
    crewMember.sprite.on('animation_end', function() {
      crewMember.sprite.delete();
    });
    delete crew[crewMember.id];
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
      graphic: graphic,
      name: name,
      health: 1,
      pos: pos.offset(0.5, 0.5),
      inputs: {
        direction: v(1, 0),
        speed: 0,
      },
      sprite: new Chem.Sprite(graphic, {
        batch: batch,
        pos: pos.times(cellSize),
      }),
    };
    grid[pos.y][pos.x].entity = crew[id];
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
        weight: 0.15,
      },
      {
        terrain: landType.treeAdult,
        weight: 0.15,
      },
    ];

    var perlinNoise = generatePerlinNoise(gridWidth, gridHeight);
    var sum = 0;
    terrainThresholds.forEach(function(item) {
      sum += item.weight;
      item.threshold = sum;
    });
    var grid = createArray(gridWidth, gridHeight);
    var x;
    for (var y = 0; y < gridHeight; ++y) {
      var gridRow = grid[y];
      var perlinRow = perlinNoise[y];
      for (x = 0; x < gridWidth; ++x) {
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
    // add rivers
    var waterCount = 0;
    while (waterCount < 1000) {
      waterCount += addRiver();
    }
    function addRiver() {
      var count = 0;
      var it = v(Math.random() * gridSize.x, 0).floor();
      var itRadius = Math.floor(Math.random() * 5) + 2;
      while(it.y < gridHeight) {
        if (itRadius < 1) itRadius = 1;
        if (itRadius > 10) itRadius = 10;
        for (x = it.x - itRadius; x < it.x + itRadius; ++x) {
          if (x < 0 || x >= gridWidth) continue;
          grid[it.y][x].terrain = waterizeTerrain(grid[it.y][x].terrain);
          count += 1;
        }
        it.y += 1;
        it.x += Math.floor(Math.random() * 3) - 1;
        itRadius += Math.floor(Math.random() * 3) - 1;
      }
      return count;
    }
    return grid;
  }
  function waterizeTerrain(terrain) {
    if (terrain === landType.safe) {
      return landType.cleanWater;
    } else if (terrain === landType.danger) {
      return landType.contaminatedWater;
    } else if (terrain === landType.fatal) {
      return landType.fatalWater;
    } else if (terrain === landType.treeAdult) {
      return landType.cleanWater;
    } else {
      return terrain;
    }
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

  function computePath(member, dest) {
    // compute path
    var results = aStar({
      start: member.pos.floored(),
      isEnd: createIsEnd(),
      neighbor: neighborFn,
      distance: distanceFn,
      heuristic: createHeuristicFn(member),
      timeout: 50,
    });
    if (results.path.length === 1) {
      // compute unsafe path
      results = aStar({
        start: member.pos.floored(),
        isEnd: createIsEnd(),
        neighbor: unsafeNeighborFn,
        distance: distanceFn,
        heuristic: createUnsafeHeuristicFn(member),
        timeout: 50,
      });
      if (results.path.length === 1) {
        // as a last ditch effort, make a beeline for dest
        return [dest];
      } else {
        return results.path.slice(1);
      }
    } else {
      return results.path.slice(1);
    }
    function createUnsafeHeuristicFn(member) {
      return function (node) {
        var terrainAtNode = grid[node.y][node.x].terrain;
        var unsafePenalty = (terrainAtNode === landType.danger) ? 100 : 0;
        return node.distanceTo(member.task.pos) + unsafePenalty;
      };
    }
    function createHeuristicFn(member) {
      return function (node) {
        return node.distanceTo(member.task.pos);
      };
    }
    function distanceFn(a, b) {
      return a.distanceTo(b);
    }
    function unsafeNeighborFn(node) {
      var cells = [];
      var leftSafe = addIfSafe(v(-1, 0));
      var rightSafe = addIfSafe(v(1, 0));
      var topSafe = addIfSafe(v(0, -1));
      var bottomSafe = addIfSafe(v(0, 1));
      // add the corners if safe
      if (leftSafe && topSafe) addIfSafe(v(-1, -1));
      if (rightSafe && topSafe) addIfSafe(v(1, -1));
      if (leftSafe && bottomSafe) addIfSafe(v(-1, 1));
      if (rightSafe && bottomSafe) addIfSafe(v(1, 1));
      return cells;

      function addIfSafe(vec) {
        var pt = node.plus(vec);
        if (pt.x >= gridSize.x || pt.x < 0 ||
            pt.y >= gridSize.y || pt.y < 0)
        {
          return false;
        }
        var cell = grid[pt.y][pt.x];
        var terrain = cell.terrain;
        if (!terrain.walkable || cell.entity || terrain === landType.fatal) {
          return false;
        }
        cells.push(pt);
        return true;
      }
    }
    function neighborFn(node) {
      var cells = [];
      var leftSafe = addIfSafe(v(-1, 0));
      var rightSafe = addIfSafe(v(1, 0));
      var topSafe = addIfSafe(v(0, -1));
      var bottomSafe = addIfSafe(v(0, 1));
      // add the corners if safe
      if (leftSafe && topSafe) addIfSafe(v(-1, -1));
      if (rightSafe && topSafe) addIfSafe(v(1, -1));
      if (leftSafe && bottomSafe) addIfSafe(v(-1, 1));
      if (rightSafe && bottomSafe) addIfSafe(v(1, 1));
      return cells;

      function addIfSafe(vec) {
        var pt = node.plus(vec);
        if (pt.x >= gridSize.x || pt.x < 0 ||
            pt.y >= gridSize.y || pt.y < 0)
        {
          return false;
        }
        var cell = grid[pt.y][pt.x];
        if (cell.terrain !== landType.safe || cell.entity) return false;
        cells.push(pt);
        return true;
      }
    }
    function createIsEnd() {
      var end = dest.floored();
      return function(node) {
        return node.equals(end);
      };
    }
  }

  function createSafeStartArea() {
    // make a safe area to start out on
    var startSize = v(4, 4);
    var startPos = v(gridWidth / 2, gridHeight / 2).floor();
    var x, y;
    for (y = startPos.y - startSize.y; y < startPos.y + startSize.y; ++y) {
      for (x = startPos.x - startSize.x; x < startPos.x + startSize.x; ++x) {
        grid[y][x].terrain = landType.safe;
      }
    }
    for (y = startPos.y - 1; y < startPos.y + 1; ++y) {
      for (x = startPos.x - 1; x < startPos.x + 1; ++x) {
        grid[y][x].terrain = landType.treeAdult;
      }
    }
    createCrewMember("Dean", "man", startPos.offset(-2, 0));
    createCrewMember("Hank", "man", startPos.offset(2, 0));
    createCrewMember("Gaby", "lady", startPos.offset(0, -2));
    createCrewMember("Andy", "man", startPos.offset(0, 2));
  }

  function generateTerrainTextures() {
    for (var id in landType) {
      var terrain = landType[id];
      terrain.pixel = engine.context.createImageData(1, 1);
      var d = terrain.pixel.data;
      var colorParts = extractRgba(terrain.color);
      d[0] = colorParts.red;
      d[1] = colorParts.green;
      d[2] = colorParts.blue;
      d[3] = colorParts.alpha || 255;
    }
  }

  function generateMiniMap() {
    var buffer = document.createElement('canvas');
    buffer.width = gridSize.x + 4;
    buffer.height = gridSize.y + 4;
    var context = buffer.getContext('2d');
    // border
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, buffer.width, buffer.height);
    // start with black
    context.fillStyle = '#000000';
    context.fillRect(2, 2, gridSize.x, gridSize.y);
    for (var y = 0; y < gridSize.y; ++y) {
      for (var x = 0; x < gridSize.x; ++x) {
        if (! grid[y][x].explored) continue;
        context.fillStyle = grid[y][x].terrain.color;
        context.fillRect(2 + x, 2 + y, 1, 1);
      }
    }
    miniMapImage = buffer;
  }

  function extractRgba(str) {
    str = str.replace(/^#/, '');
    return {
      red: parseInt(str.substring(0, 2), 16),
      green: parseInt(str.substring(2, 4), 16),
      blue: parseInt(str.substring(4, 6), 16),
      alpha: parseInt(str.substring(6, 8), 16),
    };
  }
});

