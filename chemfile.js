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
    // ["center", "topleft", "topright", "bottomleft", "bottomright"]
    anchor: "center"
  },
  animations: {
    lady: {},
    man: {},
  }
};
