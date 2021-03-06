var chem = require('chem');
chem.onReady(function () {
  var aStar = require('a-star')
    , Grid = require('./grid')
    , v = chem.vec2d
    , canvas = document.getElementById("game")
    , engine = new chem.Engine(canvas)
    , batch = new chem.Batch()

  engine.setSize(v(1067, 600));

  var isEverythingExplored = false;
  var lastId = 0;
  var cellSize = v(6, 6);
  var crew = {};
  var crewLosRadius = 4;
  var entityActionRadius = 1;
  var entityAttackRadius = 1;
  var crewMaxSpeed = 0.1;
  var mutantMaxSpeed = 0.05;
  var walkImage = chem.resources.getImage('walkicon');
  var saplingImage = chem.resources.getImage('sapling');
  var shrubImage = chem.resources.getImage('shrub');
  var axeImage = chem.resources.getImage('axe');
  var swordImage = chem.resources.getImage('sword');
  var appleImage = chem.resources.getImage('apple');
  var turretImage = chem.resources.getImage('turret');
  var growingAnimation = chem.resources.animations.growing;
  var plantTypes = {
    shrub: {
      image: shrubImage,
    },
  };
  var crewOptions = [
    {
      getTask: getWalkTask,
      key: chem.button.Key1,
      keyText: "1",
      help: "Walk to the destination.",
      image: walkImage,
    },
    {
      getTask: getPlantShrubTask,
      key: chem.button.Key2,
      keyText: "2",
      help: "Plant a shrub.",
      image: shrubImage,
    },
    {
      getTask: getBuildTurrentTask,
      key: chem.button.Key3,
      keyText: "3",
      help: "Build a turret.",
      image: turretImage,
    },
  ];
  var taskFns = {
    walk: performWalkTask,
    chop: performChopTask,
    plant: performPlantTask,
    build: performBuildTask,
    attack: performAttackTask,
  };
  var buildingOnUpdateFns = {
    turret: turretOnUpdate,
  };
  var buildingResources = {
    turret: {
      seed: 10,
      food: 4,
    },
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
  var resources = {
    seed: 0,
    food: 0,
  };
  var seedResourceImage = chem.resources.getImage('saplingbutton');
  var foodResourceImage = chem.resources.getImage('foodbutton');
  var anyCrewSelected = false;
  var selectedCrewOption = 0;
  var growingPlants = {};
  var partiallyChoppedPlants = {};
  var buildings = {};
  var bullets = {};
  var mutants = {};
  var mutantSpawnInterval = 1000;
  var nextMutantSpawn = 0;

  var fpsLabel = engine.createFpsLabel();
  fpsLabel.fillStyle = "#ffffff";

  createSafeStartArea();
  generateMiniMap();

  engine.on('buttondown', onButtonDown);
  engine.on('update', onUpdate);
  engine.on('draw', onDraw);

  engine.start();
  canvas.focus();

  function onButtonDown(button) {
    if (button === chem.button.MouseLeft) {
      if (inside(engine.mousePos, miniMapPos, grid.size)) return;
      onMapLeftClick();
    } else if (button === chem.button.MouseRight) {
      if (inside(engine.mousePos, miniMapPos, grid.size)) return;
      onMapRightClick();
    } else if (engine.buttonState(chem.button.MouseLeft)) {
      // cheatz!!
      if (button === chem.button.KeyE) {
        setEverythingExplored();
      } else if (button === chem.button.KeyS) {
        spawnMutantAt(grid.cell(fromScreen(engine.mousePos).floored()));
      } else if (button === chem.button.KeyZ) {
        resources.food += 100;
        resources.seed += 100;
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
    if (engine.buttonState(chem.button.KeyLeft) || engine.buttonState(chem.button.KeyA)) {
      scroll.x -= 10 * dx;
    }
    if (engine.buttonState(chem.button.KeyRight) || engine.buttonState(chem.button.KeyD)) {
      scroll.x += 10 * dx;
    }
    if (engine.buttonState(chem.button.KeyUp) || engine.buttonState(chem.button.KeyW)) {
      scroll.y -= 10 * dx;
    }
    if (engine.buttonState(chem.button.KeyDown) || engine.buttonState(chem.button.KeyS)) {
      scroll.y += 10 * dx;
    }
    if (engine.buttonState(chem.button.MouseLeft) && inside(engine.mousePos, miniMapPos, grid.size)) {
      scroll = engine.mousePos.minus(miniMapPos).minus(miniMapBoxSize.scaled(0.5)).times(cellSize).times(zoom);
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
    for (id in buildings) {
      var building = buildings[id];
      buildingOnUpdateFns[building.type](building, dx);
    }
    for (id in bullets) {
      var bullet = bullets[id];
      var oldCell = grid.cell(bullet.pos.floored());
      var newPos = bullet.pos.plus(bullet.vel.scaled(dx));
      var newCell = grid.cell(newPos.floored());
      if (oldCell !== newCell) {
        if (bulletHitCell(newCell, bullet)) {
          delete bullets[bullet.id];
          continue;
        }
      }
      if (newPos.distance(bullet.start) > bullet.range) {
        delete bullets[bullet.id];
        continue;
      }
      bullet.pos = newPos;
    }

    nextMutantSpawn -= dx;
    if (nextMutantSpawn <= 0) {
      nextMutantSpawn = mutantSpawnInterval;
      spawnMutant();
    }

    computeAnyCrewSelected();

    for (id in mutants) {
      onEntityUpdate(mutants[id]);
    }

    for (id in crew) {
      onEntityUpdate(crew[id]);
    }

    function onEntityUpdate(entity) {
      // physics
      var vel = entity.inputs.direction.scaled(entity.inputs.speed * dx);
      var newPos = entity.pos.plus(vel);
      updateEntityPos(entity, newPos);

      // health updates
      var loc = entity.pos.floored();
      var cell = grid.cell(loc);
      var terrain = cell.terrain;
      var damage = entity.human ? terrain.damage : terrain.mutantDamage;
      changeEntityHealth(entity, damage * dx);
      if (entity.deleted) return;

      if (entity.human) {
        // explore areas around crew members
        for (var y = -crewLosRadius; y < crewLosRadius; ++y) {
          for (var x = -crewLosRadius; x < crewLosRadius; ++x) {
            var targetPos = loc.offset(x, y);
            if (! inGrid(targetPos)) continue;
            if (targetPos.distance(entity.pos) <= crewLosRadius) {
              if (!grid.cell(targetPos).explored) {
                explore(entity, targetPos);
              }
            }
          }
        }
      }

      // inputs
      if (entity.inputs.attack) {
        onAttack(entity.inputs.attack);
      } else if (entity.inputs.chop) {
        onChop(entity.inputs.chop);
      } else if (entity.inputs.plant) {
        onPlant(entity.inputs.plant);
      } else if (entity.inputs.build) {
        onBuild(entity.inputs.build);
      }

      // AI
      if (entity.tasks[0]) {
        taskFns[entity.tasks[0].name](entity);
      } else if (!entity.human) {
        // pick a random crew member to harass
        var randomCrewId = pickNRandomProps(crew, 1)[0];
        if (randomCrewId) {
          assignTask(entity, false, {
            name: 'attack',
            state: 'off',
            target: crew[randomCrewId],
          });
        }
      }

      function onAttack(attackTarget) {
        if (attackTarget.pos.floored().distance(entity.pos.floored()) <= entityAttackRadius) {
          onEntityAttacked(attackTarget, entity);
          changeEntityHealth(attackTarget, -entity.attackAmt * dx);
        }
      }
      function onChop(chopPos) {
        if (chopPos.floored().distance(entity.pos.floored()) <= entityActionRadius) {
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
      }
      function onPlant(plantInput) {
        if (plantInput.pos.floored().distance(entity.pos.floored()) <= entityActionRadius) {
          var plantCell = grid.cell(plantInput.pos);
          if (plantCell.terrain.plantable && resources.seed > 0 && plantCell.empty()) {
            plantCell.setGrowingPlant(plantInput.type);
            growingPlants[plantCell.plant.id] = plantCell.plant;
            resources.seed -= 1;
          }
        }
      }
      function onBuild(buildInput) {
        if (buildInput.pos.floored().distance(entity.pos.floored()) > entityActionRadius) return;
        var buildCell = grid.cell(buildInput.pos);
        if (! buildCell.terrain.buildable) return;
        if (! buildCell.empty()) return;
        var resourcesDelta = buildingResources[buildInput.type];
        if (! canAfford(resourcesDelta)) return;
        useResources(resourcesDelta);
        buildCell.building = {
          id: nextId(),
          health: 1,
          type: buildInput.type,
          sprite: new chem.Sprite('turret', {batch: batch}),
          direction: v(1, 0),
          cooldown: 1,
          cooldownAmt: 0.05,
          target: null,
          losRadius: 4,
          cell: buildCell,
        };
        buildings[buildCell.building.id] = buildCell.building;
      }
    }
  }

  function bulletHitCell(cell, bullet) {
    if (cell.entity) {
      changeEntityHealth(cell.entity, bullet.damage);
      return true;
    } else {
      return false;
    }
  }

  function useResources(resourceDelta) {
    for (var name in resourceDelta) {
      resources[name] -= resourceDelta[name];
    }
  }

  function canAfford(resourceDelta) {
    for (var name in resourceDelta) {
      if (resources[name] - resourceDelta[name] < 0) {
        return false;
      }
    }
    return true;
  }

  function computeAnyCrewSelected() {
    anyCrewSelected = false;
    for (var id in crew) {
      anyCrewSelected = anyCrewSelected || crew[id].selected;
    }
  }

  function onEntityAttacked(entity, attacker) {
    // possibly defend
    var task = entity.tasks[0];
    var defendTask = {
      name: 'attack',
      target: attacker,
      state: 'off',
    };
    if (task) {
      if (task.name !== 'attack') {
        // pause current task
        stopCurrentTask(entity);
        task.state = 'off';
        entity.tasks.unshift(task);
        entity.tasks.unshift(defendTask);
      }
    } else {
      assignTask(entity, false, defendTask);
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
      if (cell.terrain.spawnable && cell.empty()) {
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
      attackAmt: 0.0025,
      graphic: graphic,
      name: 'Mutant',
      health: 1,
      pos: cell.pos.offset(0.5, 0.5),
      inputs: {
        direction: v(1, 0),
        speed: 0,
      },
      sprite: new chem.Sprite(graphic, { batch: batch, }),
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
    resources.seed += 2;
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
      if (newCell.empty()) {
        cell.entity = null;
        entity.pos = newPos;
        newCell.entity = entity;
        if (entity.human && newCell.food) {
          resources.food += newCell.food;
          newCell.food = 0;
        }
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
    } else if (getWithinRange(entity, task.target.pos, entityAttackRadius)) {
      entity.inputs.attack = task.target;
      task.state = 'attack';
    }
  }

  function performPlantTask(member) {
    var task = member.tasks[0];
    if (grid.cell(task.pos).plant) {
      // nothing to do
      stopCurrentTask(member);
    } else if (getWithinRange(member, task.pos, entityActionRadius)) {
      task.state = 'plant';
      member.inputs.plant = {
        pos: task.pos,
        type: task.plantType,
      };
    }
  }

  function getWithinRange(entity, dest, radius) {
    var task = entity.tasks[0];
    var dist = entity.pos.floored().distance(dest.floored());
    if (dist === 0 && task.state !== 'path') {
      // find a safe neighbor to go to - we're in our own way.
      var neighbor = closestSafeNeighbor(entity);
      if (neighbor) {
        task.path = [neighbor];
        task.state = 'path';
      } else {
        task.state = 'off';
      }
    } else if (dist <= radius && dist !== 0) {
      entity.inputs.speed = 0;
      return true;
    } else if (task.state === 'path') {
      followPath(entity);
    } else {
      task.path = computePath(entity.pos, dest, {
        endRadius: radius,
        human: entity.human,
      });
      task.state = 'path';
    }
    return false;
  }

  function performBuildTask(entity) {
    var task = entity.tasks[0];
    if (grid.cell(task.pos).building) {
      stopCurrentTask(entity);
    } else if (getWithinRange(entity, task.pos, entityActionRadius)) {
      task.state = 'build';
      entity.inputs.build = {
        type: task.buildType,
        pos: task.pos,
      };
    }
  }

  function performChopTask(entity) {
    var task = entity.tasks[0];
    if (!grid.cell(task.pos).plant) {
      stopCurrentTask(entity);
      return;
    } else if (getWithinRange(entity, task.pos, entityActionRadius)) {
      task.state = 'chop';
      entity.inputs.chop = task.pos;
    }
  }

  function followPath(entity) {
    var task = entity.tasks[0];
    var nextNode = task.path[0].offset(0.5, 0.5);
    if (nextNode.distance(entity.pos) < crewMaxSpeed) {
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
        task.path = computePath(member.pos, task.pos, {
          human: member.human,
        });
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
    var pos;
    for (it.y = start.y; it.y < end.y; it.y += 1) {
      var row = grid.cells[it.y];
      for (it.x = start.x; it.x < end.x; it.x += 1) {
        if (! row[it.x].explored) continue;
        pos = toScreen(it);
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
            context.drawImage(chem.resources.spritesheet, frame.pos.x, frame.pos.y, frame.size.x, frame.size.y,
                pos.x, pos.y, frame.size.x, frame.size.y);
          } else {
            context.drawImage(plantImg, pos.x, pos.y);
          }
        } else if (cell.food) {
          context.drawImage(appleImage, pos.x, pos.y);
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
    for (id in buildings) {
      var building = buildings[id];
      building.sprite.pos = toScreen(building.cell.pos.offset(0.5, 0.5));
      building.sprite.rotation = building.direction.angle();
    }
    batch.draw(context);

    // draw names and health
    context.save();
    context.textAlign = 'center';
    var healthBarSize = v(32, 4);
    drawEntities(crew);
    drawEntities(mutants);
    context.restore();

    // bullets
    for (id in bullets) {
      var bullet = bullets[id];
      pos = toScreen(bullet.pos);
      context.fillStyle = '#000000';
      context.fillRect(pos.x, pos.y, 2, 2);
    }

    // highlight the square you're mouse overing
    var task;
    if (anyCrewSelected) {
      var mouseCellPos = fromScreen(engine.mousePos).floor();
      if (inGrid(mouseCellPos)) {
        var mouseCell = grid.cell(mouseCellPos);
        var screenMouseCellPos = toScreen(mouseCellPos);
        task = crewOptions[selectedCrewOption].getTask(mouseCellPos);
        if (task) {
          var img = task.image;
          context.save();
          context.globalAlpha = 0.7;
          context.drawImage(img, screenMouseCellPos.x, screenMouseCellPos.y);
          context.restore();
        }
      }
    }

    // draw all the active tasks
    context.save();
    context.globalAlpha = 0.6;
    for (id in crew) {
      member = crew[id];
      for (var i = 0; i < member.tasks.length; i++) {
        task = member.tasks[i];
        if (task.pos) {
          screenPos = toScreen(task.pos.floored());
          context.drawImage(task.image, screenPos.x, screenPos.y);
        }
      }
    }
    context.restore();

    // resource counts
    // seed
    context.drawImage(seedResourceImage, 10, 10);
    context.fillStyle = "#000000";
    context.font = "normal 16px Arial";
    context.fillText("" + resources.seed, 48, 32);
    // food
    context.drawImage(foodResourceImage, 90, 10);
    context.fillStyle = "#000000";
    context.font = "normal 16px Arial";
    context.fillText("" + resources.food, 128, 32);

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
    fpsLabel.draw(context);

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
    var shift = engine.buttonState(chem.button.KeyShift);
    var pos = fromScreen(engine.mousePos);
    var command = crewOptions[selectedCrewOption];
    for (var id in crew) {
      var member = crew[id];
      if (member.selected) {
        var task = command.getTask(pos);
        if (task) {
          assignTask(member, shift, task);
        }
      }
    }
  }

  function getWalkTask(pos) {
    var posFloored = pos.floored();
    pos = posFloored.offset(0.5, 0.5);
    var cell = grid.cell(posFloored);
    if (cell.plant) {
      return {
        name: 'chop',
        image: axeImage,
        pos: posFloored,
        state: 'off',
      };
    } else if (cell.entity && !cell.entity.human) {
      return {
        name: 'attack',
        image: swordImage,
        target: cell.entity,
        state: 'off',
      };
    } else if (cell.terrain.walkable) {
      return {
        name: 'walk',
        image: walkImage,
        pos: pos.clone(),
        state: 'off',
      };
    }
    return null;
  }

  function getPlantShrubTask(pos) {
    var posFloored = pos.floored();
    var cell = grid.cell(posFloored);
    if (cell.terrain.plantable) {
      return {
        name: 'plant',
        image: shrubImage,
        pos: posFloored,
        state: 'off',
        plantType: 'shrub',
      };
    }
    return null;
  }

  function getBuildTurrentTask(pos) {
    var posFloored = pos.floored();
    var cell = grid.cell(posFloored);
    if (cell.terrain.buildable) {
      return {
        name: 'build',
        image: turretImage,
        pos: posFloored,
        state: 'off',
        buildType: 'turret',
      };
    }
    return null;
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
    var pos = engine.mousePos;
    for (var id in crew) {
      var member = crew[id];
      var sprite = member.sprite;
      var selected = (
        pos.x >= sprite.pos.x - sprite.size.x / 2 &&
        pos.x <= sprite.pos.x + sprite.size.x / 2 &&
        pos.y >= sprite.pos.y - sprite.size.y &&
        pos.y <= sprite.pos.y);
      var shift = engine.buttonState(chem.button.KeyShift) || engine.buttonState(chem.button.KeyCtrl);
      member.selected = (shift ? member.selected : false) || selected;
    }
  }

  function explore(crewMember, pos) {
    grid.cell(pos).explored = true;
    updateMiniMap();
  }

  function distanceToNearestEntity(pos, entities) {
    var minDistance = Infinity;
    for (var id in entities) {
      var entity = entities[id];
      var distance = entity.pos.distance(pos);
      if (distance < minDistance)
        minDistance = distance;
    }
    return minDistance;
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
    entity.sprite.on('animationend', function() {
      entity.sprite.delete();
    });
    delete entity.entities[entity.id];
    var cell = grid.cell(entity.pos.floored());
    cell.entity = null;
    // random food drop
    cell.food = Math.floor(Math.random() * 2);
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
      attackAmt: 0.005,
      graphic: graphic,
      name: name,
      health: 1,
      human: true,
      pos: pos.offset(0.5, 0.5),
      inputs: {
        direction: v(1, 0),
        speed: 0,
      },
      sprite: new chem.Sprite(graphic, {
        batch: batch,
      }),
      tasks: [],
    };
    grid.cell(pos).entity = crew[id];
  }


  function computePath(start, dest, options) {
    start = start.floored();
    dest = dest.floored();
    var endRadius = options.endRadius;
    var human = options.human;
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
      // as a last ditch effort, make a beeline for dest
      return [dest];
    } else {
      return results.path.slice(1);
    }
    function heuristic(node) {
      var terrainAtNode = grid.cell(node).terrain;
      // using 0 instead of terrainAtNode.mutantDamage
      // for mutants because we don't want mutants to be so careful
      var damage = human ? terrainAtNode.damage : 0;
      var unsafePenalty = damage * -20000;
      return node.distance(dest) + unsafePenalty;
    }
    function exactIsEnd(node) {
      return node.equals(dest);
    }
    function isEndFromRadius(node) {
      return node.distance(dest) <= endRadius;
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

  function closestSafeNeighbor(entity) {
    var pt = entity.pos.floored();
    var neighbors = createNeighborFn({})(pt);
    var best = null;
    var bestDist = null;
    neighbors.forEach(function(neighbor) {
      var cell = grid.cell(neighbor);
      var damage = entity.human ? cell.terrain.damage : cell.terrain.mutantDamage;
      if (damage < 0) return;
      var dist = neighbor.distance(entity.pos);
      if (best == null || dist < bestDist) {
        bestDist = dist;
        best = neighbor;
      }
    });
    return best;
  }

  function safeNeighbors(pt) {
  }

  function createNeighborFn(options) {
    options = options || {};
    var start = options.start;
    var maxDistance = options.maxDistance;
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
        if (maxDistance != null && pt.distance(start) > maxDistance) {
          return false;
        }
        var cell = grid.cell(pt);
        var terrain = cell.terrain;
        if ((!extraWalkableCells || !extraWalkableCells(cell)) && ! cell.empty())
        {
          return false;
        }
        cells.push(pt);
        return true;
      }
    };
  }
  function pointDistance(a, b) {
    return a.distance(b);
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
  function fireBullet(pos, vel, range) {
    var bullet = {
      id: nextId(),
      start: pos.clone(),
      pos: pos.clone(),
      vel: vel,
      range: range,
      damage: -0.12,
    };
    bullets[bullet.id] = bullet;
  }
  function turretOnUpdate(turret, dx) {
    var center = turret.cell.pos.offset(0.5, 0.5);
    if (turret.target && turret.target.deleted) turret.target = null;
    if (turret.target == null || targetOutOfRange()) {
      pickClosestTarget();
    }
    if (turret.target != null) {
      // aim at target
      turret.direction = turret.target.pos.minus(center).normalize();
      // if we can shoot, shoot
      if (turret.cooldown <= 0) {
        fireBullet(center, turret.direction.scaled(0.2), turret.losRadius);
        turret.cooldown = 1;
      }
    }
    turret.cooldown -= turret.cooldownAmt * dx;
    if (turret.cooldown <= 0) turret.cooldown = 0;

    function pickClosestTarget() {
      var start = turret.cell.pos.offset(-turret.losRadius, -turret.losRadius);
      var end = turret.cell.pos.offset(turret.losRadius, turret.losRadius);
      var it = v();
      var best = null;
      var bestDist = null;
      for (it.y = start.y; it.y <= end.y; it.y += 1) {
        for (it.x = start.x; it.x <= end.x; it.x += 1) {
          var cell = grid.cell(it);
          var entity = cell.entity;
          if (!entity || entity.human) continue;
          var dist = center.distance(entity.pos);
          if (bestDist == null || dist < bestDist) {
            bestDist = dist;
            best = entity;
          }
        }
      }
      turret.target = best;
    }
    function targetOutOfRange() {
      var dist = turret.target.pos.distance(center);
      return dist > turret.losRadius;
    }
  }
});

