// extra folders to look for source files
// you can use #depend statements to include any source files in these folders.
exports.libs = [];

// the main source file which depends on the rest of your source files.
exports.main = 'src/main';

var v = require("chem").Vec2d;
exports.spritesheet = {
  defaults: {
    delay: 0.05,
    loop: false,
    // possible values: a Vec2d instance, or one of:
    // ["center", "topleft", "topright", "bottomleft", "bottomright", "top", "right", "left", "bottom"]
    anchor: "center"
  },
  animations: {
    lady: {
      anchor: 'bottom',
      frames: 'lady00.png',
    },
    man: {
      anchor: 'bottom',
      frames: 'man00.png',
    },
    ladydie: {
      anchor: 'bottom',
      frames: 'lady',
    },
    mandie: {
      anchor: 'bottom',
      frames: 'man',
    },
    evilwater: {
      anchor: 'topleft',
    },
    water: {
      anchor: 'topleft',
    },
    dirt: {
      anchor: 'topleft',
    },
    danger: {
      anchor: 'topleft',
    },
    tree: {
      anchor: 'topleft',
    },
  }
};
