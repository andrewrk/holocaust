//depend "chem"
//depend "astar"
//depend "grid"
window.Chem.onReady(function () {
  var Chem = window.Chem
    , aStar = window.aStar
    , Grid = window.Holocaust.Grid
    , v = Chem.Vec2d
    , canvas = document.getElementById("game")
    , engine = new Chem.Engine(canvas)
    , batch = new Chem.Batch()

  engine.setSize(v(1067, 600));

  var isEverythingExplored = false;
  var lastId = 0;
  var cellSize = v(6, 6);
  var crew = {};
  var crewLosRadius = 4;
  var crewChopRadius = 1.6;
  var entityAttackRadius = 0.8;
  var crewMaxSpeed = 0.1;
  var mutantMaxSpeed = 0.05;
  var mutantHurtAmt = 0.0025;
  var saplingImage = Chem.getImage('sapling');
  var shrubImage = Chem.getImage('shrub');
  var axeImage = Chem.getImage('axe');
  var growingAnimation = Chem.animations.growing;
  var plantTypes = {
    shrub: {
      image: shrubImage,
    },
  };
  var crewOptions = [
    {
      fn: commandToWalk,
      key: Chem.Button.Key_1,
      keyText: "1",
      help: "Walk to the destination.",
      image: Chem.getImage('walkicon'),
    },
    {
      fn: commandToPlantShrub,
      key: Chem.Button.Key_2,
      keyText: "2",
      help: "Plant a shrub.",
      image: shrubImage,
    },
  ];
  var taskFns = {
    walk: performWalkTask,
    chop: performChopTask,
    plant: performPlantTask,
    attack: performAttackTask,
  };

  var grid = Grid.create(engine.size.divBy(cellSize).floor());

  var zoom = v(3, 3);
  var scroll = engine.size.clone();
  var miniMapPos = engine.size.minus(grid.size).offset(-2, -2);
  var miniMapBoxSize = v();
  var controlBoxPos = v(0, miniMapPos.y);
  var controlBoxSize = v(miniMapPos.x, engine.size.y - controlBoxPos.y);
  var miniMapImage;
  var updateMiniMapTimer = null;
  var seedCount = 0;
  var seedResourceImage = Chem.getImage('saplingbutton');
  var foodCount = 0;
  var foodResourceImage = Chem.getImage('foodbutton');
  var anyCrewSelected = false;
  var selectedCrewOption = 0;
  var growingPlants = {};
  var partiallyChoppedPlants = {};
  var mutants = {};
  var mutantSpawnInterval = 1000;
  var nextMutantSpawn = 0;

  createSafeStartArea();
  generateMiniMap();

  engine.on('buttondown', onButtonDown);
  engine.on('update', onUpdate);
  engine.on('draw', onDraw);

  engine.start();
  canvas.focus();

  function onButtonDown(button) {
    if (button === Chem.Button.Mouse_Left) {
      if (inside(engine.mouse_pos, miniMapPos, grid.size)) return;
      onMapLeftClick();
    } else if (button === Chem.Button.Mouse_Right) {
      if (inside(engine.mouse_pos, miniMapPos, grid.size)) return;
      onMapRightClick();
    } else if (engine.buttonState(Chem.Button.Mouse_Left)) {
      // cheatz!!
      if (button === Chem.Button.Key_E) {
        setEverythingExplored();
      }
    }

    if (anyCrewSelected) {
      for (var i = 0; i < crewOptions.length; ++i) {
        if (button === crewOptions[i].key) {
          selectedCrewOption = i;
          break;
        }
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
    if (engine.buttonState(Chem.Button.Mouse_Left) && inside(engine.mouse_pos, miniMapPos, grid.size)) {
      scroll = engine.mouse_pos.minus(miniMapPos).minus(miniMapBoxSize.scaled(0.5)).times(cellSize).times(zoom);
    }
    scroll.floor();

    var id, plant;
    for (id in growingPlants) {
      plant = growingPlants[id];
      plant.growing -= 0.002 * dx;
      if (plant.growing <= 0) {
        plant.growing = null;
        delete growingPlants[id];
        plantFinishGrowing(plant);
      }
    }
    for (id in partiallyChoppedPlants) {
      plant = partiallyChoppedPlants[id];
      plant.chopCount += 0.0008 * dx;
      if (plant.chopCount >= 1) {
        plant.chopCount = null;
        delete partiallyChoppedPlants[id];
      }
    }

    nextMutantSpawn -= dx;
    if (nextMutantSpawn <= 0) {
      nextMutantSpawn = mutantSpawnInterval;
      spawnMutant();
    }

    var vel, newPos, terrain;
    for (id in mutants) {
      var mutant = mutants[id];

      // mutant physics
      vel = mutant.inputs.direction.scaled(mutant.inputs.speed * dx);
      newPos = mutant.pos.plus(vel);
      updateEntityPos(mutant, newPos);

      // mutant health updates
      terrain = grid.cell(mutant.pos.floored()).terrain;
      changeEntityHealth(mutant, dx * terrain.mutantDamage);

      var attackTarget = mutant.inputs.attack;
      if (attackTarget && attackTarget.pos.distanceTo(mutant.pos) <= entityAttackRadius) {
        changeEntityHealth(attackTarget, -mutantHurtAmt * dx);
      }

      // mutant AI
      if (mutant.tasks[0]) {
        taskFns[mutant.tasks[0].name](mutant);
      } else {
        // pick a random crew member to harass
        var randomCrewId = pickNRandomProps(crew, 1)[0];
        if (randomCrewId) {
          assignTask(mutant, false, {
            name: 'attack',
            state: 'off',
            target: crew[randomCrewId],
          });
        }
      }
    }

    anyCrewSelected = false;
    for (id in crew) {
      var member = crew[id];

      anyCrewSelected = anyCrewSelected || member.selected;

      // get hurt by dangerous land
      var loc = member.pos.floored();
      var cell = grid.cell(loc);
      terrain = cell.terrain;
      var damage = terrain.damage || 0;
      changeEntityHealth(member, damage * dx);
      if (member.deleted) continue;

      // explore areas around crew members
      for (var y = -crewLosRadius; y < crewLosRadius; ++y) {
        for (var x = -crewLosRadius; x < crewLosRadius; ++x) {
          var targetPos = loc.offset(x, y);
          if (! inGrid(targetPos)) continue;
          if (targetPos.distanceTo(member.pos) <= crewLosRadius) {
            if (!grid.cell(targetPos).explored) {
              explore(member, targetPos);
            }
          }
        }
      }

      if (member.inputs.chop) {
        var chopPos = member.inputs.chop;
        if (chopPos.distanceTo(member.pos) <= crewChopRadius) {
          var chopCell = grid.cell(chopPos);
          plant = chopCell.plant;
          if (plant && (! plant.growing)) {
            plant.chopCount = plant.chopCount || 1;
            plant.chopCount -= 0.0088 * dx;
            if (plant.chopCount <= 0) {
              chopCell.plant = null;
              plantDestroyed(plant);
            } else {
              partiallyChoppedPlants[plant.id] = plant;
            }
          }
        }
      } else if (member.inputs.plant) {
        var plantPos = member.inputs.plant.pos;
        if (plantPos.distanceTo(member.pos) <= crewChopRadius) {
          var plantCell = grid.cell(plantPos);
          if (plantCell.terrain.plantable && seedCount > 0 && !plantCell.plant) {
            plantCell.setGrowingPlant(member.inputs.plant.type);
            growingPlants[plantCell.plant.id] = plantCell.plant;
            seedCount -= 1;
          }
        }
      }

      // crew member physics
      vel = member.inputs.direction.scaled(member.inputs.speed * dx);
      newPos = member.pos.plus(vel);
      updateEntityPos(member, newPos);


      // crew member AI
      if (member.tasks[0]) taskFns[member.tasks[0].name](member);
    }
  }

  function changeEntityHealth(entity, delta) {
    entity.health += delta;
    if (entity.health <= 0) {
      die(entity);
    } else if (entity.health > 1) {
      entity.health = 1;
    }
  }

  function spawnMutant() {
    var start = grid.size.times(v(Math.random(), Math.random())).floor();
    var it = start.clone();
    // iterate until we find a spawnable cell or end up back at start
    while(true) {
      var cell = grid.cell(it);
      if (cell.terrain.spawnable && ! cell.plant && ! cell.entity) {
        spawnMutantAt(cell);
        return;
      }
      it.x += 1;
      if (it.x >= grid.size.x) {
        it.x = 0;
        it.y += 1;
        if (it.y >= grid.size.y) {
          it.y = 0;
        }
      }
      // all dangerous land eradicated
      if (it.equals(start)) return;
    }
  }

  function spawnMutantAt(cell) {
    var graphic = Math.floor(Math.random() * 2) ? 'manmutant' : 'ladymutant';
    var mutant = {
      id: nextId(),
      entities: mutants,
      maxSpeed: mutantMaxSpeed,
      graphic: graphic,
      name: 'Mutant',
      health: 1,
      pos: cell.pos.offset(0.5, 0.5),
      inputs: {
        direction: v(1, 0),
        speed: 0,
      },
      sprite: new Chem.Sprite(graphic, { batch: batch, }),
      tasks: [],
    };
    cell.entity = mutant;
    mutants[mutant.id] = mutant;
  }

  function plantFinishGrowing(plant) {
    // make the area around the plant oxygenated
    for (var y = -1; y <= 1; ++y) {
      for (var x = -1; x <= 1; ++x) {
        computeOxygenation(plant.cell.pos.offset(x, y));
      }
    }
    updateMiniMap();
  }

  function plantDestroyed(plant) {
    for (var y = -1; y <= 1; ++y) {
      for (var x = -1; x <= 1; ++x) {
        computeOxygenation(plant.cell.pos.offset(x, y));
      }
    }
    seedCount += 2;
    updateMiniMap();
  }

  function computeOxygenation(pt) {
    var cell = grid.cell(pt);
    var neighborPlantCount = getNeighborCount(pt, function(cell) { return cell.plant });
    if (cell.terrain === Grid.terrains.danger && neighborPlantCount > 0) {
      oxygenateCell(cell);
    } else if (cell.terrain === Grid.terrains.oxygenated && neighborPlantCount === 0) {
      deoxygenateCell(cell);
    }
  }

  function oxygenateCell(cell) {
    cell.terrain = Grid.terrains.oxygenated;
  }

  function deoxygenateCell(cell) {
    cell.terrain = Grid.terrains.danger;
  }

  function getNeighborCount(pt, matchFn) {
    var count = 0;
    for (var y = -1; y <= 1; ++y) {
      for (var x = -1; x <= 1; ++x) {
        var thisPt = pt.offset(x, y);
        var thisCell = grid.cell(thisPt);
        if (matchFn(thisCell)) count += 1;
      }
    }
    return count;
  }

  function updateEntityPos(entity, newPos) {
    var newPosFloored = newPos.floored();
    var oldPos = entity.pos.floored();
    var cell = grid.cell(oldPos);
    if (! newPosFloored.equals(oldPos)) {
      var newCell = grid.cell(newPosFloored);
      if (newCell.entity == null && newCell.terrain.walkable && !newCell.plant) {
        cell.entity = null;
        entity.pos = newPos;
        newCell.entity = entity;
      }
    } else {
      entity.pos = newPos;
    }
  }

  function performAttackTask(entity) {
    var task = entity.tasks[0];
    if (task.target.deleted) {
      // task complete
      stopCurrentTask(entity);
      return;
    }
    entity.inputs.attack = task.target;
    if (task.state === 'off') {
      if (entity.pos.distanceTo(task.target.pos) < entityAttackRadius) {
        task.state = 'attack';
        entity.inputs.direction = task.target.pos.minus(entity.pos).normalize();
        entity.inputs.speed = entity.maxSpeed;
      } else {
        task.path = computePath(entity.pos, task.target.pos, entityAttackRadius);
        task.state = 'path';
      }
    }
    if (task.state === 'path') {
      followPath(entity);
    }
  }

  function performPlantTask(member) {
    var task = member.tasks[0];
    if (task.state === 'off' || task.state === 'plant') {
      if (grid.cell(task.pos).plant) {
        // nothing to do
        stopCurrentTask(member);
        return;
      }
    }
    if (task.state === 'off') {
      if (member.pos.distanceTo(task.pos) < crewChopRadius) {
        task.state = 'plant';
        member.inputs.plant = {
          pos: task.pos,
          type: task.plantType,
        };
      } else {
        task.path = computePath(member.pos, task.pos, 1);
        task.state = 'path';
      }
    }
    if (task.state === 'path') {
      followPath(member);
    }
  }

  function performChopTask(member) {
    var task = member.tasks[0];
    if (task.state === 'off') {
      if (member.pos.distanceTo(task.pos) < crewChopRadius) {
        task.state = 'chop';
        member.inputs.chop = task.pos;
      } else {
        task.path = computePath(member.pos, task.pos, 1);
        task.state = 'path';
      }
    }
    if (task.state === 'chop') {
      var chopCell = grid.cell(task.pos);
      if (!chopCell.plant) {
        // mission accomplished
        stopCurrentTask(member);
      }
    } else if (task.state === 'path') {
      followPath(member);
    }
  }

  function followPath(entity) {
    var task = entity.tasks[0];
    var nextNode = task.path[0].offset(0.5, 0.5);
    if (nextNode.distanceTo(entity.pos) < crewMaxSpeed) {
      task.path.shift();
      if (task.path.length === 0) {
        // done following path
        updateEntityPos(entity, nextNode);
        task.state = 'off';
        entity.inputs.speed = 0;
      }
    } else {
      entity.inputs.direction = nextNode.minus(entity.pos).normalize();
      entity.inputs.speed = entity.maxSpeed;
    }
  }

  function performWalkTask(member) {
    var task = member.tasks[0];
    if (task.state === 'off') {
      if (member.pos.floored().equals(task.pos.floored())) {
        // mission accomplished
        stopCurrentTask(member);
        return;
      } else {
        task.path = computePath(member.pos, task.pos);
        task.state = 'path';
      }
    }
    if (task.state === 'path') {
      followPath(member);
    }
  }

  function onDraw(context) {
    context.fillStyle = '#000000'
    context.fillRect(0, 0, engine.size.x, engine.size.y);
    var start = fromScreen(v(0, 0)).floor();
    var end = fromScreen(engine.size).ceil();
    if (start.x < 0) start.x = 0;
    if (start.y < 0) start.y = 0;
    if (end.x >= grid.size.x) end.x = grid.size.x - 1;
    if (end.y >= grid.size.y) end.y = grid.size.y - 1;
    var it = v();
    var size = sizeToScreen(v(1, 1));
    for (it.y = start.y; it.y < end.y; it.y += 1) {
      var row = grid.cells[it.y];
      for (it.x = start.x; it.x < end.x; it.x += 1) {
        if (! row[it.x].explored) continue;
        var pos = toScreen(it);
        var cell = row[it.x];
        if (cell.terrain.texture) {
          context.drawImage(cell.terrain.texture, pos.x, pos.y);
        } else {
          context.fillStyle = cell.terrain.color;
          context.fillRect(pos.x, pos.y, size.x, size.y);
        }
        if (cell.plant) {
          var plantImg = plantTypes[cell.plant.type].image;
          if (cell.plant.chopCount) {
            context.drawImage(plantImg, 0, 0,
                plantImg.width, plantImg.height * cell.plant.chopCount, pos.x, pos.y,
                plantImg.width, plantImg.height * cell.plant.chopCount);
          } else if (cell.plant.growing) {
            var index = Math.floor((1 - cell.plant.growing) * growingAnimation.frames.length);
            var frame = growingAnimation.frames[index];
            context.drawImage(Chem.spritesheet, frame.pos.x, frame.pos.y, frame.size.x, frame.size.y,
                pos.x, pos.y, frame.size.x, frame.size.y);
          } else {
            context.drawImage(plantImg, pos.x, pos.y);
          }
        }
      }
    }
    // draw all sprites in batch
    var id, member, screenPos;
    for (id in crew) {
      member = crew[id]
      member.sprite.pos = toScreen(member.pos);
    }
    for (id in mutants) {
      var mutant = mutants[id];
      mutant.sprite.pos = toScreen(mutant.pos);
      mutant.sprite.alpha = visibilityAt(mutant.pos);
    }
    engine.draw(batch);

    // draw names and health
    context.save();
    context.textAlign = 'center';
    var healthBarSize = v(32, 4);
    function drawEntityHealth(entity) {
      context.globalAlpha = 0.8 * entity.sprite.alpha;
      var start = entity.sprite.pos.minus(healthBarSize.scaled(0.5)).floor();
      context.fillStyle = '#000000';
      context.fillRect(start.x - 1, start.y - entity.sprite.size.y - 1, healthBarSize.x + 2, healthBarSize.y + 2);
      context.fillStyle = '#009413';
      context.fillRect(start.x, start.y - entity.sprite.size.y, healthBarSize.x * entity.health, healthBarSize.y);
    }
    function drawEntities(entities) {
      for (var id in entities) {
        var entity = entities[id];
        if (entity.selected) {
          context.fillStyle = '#ffffff';
          context.fillText(entity.name,
              entity.sprite.pos.x, entity.sprite.pos.y - entity.sprite.size.y - 5);
        }
        if (entity.selected || entity.health !== 1) {
          drawEntityHealth(entity);
        }
      }
    }
    drawEntities(crew);
    drawEntities(mutants);
    context.restore();

    // highlight the square you're mouse overing
    if (anyCrewSelected) {
      var mouseCellPos = fromScreen(engine.mouse_pos).floor();
      if (inGrid(mouseCellPos)) {
        var mouseCell = grid.cell(mouseCellPos);
        var screenMouseCellPos = toScreen(mouseCellPos);
        var img = crewOptions[selectedCrewOption].image;
        if (selectedCrewOption === 0) {
          if (mouseCell.plant) img = axeImage;
        }
        context.drawImage(img, screenMouseCellPos.x, screenMouseCellPos.y);
      }
    }

    // resource counts
    // seed
    context.drawImage(seedResourceImage, 10, 10);
    context.fillStyle = "#000000";
    context.font = "normal 16px Arial";
    context.fillText("" + seedCount, 48, 32);
    // food
    context.drawImage(foodResourceImage, 90, 10);
    context.fillStyle = "#000000";
    context.font = "normal 16px Arial";
    context.fillText("" + foodCount, 128, 32);

    // control box
    if (anyCrewSelected) {
      // background
      context.fillStyle = "#AAAAAA";
      context.fillRect(controlBoxPos.x, controlBoxPos.y, controlBoxSize.x, controlBoxSize.y);
      crewOptions.forEach(function(crewOption, index) {
        var size = v(20, 20);
        var pos = controlBoxPos.offset(10 + index * (10 + size.x), 10);
        if (selectedCrewOption === index) {
          // highlight this one
          context.fillStyle = "#FFFB79";
          context.fillRect(pos.x, pos.y, size.x, size.y);
        }
        context.drawImage(crewOption.image, pos.x, pos.y);
        context.fillStyle = "#000000";
        context.textAlign = 'center';
        context.fillText(crewOption.keyText, pos.x + size.x / 2, pos.y + size.y + 12);
      });
    }

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
    var it = v();
    for (it.y = 0; it.y < grid.size.y; it.y += 1) {
      for (it.x = 0; it.x < grid.size.x; it.x += 1) {
        grid.cell(it).explored = true;
      }
    }
    isEverythingExplored = true;
    updateMiniMap();
  }
  function inside(pos, start, size) {
    var end = start.plus(size);
    return pos.x >= start.x && pos.x < end.x &&
      pos.y >= start.y && pos.y < end.y;
  }
  function inGrid(vec) {
    return vec.x >= 0 && vec.y >= 0 && vec.x < grid.size.x && vec.y < grid.size.y;
  }

  function onMapRightClick() {
    var shift = engine.buttonState(Chem.Button.Key_Shift);
    var pos = fromScreen(engine.mouse_pos);
    var command = crewOptions[selectedCrewOption];
    for (var id in crew) {
      var member = crew[id];
      if (member.selected) command.fn(member, pos, shift);
    }
  }

  function commandToWalk(member, pos, queue) {
    var posFloored = pos.floored();
    pos = posFloored.offset(0.5, 0.5);
    var cell = grid.cell(posFloored);
    if (cell.plant) {
      assignTask(member, queue, {
        name: 'chop',
        pos: posFloored,
        state: 'off',
      });
    } else if (cell.terrain.walkable) {
      assignTask(member, queue, {
        name: 'walk',
        pos: pos.clone(),
        state: 'off',
      });
    }
  }

  function commandToPlantShrub(member, pos, queue) {
    var posFloored = pos.floored();
    var cell = grid.cell(posFloored);
    if (cell.terrain.plantable) {
      assignTask(member, queue, {
        name: 'plant',
        pos: posFloored,
        state: 'off',
        plantType: 'shrub',
      });
    }
  }

  function stopCurrentTask(entity) {
    entity.inputs.chop = null;
    entity.inputs.plant = null;
    entity.inputs.attack = null;
    entity.inputs.speed = 0;
    entity.tasks.shift();
  }

  function assignTask(member, queue, task) {
    if (queue) {
      member.tasks.push(task);
    } else {
      stopCurrentTask(member);
      member.tasks = [task];
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
    grid.cell(pos).explored = true;
    updateMiniMap();
  }

  function distanceToNearestEntity(pos, entities) {
    var min_distance = Infinity;
    for (var id in entities) {
      var entity = entities[id];
      var distance = entity.pos.distanceTo(pos);
      if (distance < min_distance)
        min_distance = distance;
    }
    return min_distance;
  }

  function visibilityAt(pos) {
    if (isEverythingExplored) return 1;
    var distance = distanceToNearestEntity(pos, crew);
    var fullVisibilityDistance = crewLosRadius;
    if (distance < fullVisibilityDistance) return 1;
    var zeroVisibilityDistance = crewLosRadius * 4;
    if (distance > zeroVisibilityDistance) return 0;
    var visibility = 1 - (distance - fullVisibilityDistance) / (zeroVisibilityDistance - fullVisibilityDistance);
    // make it darker than a linear gradient
    visibility *= visibility;
    visibility *= visibility;
    return visibility;
  }

  function updateMiniMap() {
    clearTimeout(updateMiniMapTimer);
    updateMiniMapTimer = setTimeout(generateMiniMap, 0);
  }

  function die(entity) {
    entity.deleted = true; // for lingering references
    entity.sprite.setAnimationName(entity.graphic.replace('mutant', '') + 'die');
    entity.sprite.setFrameIndex(0);
    entity.sprite.on('animation_end', function() {
      entity.sprite.delete();
    });
    delete entity.entities[entity.id];
    var cell = grid.cell(entity.pos.floored());
    cell.entity = null;
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
    var id = nextId();
    crew[id] = {
      id: id,
      entities: crew,
      maxSpeed: crewMaxSpeed,
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
      }),
      tasks: [],
    };
    grid.cell(pos).entity = crew[id];
  }


  function computePath(start, dest, endRadius) {
    start = start.floored();
    dest = dest.floored();
    var isEnd = endRadius == null ? exactIsEnd : isEndFromRadius;
    // compute path
    var results = aStar({
      start: start,
      isEnd: isEnd,
      neighbor: createNeighborFn(),
      distance: pointDistance,
      heuristic: heuristic,
      timeout: 50,
    });
    if (results.path.length === 1) {
      // compute unsafe path
      results = aStar({
        start: start,
        isEnd: isEnd,
        neighbor: createNeighborFn({unsafe: true}),
        distance: pointDistance,
        heuristic: unsafeHeuristic,
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
      };
    }
    function unsafeHeuristic(node) {
      var terrainAtNode = grid.cell(node).terrain;
      var unsafePenalty = terrainAtNode.damage * -200;
      return node.distanceTo(dest) + unsafePenalty;
    }
    function heuristic(node) {
      return node.distanceTo(dest);
    }
    function exactIsEnd(node) {
      return node.equals(dest);
    }
    function isEndFromRadius(node) {
      return node.distanceTo(dest) <= endRadius;
    }
  }

  function createSafeStartArea() {
    // make a safe area to start out on
    var startSize = v(4, 4);
    var startPos = grid.size.scaled(0.5).floor();
    var it = v();
    for (it.y = startPos.y - startSize.y; it.y < startPos.y + startSize.y; it.y += 1) {
      for (it.x = startPos.x - startSize.x; it.x < startPos.x + startSize.x; it.x += 1) {
        var cell = grid.cell(it);
        cell.terrain = Grid.terrains.safe;
        cell.plant = null;
      }
    }
    for (it.y = startPos.y - 1; it.y < startPos.y + 1; it.y += 1) {
      for (it.x = startPos.x - 1; it.x < startPos.x + 1; it.x += 1) {
        grid.cell(it).setNewPlant('shrub');
      }
    }
    createCrewMember("Dean", "man", startPos.offset(-2, 0));
    createCrewMember("Hank", "man", startPos.offset(2, 0));
    createCrewMember("Gaby", "lady", startPos.offset(0, -2));
    createCrewMember("Andy", "man", startPos.offset(0, 2));
  }


  function generateMiniMap() {
    var buffer = document.createElement('canvas');
    buffer.width = grid.size.x + 4;
    buffer.height = grid.size.y + 4;
    var context = buffer.getContext('2d');
    // border
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, buffer.width, buffer.height);
    // start with black
    context.fillStyle = '#000000';
    context.fillRect(2, 2, grid.size.x, grid.size.y);
    var it = v();
    for (it.y = 0; it.y < grid.size.y; it.y += 1) {
      for (it.x = 0; it.x < grid.size.x; it.x += 1) {
        var cell = grid.cell(it);
        if (! cell.explored) continue;
        context.fillStyle = cell.plant ? '#002702' : cell.terrain.color;
        context.fillRect(1 + it.x, 1 + it.y, 1, 1);
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

  function createNeighborFn(options) {
    options = options || {};
    var start = options.start;
    var maxDistance = options.maxDistance;
    var unsafe = !!options.unsafe;
    var extraWalkableCells = options.extraWalkableCells;
    return function (node) {
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
        if (pt.x >= grid.size.x || pt.x < 0 ||
            pt.y >= grid.size.y || pt.y < 0)
        {
          return false;
        }
        if (maxDistance != null && pt.distanceTo(start) > maxDistance) {
          return false;
        }
        var cell = grid.cell(pt);
        var terrain = cell.terrain;
        if ((!extraWalkableCells || !extraWalkableCells(cell)) && (cell.entity || cell.plant || !terrain.walkable ||
            (unsafe && (terrain === Grid.terrains.fatal)) || (!unsafe && !terrain.safe)))
        {
          return false;
        }
        cells.push(pt);
        return true;
      }
    };
  }
  function pointDistance(a, b) {
    return a.distanceTo(b);
  }
  function nextId() {
    return "" + lastId++;
  }
  function pickNRandomProps(obj, n) {
    var results = [];
    if (n === 0) return results;
    var count = 0
    for (var prop in obj) {
      count += 1;
      for (var i = 0; i < n; ++i) {
        if (Math.random() < 1 / count) results[i] = prop;
      }
    }
    return results;
  }
});

